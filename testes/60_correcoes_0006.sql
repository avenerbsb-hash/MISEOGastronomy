-- Correções da migração 0006 (rodar depois de 10, 40 e 50, mesmo banco)
\set ON_ERROR_STOP on
set timezone = 'America/Sao_Paulo';
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
create or replace function pg_temp.ok(p_nome text, p_cond boolean, p_detalhe text default '') returns void
language plpgsql as $$ begin
  if p_cond is not true then raise exception 'FALHOU: % %', p_nome, p_detalhe; end if;
  raise notice 'OK  %  %', p_nome, p_detalhe;
end $$;

-- ---------------------------------------------------------------------
\echo '== 4. Compra própria prevalece sobre referência'
-- No teste 50 o Recreio recebeu a carne do Alma como referência (R$ 60/kg, 10/10).
-- Agora entra uma compra própria do Recreio, mais antiga (20/09, R$ 55/kg).
insert into historico_precos (insumo_id, estabelecimento_id, data_compra, quantidade, unidade, valor_total, status)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e2', '2026-09-20', 10, 'kg', 550, 'validado');
select pg_temp.ok('carne no Recreio usa a compra própria (R$ 55/kg), não a referência mais nova',
  round(calc.custo_insumo('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e2') * 1000, 2) = 55.00);
select pg_temp.ok('sem compra própria, a referência continua valendo (kit mojito R$ 4,00)',
  round(calc.custo_insumo('00000000-0000-0000-0000-0000000000c7', '00000000-0000-0000-0000-0000000000e2'), 2) = 4.00);

-- ---------------------------------------------------------------------
\echo '== 5. Dimensão e densidade'
do $$ begin
  update insumos set dimensao = 'volume' where id = '00000000-0000-0000-0000-0000000000c1';
  raise exception 'FALHOU: dimensão de insumo com preços mudou';
exception when check_violation then raise notice 'OK  insumo com preços não muda de dimensão';
end $$;
do $$ begin
  update receitas set dimensao_saida = 'massa' where id = '00000000-0000-0000-0000-0000000000d4';
  raise exception 'FALHOU: dimensão de receita com versões mudou';
exception when check_violation then raise notice 'OK  receita com versões não muda de dimensão';
end $$;

insert into insumos (id, codigo, nome, dimensao) values
  ('00000000-0000-0000-0000-0000000000c9', 'TST-004', 'Glicose (teste)', 'massa');
insert into historico_precos (insumo_id, estabelecimento_id, data_compra, quantidade, unidade, valor_total, status)
values ('00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-0000000000e1', '2026-09-01', 1, 'kg', 10, 'validado');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';   -- gestor do Alma
do $$ begin
  update insumos set densidade_g_ml = 1.4, densidade_validada_em = now()
   where id = '00000000-0000-0000-0000-0000000000c9';
  raise exception 'FALHOU: gestor validou densidade';
exception when insufficient_privilege then raise notice 'OK  gestor não valida densidade';
end $$;
reset role;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
update insumos set densidade_g_ml = 1.4, densidade_validada_em = now()
 where id = '00000000-0000-0000-0000-0000000000c9';
select pg_temp.ok('admin valida densidade e fica registrado quem validou',
  (select densidade_validada_por = '00000000-0000-0000-0000-0000000000a1' from insumos
    where id = '00000000-0000-0000-0000-0000000000c9'));

-- Ficha com 10 mL de glicose = 14 g a R$ 0,01/g = R$ 0,14
insert into receitas (id, codigo, nome, tipo, dimensao_saida)
values ('00000000-0000-0000-0000-0000000000d9', 'FIN-006', 'Bala (teste)', 'final', 'contagem');
insert into versoes_receita (id, receita_id, numero, rendimento_quantidade, rendimento_unidade)
values ('00000000-0000-0000-0000-0000000000b9', '00000000-0000-0000-0000-0000000000d9', 1, 1, 'un');
insert into componentes_receita (versao_id, insumo_id, quantidade, unidade)
values ('00000000-0000-0000-0000-0000000000b9', '00000000-0000-0000-0000-0000000000c9', 10, 'ml');
select aprovar_versao('00000000-0000-0000-0000-0000000000b9', 'teste densidade');
select pg_temp.ok('ficha aprovada: 10 mL = 14 g = R$ 0,14',
  round(custo_receita('00000000-0000-0000-0000-0000000000d9', '00000000-0000-0000-0000-0000000000e1'), 2) = 0.14);

