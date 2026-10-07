-- =====================================================================
-- 04_alta_admin.sql  -  Dar de alta al administrador
--
-- Paso previo (en el panel de Supabase):
--   Authentication > Users > "Add user" > "Create new user"
--   Email: tu-correo@ejemplo.com   Password: ********   (marca "Auto Confirm User")
--
-- Luego cambia el email de abajo y ejecuta este script.
-- =====================================================================

insert into public.admins (user_id)
select id from auth.users where email = 'tu-correo@ejemplo.com'
on conflict (user_id) do nothing;

-- Verificación: debe devolver 1 fila
select a.user_id, u.email
from public.admins a
join auth.users u on u.id = a.user_id;
