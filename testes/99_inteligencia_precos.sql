-- Inteligência de preços v1.0 (migração 0012): testes obrigatórios. Rodar no aceite, depois do 98.
\set ON_ERROR_STOP on
set client_min_messages = notice;
set timezone = 'America/Sao_Paulo';
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.ok(p_nome text, p_cond boolean, p_detalhe text default '') returns void
language plpgsql as $$ begin
  if p_cond is not true then raise exception 'FALHOU: % %', p_nome, p_detalhe; end if;
  raise notice 'OK  %  %', p_nome, p_detalhe;
end $$;

-- datas: mês atual (m0) e anterior (m1) no calendário da casa
create temporary table _d as
select date_trunc('month', calc.hoje_casa())::date as m0,
       (date_trunc('month', calc.hoje_casa()) - interval '1 month')::date as m1;

-- volta ao limite padrão (15%) nas casas de teste
delete from limites_conferencia_preco where categoria_id is null;

insert into categorias (id, nome, escopo) values ('00000000-0000-0000-0000-000000000ac1', 'Teste volátil', 'insumo');
insert into insumos (id, codigo, nome, dimensao, categoria_id) values
  ('00000000-0000-0000-0000-000000000a01', 'TIP-001', 'Teste preço imediato', 'contagem', null),
  ('00000000-0000-0000-0000-000000000a02', 'TIP-002', 'Teste média mensal',   'contagem', '00000000-0000-0000-0000-000000000ac1'),
  ('00000000-0000-0000-0000-000000000a03', 'TIP-003', 'Teste volatilidade',   'contagem', '00000000-0000-0000-0000-000000000ac1'),
  ('00000000-0000-0000-0000-000000000a04', 'TIP-004', 'Teste sem mês anterior','contagem', null),
  ('00000000-0000-0000-0000-000000000a05', 'TIP-005', 'Teste correção',       'contagem', null);
-- categoria "Teste volátil" no Alma aceita até 100% sem conferência
insert into limites_conferencia_preco (estabelecimento_id, categoria_id, limite_pct)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000ac1', 100);

create or replace function pg_temp.compra(p_insumo text, p_estab text, p_data date, p_qtd numeric, p_valor numeric, p_un text default 'un')
returns uuid language sql as $$
  insert into historico_precos (insumo_id, estabelecimento_id, data_compra, quantidade, unidade, valor_total, status)
  values (('00000000-0000-0000-0000-000000000' || p_insumo)::uuid, ('00000000-0000-0000-0000-0000000000' || p_estab)::uuid,
          p_data, p_qtd, p_un, p_valor, 'validado')
  returning id
$$;
create temporary view _ind_e1 as
  select * from indicadores_insumos('00000000-0000-0000-0000-0000000000e1');

\echo '== Quantidade normalizada'
select pg_temp.ok('compras antigas com quantidade_base preenchida',
  not exists (select 1 from historico_precos where quantidade_base is null and custo_unitario_base > 0));

\echo '== 1. Última compra: R$ 40 → R$ 55 = +37,5% (com conferência)'
select pg_temp.compra('a01', 'e1', (select m1 from _d) + 2, 1, 40);
create temporary table _c1 as select pg_temp.compra('a01', 'e1', (select m0 from _d), 1, 55) as id;
select pg_temp.ok('alta de 37,5% acima de 15%: compra fica pendente',
  (select status = 'pendente' from historico_precos where id = (select id from _c1)));
select pg_temp.ok('conferência aberta com variação de 37,5% e limite 15%',
  (select status = 'aberta' and round(variacao_pct, 4) = 37.5 and limite_pct = 15 from conferencias_preco where historico_preco_id = (select id from _c1)));
select pg_temp.ok('enquanto pendente, indicador A = sem comparação e custo oficial R$ 40',
  (select status_ultima = 'sem_comparacao' and custo_oficial = 40 from _ind_e1 where insumo_id = '00000000-0000-0000-0000-000000000a01'));
do $$ begin
  perform resolver_conferencia((select id from conferencias_preco where historico_preco_id = (select id from _c1)), 'aprovar', '  ');
  raise exception 'FALHOU: aprovou sem justificativa';
