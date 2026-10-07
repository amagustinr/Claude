-- =====================================================================
-- 03_storage_caras.sql  -  Bucket para las fotos de la cara
-- Bucket público: cualquiera puede VER las imágenes por URL,
-- pero solo un admin puede subir, reemplazar o borrar.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('caras', 'caras', true, 2097152,                 -- 2 MB máximo
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists caras_admin_select on storage.objects;
create policy caras_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'caras' and public.es_admin());

drop policy if exists caras_admin_insert on storage.objects;
create policy caras_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'caras' and public.es_admin());

drop policy if exists caras_admin_update on storage.objects;
create policy caras_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'caras' and public.es_admin());

drop policy if exists caras_admin_delete on storage.objects;
create policy caras_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'caras' and public.es_admin());
