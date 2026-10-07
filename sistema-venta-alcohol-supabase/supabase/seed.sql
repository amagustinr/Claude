/* =====================================================================
   Datos de ejemplo (opcional). Ejecutar en Supabase > SQL Editor
   DESPUÉS de la migración 20261005000001_esquema.sql.
   ===================================================================== */
insert into public.categoria (nombre) values ('Cervezas'), ('Vinos'), ('Destilados'), ('Espumantes'), ('Licores');

insert into public.producto (codigo, nombre, categoria_id, grado_alcoholico, volumen_ml, precio_venta, stock, stock_minimo)
select x.codigo, x.nombre, c.id, x.grado, x.volumen, x.precio_venta, x.stock, x.stock_minimo
from (values
    ('7801234000011', 'Cerveza Lager lata 470ml',      'Cervezas',    4.5,  470,  1090, 120, 24),
    ('7801234000028', 'Cerveza IPA botella 330ml',     'Cervezas',    6.0,  330,  1590,  48, 12),
    ('7801234000035', 'Vino Cabernet Sauvignon 750ml', 'Vinos',      13.5,  750,  4990,  36,  6),
    ('7801234000042', 'Vino Carmenere Reserva 750ml',  'Vinos',      14.0,  750,  6990,  24,  6),
    ('7801234000059', 'Pisco 35° 1L',                  'Destilados', 35.0, 1000,  7490,  30,  6),
    ('7801234000066', 'Ron añejo 750ml',               'Destilados', 40.0,  750, 10990,  12,  3),
    ('7801234000073', 'Espumante Brut 750ml',          'Espumantes', 12.0,  750,  6490,  18,  4),
    ('7801234000080', 'Licor de café 700ml',           'Licores',    25.0,  700,  8990,   2,  3)
) as x(codigo, nombre, categoria, grado, volumen, precio_venta, stock, stock_minimo)
join public.categoria c on c.nombre = x.categoria
order by x.codigo;

insert into public.producto_costo (producto_id, precio_compra)
select p.id, x.precio_compra
from (values
    ('7801234000011',  650), ('7801234000028',  900), ('7801234000035', 2900), ('7801234000042', 4200),
    ('7801234000059', 4500), ('7801234000066', 6500), ('7801234000073', 3800), ('7801234000080', 5200)
) as x(codigo, precio_compra)
join public.producto p on p.codigo = x.codigo;

-- Stock inicial al kardex (usuario null = "sistema")
insert into public.movimiento_stock (producto_id, tipo, cantidad, stock_resultante, referencia)
select id, 'ENTRADA', stock, stock, 'Stock inicial' from public.producto;

insert into public.cliente (rut, razon_social, giro, direccion, comuna, ciudad, email)
values ('77.777.777-7', 'Comercial Ejemplo Ltda.', 'Restaurante', 'Calle Falsa 456', 'Providencia', 'Santiago', 'contacto@ejemplo.cl');
