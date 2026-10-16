-- =====================================================================
-- 0008 — Alertas de aumento de custo (insumo e ficha técnica)
--
-- • alertas_insumos: insumos cujo último preço validado na casa subiu mais
--   que p_limite % em relação ao preço anterior, com compra nos últimos
--   p_dias dias; lista as fichas e subprodutos aprovados que usam o insumo
--   (inclusive via subprodutos).
-- • alertas_fichas: fichas finais e subprodutos cujo custo subiu mais que
--   p_limite % na última compra (mesma regra de variacao_fichas, 0007);
--   para fichas finais no cardápio da casa, traz o CMV antes e depois.
-- Mesma permissão das telas de custo (pode_ver_custos). Só leitura.
-- =====================================================================

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
                        where x.ativo) r on true
   where v.variacao_pct > p_limite
     and v.data_referencia >= current_date - p_dias
   group by v.insumo_id, v.insumo, v.unidade_base, v.custo_atual, v.custo_anterior, v.variacao_pct, v.data_referencia
   order by v.variacao_pct desc, v.insumo;
end $$;

create or replace function public.alertas_fichas(p_estab uuid, p_limite numeric default 10, p_dias int default 60)
returns table (receita_id uuid, nome text, tipo text, dimensao text, custo_atual numeric, custo_anterior numeric,
               variacao_pct numeric, data_referencia date, insumos text,
               preco_venda numeric, cmv_atual_pct numeric, cmv_anterior_pct numeric)
language plpgsql stable security definer set search_path = public, calc as $$
begin
  perform calc.exigir_custos(p_estab);
  return query
  with a as (
    select v.*, r.tipo::text as tipo, r.dimensao_saida::text as dimensao, calc.versao_vigente(r.id) as versao
      from public.variacao_fichas(p_estab) v join receitas r on r.id = v.receita_id
     where v.variacao_pct > p_limite and v.data_referencia >= current_date - p_dias
  )
  select a.receita_id, a.nome, a.tipo, a.dimensao, a.custo_atual, a.custo_anterior, a.variacao_pct, a.data_referencia,
         -- insumos da receita comprados na data da alta (o que puxou o custo)
         (select string_agg(distinct i.nome, ', ' order by i.nome)
            from historico_precos h join insumos i on i.id = h.insumo_id
           where h.estabelecimento_id = p_estab and h.status = 'validado' and h.valor_total > 0
             and h.fonte <> 'referencia' and h.data_compra = a.data_referencia
             and h.insumo_id in (select insumo_id from calc.insumos_da_versao(a.versao))),
         p.preco,
         case when p.preco > 0 then round(100 * a.custo_atual / p.preco, 1) end,
         case when p.preco > 0 then round(100 * a.custo_anterior / p.preco, 1) end
    from a
    left join lateral (select calc.preco_publicado(it.id) as preco
                         from itens_cardapio it join cardapios cd on cd.id = it.cardapio_id
                        where it.receita_id = a.receita_id and cd.estabelecimento_id = p_estab
                          and it.ativo and cd.status <> 'arquivado' and calc.preco_publicado(it.id) is not null
                        limit 1) p on a.tipo = 'final'
   order by a.variacao_pct desc, a.nome;
end $$;

grant execute on function public.alertas_insumos(uuid, numeric, int) to authenticated;
grant execute on function public.alertas_fichas(uuid, numeric, int) to authenticated;
