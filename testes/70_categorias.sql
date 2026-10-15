-- Verificação do seed 03 (rodar no banco do seed 01, depois de aplicar o seed 03 duas vezes)
\set ON_ERROR_STOP on
create or replace function pg_temp.ok(p_nome text, p_cond boolean, p_detalhe text default '') returns void
language plpgsql as $$ begin
  if p_cond is not true then raise exception 'FALHOU: % %', p_nome, p_detalhe; end if;
  raise notice 'OK  %  %', p_nome, p_detalhe;
end $$;
\echo '== Categorias padrão'
select pg_temp.ok('rodar duas vezes não duplica nada',
  (select count(*) = count(distinct (escopo, nome, coalesce(pai_id::text, ''))) from categorias));
select pg_temp.ok('grupos de insumo: proteínas, hortifrúti, mercearia, padaria, congelados, bebidas, descartáveis, limpeza',
  (select count(*) = 8 from categorias where escopo = 'insumo' and pai_id is null),
  (select string_agg(nome, ', ' order by nome) from categorias where escopo = 'insumo' and pai_id is null));
select pg_temp.ok('grupos de receita: subprodutos e fichas finais',
  (select count(*) = 2 from categorias where escopo = 'receita' and pai_id is null));
select pg_temp.ok('bebidas com destilados separados (gin, vodka, rum, cachaça, whisky...)',
  (select count(*) >= 8 from categorias s join categorias g on g.id = s.pai_id
    where g.nome = 'Bebidas' and s.nome like 'Destilados · %'));
select pg_temp.ok('nenhuma subcategoria em mais de um nível (pai sempre é grupo)',
  not exists (select 1 from categorias s join categorias p on p.id = s.pai_id where p.pai_id is not null));
select pg_temp.ok('os 71 insumos do seed 01 continuam com a categoria original',
  (select count(*) = 71 from insumos i join categorias c on c.id = i.categoria_id
     join categorias g on g.id = c.pai_id where g.nome = 'Proteínas e laticínios'));
\echo '== CATEGORIAS OK'
