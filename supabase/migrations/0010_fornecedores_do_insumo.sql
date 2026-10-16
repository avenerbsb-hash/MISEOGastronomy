-- =====================================================================
-- 0010 — Melhor e pior fornecedor de um insumo (últimas N compras)
--
-- Considera as últimas p_compras compras reais validadas do insumo na casa
-- (sem preço de referência nem bonificação) e agrupa por fornecedor:
--   custo médio = total pago ÷ quantidade total na unidade-base (média ponderada).
-- Melhor = menor custo médio; pior = maior; só entre fornecedores informados.
-- economia_pct = quanto o melhor custa a menos que cada fornecedor.
-- Só leitura; mesma permissão das telas de custo.
-- =====================================================================

create or replace function public.fornecedores_do_insumo(p_insumo uuid, p_estab uuid, p_compras int default 10)
returns table (fornecedor_id uuid, fornecedor text, compras int, custo_medio numeric, menor_custo numeric,
               maior_custo numeric, ultima_compra date, posicao text, economia_pct numeric)
language plpgsql stable security definer set search_path = public, calc as $$
begin
  perform calc.exigir_custos(p_estab);
  return query
  with ult as (
    select h.fornecedor_id, h.valor_total, h.custo_unitario_base, h.data_compra
      from historico_precos h
     where h.insumo_id = p_insumo and h.estabelecimento_id = p_estab
       and h.status = 'validado' and h.valor_total > 0 and h.fonte <> 'referencia'
     order by h.data_compra desc, h.criado_em desc
     limit greatest(p_compras, 1)
  ), g as (
    select u.fornecedor_id, count(*)::int as n,
           sum(u.valor_total) / nullif(sum(u.valor_total / u.custo_unitario_base), 0) as media,
           min(u.custo_unitario_base) as menor, max(u.custo_unitario_base) as maior, max(u.data_compra) as ultima
      from ult u
     group by u.fornecedor_id
  ), r as (
    select g.*,
           min(g.media) filter (where g.fornecedor_id is not null) over () as melhor,
           max(g.media) filter (where g.fornecedor_id is not null) over () as pior,
           count(*) filter (where g.fornecedor_id is not null) over () as qtd_forn
      from g
  )
  select r.fornecedor_id, coalesce(f.nome, 'Fornecedor não informado'), r.n,
         round(r.media, 8), round(r.menor, 8), round(r.maior, 8), r.ultima,
         case when r.fornecedor_id is null then null
              when r.qtd_forn = 1 then 'unico'
              when r.media = r.melhor then 'melhor'
              when r.media = r.pior then 'pior'
              else 'intermediario' end,
         case when r.melhor > 0 and r.media > r.melhor then round(100 * (r.media - r.melhor) / r.media, 1) end
    from r left join fornecedores f on f.id = r.fornecedor_id
   order by r.fornecedor_id is null, r.media, f.nome;
end $$;

grant execute on function public.fornecedores_do_insumo(uuid, uuid, int) to authenticated;
