-- =====================================================================
-- Migração 0006 · Problemas médios da revisão de 15/10/2026
-- =====================================================================
-- 4) Preço de referência (copiado de outra casa) ganhava de compra própria
--    mais antiga. → compra própria sempre prevalece sobre referência.
-- 5) Mudar dimensão/densidade de insumo ou receita reescrevia custos de
--    fichas já aprovadas; qualquer gestor validava densidade.
--    → dimensão em uso não muda; densidade só pelo admin; a quantidade
--      convertida de cada componente fica gravada (congelada na aprovação).
-- 6) Qualquer gestor arquivava a versão aprovada de qualquer receita.
--    → mudança de status de versão só pelo admin.
-- 7) Preço e versão podiam ser aprovados com data retroativa.
--    → retroativo só pelo admin, com motivo; nunca antes da vigência atual.
-- Rodar depois da 0005.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4. Compra própria prevalece sobre referência
-- ---------------------------------------------------------------------
create or replace function calc.custo_insumo(p_insumo uuid, p_estab uuid, p_data timestamptz default now())
returns numeric language sql stable as $$
  select custo_unitario_base
  from historico_precos
  where insumo_id = p_insumo and estabelecimento_id = p_estab
    and status = 'validado' and valor_total > 0 and data_compra <= p_data::date
  order by (fonte = 'referencia'), data_compra desc, validado_em desc nulls last, criado_em desc
  limit 1
$$;

create or replace function calc.custo_insumo_anterior(p_insumo uuid, p_estab uuid, p_data timestamptz default now())
returns numeric language sql stable as $$
  select custo_unitario_base
  from historico_precos
  where insumo_id = p_insumo and estabelecimento_id = p_estab
    and status = 'validado' and valor_total > 0 and data_compra <= p_data::date
  order by (fonte = 'referencia'), data_compra desc, validado_em desc nulls last, criado_em desc
  offset 1 limit 1
$$;

-- ---------------------------------------------------------------------
-- 5a. Dimensão em uso não muda; densidade só pelo admin
-- ---------------------------------------------------------------------
-- auth.uid() nulo = SQL Editor / migração / seed (dono do banco): permitido.
create or replace function calc.tg_insumos() returns trigger
language plpgsql security definer set search_path = public, calc as $$
begin
  if tg_op = 'UPDATE' and new.dimensao <> old.dimensao
     and (exists (select 1 from historico_precos where insumo_id = old.id)
          or exists (select 1 from componentes_receita where insumo_id = old.id)) then
    raise exception 'Insumo % já tem preços ou fichas: a dimensão não pode mudar (crie um novo insumo)', old.nome
      using errcode = 'check_violation';
  end if;
  if (tg_op = 'INSERT' and (new.densidade_g_ml is not null or new.densidade_validada_em is not null))
     or (tg_op = 'UPDATE' and (new.densidade_g_ml, new.densidade_validada_em, new.densidade_validada_por)
                              is distinct from (old.densidade_g_ml, old.densidade_validada_em, old.densidade_validada_por)) then
    if auth.uid() is not null and not eh_admin() then
      raise exception 'Somente o administrador central altera ou valida densidade' using errcode = 'insufficient_privilege';
    end if;
    new.densidade_validada_por := case when new.densidade_validada_em is not null
                                       then coalesce(auth.uid(), new.densidade_validada_por) end;
  end if;
  return new;
end $$;
create trigger regras before insert or update on insumos
  for each row execute function calc.tg_insumos();

create or replace function calc.tg_receitas() returns trigger
language plpgsql security definer set search_path = public, calc as $$
begin
  if tg_op = 'UPDATE' and new.dimensao_saida <> old.dimensao_saida
     and (exists (select 1 from versoes_receita where receita_id = old.id)
          or exists (select 1 from componentes_receita where subproduto_id = old.id)) then
    raise exception 'Receita % já tem versões ou é usada em fichas: a dimensão não pode mudar', old.nome
      using errcode = 'check_violation';
  end if;
  if (tg_op = 'INSERT' and (new.densidade_g_ml is not null or new.densidade_validada_em is not null))
     or (tg_op = 'UPDATE' and (new.densidade_g_ml, new.densidade_validada_em)
                              is distinct from (old.densidade_g_ml, old.densidade_validada_em)) then
    if auth.uid() is not null and not eh_admin() then
      raise exception 'Somente o administrador central altera ou valida densidade' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;
