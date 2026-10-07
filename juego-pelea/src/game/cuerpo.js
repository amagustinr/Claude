// Dibujo del luchador: esqueleto con contorno estilo cómic, ropa según el traje,
// colores personalizados desde el panel y la foto de la cara.

import { SUELO } from './engine.js';

export const TRAJES = {
  karate: 'Karate (gi con cinturón)',
  boxeo: 'Boxeo (short y guantes)',
  callejero: 'Callejero (camiseta y jeans)',
  ninja: 'Ninja (traje completo y fajín)',
  luchador: 'Luchador (malla y botas)',
};
export const PEINADOS = { corto: 'Corto', largo: 'Largo', coleta: 'Coleta', punk: 'Punk', rapado: 'Rapado' };
export const TONOS_PIEL = ['#f5d0b0', '#e2ad80', '#c68642', '#8d5524', '#5c3a1e'];

const POR_DEFECTO = {
  traje: 'karate',
  color_ropa: '#f4f4f4',
  color_detalle: '#222222',
  color_piel: '#e2ad80',
  color_pelo: '#3b2416',
  peinado: 'corto',
};
const CONTORNO = '#160d1f';
const esColor = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const rad = (g) => (g * Math.PI) / 180;

/** Apariencia de un personaje con valores por defecto para los campos vacíos o inválidos. */
export function aparienciaDe(p = {}) {
  const a = { ...POR_DEFECTO };
  if (TRAJES[p.traje]) a.traje = p.traje;
  if (PEINADOS[p.peinado]) a.peinado = p.peinado;
  for (const k of ['color_ropa', 'color_detalle', 'color_piel', 'color_pelo']) if (esColor(p[k])) a[k] = p[k];
  return a;
}

/** Variante de colores para el jugador 2 cuando ambos eligen el mismo personaje. */
export function aparienciaAlterna(a) {
  return { ...a, color_ropa: a.color_detalle, color_detalle: a.color_ropa };
}

/** Oscurece (f < 1) o aclara (f > 1) un color #RRGGBB. */
export function tono(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.round(f <= 1 ? v * f : v + (255 - v) * (f - 1)),
  );
  return `rgb(${c.join(',')})`;
}

const punto = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/**
 * Dibuja un luchador completo.
 * @param f    estado del luchador (x, alt, lado, estado, ef)
 * @param pose ángulos de poses.js
 * @param st   resultado de derivarStats (incluye st.apariencia)
 * @param cara imagen de la cara o null
 */
