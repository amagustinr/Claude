-- =====================================================================
-- 06_apariencia.sql  -  Ropa y aspecto personalizable de cada personaje
-- Sirve tanto para instalaciones nuevas como para las que ya ejecutaron 01..05.
-- =====================================================================

alter table public.personajes
  add column if not exists traje         text not null default 'karate',
  add column if not exists color_ropa    text not null default '#f4f4f4',
  add column if not exists color_detalle text not null default '#222222',
  add column if not exists color_piel    text not null default '#e2ad80',
  add column if not exists color_pelo    text not null default '#3b2416',
  add column if not exists peinado       text not null default 'corto';

-- Valores permitidos (equivalente a CHECK constraints de SQL Server)
alter table public.personajes drop constraint if exists ck_personajes_traje;
alter table public.personajes add constraint ck_personajes_traje
  check (traje in ('karate', 'boxeo', 'callejero', 'ninja', 'luchador'));

alter table public.personajes drop constraint if exists ck_personajes_peinado;
alter table public.personajes add constraint ck_personajes_peinado
  check (peinado in ('corto', 'largo', 'coleta', 'punk', 'rapado'));

-- Colores en formato #RRGGBB
alter table public.personajes drop constraint if exists ck_personajes_colores;
alter table public.personajes add constraint ck_personajes_colores check (
      color_ropa    ~ '^#[0-9a-fA-F]{6}$'
  and color_detalle ~ '^#[0-9a-fA-F]{6}$'
  and color_piel    ~ '^#[0-9a-fA-F]{6}$'
  and color_pelo    ~ '^#[0-9a-fA-F]{6}$'
);

-- Opcional: dar estilo distinto a los personajes de ejemplo
update public.personajes set traje = 'boxeo', color_ropa = '#c62828', color_detalle = '#ffd54f', peinado = 'rapado', color_piel = '#c68642'
 where nombre = 'Rocco';
update public.personajes set traje = 'ninja', color_ropa = '#3949ab', color_detalle = '#ff4081', peinado = 'coleta'
 where nombre = 'Luna';
