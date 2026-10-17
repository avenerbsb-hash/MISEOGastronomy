-- =====================================================================
-- 0028 — Cadastro de casas pela tela
-- • criar_casa (só administrador): nome, marca, meta de CMV e regra de
--   arredondamento. Opcional:
--     - copiar os preços de referência de outra casa (último preço validado
--       de cada insumo, marcado como "referência" até a primeira compra);
--     - copiar os cardápios de outra casa (seções, ordem e fichas; os preços
--       de venda NÃO são copiados — cada casa define os seus).
-- • atualizar_casa (só administrador): nome, marca, ativa/desativada.
--   Desativar não apaga nada; a casa some das listas e pode voltar.
-- • definir_parametros_casa (gestor ou administrador da casa): meta de CMV
--   e regra de arredondamento dos preços sugeridos.
-- • listar_casas_admin: todas as casas (inclusive desativadas) com números
--   para a tela de casas.
-- Pode rodar de novo.
-- =====================================================================

create or replace function public.criar_casa(p_nome text, p_marca text, p_cmv_alvo numeric, p_regra text,
                                             p_precos_de uuid default null, p_cardapio_de uuid default null)
returns uuid language plpgsql security definer set search_path = public, calc as $$
declare
  v_id uuid;
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
begin
  if auth.uid() is not null and not eh_admin() then
    raise exception 'Só o administrador cadastra casas' using errcode = 'insufficient_privilege';
  end if;
  if v_nome is null then raise exception 'Informe o nome da casa' using errcode = 'check_violation'; end if;
  if exists (select 1 from estabelecimentos where lower(nome) = lower(v_nome)) then
    raise exception 'Já existe uma casa com o nome "%"', v_nome using errcode = 'unique_violation';
  end if;
  if p_cmv_alvo is not null and not (p_cmv_alvo > 0 and p_cmv_alvo < 100) then
    raise exception 'A meta de CMV deve ficar entre 0 e 100%%' using errcode = 'check_violation';
  end if;

  insert into estabelecimentos (nome, marca, cmv_alvo_padrao, regra_arredondamento)
  values (v_nome, nullif(btrim(coalesce(p_marca, '')), ''), p_cmv_alvo, coalesce(p_regra, 'centavos'))
  returning id into v_id;

  if p_precos_de is not null then
    perform public.copiar_precos_referencia(p_precos_de, v_id);
  end if;

  if p_cardapio_de is not null then
    insert into cardapios (estabelecimento_id, nome, status, vigencia_inicio)
    select v_id, c.nome, c.status, current_date
      from cardapios c where c.estabelecimento_id = p_cardapio_de and c.status <> 'arquivado';
    insert into itens_cardapio (cardapio_id, receita_id, nome_exibicao, secao, ordem, cmv_alvo)
    select novo.id, it.receita_id, it.nome_exibicao, it.secao, it.ordem, it.cmv_alvo
      from itens_cardapio it
      join cardapios c on c.id = it.cardapio_id and c.estabelecimento_id = p_cardapio_de and c.status <> 'arquivado'
      join cardapios novo on novo.estabelecimento_id = v_id and novo.nome = c.nome
      join receitas r on r.id = it.receita_id and r.ativo
     where it.ativo;
  end if;
  return v_id;
end $$;
grant execute on function public.criar_casa(text, text, numeric, text, uuid, uuid) to authenticated;

create or replace function public.atualizar_casa(p_estab uuid, p_nome text, p_marca text, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
begin
  if auth.uid() is not null and not eh_admin() then
    raise exception 'Só o administrador altera o cadastro da casa' using errcode = 'insufficient_privilege';
  end if;
  if v_nome is null then raise exception 'Informe o nome da casa' using errcode = 'check_violation'; end if;
  if exists (select 1 from estabelecimentos where lower(nome) = lower(v_nome) and id <> p_estab) then
    raise exception 'Já existe uma casa com o nome "%"', v_nome using errcode = 'unique_violation';
  end if;
  update estabelecimentos
     set nome = v_nome, marca = nullif(btrim(coalesce(p_marca, '')), ''), ativo = coalesce(p_ativo, ativo)
   where id = p_estab;
end $$;
grant execute on function public.atualizar_casa(uuid, text, text, boolean) to authenticated;

create or replace function public.definir_parametros_casa(p_estab uuid, p_cmv_alvo numeric, p_regra text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(papel_em(p_estab), '') not in ('admin', 'gestor') then
    raise exception 'Só o gestor ou o administrador da casa muda a meta e o arredondamento' using errcode = 'insufficient_privilege';
  end if;
  if p_cmv_alvo is null or not (p_cmv_alvo > 0 and p_cmv_alvo < 100) then
    raise exception 'A meta de CMV deve ficar entre 0 e 100%%' using errcode = 'check_violation';
  end if;
  if p_regra not in ('centavos', 'x90', 'inteiro', 'multiplo_050') then
    raise exception 'Regra de arredondamento inválida' using errcode = 'check_violation';
  end if;
  update estabelecimentos set cmv_alvo_padrao = p_cmv_alvo, regra_arredondamento = p_regra where id = p_estab;
end $$;
grant execute on function public.definir_parametros_casa(uuid, numeric, text) to authenticated;

create or replace function public.listar_casas_admin()
returns table (id uuid, nome text, marca text, ativo boolean, cmv_alvo numeric, regra text, criado_em timestamptz,
               pessoas int, itens_cardapio int, compras int, referencias int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if auth.uid() is not null and not eh_admin() then
    raise exception 'Só o administrador vê todas as casas' using errcode = 'insufficient_privilege';
  end if;
  return query
  select e.id, e.nome, e.marca, e.ativo, e.cmv_alvo_padrao, e.regra_arredondamento, e.criado_em,
         (select count(*)::int from acessos_estabelecimento a where a.estabelecimento_id = e.id),
         (select count(*)::int from itens_cardapio it join cardapios c on c.id = it.cardapio_id
           where c.estabelecimento_id = e.id and it.ativo and c.status <> 'arquivado'),
         (select count(*)::int from historico_precos h where h.estabelecimento_id = e.id and h.fonte <> 'referencia' and h.status = 'validado'),
         (select count(*)::int from historico_precos h where h.estabelecimento_id = e.id and h.fonte = 'referencia' and h.status = 'validado')
    from estabelecimentos e
   order by e.ativo desc, e.nome;
end $$;
grant execute on function public.listar_casas_admin() to authenticated;
