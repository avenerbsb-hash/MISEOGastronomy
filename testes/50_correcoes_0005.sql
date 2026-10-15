-- Correções da migração 0005 (rodar depois de 10 e 40, mesmo banco)
\set ON_ERROR_STOP on
set timezone = 'America/Sao_Paulo';
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
create or replace function pg_temp.ok(p_nome text, p_cond boolean, p_detalhe text default '') returns void
language plpgsql as $$ begin
  if p_cond is not true then raise exception 'FALHOU: % %', p_nome, p_detalhe; end if;
  raise notice 'OK  %  %', p_nome, p_detalhe;
end $$;

-- ---------------------------------------------------------------------
\echo '== 1. Lote de produção com unidade incompatível'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';   -- produção do Alma
do $$ begin
  insert into lotes_producao (versao_id, estabelecimento_id, quantidade_obtida, unidade)
  values ((select id from versoes_receita where receita_id = '00000000-0000-0000-0000-0000000000d4' and status = 'aprovada'),
          '00000000-0000-0000-0000-0000000000e1', 2, 'kg');
  raise exception 'FALHOU: xarope (mL) aceito em kg';
exception when check_violation then raise notice 'OK  xarope (mL) recusado em kg: %', sqlerrm;
end $$;
do $$ begin
  insert into lotes_producao (versao_id, estabelecimento_id, quantidade_obtida, unidade)
  values ((select id from versoes_receita where receita_id = '00000000-0000-0000-0000-0000000000d4' and status = 'aprovada'),
          '00000000-0000-0000-0000-0000000000e1', 3, 'un');
  raise exception 'FALHOU: xarope (mL) aceito em un';
exception when check_violation then raise notice 'OK  xarope (mL) recusado em un: %', sqlerrm;
end $$;
insert into lotes_producao (versao_id, estabelecimento_id, quantidade_obtida, unidade, produzido_em)
values ((select id from versoes_receita where receita_id = '00000000-0000-0000-0000-0000000000d4' and status = 'aprovada'),
        '00000000-0000-0000-0000-0000000000e1', 1600, 'ml', now() - interval '1 hour');
select pg_temp.ok('lote em mL aceito', (select count(*) = 2 from lotes_producao));
reset role;

-- Lote inválido gravado antes da 0005 (simulado desligando a validação)
alter table lotes_producao disable trigger valida_unidade;
insert into lotes_producao (versao_id, estabelecimento_id, quantidade_obtida, unidade, produzido_em)
values ((select id from versoes_receita where receita_id = '00000000-0000-0000-0000-0000000000d4' and status = 'aprovada'),
        '00000000-0000-0000-0000-0000000000e1', 2, 'kg', now() - interval '2 hours');
alter table lotes_producao enable trigger valida_unidade;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.ok('relatório não quebra com lote antigo inválido: 3 lotes',
  (select count(*) = 3 from rendimento_lotes('00000000-0000-0000-0000-0000000000e1')));
select pg_temp.ok('lote inválido aparece sem desvio e com alerta',
  (select obtido is null and desvio_pct is null and alerta
     from rendimento_lotes('00000000-0000-0000-0000-0000000000e1') where obtido is null));
select pg_temp.ok('lote válido de 1.600 mL: desvio 0% e sem alerta',
  (select desvio_pct = 0 and not alerta
     from rendimento_lotes('00000000-0000-0000-0000-0000000000e1') where obtido = 1600));
select pg_temp.ok('caso antigo continua: -9,4% com alerta',
  (select alerta from rendimento_lotes('00000000-0000-0000-0000-0000000000e1') where desvio_pct = -9.4));

-- ---------------------------------------------------------------------
\echo '== 2. Custo zero e divisão por zero'
insert into insumos (id, codigo, nome, dimensao) values
  ('00000000-0000-0000-0000-0000000000c8', 'TST-003', 'Guardanapo (teste)', 'contagem');
insert into historico_precos (insumo_id, estabelecimento_id, data_compra, quantidade, unidade, valor_total, status)
values ('00000000-0000-0000-0000-0000000000c8', '00000000-0000-0000-0000-0000000000e1', '2026-09-01', 1000, 'un', 0.01, 'validado');
insert into receitas (id, codigo, nome, tipo, dimensao_saida)
values ('00000000-0000-0000-0000-0000000000d8', 'FIN-005', 'Item quase sem custo', 'final', 'contagem');
insert into versoes_receita (id, receita_id, numero, rendimento_quantidade, rendimento_unidade)
values ('00000000-0000-0000-0000-0000000000b8', '00000000-0000-0000-0000-0000000000d8', 1, 1, 'un');
insert into componentes_receita (versao_id, insumo_id, quantidade, unidade)
values ('00000000-0000-0000-0000-0000000000b8', '00000000-0000-0000-0000-0000000000c8', 1, 'un');
select aprovar_versao('00000000-0000-0000-0000-0000000000b8', 'teste', '2026-09-01');
insert into itens_cardapio (id, cardapio_id, receita_id, cmv_alvo)
values ('00000000-0000-0000-0000-00000000004a', '00000000-0000-0000-0000-00000000001c', '00000000-0000-0000-0000-0000000000d8', 30);

