-- CMV de referência por item (rodar depois de 10_casos_de_aceite.sql, mesmo banco)
\set ON_ERROR_STOP on
set timezone = 'America/Sao_Paulo';
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
create or replace function pg_temp.ok(p_nome text, p_cond boolean, p_detalhe text default '') returns void
language plpgsql as $$ begin
  if p_cond is not true then raise exception 'FALHOU: % %', p_nome, p_detalhe; end if;
  raise notice 'OK  %  %', p_nome, p_detalhe;
end $$;
\echo '== CMV de referência por item (mojito 9% numa casa com meta de 30%)'
insert into insumos (id, codigo, nome, dimensao) values
  ('00000000-0000-0000-0000-0000000000c7', 'TST-002', 'Kit mojito (teste)', 'contagem');
insert into historico_precos (insumo_id, estabelecimento_id, data_compra, quantidade, unidade, valor_total, status)
values ('00000000-0000-0000-0000-0000000000c7', '00000000-0000-0000-0000-0000000000e1', '2026-09-01', 1, 'un', 3.42, 'validado');
insert into receitas (id, codigo, nome, tipo, dimensao_saida)
values ('00000000-0000-0000-0000-0000000000d7', 'FIN-004', 'Mojito', 'final', 'contagem');
insert into versoes_receita (id, receita_id, numero, rendimento_quantidade, rendimento_unidade)
values ('00000000-0000-0000-0000-0000000000b7', '00000000-0000-0000-0000-0000000000d7', 1, 1, 'un');
insert into componentes_receita (versao_id, insumo_id, quantidade, unidade)
values ('00000000-0000-0000-0000-0000000000b7', '00000000-0000-0000-0000-0000000000c7', 1, 'un');
select aprovar_versao('00000000-0000-0000-0000-0000000000b7', 'mojito', '2026-09-01');
insert into itens_cardapio (id, cardapio_id, receita_id)            -- sem CMV-alvo manual
values ('00000000-0000-0000-0000-00000000003a', '00000000-0000-0000-0000-00000000001c', '00000000-0000-0000-0000-0000000000d7');

select pg_temp.ok('antes do preço: referência = padrão da casa (30%)',
  (select origem_referencia = 'padrao_casa' and cmv_alvo_pct = 30 and situacao = 'sem_preco'
     from painel_cmv('00000000-0000-0000-0000-0000000000e1', '2026-09-01 12:00')
    where item_id = '00000000-0000-0000-0000-00000000003a'));

select aprovar_preco('00000000-0000-0000-0000-00000000003a', 38.00, 'arquitetura de cardápio', '2026-09-02');
select pg_temp.ok('preço R$ 38 aprovado: referência do mojito vira 9,0%',
  (select origem_referencia = 'preco_aprovado' and cmv_alvo_pct = 9.0 and situacao = 'ok'
     from painel_cmv('00000000-0000-0000-0000-0000000000e1', '2026-09-15')
    where item_id = '00000000-0000-0000-0000-00000000003a'));

-- Rum sobe: custo do mojito 3,42 → 4,00
insert into historico_precos (insumo_id, estabelecimento_id, data_compra, quantidade, unidade, valor_total, status)
values ('00000000-0000-0000-0000-0000000000c7', '00000000-0000-0000-0000-0000000000e1', '2026-10-10', 1, 'un', 4.00, 'validado');
select pg_temp.ok('alerta compara com 9%, não com 30% (CMV atual 10,5%)',
  (select situacao = 'acima_do_alvo' and cmv_atual_pct = 10.5
     from painel_cmv('00000000-0000-0000-0000-0000000000e1') where item_id = '00000000-0000-0000-0000-00000000003a'));
select pg_temp.ok('sugestão mantendo CMV de 9% = R$ 44,44 (x,90 → 44,90)',
  (select preco_sugerido = 44.44 and preco_sugerido_arredondado = 44.90
     from painel_cmv('00000000-0000-0000-0000-0000000000e1') where item_id = '00000000-0000-0000-0000-00000000003a'));
select pg_temp.ok('sugestão mantendo margem de R$ 34,58 = R$ 38,58 (x,90 → 38,90)',
  (select preco_sugerido_margem = 38.58 and preco_sugerido_margem_arredondado = 38.90 and margem_referencia = 34.58
     from painel_cmv('00000000-0000-0000-0000-0000000000e1') where item_id = '00000000-0000-0000-0000-00000000003a'));
select pg_temp.ok('preço publicado continua R$ 38',
  (select preco_publicado = 38.00 from painel_cmv('00000000-0000-0000-0000-0000000000e1')
    where item_id = '00000000-0000-0000-0000-00000000003a'));

-- Alvo manual tem prioridade
update itens_cardapio set cmv_alvo = 12 where id = '00000000-0000-0000-0000-00000000003a';
select pg_temp.ok('alvo manual de 12% prevalece: sugerido R$ 33,33',
  (select origem_referencia = 'manual' and preco_sugerido = 33.33
     from painel_cmv('00000000-0000-0000-0000-0000000000e1') where item_id = '00000000-0000-0000-0000-00000000003a'));
update itens_cardapio set cmv_alvo = null where id = '00000000-0000-0000-0000-00000000003a';

select pg_temp.ok('CMV da casa: média simples dos itens contra a meta de 30%',
  (select itens_avaliados = 3 and meta_casa_pct = 30 from cmv_da_casa('00000000-0000-0000-0000-0000000000e1')),
  (select format('%s itens, média %s%%, meta %s%%, %s', itens_avaliados, cmv_medio_simples_pct, meta_casa_pct, situacao)
     from cmv_da_casa('00000000-0000-0000-0000-0000000000e1')));

-- Aprovar R$ 44,90: nova referência = 4,00 / 44,90
select aprovar_preco('00000000-0000-0000-0000-00000000003a', 44.90, 'reajuste rum');
select pg_temp.ok('após aprovar R$ 44,90 a referência passa a 8,9% e o item volta a ok',
  (select cmv_alvo_pct = 8.9 and situacao = 'ok' from painel_cmv('00000000-0000-0000-0000-0000000000e1')
    where item_id = '00000000-0000-0000-0000-00000000003a'));
\echo '== CMV DE REFERÊNCIA OK'
