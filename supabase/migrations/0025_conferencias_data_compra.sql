-- =====================================================================
-- 0025 — Início: compras esperando conferência pela data da compra
-- No mini gráfico de "Compras para conferir", cada semana passa a contar as
-- compras feitas até aquela data (data da nota) que ainda não estavam
-- conferidas. Antes contava pela data em que a nota foi importada, o que
-- escondia o acúmulo de notas antigas.
-- Só leitura. Pode rodar de novo (create or replace). Requer a 0024.
-- =====================================================================

create or replace function public.serie_mercado_casa(p_estab uuid, p_semanas int default 12, p_itens int default 10)
returns table (tipo text, data date, item_id uuid, produto text, custo numeric, preco numeric, cmv_pct numeric,
               cmv_medio numeric, itens_avaliados int, itens_acima int, conferencias_abertas int,
               insumos_sem_preco int, indice_custo_fichas numeric,
               -- comparação com 4 semanas antes (null sem o ponto anterior)
               var_cmv_pp numeric, var_pct numeric, var_acima int, var_conferencias int, var_sem_preco int)
-- volatile: usa tabelas temporárias para calcular cada semana uma vez só
language plpgsql security definer set search_path = public, calc as $$
#variable_conflict use_column
declare
  v_meta numeric;
  v_n int := least(greatest(coalesce(p_semanas, 12), 2), 26);
  k int; d date; ts timestamptz;
begin
  perform calc.exigir_custos(p_estab);
  select coalesce(e.cmv_alvo_padrao, 30) into v_meta from estabelecimentos e where e.id = p_estab;

  -- itens ativos do cardápio da casa (hoje)
  create temp table if not exists _itens_mercado (item_id uuid, versao_id uuid, produto text, primeiro_preco numeric) on commit drop;
  truncate _itens_mercado;
  insert into _itens_mercado
  select it.id, calc.versao_vigente(it.receita_id), coalesce(it.nome_exibicao, r.nome),
         (select pr.preco from precos_item_cardapio pr where pr.item_id = it.id order by pr.vigente_desde limit 1)
    from itens_cardapio it
    join cardapios cd on cd.id = it.cardapio_id
    join receitas r on r.id = it.receita_id
   where cd.estabelecimento_id = p_estab and it.ativo and cd.status <> 'arquivado';

  -- custo e preço de cada item em cada semana
  create temp table if not exists _pontos_mercado (data date, item_id uuid, custo numeric, preco numeric) on commit drop;
  truncate _pontos_mercado;
  for k in reverse v_n - 1 .. 0 loop
    d := current_date - 7 * k;
    ts := case when k = 0 then now() else (d + 1)::timestamptz - interval '1 microsecond' end;
    insert into _pontos_mercado
    select d, i.item_id, round(calc.custo_unitario_versao_precos_em(i.versao_id, p_estab, ts), 2),
           coalesce(calc.preco_publicado(i.item_id, ts), i.primeiro_preco)
      from _itens_mercado i where i.versao_id is not null;
  end loop;

  -- linhas da casa (uma por semana)
  return query
  with c as (
    select p.data, p.item_id, p.custo,
           case when p.preco > 0 and p.custo is not null then round(100 * p.custo / p.preco, 1) end as cmv
      from _pontos_mercado p
  ), base as (  -- custo de cada item na primeira semana em que ele tem custo
    select distinct on (item_id) item_id, custo as custo_base
      from c where custo > 0 order by item_id, data
  ), sem as (
    select dd.data,
           ((dd.data + 1)::timestamptz - interval '1 microsecond') as fim
      from (select distinct data from _pontos_mercado) dd
  ), usados as (
    select distinct cr.insumo_id
      from componentes_receita cr join versoes_receita v on v.id = cr.versao_id
     where v.status = 'aprovada' and cr.insumo_id is not null
  )
  , x as (
  select s.data,
         (select round(avg(c.cmv), 1) from c where c.data = s.data and c.cmv is not null) as cmv_medio,
         (select count(*)::int from c where c.data = s.data and c.cmv is not null) as avaliados,
         (select count(*)::int from c where c.data = s.data and c.cmv > v_meta + 0.05) as acima,
         -- compra feita até a data e ainda sem conferência naquela data (pela data da compra, não da importação)
         (select count(*)::int from conferencias_preco cp join historico_precos hp on hp.id = cp.historico_preco_id
           where cp.estabelecimento_id = p_estab and hp.data_compra <= s.data
             and (cp.status = 'aberta' or cp.resolvido_em > s.fim)) as conferencias,
         (select count(*)::int from usados u
           where not exists (select 1 from historico_precos h
                              where h.insumo_id = u.insumo_id and h.estabelecimento_id = p_estab
                                and h.status = 'validado' and h.valor_total > 0 and h.data_compra <= s.data)) as sem_preco,
         (select round(100 * avg(c.custo / b.custo_base), 1)
            from c join base b on b.item_id = c.item_id
           where c.data = s.data and c.custo is not null) as indice
    from sem s
  )
  select 'casa'::text, x.data, null::uuid, null::text, null::numeric, null::numeric, null::numeric,
         x.cmv_medio, x.avaliados, x.acima, x.conferencias, x.sem_preco, x.indice,
         x.cmv_medio - lag(x.cmv_medio, 4) over w,
         round(100 * (x.indice / nullif(lag(x.indice, 4) over w, 0) - 1), 1),
         x.acima - lag(x.acima, 4) over w,
         x.conferencias - lag(x.conferencias, 4) over w,
         x.sem_preco - lag(x.sem_preco, 4) over w
    from x
  window w as (order by x.data)
   order by x.data;

  -- linhas dos itens que hoje estão mais acima da meta
  return query
  with y as (
    select p.data, p.item_id, i.produto, p.custo, p.preco,
           case when p.preco > 0 and p.custo is not null then round(100 * p.custo / p.preco, 1) end as cmv
      from _pontos_mercado p join _itens_mercado i on i.item_id = p.item_id
   where p.item_id in (select h.item_id from _pontos_mercado h
                        where h.data = current_date and h.preco > 0 and h.custo is not null
                          and round(100 * h.custo / h.preco, 1) > v_meta + 0.05
                        order by h.custo / h.preco desc limit greatest(coalesce(p_itens, 10), 1))
  )
  select 'item'::text, y.data, y.item_id, y.produto, y.custo, y.preco, y.cmv,
         null::numeric, null::int, null::int, null::int, null::int, null::numeric,
         y.cmv - lag(y.cmv, 4) over w,
         round(100 * (y.custo / nullif(lag(y.custo, 4) over w, 0) - 1), 1),
         null::int, null::int, null::int
    from y
  window w as (partition by y.item_id order by y.data)
   order by y.item_id, y.data;
end $$;

grant execute on function public.serie_mercado_casa(uuid, int, int) to authenticated;
