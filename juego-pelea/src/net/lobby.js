// Sala de espera en línea con Supabase Realtime:
//  - Presence: quién está conectado y si está libre o peleando.
//  - Broadcast: retos entre jugadores (desafiar / aceptar / rechazar).

import { supabase } from '../supabase.js';

export class Lobby {
  constructor({ miId, nombre, alCambiarJugadores, alReto, alRespuesta, alCancelarReto }) {
    this.miId = miId;
    this.nombre = nombre;
    this.estado = 'libre';
    this.h = { alCambiarJugadores, alReto, alRespuesta, alCancelarReto };
    this.canal = null;
  }

  entrar() {
    return new Promise((resolve, reject) => {
      this.canal = supabase.channel('lobby', {
        config: { presence: { key: this.miId }, broadcast: { self: false } },
      });
      this.canal
        .on('presence', { event: 'sync' }, () => this.h.alCambiarJugadores?.(this.jugadores()))
        .on('broadcast', { event: 'reto' }, ({ payload }) => {
          if (payload.para === this.miId) this.h.alReto?.(payload);
        })
        .on('broadcast', { event: 'respuesta' }, ({ payload }) => {
          if (payload.para === this.miId) this.h.alRespuesta?.(payload);
        })
        .on('broadcast', { event: 'cancelar' }, ({ payload }) => {
          if (payload.para === this.miId) this.h.alCancelarReto?.(payload);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await this.#publicar();
            resolve();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            reject(new Error(`No se pudo conectar a la sala de espera (${status}).`));
          }
        });
    });
  }

  /** Jugadores conectados (sin incluirme). */
  jugadores() {
    const estado = this.canal?.presenceState() ?? {};
    return Object.entries(estado)
      .filter(([id]) => id !== this.miId)
      .map(([id, metas]) => ({ id, ...metas[metas.length - 1] }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  #publicar() {
    return this.canal.track({ nombre: this.nombre, estado: this.estado });
  }

  async marcarEstado(estado) {
    this.estado = estado;
    if (this.canal) await this.#publicar();
  }

  retar(paraId) {
    const sala = crypto.randomUUID();
    this.#enviar('reto', { de: this.miId, nombre: this.nombre, para: paraId, sala });
    return sala;
  }

  cancelarReto(paraId, sala) {
    this.#enviar('cancelar', { de: this.miId, para: paraId, sala });
  }

  responder(reto, acepta) {
    this.#enviar('respuesta', { de: this.miId, nombre: this.nombre, para: reto.de, sala: reto.sala, acepta });
  }

  #enviar(event, payload) {
    this.canal?.send({ type: 'broadcast', event, payload });
  }

  async salir() {
    if (this.canal) await supabase.removeChannel(this.canal);
    this.canal = null;
  }
}
