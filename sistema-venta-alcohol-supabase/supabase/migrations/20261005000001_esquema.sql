/* =====================================================================
   Sistema de Venta de Alcohol - Esquema para Supabase (PostgreSQL 15+)
   Ejecutar completo en Supabase > SQL Editor (o con `supabase db push`).
   Crea tablas, funciones (equivalentes a los usp_* de SQL Server),
   vistas y políticas RLS (seguridad por fila).

   Equivalencias con la versión SQL Server:
     INT IDENTITY        -> bigint generated always as identity
     NVARCHAR / VARCHAR  -> text
     BIT                 -> boolean
     DATETIME2           -> timestamptz (se guarda en UTC; se muestra en hora de Chile)
     Procedimiento usp_* -> function (se llama desde el frontend con supabase.rpc)
     THROW 50000+        -> raise exception '...'  (el mensaje llega al frontend)
     Tipo tabla (TVP)    -> parámetro jsonb con un arreglo [{producto_id, cantidad}]
     WITH (UPDLOCK)      -> select ... for update
   ===================================================================== */

/* =========================== TABLAS ================================= */

-- Perfil del usuario. La clave y el login los maneja Supabase Auth (tabla auth.users);
-- aquí solo guardamos el nombre de usuario, el rol y si está activo.
create table public.perfil (
    id              uuid primary key references auth.users(id) on delete cascade,
    usuario         text not null unique check (usuario ~ '^[a-z0-9._-]{3,50}$'),
    nombre_completo text not null,
    rol             text not null default 'vendedor' check (rol in ('administrador', 'vendedor')),
    activo          boolean not null default true,
    creado_en       timestamptz not null default now()
);

create table public.categoria (
    id      bigint generated always as identity primary key,
    nombre  text not null unique,
    activo  boolean not null default true
);

create table public.producto (
    id               bigint generated always as identity primary key,
    codigo           text not null unique,            -- código de barras o interno
    nombre           text not null,
    categoria_id     bigint not null references public.categoria(id),
    grado_alcoholico numeric(4,1) not null default 0,
    volumen_ml       integer not null default 0,
    precio_venta     numeric(14,0) not null check (precio_venta >= 0),  -- pesos, IVA incluido
    stock            integer not null default 0 check (stock >= 0),
    stock_minimo     integer not null default 0,
    activo           boolean not null default true
);
create index ix_producto_nombre on public.producto (nombre);

-- El precio de compra va en una tabla aparte para que el vendedor no pueda leerlo:
-- RLS filtra filas, no columnas, así que separar la columna es lo más simple y seguro.
create table public.producto_costo (
    producto_id   bigint primary key references public.producto(id) on delete cascade,
    precio_compra numeric(14,0) not null default 0 check (precio_compra >= 0)
);

create table public.cliente (
    id           bigint generated always as identity primary key,
    rut          text not null unique,                -- formato 12345678-9
    razon_social text not null,
    giro         text,
    direccion    text,
    comuna       text,
    ciudad       text,
    email        text,
    telefono     text,
    activo       boolean not null default true
);

create table public.tipo_documento (
    id           smallint primary key,
    nombre       text not null,
    ultimo_folio integer not null default 0
);

create table public.venta (
    id                bigint generated always as identity primary key,
    tipo_documento_id smallint not null references public.tipo_documento(id),
    folio             integer not null,
    fecha             timestamptz not null default now(),
    usuario_id        uuid not null references public.perfil(id),
    cliente_id        bigint references public.cliente(id),
    medio_pago        text not null check (medio_pago in ('Efectivo', 'Débito', 'Crédito', 'Transferencia')),
    edad_verificada   boolean not null check (edad_verificada),
    neto              numeric(14,0) not null,
    iva               numeric(14,0) not null,
    total             numeric(14,0) not null,
    anulada           boolean not null default false,
    fecha_anulacion   timestamptz,
    usuario_anula_id  uuid references public.perfil(id),
    motivo_anulacion  text,
    unique (tipo_documento_id, folio)
);
-- Índice por día en hora de Chile (los filtros de fecha usan esta expresión)
create index ix_venta_dia on public.venta (((fecha at time zone 'America/Santiago')::date));
create index ix_venta_usuario on public.venta (usuario_id);

