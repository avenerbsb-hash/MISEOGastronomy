-- Estorno de compra validada (migração 0016). Rodar no aceite, depois do 101.
\set ON_ERROR_STOP on
set client_min_messages = notice;
set timezone = 'America/Sao_Paulo';
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.ok(p_nome text, p_cond boolean, p_detalhe text default '') returns void
language plpgsql as $$ begin
  if p_cond is not true then raise exception 'FALHOU: % %', p_nome, p_detalhe; end if;
  raise notice 'OK  %  %', p_nome, p_detalhe;
end $$;

select set_config('app.conferido', 'sim', false);
insert into insumos (id, codigo, nome, dimensao) values ('00000000-0000-0000-0000-000000000c01', 'TEC-001', 'Teste estorno', 'contagem');
insert into historico_precos (insumo_id, estabelecimento_id, data_compra, quantidade, unidade, valor_total, documento_ref, status) values
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000e1', '2026-09-11', 6, 'un', 270, 'NF 1', 'validado'),
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000e1', '2026-10-03', 0.1, 'un', 45, 'NF 2', 'validado'),
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000e2', '2026-10-03', 0.1, 'un', 45, 'NF 2', 'validado');
select set_config('app.conferido', '', false);

\echo '== Estorno de compra validada'
select pg_temp.ok('antes: custo da compra errada R$ 450/un',
  calc.custo_insumo('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000e1') = 450);

do $$ begin
  update historico_precos set status = 'rejeitado' where insumo_id = '00000000-0000-0000-0000-000000000c01' and valor_total = 45
     and estabelecimento_id = '00000000-0000-0000-0000-0000000000e1';
  raise exception 'FALHOU: compra validada mudou sem estorno';
exception when raise_exception then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'OK  compra validada continua imutável fora do estorno';
end $$;

do $$ begin
  perform estornar_compra((select id from historico_precos where insumo_id = '00000000-0000-0000-0000-000000000c01'
                             and estabelecimento_id = '00000000-0000-0000-0000-0000000000e1' and valor_total = 45), '  ');
  raise exception 'FALHOU: estornou sem motivo';
exception when check_violation then raise notice 'OK  motivo obrigatório';
end $$;

do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
  perform estornar_compra((select id from historico_precos where insumo_id = '00000000-0000-0000-0000-000000000c01'
                             and estabelecimento_id = '00000000-0000-0000-0000-0000000000e1' and valor_total = 45), 'teste');
  raise exception 'FALHOU: quem não é administrador estornou';
exception when insufficient_privilege then raise notice 'OK  só administrador estorna';
end $$;

select pg_temp.ok('estorno nas duas casas com correção (1 un por R$ 45)',
  estornar_compra((select id from historico_precos where insumo_id = '00000000-0000-0000-0000-000000000c01'
                     and estabelecimento_id = '00000000-0000-0000-0000-0000000000e1' and valor_total = 45 and quantidade = 0.1),
                  'nota cobrou 0,1 pacote = 1 un', true, 1, 'un', 45) = 2);
select pg_temp.ok('compra errada guardada como rejeitada, com valores intactos e o motivo',
  (select count(*) = 2 and bool_and(quantidade = 0.1 and valor_total = 45 and observacao like '%Estornada por%nota cobrou%')
     from historico_precos where insumo_id = '00000000-0000-0000-0000-000000000c01' and status = 'rejeitado'));
select pg_temp.ok('correção validada nas duas casas, mesma data e nota',
  (select count(*) = 2 and bool_and(data_compra = '2026-10-03' and documento_ref = 'NF 2' and custo_unitario_base = 45)
     from historico_precos where insumo_id = '00000000-0000-0000-0000-000000000c01' and status = 'validado' and quantidade = 1));
select pg_temp.ok('custo volta a R$ 45/un',
  calc.custo_insumo('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000e1') = 45
  and calc.custo_insumo('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000e2') = 45);
select pg_temp.ok('média de outubro recalculada sem a compra errada',
  (select custo_medio = 45 from indicadores_mensais_insumo where insumo_id = '00000000-0000-0000-0000-000000000c01'
     and estabelecimento_id = '00000000-0000-0000-0000-0000000000e1' and mes = '2026-10-01'));
select pg_temp.ok('nenhuma compra foi apagada',
  (select count(*) = 5 from historico_precos where insumo_id = '00000000-0000-0000-0000-000000000c01'));
\echo '== ESTORNO OK'
