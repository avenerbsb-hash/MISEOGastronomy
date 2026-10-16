-- =====================================================================
-- 0017 — Custo do item × custo pela média das últimas notas
-- Para cada item ativo do cardápio da casa: o custo atual (última compra de
-- cada insumo, como sempre) comparado com o custo calculado pela MÉDIA das
-- últimas N compras validadas de cada insumo (padrão 10), inclusive dentro
-- dos subprodutos. Mostra se o drink está mais caro ou mais barato do que
-- costuma ser.
-- • Média simples do custo por g/mL/un das últimas N compras validadas
--   (preço de referência de outra casa não entra; insumo só com referência
--   usa o próprio preço de referência nas duas contas).
-- • Variação classificada pelo valor completo; arredondada a 0,0% = estável.
-- Só leitura. Pode rodar de novo (create or replace).
-- =====================================================================

create or replace function calc.custo_insumo_media(p_insumo uuid, p_estab uuid, p_n int default 10)
returns numeric language sql stable as $$
  select coalesce(
    (select avg(u.custo_unitario_base) from (
       select h.custo_unitario_base from historico_precos h
        where h.insumo_id = p_insumo and h.estabelecimento_id = p_estab
          and h.status = 'validado' and h.valor_total > 0 and h.fonte <> 'referencia'
        order by h.data_compra desc, h.validado_em desc nulls last, h.criado_em desc
        limit greatest(p_n, 1)) u),
    calc.custo_insumo(p_insumo, p_estab))
$$;

-- Custo da versão com a média das notas (mesma estrutura de calc.custo_total_versao)
create or replace function calc.custo_total_versao_media(p_versao uuid, p_estab uuid, p_n int default 10)
returns numeric language plpgsql stable as $$
declare c componentes_receita; v_total numeric := 0; v_unit numeric;
begin
  for c in select * from componentes_receita where versao_id = p_versao loop
    v_unit := case when c.insumo_id is not null
                   then calc.custo_insumo_media(c.insumo_id, p_estab, p_n)
                   else calc.custo_unitario_receita_media(c.subproduto_id, p_estab, p_n) end;
    if v_unit is null then return null; end if;
    v_total := v_total + calc.qtd_base_componente(c) * v_unit;
  end loop;
  return v_total + coalesce((select sum(valor) from custos_adicionais_versao where versao_id = p_versao), 0);
end $$;

create or replace function calc.custo_unitario_receita_media(p_receita uuid, p_estab uuid, p_n int default 10)
returns numeric language plpgsql stable as $$
declare v_versao uuid := calc.versao_vigente(p_receita, now()); v versoes_receita; r receitas; v_total numeric;
begin
  if v_versao is null then return null; end if;
  select * into v from versoes_receita where id = v_versao;
  select * into r from receitas where id = v.receita_id;
  v_total := calc.custo_total_versao_media(v_versao, p_estab, p_n);
  if v_total is null then return null; end if;
  return v_total / calc.converter(v.rendimento_quantidade, v.rendimento_unidade, r.dimensao_saida, null);
end $$;

-- Itens ativos do cardápio da casa: custo atual × custo pela média das últimas N notas
create or replace function public.custo_vs_media_casa(p_estab uuid, p_n int default 10)
returns table (item_id uuid, receita_id uuid, custo_atual numeric, custo_media numeric,
               variacao_pct numeric, status text)
language plpgsql stable security definer set search_path = public, calc as $$
begin
  perform calc.exigir_custos(p_estab);
  return query
  with it as (
    select i.id, i.receita_id,
           calc.custo_unitario_receita(i.receita_id, p_estab) as atual,
           calc.custo_unitario_receita_media(i.receita_id, p_estab, p_n) as media
      from itens_cardapio i
      join cardapios cd on cd.id = i.cardapio_id and cd.status <> 'arquivado'
     where cd.estabelecimento_id = p_estab and i.ativo
  )
  select it.id, it.receita_id, it.atual, it.media,
         case when it.media > 0 then (it.atual / it.media - 1) * 100 end,
         case when it.atual is null or it.media is null or it.media <= 0 then 'sem_comparacao'
              when round((it.atual / it.media - 1) * 100, 1) = 0 then 'estavel'
              when it.atual > it.media then 'subiu'
              else 'caiu' end
    from it;
end $$;

revoke all on function calc.custo_insumo_media(uuid, uuid, int) from public;
grant execute on function public.custo_vs_media_casa(uuid, int) to authenticated;
