-- =====================================================================
-- Migração 0005 · Correções da revisão de 15/10/2026
-- =====================================================================
-- 1) Lote de produção com unidade incompatível travava rendimento_lotes()
--    para sempre (lotes_producao é somente-inserção).
--    → unidade validada na gravação; relatório tolera lotes antigos inválidos.
-- 2) Divisão por zero derrubava painel_cmv() e cmv_da_casa() quando o preço
--    sugerido arredondava para R$ 0,00 (custo zero ou quase zero).
--    → divisões protegidas; bonificação (nota com valor R$ 0) não vira
--      custo do insumo; aprovar_preco() recusa preço <= 0 com mensagem clara.
-- 3) confirmar_conversao() alterava alias_insumo antes de checar permissão
--    e falhava inteira se outra casa tivesse linha pendente igual.
--    → permissão checada antes de tudo; importa só as casas do usuário.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Lotes de produção
-- ---------------------------------------------------------------------

-- Conversão que devolve NULL em vez de erro (para relatórios)
create or replace function calc.converter_ou_nulo(p_qtd numeric, p_unidade text, p_dim_alvo dimensao_medida)
returns numeric language plpgsql stable as $$
begin
  return calc.converter(p_qtd, p_unidade, p_dim_alvo, null);
exception when check_violation then
  return null;
end $$;

-- Unidade do lote precisa ser da mesma dimensão do rendimento da receita
create or replace function calc.tg_lotes_producao() returns trigger
language plpgsql security definer set search_path = public, calc as $$
declare v_dim dimensao_medida;
begin
  select r.dimensao_saida into v_dim
    from versoes_receita v join receitas r on r.id = v.receita_id
   where v.id = new.versao_id;
  perform calc.converter(new.quantidade_obtida, new.unidade, v_dim, null);  -- check_violation se incompatível
  return new;
end $$;
create trigger valida_unidade before insert on lotes_producao
  for each row execute function calc.tg_lotes_producao();

-- Relatório: lote antigo com unidade incompatível aparece com obtido/desvio
-- vazios e alerta = true, sem derrubar os demais
create or replace function public.rendimento_lotes(p_estab uuid)
returns table (lote_id uuid, receita text, versao int, produzido_em timestamptz,
               esperado numeric, obtido numeric, unidade_base text, desvio_pct numeric, alerta boolean)
language plpgsql stable security definer set search_path = public, calc as $$
begin
  if not tem_acesso(p_estab) then
    raise exception 'Sem acesso a esta casa' using errcode = 'insufficient_privilege';
  end if;
  return query
  select l.id, r.nome, v.numero, l.produzido_em,
         q.esp, q.obt,
         calc.unidade_base(r.dimensao_saida),
         round(100 * (q.obt / q.esp - 1), 1),
         case when q.obt is null then true
              else abs(100 * (q.obt / q.esp - 1)) > e.tolerancia_rendimento_pct end
    from lotes_producao l
    join versoes_receita v on v.id = l.versao_id
    join receitas r on r.id = v.receita_id
    join estabelecimentos e on e.id = l.estabelecimento_id
    cross join lateral (
      select calc.converter(v.rendimento_quantidade, v.rendimento_unidade, r.dimensao_saida) * l.fator_escala as esp,
             calc.converter_ou_nulo(l.quantidade_obtida, l.unidade, r.dimensao_saida) as obt) q
   where l.estabelecimento_id = p_estab
   order by l.produzido_em desc;
end $$;

-- ---------------------------------------------------------------------
-- 2. Custo zero e divisão por zero
-- ---------------------------------------------------------------------

-- Bonificação (valor R$ 0) fica no histórico, mas não define o custo do insumo
create or replace function calc.custo_insumo(p_insumo uuid, p_estab uuid, p_data timestamptz default now())
returns numeric language sql stable as $$
  select custo_unitario_base
  from historico_precos
  where insumo_id = p_insumo and estabelecimento_id = p_estab
    and status = 'validado' and valor_total > 0 and data_compra <= p_data::date
  order by data_compra desc, validado_em desc nulls last, criado_em desc
  limit 1
$$;

create or replace function calc.custo_insumo_anterior(p_insumo uuid, p_estab uuid, p_data timestamptz default now())
returns numeric language sql stable as $$
  select custo_unitario_base
  from historico_precos
  where insumo_id = p_insumo and estabelecimento_id = p_estab
    and status = 'validado' and valor_total > 0 and data_compra <= p_data::date
  order by data_compra desc, validado_em desc nulls last, criado_em desc
  offset 1 limit 1
