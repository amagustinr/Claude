// Teclado → entrada del luchador.
// Movimiento: A/D o ←/→ · Saltar: W o ↑ · Agacharse: S o ↓ · Golpe: J o Z · Patada: K o X

const TECLAS = {
  KeyA: 'l', ArrowLeft: 'l',
  KeyD: 'r', ArrowRight: 'r',
  KeyW: 'u', ArrowUp: 'u',
  KeyS: 'd', ArrowDown: 'd',
  KeyJ: 'p', KeyZ: 'p',
  KeyK: 'k', KeyX: 'k',
};
const CONTADOR = { p: 'pS', k: 'kS', u: 'uS' };

export class Teclado {
  constructor({ alCambiar } = {}) {
    this.e = { l: false, r: false, u: false, d: false, p: false, k: false, pS: 0, kS: 0, uS: 0 };
    this.alCambiar = alCambiar;
    this.abajo = (ev) => this.#tecla(ev, true);
    this.arriba = (ev) => this.#tecla(ev, false);
    this.limpiar = () => {
      for (const k of ['l', 'r', 'u', 'd', 'p', 'k']) this.e[k] = false;
      this.alCambiar?.(this.leer());
    };
    window.addEventListener('keydown', this.abajo);
    window.addEventListener('keyup', this.arriba);
    window.addEventListener('blur', this.limpiar);
  }

  #tecla(ev, pulsada) {
    const accion = TECLAS[ev.code];
    if (!accion || ev.target?.tagName === 'INPUT') return;
    ev.preventDefault();
    this.pulsar(accion, pulsada, ev.repeat);
  }

  /** También lo usan los botones táctiles. */
  pulsar(accion, pulsada, repetida = false) {
    if (repetida || this.e[accion] === pulsada) return;
    this.e[accion] = pulsada;
    if (pulsada && CONTADOR[accion]) this.e[CONTADOR[accion]]++;
    this.alCambiar?.(this.leer());
  }

  leer() {
    return { ...this.e };
  }

  destruir() {
    window.removeEventListener('keydown', this.abajo);
    window.removeEventListener('keyup', this.arriba);
    window.removeEventListener('blur', this.limpiar);
  }
}

/**
 * Controles táctiles: cruceta circular a la izquierda (arriba salta, abajo se agacha,
 * izquierda/derecha mueven, el círculo central golpea) y botón de patada a la derecha.
 * Devuelve una función que quita los listeners.
 */
export function controlesTactiles(contenedor, teclado) {
  const fin = new AbortController();
  const opc = { signal: fin.signal };
  const cruceta = contenedor.querySelector('#cruceta');
  const marcar = (dir, activa) => cruceta.querySelector(`[data-dir="${dir}"]`)?.classList.toggle('activa', activa);
  const pulsar = (accion, activa) => {
    teclado.pulsar(accion, activa);
    marcar(accion, activa);
  };

  // modo: 'golpe' si el dedo empezó en el centro, 'mover' si empezó sobre una flecha.
  let modo = null;
  let dedo = null;
  const soltarTodo = () => {
    for (const d of ['u', 'd', 'l', 'r', 'p']) pulsar(d, false);
    modo = null;
    dedo = null;
  };
  const relativo = (ev) => {
    const r = cruceta.getBoundingClientRect();
    const radio = r.width / 2;
    return { dx: (ev.clientX - r.left - radio) / radio, dy: (ev.clientY - r.top - radio) / radio };
  };
  const mover = ({ dx, dy }) => {
    const dist = Math.hypot(dx, dy);
    const fuera = dist > 0.32; // en el centro no se mueve
    // Cada dirección cubre ±60°, así las diagonales (p. ej. saltar hacia adelante) activan dos flechas.
    pulsar('l', fuera && dx / dist < -0.5);
    pulsar('r', fuera && dx / dist > 0.5);
    pulsar('u', fuera && dy / dist < -0.5);
    pulsar('d', fuera && dy / dist > 0.5);
  };

  cruceta.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    if (dedo !== null) return;
    dedo = ev.pointerId;
    cruceta.setPointerCapture(ev.pointerId);
    const pos = relativo(ev);
    if (Math.hypot(pos.dx, pos.dy) < 0.32) {
      modo = 'golpe';
      pulsar('p', true);
    } else {
      modo = 'mover';
      mover(pos);
    }
  }, opc);
  cruceta.addEventListener('pointermove', (ev) => {
    if (ev.pointerId === dedo && modo === 'mover') mover(relativo(ev));
  }, opc);
  for (const tipo of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    cruceta.addEventListener(tipo, (ev) => { if (ev.pointerId === dedo) soltarTodo(); }, opc);
  }

  // Botones sueltos (patada)
  contenedor.querySelectorAll('[data-accion]').forEach((b) => {
    const accion = b.dataset.accion;
    const on = (ev) => { ev.preventDefault(); teclado.pulsar(accion, true); b.classList.add('activa'); };
    const off = (ev) => { ev.preventDefault(); teclado.pulsar(accion, false); b.classList.remove('activa'); };
    b.addEventListener('pointerdown', on, opc);
    for (const tipo of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(tipo, off, opc);
  });
  contenedor.addEventListener('contextmenu', (ev) => ev.preventDefault(), opc);

  return () => {
    soltarTodo();
    contenedor.querySelectorAll('.activa').forEach((e) => e.classList.remove('activa'));
    fin.abort();
  };
}
