-- =====================================================================
-- 0021 — Logo da casa
-- • estabelecimentos.logo_url: endereço público da logo (cabeçalho do app e PDFs).
-- • Bucket público "logos" no Storage, uma pasta por casa (<id da casa>/...).
--   Só gestor/admin da casa envia, troca ou apaga arquivos da pasta dela;
--   leitura é pública (a imagem aparece no app e nos PDFs).
-- • definir_logo_casa: o gestor grava (ou limpa) o endereço da logo da casa.
-- Pode rodar de novo.
-- =====================================================================

alter table estabelecimentos add column if not exists logo_url text;

create or replace function public.definir_logo_casa(p_estab uuid, p_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not pode_ver_custos(p_estab) then
    raise exception 'Só o gestor ou o administrador da casa troca a logo' using errcode = 'insufficient_privilege';
  end if;
  if p_url is not null and p_url !~ '^https://' then
    raise exception 'Endereço de logo inválido' using errcode = 'check_violation';
  end if;
  update estabelecimentos set logo_url = nullif(btrim(coalesce(p_url, '')), '') where id = p_estab;
end $$;
grant execute on function public.definir_logo_casa(uuid, text) to authenticated;

-- Storage (só existe no Supabase; no banco de teste esta parte é pulada)
do $$
begin
  if to_regclass('storage.buckets') is null then return; end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('logos', 'logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

  execute 'drop policy if exists "logos: leitura" on storage.objects';
  execute 'create policy "logos: leitura" on storage.objects for select using (bucket_id = ''logos'')';
  execute 'drop policy if exists "logos: gestor envia" on storage.objects';
  execute $p$create policy "logos: gestor envia" on storage.objects for insert to authenticated
    with check (bucket_id = 'logos' and public.pode_ver_custos(((storage.foldername(name))[1])::uuid))$p$;
  execute 'drop policy if exists "logos: gestor troca" on storage.objects';
  execute $p$create policy "logos: gestor troca" on storage.objects for update to authenticated
    using (bucket_id = 'logos' and public.pode_ver_custos(((storage.foldername(name))[1])::uuid))$p$;
  execute 'drop policy if exists "logos: gestor apaga" on storage.objects';
  execute $p$create policy "logos: gestor apaga" on storage.objects for delete to authenticated
    using (bucket_id = 'logos' and public.pode_ver_custos(((storage.foldername(name))[1])::uuid))$p$;
end $$;
