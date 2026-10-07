-- =====================================================================
-- 01_tablas.sql  -  Tablas del juego de pelea
-- Ejecutar en Supabase > SQL Editor (en orden: 01, 02, 03, 04)
-- =====================================================================

-- Administradores del panel. Solo los usuarios de Supabase Auth cuyo id
-- esté aquí pueden crear/editar personajes y subir fotos.
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  creado_en  timestamptz not null default now()
);

-- Personajes de pelea.
create table if not exists public.personajes (
  id              uuid primary key default gen_random_uuid(),
  nombre          text        not null unique check (char_length(nombre) between 2 and 30),

  -- Contextura
  sexo            char(1)     not null check (sexo in ('M', 'F')),          -- M = hombre, F = mujer
  altura_cm       smallint    not null check (altura_cm between 140 and 220),
  peso_kg         smallint    not null check (peso_kg between 40 and 160),
  complexion      text        not null default 'media'
                              check (complexion in ('delgada', 'media', 'robusta')),

  -- Estadísticas de pelea (1 a 100)
  fuerza          smallint    not null check (fuerza      between 1 and 100), -- daño de golpes y patadas
  agilidad        smallint    not null check (agilidad    between 1 and 100), -- velocidad, salto y rapidez de ataque
  resistencia     smallint    not null check (resistencia between 1 and 100), -- vida y reducción de daño

  -- Ruta del archivo dentro del bucket "caras" (ej: 3f2a.../cara-1712345.png)
  foto_path       text,

  disponible      boolean     not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

create index if not exists ix_personajes_disponible on public.personajes (disponible);

-- Mantiene actualizado_en al día (equivalente a un trigger AFTER UPDATE en SQL Server,
-- pero en Postgres se hace BEFORE UPDATE modificando NEW).
create or replace function public.tg_set_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists trg_personajes_actualizado on public.personajes;
create trigger trg_personajes_actualizado
before update on public.personajes
for each row execute function public.tg_set_actualizado_en();