create table public.detalle_venta (
    id              bigint generated always as identity primary key,
    venta_id        bigint not null references public.venta(id),
    producto_id     bigint not null references public.producto(id),
    cantidad        integer not null check (cantidad > 0),
    precio_unitario numeric(14,0) not null,
    subtotal        numeric(14,0) not null
);
create index ix_detalle_venta on public.detalle_venta (venta_id);

-- Kardex: toda variación de stock queda registrada
create table public.movimiento_stock (
    id               bigint generated always as identity primary key,
    producto_id      bigint not null references public.producto(id),
    fecha            timestamptz not null default now(),
    tipo             text not null check (tipo in ('ENTRADA', 'SALIDA', 'AJUSTE', 'VENTA', 'ANULACION')),
    cantidad         integer not null,   -- positiva entra, negativa sale
    stock_resultante integer not null,
    referencia       text,
    usuario_id       uuid references public.perfil(id)   -- null = carga inicial
);
create index ix_mov_producto_fecha on public.movimiento_stock (producto_id, fecha);
create index ix_mov_dia on public.movimiento_stock (((fecha at time zone 'America/Santiago')::date));

-- Datos del emisor (la botillería) y tasa de IVA. Siempre una sola fila (id = 1).
create table public.configuracion (
    id             smallint primary key default 1 check (id = 1),
    rut_empresa    text not null,
    razon_social   text not null,
    giro           text not null,
    direccion      text not null,
    comuna         text,
    telefono       text,
    porcentaje_iva numeric(5,2) not null check (porcentaje_iva between 0 and 100)
);

/* ===================== FUNCIONES DE APOYO =========================== */

-- RUT chileno: módulo 11. Devuelve '12345678-9' o null si no es válido.
create or replace function public.rut_normalizar(p_rut text)
returns text language plpgsql immutable as $$
declare
    v_limpio text := upper(regexp_replace(coalesce(p_rut, ''), '[^0-9kK]', '', 'g'));
    v_cuerpo text; v_dv text; v_suma int := 0; v_factor int := 2; v_resto int; i int;
begin
    if length(v_limpio) < 2 then return null; end if;
    v_cuerpo := ltrim(left(v_limpio, -1), '0');
    v_dv := right(v_limpio, 1);
    if v_cuerpo = '' or v_cuerpo !~ '^[0-9]+$' then return null; end if;
    for i in reverse length(v_cuerpo)..1 loop
        v_suma := v_suma + substr(v_cuerpo, i, 1)::int * v_factor;
        v_factor := case when v_factor = 7 then 2 else v_factor + 1 end;
    end loop;
    v_resto := 11 - (v_suma % 11);
    if v_dv <> (case v_resto when 11 then '0' when 10 then 'K' else v_resto::text end) then return null; end if;
    return v_cuerpo || '-' || v_dv;
end $$;

alter table public.cliente add constraint ck_cliente_rut check (public.rut_normalizar(rut) is not distinct from rut);
alter table public.configuracion add constraint ck_config_rut check (public.rut_normalizar(rut_empresa) is not distinct from rut_empresa);

-- Normaliza el RUT antes de guardar (acepta 12.345.678-9, 123456789, etc.)
create or replace function public.tg_normalizar_rut()
returns trigger language plpgsql as $$
begin
    if tg_table_name = 'cliente' then
        new.rut := public.rut_normalizar(new.rut);
        if new.rut is null then raise exception 'El RUT del cliente no es válido.'; end if;
    else
        new.rut_empresa := public.rut_normalizar(new.rut_empresa);
        if new.rut_empresa is null then raise exception 'El RUT de la empresa no es válido.'; end if;
    end if;
    return new;
end $$;
create trigger tg_cliente_rut before insert or update on public.cliente
    for each row execute function public.tg_normalizar_rut();
create trigger tg_configuracion_rut before insert or update on public.configuracion
    for each row execute function public.tg_normalizar_rut();

-- Rol del usuario conectado (null si no tiene perfil o está desactivado).
-- security definer = se ejecuta con los permisos del dueño (como EXECUTE AS OWNER),
-- así las políticas RLS pueden consultarla sin caer en recursión sobre "perfil".
create or replace function public.mi_rol()
returns text language sql stable security definer set search_path = public, pg_temp as $$
    select rol from public.perfil where id = auth.uid() and activo
