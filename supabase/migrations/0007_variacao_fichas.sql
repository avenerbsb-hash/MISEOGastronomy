-- =====================================================================
-- 0007 — Variação de custo das fichas (▲ subiu / ▼ caiu / = igual)
--
-- Para cada receita com versão vigente, compara:
--   • custo atual  = versão vigente com os preços de hoje;
--   • custo anterior = a MESMA versão com os preços de antes da última compra
--     que entrou na receita (data de referência). Insumo que ainda não tinha
--     preço naquela data entra com o preço atual (não conta como variação).
--   Preço de referência (planilha, sem nota) não marca data de compra; variação
--   abaixo de 0,05% conta como igual.
-- Subprodutos usados na receita entram pela versão vigente de hoje, com a
-- mesma data de preços. Mesma regra de sinal de variacoes_insumos.
-- Só leitura: nada é gravado.
-- =====================================================================

-- Insumos usados por uma versão, inclusive dentro dos subprodutos (versão vigente de hoje)
create or replace function calc.insumos_da_versao(p_versao uuid)
returns table (insumo_id uuid) language sql stable as $$
  with recursive arvore(versao_id) as (
    select p_versao
    union
    select calc.versao_vigente(c.subproduto_id)
      from componentes_receita c join arvore a on a.versao_id = c.versao_id
     where c.subproduto_id is not null and calc.versao_vigente(c.subproduto_id) is not null
  )
  select distinct c.insumo_id
    from componentes_receita c join arvore a on a.versao_id = c.versao_id
   where c.insumo_id is not null
$$;

-- Custo por unidade-base de uma versão com os preços vigentes em p_precos
-- (insumo sem preço naquela data usa o preço atual)
create or replace function calc.custo_unitario_versao_precos_em(p_versao uuid, p_estab uuid, p_precos timestamptz,
                                                                 p_profundidade int default 0)
returns numeric language plpgsql stable as $$
declare
  c componentes_receita; v versoes_receita; r receitas;
  v_total numeric := 0; v_unit numeric;
begin
  if p_versao is null or p_profundidade > 20 then return null; end if;
  select * into v from versoes_receita where id = p_versao;
  select * into r from receitas where id = v.receita_id;
  for c in select * from componentes_receita where versao_id = p_versao loop
    if c.insumo_id is not null then
      v_unit := coalesce(calc.custo_insumo(c.insumo_id, p_estab, p_precos), calc.custo_insumo(c.insumo_id, p_estab));
    else
      v_unit := calc.custo_unitario_versao_precos_em(calc.versao_vigente(c.subproduto_id), p_estab, p_precos, p_profundidade + 1);
    end if;
    if v_unit is null then return null; end if;
    v_total := v_total + calc.qtd_base_componente(c) * v_unit;
  end loop;
  v_total := v_total + coalesce((select sum(valor) from custos_adicionais_versao where versao_id = p_versao), 0);
  return v_total / calc.converter(v.rendimento_quantidade, v.rendimento_unidade, r.dimensao_saida, null);
end $$;

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
     where x.ativo and (p_tipo is null or x.tipo::text = p_tipo)
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

-- Histórico de custo de uma receita (receita atual, preços de cada data de compra dos seus insumos).
-- Uma linha por data em que o custo mudou, com os insumos comprados naquele dia.
create or replace function public.historico_custo_receita(p_receita uuid, p_estab uuid)
returns table (data date, custo numeric, custo_anterior numeric, variacao_pct numeric, sinal text, insumos text)
language plpgsql stable security definer set search_path = public, calc as $$
declare
  v_versao uuid := calc.versao_vigente(p_receita);
  d record; v_custo numeric; v_ant numeric;
begin
  perform calc.exigir_custos(p_estab);
  if v_versao is null then return; end if;
  for d in
    select h.data_compra as dia, string_agg(distinct i.nome, ', ' order by i.nome) as nomes
      from historico_precos h join insumos i on i.id = h.insumo_id
     where h.estabelecimento_id = p_estab and h.status = 'validado' and h.valor_total > 0
       and h.fonte <> 'referencia' and h.data_compra <= current_date
       and h.insumo_id in (select insumo_id from calc.insumos_da_versao(v_versao))
     group by h.data_compra
     order by h.data_compra
  loop
    v_custo := calc.custo_unitario_versao_precos_em(v_versao, p_estab, d.dia::timestamptz);
    if v_custo is null then continue; end if;
    -- só entra quando o custo muda mais de 0,05%
    if v_ant is null or abs(v_custo - v_ant) > 0.0005 * v_ant then
      data := d.dia; custo := round(v_custo, 6); custo_anterior := round(v_ant, 6);
      variacao_pct := case when v_ant > 0 then round(100 * (v_custo - v_ant) / v_ant, 1) end;
      sinal := case when v_ant is null then 'neutro' when v_custo < v_ant then 'verde' else 'vermelho' end;
      insumos := d.nomes;
      return next;
      v_ant := v_custo;
    end if;
  end loop;
end $$;

revoke all on function calc.insumos_da_versao(uuid) from public;
revoke all on function calc.custo_unitario_versao_precos_em(uuid, uuid, timestamptz, int) from public;
grant execute on function public.variacao_fichas(uuid, text) to authenticated;
grant execute on function public.historico_custo_receita(uuid, uuid) to authenticated;
