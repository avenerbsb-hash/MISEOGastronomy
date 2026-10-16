-- =====================================================================
-- 0014 — Conferência de compras: justificativa opcional
-- Aprovar, corrigir ou rejeitar uma compra com alta acima do limite não exige
-- mais justificativa. Se for escrita, continua gravada na conferência e na
-- observação da compra; o responsável e a data são gravados sempre.
-- Pode rodar de novo (create or replace).
-- =====================================================================

create or replace function public.resolver_conferencia(p_conferencia uuid, p_acao text, p_justificativa text,
                                                       p_quantidade numeric default null, p_unidade text default null,
                                                       p_valor numeric default null)
returns uuid language plpgsql security definer set search_path = public, calc as $$
declare c conferencias_preco; h historico_precos; v_novo uuid;
        v_just text := nullif(btrim(coalesce(p_justificativa, '')), '');
begin
  select * into c from conferencias_preco where id = p_conferencia for update;
  if not found then raise exception 'Conferência não encontrada'; end if;
  perform calc.exigir_custos(c.estabelecimento_id);
  if c.status <> 'aberta' then raise exception 'Esta conferência já foi resolvida'; end if;
  select * into h from historico_precos where id = c.historico_preco_id;

  if p_acao = 'aprovar' then
    update historico_precos set status = 'validado', validado_por = auth.uid(), validado_em = now(),
           observacao = concat_ws(' · ', observacao, 'Conferência aprovada' || coalesce(': ' || v_just, ''))
     where id = h.id;
    update conferencias_preco set status = 'aprovada' where id = c.id;
  elsif p_acao = 'rejeitar' then
    update historico_precos set status = 'rejeitado', validado_por = auth.uid(), validado_em = now(),
           observacao = concat_ws(' · ', observacao, 'Conferência rejeitada' || coalesce(': ' || v_just, ''))
     where id = h.id;
    update conferencias_preco set status = 'rejeitada' where id = c.id;
  elsif p_acao = 'corrigir' then
    if p_quantidade is null or p_quantidade <= 0 or p_unidade is null or p_valor is null or p_valor <= 0 then
      raise exception 'Informe quantidade, unidade e valor corrigidos' using errcode = 'check_violation';
    end if;
    update historico_precos set status = 'rejeitado', validado_por = auth.uid(), validado_em = now(),
           observacao = concat_ws(' · ', observacao, 'Corrigido na conferência' || coalesce(': ' || v_just, ''))
     where id = h.id;
    perform set_config('app.conferido', 'sim', true);
    insert into historico_precos (insumo_id, estabelecimento_id, fornecedor_id, data_compra, quantidade, unidade,
                                  valor_total, fonte, documento_ref, status, observacao)
    values (h.insumo_id, h.estabelecimento_id, h.fornecedor_id, h.data_compra, p_quantidade, p_unidade,
            p_valor, h.fonte, h.documento_ref, 'validado', 'Correção da conferência' || coalesce(': ' || v_just, ''))
    returning id into v_novo;
    perform set_config('app.conferido', '', true);
    update conferencias_preco set status = 'corrigida', registro_corrigido_id = v_novo where id = c.id;
  else
    raise exception 'Ação inválida: use aprovar, corrigir ou rejeitar';
  end if;

  update conferencias_preco set justificativa = v_just, resolvido_por = auth.uid(), resolvido_em = now()
   where id = c.id;
  return coalesce(v_novo, h.id);
end $$;