$$;

-- Referência entre casas: igual à da 0002, sem copiar bonificação como preço
create or replace function public.copiar_precos_referencia(p_origem uuid, p_destino uuid)
returns int language plpgsql security definer set search_path = public, calc as $$
declare v_n int;
begin
  perform calc.exigir_custos(p_origem);
  perform calc.exigir_custos(p_destino);
  insert into historico_precos (insumo_id, estabelecimento_id, fornecedor_id, data_compra, quantidade, unidade,
                                valor_total, fonte, documento_ref, status, observacao)
  select h.insumo_id, p_destino, h.fornecedor_id, h.data_compra, h.quantidade, h.unidade, h.valor_total,
         'referencia', h.documento_ref, 'validado',
         'Referência copiada de ' || (select nome from estabelecimentos where id = p_origem)
         || '; substituir pela primeira compra desta casa'
    from insumos i
    cross join lateral (
      select * from historico_precos x
       where x.insumo_id = i.id and x.estabelecimento_id = p_origem and x.status = 'validado' and x.valor_total > 0
       order by x.data_compra desc, x.validado_em desc nulls last, x.criado_em desc
       limit 1) h
   where not exists (select 1 from historico_precos y
                      where y.insumo_id = i.id and y.estabelecimento_id = p_destino
                        and y.status = 'validado' and y.valor_total > 0);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Painel: igual ao da 0004, com as divisões pelo preço arredondado protegidas
create or replace function public.painel_cmv(p_estab uuid, p_data timestamptz default now())
returns table (item_id uuid, cardapio text, produto text, custo_porcao numeric,
               preco_publicado numeric, cmv_atual_pct numeric,
               cmv_alvo_pct numeric,
               origem_referencia text,
               preco_sugerido numeric,
               preco_sugerido_arredondado numeric,
               cmv_preco_arredondado_pct numeric,
               preco_sugerido_margem numeric,
               preco_sugerido_margem_arredondado numeric,
               cmv_preco_margem_arredondado_pct numeric,
               margem_atual numeric, margem_referencia numeric,
               situacao text)
language plpgsql stable security definer set search_path = public, calc as $$
begin
  perform calc.exigir_custos(p_estab);
  return query
  with base as (
    select it.id, cd.nome as cardapio, coalesce(it.nome_exibicao, r.nome) as produto,
           calc.custo_unitario_receita(it.receita_id, p_estab, p_data) as custo,
           calc.preco_publicado(it.id, p_data) as preco,
           ref.cmv_ref, ref.origem, ref.preco_ref, ref.custo_ref,
           e.regra_arredondamento as regra
      from itens_cardapio it
      join cardapios cd on cd.id = it.cardapio_id
      join estabelecimentos e on e.id = cd.estabelecimento_id
      join receitas r on r.id = it.receita_id
      cross join lateral calc.referencia_item(it.id, p_data) ref
     where cd.estabelecimento_id = p_estab and it.ativo and cd.status <> 'arquivado'
  ), s as (
    select b.*,
           case when b.custo is not null and b.cmv_ref > 0 then b.custo / (b.cmv_ref / 100) end as sug_cmv,
           case when b.custo is not null and b.preco_ref is not null and b.custo_ref is not null
                then b.custo + (b.preco_ref - b.custo_ref) end as sug_margem
      from base b
  )
  select s.id, s.cardapio, s.produto, round(s.custo, 2), s.preco,
         case when s.preco > 0 then round(100 * s.custo / s.preco, 1) end,
         round(s.cmv_ref, 1), s.origem,
         round(s.sug_cmv, 2),
         calc.arredondar_preco(s.sug_cmv, s.regra),
         round(100 * s.custo / nullif(calc.arredondar_preco(s.sug_cmv, s.regra), 0), 1),
         round(s.sug_margem, 2),
         calc.arredondar_preco(s.sug_margem, s.regra),
         case when s.sug_margem > 0
              then round(100 * s.custo / nullif(calc.arredondar_preco(s.sug_margem, s.regra), 0), 1) end,
         case when s.preco is not null then round(s.preco - s.custo, 2) end,
         case when s.preco_ref is not null then round(s.preco_ref - s.custo_ref, 2) end,
         case when s.custo is null   then 'sem_custo'
              when s.cmv_ref is null then 'sem_alvo'
              when s.preco is null   then 'sem_preco'
              when 100 * s.custo / s.preco > s.cmv_ref + 0.05 then 'acima_do_alvo'
              when 100 * s.custo / s.preco < s.cmv_ref - 5    then 'abaixo_do_alvo'
              else 'ok' end
    from s
   order by s.cardapio, s.produto;