export function dibujarLuchador(ctx, f, pose, st, cara, sueloY = SUELO, ap = st.apariencia) {
  const H = st.altoPx;
  const L = { muslo: 0.24 * H, pierna: 0.24 * H, torso: 0.3 * H, cuello: 0.035 * H, brazo: 0.17 * H, antebrazo: 0.16 * H, cabeza: 0.08 * H };
  const g = st.grosor;
  const w = 0.064 * H * g; // grosor base de brazos y piernas
  const borde = Math.max(2, H * 0.012); // grosor del contorno
  const fem = st.sexo === 'F';
  const hombros = 0.16 * H * g * (fem ? 0.86 : 1.0); // profundidad del pecho (el luchador se ve de perfil)
  const cadera = 0.145 * H * g * (fem ? 1.1 : 0.95);
  const T = ap.traje;

  const v = (ang, largo) => [Math.sin(rad(ang)) * largo, -Math.cos(rad(ang)) * largo];
  const sumar = (p, d) => [p[0] + d[0], p[1] + d[1]];
  const piernaD = [v(pose.md, L.muslo), v(pose.pd, L.pierna)];
  const piernaT = [v(pose.mt, L.muslo), v(pose.pt, L.pierna)];
  const altCadera = Math.max(-(piernaD[0][1] + piernaD[1][1]), -(piernaT[0][1] + piernaT[1][1])) + w * 0.35;

  ctx.save();
  ctx.translate(f.x, sueloY - f.alt);
  if (f.estado === 'ko') ctx.rotate(-f.lado * Math.min(1, f.ef / 18) * rad(84));
  ctx.scale(f.lado, -1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const cad = [0, altCadera];
  const tor = [Math.sin(rad(pose.torso)) * L.torso, Math.cos(rad(pose.torso)) * L.torso];
  const hom = sumar(cad, tor);
  const perp = [Math.cos(rad(pose.torso)), -Math.sin(rad(pose.torso))]; // hacia adelante, perpendicular al torso

  // Trazo con contorno: primero una línea oscura más gruesa, luego el color.
  const tramo = (pts, ancho, color, conContorno = true) => {
    if (conContorno) trazar(pts, ancho + borde * 2, CONTORNO);
    trazar(pts, ancho, color);
  };
  // Prenda: como tramo, pero el borde final queda recto (dobladillo) en vez de redondeado.
  const prenda = (pts, ancho, color) => {
    ctx.lineCap = 'butt';
    trazar(pts, ancho + borde * 2, CONTORNO);
    ctx.beginPath();
    ctx.arc(pts[0][0], pts[0][1], ancho / 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    trazar(pts, ancho, color);
    ctx.lineCap = 'round';
  };
  const trazar = (pts, ancho, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = ancho;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.stroke();
  };
  // Extremidad cónica: más gruesa en el origen (ra) que en el extremo (rb), con contorno.
  const capsula = (a, b, ra, rb, color) => {
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const camino = (ex) => {
      ctx.beginPath();
      ctx.arc(b[0], b[1], rb + ex, ang + Math.PI / 2, ang - Math.PI / 2, true);
      ctx.arc(a[0], a[1], ra + ex, ang - Math.PI / 2, ang + Math.PI / 2, true);
      ctx.closePath();
    };
    camino(borde);
    ctx.fillStyle = CONTORNO;
    ctx.fill();
    camino(0);
    ctx.fillStyle = color;
    ctx.fill();
  };
  const circulo = (c, r, color, conContorno = true) => {
    ctx.beginPath();
    ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    if (conContorno) {
      ctx.lineWidth = borde;
      ctx.strokeStyle = CONTORNO;
      ctx.stroke();
    }
  };
  const pie = (talon, color, k) => {
    // Pie/calzado: óvalo apuntando hacia adelante
    ctx.beginPath();
    ctx.ellipse(talon[0] + w * 0.45, talon[1] - w * 0.15, w * 0.95, w * 0.42, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = borde;
    ctx.strokeStyle = CONTORNO;
    ctx.stroke();
    if (T === 'callejero') {
      // suela y franja de zapatilla
      trazar([[talon[0] - w * 0.35, talon[1] - w * 0.45], [talon[0] + w * 1.3, talon[1] - w * 0.45]], borde * 1.2, tono('#ffffff', k));
      trazar([[talon[0] + w * 0.1, talon[1] - w * 0.05], [talon[0] + w * 0.8, talon[1] + w * 0.1]], borde * 1.4, tono(ap.color_detalle, k));
    }
  };

  // ---------------------------------------------------------- piernas
  const pierna = ([m, p], k) => {
    const rod = sumar(cad, m);
    const tob = sumar(rod, p);
    const piel = tono(ap.color_piel, k);
    const ropa = tono(ap.color_ropa, k);
    const det = tono(ap.color_detalle, k);
    // Base de piel (con contorno), muslo más grueso que la pierna
    capsula(rod, tob, w * 0.56, w * 0.42, piel);
    capsula(cad, rod, w * 0.74, w * 0.55, piel);
    switch (T) {
      case 'karate': // pantalón ancho hasta el tobillo
        prenda([cad, rod, punto(rod, tob, 0.88)], w * 1.6, ropa);
        trazar([punto(cad, rod, 0.2), punto(rod, tob, 0.85)], w * 0.12, tono(ap.color_ropa, k * 0.82));
        pie(tob, piel, k);
        break;
      case 'ninja': // pantalón ajustado y vendas en la pantorrilla
        prenda([cad, rod, punto(rod, tob, 0.95)], w * 1.52, ropa);
        for (const t of [0.55, 0.7, 0.85]) {
          const a = punto(rod, tob, t);
          trazar([[a[0] - w * 0.6, a[1] + w * 0.15], [a[0] + w * 0.6, a[1] - w * 0.15]], borde, tono(ap.color_ropa, k * 0.65));
        }
        pie(tob, tono(ap.color_ropa, k * 0.7), k);
        break;
      case 'callejero': // jeans
        prenda([cad, rod, punto(rod, tob, 0.92)], w * 1.58, det);
        pie(tob, tono('#f2f2f2', k), k);
        break;
      case 'boxeo': // short holgado y botas altas
        prenda([cad, punto(cad, rod, 0.58)], w * 1.75, ropa);
        prenda([tob, punto(rod, tob, 0.5)], w * 1.25, ropa);
        pie(tob, ropa, k);
        break;
      case 'luchador': // malla corta, rodilleras y botas
        prenda([cad, punto(cad, rod, 0.28)], w * 1.55, ropa);
        circulo(rod, w * 0.62, det);
        prenda([tob, punto(rod, tob, 0.45)], w * 1.25, det);
        pie(tob, det, k);
        break;
    }
  };

  // ---------------------------------------------------------- brazos
  const brazo = (b, a, k) => {
    const codo = sumar(hom, v(b, L.brazo));
    const mano = sumar(codo, v(a, L.antebrazo));
    const piel = tono(ap.color_piel, k);
    const ropa = tono(ap.color_ropa, k);
    const det = tono(ap.color_detalle, k);
    // Hombro natural: el brazo nace grueso (deltoides) y se afina hacia el codo y la muñeca.
    capsula(codo, mano, w * 0.48, w * 0.38, piel);
    capsula(hom, codo, w * 0.62, w * 0.46, piel);
    switch (T) {
      case 'karate': // manga ancha hasta media pierna del antebrazo
        prenda([hom, codo, punto(codo, mano, 0.55)], w * 1.4, ropa);
        break;
      case 'ninja':
        prenda([hom, codo, punto(codo, mano, 0.6)], w * 1.15, ropa);
        tramo([punto(codo, mano, 0.6), punto(codo, mano, 0.92)], w * 1.05, det);
        break;
      case 'callejero': // manga corta
        prenda([hom, punto(hom, codo, 0.5)], w * 1.35, ropa);
        break;
      case 'luchador': // muñequera
        tramo([punto(codo, mano, 0.65), punto(codo, mano, 0.9)], w * 1.05, det);
        break;
    }
    if (T === 'boxeo') {
      // Guante de boxeo
      circulo(mano, w * 0.95, det);
      circulo([mano[0] - w * 0.25, mano[1] + w * 0.25], w * 0.28, tono(ap.color_detalle, k * 1.35), false);
      tramo([punto(codo, mano, 0.62), punto(codo, mano, 0.78)], w * 1.05, tono('#ffffff', k));
    } else {
      circulo(mano, w * 0.62, piel);
    }
  };

  // ---------------------------------------------------------- torso
  const torso = () => {
    const piel = ap.color_piel;
    const ropa = ap.color_ropa;
    const det = ap.color_detalle;
    const esquina = (c, ancho, lado) => [c[0] + (perp[0] * ancho * lado) / 2, c[1] + (perp[1] * ancho * lado) / 2];
    // Silueta de perfil (u: 0 cadera → 1 hombros, v: + pecho / − espalda), suavizada con curvas.
    const C = cadera, D = hombros;
    const perfil = [
      [0, C], [0.35, C * (fem ? 0.78 : 0.9)], [0.6, D * (fem ? 0.9 : 0.86)], [0.78, D * (fem ? 1.04 : 0.96)],
      [0.94, D * 0.62], [1.05, D * 0.3], [1.05, -D * 0.32], [0.95, -D * 0.78], [0.78, -D * 0.92],
      [0.5, -C * 0.84], [0.25, -C * (fem ? 1.0 : 0.9)], [0, -C],
    ];
    const forma = perfil.map(([u, ancho]) => esquina(punto(cad, hom, u), ancho, 1));
    const poligono = (pts, color) => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.lineWidth = borde * 2;
      ctx.strokeStyle = CONTORNO;
      ctx.stroke();
      ctx.fill();
    };
    const desnudo = T === 'boxeo' || T === 'luchador';
    curvaCerrada(forma, desnudo ? piel : ropa);

    const sombraCuerpo = tono(desnudo ? piel : ropa, 0.8);
    switch (T) {
      case 'karate': {
        // Solapas cruzadas en V mostrando piel
        const cuello = punto(cad, hom, 0.97);
        const v1 = punto(cad, hom, 0.5);
        ctx.beginPath();
        ctx.moveTo(...esquina(cuello, hombros * 0.45, -1));
        ctx.lineTo(...esquina(cuello, hombros * 0.45, 1));
        ctx.lineTo(...esquina(v1, 0, 1));
        ctx.closePath();
        ctx.fillStyle = piel;
        ctx.fill();
        trazar([esquina(cuello, hombros * 0.5, 1), esquina(v1, cadera * 0.2, -1)], w * 0.32, tono(ap.color_ropa, 0.85));
        trazar([esquina(cuello, hombros * 0.5, -1), esquina(v1, 0, 1)], w * 0.22, tono(ap.color_ropa, 0.85));
        cinturon(true);
        break;
      }
      case 'ninja':
        trazar([esquina(punto(cad, hom, 0.95), hombros * 0.5, -1), esquina(punto(cad, hom, 0.55), cadera * 0.4, 1)], w * 0.25, sombraCuerpo);
        cinturon(true);
        break;
      case 'callejero': {
        const cuello = punto(cad, hom, 0.98);
        ctx.beginPath();
        ctx.arc(cuello[0], cuello[1], hombros * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = tono(ap.color_ropa, 0.75);
        ctx.fill();
        cinturon(false, '#3a2a1a');
        break;
      }
      case 'boxeo': {
        // Pectorales y abdominales
        const pecho = punto(cad, hom, 0.72);
        const p1 = esquina(pecho, hombros * 0.5, 1);
        const p2 = esquina(pecho, hombros * 0.5, -1);
        if (fem) {
          // Top deportivo
          poligono([esquina(punto(cad, hom, 0.55), cadera, -1), esquina(punto(cad, hom, 0.55), cadera, 1), esquina(punto(cad, hom, 0.92), hombros * 0.9, 1), esquina(punto(cad, hom, 0.92), hombros * 0.9, -1)], ropa);
        } else {
          trazar([p2, punto(p1, p2, 0.5), p1], borde, sombraCuerpo);
          for (const t of [0.35, 0.48]) trazar([esquina(punto(cad, hom, t), cadera * 0.4, -1), esquina(punto(cad, hom, t), cadera * 0.4, 1)], borde * 0.8, sombraCuerpo);
        }
        cinturon(false, det, 1.1);
        break;
      }
      case 'luchador': {
        // Malla con tirantes
        const pecho = punto(cad, hom, 0.68);
        poligono([esquina(cad, cadera * 1.02, -1), esquina(cad, cadera * 1.02, 1), esquina(pecho, cadera * 0.9, 1), esquina(hom, hombros * 0.3, 1), esquina(pecho, cadera * 0.5, 0), esquina(hom, hombros * 0.3, -1), esquina(pecho, cadera * 0.9, -1)], ropa);
        trazar([esquina(punto(cad, hom, 0.2), cadera, -1), esquina(punto(cad, hom, 0.6), cadera * 0.2, 0)], w * 0.3, det);
        break;
      }
    }

    // Curva cerrada suave que pasa por los puntos medios (sin esquinas).
    function curvaCerrada(pts, color) {
      const medio = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      ctx.beginPath();
      const inicio = medio(pts[pts.length - 1], pts[0]);
      ctx.moveTo(inicio[0], inicio[1]);
      pts.forEach((p, i) => {
        const m = medio(p, pts[(i + 1) % pts.length]);
        ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
      });
      ctx.closePath();
      ctx.lineWidth = borde * 2;
      ctx.strokeStyle = CONTORNO;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fill();
    }

    function cinturon(conCintas, color = det, grosor = 1) {
      const c = punto(cad, hom, 0.12);
      trazar([esquina(c, cadera * 1.02, -1), esquina(c, cadera * 1.02, 1)], w * 0.5 * grosor + borde, CONTORNO);
      trazar([esquina(c, cadera * 1.02, -1), esquina(c, cadera * 1.02, 1)], w * 0.5 * grosor, color);
      if (conCintas) {
        const nudo = esquina(c, cadera * 0.3, 1);
        tramo([nudo, [nudo[0] + w * 0.4, nudo[1] - w * 1.4]], w * 0.3, color);
        tramo([nudo, [nudo[0] - w * 0.2, nudo[1] - w * 1.5]], w * 0.3, color);
      }
    }
  };

  // ---------------------------------------------------------- orden de dibujo
  pierna(piernaT, 0.72);
  brazo(pose.bt, pose.at, 0.72);
  torso();
  pierna(piernaD, 1);

  // Cuello y cabeza
  const dirCabeza = [Math.sin(rad(pose.torso * 0.6)), Math.cos(rad(pose.torso * 0.6))];
  const centro = [hom[0] + dirCabeza[0] * (L.cuello + L.cabeza), hom[1] + dirCabeza[1] * (L.cuello + L.cabeza)];
  tramo([hom, centro], w * 0.95, tono(ap.color_piel, 0.85));
  peloDetras(ctx, centro, L.cabeza, ap, borde);
  ctx.save();
  ctx.translate(centro[0], centro[1]);
  ctx.scale(f.lado, -1); // deshace el espejo: la foto nunca sale invertida ni de cabeza
  cabeza(ctx, L.cabeza, cara, ap, { dolor: f.estado === 'golpeado' || f.estado === 'ko', borde, lado: f.lado });
  ctx.restore();

  brazo(pose.bd, pose.ad, 1);
  ctx.restore();
}

// Pelo largo y coleta van detrás de la cabeza (en el sistema con x hacia adelante e y hacia arriba).
function peloDetras(ctx, c, r, ap, borde) {
  if (ap.peinado !== 'largo' && ap.peinado !== 'coleta') return;
  ctx.save();
  ctx.fillStyle = ap.color_pelo;
  ctx.strokeStyle = CONTORNO;
  ctx.lineWidth = borde;
  ctx.beginPath();
  if (ap.peinado === 'largo') {
    ctx.ellipse(c[0] - r * 0.35, c[1] - r * 0.55, r * 1.08, r * 1.55, 0, 0, Math.PI * 2);
  } else {
    ctx.ellipse(c[0] - r * 1.15, c[1] - r * 0.55, r * 0.42, r * 0.95, rad(-25), 0, Math.PI * 2);
    ctx.moveTo(c[0] - r * 0.7, c[1] + r * 0.2);
    ctx.arc(c[0] - r * 0.85, c[1] + r * 0.1, r * 0.3, 0, Math.PI * 2);
  }
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

/** Cabeza redonda con la foto (o una cara dibujada) y el peinado. Coordenadas normales del canvas. */
export function cabeza(ctx, r, cara, ap = POR_DEFECTO, { dolor = false, borde = Math.max(2, r * 0.1), lado = 1 } = {}) {
  const conFoto = cara?.complete && cara.naturalWidth;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  if (conFoto) {
    ctx.save();
    ctx.clip();
    const l = Math.min(cara.naturalWidth, cara.naturalHeight);
    ctx.drawImage(cara, (cara.naturalWidth - l) / 2, (cara.naturalHeight - l) / 2, l, l, -r, -r, r * 2, r * 2);
    if (dolor) {
      ctx.fillStyle = '#ff000045';
      ctx.fillRect(-r, -r, r * 2, r * 2);
    }
    ctx.restore();
  } else {
    // Cara dibujada cuando el personaje no tiene foto; mira hacia su lado.
    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r);
    grad.addColorStop(0, tono(ap.color_piel, 1.12));
    grad.addColorStop(1, ap.color_piel);
    ctx.fillStyle = grad;
    ctx.fill();
    const dx = r * 0.18 * lado;
    ctx.fillStyle = '#1b1b1b';
    const ojo = dolor ? r * 0.06 : r * 0.16;
    ctx.fillRect(dx - r * 0.42, r * 0.0, r * 0.18, ojo);
    ctx.fillRect(dx + r * 0.22, r * 0.0, r * 0.18, ojo);
    ctx.fillStyle = '#00000060';
    ctx.fillRect(dx - r * 0.45, -r * 0.16, r * 0.25, r * 0.07); // cejas
    ctx.fillRect(dx + r * 0.2, -r * 0.16, r * 0.25, r * 0.07);
    ctx.fillStyle = '#7a2b2b';
    ctx.fillRect(dx - r * 0.2, r * 0.48, r * 0.4, dolor ? r * 0.16 : r * 0.07);
  }
  ctx.lineWidth = borde;
  ctx.strokeStyle = CONTORNO;
  ctx.stroke();

  // Pelo encima de la cabeza (si hay foto, solo los peinados que sobresalen)
  ctx.fillStyle = ap.color_pelo;
  ctx.strokeStyle = CONTORNO;
  ctx.lineWidth = borde * 0.8;
  if (ap.peinado === 'punk') {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (1.2 + i * 0.15);
      ctx.moveTo(Math.cos(a - 0.12) * r * 0.92, Math.sin(a - 0.12) * r * 0.92);
      ctx.lineTo(Math.cos(a) * r * 1.6, Math.sin(a) * r * 1.6);
      ctx.lineTo(Math.cos(a + 0.12) * r * 0.92, Math.sin(a + 0.12) * r * 0.92);
    }
    ctx.fill();
    ctx.stroke();
  } else if (!conFoto && ap.peinado !== 'rapado') {
    ctx.beginPath();
    ctx.arc(0, -r * 0.18, r * 1.04, Math.PI * 1.02, Math.PI * 1.98);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}
