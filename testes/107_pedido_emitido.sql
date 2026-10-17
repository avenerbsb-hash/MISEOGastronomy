-- Pedido da semana pendente até emitir o PDF (migração 0027). Rodar no aceite, depois do 106.
\set ON_ERROR_STOP on
set client_min_messages = notice;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.ok(p_nome text, p_cond boolean, p_detalhe text default '') returns void
language plpgsql as $$ begin
  if p_cond is not true then raise exception 'FALHOU: % %', p_nome, p_detalhe; end if;
  raise notice 'OK  %  %', p_nome, p_detalhe;
end $$;

\echo '== Pedido emitido'
select pg_temp.ok('última contagem começa com o pedido pendente',
  (select contagem_id is not null and emitido_em is null from situacao_pedido_estoque('00000000-0000-0000-0000-0000000000e1')));

-- quem não é gestor, gerência ou estoquista não emite
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
  begin
    perform marcar_pedido_emitido('00000000-0000-0000-0000-0000000000e1',
      (select contagem_id from situacao_pedido_estoque('00000000-0000-0000-0000-0000000000e1')));
    if (select papel_em('00000000-0000-0000-0000-0000000000e1')) not in ('admin', 'gestor', 'gerente', 'estoquista') then
      raise exception 'FALHOU: papel % emitiu o pedido', papel_em('00000000-0000-0000-0000-0000000000e1');
    end if;
  exception when insufficient_privilege then raise notice 'OK  produção não emite o pedido';
  end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

-- gestor/admin emite: grava quem e quando
select marcar_pedido_emitido('00000000-0000-0000-0000-0000000000e1',
  (select contagem_id from situacao_pedido_estoque('00000000-0000-0000-0000-0000000000e1')));
create temporary table _emitido as select emitido_em, emitido_por from situacao_pedido_estoque('00000000-0000-0000-0000-0000000000e1');
select pg_temp.ok('emitir o PDF marca o pedido com hora e responsável',
  (select emitido_em is not null and emitido_por is not null from _emitido));

-- emitir de novo não troca a hora da primeira emissão
select marcar_pedido_emitido('00000000-0000-0000-0000-0000000000e1',
  (select contagem_id from situacao_pedido_estoque('00000000-0000-0000-0000-0000000000e1')));
select pg_temp.ok('segunda emissão mantém a primeira hora',
  (select s.emitido_em = e.emitido_em from situacao_pedido_estoque('00000000-0000-0000-0000-0000000000e1') s, _emitido e));

-- contagem nova abre pedido novo, pendente
select registrar_contagem('00000000-0000-0000-0000-0000000000e1',
  (select jsonb_agg(jsonb_build_object('insumo_id', ci.insumo_id, 'deposito', 1, 'bar', 0))
     from contagem_itens ci
    where ci.contagem_id = (select contagem_id from ultimas_contagens('00000000-0000-0000-0000-0000000000e1', 1))),
  'teste 107');
select pg_temp.ok('contagem nova volta o pedido para pendente',
  (select emitido_em is null from situacao_pedido_estoque('00000000-0000-0000-0000-0000000000e1')));
\echo '== PEDIDO EMITIDO OK'