end $$;

-- Aprovação de preço: igual à da 0004, recusando preço <= 0 antes de dividir
create or replace function public.aprovar_preco(p_item uuid, p_preco numeric, p_motivo text default null,
                                                p_vigente_desde timestamptz default now())
returns uuid language plpgsql security definer set search_path = public, calc as $$
declare v_estab uuid; v_receita uuid; v_ref numeric; v_custo numeric; v_id uuid;
begin
  if p_preco is null or p_preco <= 0 then
    raise exception 'Preço deve ser maior que zero' using errcode = 'check_violation';
  end if;
  select cd.estabelecimento_id, it.receita_id into v_estab, v_receita
    from itens_cardapio it join cardapios cd on cd.id = it.cardapio_id
   where it.id = p_item;
  if v_estab is null then raise exception 'Item inexistente'; end if;
  perform calc.exigir_custos(v_estab);
  select cmv_ref into v_ref from calc.referencia_item(p_item, p_vigente_desde);
  v_custo := calc.custo_unitario_receita(v_receita, v_estab, p_vigente_desde);
  perform set_config('app.motivo', coalesce(p_motivo, 'aprovação de preço'), true);
  insert into precos_item_cardapio (item_id, preco, vigente_desde, custo_no_momento, cmv_no_momento,
                                    sugerido_no_momento, aprovado_por, motivo)
  values (p_item, p_preco, p_vigente_desde, v_custo,
          case when v_custo is not null then round(100 * v_custo / p_preco, 2) end,
          case when v_custo is not null and v_ref > 0 then round(v_custo / (v_ref / 100), 2) end,
          auth.uid(), p_motivo)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 3. confirmar_conversao: permissão primeiro; só as casas do usuário
-- ---------------------------------------------------------------------
-- O alias é do catálogo (vale para todas as casas), então exige o mesmo
-- direito da política de escrita de alias_insumo: gestor de alguma casa.
-- Linhas pendentes de casas em que o usuário não é gestor ficam pendentes.
create or replace function public.confirmar_conversao(p_fornecedor uuid, p_descricao text,
                                                      p_qtd_por_unidade numeric, p_unidade text)
returns int language plpgsql security definer set search_path = public, calc as $$
declare
  it itens_importacao;
  v_insumo uuid;
  v_hist uuid;
  v_n int := 0;
begin
  if not eh_gestor_de_alguma() then
    raise exception 'Sem permissão para confirmar conversões' using errcode = 'insufficient_privilege';
  end if;
  if p_qtd_por_unidade is null or p_qtd_por_unidade <= 0 then
    raise exception 'Informe a quantidade por unidade da nota';
  end if;
  select insumo_id into v_insumo from alias_insumo
   where fornecedor_id is not distinct from p_fornecedor and lower(descricao_original) = lower(p_descricao);
  if v_insumo is null then raise exception 'Descrição sem insumo vinculado: %', p_descricao; end if;

  update alias_insumo set quantidade_por_un = p_qtd_por_unidade, unidade = p_unidade
   where fornecedor_id is not distinct from p_fornecedor and lower(descricao_original) = lower(p_descricao);

  for it in select * from itens_importacao
             where fornecedor_id is not distinct from p_fornecedor
               and lower(descricao_original) = lower(p_descricao) and status = 'pendente'
             order by data_compra, criado_em
  loop
    continue when not pode_ver_custos(it.estabelecimento_id);
    insert into historico_precos (insumo_id, estabelecimento_id, fornecedor_id, data_compra, quantidade, unidade,
                                  valor_total, fonte, documento_ref, status, observacao)
    values (v_insumo, it.estabelecimento_id, it.fornecedor_id, it.data_compra,
            it.quantidade_nota * p_qtd_por_unidade, p_unidade, it.valor_total, 'relatorio_nfe',
            it.documento_ref, 'validado',
            format('%s: %s %s × R$ %s', it.lote_importacao, it.quantidade_nota, it.unidade_nota, it.preco_unitario_nota))
    returning id into v_hist;
    update itens_importacao set status = 'importado', historico_preco_id = v_hist, motivo_pendencia = null
     where id = it.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

revoke all on function calc.converter_ou_nulo(numeric, text, dimensao_medida) from public;
revoke all on function calc.tg_lotes_producao() from public;
