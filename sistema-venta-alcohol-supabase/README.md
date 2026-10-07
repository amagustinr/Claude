# Sistema de Venta de Alcohol (Botillería) · Supabase + Cloudflare

Misma funcionalidad que la versión .NET (`../sistema-venta-alcohol`), pero sin servidor propio:

- **Base de datos, login y API:** Supabase (PostgreSQL + Supabase Auth + API REST automática).
- **Sitio web:** React + Vite publicado en **Cloudflare Pages**.
- **Crear usuarios / cambiar claves:** una función pequeña en Cloudflare (`web/functions/api/usuarios.js`), porque necesita la llave secreta de Supabase y esa llave nunca debe llegar al navegador.
- **País:** Chile (RUT con dígito verificador, IVA 19 % incluido en el precio, boleta y factura con folio interno).

## Cómo se compara con la versión .NET

| Versión .NET (N-capas) | Esta versión | Comentario |
|---|---|---|
| SQL Server | PostgreSQL (Supabase) | Mismas tablas, nombres en `snake_case`. |
| Procedimientos `usp_*` | Funciones PL/pgSQL (`registrar_venta`, `anular_venta`, ...) | Se llaman con `supabase.rpc('registrar_venta', {...})`. |
| `THROW 50060, 'mensaje'` | `raise exception 'mensaje'` | El mensaje llega tal cual al frontend. |
| Tipo tabla `TipoDetalleVenta` | Parámetro `jsonb` `[{"producto_id":1,"cantidad":2}]` | |
| `WITH (UPDLOCK)` + `BEGIN TRAN` | `select ... for update` | Cada llamada RPC es una transacción: si algo falla se deshace todo. |
| Capa Datos (ADO.NET) | `supabase-js` (`supabase.from('producto').select(...)`) | La API REST la genera Supabase a partir de las tablas. |
| `[Authorize(Roles="Administrador")]` | Políticas **RLS** en la base | La seguridad vive en la base, no en el frontend (ver abajo). |
| Cookie de sesión + PBKDF2 | Supabase Auth (JWT) | Supabase guarda las claves con bcrypt. |
| Vistas Razor | Componentes React (`web/src/paginas`) | Mismas pantallas y Bootstrap 5. |

### Por qué la seguridad está en la base (RLS)

En Supabase el navegador consulta la base directamente a través de la API REST. Cualquiera podría abrir la consola del navegador y llamar a la API con su sesión, así que **ocultar un botón no protege nada**. Por eso cada tabla tiene *Row Level Security* (seguridad por fila) activado, con políticas como:

- `venta`: el administrador ve todas; el vendedor solo las suyas (`usuario_id = auth.uid()`).
- `producto_costo` (precio de compra): solo el administrador. Está en una tabla aparte porque RLS filtra filas, no columnas.
- `producto`, `venta`, `movimiento_stock`: nadie puede escribirlas directo. El stock solo cambia con las funciones `registrar_venta`, `anular_venta` y `registrar_movimiento_stock`, que validan el rol por dentro.
- Un usuario desactivado deja de ver datos de inmediato, aunque su sesión siga abierta.

La llave `anon` que va en el frontend es pública por diseño; sin sesión no ve nada. La llave `service_role` (secreta) solo vive en Cloudflare como *Secret*.

## Perfiles

| Función | Administrador | Vendedor |
|---|:-:|:-:|
| Emitir boleta / factura | ✔ | ✔ |
| Ver ventas | Todas | Solo las propias |
| Consultar productos y stock | ✔ (incluye precio de compra) | ✔ (sin precio de compra) |
| Registrar clientes para factura | ✔ | ✔ |
| Crear / editar productos y categorías | ✔ | ✖ |
| Entradas, salidas y ajustes de stock, kardex | ✔ | ✖ |
| Anular documentos (repone stock) | ✔ | ✖ |
| Panel con indicadores | ✔ | ✖ |
| Usuarios y datos de la empresa | ✔ | ✖ |

Reglas iguales a la versión .NET: venta en una sola transacción con bloqueo (dos cajas vendiendo el último producto no dejan stock negativo), folio correlativo por tipo de documento, factura con cliente con RUT válido, giro, dirección y comuna, verificación de mayoría de edad obligatoria (Ley 19.925) y kardex de todo movimiento.

---

## Paso 1: crear la base en Supabase

1. Cree una cuenta en <https://supabase.com> y un proyecto nuevo. Región recomendada para Chile: **South America (São Paulo)**. Guarde la clave de la base que le pide.
2. Vaya a **SQL Editor > New query**, pegue el contenido completo de `supabase/migrations/20261005000001_esquema.sql` y presione **Run**.
3. (Opcional) En otra consulta, pegue y ejecute `supabase/seed.sql` para cargar categorías, 8 productos y un cliente de ejemplo.
4. Configure el login en **Authentication > Sign In / Providers > Email**:
   - Desactive **Allow new users to sign up** (los usuarios los crea el administrador desde el sistema).
   - Desactive **Confirm email** (los correos son internos, no se envía nada).
   - Si aparece, ponga **Minimum password length** en 8.
5. Cree el primer usuario en **Authentication > Users > Add user > Create new user**:
   - Email: `admin@botilleria.local` (el sistema convierte el usuario `admin` en ese correo).
   - Password: la clave que quiera (mínimo 8 caracteres).
   - Marque **Auto Confirm User**.

   El **primer usuario creado queda automáticamente como Administrador**. Los siguientes se crean desde la pantalla *Usuarios* del sistema.
