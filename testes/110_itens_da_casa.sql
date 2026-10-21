-- Fichas e insumos exclusivos de uma casa (migração 0030). Rodar no aceite, depois do 109.
\set ON_ERROR_STOP on
set client_min_messages = notice;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.ok(p_nome text, p_cond boolean, p_detalhe text default '') returns void
language plpgsql as $$ begin
  if p_cond is not true then raise exception 'FALHOU: % %', p_nome, p_detalhe; end if;
  raise notice 'OK  %  %', p_nome, p_detalhe;
end $$;

\echo '== Itens exclusivos da casa'
-- insumo e ficha só do Recreio (e2), com nome igual a uma ficha compartilhada já existente
insert into insumos (codigo, nome, dimensao, estabelecimento_id)
values ('T110-INS', 'Insumo teste 110 (Recreio)', 'massa', '00000000-0000-0000-0000-0000000000e2');
insert into historico_precos (insumo_id, estabelecimento_id, data_compra, quantidade, unidade, valor_total, fonte, status)
select id, '00000000-0000-0000-0000-0000000000e2', current_date - 3, 1, 'kg', 10, 'manual', 'validado'
  from insumos where codigo = 'T110-INS';
insert into historico_precos (insumo_id, estabelecimento_id, data_compra, quantidade, unidade, valor_total, fonte, status)
select id, '00000000-0000-0000-0000-0000000000e2', current_date, 1, 'kg', 12, 'manual', 'validado'
  from insumos where codigo = 'T110-INS';

create temporary table _compartilhada as
select nome from receitas where tipo = 'final' and estabelecimento_id is null and ativo limit 1;
insert into receitas (codigo, nome, tipo, dimensao_saida, estabelecimento_id)
select 'T110-FT', nome, 'final', 'contagem', '00000000-0000-0000-0000-0000000000e2' from _compartilhada;
select pg_temp.ok('casa pode ter ficha com o mesmo nome de uma compartilhada',
  (select count(*) = 2 from receitas where tipo = 'final' and nome = (select nome from _compartilhada)));

insert into versoes_receita (receita_id, numero, rendimento_quantidade, rendimento_unidade)
select id, 1, 1, 'un' from receitas where codigo = 'T110-FT';
insert into componentes_receita (versao_id, ordem, insumo_id, quantidade, unidade)
select v.id, 1, i.id, 100, 'g'
  from versoes_receita v join receitas r on r.id = v.receita_id and r.codigo = 'T110-FT'
  cross join insumos i where i.codigo = 'T110-INS';
select set_config('app.aprovando', 'sim', false);
update versoes_receita set status = 'aprovada', aprovado_em = now(), vigente_desde = now()
 where receita_id = (select id from receitas where codigo = 'T110-FT');
select set_config('app.aprovando', '', false);

select pg_temp.ok('ficha da casa entra na variação das fichas da própria casa',
  exists (select 1 from variacao_fichas('00000000-0000-0000-0000-0000000000e2') v join receitas r on r.id = v.receita_id where r.codigo = 'T110-FT'));
select pg_temp.ok('ficha de outra casa não entra na variação das fichas do Alma',
  not exists (select 1 from variacao_fichas('00000000-0000-0000-0000-0000000000e1') v join receitas r on r.id = v.receita_id where r.codigo = 'T110-FT'));
select pg_temp.ok('impacto do insumo no Alma não lista ficha do Recreio',
  not exists (select 1 from impacto_insumo_fichas((select id from insumos where codigo = 'T110-INS'), '00000000-0000-0000-0000-0000000000e1')));
select pg_temp.ok('impacto do insumo no Recreio lista a ficha dele',
  exists (select 1 from impacto_insumo_fichas((select id from insumos where codigo = 'T110-INS'), '00000000-0000-0000-0000-0000000000e2')));
select pg_temp.ok('visibilidade: compartilhado sim, da própria casa sim, de outra casa não',
  calc.visivel(null, '00000000-0000-0000-0000-0000000000e1')
  and calc.visivel('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e2')
  and not calc.visivel('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1'));

-- regra no banco: usuário sem acesso ao Recreio não enxerga a ficha nem o insumo dele
create temporary table _visto (n int);
grant all on _visto to authenticated;
create temporary table _tem as
select exists (select 1 from acessos_estabelecimento where user_id = '00000000-0000-0000-0000-0000000000a3'
                and estabelecimento_id = '00000000-0000-0000-0000-0000000000e2') as tem;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
insert into _visto select count(*) from receitas where codigo = 'T110-FT';
insert into _visto select count(*) from insumos where codigo = 'T110-INS';
reset role;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.ok('sem acesso à casa dona: não vê a ficha nem o insumo',
  (select tem from _tem) or (select bool_and(n = 0) from _visto),
  case when (select tem from _tem) then '(usuário de teste tem acesso ao Recreio)' else '' end);
\echo '== ITENS DA CASA OK'