$$;

create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
    select coalesce(public.mi_rol() = 'administrador', false)
$$;

create or replace function public.es_usuario_activo()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
    select public.mi_rol() is not null
$$;

-- Al crear un usuario en Supabase Auth se crea su perfil.
-- El primer usuario del sistema queda como administrador activo.
-- Los demás los crea el administrador desde la pantalla Usuarios (función /api/usuarios en
-- Cloudflare), que luego fija el rol y lo activa con la llave secreta.
-- Si alguien se registrara por su cuenta (registro público habilitado por error) queda inactivo.
create or replace function public.tg_crear_perfil()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
    v_primero boolean := not exists (select 1 from public.perfil);
begin
    insert into public.perfil (id, usuario, nombre_completo, rol, activo)
    values (
        new.id,
        lower(coalesce(new.raw_user_meta_data ->> 'usuario', split_part(new.email, '@', 1))),
        coalesce(new.raw_user_meta_data ->> 'nombre_completo', split_part(new.email, '@', 1)),
        case when v_primero then 'administrador' else 'vendedor' end,
        v_primero
    );
    return new;
end $$;
create trigger tg_auth_crear_perfil after insert on auth.users
    for each row execute function public.tg_crear_perfil();

-- Impide dejar el sistema sin administradores activos.
create or replace function public.tg_proteger_ultimo_admin()
returns trigger language plpgsql as $$
begin
    if old.rol = 'administrador' and old.activo and (new.rol <> 'administrador' or not new.activo)
       and not exists (select 1 from public.perfil
                       where rol = 'administrador' and activo and id <> old.id) then
        raise exception 'Debe quedar al menos un administrador activo.';
    end if;
    if new.id <> old.id or new.usuario <> old.usuario then
        raise exception 'El nombre de usuario no se puede cambiar.';
    end if;
    return new;
end $$;
create trigger tg_perfil_ultimo_admin before update on public.perfil
    for each row execute function public.tg_proteger_ultimo_admin();

/* =============== FUNCIONES DE NEGOCIO (equivalen a usp_*) ============ */

-- Crea o modifica un producto (p_id null = nuevo). El stock NO se cambia aquí:
-- solo con movimientos (registrar_movimiento_stock) o ventas.
create or replace function public.guardar_producto(
    p_id bigint, p_codigo text, p_nombre text, p_categoria_id bigint,
    p_grado_alcoholico numeric, p_volumen_ml integer,
    p_precio_compra numeric, p_precio_venta numeric, p_stock_minimo integer, p_activo boolean)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint;
begin
    if not public.es_admin() then raise exception 'Solo el administrador puede modificar productos.'; end if;
    if coalesce(trim(p_codigo), '') = '' or coalesce(trim(p_nombre), '') = '' then
        raise exception 'El código y el nombre son obligatorios.';
    end if;
    if exists (select 1 from public.producto where codigo = trim(p_codigo) and id is distinct from p_id) then
        raise exception 'Ya existe un producto con ese código.';
    end if;
    if p_precio_venta is null or p_precio_venta < 0 or coalesce(p_precio_compra, 0) < 0 then
        raise exception 'Los precios no son válidos.';
    end if;

    if p_id is null then
        insert into public.producto (codigo, nombre, categoria_id, grado_alcoholico, volumen_ml, precio_venta, stock, stock_minimo, activo)
        values (trim(p_codigo), trim(p_nombre), p_categoria_id, coalesce(p_grado_alcoholico, 0), coalesce(p_volumen_ml, 0),
                round(p_precio_venta), 0, coalesce(p_stock_minimo, 0), coalesce(p_activo, true))
        returning id into v_id;
    else
        update public.producto
        set codigo = trim(p_codigo), nombre = trim(p_nombre), categoria_id = p_categoria_id,
            grado_alcoholico = coalesce(p_grado_alcoholico, 0), volumen_ml = coalesce(p_volumen_ml, 0),
            precio_venta = round(p_precio_venta), stock_minimo = coalesce(p_stock_minimo, 0), activo = coalesce(p_activo, true)
        where id = p_id
        returning id into v_id;
        if v_id is null then raise exception 'El producto no existe.'; end if;
    end if;

    insert into public.producto_costo (producto_id, precio_compra) values (v_id, round(coalesce(p_precio_compra, 0)))
    on conflict (producto_id) do update set precio_compra = excluded.precio_compra;
    return v_id;
