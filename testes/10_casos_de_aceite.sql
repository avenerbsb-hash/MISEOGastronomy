-- =====================================================================
-- Casos de aceite do Documento Mestre v0.1 (+ regras de integridade)
-- Rodar após 00_stub_supabase.sql e a migração 0001.
-- =====================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;
set timezone = 'America/Sao_Paulo';

-- Usuários: admin central, gestor do Alma, produção do Alma
insert into auth.users values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@jf.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'gestor.alma@jf.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'producao.alma@jf.test');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

insert into estabelecimentos (id, nome, cmv_alvo_padrao, regra_arredondamento) values
  ('00000000-0000-0000-0000-0000000000e1', 'Alma Boutique Bar & Restaurante', 30, 'x90'),
  ('00000000-0000-0000-0000-0000000000e2', 'Recreio Bar', 28, 'x90');

insert into perfis (user_id, nome, admin) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin', true),
  ('00000000-0000-0000-0000-0000000000a2', 'Gestor Alma', false),
  ('00000000-0000-0000-0000-0000000000a3', 'Produção Alma', false);
insert into acessos_estabelecimento values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000e1', 'gestor'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000e1', 'producao');

insert into insumos (id, codigo, nome, dimensao) values
  ('00000000-0000-0000-0000-0000000000c1', 'CAR-001', 'Contrafilé bruto', 'massa'),
  ('00000000-0000-0000-0000-0000000000c2', 'DES-001', 'Gin London Dry',   'volume'),
  ('00000000-0000-0000-0000-0000000000c3', 'MER-001', 'Açúcar refinado',  'massa'),
  ('00000000-0000-0000-0000-0000000000c4', 'HOR-001', 'Polpa de maracujá','massa'),
  ('00000000-0000-0000-0000-0000000000c5', 'HOR-002', 'Suco de limão',    'volume'),
  ('00000000-0000-0000-0000-0000000000c6', 'TST-001', 'Insumo teste',     'contagem');

-- Preços de setembro (validados), por casa
insert into historico_precos (insumo_id, estabelecimento_id, data_compra, quantidade, unidade, valor_total, status) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1', '2026-09-01', 10,  'kg', 500, 'validado'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e1', '2026-09-01', 750, 'ml', 90,  'validado'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e2', '2026-09-01', 750, 'ml', 75,  'validado'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000e1', '2026-09-01', 5,   'kg', 30,  'validado'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000e2', '2026-09-01', 5,   'kg', 30,  'validado'),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000e1', '2026-09-01', 1,   'kg', 18,  'validado'),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000e2', '2026-09-01', 1,   'kg', 18,  'validado'),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000e1', '2026-09-01', 1,   'l',  20,  'validado'),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000e2', '2026-09-01', 1,   'l',  20,  'validado'),
  ('00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-0000000000e1', '2026-09-01', 1,   'un', 5,   'validado');

-- Receitas
insert into receitas (id, codigo, nome, tipo, dimensao_saida) values
  ('00000000-0000-0000-0000-0000000000d1', 'SUB-001', 'Contrafilé limpo',     'subproduto', 'massa'),
  ('00000000-0000-0000-0000-0000000000d2', 'SUB-002', 'Contrafilé cozido',    'subproduto', 'massa'),
  ('00000000-0000-0000-0000-0000000000d3', 'FIN-001', 'Steak',                'final',      'contagem'),
  ('00000000-0000-0000-0000-0000000000d4', 'SUB-003', 'Xarope de maracujá',   'subproduto', 'volume'),
  ('00000000-0000-0000-0000-0000000000d5', 'FIN-002', 'Fitzgerald',           'final',      'contagem'),
  ('00000000-0000-0000-0000-0000000000d6', 'FIN-003', 'Prato teste CMV',      'final',      'contagem');

-- Versões (rascunho → componentes → aprovação com vigência em 01/09)
insert into versoes_receita (id, receita_id, numero, rendimento_quantidade, rendimento_unidade, modo_preparo) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', 1, 7,    'kg', 'Limpar aparas e nervos.'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000d2', 1, 750,  'g',  'Selar e assar até ponto.'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000d3', 1, 1,    'un', 'Fatiar 150 g e empratar.'),
  ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000d4', 1, 1.6,  'l',  'Aquecer, dissolver e coar.'),
  ('00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000000d5', 1, 1,    'un', 'Bater com gelo, coar duplo.'),
  ('00000000-0000-0000-0000-0000000000b6', '00000000-0000-0000-0000-0000000000d6', 1, 1,    'un', 'Teste.');

