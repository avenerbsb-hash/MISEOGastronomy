-- =====================================================================
-- 0016 — Estorno de compra já validada (com correção opcional)
-- Para erro que passou da conferência (ex.: nota que cobrou "0,1 pacote de
-- R$ 450" = 1 fava por R$ 45 e virou R$ 450 a fava):
-- • Só o administrador estorna, sempre com motivo.
-- • Nada é apagado nem tem valor alterado: a compra muda de "validado" para
--   "rejeitado" e ganha na observação o motivo, quem estornou e quando.
-- • Correção opcional: grava a compra certa (mesma data, nota e fornecedor)
--   já validada, sem passar pela conferência.
-- • "Todas as casas": estorna também a mesma compra nas outras casas (as
--   notas importadas valem para todas): mesmo insumo, data, nota, fornecedor,
--   quantidade e valor.
-- Pode rodar de novo (create or replace).
-- =====================================================================

-- 1. Trigger do histórico: além de pendente → validado/rejeitado, aceita
--    validado → rejeitado quando vem do estorno (app.estorno = 'sim')
create or replace function calc.tg_historico_precos() returns trigger
language plpgsql security definer set search_path = public, calc as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Histórico de preços não pode ser apagado (use status rejeitado)';
  end if;
  if tg_op = 'INSERT' then
    new.quantidade_base := calc.converter(new.quantidade, new.unidade,
                             (select dimensao from insumos where id = new.insumo_id),
                             calc.densidade_insumo(new.insumo_id));
    new.custo_unitario_base := new.valor_total / new.quantidade_base;
    if new.status = 'validado' then
      new.validado_por := coalesce(new.validado_por, auth.uid());
      new.validado_em  := coalesce(new.validado_em, now());
    end if;
    return new;
  end if;
  -- UPDATE: só muda status, validação e observação; os valores da compra nunca mudam
  if (to_jsonb(new) - array['status','validado_por','validado_em','observacao'])
     <> (to_jsonb(old) - array['status','validado_por','validado_em','observacao']) then
    raise exception 'Registro de preço é imutável; apenas validação/rejeição de pendentes é permitida';
  end if;
  if old.status = 'pendente' and new.status <> 'pendente' then
    null;  -- conferência / validação de pendente
  elsif old.status = 'validado' and new.status = 'rejeitado'
        and coalesce(current_setting('app.estorno', true), '') = 'sim' then
    null;  -- estorno (estornar_compra)
  else
    raise exception 'Registro de preço é imutável; apenas validação/rejeição de pendentes é permitida';
  end if;
  new.validado_por := coalesce(new.validado_por, auth.uid());
  new.validado_em  := coalesce(new.validado_em, now());
  return new;
end $$;

-- 2. Estorno (com correção opcional). Devolve quantas compras foram estornadas.
create or replace function public.estornar_compra(p_registro uuid, p_motivo text, p_todas_casas boolean default false,
                                                  p_quantidade numeric default null, p_unidade text default null,
                                                  p_valor numeric default null)
returns int language plpgsql security definer set search_path = public, calc as $$
declare h historico_precos; r historico_precos; n int := 0;
        v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
        v_quem text := coalesce((select nome from perfis where user_id = auth.uid()), 'administrador');
        v_corrigir boolean := p_quantidade is not null or p_unidade is not null or p_valor is not null;
begin
  if auth.uid() is not null and not eh_admin() then
    raise exception 'Só o administrador pode estornar uma compra validada' using errcode = 'insufficient_privilege';
  end if;
  if v_motivo is null then
    raise exception 'Informe o motivo do estorno' using errcode = 'check_violation';
  end if;
  select * into h from historico_precos where id = p_registro;
  if not found then raise exception 'Compra não encontrada'; end if;
  if h.status <> 'validado' then raise exception 'Só compra validada pode ser estornada'; end if;
  if v_corrigir and (p_quantidade is null or p_quantidade <= 0 or p_unidade is null or p_valor is null or p_valor <= 0) then
    raise exception 'Para corrigir, informe quantidade, unidade e valor' using errcode = 'check_violation';
  end if;

  for r in
    select * from historico_precos x
     where x.status = 'validado'
       and (x.id = h.id
            or (p_todas_casas and x.insumo_id = h.insumo_id and x.data_compra = h.data_compra
                and x.documento_ref is not distinct from h.documento_ref and x.fornecedor_id is not distinct from h.fornecedor_id
                and x.quantidade = h.quantidade and x.unidade = h.unidade and x.valor_total = h.valor_total))
     order by x.estabelecimento_id
  loop
    perform set_config('app.estorno', 'sim', true);
    update historico_precos
       set status = 'rejeitado',
           observacao = concat_ws(' · ', observacao, 'Estornada por ' || v_quem || ' em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ': ' || v_motivo)
     where id = r.id;
    perform set_config('app.estorno', '', true);
    if v_corrigir then
      perform set_config('app.conferido', 'sim', true);
      insert into historico_precos (insumo_id, estabelecimento_id, fornecedor_id, data_compra, quantidade, unidade,
                                    valor_total, fonte, documento_ref, status, observacao)
      values (r.insumo_id, r.estabelecimento_id, r.fornecedor_id, r.data_compra, p_quantidade, p_unidade,
              p_valor, r.fonte, r.documento_ref, 'validado', 'Correção do estorno: ' || v_motivo);
      perform set_config('app.conferido', '', true);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.estornar_compra(uuid, text, boolean, numeric, text, numeric) from public;
grant execute on function public.estornar_compra(uuid, text, boolean, numeric, text, numeric) to authenticated;
