// Canal privado de dos jugadores para un combate.
// Eventos (broadcast):
//   sel     { personajeId }          personaje elegido (aún sin confirmar)
//   listo   { listo, personajeId }   confirmación del personaje
//   inicio  { p1, p2 }               el anfitrión arranca la pelea (ids de personaje)
//   in      { entrada }              invitado → anfitrión: teclas pulsadas
//   st      { s }                    anfitrión → invitado: estado de la pelea
//   volver  {}                       volver a la selección para la revancha

import { supabase } from '../supabase.js';

const GRACIA_DESCONEXION_MS = 4000;

export class Sala {
  constructor({ salaId, miId, nombre, soyAnfitrion, handlers }) {
    this.salaId = salaId;
    this.miId = miId;
    this.nombre = nombre;
    this.soyAnfitrion = soyAnfitrion;
    this.h = handlers;
    this.rivalVisto = false;
    this.rivalNombre = null;
    this.temporizadorAusencia = null;
    this.canal = null;
  }

  entrar() {
    return new Promise((resolve, reject) => {
      this.canal = supabase.channel(`sala:${this.salaId}`, {
        config: { presence: { key: this.miId }, broadcast: { self: false } },
      });
      for (const evento of ['sel', 'listo', 'inicio', 'in', 'st', 'volver']) {
        this.canal.on('broadcast', { event: evento }, ({ payload }) => this.h[evento]?.(payload));
      }
      this.canal.on('presence', { event: 'sync' }, () => this.#revisarRival());
      this.canal.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await this.canal.track({ nombre: this.nombre, anfitrion: this.soyAnfitrion });
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          reject(new Error(`No se pudo conectar a la sala (${status}).`));
        }
      });
    });
  }

  #revisarRival() {
    const estado = this.canal.presenceState();
    const rival = Object.entries(estado).find(([id]) => id !== this.miId);
    if (rival) {
      clearTimeout(this.temporizadorAusencia);
      this.temporizadorAusencia = null;
      if (!this.rivalVisto) {
        this.rivalVisto = true;
        this.rivalNombre = rival[1].at(-1).nombre;
        this.h.rivalConectado?.(this.rivalNombre);
      }
    } else if (this.rivalVisto && !this.temporizadorAusencia) {
      // Pequeña espera: Presence puede parpadear en conexiones inestables.
      this.temporizadorAusencia = setTimeout(() => this.h.rivalSeFue?.(), GRACIA_DESCONEXION_MS);
    }
  }

  enviar(event, payload = {}) {
    this.canal?.send({ type: 'broadcast', event, payload });
  }

  async salir() {
    clearTimeout(this.temporizadorAusencia);
    if (this.canal) await supabase.removeChannel(this.canal);
    this.canal = null;
  }
}
