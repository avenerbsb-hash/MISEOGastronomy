-- Verificação do seed 01 (rodar em banco limpo: stub + migrações + seed)
\set ON_ERROR_STOP on
set timezone = 'America/Sao_Paulo';
create or replace function pg_temp.ok(p_nome text, p_cond boolean, p_detalhe text default '') returns void
language plpgsql as $$ begin
  if p_cond is not true then raise exception 'FALHOU: % %', p_nome, p_detalhe; end if;
  raise notice 'OK  %  %', p_nome, p_detalhe;
end $$;
\echo '== Seed Giuli'
select pg_temp.ok('5 casas', (select count(*) = 5 from estabelecimentos));
select pg_temp.ok('71 insumos canônicos', (select count(*) = 71 from insumos));
select pg_temp.ok('362 linhas de nota guardadas, total R$ 210.028,80',
  (select count(*) = 362 and sum(valor_total) = 210028.80 from itens_importacao));
select pg_temp.ok('328 importadas, 34 pendentes',
  (select count(*) filter (where status='importado') = 328 and count(*) filter (where status='pendente') = 34 from itens_importacao));
select pg_temp.ok('valor importado bate com as linhas',
  (select sum(h.valor_total) = sum(i.valor_total) from itens_importacao i join historico_precos h on h.id = i.historico_preco_id));
select pg_temp.ok('cada uma das 4 outras casas tem 67 preços de referência',
  (select bool_and(c = 67) from (select count(*) c from historico_precos where fonte = 'referencia' group by estabelecimento_id) x)
  and (select count(distinct estabelecimento_id) = 4 from historico_precos where fonte = 'referencia'));

-- custo por kg (sem usuário: chama o motor interno direto)
select pg_temp.ok('Contrafilé no Giuli = R$ 79,99/kg (JR 13/10)',
  round(calc.custo_insumo((select id from insumos where codigo='BOV-001'), (select id from estabelecimentos where nome='Giuli Osteria'))*1000, 2) = 79.99);
select pg_temp.ok('Contrafilé em 10/09 = R$ 89,99/kg (histórico)',
  round(calc.custo_insumo((select id from insumos where codigo='BOV-001'), (select id from estabelecimentos where nome='Giuli Osteria'), '2026-09-10')*1000, 2) = 89.99);
select pg_temp.ok('Contrafilé no Alma (referência) = R$ 79,99/kg',
  round(calc.custo_insumo((select id from insumos where codigo='BOV-001'), (select id from estabelecimentos where nome like 'Alma%'))*1000, 2) = 79.99);
select pg_temp.ok('Leite caixa 12 L a R$ 69,78 = R$ 5,82/L',
  round(calc.custo_insumo((select id from insumos where codigo='LAT-012'), (select id from estabelecimentos where nome='Recreio Bar'))*1000, 2) = 5.82,
  (round(calc.custo_insumo((select id from insumos where codigo='LAT-012'), (select id from estabelecimentos where nome='Recreio Bar'))*1000, 4))::text);
select pg_temp.ok('Requeijão 1,5 kg a R$ 61,28 = R$ 40,85/kg',
  round(calc.custo_insumo((select id from insumos where codigo='LAT-013'), (select id from estabelecimentos where nome='Giuli Osteria'))*1000, 2) = 40.85);

-- Pendência resolvida por um admin: bandeja de ovos = 30
insert into auth.users values ('00000000-0000-0000-0000-0000000000a1', 'admin@jf.test');
insert into perfis (user_id, nome, admin) values ('00000000-0000-0000-0000-0000000000a1', 'Admin', true);
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
-- este teste confere a conversão, não a conferência de altas (0012): limite alto nas casas
insert into limites_conferencia_preco (estabelecimento_id, limite_pct) select id, 9999 from estabelecimentos;
select pg_temp.ok('confirmar 30 ovos por bandeja importa 11 notas',
  confirmar_conversao((select id from fornecedores where nome = 'Com. de Melancias (Flor de Goiás)'), 'OVOS BRANCO GRANDE', 30, 'un') = 11);
select pg_temp.ok('ovo no Giuli = R$ 0,60 (R$ 18 / 30)',
  round(calc.custo_insumo((select id from insumos where codigo='OVO-001'), (select id from estabelecimentos where nome='Giuli Osteria')), 2) = 0.60);
select pg_temp.ok('copiar referência leva o ovo para as 4 casas',
  (select sum(copiar_precos_referencia((select id from estabelecimentos where nome='Giuli Osteria'), id))
     from estabelecimentos where nome <> 'Giuli Osteria') = 4);
\echo '== SEED OK'
