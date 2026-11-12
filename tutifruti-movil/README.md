# Tutifruti móvil 🍓🍋🍏🍇

Tutifruti multijugador en tiempo real pensado para jugar desde el celular. Usa **Node.js + Express + Socket.io**.
Todo el estado vive en memoria, así que no necesita base de datos.

Está basado en [`tutifruti-excel`](https://github.com/amagustinr/Claude/tree/main/tutifruti-excel), con estos cambios:

- **Salas con código de 4 letras**: varios grupos pueden jugar al mismo tiempo. Se comparten con un enlace (`?sala=ABCD`) desde el botón *Invitar*, que abre el menú de compartir del celular.
- **Interfaz para móvil**: botones grandes, barra inferior fija, modo oscuro automático y se puede instalar en la pantalla de inicio (PWA).
- **El anfitrión configura la partida**: elige el tiempo por ronda (sin límite, 1, 1½, 2 o 3 min) y las categorías (de 3 a 12, con sugerencias).
- Cuenta regresiva 3-2-1 antes de mostrar la letra, y vibración en los momentos clave.
- Para cantar **¡Basta!** hay que completar todas las categorías.
- La votación se ve en vivo: cada jugador ve los 👎 que recibe cada respuesta.

## Cómo se juega

1. Un jugador crea la sala y comparte el código o el enlace.
2. Cuando todos marcan **¡Estoy listo!**, empieza la cuenta regresiva y sale una letra al azar. El anfitrión 👑 puede empezar sin esperar a los demás.
3. Cada jugador escribe una palabra con esa letra para cada categoría. El ✅ o ⚠️ indica si la palabra empieza con la letra correcta.
4. El primero en completar todo canta **¡Basta!** y la ronda se cierra para todos. Si se acaba el tiempo, también se cierra.
5. **Revisión**: cada jugador toca las respuestas ajenas que no valen. Si más de la mitad de los demás jugadores rechaza una respuesta, vale 0.
6. **Resultados**: se ven los puntos de la ronda y el total acumulado. Al tocar un jugador se ve el detalle de sus respuestas.

### Puntaje

| Puntos | Condición |
|---|---|
| 100 | Nadie más escribió esa palabra |
| 50 | Otro jugador escribió la misma palabra |
| 0 | Está vacía, no empieza con la letra o fue rechazada en la revisión |

Al comparar respuestas no importan las tildes ni las mayúsculas. Las letras K, Q, W, X, Y y Z no salen.

## Ejecutar en local

Requiere Node.js 18 o superior.

```bash
npm install
npm start
```

Abre `http://localhost:3000`. Para jugar desde celulares en la misma red Wi-Fi, entra a `http://<IP-de-tu-PC>:3000`. La IP aparece como *Dirección IPv4* al ejecutar `ipconfig`. Si no conecta, crea en el Firewall de Windows una regla de entrada para el puerto TCP 3000.

## Publicar en Render (gratis)

1. Sube esta carpeta a tu repo de GitHub, por ejemplo como `tutifruti-movil/` dentro de `amagustinr/Claude`.
2. En Render, crea un **Web Service** desde el repo con esta configuración:
   - **Root Directory**: `tutifruti-movil`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/api/salud`

   También puedes usar el `render.yaml` incluido como Blueprint.
3. Comparte la URL `https://<tu-servicio>.onrender.com` con tus amigos.

> En el plan gratuito, el servicio se duerme tras 15 minutos sin tráfico y tarda unos segundos en despertar. Al reiniciarse se pierden las salas y los puntajes.

## Variables de entorno

| Variable | Por defecto | Uso |
|---|---|---|
| `PORT` | `3000` | Puerto HTTP |
| `GRACIA_MS` | `120000` | Cuánto tiempo (en ms) se guarda el lugar de un jugador desconectado antes de sacarlo de la sala |

## Reconexión

Cada pestaña guarda su propio token. Si el celular se bloquea, cambias de app o recargas la página, vuelves a la sala con tu nombre, tu puntaje y lo que ya habías escrito. Si un jugador no vuelve en 2 minutos, sale de la sala. Si sale el anfitrión, el rol pasa a otro jugador.

## Estructura

```
tutifruti-movil/
├── server.js          # Servidor Express + Socket.io: salas, rondas, votación y puntaje
├── public/
│   ├── index.html     # Cliente completo (HTML + CSS + JS)
│   ├── manifest.json  # Manifiesto de la PWA
│   └── icon.svg
├── package.json
└── render.yaml
```
