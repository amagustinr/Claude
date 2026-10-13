# Tutifruti camuflado como Excel

Tutifruti multijugador en tiempo real (Node.js + Express + Socket.io) con una
interfaz que imita una hoja de cálculo de Excel. Uso recreativo entre
compañeros. Todo el estado vive en memoria: no necesita base de datos.

> Es un proyecto distinto de la carpeta `tutifruti/` de este repositorio
> (aquella es la versión PWA con salas).

---

## Estructura

```
tutifruti-excel/
  server.js          backend (Express + Socket.io)
  package.json
  package-lock.json
  render.yaml        blueprint opcional para Render
  public/
    index.html        frontend completo (HTML + CSS + JS en un solo archivo)
```

`index.html` tiene que estar dentro de `public/`. Si falta, el navegador
muestra `Cannot GET /`.

---

## Publicarlo en internet con Render (link fijo, sin depender de tu PC)

1. Entra a https://render.com e inicia sesión con tu cuenta de GitHub.
2. **New → Web Service** y elige el repositorio `amagustinr/claude`.
   Si no aparece, dale acceso a Render desde la configuración de GitHub.
3. Completa así:

   | Campo | Valor |
   |---|---|
   | Name | `catalogo-maestro` (define la URL: `catalogo-maestro.onrender.com`) |
   | Root Directory | `tutifruti-excel` |
   | Runtime | Node |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance Type | **Free** |
   | Health Check Path (en *Advanced*) | `/api/salud` |

4. **Create Web Service**. El primer deploy tarda unos minutos. Al terminar,
   la URL aparece arriba en el panel.

**Root Directory es obligatorio**: el repositorio tiene varios proyectos y
Render tiene que saber cuál ejecutar.

Si el nombre ya está tomado, Render agrega un sufijo a la URL. No pongas
"tutifruti" ni "juego" en el nombre, porque se ve en la barra de direcciones.

Cada `git push` a `main` vuelve a desplegar el servicio solo.

### Límites del plan gratis

- Se duerme tras 15 minutos sin tráfico. El primero que entre después
  espera cerca de un minuto a que despierte.
- Al dormirse o reiniciarse se pierden los puntajes acumulados y el chat.
  Los jugadores que tengan la página abierta se vuelven a registrar solos
  con su mismo nombre.
- El plan Starter (de pago) elimina el apagado.

---

## Ejecutar localmente

Requiere Node.js 18 o superior (`node -v` para verificar).

```
npm install
npm start
```

Abrir `http://localhost:3000`. Desde otras PCs de la misma red:
`http://IP-DE-TU-PC:3000` (la IP sale con `ipconfig`, línea *Dirección IPv4*).

Si los compañeros no cargan la página, casi siempre es el Firewall de
Windows: crear una regla de entrada que permita TCP 3000. Para descartarlo,
desde otra PC: `Test-NetConnection IP-DE-TU-PC -Port 3000`. Si siguen sin
llegar con el firewall abierto, probablemente estén en otra VLAN.

`Ctrl + C` en la terminal detiene el servidor.

### Variables de entorno opcionales

| Variable | Por defecto | Para qué |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor (Render lo define solo) |
| `GRACIA_MS` | `120000` | Cuánto se conserva a un jugador desconectado antes de retirarlo |

---

## Cómo se juega

1. Cada uno abre la URL y escribe su nombre en la celda B3
   ("Responsable de la hoja").
2. **Sala de espera:** se ve la lista de conectados. Cada uno pulsa
   "Marcar como revisado". Cuando todos los conectados están revisados,
   la ronda arranca sola.
3. **Ronda (Hoja1):** la letra aparece como *Clasificación* en la fila 2.
   Se completan los campos; `Enter` baja a la siguiente celda. El primero
   que termina pulsa **Guardar y validar** y la ronda se cierra para todos.
4. **Validación:** cada uno marca las respuestas ajenas que no valen. Si más
   de la mitad de los demás rechaza una, vale 0. Se confirma con
   **Aplicar filtros**.
5. **Resumen:** puntaje de la ronda y acumulado. "Volver a la lista de
   usuarios" lleva a la sala de espera.

| Categoría real | Nombre en la hoja |
|---|---|
| Nombre | Responsable asignado |
| Apellido | Apellido del responsable |
| Cosa / empresa | Razón social del proveedor |
| Color | Atributo cromático |
| Fruta o comida | Insumo perecible |
| Animal | Bien semoviente |
| País | Origen / país de procedencia |
| Cosa | Descripción del bien |

**Puntaje:** 100 si nadie más puso esa palabra, 50 si se repite, 0 si está
vacía, no empieza con la letra o fue rechazada. Se ignoran tildes y
mayúsculas al comparar.

| Botón de la cinta | Acción |
|---|---|
| Actualizar datos | Marcar / desmarcar como revisado |
| Guardar y validar | Cerrar la ronda |
| Aplicar filtros | Confirmar la validación |
| Comentarios | Abrir el chat (con emojis) |
| Borrar formato | Poner todos los puntajes en cero |

### Tecla de pánico

- **PC:** `Esc` tapa todo con una hoja de inventario falsa. `Esc` de nuevo o
  doble clic la quita.
- **Celular:** tres toques seguidos sobre la barra verde de arriba. Doble
  toque para quitarla.

En PC, `F11` (pantalla completa) oculta la barra de direcciones y la
imitación de Excel es mucho más creíble.

---

## Conexión desde el celular

- Cada pestaña guarda un token propio, así que si el celular se bloquea o
  cambia de app, al volver recupera su nombre, su puntaje y lo que había
  escrito.
- Un jugador desconectado aparece como "Sin conexión" y no traba el inicio
  de la ronda. Si no vuelve en 2 minutos, se retira.
- Recargar la página no pide el nombre otra vez. Para entrar con otro
  nombre, abrir una pestaña nueva.
- Con HTTPS (Render o un túnel de Cloudflare) el celular además mantiene la
  pantalla encendida mientras se juega.
