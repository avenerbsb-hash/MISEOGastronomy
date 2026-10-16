-- Estrutura de custos & taxas e resultado na ponta (migração 0013). Rodar no aceite, depois do 99.
\set ON_ERROR_STOP on
set client_min_messages = notice;
set timezone = 'America/Sao_Paulo';
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.ok(p_nome text, p_cond boolean, p_detalhe text default '') returns void
language plpgsql as $$ begin
  if p_cond is not true then raise exception 'FALHOU: % %', p_nome, p_detalhe; end if;
  raise notice 'OK  %  %', p_nome, p_detalhe;
end $$;

\echo '== Estrutura padrão'
select pg_temp.ok('sem configuração: padrão da planilha, total 49,7%',
  (select total_pct = 49.7 and variaveis_pct = 11.2 and estrutura_pct = 33.5 and investimento_lucro_pct = 5 and not personalizada
     from estrutura_custos('00000000-0000-0000-0000-0000000000e1')));

create temporary table _r as select * from resultado_itens_casa('00000000-0000-0000-0000-0000000000e1');
\echo '== Resultado na ponta'
select pg_temp.ok('há itens com preço e custo', (select count(*) > 0 from _r where situacao <> 'sem_dados'));
select pg_temp.ok('resultado = preço − custo − 11,2% − 33,5% do preço',
  not exists (select 1 from _r where situacao <> 'sem_dados'
               and abs(resultado - (preco - custo - preco * 0.112 - preco * 0.335)) > 0.02));
select pg_temp.ok('margem de contribuição = preço − custo − variáveis',
  not exists (select 1 from _r where situacao <> 'sem_dados' and abs(margem_contribuicao - (preco - custo - variaveis_valor)) > 0.02));
select pg_temp.ok('no preço ideal (sem arredondar) o resultado é o alvo de 5%',
  not exists (select 1 from _r where preco_ideal > 0
               and abs(100 * (preco_ideal - custo - preco_ideal * 0.447) / preco_ideal - 5) > 0.05));
select pg_temp.ok('situação coerente (prejuízo < 0; abaixo do alvo < 5%)',
  not exists (select 1 from _r where (situacao = 'prejuizo' and resultado >= 0)
                                  or (situacao = 'abaixo_do_alvo' and (resultado < 0 or resultado_pct >= 5))
                                  or (situacao = 'ok' and resultado_pct < 4.95)));

\echo '== Demonstrativo'
select pg_temp.ok('demonstrativo fecha: preço + linhas = resultado',
  (select abs(sum(valor) filter (where tipo in ('total','custo','variavel','estrutura')) - max(valor) filter (where tipo = 'resultado')) <= 0.05
     from demonstrativo_item((select item_id from _r where situacao <> 'sem_dados' limit 1))));

\echo '== Configuração por casa'
insert into estrutura_custos_casa (estabelecimento_id, impostos_pct, cartao_pct, gorjeta_pct, ifood_pct, comissoes_pct, outras_pct,
                                   despesas_fixas_pct, despesa_financeira_pct, investimento_lucro_pct)
values ('00000000-0000-0000-0000-0000000000e1', 10, 3, 0, 0, 0, 0, 25, 2, 10);
select pg_temp.ok('Alma personalizado: total 50%',
  (select total_pct = 50 and personalizada from estrutura_custos('00000000-0000-0000-0000-0000000000e1')));
select pg_temp.ok('outra casa continua no padrão',
  (select total_pct = 49.7 and not personalizada from estrutura_custos('00000000-0000-0000-0000-0000000000e2')));
select pg_temp.ok('resultado recalculado com a nova estrutura (13% + 27%)',
  not exists (select 1 from resultado_itens_casa('00000000-0000-0000-0000-0000000000e1') where situacao <> 'sem_dados'
               and abs(resultado - (preco - custo - preco * 0.40)) > 0.02));
do $$ begin
  update estrutura_custos_casa set despesas_fixas_pct = 90 where estabelecimento_id = '00000000-0000-0000-0000-0000000000e1';
  raise exception 'FALHOU: aceitou deduções de 100%% ou mais';
exception when check_violation then raise notice 'OK  deduções somando 100%% ou mais são recusadas';
end $$;
delete from estrutura_custos_casa;

\echo '== Permissões'
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$ begin
  perform * from resultado_itens_casa('00000000-0000-0000-0000-0000000000e1');
  raise exception 'FALHOU: produção viu o resultado';
exception when insufficient_privilege then raise notice 'OK  produção não vê o resultado na ponta';
end $$;
\echo '== ESTRUTURA DE CUSTOS OK'