create trigger regras before insert or update on receitas
  for each row execute function calc.tg_receitas();

-- ---------------------------------------------------------------------
-- 5b. Quantidade convertida gravada no componente
-- ---------------------------------------------------------------------
-- Calculada pelo trigger enquanto a versão é rascunho e recalculada na
-- aprovação; depois disso a versão é imutável e a quantidade fica fixa,
-- mesmo que a densidade mude.
alter table componentes_receita add column if not exists quantidade_base numeric;
comment on column componentes_receita.quantidade_base is
  'Quantidade na unidade-base do que o componente consome (g/mL/un), congelada na aprovação da versão';

-- Conversão com as densidades de hoje (antiga calc.qtd_base_componente)
create or replace function calc.qtd_base_componente_atual(c componentes_receita) returns numeric
language plpgsql stable as $$
begin
  if c.insumo_id is not null then
    return calc.converter(c.quantidade, c.unidade,
             (select dimensao from insumos where id = c.insumo_id), calc.densidade_insumo(c.insumo_id));
  end if;
  return calc.converter(c.quantidade, c.unidade,
           (select dimensao_saida from receitas where id = c.subproduto_id), calc.densidade_receita(c.subproduto_id));
end $$;

create or replace function calc.qtd_base_componente(c componentes_receita) returns numeric
language sql stable as $$
  select coalesce(c.quantidade_base, calc.qtd_base_componente_atual(c))
$$;

-- Igual ao da 0001, gravando quantidade_base
create or replace function calc.tg_componentes_receita() returns trigger
language plpgsql security definer set search_path = public, calc as $$
declare
  v_receita uuid;
  v_status  status_versao;
  v_ciclo   boolean;
begin
  select receita_id, status into v_receita, v_status
    from versoes_receita where id = coalesce(new.versao_id, old.versao_id);
  if v_status <> 'rascunho' then
    raise exception 'Componentes de versão aprovada não podem ser alterados';
  end if;
  if tg_op = 'DELETE' then return old; end if;

  if new.subproduto_id is not null then
    if (select tipo from receitas where id = new.subproduto_id) <> 'subproduto' then
      raise exception 'Somente subprodutos podem compor outra receita';
    end if;
    with recursive dep(rid) as (
      select new.subproduto_id
      union
      select c.subproduto_id
        from componentes_receita c
        join versoes_receita v on v.id = c.versao_id
        join dep on v.receita_id = dep.rid
       where c.subproduto_id is not null
    )
    select exists (select 1 from dep where rid = v_receita) into v_ciclo;
    if v_ciclo then
      raise exception 'Dependência circular: esta receita já é usada por %',
        (select nome from receitas where id = new.subproduto_id);
    end if;
  end if;

  new.quantidade_base := calc.qtd_base_componente_atual(new);   -- valida unidade/densidade
  return new;
end $$;

-- Preenche os componentes existentes (inclusive de versões aprovadas)
alter table componentes_receita disable trigger user;
do $$
declare c componentes_receita;
begin
  for c in select * from componentes_receita where quantidade_base is null loop
    begin
      update componentes_receita set quantidade_base = calc.qtd_base_componente_atual(c) where id = c.id;
    exception when others then
      null;  -- sem conversão possível hoje: continua calculando na hora
    end;
  end loop;
end $$;
alter table componentes_receita enable trigger user;

