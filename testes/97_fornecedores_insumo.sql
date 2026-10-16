-- Melhor e pior fornecedor de um insumo (migração 0010). Rodar no aceite, depois do 95.
\set ON_ERROR_STOP on
set client_min_messages = notice;
set timezone = 'America/Sao_Paulo';
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.ok(p_nome text, p_cond boolean, p_detalhe text default '') returns void
language plpgsql as $$ begin
  if p_cond is not true then raise exception 'FALHOU: % %', p_nome, p_detalhe; end if;
  raise notice 'OK  %  %', p_nome, p_detalhe;
end $$;

insert into fornecedores (id, nome) values
  ('00000000-0000-0000-0000-0000000009f1', 'Atacado Barato'),
  ('00000000-0000-0000-0000-0000000009f2', 'Empório Caro'),
  ('00000000-0000-0000-0000-0000000009f3', 'Mercado Médio');

-- açúcar no Alma: Barato R$ 4/kg (2 compras), Caro R$ 8/kg, Médio R$ 5 e R$ 7/kg (média ponderada 6,33)
insert into historico_precos (insumo_id, estabelecimento_id, fornecedor_id, data_compra, quantidade, unidade, valor_total, status) values
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000009f1', current_date - 5, 5, 'kg', 20, 'validado'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000009f1', current_date - 4, 5, 'kg', 20, 'validado'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000009f2', current_date - 3, 5, 'kg', 40, 'validado'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000009f3', current_date - 2, 1, 'kg', 5,  'validado'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000009f3', current_date - 1, 2, 'kg', 14, 'validado'),
  -- pendente e referência não contam
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000009f1', current_date, 5, 'kg', 1, 'pendente');
insert into historico_precos (insumo_id, estabelecimento_id, fornecedor_id, data_compra, quantidade, unidade, valor_total, fonte, status)
values ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000009f2', current_date, 5, 'kg', 1, 'referencia', 'validado');

create temporary table _f as
select * from fornecedores_do_insumo('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000e1');

\echo '== Fornecedores do insumo'
select pg_temp.ok('melhor = Atacado Barato a R$ 4/kg em 2 compras',
  (select posicao = 'melhor' and compras = 2 and round(custo_medio * 1000, 2) = 4 from _f where fornecedor = 'Atacado Barato'));
select pg_temp.ok('pior = Empório Caro a R$ 8/kg, economia de 50% no melhor',
  (select posicao = 'pior' and round(custo_medio * 1000, 2) = 8 and economia_pct = 50 from _f where fornecedor = 'Empório Caro'));
select pg_temp.ok('Mercado Médio: média ponderada R$ 6,33/kg, intermediário',
  (select posicao = 'intermediario' and round(custo_medio * 1000, 2) = 6.33 and compras = 2 from _f where fornecedor = 'Mercado Médio'));
select pg_temp.ok('pendente e preço de referência não entram',
  (select sum(compras) from _f where fornecedor <> 'Fornecedor não informado') = 5);
select pg_temp.ok('limite de compras: só as 2 últimas → só Mercado Médio, único',
  (select count(*) = 1 and bool_and(posicao = 'unico')
     from fornecedores_do_insumo('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000e1', 2)));

\echo '== Permissões'
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$ begin
  perform * from fornecedores_do_insumo('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000e1');
  raise exception 'FALHOU: produção viu preço por fornecedor';
exception when insufficient_privilege then raise notice 'OK  produção não vê preço por fornecedor';
end $$;
\echo '== FORNECEDORES OK'
