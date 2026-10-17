-- =====================================================================
-- 0022 — Níveis de acesso por casa (definidos pelo administrador no app)
-- Níveis (cada um inclui o anterior):
--   1 Contagem      → papel 'contagem'   (só a contagem de estoque)
--   2 Estoque       → papel 'estoquista' (+ pedido da semana e estoque, sem R$)
--   3 Gerência      → papel 'gerente'    (+ painel de CMV, fichas com custo e preço, mínimos)
--   4 Proprietário  → papel 'gestor'     (tudo na casa)
-- • O login é criado pelo cadastro oficial do Supabase Auth (tela Usuários);
--   aqui ficam só o nível de cada casa e a lista para o administrador.
-- • 'gerente' vê custos (pode_ver_custos); as telas de cada nível ficam no app.
-- Pode rodar de novo.
-- =====================================================================

alter type papel_local add value if not exists 'gerente';

create or replace function public.pode_ver_custos(p_estab uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(papel_em(p_estab) in ('admin', 'gestor', 'gerente'), false)
$$;

-- Perfil do usuário recém-cadastrado (nome); só administrador
create or replace function public.salvar_perfil_miseo(p_user uuid, p_nome text, p_ativo boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not eh_admin() then
    raise exception 'Só o administrador cadastra usuários' using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(coalesce(p_nome, '')), '') is null then raise exception 'Informe o nome' using errcode = 'check_violation'; end if;
  insert into perfis (user_id, nome, admin, ativo) values (p_user, btrim(p_nome), false, coalesce(p_ativo, true))
  on conflict (user_id) do update set nome = excluded.nome, ativo = excluded.ativo;
end $$;

-- Nível 1–4 na casa; 0 tira o acesso à casa
create or replace function public.definir_acesso_nivel(p_user uuid, p_estab uuid, p_nivel int)
returns void language plpgsql security definer set search_path = public as $$
declare v_papel text := case p_nivel when 1 then 'contagem' when 2 then 'estoquista' when 3 then 'gerente' when 4 then 'gestor' end;
begin
  if auth.uid() is not null and not eh_admin() then
    raise exception 'Só o administrador define acessos' using errcode = 'insufficient_privilege';
  end if;
  if p_nivel = 0 then
    delete from acessos_estabelecimento where user_id = p_user and estabelecimento_id = p_estab;
    return;
  end if;
  if v_papel is null then raise exception 'Nível inválido (use 1 a 4)' using errcode = 'check_violation'; end if;
  insert into acessos_estabelecimento (user_id, estabelecimento_id, papel)
  values (p_user, p_estab, v_papel::papel_local)
  on conflict (user_id, estabelecimento_id) do update set papel = excluded.papel;
end $$;

-- Lista de usuários com e-mail e acessos por casa (só administrador)
create or replace function public.listar_usuarios_miseo()
returns table (user_id uuid, nome text, email text, admin boolean, ativo boolean, ultimo_acesso timestamptz, acessos jsonb)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not eh_admin() then raise exception 'Só o administrador vê os usuários' using errcode = 'insufficient_privilege'; end if;
  return query
  select p.user_id, p.nome, u.email::text, p.admin, p.ativo, u.last_sign_in_at,
         coalesce((select jsonb_agg(jsonb_build_object('estab', a.estabelecimento_id, 'papel', a.papel) order by e.nome)
                     from acessos_estabelecimento a join estabelecimentos e on e.id = a.estabelecimento_id
                    where a.user_id = p.user_id), '[]'::jsonb)
    from perfis p left join auth.users u on u.id = p.user_id
   order by p.ativo desc, p.nome;
end $$;

grant execute on function public.salvar_perfil_miseo(uuid, text, boolean) to authenticated;
grant execute on function public.definir_acesso_nivel(uuid, uuid, int) to authenticated;
grant execute on function public.listar_usuarios_miseo() to authenticated;
