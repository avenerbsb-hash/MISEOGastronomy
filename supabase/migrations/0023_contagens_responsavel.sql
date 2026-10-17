-- =====================================================================
-- 0023 — Contagens de estoque com responsável, data e hora
-- Lista as últimas contagens da casa com o nome de quem contou (perfis só
-- deixa cada um ver o próprio nome; aqui o nome vem para quem tem acesso à
-- casa), a hora (fuso de São Paulo) e quantos itens foram contados.
-- Só leitura. Pode rodar de novo (create or replace).
-- =====================================================================

create or replace function public.ultimas_contagens(p_estab uuid, p_limite int default 10)
returns table (contagem_id uuid, data date, feita_em timestamptz, responsavel text, observacao text, itens int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not tem_acesso(p_estab) then
    raise exception 'Sem acesso a esta casa' using errcode = 'insufficient_privilege';
  end if;
  return query
  select c.id, c.data, c.criado_em, coalesce(p.nome, 'Usuário não identificado'), c.observacao,
         (select count(*)::int from contagem_itens ci where ci.contagem_id = c.id)
    from contagens_estoque c
    left join perfis p on p.user_id = c.criado_por
   where c.estabelecimento_id = p_estab
   order by c.data desc, c.criado_em desc
   limit greatest(p_limite, 1);
end $$;

grant execute on function public.ultimas_contagens(uuid, int) to authenticated;
