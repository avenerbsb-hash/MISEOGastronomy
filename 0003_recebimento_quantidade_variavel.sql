-- =====================================================================
-- Migração 0003 · Itens de quantidade variável medidos no recebimento
-- =====================================================================
-- Regra do Grupo JF+: caixas e peças cujo peso/quantidade varia (costela em
-- caixa, bacon em peças, pepperoni, presunto, salame, burrata avulsa, ovos,
-- mel) NÃO têm conversão fixa. No recebimento a equipe pesa/conta e lança a
-- quantidade real junto com o valor pago.

-- 1) Marca no alias: esta descrição de nota exige medição no recebimento
alter table alias_insumo
  add column if not exists medir_no_recebimento boolean not null default false;

comment on column alias_insumo.medir_no_recebimento is
  'true = quantidade varia a cada entrega; pesar/contar no recebimento e lançar a quantidade real';

-- 2) Registrar o recebimento de uma linha de nota pendente com a quantidade medida
--    Ex.: caixa de costela pesou 19,4 kg → registrar_recebimento(<item>, 19.4, 'kg')
create or replace function public.registrar_recebimento(p_item uuid, p_quantidade numeric, p_unidade text)
returns uuid language plpgsql security definer set search_path = public, calc as $$
declare it itens_importacao; v_hist uuid;
begin
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Informe a quantidade medida no recebimento';
  end if;
  select * into it from itens_importacao where id = p_item for update;
  if not found then raise exception 'Item de nota inexistente'; end if;
  perform calc.exigir_custos(it.estabelecimento_id);
  if it.status = 'importado' then raise exception 'Este item já foi registrado'; end if;
  if it.insumo_id is null then raise exception 'Item sem insumo vinculado'; end if;

  insert into historico_precos (insumo_id, estabelecimento_id, fornecedor_id, data_compra, quantidade, unidade,
                                valor_total, fonte, documento_ref, status, observacao)
  values (it.insumo_id, it.estabelecimento_id, it.fornecedor_id, it.data_compra, p_quantidade, p_unidade,
          it.valor_total, 'relatorio_nfe', it.documento_ref, 'validado',
          format('Medido no recebimento: %s %s (nota: %s %s × R$ %s)', p_quantidade, p_unidade,
                 it.quantidade_nota, it.unidade_nota, it.preco_unitario_nota))
  returning id into v_hist;

  update itens_importacao
     set status = 'importado', historico_preco_id = v_hist, motivo_pendencia = null
   where id = p_item;
  return v_hist;
end $$;

grant execute on function public.registrar_recebimento to authenticated;

-- 3) Mensagem de unidade incompatível mais clara para quem lança (ex.: salame em "un")
create or replace function calc.converter(p_qtd numeric, p_unidade text,
                                          p_dim_alvo dimensao_medida, p_densidade numeric default null)
returns numeric language plpgsql stable as $$
declare u unidades;
  v_esperado text := case p_dim_alvo when 'massa' then 'g ou kg' when 'volume' then 'mL ou L' else 'unidades (un)' end;
begin
  select * into u from unidades where codigo = p_unidade;
  if not found then raise exception 'Unidade desconhecida: %', p_unidade; end if;
  if u.dimensao = p_dim_alvo then
    return p_qtd * u.fator_para_base;
  end if;
  if u.dimensao = 'contagem' or p_dim_alvo = 'contagem' then
    raise exception 'Unidade incompatível: este item é medido em %; lance em %', p_dim_alvo, v_esperado
      using errcode = 'check_violation';
  end if;
  if p_densidade is null then
    raise exception 'Conversão de % para % exige densidade validada; lance em %', u.dimensao, p_dim_alvo, v_esperado
      using errcode = 'check_violation';
  end if;
  if u.dimensao = 'volume' and p_dim_alvo = 'massa' then
    return p_qtd * u.fator_para_base * p_densidade;
  end if;
  return p_qtd * u.fator_para_base / p_densidade;
end $$;