-- Com arredondamento em centavos, R$ 0,00003 ÷ 30% arredonda para R$ 0,00
update estabelecimentos set regra_arredondamento = 'centavos' where id = '00000000-0000-0000-0000-0000000000e1';
select pg_temp.ok('painel não quebra quando o sugerido arredonda para R$ 0,00',
  (select preco_sugerido_arredondado = 0 and cmv_preco_arredondado_pct is null
     from painel_cmv('00000000-0000-0000-0000-0000000000e1') where item_id = '00000000-0000-0000-0000-00000000004a'));
select pg_temp.ok('CMV da casa não quebra',
  (select itens_avaliados >= 1 from cmv_da_casa('00000000-0000-0000-0000-0000000000e1')));
update estabelecimentos set regra_arredondamento = 'x90' where id = '00000000-0000-0000-0000-0000000000e1';

-- Bonificação (nota de R$ 0) não zera o custo do insumo
insert into historico_precos (insumo_id, estabelecimento_id, data_compra, quantidade, unidade, valor_total, status)
values ('00000000-0000-0000-0000-0000000000c7', '00000000-0000-0000-0000-0000000000e1', '2026-10-11', 5, 'un', 0, 'validado');
select pg_temp.ok('bonificação não vira custo: kit mojito continua R$ 4,00',
  round(calc.custo_insumo('00000000-0000-0000-0000-0000000000c7', '00000000-0000-0000-0000-0000000000e1'), 2) = 4.00);
select pg_temp.ok('variação compara com a compra paga anterior (R$ 3,42)',
  (select round(custo_anterior, 2) = 3.42 from variacoes_insumos('00000000-0000-0000-0000-0000000000e1')
    where insumo_id = '00000000-0000-0000-0000-0000000000c7'));
select pg_temp.ok('bonificação não é copiada como referência',
  copiar_precos_referencia('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2') >= 1
  and (select count(*) = 0 from historico_precos
        where estabelecimento_id = '00000000-0000-0000-0000-0000000000e2' and fonte = 'referencia' and valor_total = 0));
select pg_temp.ok('Recreio recebe o kit mojito pelo último preço pago (R$ 4,00)',
  round(calc.custo_insumo('00000000-0000-0000-0000-0000000000c7', '00000000-0000-0000-0000-0000000000e2'), 2) = 4.00);

do $$ begin
  perform aprovar_preco('00000000-0000-0000-0000-00000000004a', 0);
  raise exception 'FALHOU: preço zero aprovado';
exception when check_violation then raise notice 'OK  preço zero recusado: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
\echo '== 3. confirmar_conversao: permissão antes de alterar'
insert into fornecedores (id, nome) values ('00000000-0000-0000-0000-0000000000f1', 'Fornecedor teste');
insert into alias_insumo (fornecedor_id, descricao_original, insumo_id)
values ('00000000-0000-0000-0000-0000000000f1', 'INSUMO TESTE CX', '00000000-0000-0000-0000-0000000000c6');
insert into itens_importacao (lote_importacao, estabelecimento_id, fornecedor_id, data_compra, descricao_original,
                              unidade_nota, quantidade_nota, preco_unitario_nota, valor_total, insumo_id) values
  ('teste-0005', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', '2026-10-12',
   'INSUMO TESTE CX', 'CX', 2, 10, 20, '00000000-0000-0000-0000-0000000000c6'),
  ('teste-0005', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000f1', '2026-10-12',
   'INSUMO TESTE CX', 'CX', 1, 12, 12, '00000000-0000-0000-0000-0000000000c6');

set role authenticated;
set request.jwt.claim.sub = '';                                         -- sem login
do $$ begin
  perform confirmar_conversao('00000000-0000-0000-0000-0000000000f1', 'INSUMO TESTE CX', 999, 'un');
  raise exception 'FALHOU: anônimo confirmou conversão';
exception when insufficient_privilege then raise notice 'OK  sem login: bloqueado';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';   -- produção do Alma
do $$ begin
  perform confirmar_conversao('00000000-0000-0000-0000-0000000000f1', 'INSUMO TESTE CX', 999, 'un');
  raise exception 'FALHOU: produção confirmou conversão';
exception when insufficient_privilege then raise notice 'OK  produção: bloqueada';
end $$;
reset role;
select pg_temp.ok('alias não foi alterado pelas tentativas bloqueadas',
  (select quantidade_por_un is null from alias_insumo where descricao_original = 'INSUMO TESTE CX'));

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';   -- gestor do Alma
select pg_temp.ok('gestor do Alma importa só a linha do Alma, sem erro pela do Recreio',
  confirmar_conversao('00000000-0000-0000-0000-0000000000f1', 'INSUMO TESTE CX', 10, 'un') = 1);
reset role;
select pg_temp.ok('linha do Recreio continua pendente',
  (select status = 'pendente' from itens_importacao
    where lote_importacao = 'teste-0005' and estabelecimento_id = '00000000-0000-0000-0000-0000000000e2'));
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.ok('admin importa a linha restante do Recreio',
  confirmar_conversao('00000000-0000-0000-0000-0000000000f1', 'INSUMO TESTE CX', 10, 'un') = 1);
select pg_temp.ok('nada pendente no lote de teste',
  (select count(*) = 0 from itens_importacao where lote_importacao = 'teste-0005' and status = 'pendente'));

\echo '== CORREÇÕES 0005 OK'