-- ---------------------------------------------------------------------
-- 6. Status de versão só muda pelo admin
-- ---------------------------------------------------------------------
-- Igual ao da 0001, com a checagem de admin em qualquer mudança de status
create or replace function calc.tg_versoes_receita() returns trigger
language plpgsql security definer set search_path = public, calc as $$
declare v_dim dimensao_medida;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'rascunho' then
      raise exception 'Versão % não é rascunho e não pode ser apagada', old.numero;
    end if;
    return old;
  end if;
  select dimensao_saida into v_dim from receitas where id = new.receita_id;
  if (select dimensao from unidades where codigo = new.rendimento_unidade) <> v_dim then
    raise exception 'Rendimento deve estar em unidade de %', v_dim;
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and auth.uid() is not null and not eh_admin() then
    raise exception 'Somente o administrador central muda o status de uma versão'
      using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' and old.status <> 'rascunho' then
    if not (old.status = 'aprovada' and new.status = 'arquivada'
            and (to_jsonb(new) - 'status') = (to_jsonb(old) - 'status')) then
      raise exception 'Versão aprovada é imutável: crie uma nova versão';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.status = 'rascunho' and new.status <> 'rascunho'
     and coalesce(current_setting('app.aprovando', true), '') <> 'sim' then
    raise exception 'Use aprovar_versao() para aprovar';
  end if;
  if tg_op = 'INSERT' and new.status <> 'rascunho' then
    raise exception 'Nova versão nasce como rascunho';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 7. Vigência: sem data retroativa para gestor; nunca antes da atual
-- ---------------------------------------------------------------------
-- p_ultima: vigência mais recente já registrada (preço do item ou versão da receita)
create or replace function calc.exigir_vigencia(p_data timestamptz, p_motivo text, p_ultima timestamptz)
returns void language plpgsql stable as $$
begin
  if p_data is null then
    raise exception 'Informe a data de vigência' using errcode = 'check_violation';
  end if;
  if p_ultima is not null and p_data <= p_ultima then
    raise exception 'A vigência deve ser posterior à vigência atual (%)', p_ultima using errcode = 'check_violation';
  end if;
  if p_data < now() - interval '1 hour' then
    if not public.eh_admin() then
      raise exception 'Somente o administrador central lança com data retroativa'
        using errcode = 'insufficient_privilege';
    end if;
    if coalesce(btrim(p_motivo), '') = '' then
      raise exception 'Data retroativa exige motivo' using errcode = 'check_violation';
    end if;
  end if;
end $$;

-- Igual ao da 0005, com a regra de vigência
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
  perform calc.exigir_vigencia(p_vigente_desde, p_motivo,
    (select max(vigente_desde) from precos_item_cardapio where item_id = p_item));
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

-- Igual ao da 0001, com a regra de vigência e as quantidades recalculadas na aprovação
create or replace function public.aprovar_versao(p_versao uuid, p_motivo text default null,
                                                 p_vigente_desde timestamptz default now())
returns void language plpgsql security definer set search_path = public, calc as $$
declare v versoes_receita;
begin
  if not eh_admin() then
    raise exception 'Somente o administrador central aprova versões de receita' using errcode = 'insufficient_privilege';
  end if;
  select * into v from versoes_receita where id = p_versao for update;
  if v.status <> 'rascunho' then raise exception 'Versão já aprovada/arquivada'; end if;
  if not exists (select 1 from componentes_receita where versao_id = p_versao) then
    raise exception 'Versão sem componentes';
  end if;
  perform calc.exigir_vigencia(p_vigente_desde, p_motivo,
    (select max(vigente_desde) from versoes_receita
      where receita_id = v.receita_id and status in ('aprovada','arquivada')));
  perform set_config('app.motivo', coalesce(p_motivo, 'aprovação de versão'), true);
  -- congela as quantidades com as densidades validadas de agora
  update componentes_receita set quantidade = quantidade where versao_id = p_versao;
  perform set_config('app.aprovando', 'sim', true);
  update versoes_receita set status = 'arquivada'
   where receita_id = v.receita_id and status = 'aprovada';
  update versoes_receita
     set status = 'aprovada', aprovado_por = auth.uid(), aprovado_em = now(),
         vigente_desde = p_vigente_desde, motivo_alteracao = coalesce(p_motivo, motivo_alteracao)
   where id = p_versao;
  perform set_config('app.aprovando', '', true);
end $$;

revoke all on function calc.tg_insumos() from public;
revoke all on function calc.tg_receitas() from public;
revoke all on function calc.qtd_base_componente_atual(componentes_receita) from public;
revoke all on function calc.exigir_vigencia(timestamptz, text, timestamptz) from public;
