-- =====================================================================
-- Migração 0004 · CMV de referência por item + duas sugestões de preço
-- =====================================================================
-- Arquitetura de cardápio do Grupo JF+: a casa persegue CMV médio de 30%
-- (ou menos), mas cada item tem o SEU CMV definido no cardápio (mojito 9%,
-- margarita 36%). Quando um insumo muda, a sugestão preserva o CMV do item,
-- não os 30% da casa.
--
-- Referência do item (nesta ordem):
--   1. cmv_alvo digitado no item (manual, quando quiser forçar)
--   2. CMV do último preço aprovado (custo ÷ preço no momento da aprovação)
--   3. CMV-alvo padrão da casa (só para item ainda sem preço aprovado)
--
-- Duas sugestões lado a lado:
--   * manter CMV:    custo atual ÷ CMV de referência
--   * manter margem: custo atual + (preço aprovado − custo na aprovação)
-- =====================================================================

-- Referência do item numa data
create or replace function calc.referencia_item(p_item uuid, p_data timestamptz default now())
returns table (cmv_ref numeric, origem text, preco_ref numeric, custo_ref numeric)
language sql stable as $$
  with ult as (
    select p.preco, p.custo_no_momento, p.cmv_no_momento
      from precos_item_cardapio p
     where p.item_id = p_item and p.vigente_desde <= p_data
     order by p.vigente_desde desc, p.criado_em desc
     limit 1
  )
  select coalesce(it.cmv_alvo, (select cmv_no_momento from ult), e.cmv_alvo_padrao),
         case when it.cmv_alvo is not null then 'manual'
              when (select cmv_no_momento from ult) is not null then 'preco_aprovado'
              when e.cmv_alvo_padrao is not null then 'padrao_casa' end,
         (select preco from ult),
         (select custo_no_momento from ult)
    from itens_cardapio it
    join cardapios cd on cd.id = it.cardapio_id
    join estabelecimentos e on e.id = cd.estabelecimento_id
   where it.id = p_item
$$;

-- Painel por item (substitui a versão da 0001; mantém as colunas antigas)
drop function if exists public.painel_cmv(uuid, timestamptz);
create function public.painel_cmv(p_estab uuid, p_data timestamptz default now())
returns table (item_id uuid, cardapio text, produto text, custo_porcao numeric,
               preco_publicado numeric, cmv_atual_pct numeric,
               cmv_alvo_pct numeric,               -- CMV de referência do item
               origem_referencia text,             -- manual | preco_aprovado | padrao_casa
               preco_sugerido numeric,             -- mantendo o CMV de referência
               preco_sugerido_arredondado numeric,
               cmv_preco_arredondado_pct numeric,
               preco_sugerido_margem numeric,      -- mantendo a margem em reais
               preco_sugerido_margem_arredondado numeric,
               cmv_preco_margem_arredondado_pct numeric,
               margem_atual numeric, margem_referencia numeric,
               situacao text)
