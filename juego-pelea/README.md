# Arena de Pelea — juego de pelea web (Cloudflare Pages + Supabase)

Juego de pelea 2D en el navegador con:

- **Panel de administración** (`/admin.html`) con usuario y contraseña: crear, editar y eliminar personajes;
  fijar fuerza / agilidad / resistencia, sexo, altura, peso y complexión; subir la foto de la cara y marcarlo
  como disponible o no. Incluye una vista previa animada del luchador.
- **Pelea en línea 1 contra 1**: sala de espera con los jugadores conectados, desafío, selección de personaje,
  botón "¡Listo!" en ambos lados y combate **al mejor de 3** rondas (99 s cada una).
- **Modo práctica** contra la CPU (útil para probar sin un segundo jugador).
- Ataques: golpe y patada, de pie, agachado y en el aire; salto; agacharse; bloqueo (mantener hacia atrás).

## Estructura

```
juego-pelea/
├─ index.html              Juego (inicio, sala de espera, selección, pelea)
├─ admin.html              Panel de administración
├─ src/
│  ├─ supabase.js          Cliente Supabase (lee las variables de entorno)
│  ├─ main.js              Flujo de pantallas del juego
│  ├─ admin/admin.js       Lógica del panel
│  ├─ game/
│  │  ├─ stats.js          Cómo las estadísticas y la contextura afectan la pelea
│  │  ├─ engine.js         Motor (física, ataques, impactos, rondas), sin dibujo ni red
│  │  ├─ poses.js          Poses del esqueleto para cada acción
│  │  ├─ cuerpo.js         Dibujo del luchador: trajes, colores, peinados y la foto
│  │  ├─ render.js         Escenario, marcador y efectos
│  │  ├─ partida.js        Bucle de juego (anfitrión / invitado)
│  │  ├─ input.js          Teclado y botones táctiles
│  │  ├─ cpu.js            Rival del modo práctica
│  │  └─ sfx.js            Sonidos sintetizados
│  └─ net/
│     ├─ lobby.js          Sala de espera (Realtime Presence + Broadcast)
│     └─ sala.js           Canal de 2 jugadores para el combate
└─ supabase/               Scripts SQL (ejecutar en orden)
   ├─ 01_tablas.sql
   ├─ 02_seguridad_rls.sql
   ├─ 03_storage_caras.sql
   ├─ 04_alta_admin.sql
   ├─ 05_datos_ejemplo.sql (opcional)
   └─ 06_apariencia.sql    Traje, colores y peinado
```

Separado en capas como en N-capas: **datos** (Supabase + `supabase.js`), **lógica** (`game/engine.js`,
`game/stats.js`, sin dependencias de pantalla) y **presentación** (`render.js`, `main.js`, `admin.js`).

---

## 1. Configurar Supabase

1. Crea un proyecto en <https://supabase.com>.
2. **SQL Editor**: ejecuta, en orden, `supabase/01_tablas.sql`, `02_seguridad_rls.sql`, `03_storage_caras.sql` y
   `06_apariencia.sql` (ropa y aspecto; si ya tenías la base creada, basta con ejecutar este).
3. **Authentication → Users → Add user → Create new user**: tu correo y contraseña, marcando *Auto Confirm User*.
   Ese correo es el "usuario" del panel.
4. Cambia el correo en `supabase/04_alta_admin.sql` y ejecútalo. Debe devolver 1 fila.
5. (Recomendado) En la configuración de Authentication desactiva *Allow new users to sign up*, para que nadie más
   pueda registrarse. Aunque alguien lo hiciera, no podría modificar nada: las políticas RLS exigen estar en la
   tabla `admins`.
6. (Opcional) `05_datos_ejemplo.sql` crea dos personajes de prueba.
7. **Project Settings → API**: copia la *Project URL* y la *anon public key*.

> La *anon key* es pública por diseño (va dentro del JavaScript del navegador). La seguridad la dan las políticas
> RLS de `02_seguridad_rls.sql` y `03_storage_caras.sql`. **Nunca** uses la *service_role key* en el front.

Realtime: el juego usa canales públicos de Broadcast y Presence, que funcionan con la anon key sin crear tablas.
Si en la configuración de Realtime desactivaste el acceso público a canales, vuelve a activarlo.

## 2. Probar en tu PC

Requiere Node.js 20 o superior.

```bash
cd juego-pelea
cp .env.example .env        # en Windows: copy .env.example .env
# edita .env con la URL y la anon key
npm install
npm run dev
```

- Juego: <http://localhost:5173/>
- Panel: <http://localhost:5173/admin.html>

Para probar el modo en línea abre el juego en **dos ventanas** (o dos navegadores), pon nombres distintos,
pulsa *Jugar en línea* en ambas y desafía desde una a la otra.

## 3. Publicar en Cloudflare Pages

Las variables `VITE_...` se incrustan en el JavaScript **al compilar**, así que deben existir en el momento del build.

