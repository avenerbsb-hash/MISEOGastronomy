-- =====================================================================
-- 0018 — Prévia da compra antes de salvar
-- Ao digitar quantidade, unidade e valor no "Registrar compra", a tela
-- mostra o custo por g/mL/un que a compra vai gravar, o custo validado
-- atual, a variação e se ela passa do limite da casa (e vai para a
-- conferência, mantendo o custo atual). Só leitura; mesma conversão do
-- trigger do histórico (calc.converter) e mesmo limite da 0012.
-- Pode rodar de novo (create or replace).
-- =====================================================================

create or replace function public.previa_compra(p_insumo uuid, p_estab uuid, p_quantidade numeric, p_unidade text, p_valor numeric)
returns table (custo_base numeric, custo_atual numeric, variacao_pct numeric, limite_pct numeric, vai_conferir boolean)
language plpgsql stable security definer set search_path = public, calc as $$
declare v_dim dimensao_medida; v_qtd numeric; v_novo numeric; v_atual numeric; v_lim numeric;
begin
  perform calc.exigir_custos(p_estab);
  select dimensao into v_dim from insumos where id = p_insumo;
  if v_dim is null or p_quantidade is null or p_quantidade <= 0 or p_valor is null or p_valor < 0 then return; end if;
  v_qtd := calc.converter_ou_nulo(p_quantidade, p_unidade, v_dim);
  if v_qtd is null or v_qtd <= 0 then return; end if;
  v_novo := p_valor / v_qtd;
  v_atual := calc.custo_insumo(p_insumo, p_estab);
  v_lim := calc.limite_conferencia(p_insumo, p_estab);
  return query select v_novo, v_atual,
    case when v_atual > 0 then (v_novo / v_atual - 1) * 100 end,
    v_lim,
    coalesce(v_atual > 0 and (v_novo / v_atual - 1) * 100 > v_lim, false);
end $$;

grant execute on function public.previa_compra(uuid, uuid, numeric, text, numeric) to authenticated;