exception when check_violation then raise notice 'OK  justificativa obrigatória';
end $$;
select resolver_conferencia((select id from conferencias_preco where historico_preco_id = (select id from _c1)), 'aprovar', 'reajuste do fornecedor confirmado');
select pg_temp.ok('aprovada: A = +37,5% (subiu) e custo oficial R$ 55',
  (select status_ultima = 'subiu' and variacao_ultima_pct = 37.5 and custo_oficial = 55 from _ind_e1 where insumo_id = '00000000-0000-0000-0000-000000000a01'),
  (select variacao_ultima_pct::text from _ind_e1 where insumo_id = '00000000-0000-0000-0000-000000000a01'));
select pg_temp.ok('conferência registra responsável e justificativa',
  (select status = 'aprovada' and resolvido_por = '00000000-0000-0000-0000-0000000000a1' and justificativa like 'reajuste%'
     from conferencias_preco where historico_preco_id = (select id from _c1)));

\echo '== 2. Tendência mensal: média R$ 40 → R$ 43,75 = +9,375%'
select pg_temp.compra('a02', 'e1', (select m1 from _d) + 3, 10, 400);
select pg_temp.compra('a02', 'e1', (select m0 from _d), 10, 400);
select pg_temp.compra('a02', 'e1', (select m0 from _d), 10, 475);
select pg_temp.ok('média ponderada do mês = 43,75 e do mês anterior = 40',
  (select media_mes = 43.75 and media_mes_anterior = 40 from _ind_e1 where insumo_id = '00000000-0000-0000-0000-000000000a02'));
select pg_temp.ok('B = +9,375% (subiu), sem arredondar',
  (select status_mensal = 'subiu' and variacao_mensal_pct = 9.375 from _ind_e1 where insumo_id = '00000000-0000-0000-0000-000000000a02'),
  (select variacao_mensal_pct::text from _ind_e1 where insumo_id = '00000000-0000-0000-0000-000000000a02'));
select pg_temp.ok('mês atual marcado como não encerrado; anterior encerrado',
  (select not mes_encerrado from _ind_e1 where insumo_id = '00000000-0000-0000-0000-000000000a02')
  and (select mes_encerrado from indicadores_insumos('00000000-0000-0000-0000-0000000000e1', (select m1 from _d)) where insumo_id = '00000000-0000-0000-0000-000000000a02'));

\echo '== 3. Volatilidade: menor R$ 40, maior R$ 55 = 37,5%'
select pg_temp.compra('a03', 'e1', (select m0 from _d), 1, 40);
select pg_temp.compra('a03', 'e1', (select m0 from _d), 1, 55);
select pg_temp.ok('C = 37,5% com 2 compras',
  (select status_volatilidade = 'ok' and volatilidade_pct = 37.5 and compras_mes = 2 from _ind_e1 where insumo_id = '00000000-0000-0000-0000-000000000a03'));
select pg_temp.ok('tabela mensal: menor 40, maior 55, média 47,5',
  (select menor_custo = 40 and maior_custo = 55 and custo_medio = 47.5 from indicadores_mensais_insumo
    where insumo_id = '00000000-0000-0000-0000-000000000a03' and estabelecimento_id = '00000000-0000-0000-0000-0000000000e1'));

\echo '== 4. Compra suspeita pendente não altera custo oficial, CMV nem médias'
create temporary table _antes4 as
select custo_receita('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000e1') as ficha,
       calc.custo_insumo('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e1') as gin,
       (select custo_medio from indicadores_mensais_insumo where insumo_id = '00000000-0000-0000-0000-0000000000c2'
          and estabelecimento_id = '00000000-0000-0000-0000-0000000000e1' and mes = (select m0 from _d)) as media;
create temporary table _c4 as
select pg_temp.compra('0c2', 'e1', calc.hoje_casa(), 750, 5000, 'ml') as id;   -- gin a R$ 5.000 a garrafa
select pg_temp.ok('gin suspeito fica pendente com conferência aberta',
  (select h.status = 'pendente' and c.status = 'aberta' from historico_precos h join conferencias_preco c on c.historico_preco_id = h.id
    where h.id = (select id from _c4)));
select pg_temp.ok('custo oficial do gin, custo da ficha e média do mês não mudam',
  (select calc.custo_insumo('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e1') = a.gin
          and custo_receita('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000e1') = a.ficha
          and (select custo_medio from indicadores_mensais_insumo where insumo_id = '00000000-0000-0000-0000-0000000000c2'
                 and estabelecimento_id = '00000000-0000-0000-0000-0000000000e1' and mes = (select m0 from _d)) is not distinct from a.media
     from _antes4 a));
