-- Prévia da compra (migração 0018). Rodar no aceite, depois do 103.
\set ON_ERROR_STOP on
set client_min_messages = notice;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.ok(p_nome text, p_cond boolean, p_detalhe text default '') returns void
language plpgsql as $$ begin
  if p_cond is not true then raise exception 'FALHOU: % %', p_nome, p_detalhe; end if;
  raise notice 'OK  %  %', p_nome, p_detalhe;
end $$;

select set_config('app.conferido', 'sim', false);
insert into insumos (id, codigo, nome, dimensao) values ('00000000-0000-0000-0000-000000000e01', 'TPC-001', 'Teste prévia', 'massa');
insert into historico_precos (insumo_id, estabelecimento_id, data_compra, quantidade, unidade, valor_total, status)
values ('00000000-0000-0000-0000-000000000e01', '00000000-0000-0000-0000-0000000000e1', '2026-09-01', 1, 'kg', 10, 'validado');
select set_config('app.conferido', '', false);

\echo '== Prévia da compra'
select pg_temp.ok('2 kg por R$ 22 = R$ 0,011/g, +10%, dentro do limite',
  (select round(custo_base, 4) = 0.011 and round(variacao_pct, 1) = 10 and not vai_conferir
     from previa_compra('00000000-0000-0000-0000-000000000e01', '00000000-0000-0000-0000-0000000000e1', 2, 'kg', 22)));
select pg_temp.ok('500 g por R$ 10 = +100%: vai para a conferência',
  (select vai_conferir from previa_compra('00000000-0000-0000-0000-000000000e01', '00000000-0000-0000-0000-0000000000e1', 500, 'g', 10)));
select pg_temp.ok('unidade de outra medida não dá prévia',
  (select count(*) = 0 from previa_compra('00000000-0000-0000-0000-000000000e01', '00000000-0000-0000-0000-0000000000e1', 1, 'l', 10)));
select pg_temp.ok('a prévia não grava nada',
  (select count(*) = 1 from historico_precos where insumo_id = '00000000-0000-0000-0000-000000000e01'));
\echo '== PREVIA COMPRA OK'