update insumos set densidade_g_ml = 2.0, densidade_validada_em = now()
 where id = '00000000-0000-0000-0000-0000000000c9';
select pg_temp.ok('nova densidade não reescreve a ficha aprovada (continua R$ 0,14)',
  round(custo_receita('00000000-0000-0000-0000-0000000000d9', '00000000-0000-0000-0000-0000000000e1'), 2) = 0.14,
  round(custo_receita('00000000-0000-0000-0000-0000000000d9', '00000000-0000-0000-0000-0000000000e1'), 4)::text);
select pg_temp.ok('ficha gerencial mostra os 14 g congelados',
  (select quantidade_base = 14 from ficha_gerencial('00000000-0000-0000-0000-0000000000d9', '00000000-0000-0000-0000-0000000000e1')));
do $$ declare v uuid := nova_versao('00000000-0000-0000-0000-0000000000d9');
begin
  perform pg_temp.ok('nova versão já usa a densidade nova (20 g)',
    (select quantidade_base = 20 from componentes_receita where versao_id = v));
end $$;

-- ---------------------------------------------------------------------
\echo '== 6. Status de versão só pelo admin'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';   -- gestor do Alma
do $$ begin
  update versoes_receita set status = 'arquivada'
   where receita_id = '00000000-0000-0000-0000-0000000000d6' and status = 'aprovada';
  raise exception 'FALHOU: gestor arquivou versão aprovada';
exception when insufficient_privilege then raise notice 'OK  gestor não arquiva versão aprovada';
end $$;
reset role;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.ok('versão do Prato teste continua aprovada',
  (select count(*) = 1 from versoes_receita
    where receita_id = '00000000-0000-0000-0000-0000000000d6' and status = 'aprovada'));

-- ---------------------------------------------------------------------
\echo '== 7. Vigência retroativa'
-- Fitzgerald (item 2a) tem preço só desde 02/09
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';   -- gestor do Alma
do $$ begin
  perform aprovar_preco('00000000-0000-0000-0000-00000000002a', 40.00, 'tentativa', '2026-10-01');
  raise exception 'FALHOU: gestor aprovou preço retroativo';
exception when insufficient_privilege then raise notice 'OK  gestor não aprova preço retroativo';
end $$;
reset role;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  perform aprovar_preco('00000000-0000-0000-0000-00000000002a', 40.00, null, '2026-10-01');
  raise exception 'FALHOU: retroativo sem motivo';
exception when check_violation then raise notice 'OK  admin: retroativo exige motivo';
end $$;
do $$ begin
  perform aprovar_preco('00000000-0000-0000-0000-00000000002a', 40.00, 'ajuste', '2026-09-01');
  raise exception 'FALHOU: preço antes da vigência atual';
exception when check_violation then raise notice 'OK  preço não entra antes da vigência atual: %', sqlerrm;
end $$;
select aprovar_preco('00000000-0000-0000-0000-00000000002a', 40.00, 'correção de lançamento em atraso', '2026-10-01');
select pg_temp.ok('admin com motivo lança retroativo após a vigência atual',
  calc.preco_publicado('00000000-0000-0000-0000-00000000002a', '2026-10-05') = 40.00);
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.ok('gestor aprova preço com vigência a partir de agora',
  aprovar_preco('00000000-0000-0000-0000-00000000002a', 41.90, 'reajuste') is not null);
reset role;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

do $$ declare v uuid := nova_versao('00000000-0000-0000-0000-0000000000d6');
begin
  begin
    perform aprovar_versao(v, null, '2026-10-01');
    raise exception 'FALHOU: versão retroativa sem motivo';
  exception when check_violation then raise notice 'OK  versão retroativa exige motivo';
  end;
  begin
    perform aprovar_versao(v, 'ajuste', '2026-08-01');
    raise exception 'FALHOU: versão antes da vigente';
  exception when check_violation then raise notice 'OK  versão não entra antes da vigente: %', sqlerrm;
  end;
end $$;

\echo '== CORREÇÕES 0006 OK'