end $$;

-- ENTRADA (compra, cantidad > 0), SALIDA (merma/rotura, cantidad > 0),
-- AJUSTE (conteo físico: p_cantidad = stock real contado)
create or replace function public.registrar_movimiento_stock(
    p_producto_id bigint, p_tipo text, p_cantidad integer, p_referencia text)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actual integer; v_variacion integer;
begin
    if not public.es_admin() then raise exception 'Solo el administrador puede mover stock.'; end if;
    if p_tipo not in ('ENTRADA', 'SALIDA', 'AJUSTE') then raise exception 'Tipo de movimiento no válido.'; end if;
    if p_cantidad is null or p_cantidad < 0 or (p_tipo <> 'AJUSTE' and p_cantidad = 0) then
        raise exception 'La cantidad no es válida.';
    end if;

    select stock into v_actual from public.producto where id = p_producto_id for update;
    if v_actual is null then raise exception 'El producto no existe.'; end if;

    v_variacion := (case p_tipo when 'ENTRADA' then p_cantidad
                                when 'SALIDA'  then -p_cantidad
                                else p_cantidad - v_actual end);
    if v_actual + v_variacion < 0 then raise exception 'El stock no puede quedar negativo.'; end if;

    update public.producto set stock = stock + v_variacion where id = p_producto_id;
    insert into public.movimiento_stock (producto_id, tipo, cantidad, stock_resultante, referencia, usuario_id)
    values (p_producto_id, p_tipo, v_variacion, v_actual + v_variacion, nullif(trim(p_referencia), ''), auth.uid());
    return v_actual + v_variacion;
end $$;

-- Registra la venta completa en UNA transacción (cada llamada RPC es una transacción:
-- si algo falla con raise exception, se deshace todo, como SET XACT_ABORT ON).
-- Bloquea los productos, valida stock, asigna folio correlativo, calcula neto/IVA,
-- descuenta stock y deja kardex.
-- p_items: '[{"producto_id": 1, "cantidad": 2}, ...]'
create or replace function public.registrar_venta(
    p_tipo_documento_id smallint, p_cliente_id bigint, p_medio_pago text,
    p_edad_verificada boolean, p_items jsonb)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare
    v_usuario  uuid := auth.uid();
    v_ids      bigint[];
    v_cants    integer[];
    v_msg      text;
    v_folio    integer;
    v_tipo     text;
    v_porc_iva numeric;
    v_total    numeric;
    v_neto     numeric;
    v_venta_id bigint;
