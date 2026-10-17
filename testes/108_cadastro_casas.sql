-- Cadastro de casas pela tela (migração 0028). Rodar no aceite, depois do 107.
\set ON_ERROR_STOP on
set client_min_messages = notice;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.ok(p_nome text, p_cond boolean, p_detalhe text default '') returns void
language plpgsql as $$ begin
  if p_cond is not true then raise exception 'FALHOU: % %', p_nome, p_detalhe; end if;
  raise notice 'OK  %  %', p_nome, p_detalhe;
end $$;

\echo '== Cadastro de casas'
create temporary table _nova as
select criar_casa('Casa Teste 108', 'Grupo Teste', 32, 'x90',
                  '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1') as id;

select pg_temp.ok('casa criada com meta e arredondamento',
  (select e.ativo and e.cmv_alvo_padrao = 32 and e.regra_arredondamento = 'x90' and e.marca = 'Grupo Teste'
     from estabelecimentos e join _nova n on n.id = e.id));
select pg_temp.ok('preços de referência copiados da casa de origem',
  (select count(*) > 0 and bool_and(h.fonte = 'referencia') from historico_precos h join _nova n on n.id = h.estabelecimento_id));
select pg_temp.ok('cardápio copiado com as mesmas fichas, sem preço de venda',
  (select count(*) = (select count(*) from itens_cardapio it join cardapios c on c.id = it.cardapio_id
                       join receitas r on r.id = it.receita_id and r.ativo
                      where c.estabelecimento_id = '00000000-0000-0000-0000-0000000000e1' and it.ativo and c.status <> 'arquivado')
          and count(*) filter (where calc.preco_publicado(it.id) is not null) = 0
     from itens_cardapio it join cardapios c on c.id = it.cardapio_id join _nova n on n.id = c.estabelecimento_id),
  (select count(*)::text || ' itens' from itens_cardapio it join cardapios c on c.id = it.cardapio_id join _nova n on n.id = c.estabelecimento_id));

-- nome repetido (sem diferenciar maiúsculas)
do $$ begin
  perform criar_casa('casa teste 108', null, 30, 'centavos');
  raise exception 'FALHOU: aceitou nome repetido';
exception when unique_violation then raise notice 'OK  nome repetido é recusado';
end $$;

-- quem não é administrador não cria casa
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
  perform criar_casa('Casa Indevida', null, 30, 'centavos');
  raise exception 'FALHOU: não-admin criou casa';
exception when insufficient_privilege then raise notice 'OK  só o administrador cria casa';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

-- meta e arredondamento (gestor/admin)
select definir_parametros_casa((select id from _nova), 28.5, 'inteiro');
select pg_temp.ok('meta e arredondamento atualizados',
  (select cmv_alvo_padrao = 28.5 and regra_arredondamento = 'inteiro' from estabelecimentos where id = (select id from _nova)));
do $$ begin
  perform definir_parametros_casa((select id from _nova), 120, 'inteiro');
  raise exception 'FALHOU: aceitou meta de 120%%';
exception when check_violation then raise notice 'OK  meta fora de 0–100%% é recusada';
end $$;

-- renomear e desativar (nada é apagado)
select atualizar_casa((select id from _nova), 'Casa Teste 108 B', null, false);
select pg_temp.ok('casa renomeada e desativada, ainda listada para o admin',
  (select not ativo and nome = 'Casa Teste 108 B' and marca is null and itens_cardapio > 0
     from listar_casas_admin() where id = (select id from _nova)));
\echo '== CASAS OK'
