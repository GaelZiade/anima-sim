// Magia en combate (Core cap. 11, p.117-123): zeon, acumulación, lanzar y mantener conjuros, y lo que
// queda activo de ellos (escudo y armadura mágicos).

import type { Luchador } from './modelo';
import { conjurosDe, type Conjuro, type Grado } from './conjuros';
import type { Rng } from './rng';
import { tirarD100 } from './dados';
import { umbralPifia } from './reglas';

/** Un conjuro mantenido: lo paga cada asalto de la reserva, sin tocar el ACT (Core p.121). */
export interface Mantenido {
  conjuro: Conjuro;
  grado: number;
}

export interface EstadoMagia {
  /** Zeon que le queda, con lo acumulado incluido. */
  reserva: number;
  /** Zeon acumulado para lanzar (Core p.117). */
  acumulado: number;
  /** Lo que acumuló este asalto (si hace otra cosa, queda la mitad). */
  ganado: number;
  acumulando: boolean;
  /** Lanzó al menos un conjuro este asalto: al terminarlo, lo que sobra vuelve a la reserva. */
  lanzo: boolean;
  conjuros: Conjuro[];
  mantenidos: Mantenido[];
  /** Escudo mágico activo: resistencia que le queda. */
  escudo: { conjuro: Conjuro; grado: number; resistencia: number } | null;
  /** Armadura mágica activa: TA contra energía y contra el resto (una capa más, sin penalizar el turno). */
  armadura: { energia: number; resto: number } | null;
  /** Hizo este asalto algo que no es lanzar conjuros (atacar, defenderse sin escudo, moverse): ACT a la mitad. */
  otraAccion: boolean;
}

export function crearEstadoMagia(l: Luchador): EstadoMagia | null {
  const m = l.ficha.magia;
  if (!m || m.zeon <= 0) return null;
  const conjuros = conjurosDe(m);
  if (!conjuros.length) return null;
  return {
    reserva: m.zeon, acumulado: 0, ganado: 0, acumulando: false, lanzo: false, conjuros, mantenidos: [],
    escudo: null, armadura: null, otraAccion: false,
  };
}

/** Lo que pierde al soltar lo acumulado sin usarlo: 10 de zeon (Core p.117). */
const PERDIDA_AL_SOLTAR = 10;

function soltar(e: EstadoMagia) {
  if (e.acumulado <= 0) return;
  e.reserva = Math.max(0, e.reserva - Math.min(PERDIDA_AL_SOLTAR, e.acumulado));
  e.acumulado = 0;
}

/**
 * Comienzo del asalto: paga los mantenidos (de la reserva, sin usar lo acumulado; el que no pueda
 * pagar se cae) y, si acumula, suma su ACT sin pasar la reserva. Si deja de acumular, lo acumulado
 * vuelve a la reserva menos 10 (Core p.117).
 */
export function empezarAsaltoMagia(l: Luchador, acumula: boolean) {
  const e = l.magia;
  if (!e) return;
  e.lanzo = false;
  e.ganado = 0;
  e.otraAccion = false;
  e.mantenidos = e.mantenidos.filter((x) => {
    const coste = x.conjuro.grados[x.grado].mantenimiento ?? 0;
    if (e.reserva - e.acumulado < coste) {
      quitarEfecto(e, x);
      return false;
    }
    e.reserva -= coste;
    return true;
  });
  e.acumulando = acumula;
  if (!acumula) {
    soltar(e);
    return;
  }
  e.ganado = Math.max(0, Math.min(l.ficha.magia!.act, e.reserva - e.acumulado));
  e.acumulado += e.ganado;
}

/**
 * Fin del asalto. Si lanzó algo, lo que le sobra vuelve a la reserva menos 10. Si no, y además de
 * acumular hizo otra cosa que no sea lanzar, este asalto acumuló la mitad (Core p.117).
 */