begin
    if not public.es_usuario_activo() then raise exception 'Usuario no autorizado.'; end if;
    if not coalesce(p_edad_verificada, false) then
        raise exception 'Debe verificar que el cliente es mayor de 18 años antes de vender alcohol.';
    end if;
    if p_tipo_documento_id not in (1, 2) then raise exception 'Tipo de documento no válido.'; end if;
    if p_medio_pago is null or p_medio_pago not in ('Efectivo', 'Débito', 'Crédito', 'Transferencia') then
        raise exception 'Medio de pago no válido.';
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
        raise exception 'La venta no tiene productos.';
    end if;
    if p_tipo_documento_id = 2 and not exists (select 1 from public.cliente where id = p_cliente_id and activo) then
        raise exception 'La factura requiere un cliente activo con RUT.';
    end if;
    if p_cliente_id is not null and not exists (select 1 from public.cliente where id = p_cliente_id) then
        raise exception 'El cliente no existe.';
    end if;

    -- Agrupa por producto (si el mismo producto viene dos veces, se suman)
    select array_agg(producto_id order by producto_id), array_agg(cantidad order by producto_id)
    into v_ids, v_cants
    from (select (e ->> 'producto_id')::bigint as producto_id, sum((e ->> 'cantidad')::integer) as cantidad
          from jsonb_array_elements(p_items) e
          group by 1) x;

    if exists (select 1 from unnest(v_ids, v_cants) i(id, cant) where i.id is null or i.cant is null or i.cant <= 0) then
        raise exception 'Las cantidades deben ser mayores a cero.';
    end if;

    -- Bloquea las filas hasta el fin de la transacción (orden fijo para evitar interbloqueos)
    perform 1 from public.producto where id = any(v_ids) order by id for update;

    if (select count(*) from public.producto where id = any(v_ids) and activo) <> cardinality(v_ids) then
        raise exception 'Uno o más productos no existen o están inactivos.';
    end if;

    select string_agg(format('%s (disponible: %s)', p.nombre, p.stock), ', ')
    into v_msg
    from public.producto p join unnest(v_ids, v_cants) i(id, cant) on i.id = p.id
    where p.stock < i.cant;
    if v_msg is not null then raise exception 'Stock insuficiente: %', v_msg; end if;

    update public.tipo_documento set ultimo_folio = ultimo_folio + 1
    where id = p_tipo_documento_id
    returning ultimo_folio, nombre into v_folio, v_tipo;

    -- Precios al público incluyen IVA: se desglosa el neto desde el total (pesos sin decimales)
    select porcentaje_iva into v_porc_iva from public.configuracion where id = 1;
    select sum(i.cant * p.precio_venta) into v_total
    from public.producto p join unnest(v_ids, v_cants) i(id, cant) on i.id = p.id;
    v_neto := round(v_total / (1 + coalesce(v_porc_iva, 19) / 100));

    insert into public.venta (tipo_documento_id, folio, usuario_id, cliente_id, medio_pago, edad_verificada, neto, iva, total)
    values (p_tipo_documento_id, v_folio, v_usuario, p_cliente_id, p_medio_pago, true, v_neto, v_total - v_neto, v_total)
    returning id into v_venta_id;

    insert into public.detalle_venta (venta_id, producto_id, cantidad, precio_unitario, subtotal)
    select v_venta_id, p.id, i.cant, p.precio_venta, i.cant * p.precio_venta
    from public.producto p join unnest(v_ids, v_cants) i(id, cant) on i.id = p.id
    order by p.id;

    with descontado as (
        update public.producto p set stock = p.stock - i.cant
        from unnest(v_ids, v_cants) i(id, cant)
        where p.id = i.id
        returning p.id, i.cant, p.stock
    )
    insert into public.movimiento_stock (producto_id, tipo, cantidad, stock_resultante, referencia, usuario_id)
    select id, 'VENTA', -cant, stock, format('%s N° %s', v_tipo, v_folio), v_usuario
    from descontado;

    return v_venta_id;
end $$;

