-- =====================================================================
-- 0020 — Melhor fornecedor de cada item do estoque (para o pedido da semana)
-- Mesma regra do quadro "Fornecedores" do insumo (0010): últimas p_compras
-- compras reais validadas do insumo na casa (sem preço de referência),
-- custo médio ponderado por fornecedor; melhor = menor custo médio entre os
-- fornecedores informados. Quem não vê custos (estoquista) recebe o nome do
-- fornecedor, sem preço. Só leitura. Pode rodar de novo (create or replace).
-- =====================================================================

create or replace function public.melhores_fornecedores_estoque(p_estab uuid, p_compras int default 10)
returns table (insumo_id uuid, fornecedor_id uuid, fornecedor text, compras int, fornecedores int,
               custo_medio numeric, preco_unidade_compra numeric, economia_pct numeric)
language plpgsql stable security definer set search_path = public, calc as $$
declare v_custos boolean := pode_ver_custos(p_estab);
begin
  if not tem_acesso(p_estab) then
    raise exception 'Sem acesso a esta casa' using errcode = 'insufficient_privilege';
  end if;
  return query
  with itens as (
    select e.insumo_id, e.conteudo from estoque_itens e where e.estabelecimento_id = p_estab and e.ativo
  ), ult as (
    select i.insumo_id, h.fornecedor_id, h.valor_total, h.custo_unitario_base
      from itens i
      cross join lateral (
        select h.fornecedor_id, h.valor_total, h.custo_unitario_base
          from historico_precos h
         where h.insumo_id = i.insumo_id and h.estabelecimento_id = p_estab
           and h.status = 'validado' and h.valor_total > 0 and h.fonte <> 'referencia'
         order by h.data_compra desc, h.criado_em desc
         limit greatest(p_compras, 1)) h
  ), g as (
    select u.insumo_id, u.fornecedor_id, count(*)::int as n,
           sum(u.valor_total) / nullif(sum(u.valor_total / u.custo_unitario_base), 0) as media
      from ult u where u.fornecedor_id is not null
     group by u.insumo_id, u.fornecedor_id
  ), r as (
    select g.*, row_number() over (partition by g.insumo_id order by g.media, g.n desc) as pos,
           count(*) over (partition by g.insumo_id)::int as qtd, max(g.media) over (partition by g.insumo_id) as pior
      from g
  )
  select r.insumo_id, r.fornecedor_id, f.nome, r.n, r.qtd,
         case when v_custos then r.media end,
         case when v_custos and i.conteudo is not null then r.media * i.conteudo end,
         case when v_custos and r.qtd > 1 and r.pior > 0 then round(100 * (r.pior - r.media) / r.pior, 1) end
    from r
    join itens i on i.insumo_id = r.insumo_id
    join fornecedores f on f.id = r.fornecedor_id
   where r.pos = 1;
end $$;

grant execute on function public.melhores_fornecedores_estoque(uuid, int) to authenticated;
