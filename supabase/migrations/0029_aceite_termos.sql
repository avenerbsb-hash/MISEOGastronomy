-- =====================================================================
-- 0029 — Aceite dos Termos de Uso e da Política de Privacidade
-- Cada usuário aceita a versão vigente no primeiro acesso (e de novo quando
-- a versão muda). Guarda quem, qual versão e quando. Nada é apagado.
-- O administrador vê os aceites de todos (lista de usuários).
-- Pode rodar de novo.
-- =====================================================================

create table if not exists aceites_termos (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  versao    text not null,
  aceito_em timestamptz not null default now(),
  unique (user_id, versao)
);
alter table aceites_termos enable row level security;
drop policy if exists leitura on aceites_termos;
create policy leitura on aceites_termos for select using (user_id = auth.uid() or eh_admin());
grant select on aceites_termos to authenticated;

-- O próprio usuário registra o aceite da versão (repetir não muda a data do primeiro aceite)
create or replace function public.aceitar_termos(p_versao text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Entre no sistema para aceitar os termos' using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(coalesce(p_versao, '')), '') is null then
    raise exception 'Versão dos termos inválida' using errcode = 'check_violation';
  end if;
  insert into aceites_termos (user_id, versao) values (auth.uid(), btrim(p_versao))
  on conflict (user_id, versao) do nothing;
end $$;
grant execute on function public.aceitar_termos(text) to authenticated;
