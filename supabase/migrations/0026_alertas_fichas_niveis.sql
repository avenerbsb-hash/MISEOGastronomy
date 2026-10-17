-- =====================================================================
-- 0026 — Alertas de fichas em 3 níveis, mais sensíveis para drinks e pratos
--
-- Compara cada ficha do cardápio HOJE com N dias atrás (padrão 30), pelo
-- acumulado — pega também a subida aos poucos, não só a última compra.
-- Receita atual; último preço validado de cada insumo em cada data.
--
-- Níveis (o maior dos dois critérios):
--   custo:  atenção ≥ A%   · alerta ≥ B%   · crítico ≥ C%
--   CMV:    atenção = subiu ≥ X p.p. · alerta = passou da meta da casa
--           crítico = passou da meta e ficou ≥ Y p.p. acima dela
-- Limites por grupo da ficha (categoria em Fichas finais):
--   drinks e comida (olhar mais atento): 2% / 4% / 8% · CMV 0,5 p.p. / 3 p.p.
--   bebidas (doses, garrafas, cafés) e outros: 5% / 10% / 15% · CMV 1 p.p. / 5 p.p.
-- O gestor da casa pode trocar os limites (Dados da casa).
-- Também lista os insumos da ficha que mais subiram no período.
-- Pode rodar de novo.
-- =====================================================================

create table if not exists limites_alerta_fichas (
  estabelecimento_id uuid not null references estabelecimentos(id),
  grupo              text not null check (grupo in ('drinks', 'comida', 'bebidas', 'outros')),
  atencao_pct        numeric not null,
  alerta_pct         numeric not null,
  critico_pct        numeric not null,
  cmv_atencao_pp     numeric not null check (cmv_atencao_pp > 0),
  cmv_critico_pp     numeric not null check (cmv_critico_pp > 0),
  atualizado_em      timestamptz not null default now(),
  atualizado_por     uuid default auth.uid(),
  primary key (estabelecimento_id, grupo),
  check (atencao_pct > 0 and atencao_pct <= alerta_pct and alerta_pct <= critico_pct)
);
alter table limites_alerta_fichas enable row level security;
drop policy if exists leitura on limites_alerta_fichas;
create policy leitura on limites_alerta_fichas for select using (pode_ver_custos(estabelecimento_id));
grant select on limites_alerta_fichas to authenticated;

-- Grupo da ficha pela categoria (mesma regra do filtro da lista de fichas)
create or replace function calc.grupo_ficha(p_receita uuid) returns text
language sql stable as $$
  select case
           when c.nome like 'Drinks%' then 'drinks'
           when c.nome in ('Entradas', 'Saladas', 'Petiscos e porções', 'Pratos principais', 'Massas', 'Risotos', 'Pizzas',
                           'Sanduíches e burgers', 'Sushi, sashimi e temaki', 'Pratos quentes orientais', 'Acompanhamentos',
                           'Sobremesas', 'Menu infantil') then 'comida'
           when c.nome in ('Doses e garrafas', 'Cafés e bebidas quentes') then 'bebidas'
           else 'outros' end
    from receitas r left join categorias c on c.id = r.categoria_id
   where r.id = p_receita
$$;

-- Limites da casa para todos os grupos (padrão quando a casa não definiu)
create or replace function public.limites_alerta_casa(p_estab uuid)
returns table (grupo text, atencao_pct numeric, alerta_pct numeric, critico_pct numeric,
               cmv_atencao_pp numeric, cmv_critico_pp numeric, padrao boolean)
language plpgsql stable security definer set search_path = public, calc as $$
#variable_conflict use_column
begin
  perform calc.exigir_custos(p_estab);
  return query
  select g.grupo,
         coalesce(l.atencao_pct, g.a), coalesce(l.alerta_pct, g.b), coalesce(l.critico_pct, g.c),
         coalesce(l.cmv_atencao_pp, g.x), coalesce(l.cmv_critico_pp, g.y), l.grupo is null
    from (values ('drinks', 1, 2::numeric, 4::numeric, 8::numeric, 0.5::numeric, 3::numeric),
                 ('comida', 2, 2, 4, 8, 0.5, 3),
                 ('bebidas', 3, 5, 10, 15, 1, 5),
                 ('outros', 4, 5, 10, 15, 1, 5)) g(grupo, ordem, a, b, c, x, y)
    left join limites_alerta_fichas l on l.estabelecimento_id = p_estab and l.grupo = g.grupo
   order by g.ordem;
end $$;
grant execute on function public.limites_alerta_casa(uuid) to authenticated;

