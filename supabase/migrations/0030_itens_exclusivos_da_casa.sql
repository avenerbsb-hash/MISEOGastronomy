-- =====================================================================
-- 0030 — Fichas, preparos e insumos exclusivos de uma casa
-- • receitas.estabelecimento_id e insumos.estabelecimento_id: vazio = compartilhado
--   (como sempre foi); preenchido = só aquela casa vê e usa.
-- • Quem não tem acesso à casa dona não enxerga o item (regra no banco).
-- • Listas, alertas e impactos de uma casa só consideram itens compartilhados
--   ou daquela casa.
-- • Nome de ficha/preparo continua único entre os compartilhados; uma casa pode
--   ter a sua ficha com o mesmo nome de uma compartilhada.
-- Nada existente muda de dono. Pode rodar de novo.
-- =====================================================================

alter table receitas add column if not exists estabelecimento_id uuid references estabelecimentos(id);
alter table insumos  add column if not exists estabelecimento_id uuid references estabelecimentos(id);
comment on column receitas.estabelecimento_id is 'Casa dona (vazio = ficha compartilhada entre as casas)';
comment on column insumos.estabelecimento_id  is 'Casa dona (vazio = insumo compartilhado entre as casas)';
create index if not exists receitas_por_casa on receitas (estabelecimento_id) where estabelecimento_id is not null;
create index if not exists insumos_por_casa  on insumos (estabelecimento_id)  where estabelecimento_id is not null;

alter table receitas drop constraint if exists receitas_tipo_nome_key;
create unique index if not exists receitas_nome_unico
  on receitas (tipo, nome, coalesce(estabelecimento_id, '00000000-0000-0000-0000-000000000000'));

-- item visível para a casa: compartilhado ou da própria casa
create or replace function calc.visivel(p_dono uuid, p_estab uuid) returns boolean
language sql immutable as $$ select p_dono is null or p_dono = p_estab $$;

drop policy if exists leitura on receitas;
create policy leitura on receitas for select
  using (usuario_ativo() and (estabelecimento_id is null or tem_acesso(estabelecimento_id)));
drop policy if exists leitura on insumos;
create policy leitura on insumos for select
  using (usuario_ativo() and (estabelecimento_id is null or tem_acesso(estabelecimento_id)));
drop policy if exists gestor_escreve on receitas;
create policy gestor_escreve on receitas for all
  using (eh_gestor_de_alguma() and (estabelecimento_id is null or pode_ver_custos(estabelecimento_id)))
  with check (eh_gestor_de_alguma() and (estabelecimento_id is null or pode_ver_custos(estabelecimento_id)));
drop policy if exists gestor_escreve on insumos;
create policy gestor_escreve on insumos for all
  using (eh_gestor_de_alguma() and (estabelecimento_id is null or pode_ver_custos(estabelecimento_id)))
  with check (eh_gestor_de_alguma() and (estabelecimento_id is null or pode_ver_custos(estabelecimento_id)));

-- ---------------------------------------------------------------------
-- Funções por casa: só itens visíveis para a casa
-- ---------------------------------------------------------------------
create or replace function public.variacao_fichas(p_estab uuid, p_tipo text default null)
returns table (receita_id uuid, nome text, custo_atual numeric, custo_anterior numeric,
               variacao_pct numeric, sinal text, data_referencia date)
language plpgsql stable security definer set search_path = public, calc as $$
begin
  perform calc.exigir_custos(p_estab);
  return query
  with base as (
    select x.id, x.nome, calc.versao_vigente(x.id) as versao
      from receitas x
     where x.ativo and (p_tipo is null or x.tipo::text = p_tipo) and calc.visivel(x.estabelecimento_id, p_estab)
  ), ref as (
    select b.id, b.nome, b.versao,
           -- última compra real (preço de referência da planilha não conta como compra)
           (select max(h.data_compra) from historico_precos h
             where h.estabelecimento_id = p_estab and h.status = 'validado' and h.valor_total > 0
               and h.fonte <> 'referencia' and h.data_compra <= current_date
               and h.insumo_id in (select insumo_id from calc.insumos_da_versao(b.versao))) as data_ref
      from base b
     where b.versao is not null
  ), custos as (
    select r.id, r.nome, r.data_ref,
           calc.custo_unitario_versao(r.versao, p_estab) as atual,
           case when r.data_ref is not null
                then calc.custo_unitario_versao_precos_em(r.versao, p_estab, (r.data_ref - 1)::timestamptz) end as anterior
      from ref r
  )
  select c.id, c.nome, round(c.atual, 6), round(c.anterior, 6),
         case when c.anterior > 0 then round(100 * (c.atual - c.anterior) / c.anterior, 1) end,
         -- abaixo de 0,05% conta como igual (evita "▲ 0,0%" por arredondamento)
         case when c.anterior is null or abs(c.atual - c.anterior) <= 0.0005 * c.anterior then 'neutro'
              when c.atual < c.anterior then 'verde' else 'vermelho' end,
         c.data_ref
    from custos c
   where c.atual is not null;