-- Anula un documento y repone el stock (solo administrador)
create or replace function public.anular_venta(p_venta_id bigint, p_motivo text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_anulada boolean; v_ref text;
begin
    if not public.es_admin() then raise exception 'Solo el administrador puede anular documentos.'; end if;
    if coalesce(trim(p_motivo), '') = '' then raise exception 'Debe indicar el motivo de la anulación.'; end if;

    select v.anulada, format('Anulación %s N° %s', t.nombre, v.folio)
    into v_anulada, v_ref
    from public.venta v join public.tipo_documento t on t.id = v.tipo_documento_id
    where v.id = p_venta_id
    for update of v;

    if v_anulada is null then raise exception 'La venta no existe.'; end if;
    if v_anulada then raise exception 'La venta ya está anulada.'; end if;

    with det as (
        select producto_id, sum(cantidad)::integer as cantidad
        from public.detalle_venta where venta_id = p_venta_id group by producto_id
    ), repuesto as (
        update public.producto p set stock = p.stock + det.cantidad
        from det where det.producto_id = p.id
        returning p.id, det.cantidad, p.stock
    )
    insert into public.movimiento_stock (producto_id, tipo, cantidad, stock_resultante, referencia, usuario_id)
    select id, 'ANULACION', cantidad, stock, v_ref, auth.uid() from repuesto;

    update public.venta
    set anulada = true, fecha_anulacion = now(), usuario_anula_id = auth.uid(), motivo_anulacion = trim(p_motivo)
    where id = p_venta_id;
end $$;

-- Panel del administrador: indicadores, ventas por día, top productos y ventas por vendedor
create or replace function public.reporte_resumen(p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
    v_hoy date := (now() at time zone 'America/Santiago')::date;
    v_resultado jsonb;
begin
    if not public.es_admin() then raise exception 'Solo el administrador puede ver reportes.'; end if;

    with v as (
        select *, (fecha at time zone 'America/Santiago')::date as dia
        from public.venta where not anulada
    ), periodo as (
        select * from v where dia between p_desde and p_hasta
    )
    select jsonb_build_object(
        'ventas_hoy',           (select coalesce(sum(total), 0) from v where dia = v_hoy),
        'documentos_hoy',       (select count(*) from v where dia = v_hoy),
        'ventas_periodo',       (select coalesce(sum(total), 0) from periodo),
        'documentos_periodo',   (select count(*) from periodo),
        'productos_stock_bajo', (select count(*) from public.producto where activo and stock <= stock_minimo),
        'por_dia', coalesce((
            select jsonb_agg(x order by x.dia) from (
                select dia, sum(total) as total, count(*) as documentos from periodo group by dia) x), '[]'),
        'top_productos', coalesce((
            select jsonb_agg(x order by x.unidades desc) from (
                select pr.nombre as producto, sum(d.cantidad) as unidades, sum(d.subtotal) as total
                from periodo pe
                join public.detalle_venta d on d.venta_id = pe.id
                join public.producto pr on pr.id = d.producto_id
                group by pr.nombre order by unidades desc limit 10) x), '[]'),
        'por_vendedor', coalesce((
            select jsonb_agg(x order by x.total desc) from (
                select u.nombre_completo as vendedor, count(*) as documentos, sum(pe.total) as total
                from periodo pe join public.perfil u on u.id = pe.usuario_id
                group by u.nombre_completo) x), '[]')
    ) into v_resultado;
    return v_resultado;
end $$;

/* =============================== VISTAS ============================== */
-- security_invoker = true: la vista respeta el RLS de quien consulta
-- (sin esto, una vista en Postgres se ejecuta con los permisos del dueño y saltaría el RLS).

create view public.v_venta with (security_invoker = true) as
select v.id, v.tipo_documento_id, t.nombre as tipo_documento, v.folio, v.fecha,
       (v.fecha at time zone 'America/Santiago')::date as dia,
       v.usuario_id, u.nombre_completo as vendedor,
       v.cliente_id, c.rut as rut_cliente, c.razon_social as cliente,
       c.giro as giro_cliente, c.direccion as direccion_cliente, c.comuna as comuna_cliente,
       v.medio_pago, v.edad_verificada, v.neto, v.iva, v.total,
       v.anulada, v.fecha_anulacion, v.motivo_anulacion
from public.venta v
join public.tipo_documento t on t.id = v.tipo_documento_id
left join public.perfil u   on u.id = v.usuario_id
left join public.cliente c  on c.id = v.cliente_id;

create view public.v_movimiento with (security_invoker = true) as
select m.id, m.producto_id, p.codigo, p.nombre as producto, m.fecha,
       (m.fecha at time zone 'America/Santiago')::date as dia,
       m.tipo, m.cantidad, m.stock_resultante, m.referencia,
       coalesce(u.usuario, 'sistema') as usuario
from public.movimiento_stock m
join public.producto p on p.id = m.producto_id
left join public.perfil u on u.id = m.usuario_id;

/* ======================= SEGURIDAD (RLS) ============================= */
-- En Supabase el navegador habla directo con la base (vía la API REST "PostgREST").
-- Por eso la seguridad vive AQUÍ y no en el frontend: cada tabla tiene RLS activado
-- y solo se ve/modifica lo que permiten las políticas.
--   anon          = sin sesión iniciada  -> no ve nada
--   authenticated = con sesión           -> según su rol en "perfil"

alter table public.perfil            enable row level security;
alter table public.categoria         enable row level security;
alter table public.producto          enable row level security;
alter table public.producto_costo    enable row level security;
alter table public.cliente           enable row level security;
alter table public.tipo_documento    enable row level security;
alter table public.venta             enable row level security;
alter table public.detalle_venta     enable row level security;
alter table public.movimiento_stock  enable row level security;
alter table public.configuracion     enable row level security;

-- Nadie sin sesión toca nada
revoke all on all tables    in schema public from anon;
revoke all on all functions in schema public from anon, public;
revoke all on all sequences in schema public from anon;

-- Tablas que solo cambian mediante funciones: el usuario conectado solo puede leerlas
revoke insert, update, delete, truncate on public.producto, public.producto_costo, public.venta,
    public.detalle_venta, public.movimiento_stock, public.tipo_documento from authenticated;
revoke insert, delete, truncate on public.perfil, public.configuracion from authenticated;
revoke delete, truncate on public.categoria, public.cliente from authenticated;

-- perfil: cada uno ve el suyo; el administrador ve y modifica todos (crear usuarios y
-- cambiar claves se hace con la función de Cloudflare /api/usuarios)
create policy perfil_select on public.perfil for select to authenticated
    using (id = auth.uid() or public.es_admin());
create policy perfil_update on public.perfil for update to authenticated
    using (public.es_admin()) with check (public.es_admin());

-- categoría: todos leen, el administrador crea y modifica
create policy categoria_select on public.categoria for select to authenticated
    using (public.es_usuario_activo());
create policy categoria_insert on public.categoria for insert to authenticated
    with check (public.es_admin());
create policy categoria_update on public.categoria for update to authenticated
    using (public.es_admin()) with check (public.es_admin());

-- producto: todos leen (los cambios van por guardar_producto / movimientos / ventas)
create policy producto_select on public.producto for select to authenticated
    using (public.es_usuario_activo());

-- precio de compra: solo el administrador
create policy producto_costo_select on public.producto_costo for select to authenticated
    using (public.es_admin());

-- cliente: todos los usuarios activos leen, crean y modifican (para emitir facturas)
create policy cliente_select on public.cliente for select to authenticated
    using (public.es_usuario_activo());
create policy cliente_insert on public.cliente for insert to authenticated
    with check (public.es_usuario_activo());
create policy cliente_update on public.cliente for update to authenticated
    using (public.es_usuario_activo()) with check (public.es_usuario_activo());

create policy tipo_documento_select on public.tipo_documento for select to authenticated
    using (public.es_usuario_activo());

-- venta: el administrador ve todas; el vendedor solo las propias
create policy venta_select on public.venta for select to authenticated
    using (public.es_admin() or (usuario_id = auth.uid() and public.es_usuario_activo()));

-- detalle: visible si la venta es visible (la subconsulta aplica el RLS de venta)
create policy detalle_venta_select on public.detalle_venta for select to authenticated
    using (exists (select 1 from public.venta v where v.id = venta_id));

-- kardex: solo administrador
create policy movimiento_select on public.movimiento_stock for select to authenticated
    using (public.es_admin());

-- configuración: todos leen (se imprime en los documentos), el administrador modifica
create policy configuracion_select on public.configuracion for select to authenticated
    using (public.es_usuario_activo());
create policy configuracion_update on public.configuracion for update to authenticated
    using (public.es_admin()) with check (public.es_admin());

-- Funciones que el frontend puede llamar con supabase.rpc(...)
grant execute on function
    public.mi_rol(), public.es_admin(), public.es_usuario_activo(), public.rut_normalizar(text),
    public.guardar_producto(bigint, text, text, bigint, numeric, integer, numeric, numeric, integer, boolean),
    public.registrar_movimiento_stock(bigint, text, integer, text),
    public.registrar_venta(smallint, bigint, text, boolean, jsonb),
    public.anular_venta(bigint, text),
    public.reporte_resumen(date, date)
to authenticated;

-- Las funciones de trigger no se llaman directamente
revoke all on function public.tg_crear_perfil(), public.tg_normalizar_rut(), public.tg_proteger_ultimo_admin()
    from authenticated;

/* ========================= DATOS INICIALES =========================== */
insert into public.tipo_documento (id, nombre, ultimo_folio) values (1, 'Boleta', 0), (2, 'Factura', 0);

insert into public.configuracion (id, rut_empresa, razon_social, giro, direccion, comuna, telefono, porcentaje_iva)
values (1, '76123456-0', 'Botillería Demo SpA', 'Venta al por menor de bebidas alcohólicas',
        'Av. Siempre Viva 123', 'Santiago', '+56 2 2345 6789', 19);
