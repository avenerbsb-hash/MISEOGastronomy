-- Acumulado do ano por insumo (migração 0015). Rodar no aceite, depois do 100.
\set ON_ERROR_STOP on
set client_min_messages = notice;
set timezone = 'America/Sao_Paulo';
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.ok(p_nome text, p_cond boolean, p_detalhe text default '') returns void
language plpgsql as $$ begin
  if p_cond is not true then raise exception 'FALHOU: % %', p_nome, p_detalhe; end if;
  raise notice 'OK  %  %', p_nome, p_detalhe;
end $$;

-- compras já conferidas (o teste é do acumulado, não da conferência)
select set_config('app.conferido', 'sim', false);
insert into insumos (id, codigo, nome, dimensao) values
  ('00000000-0000-0000-0000-000000000b01', 'TAA-001', 'Teste acumulado anual', 'contagem');
insert into historico_precos (insumo_id, estabelecimento_id, data_compra, quantidade, unidade, valor_total, status) values
  ('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000e1', '2025-03-10', 1, 'un', 40, 'validado'),
  ('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000e1', '2025-06-10', 1, 'un', 45, 'validado'),
  ('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000e1', '2025-06-20', 1, 'un', 55, 'validado'),
  ('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000e1', '2025-12-05', 1, 'un', 30, 'validado'),
  ('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000e1', '2026-02-05', 1, 'un', 60, 'validado'),
  ('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000e1', '2026-05-05', 1, 'un', 60, 'validado');
select set_config('app.conferido', '', false);

create temporary table _a as
select * from acumulado_anual_insumo('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000e1', 1200);

\echo '== Acumulado do ano'
select pg_temp.ok('primeiro mês do ano é a base (sem variação)',
  (select status_acumulado = 'sem_base' and acumulado_pct is null and mes_base = '2025-03-01' from _a where mes = '2025-03-01'));
select pg_temp.ok('junho/2025: média R$ 50 contra R$ 40 de março = +25%',
  (select status_acumulado = 'subiu' and acumulado_pct = 25 and media_base = 40 and custo_medio = 50 from _a where mes = '2025-06-01'),
  (select acumulado_pct::text from _a where mes = '2025-06-01'));
select pg_temp.ok('dezembro/2025: R$ 30 contra R$ 40 de março = −25%',
  (select status_acumulado = 'caiu' and acumulado_pct = -25 from _a where mes = '2025-12-01'));
select pg_temp.ok('o ano novo recomeça a base (fevereiro/2026)',
  (select status_acumulado = 'sem_base' and mes_base = '2026-02-01' from _a where mes = '2026-02-01'));
select pg_temp.ok('maio/2026 igual à base do ano = estável',
  (select status_acumulado = 'estavel' and acumulado_pct = 0 from _a where mes = '2026-05-01'));
select pg_temp.ok('a janela de meses filtra a saída mas não muda a base',
  (select count(*) = 0 from acumulado_anual_insumo('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000e1', 1)
    where mes < date_trunc('month', calc.hoje_casa())::date));

-- produção não vê custos
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
  perform * from acumulado_anual_insumo('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000e1');
  raise exception 'FALHOU: produção viu o acumulado';
exception when insufficient_privilege then raise notice 'OK  produção não vê o acumulado';
end $$;
\echo '== ACUMULADO ANUAL OK'
