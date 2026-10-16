-- =====================================================================
-- 0013 — Estrutura de custos & taxas por casa e resultado na ponta
--
-- Percentuais sobre o PREÇO de venda, por casa:
--   variáveis : impostos, cartão, gorjeta/serviço, iFood, comissões, outras
--   estrutura : despesas fixas (rateio), despesa financeira
--   lucro     : investimento / distribuição de lucro (alvo)
-- Sem configuração, vale o padrão da planilha: 7 · 4,2 · 0 · 0 · 0 · 0 · 32 · 1,5 · 5 (= 49,7%).
--
-- Por item do cardápio (preço P, custo C):
--   variáveis R$  = P × variáveis%        estrutura R$ = P × estrutura%
--   margem de contribuição = P − C − variáveis
--   resultado na ponta      = margem de contribuição − estrutura
--   preço ideal             = C ÷ (1 − total de deduções%)  → resultado = lucro-alvo
-- Só leitura, exceto a tabela de configuração (gestor da casa). Não muda CMV nem custeio.
-- =====================================================================

create table if not exists estrutura_custos_casa (
  estabelecimento_id     uuid primary key references estabelecimentos(id),
  impostos_pct           numeric(6,2) not null default 7    check (impostos_pct >= 0),
  cartao_pct             numeric(6,2) not null default 4.2  check (cartao_pct >= 0),
  gorjeta_pct            numeric(6,2) not null default 0    check (gorjeta_pct >= 0),
  ifood_pct              numeric(6,2) not null default 0    check (ifood_pct >= 0),
  comissoes_pct          numeric(6,2) not null default 0    check (comissoes_pct >= 0),
  outras_pct             numeric(6,2) not null default 0    check (outras_pct >= 0),
  despesas_fixas_pct     numeric(6,2) not null default 32   check (despesas_fixas_pct >= 0),
  despesa_financeira_pct numeric(6,2) not null default 1.5  check (despesa_financeira_pct >= 0),
  investimento_lucro_pct numeric(6,2) not null default 5    check (investimento_lucro_pct >= 0),
  atualizado_por         uuid default auth.uid(),
  atualizado_em          timestamptz not null default now(),
  check (impostos_pct + cartao_pct + gorjeta_pct + ifood_pct + comissoes_pct + outras_pct
         + despesas_fixas_pct + despesa_financeira_pct + investimento_lucro_pct < 100)
);
alter table estrutura_custos_casa enable row level security;
drop policy if exists leitura on estrutura_custos_casa;
create policy leitura on estrutura_custos_casa for select using (pode_ver_custos(estabelecimento_id));
drop policy if exists gestor_escreve on estrutura_custos_casa;
create policy gestor_escreve on estrutura_custos_casa for all
  using (pode_ver_custos(estabelecimento_id)) with check (pode_ver_custos(estabelecimento_id));
grant select, insert, update, delete on estrutura_custos_casa to authenticated;

-- Configuração da casa (padrão da planilha quando não há registro) e os totais
create or replace function public.estrutura_custos(p_estab uuid)
returns table (impostos_pct numeric, cartao_pct numeric, gorjeta_pct numeric, ifood_pct numeric, comissoes_pct numeric,
               outras_pct numeric, despesas_fixas_pct numeric, despesa_financeira_pct numeric, investimento_lucro_pct numeric,
               variaveis_pct numeric, estrutura_pct numeric, total_pct numeric, personalizada boolean)
language plpgsql stable security definer set search_path = public, calc as $$
begin
  perform calc.exigir_custos(p_estab);
  return query
  with c as (
    select coalesce(e.impostos_pct, 7) i, coalesce(e.cartao_pct, 4.2) ca, coalesce(e.gorjeta_pct, 0) g, coalesce(e.ifood_pct, 0) f,
           coalesce(e.comissoes_pct, 0) co, coalesce(e.outras_pct, 0) o, coalesce(e.despesas_fixas_pct, 32) df,
           coalesce(e.despesa_financeira_pct, 1.5) fi, coalesce(e.investimento_lucro_pct, 5) l, e.estabelecimento_id is not null as pers
      from (select 1) x left join estrutura_custos_casa e on e.estabelecimento_id = p_estab
  )
  select c.i, c.ca, c.g, c.f, c.co, c.o, c.df, c.fi, c.l,
         c.i + c.ca + c.g + c.f + c.co + c.o, c.df + c.fi, c.i + c.ca + c.g + c.f + c.co + c.o + c.df + c.fi + c.l, c.pers
    from c;
end $$;

-- Resultado na ponta de cada item ativo do cardápio da casa
create or replace function public.resultado_itens_casa(p_estab uuid)
returns table (item_id uuid, receita_id uuid, preco numeric, custo numeric,
               variaveis_valor numeric, estrutura_valor numeric,
               margem_contribuicao numeric, margem_contribuicao_pct numeric,
               resultado numeric, resultado_pct numeric, lucro_alvo_pct numeric,
               preco_ideal numeric, preco_ideal_arredondado numeric, cmv_preco_ideal_pct numeric,
               situacao text)
