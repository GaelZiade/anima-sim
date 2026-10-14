// Magia en combate (Core cap. 11, p.117-123): zeon, acumulación, lanzar y mantener conjuros, y lo que
// queda activo de ellos (escudo y armadura mágicos).

import type { Luchador } from './modelo';
import { conjurosDe, gradosPosibles, type BonoMagico, type Conjuro, type Grado } from './conjuros';
import type { Rng } from './rng';
import { tirarD100 } from './dados';
import { atributo, bonoCaracteristica } from './maniobras';
import { umbralPifia } from './reglas';

/** Un conjuro mantenido: lo paga cada asalto de la reserva, sin tocar el ACT (Core p.121). */
export interface Mantenido {
  conjuro: Conjuro;
  grado: number;
  /** A quiénes beneficia (conjuros de efecto sobre otros). */
  blancos?: Luchador[];
  /** Zona estática donde sigue actuando (Tormenta de Fuego) y a quiénes deja fuera (Control del Espacio). */
  zona?: { x: number; y: number; radio: number; desde: number; excluye: 'aliados' | 'nadie' };
}

/** Un conjuro de efecto activo sobre alguien: de quién viene y qué le da. */
export interface Bendicion {
  fuente: Luchador;
  conjuro: Conjuro;
  bono: BonoMagico;
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
      quitarEfecto(e, x, l);
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
  return !!e && e.acumulado >= g.zeon && gradosPosibles(c, l.ficha.inteligencia ?? 6, l.ficha.magia).includes(grado) && !estaMantenido(e, c);
}

function estaMantenido(e: EstadoMagia, c: Conjuro): boolean {
  return e.mantenidos.some((x) => x.conjuro === c);
}

/** Zeon extra por elegir los blancos de un conjuro de área con Control del Espacio (Arcana p.27). */
export const ZEON_CONTROL_DEL_ESPACIO = 10;

/**
 * Conjuro ofensivo de área que alcanza a todos los de adentro: con Control del Espacio puede elegir a
 * quiénes (Arcana p.27).
 */
export function deArea(c: Conjuro, g: Grado): boolean {
  return !!g.area || (!!g.radio && (c.efecto === 'flash' || c.efecto === 'consumirEsencia'));
}

/** Lo que cuesta lanzarlo: su zeon, más 10 si usa Control del Espacio para elegir blancos. */
export function costeConjuro(c: Conjuro, g: Grado, control = false): number {
  return g.zeon + (control ? ZEON_CONTROL_DEL_ESPACIO : 0);
}

/** Resistencia Mágica: la de la planilla, o la Presencia más el bono de Poder (Core p.12). */
export function rmDe(l: Luchador): number {
  return l.ficha.rm ?? presenciaDe(l) + bonoCaracteristica(atributo(l, 'POD'));
}

/** Presencia: la de la planilla, o la que deja la RF sin el bono de Constitución (Core p.12). */
export function presenciaDe(l: Luchador): number {
  return l.ficha.presencia ?? Math.max(0, l.ficha.rf - bonoCaracteristica(atributo(l, 'CON')));
}

/**
 * Lanza un conjuro: gasta su zeon de lo acumulado y deja activo lo que se mantiene (con sus
 * beneficiados o su zona).
 */
export function lanzar(l: Luchador, c: Conjuro, grado: number, extra: Omit<Mantenido, 'conjuro' | 'grado'> = {}, control = false): Grado {
  const e = l.magia!;
  const g = c.grados[grado];
  const coste = costeConjuro(c, g, control);
  e.acumulado -= coste;
  e.reserva -= coste;
  e.lanzo = true;
  if (g.resistencia) e.escudo = { conjuro: c, grado, resistencia: g.resistencia };
  if (g.taEnergia !== undefined) e.armadura = { energia: g.taEnergia, resto: g.taResto ?? 0 };
  if (g.bono) for (const b of extra.blancos ?? []) bendecir(b, l, c, g.bono);
  if (g.mantenimiento) e.mantenidos.push({ conjuro: c, grado, ...extra });
  return g;
}

/** Deja de mantener un conjuro (al soltarlo o al no poder pagarlo). */
function quitarEfecto(e: EstadoMagia, x: Mantenido, l?: Luchador) {
  if (e.escudo?.conjuro === x.conjuro) e.escudo = null;
  if (x.conjuro.grados[x.grado].taEnergia !== undefined) e.armadura = null;
  if (l) for (const b of x.blancos ?? []) quitarBendicion(b, l, x.conjuro);
}