6. Copie los datos de conexión desde **Project Settings > API Keys** (pestaña *Legacy API Keys*, que es el formato JWT con el que se probó el sistema):
   - **Project URL** (`https://xxxx.supabase.co`, en *Project Settings > Data API*)
   - **anon public** → va al frontend
   - **service_role** (secreta) → solo en Cloudflare

   Las llaves nuevas (`sb_publishable_...` / `sb_secret_...`) deberían funcionar igual, pero no las probé.

> **Plan gratuito:** Supabase pausa los proyectos gratuitos tras 7 días sin actividad y no incluye respaldos diarios. Para una botillería en operación conviene el plan Pro.

## Paso 2: probar en su PC (opcional)

Requisitos: Node.js 20 o superior.

```bash
cd web
npm install
cp .env.example .env.local     # y complete VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run dev                    # abre http://localhost:5173
```

Ingrese con usuario `admin` y la clave del paso 1.5. Con `npm run dev` funciona todo menos **crear usuarios y cambiar claves de otros**, que necesitan la función de Cloudflare. Para probarla en local:

```bash
cp .dev.vars.example .dev.vars   # complete también SUPABASE_SERVICE_ROLE_KEY
npm run build
npx wrangler pages dev dist      # abre http://localhost:8788
```

## Paso 3: publicar en Cloudflare Pages

### Opción A: desde GitHub (recomendada, se publica sola en cada cambio)

1. Suba esta carpeta a un repositorio de GitHub (el `.gitignore` ya excluye `node_modules`, `.env.local` y `.dev.vars`).
2. En <https://dash.cloudflare.com> vaya a **Workers & Pages > Create > Pages > Connect to Git** y elija el repositorio.
3. Configuración de compilación:
   - **Framework preset:** Vite (o *None*)
   - **Root directory:** `web` (si el proyecto está dentro de una carpeta del repositorio, como en `amagustinr/Claude`, use `sistema-venta-alcohol-supabase/web`)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. En **Environment variables** agregue:

   | Nombre | Valor | Tipo |
   |---|---|---|
   | `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` | Text |
   | `VITE_SUPABASE_ANON_KEY` | llave *anon* | Text |
   | `VITE_DOMINIO_USUARIOS` | `botilleria.local` | Text |
   | `SUPABASE_SERVICE_ROLE_KEY` | llave *service_role* | **Secret** |

5. **Save and Deploy.** Queda publicado en `https://<nombre>.pages.dev`. Puede asociar su propio dominio en *Custom domains*.

Si cambia una variable `VITE_*` después, haga **Retry deployment**: esas variables se incrustan al compilar.

### Opción B: subir desde su PC con Wrangler

```bash
cd web
npm install
# .env.local con VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY y VITE_DOMINIO_USUARIOS
npm run build
npx wrangler login
npx wrangler pages deploy dist --project-name botilleria
```

Wrangler sube también la carpeta `functions/`. Luego, en el panel de Cloudflare, en *Settings > Variables and Secrets* del proyecto, agregue las variables de la tabla anterior (al menos `SUPABASE_SERVICE_ROLE_KEY` como Secret, y las `VITE_*` que usa la función) y vuelva a publicar.

No use el "arrastrar y soltar" del panel: esa forma no publica la carpeta `functions/` y la pantalla Usuarios no podría crear usuarios.

## Primer uso

1. Ingrese con `admin`.
2. **Administración > Usuarios:** edite su nombre y cree los vendedores.
3. **Administración > Datos de la empresa:** RUT, razón social, giro, dirección (salen en las boletas y facturas) y % de IVA.
4. **Productos > Nuevo producto** y luego **Movimientos de stock > ENTRADA** para cargar el stock inicial.

## Estructura

```
sistema-venta-alcohol-supabase/
├── supabase/
│   ├── migrations/20261005000001_esquema.sql   tablas, funciones, vistas, RLS
│   └── seed.sql                                datos de ejemplo
└── web/                                        proyecto Cloudflare Pages
    ├── functions/api/usuarios.js               crear usuarios / cambiar claves (servidor)
    ├── src/
    │   ├── supabase.js        conexión (equivale a la cadena de conexión)
    │   ├── sesion.jsx         usuario conectado y su rol
    │   ├── util.js            formato de pesos/fechas y validación de RUT
    │   ├── App.jsx            rutas (páginas) y restricción por rol
    │   ├── componentes/       menú y piezas comunes
    │   └── paginas/           una por pantalla (NuevaVenta, Ventas, Documento, Productos, ...)
    ├── .env.example           variables para desarrollo
    └── package.json
```

Si más adelante usa la CLI de Supabase (`supabase link` y `supabase db push`), la carpeta `supabase/migrations` ya tiene el formato que espera.

## Qué se probó

- El script SQL se ejecutó en PostgreSQL 16 con un esquema `auth` que imita al de Supabase. Se probaron las reglas por rol (vendedor sin precio de compra, sin anular, sin kardex; usuario desactivado sin acceso; registro público queda inactivo), RUT inválido rechazado, último administrador protegido y **dos ventas simultáneas del último stock** (la segunda espera y es rechazada).
- La aplicación compilada se probó en Chromium contra PostgREST (el mismo motor de la API de Supabase) y la función `/api/usuarios`, con un login simulado: 23 casos de punta a punta (login, crear vendedor, entrada de stock, producto nuevo, boleta por nombre y por código de barras, factura con cliente nuevo, anulación, kardex, panel, cambio de clave, desactivación).
- No se publicó en una cuenta real de Supabase ni de Cloudflare.

## Importante: facturación electrónica

Igual que en la versión .NET, las boletas y facturas son **documentos internos** con folio propio, no DTE ante el SII. Para validez tributaria hay que integrar un proveedor de facturación electrónica; la tabla `venta` ya tiene los datos necesarios. En esta arquitectura eso se haría con otra función en Cloudflare o una *Edge Function* de Supabase, para que las credenciales del proveedor no lleguen al navegador.