export function terminarAsaltoMagia(l: Luchador) {
  const e = l.magia;
  if (!e) return;
  if (e.lanzo) {
    soltar(e);
    return;
  }
  if ((e.otraAccion || l.movioActivo) && e.ganado) e.acumulado -= Math.floor(e.ganado / 2);
}

/** Puede lanzarlo en ese grado: le alcanza lo acumulado y su Inteligencia (Core p.121). */
export function puedeLanzar(l: Luchador, c: Conjuro, grado: number): boolean {
  const e = l.magia;
  const g = c.grados[grado];
  return !!e && e.acumulado >= g.zeon && (l.ficha.inteligencia ?? 6) >= g.int && !estaMantenido(e, c);
}

function estaMantenido(e: EstadoMagia, c: Conjuro): boolean {
  return e.mantenidos.some((x) => x.conjuro === c);
}

/** Lanza un conjuro: gasta su zeon de lo acumulado y deja activo lo que se mantiene. */
export function lanzar(l: Luchador, c: Conjuro, grado: number): Grado {
  const e = l.magia!;
  const g = c.grados[grado];
  e.acumulado -= g.zeon;
  e.reserva -= g.zeon;
  e.lanzo = true;
  if (g.resistencia) e.escudo = { conjuro: c, grado, resistencia: g.resistencia };
  if (g.taEnergia !== undefined) e.armadura = { energia: g.taEnergia, resto: g.taResto ?? 0 };
  if (g.mantenimiento) e.mantenidos.push({ conjuro: c, grado });
  return g;
}

/** Deja de mantener un conjuro (al soltarlo o al no poder pagarlo). */
function quitarEfecto(e: EstadoMagia, x: Mantenido) {
  if (e.escudo?.conjuro === x.conjuro) e.escudo = null;
  if (x.conjuro.grados[x.grado].taEnergia !== undefined) e.armadura = null;
}

/** El escudo se rompe: deja de mantenerse. */
export function romperEscudo(l: Luchador) {
  const e = l.magia;
  if (!e?.escudo) return;
  const c = e.escudo.conjuro;
  e.escudo = null;
  e.mantenidos = e.mantenidos.filter((x) => x.conjuro !== c);
}

/** TA de la armadura mágica contra ese tipo de ataque (0 sin armadura). */
export function taMagica(l: Luchador, tipo: string): number {
  const a = l.magia?.armadura;
  return a ? (tipo === 'ENE' ? a.energia : a.resto) : 0;
}

/**
 * Recibir daño mientras acumula (Core p.118): Resistir el dolor contra el doble del daño para
 * conservar lo acumulado; si ni siquiera llega al daño, lo pierde; si no, vuelve a la reserva.
 * Devuelve qué pasó, para narrarlo.
 */
export function danoAlAcumular(l: Luchador, dano: number, rng: Rng): { tirada: number; resultado: 'conserva' | 'vuelve' | 'pierde' } | null {
  const e = l.magia;
  if (!e || e.acumulado <= 0 || dano <= 0 || l.ficha.acumulacion) return null;
  const habilidad = l.ficha.resistirDolor ?? 0;
  const t = tirarD100(rng, umbralPifia(habilidad));
  const tirada = habilidad + t.valor;
  if (!t.pifia && tirada >= 2 * dano) return { tirada, resultado: 'conserva' };
  if (!t.pifia && tirada >= dano) {
    // Vuelve a la reserva, con los 10 que se pierden al interrumpir la acumulación (Core p.117).
    soltar(e);
    return { tirada, resultado: 'vuelve' };
  }
  e.reserva -= e.acumulado;
  e.acumulado = 0;
  return { tirada, resultado: 'pierde' };
}

/** Alcance de los conjuros según su Proyección Mágica (Recuadro X, Core p.118). */
export function alcanceMagico(proyeccion: number): number {
  return proyeccion >= 180 ? 500 : proyeccion >= 140 ? 250 : proyeccion >= 120 ? 100 : proyeccion >= 80 ? 25 : proyeccion >= 40 ? 5 : 1;
}
