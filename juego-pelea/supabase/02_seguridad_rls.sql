-- =====================================================================
-- 02_seguridad_rls.sql  -  Row Level Security (RLS)
-- La "anon key" del front es pública: la seguridad real está aquí.
-- =====================================================================

-- ¿El usuario autenticado actual es admin?
-- SECURITY DEFINER para poder leer la tabla admins sin exponerla.
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

grant execute on function public.es_admin() to anon, authenticated;

alter table public.admins     enable row level security;
alter table public.personajes enable row level security;

-- ---------- admins ----------
-- Un admin solo puede verse a sí mismo (lo usa el panel para validar el acceso).
drop policy if exists admins_select_propio on public.admins;
create policy admins_select_propio on public.admins
  for select to authenticated
  using (user_id = auth.uid());
-- Sin políticas de insert/update/delete: los admins se dan de alta solo desde el SQL Editor.

-- ---------- personajes ----------
-- Jugadores (anon) ven solo los disponibles; los admins ven todos.
drop policy if exists personajes_select on public.personajes;
create policy personajes_select on public.personajes
  for select to anon, authenticated
  using (disponible or public.es_admin());

drop policy if exists personajes_insert_admin on public.personajes;
create policy personajes_insert_admin on public.personajes
  for insert to authenticated
  with check (public.es_admin());

drop policy if exists personajes_update_admin on public.personajes;
create policy personajes_update_admin on public.personajes
  for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());

drop policy if exists personajes_delete_admin on public.personajes;
create policy personajes_delete_admin on public.personajes
  for delete to authenticated
  using (public.es_admin());