end $$;

create or replace function public.alertas_insumos(p_estab uuid, p_limite numeric default 10, p_dias int default 60)
returns table (insumo_id uuid, insumo text, unidade_base text, custo_atual numeric, custo_anterior numeric,
               variacao_pct numeric, data_referencia date, qtd_fichas int, qtd_subprodutos int, receitas jsonb)
language plpgsql stable security definer set search_path = public, calc as $$
begin
  perform calc.exigir_custos(p_estab);
  return query
  select v.insumo_id, v.insumo, v.unidade_base, v.custo_atual, v.custo_anterior, v.variacao_pct, v.data_referencia,
         count(*) filter (where r.tipo = 'final')::int,
         count(*) filter (where r.tipo = 'subproduto')::int,
         coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'nome', r.nome, 'tipo', r.tipo)
                            order by r.tipo desc, r.nome) filter (where r.id is not null), '[]'::jsonb)
    from public.variacoes_insumos(p_estab) v
    left join lateral (select x.id, x.nome, x.tipo
                         from calc.receitas_dependentes_de_insumo(v.insumo_id) d
                         join receitas x on x.id = d.receita_id
                        where x.ativo and calc.visivel(x.estabelecimento_id, p_estab)) r on true
   where v.variacao_pct > p_limite
     and v.data_referencia >= current_date - p_dias
   group by v.insumo_id, v.insumo, v.unidade_base, v.custo_atual, v.custo_anterior, v.variacao_pct, v.data_referencia
   order by v.variacao_pct desc, v.insumo;
end $$;

create or replace function public.impacto_insumo_fichas(p_insumo uuid, p_estab uuid)
returns table (receita_id uuid, receita text, tipo text, custo_atual numeric, custo_sem_mudanca numeric,
               impacto_pct numeric, sinal text)
language plpgsql stable security definer set search_path = public, calc as $$
declare
  v_atual numeric := calc.custo_insumo(p_insumo, p_estab);
  v_ant   numeric := calc.custo_insumo_anterior(p_insumo, p_estab);
begin
  perform calc.exigir_custos(p_estab);
  return query
  with x as (
    select r.id, r.nome, r.tipo::text as tipo, calc.versao_vigente(r.id) as versao
      from calc.receitas_dependentes_de_insumo(p_insumo) d join receitas r on r.id = d.receita_id
     where r.ativo and calc.visivel(r.estabelecimento_id, p_estab)
  ), c as (
    select x.*, calc.custo_unitario_versao(x.versao, p_estab) as atual,
           case when v_ant is not null then calc.custo_unitario_versao_troca(x.versao, p_estab, p_insumo, v_ant) end as sem
      from x
  )
  select c.id, c.nome, c.tipo, round(c.atual, 6), round(c.sem, 6),
         case when c.sem > 0 then round(100 * (c.atual - c.sem) / c.sem, 1) end,
         case when c.sem is null or c.atual is null or abs(c.atual - c.sem) <= 0.0005 * c.sem then 'neutro'
              when c.atual < c.sem then 'verde' else 'vermelho' end
    from c
   order by c.tipo desc, c.nome;
end $$;

create or replace function public.fichas_impactadas(p_insumo uuid, p_estab uuid)
returns table (receita_id uuid, receita text, tipo tipo_receita)
language plpgsql stable security definer set search_path = public, calc as $$
begin
  perform calc.exigir_custos(p_estab);
  return query
  select r.id, r.nome, r.tipo
    from calc.receitas_dependentes_de_insumo(p_insumo) d join receitas r on r.id = d.receita_id
   where calc.visivel(r.estabelecimento_id, p_estab)
   order by r.tipo desc, r.nome;
end $$;