insert into componentes_receita (versao_id, ordem, etapa, insumo_id, subproduto_id, quantidade, unidade) values
  ('00000000-0000-0000-0000-0000000000b1', 1, 'limpeza', '00000000-0000-0000-0000-0000000000c1', null, 10,  'kg'),
  ('00000000-0000-0000-0000-0000000000b2', 1, 'cocção',  null, '00000000-0000-0000-0000-0000000000d1', 1,   'kg'),
  ('00000000-0000-0000-0000-0000000000b3', 1, 'montagem',null, '00000000-0000-0000-0000-0000000000d2', 150, 'g'),
  ('00000000-0000-0000-0000-0000000000b4', 1, 'preparo', '00000000-0000-0000-0000-0000000000c3', null, 1,   'kg'),
  ('00000000-0000-0000-0000-0000000000b4', 2, 'preparo', '00000000-0000-0000-0000-0000000000c4', null, 1,   'kg'),
  ('00000000-0000-0000-0000-0000000000b5', 1, 'montagem','00000000-0000-0000-0000-0000000000c2', null, 50,  'ml'),
  ('00000000-0000-0000-0000-0000000000b5', 2, 'montagem',null, '00000000-0000-0000-0000-0000000000d4', 40,  'ml'),
  ('00000000-0000-0000-0000-0000000000b5', 3, 'montagem','00000000-0000-0000-0000-0000000000c5', null, 25,  'ml'),
  ('00000000-0000-0000-0000-0000000000b6', 1, 'montagem','00000000-0000-0000-0000-0000000000c6', null, 1,   'un');

-- Xarope: açúcar 1 kg (R$ 6) + polpa 1 kg (R$ 18) = R$ 24 → rende 1,6 L
select aprovar_versao(id, 'versão inicial', '2026-09-01 00:00') from versoes_receita order by receita_id;

-- Cardápio do Alma + preço publicado em 02/09
insert into cardapios (id, estabelecimento_id, nome, status) values
  ('00000000-0000-0000-0000-00000000001c', '00000000-0000-0000-0000-0000000000e1', 'Principal', 'publicado');
insert into itens_cardapio (id, cardapio_id, receita_id, cmv_alvo) values
  ('00000000-0000-0000-0000-00000000001a', '00000000-0000-0000-0000-00000000001c', '00000000-0000-0000-0000-0000000000d6', 30),
  ('00000000-0000-0000-0000-00000000002a', '00000000-0000-0000-0000-00000000001c', '00000000-0000-0000-0000-0000000000d5', 22);
select aprovar_preco('00000000-0000-0000-0000-00000000001a', 16.90, 'preço inicial', '2026-09-02 00:00');
select aprovar_preco('00000000-0000-0000-0000-00000000002a', 38.00, 'preço inicial', '2026-09-02 00:00');

create or replace function pg_temp.ok(p_nome text, p_cond boolean, p_detalhe text default '') returns void
language plpgsql as $$ begin
  if p_cond is not true then raise exception 'FALHOU: % %', p_nome, p_detalhe; end if;
  raise notice 'OK  %  %', p_nome, p_detalhe;
end $$;

-- ---------------------------------------------------------------------
\echo '== Caso 1: carne — limpeza e cocção'
select pg_temp.ok('custo limpo R$/kg',
  round(custo_receita('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e1') * 1000, 2) = 71.43,
  (round(custo_receita('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e1') * 1000, 2))::text);
select pg_temp.ok('custo cozido R$/kg',
  round(custo_receita('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000e1') * 1000, 2) = 95.24,
  (round(custo_receita('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000e1') * 1000, 2))::text);
select pg_temp.ok('porção 150 g cozidos',
  round(custo_receita('00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000e1'), 2) = 14.29,
  (round(custo_receita('00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000e1'), 2))::text);

-- ---------------------------------------------------------------------
\echo '== Caso 2: preservar CMV-alvo sem mexer no preço publicado'
select pg_temp.ok('sugerido antes (custo R$ 5)',
  (select preco_sugerido = 16.67 from painel_cmv('00000000-0000-0000-0000-0000000000e1', '2026-09-15')
    where item_id = '00000000-0000-0000-0000-00000000001a'));
insert into historico_precos (insumo_id, estabelecimento_id, data_compra, quantidade, unidade, valor_total, status)
values ('00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-0000000000e1', '2026-10-10', 1, 'un', 7, 'validado');
select pg_temp.ok('sugerido depois (custo R$ 7)',
  (select preco_sugerido = 23.33 from painel_cmv('00000000-0000-0000-0000-0000000000e1')
    where item_id = '00000000-0000-0000-0000-00000000001a'));
select pg_temp.ok('preço publicado continua R$ 16,90',
  (select preco_publicado = 16.90 from painel_cmv('00000000-0000-0000-0000-0000000000e1')
    where item_id = '00000000-0000-0000-0000-00000000001a'));
