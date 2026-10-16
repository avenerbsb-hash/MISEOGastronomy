-- Custo do item × média das últimas notas (migração 0017). Rodar no aceite, depois do 102.
\set ON_ERROR_STOP on
set client_min_messages = notice;
set timezone = 'America/Sao_Paulo';
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.ok(p_nome text, p_cond boolean, p_detalhe text default '') returns void
language plpgsql as $$ begin
  if p_cond is not true then raise exception 'FALHOU: % %', p_nome, p_detalhe; end if;
  raise notice 'OK  %  %', p_nome, p_detalhe;
end $$;

-- insumo com 12 compras: 11 a R$ 10 e a última a R$ 16 → média das 10 últimas = (9 × 10 + 16) / 10 = 10,60
select set_config('app.conferido', 'sim', false);
insert into insumos (id, codigo, nome, dimensao) values ('00000000-0000-0000-0000-000000000d01', 'TMN-001', 'Teste média notas', 'contagem');
insert into historico_precos (insumo_id, estabelecimento_id, data_compra, quantidade, unidade, valor_total, status)
select '00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-0000000000e1', date '2026-01-05' + k * 7, 1, 'un',
       case when k = 11 then 16 else 10 end, 'validado'
  from generate_series(0, 11) k;
select set_config('app.conferido', '', false);

-- ficha final: 2 un do insumo
insert into receitas (id, codigo, nome, tipo, dimensao_saida) values ('00000000-0000-0000-0000-000000000d02', 'TMN-F01', 'Ficha teste média', 'final', 'contagem');
insert into versoes_receita (id, receita_id, numero, rendimento_quantidade, rendimento_unidade, motivo_alteracao)
values ('00000000-0000-0000-0000-000000000d03', '00000000-0000-0000-0000-000000000d02', 1, 1, 'un', 'teste');
insert into componentes_receita (versao_id, ordem, insumo_id, quantidade, unidade)
values ('00000000-0000-0000-0000-000000000d03', 1, '00000000-0000-0000-0000-000000000d01', 2, 'un');
select set_config('app.aprovando', 'sim', false);
select set_config('app.motivo', 'teste', false);
update versoes_receita set status = 'aprovada', aprovado_em = now(), vigente_desde = now() - interval '1 day'
 where id = '00000000-0000-0000-0000-000000000d03';
select set_config('app.aprovando', '', false);
insert into cardapios (id, estabelecimento_id, nome, status) values ('00000000-0000-0000-0000-000000000d04', '00000000-0000-0000-0000-0000000000e1', 'Teste média', 'publicado');
insert into itens_cardapio (id, cardapio_id, receita_id) values ('00000000-0000-0000-0000-000000000d05', '00000000-0000-0000-0000-000000000d04', '00000000-0000-0000-0000-000000000d02');

\echo '== Custo × média das últimas notas'
select pg_temp.ok('média das 10 últimas compras do insumo = R$ 10,60',
  calc.custo_insumo_media('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-0000000000e1', 10) = 10.6);
create temporary table _m as select * from custo_vs_media_casa('00000000-0000-0000-0000-0000000000e1', 10)
 where item_id = '00000000-0000-0000-0000-000000000d05';
select pg_temp.ok('ficha: custo atual R$ 32 × média R$ 21,20 = subiu',
  (select custo_atual = 32 and custo_media = 21.2 and status = 'subiu' and round(variacao_pct, 2) = 50.94 from _m),
  (select round(variacao_pct, 2)::text from _m));
select pg_temp.ok('com 1 nota só, a média é a própria última compra (estável)',
  (select status = 'estavel' from custo_vs_media_casa('00000000-0000-0000-0000-0000000000e1', 1)
    where item_id = '00000000-0000-0000-0000-000000000d05'));

do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
  perform * from custo_vs_media_casa('00000000-0000-0000-0000-0000000000e1');
  raise exception 'FALHOU: produção viu o custo';
exception when insufficient_privilege then raise notice 'OK  produção não vê o custo × média';
end $$;
\echo '== CUSTO X MEDIA OK'