/** Termina todos sus conjuros mantenidos (al morir: ya no hay esencia que los sostenga). */
export function terminarMantenidos(l: Luchador) {
  const e = l.magia;
  if (!e) return;
  for (const x of e.mantenidos) quitarEfecto(e, x, l);
  e.mantenidos = [];
}

/** Deja de mantener un conjuro en particular. */
export function dejarDeMantener(l: Luchador, x: Mantenido) {
  const e = l.magia!;
  quitarEfecto(e, x, l);
  e.mantenidos = e.mantenidos.filter((m) => m !== x);
}

/** Le pone el beneficio de un conjuro; el mismo conjuro de la misma fuente no se acumula. */
export function bendecir(l: Luchador, fuente: Luchador, c: Conjuro, bono: BonoMagico) {
  l.bendiciones = l.bendiciones.filter((b) => !(b.fuente === fuente && b.conjuro === c));
  l.bendiciones.push({ fuente, conjuro: c, bono });
  sumarBendiciones(l);
}

export function quitarBendicion(l: Luchador, fuente: Luchador, c: Conjuro) {
  const antes = l.bendiciones.length;
  l.bendiciones = l.bendiciones.filter((b) => !(b.fuente === fuente && b.conjuro === c));
  if (l.bendiciones.length !== antes) sumarBendiciones(l);
}

/**
 * Suma de los beneficios. Distintos conjuros se suman; el mismo conjuro de dos fuentes no se
 * superpone: vale el mayor (interpretación).
 */
function sumarBendiciones(l: Luchador) {
  if (!l.bendiciones.length) {
    l.bono = null;
    return;
  }
  const porConjuro = new Map<Conjuro, BonoMagico>();
  for (const b of l.bendiciones) {
    const previo = porConjuro.get(b.conjuro);
    const peso = (x: BonoMagico) => (x.dano ?? 0) + (x.danoArma ?? 0) + (x.ta ?? 0) + (x.turno ?? 0) + (x.toda ?? 0) + (x.resistencias ?? 0);
    if (!previo || peso(b.bono) > peso(previo)) porConjuro.set(b.conjuro, b.bono);
  }
  const t: Required<Omit<BonoMagico, 'tipoArma'>> & Pick<BonoMagico, 'tipoArma'> = {
    ataque: 0, toda: 0, dano: 0, turno: 0, ta: 0, resistencias: 0, ira: false, cuerpoFuego: false, resCalor: 0, danoArma: 0,
  };
  for (const b of porConjuro.values()) {
    t.ataque += b.ataque ?? 0;
    t.toda += b.toda ?? 0;
    t.dano += b.dano ?? 0;
    t.turno += b.turno ?? 0;
    t.ta += b.ta ?? 0;
    t.resistencias += b.resistencias ?? 0;
    t.ira ||= !!b.ira;
    t.cuerpoFuego ||= !!b.cuerpoFuego;
    t.resCalor = Math.max(t.resCalor, b.resCalor ?? 0);
    t.danoArma += b.danoArma ?? 0;
    if (b.tipoArma) t.tipoArma = b.tipoArma;
  }
  l.bono = t;
}

/** El escudo se rompe: deja de mantenerse. */
export function romperEscudo(l: Luchador) {
  const e = l.magia;
  if (!e?.escudo) return;
  const c = e.escudo.conjuro;
  e.escudo = null;
  e.mantenidos = e.mantenidos.filter((x) => x.conjuro !== c);
}

/** El conjuro con ese efecto que tiene activo (mantenido), si hay. */
export function mantenidoCon(l: Luchador, c: Conjuro): Mantenido | undefined {
  return l.magia?.mantenidos.find((x) => x.conjuro === c);
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

// --------------------------------------------------------------------------- Tabla 76: En llamas (Core p.236)

const ESTADOS_LLAMAS: [number, string][] = [[300, 'calcinado'], [240, 'en llamas'], [180, 'ardiendo'], [100, 'prendido']];

/** Estado en la Tabla 76: En llamas (Core p.236), o '' si no arde. */
export function estadoLlamas(nivel: number): string {
  return ESTADOS_LLAMAS.find(([n]) => nivel >= n)?.[1] ?? '';
}

/** PV que pierde por asalto en ese estado (Core p.237): la armadura contra calor resta 2 por TA, salvo calcinado. */
export function danoLlamas(l: Luchador): number {
  const acumula = !!l.ficha.acumulacion;
  const n = l.llamas;
  if (n >= 300) return acumula ? 250 : 50;
  const base = n >= 240 ? 25 : n >= 180 ? 10 : 0;
  if (!base) return 0;
  const ta = l.ficha.ta.CAL ?? 0;
  return Math.max(0, acumula ? 5 * base - 5 * ta : base - 2 * ta);
}
