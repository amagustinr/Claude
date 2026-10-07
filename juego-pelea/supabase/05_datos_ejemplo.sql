-- =====================================================================
-- 05_datos_ejemplo.sql  -  (Opcional) Dos personajes para probar
-- Sin foto: el juego dibuja una cara genérica. Luego puedes subirla desde el panel.
-- =====================================================================

insert into public.personajes (nombre, sexo, altura_cm, peso_kg, complexion, fuerza, agilidad, resistencia, disponible)
values
  ('Rocco', 'M', 185, 95, 'robusta', 80, 45, 70, true),
  ('Luna',  'F', 165, 55, 'delgada', 55, 85, 50, true)
on conflict (nombre) do nothing;