-- Gestor/admin troca os limites de um grupo; valores nulos voltam ao padrão
create or replace function public.definir_limites_alerta(p_estab uuid, p_grupo text, p_atencao numeric, p_alerta numeric,
                                                         p_critico numeric, p_cmv_atencao numeric, p_cmv_critico numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(papel_em(p_estab), '') not in ('admin', 'gestor') then
    raise exception 'Só o gestor ou o administrador da casa muda os limites de alerta' using errcode = 'insufficient_privilege';
  end if;
  if p_atencao is null then
    delete from limites_alerta_fichas where estabelecimento_id = p_estab and grupo = p_grupo;
    return;
  end if;
  if not (p_atencao > 0 and p_atencao <= p_alerta and p_alerta <= p_critico) then
    raise exception 'Os limites precisam crescer: atenção ≤ alerta ≤ crítico (e maiores que zero)' using errcode = 'check_violation';
  end if;
  insert into limites_alerta_fichas (estabelecimento_id, grupo, atencao_pct, alerta_pct, critico_pct, cmv_atencao_pp, cmv_critico_pp)
  values (p_estab, p_grupo, p_atencao, p_alerta, p_critico, p_cmv_atencao, p_cmv_critico)
  on conflict (estabelecimento_id, grupo) do update
     set atencao_pct = excluded.atencao_pct, alerta_pct = excluded.alerta_pct, critico_pct = excluded.critico_pct,
         cmv_atencao_pp = excluded.cmv_atencao_pp, cmv_critico_pp = excluded.cmv_critico_pp,
         atualizado_em = now(), atualizado_por = auth.uid();
end $$;
grant execute on function public.definir_limites_alerta(uuid, text, numeric, numeric, numeric, numeric, numeric) to authenticated;

-- Fichas do cardápio em alerta (só as que atingiram algum nível)
create or replace function public.alertas_fichas_niveis(p_estab uuid, p_dias int default 30)
returns table (receita_id uuid, item_id uuid, produto text, grupo text,
               custo_antes numeric, custo_hoje numeric, variacao_pct numeric,
               preco numeric, cmv_antes numeric, cmv_hoje numeric, variacao_cmv_pp numeric, meta_pct numeric,
               cruzou_meta boolean, nivel_custo int, nivel_cmv int, nivel int, insumos text)
language plpgsql stable security definer set search_path = public, calc as $$
#variable_conflict use_column
declare
  v_dias int := least(greatest(coalesce(p_dias, 30), 7), 180);
  v_antes timestamptz;
  v_meta numeric;
begin
  perform calc.exigir_custos(p_estab);
  v_antes := (current_date - v_dias)::timestamptz;
  select coalesce(e.cmv_alvo_padrao, 30) into v_meta from estabelecimentos e where e.id = p_estab;
  return query
  with itens as (  -- uma linha por ficha (o primeiro item do cardápio com preço)
    select distinct on (it.receita_id) it.receita_id, it.id as item_id, coalesce(it.nome_exibicao, r.nome) as produto,
           calc.versao_vigente(it.receita_id) as versao
      from itens_cardapio it
      join cardapios cd on cd.id = it.cardapio_id
      join receitas r on r.id = it.receita_id
     where cd.estabelecimento_id = p_estab and it.ativo and cd.status <> 'arquivado' and r.ativo
     order by it.receita_id, (calc.preco_publicado(it.id) is null), it.criado_em
  ), base as (
    select i.*, calc.grupo_ficha(i.receita_id) as grupo,
           calc.custo_unitario_versao(i.versao, p_estab) as hoje,
           calc.custo_unitario_versao_precos_em(i.versao, p_estab, v_antes) as antes,
           calc.preco_publicado(i.item_id) as preco_hoje,
           coalesce(calc.preco_publicado(i.item_id, v_antes),
                    (select pr.preco from precos_item_cardapio pr where pr.item_id = i.item_id order by pr.vigente_desde limit 1)) as preco_antes
      from itens i where i.versao is not null
  ), m as (
    select b.*, l.atencao_pct, l.alerta_pct, l.critico_pct, l.cmv_atencao_pp, l.cmv_critico_pp,
           case when b.antes > 0 and b.hoje is not null then round(100 * (b.hoje / b.antes - 1), 1) end as var,
           case when b.preco_hoje > 0 and b.hoje is not null then round(100 * b.hoje / b.preco_hoje, 1) end as cmv_h,
           case when b.preco_antes > 0 and b.antes is not null then round(100 * b.antes / b.preco_antes, 1) end as cmv_a
      from base b join public.limites_alerta_casa(p_estab) l on l.grupo = b.grupo
  ), n as (
    select m.*,
           case when m.var >= m.critico_pct then 3 when m.var >= m.alerta_pct then 2 when m.var >= m.atencao_pct then 1 else 0 end as n_custo,
           (m.cmv_a <= v_meta + 0.05 and m.cmv_h > v_meta + 0.05) as cruzou,
           m.cmv_h - m.cmv_a as var_cmv
      from m
  ), f as (
    select n.*,
           case when n.cruzou and n.cmv_h >= v_meta + n.cmv_critico_pp then 3
                when n.cruzou then 2
                when n.var_cmv >= n.cmv_atencao_pp then 1 else 0 end as n_cmv
      from n
  )
  select f.receita_id, f.item_id, f.produto, f.grupo,
         round(f.antes, 4), round(f.hoje, 4), f.var,
         f.preco_hoje, f.cmv_a, f.cmv_h, f.var_cmv, v_meta,
         coalesce(f.cruzou, false), f.n_custo, f.n_cmv, greatest(f.n_custo, f.n_cmv),
         -- insumos da ficha que mais subiram no período (até 3)
         (select string_agg(x.nome || ' +' || replace(to_char(x.pct, 'FM9990.0'), '.', ',') || '%', ', ' order by x.pct desc)
            from (select i.nome, round(100 * (calc.custo_insumo(q.insumo_id, p_estab) / calc.custo_insumo(q.insumo_id, p_estab, v_antes) - 1), 1) as pct
                    from calc.insumos_da_versao(f.versao) q join insumos i on i.id = q.insumo_id
                   where calc.custo_insumo(q.insumo_id, p_estab, v_antes) > 0
                     and calc.custo_insumo(q.insumo_id, p_estab) > calc.custo_insumo(q.insumo_id, p_estab, v_antes) * 1.005
                   order by 2 desc limit 3) x)
    from f
   where greatest(f.n_custo, f.n_cmv) > 0
   order by greatest(f.n_custo, f.n_cmv) desc, f.var desc nulls last, f.produto;
end $$;
grant execute on function public.alertas_fichas_niveis(uuid, int) to authenticated;
