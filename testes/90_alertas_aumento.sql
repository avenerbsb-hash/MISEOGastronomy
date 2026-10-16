-- Alertas de aumento de custo (migração 0008). Rodar no banco de aceite, depois do 80.
\set ON_ERROR_STOP on
set client_min_messages = notice;
set timezone = 'America/Sao_Paulo';
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.ok(p_nome text, p_cond boolean, p_detalhe text default '') returns void
language plpgsql as $$ begin
  if p_cond is not true then raise exception 'FALHOU: % %', p_nome, p_detalhe; end if;
  raise notice 'OK  %  %', p_nome, p_detalhe;
end $$;

-- gin dobra de preço hoje no Alma (em cima da compra do teste 80)
insert into historico_precos (insumo_id, estabelecimento_id, data_compra, quantidade, unidade, valor_total, status)
values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e1', current_date, 750, 'ml', 300, 'validado');

\echo '== Alertas de insumos'
select pg_temp.ok('gin aparece com alta acima de 10%',
  (select variacao_pct > 10 and data_referencia = current_date
     from alertas_insumos('00000000-0000-0000-0000-0000000000e1') where insumo_id = '00000000-0000-0000-0000-0000000000c2'),
  (select variacao_pct || '%' from alertas_insumos('00000000-0000-0000-0000-0000000000e1') where insumo_id = '00000000-0000-0000-0000-0000000000c2'));
select pg_temp.ok('gin lista o Fitzgerald entre as fichas afetadas',
  (select qtd_fichas >= 1 and receitas @> '[{"id": "00000000-0000-0000-0000-0000000000d5"}]'
     from alertas_insumos('00000000-0000-0000-0000-0000000000e1') where insumo_id = '00000000-0000-0000-0000-0000000000c2'));
select pg_temp.ok('só entra alta acima do limite',
  not exists (select 1 from alertas_insumos('00000000-0000-0000-0000-0000000000e1') where variacao_pct <= 10)
  and not exists (select 1 from alertas_insumos('00000000-0000-0000-0000-0000000000e1', 1000)));

\echo '== Alertas de fichas'
select pg_temp.ok('Fitzgerald aparece com alta acima de 10%, puxada pelo gin',
  (select variacao_pct > 10 and tipo = 'final' and insumos like '%Gin%'
     from alertas_fichas('00000000-0000-0000-0000-0000000000e1') where receita_id = '00000000-0000-0000-0000-0000000000d5'));
select pg_temp.ok('custos iguais aos de variacao_fichas',
  (select a.custo_atual = v.custo_atual and a.custo_anterior = v.custo_anterior
     from alertas_fichas('00000000-0000-0000-0000-0000000000e1') a
     join variacao_fichas('00000000-0000-0000-0000-0000000000e1') v using (receita_id)
    where receita_id = '00000000-0000-0000-0000-0000000000d5'));
select pg_temp.ok('CMV antes e depois coerentes com o preço de venda',
  not exists (select 1 from alertas_fichas('00000000-0000-0000-0000-0000000000e1')
               where preco_venda is not null
                 and (cmv_atual_pct <> round(100 * custo_atual / preco_venda, 1) or cmv_atual_pct <= cmv_anterior_pct)));
select pg_temp.ok('xarope (sem gin) não entra',
  not exists (select 1 from alertas_fichas('00000000-0000-0000-0000-0000000000e1') where receita_id = '00000000-0000-0000-0000-0000000000d4'));

\echo '== Permissões'
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$ begin
  perform * from alertas_insumos('00000000-0000-0000-0000-0000000000e1');
  raise exception 'FALHOU: produção viu alerta de insumo';
exception when insufficient_privilege then raise notice 'OK  produção não vê alerta de insumo';
end $$;
do $$ begin
  perform * from alertas_fichas('00000000-0000-0000-0000-0000000000e1');
  raise exception 'FALHOU: produção viu alerta de ficha';
exception when insufficient_privilege then raise notice 'OK  produção não vê alerta de ficha';
end $$;
\echo '== ALERTAS OK'