select pg_temp.ok('alerta de CMV acima do alvo',
  (select situacao = 'acima_do_alvo' and cmv_atual_pct = 41.4 from painel_cmv('00000000-0000-0000-0000-0000000000e1')
    where item_id = '00000000-0000-0000-0000-00000000001a'));
select pg_temp.ok('arredondamento x,90 e CMV efetivo',
  (select preco_sugerido_arredondado = 23.90 and cmv_preco_arredondado_pct = 29.3
     from painel_cmv('00000000-0000-0000-0000-0000000000e1') where item_id = '00000000-0000-0000-0000-00000000001a'));
select aprovar_preco('00000000-0000-0000-0000-00000000001a', 23.90, 'reajuste após alta do insumo');
select pg_temp.ok('após aprovação consciente: R$ 23,90 e CMV ok',
  (select preco_publicado = 23.90 and situacao = 'ok' from painel_cmv('00000000-0000-0000-0000-0000000000e1')
    where item_id = '00000000-0000-0000-0000-00000000001a'));
select pg_temp.ok('variação do insumo marcada em vermelho (+40%)',
  (select sinal = 'vermelho' and variacao_pct = 40.0 from variacoes_insumos('00000000-0000-0000-0000-0000000000e1')
    where insumo_id = '00000000-0000-0000-0000-0000000000c6'));

-- ---------------------------------------------------------------------
\echo '== Caso 3: xarope — volume final'
select pg_temp.ok('custo por mL = 0,015',
  round(custo_receita('00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000e1'), 4) = 0.015);
select pg_temp.ok('40 mL na ficha do drink = R$ 0,60',
  (select custo = 0.60 from ficha_gerencial('00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-0000000000e1')
    where componente = 'Xarope de maracujá'));

-- ---------------------------------------------------------------------
\echo '== Caso 4: mesma receita, duas casas'
select pg_temp.ok('Fitzgerald Alma (gin R$ 90/750 mL) = R$ 7,10',
  round(custo_receita('00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-0000000000e1'), 2) = 7.10,
  round(custo_receita('00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-0000000000e1'), 2)::text);
select pg_temp.ok('Fitzgerald Recreio (gin R$ 75/750 mL) = R$ 6,10',
  round(custo_receita('00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-0000000000e2'), 2) = 6.10,
  round(custo_receita('00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-0000000000e2'), 2)::text);
select pg_temp.ok('uma única versão de receita compartilhada',
  (select count(*) = 1 from versoes_receita where receita_id = '00000000-0000-0000-0000-0000000000d5'));

-- ---------------------------------------------------------------------
\echo '== Caso 5: segurança e histórico'
-- Outubro: carne sobe e nova versão da limpeza (rendimento 6,5 kg) é aprovada
insert into historico_precos (insumo_id, estabelecimento_id, data_compra, quantidade, unidade, valor_total, status)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1', '2026-10-10', 10, 'kg', 600, 'validado');
select pg_temp.ok('steak em 30/09 continua R$ 14,29',
  round(custo_receita('00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000e1','2026-09-30'), 2) = 14.29);
select pg_temp.ok('steak hoje (carne R$ 60/kg) = R$ 17,14 — cascata',
  round(custo_receita('00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000e1'), 2) = 17.14);
do $$ declare v uuid; begin
  v := nova_versao('00000000-0000-0000-0000-0000000000d1');
  update versoes_receita set rendimento_quantidade = 6.5 where id = v;
  perform aprovar_versao(v, 'rendimento medido menor', '2026-10-12 00:00');
end $$;
select pg_temp.ok('versão 1 arquivada, preservada e consultável',
  (select status = 'arquivada' from versoes_receita where id = '00000000-0000-0000-0000-0000000000b1')
  and (select versao_numero = 1 from ficha_gerencial('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e1','2026-09-30') limit 1));
select pg_temp.ok('limpo hoje com rendimento 6,5 kg = R$ 92,31/kg',
  round(custo_receita('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e1') * 1000, 2) = 92.31);

-- Usuário de PRODUÇÃO do Alma
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select pg_temp.ok('produção não lê histórico de preços', (select count(*) = 0 from historico_precos));
select pg_temp.ok('produção não lê preços de cardápio',  (select count(*) = 0 from precos_item_cardapio));
select pg_temp.ok('produção lê a ficha de produção',     (select count(*) > 0 from vw_ficha_producao where receita = 'Fitzgerald'));
do $$ begin
  perform custo_receita('00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-0000000000e1');
  raise exception 'FALHOU: produção conseguiu ver custo';
exception when insufficient_privilege then raise notice 'OK  produção bloqueada em custo_receita()';
end $$;
do $$ begin
  perform * from painel_cmv('00000000-0000-0000-0000-0000000000e1');
  raise exception 'FALHOU: produção viu painel';