language plpgsql stable security definer set search_path = public, calc as $$
declare k record; v_regra text;
begin
  perform calc.exigir_custos(p_estab);
  select * into k from public.estrutura_custos(p_estab);
  select regra_arredondamento into v_regra from estabelecimentos where id = p_estab;
  return query
  with b as (
    select it.id, it.receita_id as rid, calc.preco_publicado(it.id) as p, calc.custo_unitario_receita(it.receita_id, p_estab) as c
      from itens_cardapio it join cardapios cd on cd.id = it.cardapio_id
     where cd.estabelecimento_id = p_estab and it.ativo and cd.status <> 'arquivado'
  ), r as (
    select b.*, b.p * k.variaveis_pct / 100 as var, b.p * k.estrutura_pct / 100 as est,
           case when b.c is not null then b.c / (1 - k.total_pct / 100) end as ideal
      from b
  )
  select r.id, r.rid, r.p, round(r.c, 4), round(r.var, 2), round(r.est, 2),
         round(r.p - r.c - r.var, 2), case when r.p > 0 then round(100 * (r.p - r.c - r.var) / r.p, 1) end,
         round(r.p - r.c - r.var - r.est, 2), case when r.p > 0 then round(100 * (r.p - r.c - r.var - r.est) / r.p, 1) end,
         k.investimento_lucro_pct,
         round(r.ideal, 2), calc.arredondar_preco(r.ideal, v_regra),
         case when r.ideal > 0 then round(100 * r.c / calc.arredondar_preco(r.ideal, v_regra), 1) end,
         case when r.p is null or r.c is null then 'sem_dados'
              when r.p - r.c - r.var - r.est < 0 then 'prejuizo'
              when 100 * (r.p - r.c - r.var - r.est) / r.p < k.investimento_lucro_pct - 0.05 then 'abaixo_do_alvo'
              else 'ok' end
    from r;
end $$;

-- Demonstrativo de um item: linha a linha, do preço ao resultado
create or replace function public.demonstrativo_item(p_item uuid)
returns table (ordem int, rotulo text, pct numeric, valor numeric, tipo text)
language plpgsql stable security definer set search_path = public, calc as $$
declare v_estab uuid; k record; v_p numeric; v_c numeric;
begin
  select cd.estabelecimento_id into v_estab from itens_cardapio it join cardapios cd on cd.id = it.cardapio_id where it.id = p_item;
  if v_estab is null then return; end if;
  perform calc.exigir_custos(v_estab);
  select * into k from public.estrutura_custos(v_estab);
  v_p := calc.preco_publicado(p_item);
  v_c := calc.custo_unitario_receita((select receita_id from itens_cardapio where id = p_item), v_estab);
  if v_p is null or v_c is null then return; end if;
  return query values
    (1,  'Preço de venda'::text, 100::numeric, round(v_p, 2), 'total'::text),
    (2,  'CMV (custo da ficha)', round(100 * v_c / v_p, 1), round(-v_c, 2), 'custo'),
    (3,  'Impostos', k.impostos_pct, round(-v_p * k.impostos_pct / 100, 2), 'variavel'),
    (4,  'Taxa de cartão', k.cartao_pct, round(-v_p * k.cartao_pct / 100, 2), 'variavel'),
    (5,  'Gorjeta / serviço', k.gorjeta_pct, round(-v_p * k.gorjeta_pct / 100, 2), 'variavel'),
    (6,  'Taxa iFood', k.ifood_pct, round(-v_p * k.ifood_pct / 100, 2), 'variavel'),
    (7,  'Comissões / taxas', k.comissoes_pct, round(-v_p * k.comissoes_pct / 100, 2), 'variavel'),
    (8,  'Outras taxas', k.outras_pct, round(-v_p * k.outras_pct / 100, 2), 'variavel'),
    (9,  'Margem de contribuição', round(100 * (v_p - v_c - v_p * k.variaveis_pct / 100) / v_p, 1),
         round(v_p - v_c - v_p * k.variaveis_pct / 100, 2), 'subtotal'),
    (10, 'Despesas fixas (rateio)', k.despesas_fixas_pct, round(-v_p * k.despesas_fixas_pct / 100, 2), 'estrutura'),
    (11, 'Despesa financeira', k.despesa_financeira_pct, round(-v_p * k.despesa_financeira_pct / 100, 2), 'estrutura'),
    (12, 'Resultado na ponta', round(100 * (v_p - v_c - v_p * (k.variaveis_pct + k.estrutura_pct) / 100) / v_p, 1),
         round(v_p - v_c - v_p * (k.variaveis_pct + k.estrutura_pct) / 100, 2), 'resultado'),
    (13, 'Alvo de investimento / lucro', k.investimento_lucro_pct, round(v_p * k.investimento_lucro_pct / 100, 2), 'alvo');
end $$;

grant execute on function public.estrutura_custos(uuid) to authenticated;
grant execute on function public.resultado_itens_casa(uuid) to authenticated;
grant execute on function public.demonstrativo_item(uuid) to authenticated;