select resolver_conferencia((select id from conferencias_preco where historico_preco_id = (select id from _c4)), 'rejeitar', 'erro de digitação na nota');
select pg_temp.ok('rejeitada: compra não entra no custo e conferência fechada',
  (select h.status = 'rejeitado' and c.status = 'rejeitada' from historico_precos h join conferencias_preco c on c.historico_preco_id = h.id
    where h.id = (select id from _c4)));

\echo '== 5. Sem compra no mês anterior: sem variação mensal fictícia'
select pg_temp.compra('a04', 'e1', (select m0 from _d), 1, 30);
select pg_temp.ok('B = sem base mensal, sem percentual; C indisponível com 1 compra',
  (select status_mensal = 'sem_base' and variacao_mensal_pct is null and status_volatilidade = 'indisponivel' and volatilidade_pct is null
     from _ind_e1 where insumo_id = '00000000-0000-0000-0000-000000000a04'));
select pg_temp.ok('insumo sem nenhuma compra = sem preço',
  (select status_ultima = 'sem_preco' and custo_oficial is null from _ind_e1 where insumo_id = '00000000-0000-0000-0000-000000000a05'));

\echo '== 6. Uma casa não afeta a outra'
create temporary table _antes6 as select * from _ind_e1 where insumo_id = '00000000-0000-0000-0000-000000000a01';
select pg_temp.compra('a01', 'e2', (select m0 from _d), 1, 100);
select pg_temp.ok('compra no Giuli não muda os indicadores do Alma',
  (select n.ultimo_preco = a.ultimo_preco and n.variacao_ultima_pct = a.variacao_ultima_pct and n.media_mes is not distinct from a.media_mes
     from _ind_e1 n join _antes6 a using (insumo_id)));
select pg_temp.ok('Giuli tem os próprios indicadores (1 compra: sem comparação)',
  (select status_ultima = 'sem_comparacao' and ultimo_preco = 100
     from indicadores_insumos('00000000-0000-0000-0000-0000000000e2') where insumo_id = '00000000-0000-0000-0000-000000000a01'));

\echo '== Correção na conferência'
select pg_temp.compra('a05', 'e1', (select m1 from _d) + 4, 1, 40);
create temporary table _c5 as select pg_temp.compra('a05', 'e1', (select m0 from _d), 1, 440) as id;  -- digitou 440 em vez de 44
select resolver_conferencia((select id from conferencias_preco where historico_preco_id = (select id from _c5)), 'corrigir',
                            'valor digitado errado (era R$ 44)', 1, 'un', 44);
select pg_temp.ok('original rejeitado, correção validada e conferência corrigida',
  (select h.status = 'rejeitado' and c.status = 'corrigida' and n.status = 'validado' and n.valor_total = 44
     from historico_precos h join conferencias_preco c on c.historico_preco_id = h.id join historico_precos n on n.id = c.registro_corrigido_id
    where h.id = (select id from _c5)));
select pg_temp.ok('A após a correção = +10%; pendente/rejeitado fora da média do mês',
  (select variacao_ultima_pct = 10 and media_mes = 44 and compras_mes = 1 from _ind_e1 where insumo_id = '00000000-0000-0000-0000-000000000a05'));
select pg_temp.ok('limite por categoria: alta de 37,5% na categoria com limite 100% não gera conferência',
  not exists (select 1 from conferencias_preco where insumo_id = '00000000-0000-0000-0000-000000000a03'));

\echo '== Histórico mensal'
select pg_temp.ok('histórico do insumo da média: 2 meses, mês atual +9,375% contra o anterior',
  (select count(*) = 2 and bool_or(status_mensal = 'subiu' and variacao_mensal_pct = 9.375 and not mes_encerrado)
          and bool_or(status_mensal = 'sem_base' and mes_encerrado)
     from historico_mensal_insumo('00000000-0000-0000-0000-000000000a02', '00000000-0000-0000-0000-0000000000e1')));

\echo '== Permissões'
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$ begin
  perform * from indicadores_insumos('00000000-0000-0000-0000-0000000000e1');
  raise exception 'FALHOU: produção viu indicadores de preço';
exception when insufficient_privilege then raise notice 'OK  produção não vê indicadores de preço';
end $$;
\echo '== INTELIGÊNCIA DE PREÇOS OK'