exception when insufficient_privilege then raise notice 'OK  produção bloqueada no painel de CMV';
end $$;
insert into lotes_producao (versao_id, estabelecimento_id, quantidade_obtida, unidade, perdas_descricao)
values ((select id from versoes_receita where receita_id = '00000000-0000-0000-0000-0000000000d4' and status = 'aprovada'),
        '00000000-0000-0000-0000-0000000000e1', 1.45, 'l', 'evaporação maior');
select pg_temp.ok('produção registra lote; alerta de rendimento (-9,4%)',
  (select alerta and desvio_pct = -9.4 from rendimento_lotes('00000000-0000-0000-0000-0000000000e1') limit 1));
reset role;

-- GESTOR do Alma: vê Alma, não vê Recreio, não publica preço por fora
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.ok('gestor vê preços do Alma',   (select count(*) > 0 from historico_precos where estabelecimento_id = '00000000-0000-0000-0000-0000000000e1'));
select pg_temp.ok('gestor não vê preços do Recreio', (select count(*) = 0 from historico_precos where estabelecimento_id = '00000000-0000-0000-0000-0000000000e2'));
do $$ begin
  insert into precos_item_cardapio (item_id, preco) values ('00000000-0000-0000-0000-00000000002a', 1);
  raise exception 'FALHOU: preço publicado sem aprovação';
exception when insufficient_privilege then raise notice 'OK  preço publicado só via aprovar_preco()';
end $$;
do $$ begin
  perform aprovar_versao((select id from versoes_receita where receita_id = '00000000-0000-0000-0000-0000000000d6'));
  raise exception 'FALHOU';
exception when insufficient_privilege then raise notice 'OK  gestor não aprova versão (somente admin)';
          when others then raise notice 'OK  gestor bloqueado: %', sqlerrm;
end $$;
reset role;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

-- ---------------------------------------------------------------------
\echo '== Regras de integridade'
do $$ declare v uuid; begin
  v := nova_versao('00000000-0000-0000-0000-0000000000d1');
  insert into componentes_receita (versao_id, subproduto_id, quantidade, unidade)
  values (v, '00000000-0000-0000-0000-0000000000d2', 100, 'g');
  raise exception 'FALHOU: ciclo aceito';
exception when others then
  if sqlerrm like 'Dependência circular%' then raise notice 'OK  ciclo bloqueado: %', sqlerrm;
  else raise; end if;
end $$;
do $$ begin
  insert into componentes_receita (versao_id, insumo_id, quantidade, unidade)
  values ((select id from versoes_receita where receita_id='00000000-0000-0000-0000-0000000000d6' and status='aprovada'),
          '00000000-0000-0000-0000-0000000000c6', 1, 'un');
  raise exception 'FALHOU: versão aprovada alterada';
exception when others then
  if sqlerrm like 'Componentes de versão aprovada%' then raise notice 'OK  versão aprovada imutável';
  else raise; end if;
end $$;
do $$ declare v uuid; begin
  v := nova_versao('00000000-0000-0000-0000-0000000000d5');
  insert into componentes_receita (versao_id, insumo_id, quantidade, unidade)
  values (v, '00000000-0000-0000-0000-0000000000c3', 10, 'ml');
  raise exception 'FALHOU: massa convertida em volume sem densidade';
exception when check_violation then raise notice 'OK  massa↔volume sem densidade bloqueado: %', sqlerrm;
end $$;
do $$ begin
  delete from historico_precos where true;
  raise exception 'FALHOU: histórico apagado';
exception when others then
  if sqlerrm like 'Histórico de preços não pode%' then raise notice 'OK  histórico de preços não apaga';
  else raise; end if;
end $$;
do $$ begin
  update historico_precos set valor_total = 1 where status = 'validado';
  raise exception 'FALHOU: preço validado editado';
exception when others then
  if sqlerrm like 'Registro de preço é imutável%' then raise notice 'OK  preço validado não edita';
  else raise; end if;
end $$;
insert into historico_precos (insumo_id, estabelecimento_id, data_compra, quantidade, unidade, valor_total)
values ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000e1', current_date, 750, 'ml', 999);
select pg_temp.ok('preço pendente não entra no custo',
  round(custo_receita('00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-0000000000e1'), 2) = 7.10);
select pg_temp.ok('fichas impactadas pela carne: limpo, cozido, steak',
  (select count(*) = 3 from fichas_impactadas('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000e1')));
select pg_temp.ok('auditoria registrou eventos', (select count(*) > 30 from eventos_auditoria));

\echo '== TODOS OS TESTES PASSARAM'
