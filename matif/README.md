# Matif · Postres artesanales

Página web de postres del negocio Matif: catálogo del día, carrito de pedido y un panel para administrar los productos.

Es un solo archivo (`index.html`) en HTML, CSS y JavaScript. Los productos se guardan en Supabase (`supabase-js@2` cargado desde CDN), y la conexión se configura en el objeto `CFG` del script (`supabaseUrl` y `supabaseKey`).

## Cómo usarlo

Abre `index.html` en el navegador o publícalo en GitHub Pages o cualquier hosting estático.

- **Catálogo**: búsqueda y filtro de postres, con tarjetas adaptadas a celular (2 columnas), tablet y escritorio.
- **Carrito**: se abre como panel inferior en celular, con bloqueo de scroll del fondo.
- **Panel** (con inicio de sesión): alta, edición, activación y eliminación de productos, y seguimiento de pedidos en tiempo real.
- **Compartir**: enlace del catálogo o de un producto por WhatsApp.

La página es responsive y se probó en 320, 375, 768 y 1280 px sin scroll horizontal.

## Seguridad

La clave incluida es la clave pública `anon` de Supabase, pensada para ir en el navegador. Quién puede leer o modificar los productos lo deciden las políticas RLS de las tablas en Supabase, así que conviene revisarlas antes de publicar.
