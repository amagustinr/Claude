// Rival controlado por la computadora para el modo práctica. Sencillo a propósito.

export class Cpu {
  constructor(indice) {
    this.i = indice;
    this.e = { l: false, r: false, u: false, d: false, p: false, k: false, pS: 0, kS: 0, uS: 0 };
    this.pensar = 0;
  }

  decidir(pelea) {
    const s = pelea.s;
    const yo = s.p[this.i];
    const rival = s.p[1 - this.i];
    const e = this.e;
    if (--this.pensar > 0) return { ...e };
    this.pensar = 6 + Math.floor(Math.random() * 10);

    const dist = Math.abs(rival.x - yo.x);
    const haciaRival = rival.x > yo.x ? 'r' : 'l';
    const alejarse = haciaRival === 'r' ? 'l' : 'r';
    e.l = e.r = e.d = false;

    const rivalAtaca = rival.estado === 'ataque';
    const azar = Math.random();
    if (rivalAtaca && dist < 180 && azar < 0.5) {
      e[alejarse] = true; // bloquear
      e.d = rival.ataque?.tipo === 'patada-agachado';
    } else if (dist > 150) {
      e[haciaRival] = true;
      if (azar < 0.04) e.uS++;
    } else if (azar < 0.35) {
      e.pS++;
      e.d = Math.random() < 0.3;
    } else if (azar < 0.6) {
      e.kS++;
      e.d = Math.random() < 0.25;
    } else if (azar < 0.7) {
      e[alejarse] = true;
    } else if (azar < 0.75) {
      e.uS++;
      e[haciaRival] = true;
    }
    return { ...e };
  }
}
