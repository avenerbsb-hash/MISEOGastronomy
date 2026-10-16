-- Painel de CMV da casa com a meta (migração 0011). Rodar no aceite, depois do 97.
\set ON_ERROR_STOP on
set client_min_messages = notice;
set timezone = 'America/Sao_Paulo';
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.ok(p_nome text, p_cond boolean, p_detalhe text default '') returns void
language plpgsql as $$ begin
  if p_cond is not true then raise exception 'FALHOU: % %', p_nome, p_detalhe; end if;
  raise notice 'OK  %  %', p_nome, p_detalhe;
end $$;

create temporary table _p as select * from painel_cmv_casa('00000000-0000-0000-0000-0000000000e1');

\echo '== Painel de CMV da casa'
select pg_temp.ok('mesmos itens do painel_cmv', (select count(*) from _p) = (select count(*) from painel_cmv('00000000-0000-0000-0000-0000000000e1')));
select pg_temp.ok('ordenado do CMV mais alto para o mais baixo',
  not exists (select 1 from (select cmv_atual_pct, lag(cmv_atual_pct) over () as ant from _p where cmv_atual_pct is not null) x
               where x.cmv_atual_pct > x.ant));
select pg_temp.ok('meta da casa usada (ou 30% quando não definida)',
  (select bool_and(meta_pct = coalesce((select cmv_alvo_padrao from estabelecimentos where id = '00000000-0000-0000-0000-0000000000e1'), 30)) from _p));
select pg_temp.ok('preço da meta dá CMV na meta ou abaixo',
  not exists (select 1 from _p where preco_meta is not null and cmv_preco_meta_pct > meta_pct + 0.05));
select pg_temp.ok('situação acima_da_meta coerente',
  not exists (select 1 from _p where situacao = 'acima_da_meta' and cmv_atual_pct <= meta_pct));
select pg_temp.ok('traz a receita do item',
  not exists (select 1 from _p p join itens_cardapio it on it.id = p.item_id where it.receita_id <> p.receita_id));

-- meta de 20% na casa muda a sugestão
update estabelecimentos set cmv_alvo_padrao = 20 where id = '00000000-0000-0000-0000-0000000000e1';
select pg_temp.ok('meta 20%: preço da meta sobe e meta_definida = true',
  (select bool_and(n.meta_pct = 20 and n.meta_definida and (n.preco_meta is null or n.preco_meta >= o.preco_meta))
     from painel_cmv_casa('00000000-0000-0000-0000-0000000000e1') n join _p o using (item_id)));

\echo '== Permissões'
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$ begin
  perform * from painel_cmv_casa('00000000-0000-0000-0000-0000000000e1');
  raise exception 'FALHOU: produção viu o painel de CMV';
exception when insufficient_privilege then raise notice 'OK  produção não vê o painel de CMV';
end $$;
\echo '== PAINEL CMV OK'
