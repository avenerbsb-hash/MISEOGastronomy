-- Aceite dos Termos e da Política de Privacidade (migração 0029). Rodar no aceite, depois do 108.
\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function pg_temp.ok(p_nome text, p_cond boolean, p_detalhe text default '') returns void
language plpgsql as $$ begin
  if p_cond is not true then raise exception 'FALHOU: % %', p_nome, p_detalhe; end if;
  raise notice 'OK  %  %', p_nome, p_detalhe;
end $$;

\echo '== Aceite dos termos'
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select aceitar_termos('teste-109');
create temporary table _primeiro as select aceito_em from aceites_termos
 where user_id = '00000000-0000-0000-0000-0000000000a3' and versao = 'teste-109';
select pg_temp.ok('usuário registra o aceite da versão', (select count(*) = 1 from _primeiro));

select aceitar_termos('teste-109');
select pg_temp.ok('aceitar de novo não duplica nem troca a data',
  (select count(*) = 1 and min(a.aceito_em) = (select aceito_em from _primeiro)
     from aceites_termos a where a.user_id = '00000000-0000-0000-0000-0000000000a3' and a.versao = 'teste-109'));

do $$ begin
  perform aceitar_termos('  ');
  raise exception 'FALHOU: aceitou versão vazia';
exception when check_violation then raise notice 'OK  versão vazia é recusada';
end $$;

-- sem login não aceita
do $$ begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform aceitar_termos('teste-109');
  raise exception 'FALHOU: aceitou sem login';
exception when insufficient_privilege then raise notice 'OK  sem login não aceita';
end $$;

-- o administrador vê o aceite dos outros
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.ok('administrador vê o aceite de outro usuário',
  (select count(*) = 1 from aceites_termos where user_id = '00000000-0000-0000-0000-0000000000a3' and versao = 'teste-109'));
\echo '== TERMOS OK'
