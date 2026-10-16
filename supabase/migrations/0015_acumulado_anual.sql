-- =====================================================================
-- 0015 — Inteligência de preços: acumulado do ano por insumo
-- Para cada mês com compra validada, a variação acumulada do preço médio
-- desde o primeiro mês com compra do mesmo ano (ex.: mar/2026 → out/2026).
-- Lê indicadores_mensais_insumo (0012); valores sem arredondamento.
-- Pode rodar de novo (create or replace).
-- =====================================================================

create or replace function public.acumulado_anual_insumo(p_insumo uuid, p_estab uuid, p_meses int default 12)
returns table (mes date, mes_base date, media_base numeric, custo_medio numeric,
               acumulado_pct numeric, status_acumulado text)
language plpgsql stable security definer set search_path = public, calc as $$
begin
  perform calc.exigir_custos(p_estab);
  return query
  with m as (
    select x.mes, x.custo_medio,
           first_value(x.mes) over w as base_mes,
           first_value(x.custo_medio) over w as base_media
      from indicadores_mensais_insumo x
     where x.insumo_id = p_insumo and x.estabelecimento_id = p_estab and x.custo_medio > 0
    window w as (partition by date_trunc('year', x.mes) order by x.mes)
  )
  select m.mes, m.base_mes, m.base_media, m.custo_medio,
         case when m.mes > m.base_mes then (m.custo_medio / m.base_media - 1) * 100 end,
         case when m.mes = m.base_mes then 'sem_base'
              when m.custo_medio > m.base_media then 'subiu'
              when m.custo_medio < m.base_media then 'caiu'
              else 'estavel' end
    from m
   where m.mes >= (date_trunc('month', calc.hoje_casa()) - make_interval(months => greatest(p_meses, 1) - 1))::date
   order by m.mes;
end $$;

grant execute on function public.acumulado_anual_insumo(uuid, uuid, int) to authenticated;