language plpgsql stable security definer set search_path = public, calc as $$
begin
  perform calc.exigir_custos(p_estab);
  return query
  with base as (
    select it.id, cd.nome as cardapio, coalesce(it.nome_exibicao, r.nome) as produto,
           calc.custo_unitario_receita(it.receita_id, p_estab, p_data) as custo,
           calc.preco_publicado(it.id, p_data) as preco,
           ref.cmv_ref, ref.origem, ref.preco_ref, ref.custo_ref,
           e.regra_arredondamento as regra
      from itens_cardapio it
      join cardapios cd on cd.id = it.cardapio_id
      join estabelecimentos e on e.id = cd.estabelecimento_id
      join receitas r on r.id = it.receita_id
      cross join lateral calc.referencia_item(it.id, p_data) ref
     where cd.estabelecimento_id = p_estab and it.ativo and cd.status <> 'arquivado'
  ), s as (
    select b.*,
           case when b.custo is not null and b.cmv_ref > 0 then b.custo / (b.cmv_ref / 100) end as sug_cmv,
           case when b.custo is not null and b.preco_ref is not null and b.custo_ref is not null
                then b.custo + (b.preco_ref - b.custo_ref) end as sug_margem
      from base b
  )
  select s.id, s.cardapio, s.produto, round(s.custo, 2), s.preco,
         case when s.preco > 0 then round(100 * s.custo / s.preco, 1) end,
         round(s.cmv_ref, 1), s.origem,
         round(s.sug_cmv, 2),
         calc.arredondar_preco(s.sug_cmv, s.regra),
         case when s.sug_cmv is not null then round(100 * s.custo / calc.arredondar_preco(s.sug_cmv, s.regra), 1) end,
         round(s.sug_margem, 2),
         calc.arredondar_preco(s.sug_margem, s.regra),
         case when s.sug_margem > 0 then round(100 * s.custo / calc.arredondar_preco(s.sug_margem, s.regra), 1) end,
         case when s.preco is not null then round(s.preco - s.custo, 2) end,
         case when s.preco_ref is not null then round(s.preco_ref - s.custo_ref, 2) end,
         case when s.custo is null   then 'sem_custo'
              when s.cmv_ref is null then 'sem_alvo'
              when s.preco is null   then 'sem_preco'
              when 100 * s.custo / s.preco > s.cmv_ref + 0.05 then 'acima_do_alvo'
              when 100 * s.custo / s.preco < s.cmv_ref - 5    then 'abaixo_do_alvo'
              else 'ok' end
    from s
   order by s.cardapio, s.produto;
end $$;

-- CMV da casa: média simples dos itens com custo e preço, contra a meta da casa.
-- (Quando houver vendas do PDV, entra a média ponderada pelo mix.)
create or replace function public.cmv_da_casa(p_estab uuid, p_data timestamptz default now())
returns table (itens_avaliados int, cmv_medio_simples_pct numeric, meta_casa_pct numeric,
               itens_acima_da_referencia int, situacao text)
language plpgsql stable security definer set search_path = public, calc as $$
begin
  perform calc.exigir_custos(p_estab);
  return query
  select count(*)::int,
         round(avg(p.cmv_atual_pct), 1),
         (select cmv_alvo_padrao from estabelecimentos where id = p_estab),
         (count(*) filter (where p.situacao = 'acima_do_alvo'))::int,
         case when avg(p.cmv_atual_pct) is null then 'sem_dados'
              when avg(p.cmv_atual_pct) > (select cmv_alvo_padrao from estabelecimentos where id = p_estab)
                then 'acima_da_meta' else 'dentro_da_meta' end
    from public.painel_cmv(p_estab, p_data) p
   where p.cmv_atual_pct is not null;
end $$;

-- Aprovação de preço: grava a sugestão do momento pela referência do item
create or replace function public.aprovar_preco(p_item uuid, p_preco numeric, p_motivo text default null,
                                                p_vigente_desde timestamptz default now())
returns uuid language plpgsql security definer set search_path = public, calc as $$
declare v_estab uuid; v_receita uuid; v_ref numeric; v_custo numeric; v_id uuid;
begin
  select cd.estabelecimento_id, it.receita_id into v_estab, v_receita
    from itens_cardapio it join cardapios cd on cd.id = it.cardapio_id
   where it.id = p_item;
  if v_estab is null then raise exception 'Item inexistente'; end if;
  perform calc.exigir_custos(v_estab);
  select cmv_ref into v_ref from calc.referencia_item(p_item, p_vigente_desde);
  v_custo := calc.custo_unitario_receita(v_receita, v_estab, p_vigente_desde);
  perform set_config('app.motivo', coalesce(p_motivo, 'aprovação de preço'), true);
  insert into precos_item_cardapio (item_id, preco, vigente_desde, custo_no_momento, cmv_no_momento,
                                    sugerido_no_momento, aprovado_por, motivo)
  values (p_item, p_preco, p_vigente_desde, v_custo,
          case when v_custo is not null then round(100 * v_custo / p_preco, 2) end,
          case when v_custo is not null and v_ref > 0 then round(v_custo / (v_ref / 100), 2) end,
          auth.uid(), p_motivo)
  returning id into v_id;
  return v_id;
end $$;

revoke all on function calc.referencia_item(uuid, timestamptz) from public;
grant execute on function public.painel_cmv(uuid, timestamptz), public.cmv_da_casa(uuid, timestamptz) to authenticated;