### Opción A: desde GitHub (recomendada, se publica sola en cada push)

1. Sube la carpeta a un repositorio de GitHub (el `.gitignore` ya excluye `node_modules`, `dist` y `.env`).
2. Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** → elige el repositorio.
3. Configuración de build:
   - Framework preset: **Vite** (o *None*)
   - Build command: `npm run build`
   - Build output directory: `dist`
4. **Environment variables** (Production y Preview):
   - `VITE_SUPABASE_URL` = tu Project URL
   - `VITE_SUPABASE_ANON_KEY` = tu anon key
   - `NODE_VERSION` = `22`
5. *Save and Deploy*. Tendrás una URL tipo `https://arena-pelea.pages.dev` y el panel en `/admin.html`.

### Opción B: subida directa sin GitHub

```bash
npm run build                       # usa tu .env local
npx wrangler login
npx wrangler pages deploy dist --project-name arena-pelea
```

Después, en Supabase → **Authentication → URL Configuration**, pon tu dominio de Pages como *Site URL*.

---

## Cómo influyen las estadísticas

| Dato | Efecto en la pelea |
|---|---|
| Fuerza (1-100) | Multiplica el daño de 0,6× a 1,6× |
| Agilidad (1-100) | Velocidad al caminar, altura del salto y rapidez de golpes y patadas |
| Resistencia (1-100) | Vida de 800 a 1400 y hasta 20 % menos daño recibido |
| Altura (140-220 cm) | Tamaño en pantalla y alcance de brazos y piernas (también es un blanco más grande) |
| Peso (40-160 kg) | Más pesado: algo más lento, pero retrocede menos al ser golpeado |
| Complexión | Grosor del cuerpo (dibujo y caja de colisión) |
| Sexo | Silueta (hombros, caderas, pelo) |

Las fórmulas están en `src/game/stats.js`, en un solo lugar, para ajustar el balance.

## Apariencia y ropa

Desde el panel, en **Apariencia y ropa**, cada personaje tiene:

| Campo | Opciones |
|---|---|
| Traje | Karate (gi con cinturón), Boxeo (short, guantes y botas), Callejero (camiseta, jeans y zapatillas), Ninja (traje completo, fajín y vendas), Luchador (malla, rodilleras y botas) |
| Color principal | Color de la prenda principal (gi, short, camiseta, traje, malla) |
| Color de detalles | Cinturón, guantes, jeans, fajín, botas, etc. |
| Pelo y peinado | Corto, largo, coleta, punk o rapado (largo, coleta y punk se ven también con foto) |
| Piel | Selector libre o 5 tonos rápidos |

El botón *Colores al azar* propone una combinación y la vista previa va cambiando de pose para ver el traje en
movimiento. Si los dos jugadores eligen el mismo personaje, el jugador 2 sale con los colores invertidos y cada
uno lleva una marca 1P / 2P sobre la cabeza.

## Controles

| Acción | Teclado | Celular |
|---|---|---|
| Avanzar / retroceder | A / D o ← / → | Cruceta: flecha derecha / izquierda |
| Saltar | W o ↑ | Cruceta: flecha arriba (en diagonal salta hacia adelante o atrás) |
| Agacharse | S o ↓ | Cruceta: flecha abajo |
| Golpe | J o Z | Círculo central de la cruceta |
| Patada | K o X | Botón redondo "Patada" a la derecha |
| Bloquear | Mantener hacia atrás | Mantener la flecha hacia atrás |

En celular la cruceta circular va abajo a la izquierda y se puede deslizar el dedo entre flechas sin levantarlo.
Se juega mejor en horizontal: en vertical aparece un aviso para girar el teléfono.

Reglas de bloqueo: la barrida (agachado + patada) solo se bloquea agachado; los ataques en el aire solo de pie;
el resto de las dos formas. Agacharse esquiva el golpe alto de pie.

## Cómo funciona la pelea en línea

- **Sala de espera**: canal `lobby` de Realtime. *Presence* muestra quién está conectado y si está libre;
  *Broadcast* envía los retos (`reto`, `respuesta`, `cancelar`).
- **Combate**: canal `sala:<uuid>` solo para los dos jugadores. Ambos envían `sel` y `listo`; cuando los dos están
  listos, el **anfitrión** (quien desafió, lado izquierdo) envía `inicio`.
- **Sincronización**: el anfitrión ejecuta el motor a 60 fps y envía el estado 15 veces por segundo; el invitado
  envía sus teclas cuando cambian. El invitado suaviza las posiciones para que se vea fluido. La simulación corre
  con un reloj en un Web Worker, así no se congela si el anfitrión cambia de pestaña.
- Si un jugador se desconecta, el otro vuelve a la sala de espera con un aviso.

Consumo aproximado: unos 20 mensajes Realtime por segundo durante una pelea (3.000 a 4.000 por combate).
Revisa la cuota de mensajes de tu plan de Supabase.
