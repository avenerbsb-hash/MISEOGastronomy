-- =====================================================================
-- 0011 — Painel de CMV da casa com sugestão para a meta da casa
--
-- Em cima de painel_cmv (0005), por item do cardápio:
--   • receita_id (para abrir a ficha e o preço);
--   • meta da casa = cmv_alvo_padrao (30% quando a casa ainda não tem meta);
--   • preço para a meta = custo ÷ meta, arredondado pela regra da casa,
--     com o CMV que esse preço dá e a variação sobre o preço atual.
-- Ordenado do CMV mais alto para o mais baixo. Só leitura.
-- =====================================================================

create or replace function public.painel_cmv_casa(p_estab uuid)
returns table (item_id uuid, receita_id uuid, cardapio text, produto text, custo_porcao numeric,
               preco_publicado numeric, cmv_atual_pct numeric, margem_atual numeric,
               cmv_ref_pct numeric, origem_referencia text,
               preco_manter_cmv numeric, preco_manter_margem numeric,
               meta_pct numeric, meta_definida boolean,
               preco_meta numeric, cmv_preco_meta_pct numeric, ajuste_meta_pct numeric,
               situacao text)
language plpgsql stable security definer set search_path = public, calc as $$
declare
  v_meta numeric; v_definida boolean; v_regra text;
begin
  perform calc.exigir_custos(p_estab);
  select coalesce(e.cmv_alvo_padrao, 30), e.cmv_alvo_padrao is not null, e.regra_arredondamento
    into v_meta, v_definida, v_regra
    from estabelecimentos e where e.id = p_estab;
  return query
  with p as (
    select x.*, it.receita_id as rid,
           case when x.custo_porcao is not null then calc.arredondar_preco(x.custo_porcao / (v_meta / 100), v_regra) end as pm
      from public.painel_cmv(p_estab) x join itens_cardapio it on it.id = x.item_id
  )
  select p.item_id, p.rid, p.cardapio, p.produto, p.custo_porcao, p.preco_publicado, p.cmv_atual_pct, p.margem_atual,
         p.cmv_alvo_pct, p.origem_referencia,
         p.preco_sugerido_arredondado, p.preco_sugerido_margem_arredondado,
         v_meta, v_definida,
         p.pm,
         case when p.pm > 0 then round(100 * p.custo_porcao / p.pm, 1) end,
         case when p.pm > 0 and p.preco_publicado > 0 then round(100 * (p.pm - p.preco_publicado) / p.preco_publicado, 1) end,
         case when p.custo_porcao is null then 'sem_custo'
              when p.preco_publicado is null then 'sem_preco'
              when p.cmv_atual_pct > v_meta + 0.05 then 'acima_da_meta'
              else 'dentro_da_meta' end
    from p
   order by p.cmv_atual_pct desc nulls last, p.produto;
end $$;

grant execute on function public.painel_cmv_casa(uuid) to authenticated;
