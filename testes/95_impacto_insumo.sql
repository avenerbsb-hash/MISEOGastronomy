-- Impacto da mudança de preço de um insumo no custo das fichas (migração 0009). Rodar no aceite, depois do 90.
\set ON_ERROR_STOP on
set client_min_messages = notice;
set timezone = 'America/Sao_Paulo';
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.ok(p_nome text, p_cond boolean, p_detalhe text default '') returns void
language plpgsql as $$ begin
  if p_cond is not true then raise exception 'FALHOU: % %', p_nome, p_detalhe; end if;
  raise notice 'OK  %  %', p_nome, p_detalhe;
end $$;

-- gin: no teste 90 o preço dobrou (R$ 150 → R$ 300 a garrafa)
create temporary table _imp as
select * from impacto_insumo_fichas('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e1');

\echo '== Impacto do insumo nas fichas'
select pg_temp.ok('Fitzgerald aparece com impacto ▲ menor que a alta do gin',
  (select sinal = 'vermelho' and impacto_pct > 0 and impacto_pct < 100 from _imp where receita_id = '00000000-0000-0000-0000-0000000000d5'),
  (select impacto_pct || '%' from _imp where receita_id = '00000000-0000-0000-0000-0000000000d5'));
select pg_temp.ok('custo atual igual ao custo_receita',
  (select round(custo_atual, 4) = round(custo_receita('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000e1'), 4)
     from _imp where receita_id = '00000000-0000-0000-0000-0000000000d5'));
select pg_temp.ok('custo sem a mudança = troca do gin pelo preço anterior',
  (select round(i.custo_atual - i.custo_sem_mudanca, 6) > 0 from _imp i where receita_id = '00000000-0000-0000-0000-0000000000d5'));
select pg_temp.ok('mesmas receitas de fichas_impactadas',
  (select count(*) from _imp) = (select count(*) from fichas_impactadas('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e1') f
                                   join receitas r on r.id = f.receita_id where r.ativo));
select pg_temp.ok('xarope (sem gin) não entra',
  not exists (select 1 from _imp where receita_id = '00000000-0000-0000-0000-0000000000d4'));

\echo '== Permissões'
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$ begin
  perform * from impacto_insumo_fichas('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e1');
  raise exception 'FALHOU: produção viu impacto de custo';
exception when insufficient_privilege then raise notice 'OK  produção não vê impacto de custo';
end $$;
\echo '== IMPACTO OK'
