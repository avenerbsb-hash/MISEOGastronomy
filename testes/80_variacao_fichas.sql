-- Variação e histórico de custo das fichas (migração 0007). Rodar no banco de aceite, depois do 60.
\set ON_ERROR_STOP on
set client_min_messages = notice;
set timezone = 'America/Sao_Paulo';
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.ok(p_nome text, p_cond boolean, p_detalhe text default '') returns void
language plpgsql as $$ begin
  if p_cond is not true then raise exception 'FALHOU: % %', p_nome, p_detalhe; end if;
  raise notice 'OK  %  %', p_nome, p_detalhe;
end $$;

create temporary table _antes as
select * from variacao_fichas('00000000-0000-0000-0000-0000000000e1');

\echo '== Variação das fichas'
select pg_temp.ok('lista as receitas com custo (inclui Fitzgerald e xarope)',
  (select count(*) >= 2 from _antes where receita_id in ('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000d4')));
select pg_temp.ok('custo atual igual ao custo_receita',
  (select round(custo_atual, 4) = round(custo_receita('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000e1'), 4)
     from _antes where receita_id = '00000000-0000-0000-0000-0000000000d5'));

-- gin sobe hoje no Alma
insert into historico_precos (insumo_id, estabelecimento_id, data_compra, quantidade, unidade, valor_total, status)
values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e1', current_date, 750, 'ml', 150, 'validado');

create temporary table _depois as
select * from variacao_fichas('00000000-0000-0000-0000-0000000000e1');

select pg_temp.ok('Fitzgerald: gin mais caro → ▲ vermelho com data de hoje',
  (select sinal = 'vermelho' and variacao_pct > 0 and data_referencia = current_date
     from _depois where receita_id = '00000000-0000-0000-0000-0000000000d5'),
  (select sinal || ' ' || variacao_pct || '%' from _depois where receita_id = '00000000-0000-0000-0000-0000000000d5'));
select pg_temp.ok('Fitzgerald: custo anterior = custo de antes da compra',
  (select round(d.custo_anterior, 4) = round(a.custo_atual, 4)
     from _depois d join _antes a using (receita_id) where receita_id = '00000000-0000-0000-0000-0000000000d5'));
select pg_temp.ok('xarope (sem gin) não muda',
  (select d.custo_atual = a.custo_atual and d.data_referencia is not distinct from a.data_referencia
     from _depois d join _antes a using (receita_id) where receita_id = '00000000-0000-0000-0000-0000000000d4'));
select pg_temp.ok('filtro por tipo: só fichas finais',
  not exists (select 1 from variacao_fichas('00000000-0000-0000-0000-0000000000e1', 'final') v
               join receitas r on r.id = v.receita_id where r.tipo <> 'final'));

\echo '== Histórico de custo'
select pg_temp.ok('última linha do histórico do Fitzgerald é a compra de hoje, com o gin',
  (select data = current_date and sinal = 'vermelho' and insumos like '%Gin%'
     from historico_custo_receita('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000e1')
    order by data desc limit 1));
select pg_temp.ok('histórico só tem datas em que o custo mudou',
  not exists (select 1 from historico_custo_receita('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000e1')
               where custo_anterior is not null and custo = custo_anterior));
select pg_temp.ok('custo final do histórico = custo atual',
  (select round(custo, 4) = round(custo_receita('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000e1'), 4)
     from historico_custo_receita('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000e1')
    order by data desc limit 1));

\echo '== Permissões'
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$ begin
  perform * from variacao_fichas('00000000-0000-0000-0000-0000000000e1');
  raise exception 'FALHOU: produção viu variação de custo';
exception when insufficient_privilege then raise notice 'OK  produção não vê variação de custo';
end $$;
do $$ begin
  perform * from historico_custo_receita('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000e1');
  raise exception 'FALHOU: produção viu histórico de custo';
exception when insufficient_privilege then raise notice 'OK  produção não vê histórico de custo';
end $$;
\echo '== VARIAÇÃO FICHAS OK'
