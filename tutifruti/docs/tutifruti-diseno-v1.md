# Tutifruti Online — v1 (23-sep-2026)

## Decisiones
- Plataforma: PWA (HTML/CSS/JS sin frameworks) + servidor Node.js/Express/Socket.io, estado en memoria. Despliegue sugerido: Render (render.yaml incluido), alternativa Railway/Fly (Dockerfile) o IIS + ARR como reverse proxy.
- Categorías estándar configurables por el anfitrión (3–12): Nombre, Apellido, País o ciudad, Animal, Fruta o verdura, Color, Cosa, Marca. Tiempo opcional (0/60/90/120/180 s). Letras difíciles (K Ñ Q W X Y Z) opcionales.
- Puntaje: 20 única válida en la categoría, 10 no repetida, 5 repetida, 0 vacía/inválida. Comparación sin mayúsculas/tildes, respeta Ñ.
- Validación cruzada rotativa: orden barajado, cada jugador revisa al siguiente; vacías siempre inválidas; "no empieza con la letra" viene marcada inválida pero editable; el anfitrión puede forzar revisiones pendientes.

## Flujo
Crear/buscar sala (pública o privada con contraseña, enlace ?sala=CODIGO) → sala de espera con "Marcar como listo" (mín. 2, arranca sola) → ronda con STOP (solo con todo completo) → validación + "Aplicar" → resumen → volver a la sala (pestaña Resumen con acumulado e historial).

## Estructura
server.js (sockets y fases), lib/game.js (lógica pura y puntaje), public/ (PWA), test/simulacion.js (prueba E2E con 3 jugadores, `npm test`).

## Pendientes / ideas
- No se tuvo acceso al Excel de tutifruti de la conversación anterior; si se adjunta, ajustar categorías/puntaje.
- APK con Capacitor/PWABuilder; persistencia en BD para sobrevivir reinicios; reacciones/sonidos.
