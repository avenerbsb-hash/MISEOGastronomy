-- Níveis de acesso por casa (migração 0022). Rodar no aceite, depois do 105.
\set ON_ERROR_STOP on
set client_min_messages = notice;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.ok(p_nome text, p_cond boolean, p_detalhe text default '') returns void
language plpgsql as $$ begin
  if p_cond is not true then raise exception 'FALHOU: % %', p_nome, p_detalhe; end if;
  raise notice 'OK  %  %', p_nome, p_detalhe;
end $$;

create temporary table _antes as
select papel::text from acessos_estabelecimento
 where user_id = '00000000-0000-0000-0000-0000000000a3' and estabelecimento_id = '00000000-0000-0000-0000-0000000000e1';

\echo '== Níveis de acesso'
-- nível 3 (gerência): vê custos da casa
select definir_acesso_nivel('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000e1', 3);
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
  if not pode_ver_custos('00000000-0000-0000-0000-0000000000e1') then raise exception 'FALHOU: gerência sem custos'; end if;
  raise notice 'OK  nível 3 (gerência) vê custos';
end $$;
-- nível 1 (contagem): não vê custos
select definir_acesso_nivel('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000e1', 1);
select pg_temp.ok('nível 1 grava o papel contagem',
  (select papel::text = 'contagem' from acessos_estabelecimento where user_id = '00000000-0000-0000-0000-0000000000a3' and estabelecimento_id = '00000000-0000-0000-0000-0000000000e1'));
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
  if pode_ver_custos('00000000-0000-0000-0000-0000000000e1') then raise exception 'FALHOU: contagem viu custos'; end if;
  raise notice 'OK  nível 1 (contagem) não vê custos';
end $$;
-- só administrador define níveis
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
  perform definir_acesso_nivel('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000e1', 4);
  raise exception 'FALHOU: não administrador definiu nível';
exception when insufficient_privilege then raise notice 'OK  só administrador define níveis';
end $$;
-- nível 0: tira o acesso
select definir_acesso_nivel('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000e1', 0);
select pg_temp.ok('nível 0 tira o acesso à casa',
  not exists (select 1 from acessos_estabelecimento where user_id = '00000000-0000-0000-0000-0000000000a3' and estabelecimento_id = '00000000-0000-0000-0000-0000000000e1'));

-- volta o usuário de teste ao papel original
insert into acessos_estabelecimento (user_id, estabelecimento_id, papel)
select '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000e1', papel::papel_local from _antes;
-- contagens com responsável (0023): a contagem do teste 105 feita pela produção (a3) aparece com o nome
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.ok('última contagem traz responsável, hora e itens',
  (select responsavel is not null and feita_em is not null and itens >= 1
     from ultimas_contagens('00000000-0000-0000-0000-0000000000e1', 1)));
\echo '== NIVEIS OK'
