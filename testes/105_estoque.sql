-- Estoque: itens, contagem e pedido semanal (migração 0019). Rodar no aceite, depois do 104.
\set ON_ERROR_STOP on
set client_min_messages = notice;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.ok(p_nome text, p_cond boolean, p_detalhe text default '') returns void
language plpgsql as $$ begin
  if p_cond is not true then raise exception 'FALHOU: % %', p_nome, p_detalhe; end if;
  raise notice 'OK  %  %', p_nome, p_detalhe;
end $$;

-- gin: R$ 100 a garrafa de 1 L (R$ 0,10/mL); vodka sem preço
select set_config('app.conferido', 'sim', false);
insert into insumos (id, codigo, nome, dimensao) values
  ('00000000-0000-0000-0000-000000000f01', 'TES-001', 'Teste estoque gin', 'volume'),
  ('00000000-0000-0000-0000-000000000f02', 'TES-002', 'Teste estoque vodka', 'volume'),
  ('00000000-0000-0000-0000-000000000f03', 'TES-003', 'Teste estoque fora', 'volume');
insert into historico_precos (insumo_id, estabelecimento_id, data_compra, quantidade, unidade, valor_total, status)
values ('00000000-0000-0000-0000-000000000f01', '00000000-0000-0000-0000-0000000000e1', '2026-09-01', 1, 'l', 100, 'validado');
select set_config('app.conferido', '', false);

insert into estoque_itens (estabelecimento_id, insumo_id, unidade_compra, conteudo, estoque_minimo) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000f01', 'garrafa', 1000, 6),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000f02', 'garrafa', 1000, 2);

\echo '== Estoque'
select pg_temp.ok('sem contagem: pedir o mínimo inteiro',
  (select pedir = 6 and atual is null from pedido_semanal('00000000-0000-0000-0000-0000000000e1') where insumo_id = '00000000-0000-0000-0000-000000000f01'));

select registrar_contagem('00000000-0000-0000-0000-0000000000e1',
  '[{"insumo_id":"00000000-0000-0000-0000-000000000f01","deposito":3,"bar":1},{"insumo_id":"00000000-0000-0000-0000-000000000f02","deposito":5,"bar":0},{"insumo_id":"00000000-0000-0000-0000-000000000f03","deposito":9,"bar":9}]',
  'contagem de segunda', '2026-10-12');
select pg_temp.ok('item fora do controle da casa não entra na contagem',
  (select count(*) = 2 from contagem_itens ci join contagens_estoque c on c.id = ci.contagem_id
    where c.estabelecimento_id = '00000000-0000-0000-0000-0000000000e1' and ci.insumo_id::text like '00000000-0000-0000-0000-000000000f0%'));
create temporary table _p as select * from pedido_semanal('00000000-0000-0000-0000-0000000000e1');
select pg_temp.ok('gin: 3 + 1 = 4, mínimo 6 → pedir 2 garrafas, R$ 200 estimado',
  (select atual = 4 and deposito = 3 and bar = 1 and pedir = 2 and valor_estimado = 200 from _p where insumo_id = '00000000-0000-0000-0000-000000000f01'));
select pg_temp.ok('vodka acima do mínimo: pedir 0 (nunca negativo); sem preço, sem valor',
  (select pedir = 0 and valor_estimado is null from _p where insumo_id = '00000000-0000-0000-0000-000000000f02'));

-- nova contagem só do gin: vale a mais recente; a vodka segue com a anterior
select registrar_contagem('00000000-0000-0000-0000-0000000000e1',
  '[{"insumo_id":"00000000-0000-0000-0000-000000000f01","deposito":0,"bar":1}]', null, '2026-10-16');
select pg_temp.ok('última contagem vale: gin 1 → pedir 5; vodka segue 5',
  (select bool_and(case when insumo_id = '00000000-0000-0000-0000-000000000f01' then atual = 1 and pedir = 5 and data_contagem = '2026-10-16'
                        else atual = 5 and data_contagem = '2026-10-12' end)
     from pedido_semanal('00000000-0000-0000-0000-0000000000e1') where insumo_id::text like '00000000-0000-0000-0000-000000000f0%'));

do $$ begin
  perform registrar_contagem('00000000-0000-0000-0000-0000000000e1', '[{"insumo_id":"00000000-0000-0000-0000-000000000f03","deposito":1}]');
  raise exception 'FALHOU: contagem sem item controlado';
exception when check_violation then raise notice 'OK  contagem precisa de item controlado';
end $$;

-- produção conta e vê o pedido, mas sem valor em R$
do $$ declare v numeric; begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
  perform registrar_contagem('00000000-0000-0000-0000-0000000000e1', '[{"insumo_id":"00000000-0000-0000-0000-000000000f01","deposito":2,"bar":0}]');
  select valor_estimado into v from pedido_semanal('00000000-0000-0000-0000-0000000000e1') where insumo_id = '00000000-0000-0000-0000-000000000f01';
  if v is not null then raise exception 'FALHOU: produção viu valor em R$'; end if;
  raise notice 'OK  produção conta e vê o pedido sem R$';
end $$;
-- melhor fornecedor (0020): A a R$ 100/L e B a R$ 90/L → melhor é B, 10% mais barato que o pior
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into fornecedores (id, nome) values ('00000000-0000-0000-0000-000000000fa1', 'Teste Fornecedor A'), ('00000000-0000-0000-0000-000000000fb1', 'Teste Fornecedor B');
select set_config('app.conferido', 'sim', false);
insert into historico_precos (insumo_id, estabelecimento_id, fornecedor_id, data_compra, quantidade, unidade, valor_total, status) values
  ('00000000-0000-0000-0000-000000000f01', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000fa1', '2026-10-01', 2, 'l', 200, 'validado'),
  ('00000000-0000-0000-0000-000000000f01', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000fb1', '2026-10-05', 1, 'l', 90, 'validado');
select set_config('app.conferido', '', false);
select pg_temp.ok('melhor fornecedor do gin: B, R$ 90 a garrafa, 10% mais barato',
  (select fornecedor = 'Teste Fornecedor B' and fornecedores = 2 and round(preco_unidade_compra, 2) = 90 and economia_pct = 10
     from melhores_fornecedores_estoque('00000000-0000-0000-0000-0000000000e1') where insumo_id = '00000000-0000-0000-0000-000000000f01'));
do $$ declare r record; begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
  select * into r from melhores_fornecedores_estoque('00000000-0000-0000-0000-0000000000e1') where insumo_id = '00000000-0000-0000-0000-000000000f01';
  if r.fornecedor is distinct from 'Teste Fornecedor B' or r.preco_unidade_compra is not null then raise exception 'FALHOU: produção e melhor fornecedor'; end if;
  raise notice 'OK  produção vê o melhor fornecedor, sem preço';
end $$;
\echo '== ESTOQUE OK'
