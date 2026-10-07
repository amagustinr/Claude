# Tutifruti Online 🍊

Tutifruti (Basta / Stop / Tutti Frutti) multijugador en tiempo real para jugar con amigos por internet desde el celular.

- **Cliente:** PWA (HTML + CSS + JavaScript sin frameworks). Se instala en Android/iOS con “Agregar a pantalla de inicio”.
- **Servidor:** Node.js + Express + Socket.io. Todo el estado vive en memoria (no requiere base de datos).

## Flujo del juego

1. **Crear o buscar sala.** Un jugador crea la sala, pública o privada (con contraseña). Los demás la buscan por nombre o código, escriben su nombre y entran. También se puede compartir un enlace `https://tu-dominio/?sala=CODIGO`.
2. **Sala de espera.** Cada quien pulsa **“Marcar como listo”**. Cuando todos los conectados (mínimo 2) están listos, la ronda arranca sola con una cuenta regresiva y una letra al azar que no se repite hasta agotar el abecedario.
3. **Ronda.** Se completan las categorías con la letra. El botón **STOP** se habilita solo cuando completaste todas las categorías; el primero que lo pulsa cierra la ronda para todos. Si el anfitrión configuró un límite de tiempo, la ronda también se cierra al llegar a cero.
4. **Validación cruzada rotativa.** Se baraja el orden y cada jugador revisa las respuestas de otro (A→B→C→A). Las respuestas vacías son inválidas y las que no empiezan con la letra aparecen marcadas como inválidas, pero el revisor puede cambiarlas. También se indica si una respuesta está repetida con otro jugador. Cada quien pulsa **“Aplicar”**; cuando todos aplicaron se calcula el puntaje. Si alguien se desconecta, el anfitrión puede **forzar** las revisiones pendientes.
5. **Resumen.** Ranking de la ronda, puntaje acumulado y la tabla de respuestas. Desde ahí se vuelve a la sala de espera para la siguiente ronda. La pestaña **Resumen** de la sala muestra el acumulado y el historial.

### Puntaje

| Caso | Puntos |
|---|---|
| Única respuesta válida en la categoría | 20 |
| Válida y no repetida | 10 |
| Válida pero repetida con otro jugador | 5 |
| Vacía o invalidada | 0 |

La comparación de repetidas ignora mayúsculas, tildes y espacios extra (“Ávila” = “avila”), pero respeta la Ñ.

### Reglas configurables (anfitrión)

Categorías (3 a 12, por defecto: Nombre, Apellido, País o ciudad, Animal, Fruta o verdura, Color, Cosa, Marca), tiempo por ronda (sin límite, 1, 1½, 2 o 3 minutos) e incluir letras difíciles (K, Ñ, Q, W, X, Y, Z). Se editan en la sala de espera entre rondas.

## Ejecutar localmente

```bash
npm install
npm start            # http://localhost:3000
npm test             # simula una partida completa con 3 jugadores
```

Para probar con el celular en la misma red Wi-Fi, abre `http://IP-DE-TU-PC:3000`. La instalación como app (PWA) requiere **HTTPS**, así que para uso real despliégalo en internet.

## Desplegar en internet

### Opción A: Render (gratis, recomendado para empezar)

1. Sube esta carpeta a un repositorio de GitHub.
2. En [render.com](https://render.com): **New → Blueprint** y elige el repositorio (usa `render.yaml`), o **New → Web Service** con:
   - Build command: `npm install`
   - Start command: `npm start`
3. Render te da una URL `https://tutifruti-xxxx.onrender.com` con HTTPS y WebSockets. Compártela con tus amigos.

> El plan gratuito “duerme” el servicio tras ~15 min sin uso; la primera visita tarda unos segundos en despertar. Al reiniciarse, las salas abiertas se pierden.

### Opción B: Railway / Fly.io

Ambos detectan Node automáticamente (`npm start`). También se incluye un `Dockerfile`.

### Opción C: Tu propio Windows Server con IIS

1. Instala Node.js LTS y ejecuta la app como servicio (por ejemplo con [NSSM](https://nssm.cc/): `nssm install Tutifruti "C:\Program Files\nodejs\node.exe" C:\apps\tutifruti\server.js`, con la variable `PORT=3000`).
2. En IIS instala **URL Rewrite** + **Application Request Routing (ARR)**, habilita el proxy en ARR y activa la característica **WebSocket Protocol** de Windows.
3. Crea un sitio (por ejemplo `tutifruti.tudominio.com`) con certificado SSL y una regla de reescritura *reverse proxy* hacia `http://localhost:3000/{R:1}`.

## Estructura

```
server.js            Servidor Express + Socket.io (salas, fases, eventos)
lib/game.js          Lógica pura: normalización, letras, asignación de revisores, puntaje
public/index.html    Cáscara de la PWA
public/app.js        Cliente: pantallas y comunicación en tiempo real
public/app.css       Estilos (modo claro y oscuro)
public/sw.js         Service worker (instalable, abre rápido)
public/manifest.webmanifest, public/icons/
test/simulacion.js   Prueba de extremo a extremo con 3 jugadores
```

## Eventos Socket.io

| Cliente → servidor | Uso |
|---|---|
| `hello {playerId}` | Identificación persistente (permite reconectar sin perder sala ni puntaje) |
| `rooms:subscribe` | Lista de salas en vivo (evento `rooms:list`) |
| `room:create`, `room:join`, `room:leave` | Crear, entrar (con contraseña si es privada) y salir |
| `room:config`, `room:kick` | Anfitrión: cambiar reglas, sacar jugadores |
| `player:ready {ready}` | Marcar como listo |
| `round:answers`, `round:stop` | Enviar respuestas (se guardan mientras escribes) y pulsar STOP |
| `review:apply {marks}`, `review:force` | Aplicar validación / forzar pendientes (anfitrión) |

El servidor responde con `state`, un estado personalizado por jugador: durante la ronda nunca se envían las respuestas de los demás.

## Ideas para después

- Empaquetar como APK con [Capacitor](https://capacitorjs.com/) o PWABuilder para publicarlo en Play Store.
- Guardar salas y ranking histórico en una base de datos (SQL Server, MongoDB o Redis) para que sobrevivan reinicios.
- Chat rápido de reacciones y sonidos al pulsar STOP.
