-- Verificação da migração 0003 + seed 02 (banco: migrações + seed 01 + seed 02)
\set ON_ERROR_STOP on
set timezone = 'America/Sao_Paulo';
create or replace function pg_temp.ok(p_nome text, p_cond boolean, p_detalhe text default '') returns void
language plpgsql as $$ begin
  if p_cond is not true then raise exception 'FALHOU: % %', p_nome, p_detalhe; end if;
  raise notice 'OK  %  %', p_nome, p_detalhe;
end $$;
\echo '== Recebimento com quantidade medida'
select pg_temp.ok('mel passou a ser medido em mL', (select dimensao = 'volume' from insumos where codigo = 'MEL-001'));
select pg_temp.ok('10 descrições marcadas para medir no recebimento',
  (select count(*) = 10 from alias_insumo where medir_no_recebimento), (select count(*)::text from alias_insumo where medir_no_recebimento));
select pg_temp.ok('34 linhas antigas guardadas como ignoradas, nenhuma pendente',
  (select count(*) filter (where status = 'ignorado') = 34 and count(*) filter (where status = 'pendente') = 0 from itens_importacao));
select pg_temp.ok('burrata em pote de 120/150/180 g continua com conversão fixa',
  (select count(*) = 3 from alias_insumo a join insumos i on i.id = a.insumo_id
    where i.codigo = 'LAT-010' and not a.medir_no_recebimento and a.quantidade_por_un in (120,150,180)));

insert into auth.users values ('00000000-0000-0000-0000-0000000000a1', 'admin@jf.test');
insert into perfis (user_id, nome, admin) values ('00000000-0000-0000-0000-0000000000a1', 'Admin', true);
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

-- Linha de costela suína de 03/09: o recebimento pesou 19,4 kg
select registrar_recebimento(
  (select id from itens_importacao where descricao_original like 'CARNE CONG DE SUINO COM OSSO%' and data_compra = '2026-09-03'),
  19.4, 'kg');
select pg_temp.ok('costela suína = valor da nota / 19,4 kg',
  round(calc.custo_insumo((select id from insumos where codigo='SUI-003'), (select id from estabelecimentos where nome='Giuli Osteria'))*1000, 2)
  = (select round(valor_total / 19.4, 2) from itens_importacao where descricao_original like 'CARNE CONG DE SUINO COM OSSO%' and data_compra = '2026-09-03'),
  (select 'R$ ' || valor_total || ' / 19,4 kg' from itens_importacao where descricao_original like 'CARNE CONG DE SUINO COM OSSO%' and data_compra = '2026-09-03'));

-- Última nota de mel: cada pote medido com 500 mL (quantidade total = potes × 500)
select registrar_recebimento(i.id, i.quantidade_nota * 500, 'ml')
  from (select * from itens_importacao where descricao_original = 'MEL' order by data_compra desc limit 1) i;
select pg_temp.ok('mel = preço do pote / 500 mL',
  round(calc.custo_insumo((select id from insumos where codigo='MEL-001'), (select id from estabelecimentos where nome='Giuli Osteria')), 4)
  = (select round(preco_unitario_nota / 500, 4) from itens_importacao where descricao_original = 'MEL' and status = 'importado'));

-- Última nota de ovos: bandejas contadas com 30 ovos cada
select registrar_recebimento(i.id, i.quantidade_nota * 30, 'un')
  from (select * from itens_importacao where descricao_original = 'OVOS BRANCO GRANDE' order by data_compra desc limit 1) i;
select pg_temp.ok('ovo = R$ 18 / 30 = R$ 0,60 a unidade',
  round(calc.custo_insumo((select id from insumos where codigo='OVO-001'), (select id from estabelecimentos where nome='Giuli Osteria')), 2) = 0.60);

do $$ begin
  perform registrar_recebimento((select id from itens_importacao where descricao_original = 'MEL' and status = 'importado'), 500, 'ml');
  raise exception 'FALHOU: registrou duas vezes';
exception when others then
  if sqlerrm like 'Este item já foi registrado%' then raise notice 'OK  mesmo item não é registrado duas vezes'; else raise; end if;
end $$;
do $$ begin
  perform registrar_recebimento((select id from itens_importacao where descricao_original = 'SALAME' limit 1), 2, 'un');
  raise exception 'FALHOU: salame aceito em unidade';
exception when check_violation then raise notice 'OK  salame só aceita peso (g/kg): %', sqlerrm;
end $$;
\echo '== RECEBIMENTO OK'
