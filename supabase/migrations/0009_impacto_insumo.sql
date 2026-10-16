-- =====================================================================
-- 0009 — Impacto da alta (ou queda) de um insumo no custo de cada ficha
--
-- Para cada receita aprovada que usa o insumo (direto ou via subprodutos):
--   • custo atual  = versão vigente com os preços de hoje;
--   • custo sem a mudança = mesma versão, com os preços de hoje, mas este
--     insumo pelo preço anterior (custo_insumo_anterior).
--   impacto % = quanto a mudança de preço DESTE insumo moveu o custo da ficha.
-- Só leitura; mesma permissão das telas de custo.
-- =====================================================================

-- Custo por unidade-base de uma versão com os preços de hoje, trocando o preço de um insumo
create or replace function calc.custo_unitario_versao_troca(p_versao uuid, p_estab uuid, p_insumo uuid, p_preco numeric,
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
      v_unit := case when c.insumo_id = p_insumo then p_preco else calc.custo_insumo(c.insumo_id, p_estab) end;
    else
      v_unit := calc.custo_unitario_versao_troca(calc.versao_vigente(c.subproduto_id), p_estab, p_insumo, p_preco, p_profundidade + 1);
    end if;
    if v_unit is null then return null; end if;
    v_total := v_total + calc.qtd_base_componente(c) * v_unit;
  end loop;
  v_total := v_total + coalesce((select sum(valor) from custos_adicionais_versao where versao_id = p_versao), 0);
  return v_total / calc.converter(v.rendimento_quantidade, v.rendimento_unidade, r.dimensao_saida, null);
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
     where r.ativo
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

revoke all on function calc.custo_unitario_versao_troca(uuid, uuid, uuid, numeric, int) from public;
grant execute on function public.impacto_insumo_fichas(uuid, uuid) to authenticated;
