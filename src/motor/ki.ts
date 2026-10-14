// Dominios del Ki en combate: acumulación, gasto y efectos de las técnicas (Core p.102-106,
// Dominus cap. 5). Las Habilidades del Ki con bonos fijos (Velocidad y Daño incrementado, Extensión
// del aura, Armadura de energía) ya vienen sumadas en los valores de la planilla.

import { CARACTERISTICAS_KI, type CaracteristicaKi, type EfectoTecnica, type Ficha, type Luchador, type Tecnica } from './modelo';
import { normalizarRasgo, tiene } from './rasgos';
import { bonoCaracteristica } from './maniobras';

/** Lo que las técnicas le suman a una acción o a todo el asalto. Los efectos iguales no se suman. */
export interface ModKi {
  ataque: number;
  /** Sólo en un contraataque (Habilidad de contraataque). */
  contraataque: number;
  parada: number;
  esquiva: number;
  /** Habilidad de parada o esquiva limitada: no permite contraatacar. */
  sinContra: boolean;
  /** Ataque o Defensa Predeterminada: valor final fijo, sin dados (0 si no hay). */
  ataqueFijo: number;
  defensaFija: number;
  dano: number;
  /** Multiplicador al Daño: se aplica antes de sumar cualquier otro bono (Dominus p.55). */
  multDano: number;
  /** Sustitución de Daño: daño base del ataque (0 si no hay). */
  danoFijo: number;
  reduccionTA: number;
  sinArmadura: boolean;
  /** Maniobras de combate y apuntar: cuánto reduce el penalizador de la maniobra. */
  precision: number;
  /** Ataque con área: radio en metros (0 si no hay) y si elige a quién alcanza. */
  area: number;
  eleccionBlanco: boolean;
  ataquesAdicionales: number;
  defensasAdicionales: number;
  turno: number;
  /** Armadura: TA contra todo, como capa adicional (Dominus p.60). */
  ta: number;
  rf: number;
  danaEnergia: boolean;
}

export const SIN_KI: Readonly<ModKi> = Object.freeze({
  ataque: 0, contraataque: 0, parada: 0, esquiva: 0, sinContra: false, ataqueFijo: 0, defensaFija: 0,
  dano: 0, multDano: 1, danoFijo: 0, reduccionTA: 0, sinArmadura: false, precision: 0, area: 0,
  eleccionBlanco: false, ataquesAdicionales: 0, defensasAdicionales: 0, turno: 0, ta: 0, rf: 0,
  danaEnergia: false,
});

/** Dos conjuntos de efectos sobre una misma acción: de cada efecto vale el mayor (Core p.106). */
export function combinar(a: Readonly<ModKi>, b: Readonly<ModKi>): ModKi {
  return {
    ataque: Math.max(a.ataque, b.ataque), contraataque: Math.max(a.contraataque, b.contraataque),
    parada: Math.max(a.parada, b.parada), esquiva: Math.max(a.esquiva, b.esquiva),
    sinContra: a.sinContra || b.sinContra,
    ataqueFijo: Math.max(a.ataqueFijo, b.ataqueFijo), defensaFija: Math.max(a.defensaFija, b.defensaFija),
    dano: Math.max(a.dano, b.dano), multDano: Math.max(a.multDano, b.multDano), danoFijo: Math.max(a.danoFijo, b.danoFijo),
    reduccionTA: Math.max(a.reduccionTA, b.reduccionTA), sinArmadura: a.sinArmadura || b.sinArmadura,
    precision: Math.max(a.precision, b.precision), area: Math.max(a.area, b.area),
    eleccionBlanco: a.eleccionBlanco || b.eleccionBlanco,
    ataquesAdicionales: Math.max(a.ataquesAdicionales, b.ataquesAdicionales),
    defensasAdicionales: Math.max(a.defensasAdicionales, b.defensasAdicionales),
    turno: Math.max(a.turno, b.turno), ta: Math.max(a.ta, b.ta), rf: Math.max(a.rf, b.rf),
    danaEnergia: a.danaEnergia || b.danaEnergia,
  };
}

// --------------------------------------------------------------------------- catálogo de efectos

/**
 * Tipo y clase de cada efecto del Dominus (cap. 5) que importa en el cuerpo a cuerpo. Acción: vale
 * para la acción en la que se usa la técnica; Asalto: para todo el asalto. La clase dice a qué acción
 * va atada la técnica: un ataque, un contraataque, una defensa, o cualquiera (Variable).
 */
type Clase = 'ataque' | 'contra' | 'defensa' | 'variable';
interface DefEfecto {
  tipo: 'accion' | 'asalto';
  clase: Clase;
  aplicar: (m: ModKi, valor: number, opciones: string[]) => void;
}

const SUMAR = (campo: keyof ModKi) => (m: ModKi, v: number) => { (m[campo] as number) = Math.max(m[campo] as number, v); };

const CATALOGO: Record<string, DefEfecto> = {
  'habilidad de ataque': { tipo: 'accion', clase: 'ataque', aplicar: SUMAR('ataque') },
  'habilidad de ataque completa': { tipo: 'asalto', clase: 'ataque', aplicar: SUMAR('ataque') },
  'ataque predeterminado': { tipo: 'accion', clase: 'ataque', aplicar: SUMAR('ataqueFijo') },
  'habilidad de contraataque': { tipo: 'accion', clase: 'contra', aplicar: SUMAR('contraataque') },
  'maniobras de combate y apuntar': { tipo: 'accion', clase: 'ataque', aplicar: SUMAR('precision') },
  'maniobras de combate y apuntar reales': { tipo: 'asalto', clase: 'ataque', aplicar: SUMAR('precision') },
  'habilidad de parada': { tipo: 'accion', clase: 'defensa', aplicar: SUMAR('parada') },
  'habilidad de parada completa': { tipo: 'asalto', clase: 'defensa', aplicar: SUMAR('parada') },
  'habilidad de parada limitada': { tipo: 'accion', clase: 'defensa', aplicar: (m, v) => { m.parada = Math.max(m.parada, v); m.sinContra = true; } },
  'habilidad de esquiva': { tipo: 'accion', clase: 'defensa', aplicar: SUMAR('esquiva') },
  'habilidad de esquiva completa': { tipo: 'asalto', clase: 'defensa', aplicar: SUMAR('esquiva') },
  'habilidad de esquiva limitada': { tipo: 'accion', clase: 'defensa', aplicar: (m, v) => { m.esquiva = Math.max(m.esquiva, v); m.sinContra = true; } },
  'defensa predeterminada': { tipo: 'accion', clase: 'defensa', aplicar: SUMAR('defensaFija') },
  'aumento de dano': { tipo: 'accion', clase: 'ataque', aplicar: SUMAR('dano') },
  'aumento de dano real': { tipo: 'asalto', clase: 'ataque', aplicar: SUMAR('dano') },
  'multiplicador al dano': { tipo: 'accion', clase: 'ataque', aplicar: SUMAR('multDano') },
  'multiplicador al dano real': { tipo: 'asalto', clase: 'ataque', aplicar: SUMAR('multDano') },
  'sustitucion de dano': { tipo: 'accion', clase: 'ataque', aplicar: SUMAR('danoFijo') },
  'sustitucion de dano real': { tipo: 'asalto', clase: 'ataque', aplicar: SUMAR('danoFijo') },
  'ataque adicional': { tipo: 'accion', clase: 'ataque', aplicar: SUMAR('ataquesAdicionales') },
  'defensa adicional': { tipo: 'accion', clase: 'defensa', aplicar: SUMAR('defensasAdicionales') },
  'incrementar turno': { tipo: 'asalto', clase: 'variable', aplicar: SUMAR('turno') },
  'ataque con area': { tipo: 'accion', clase: 'ataque', aplicar: (m, v, o) => { m.area = Math.max(m.area, v); if (o.some((x) => /eleccion/.test(normalizarRasgo(x)))) m.eleccionBlanco = true; } },
  'ataque con area real': { tipo: 'asalto', clase: 'ataque', aplicar: (m, v, o) => { m.area = Math.max(m.area, v); if (o.some((x) => /eleccion/.test(normalizarRasgo(x)))) m.eleccionBlanco = true; } },
  'destruir armadura': { tipo: 'accion', clase: 'ataque', aplicar: (m, v, o) => { if (o.some((x) => /sin armadura/.test(normalizarRasgo(x)))) m.sinArmadura = true; else m.reduccionTA = Math.max(m.reduccionTA, v); } },
  'armadura': { tipo: 'asalto', clase: 'defensa', aplicar: SUMAR('ta') },
  'incremento de resistencia fisica': { tipo: 'asalto', clase: 'variable', aplicar: SUMAR('rf') },
  'ataque capaz de danar energia': { tipo: 'accion', clase: 'ataque', aplicar: (m) => { m.danaEnergia = true; } },
  'danar energia': { tipo: 'accion', clase: 'ataque', aplicar: (m) => { m.danaEnergia = true; } },
  // Sin efecto en el cuerpo a cuerpo que se simula (alcance), pero atan la técnica a un ataque.
  'ataque a distancia': { tipo: 'accion', clase: 'ataque', aplicar: () => {} },
  'ataque a distancia real': { tipo: 'asalto', clase: 'ataque', aplicar: () => {} },
};

/** "+50" → 50, "x3" → 3, "-4 TA" → 4, "TA 4" → 4, "5 metros de radio" → 5, "Absurdo (180)" → 180. */
function valorDe(opciones: string[]): number {
  for (const o of opciones) {
    const entre = /\((\d+)\)/.exec(o);
    if (entre) return Number(entre[1]);
    const n = /(\d+)/.exec(o);
    if (n) return Number(n[1]);
  }
  return 0;
}

export interface EfectosTecnica {
  /** Efectos de tipo Acción: valen para la acción en la que se ejecuta. */
  accion: ModKi;
  /** Efectos de tipo Asalto: valen para todo el asalto en que se ejecuta. */
  asalto: ModKi;
  /** A qué acción va atada: un ataque, un contraataque, una defensa o ninguna en particular. */
  clase: Clase;
  /** Efectos que el simulador no conoce (se registran y se ignoran). */
  desconocidos: string[];
}

const efectosCache = new WeakMap<Tecnica, EfectosTecnica>();

/** Efectos de una técnica, ya interpretados. */
export function efectosDe(t: Tecnica): EfectosTecnica {
  let r = efectosCache.get(t);
  if (r) return r;
  const accion: ModKi = { ...SIN_KI };
  const asalto: ModKi = { ...SIN_KI };
  const clases = new Set<Clase>();
  const desconocidos: string[] = [];
  for (const e of t.efectos) {
    const def = CATALOGO[normalizarRasgo(e.nombre)];
    if (!def) {
      desconocidos.push(e.nombre);
      continue;
    }
    def.aplicar(def.tipo === 'accion' ? accion : asalto, valorDe(e.opciones), e.opciones);
    clases.add(def.clase);
  }
  // Una técnica con efectos de Ataque es ofensiva aunque tenga otros (Dominus p.48: Variable se ata
  // a la acción de los demás efectos).
  const clase: Clase = clases.has('ataque') ? 'ataque' : clases.has('contra') ? 'contra' : clases.has('defensa') ? 'defensa' : 'variable';
  r = { accion, asalto, clase, desconocidos };
  efectosCache.set(t, r);
  return r;
}

// --------------------------------------------------------------------------- combinadas y forzadas

/** Técnicas reales que forman una combinada o forzada (la propia, si es una técnica de la ficha). */
const partes = new WeakMap<Tecnica, Tecnica[]>();

export function partesDe(t: Tecnica): Tecnica[] {
  return partes.get(t) ?? [t];
}

/** Alguna de sus partes ya está mantenida: no se vuelve a ejecutar. */
export function enUso(e: EstadoKi, t: Tecnica): boolean {
  for (const p of partesDe(t)) if (e.mantenidas.has(p)) return true;
  return false;
}

/**
 * Técnicas Combinables usadas a la vez en una sola acción (Dominus p.49): suman sus costes y reúnen
 * sus efectos, pero los efectos iguales no se suman; vale el más alto (`efectosDe` ya toma el mayor).
 */
function combinada(ts: Tecnica[]): Tecnica {
  const coste: Partial<Record<CaracteristicaKi, number>> = {};
  for (const t of ts) for (const c of CARACTERISTICAS_KI) if (t.coste[c]) coste[c] = (coste[c] ?? 0) + t.coste[c]!;
  const v: Tecnica = {
    nombre: ts.map((t) => t.nombre).join(' + '),
    nivel: Math.max(...ts.map((t) => t.nivel)) as Tecnica['nivel'],
    cm: ts.reduce((s, t) => s + t.cm, 0),
    coste,
    mantenimiento: ts.reduce((s, t) => s + t.mantenimiento, 0),
    combinable: true,
    efectos: ts.flatMap((t) => t.efectos),
  };
  partes.set(v, ts);
  return v;
}

/**
 * Forzar Técnicas (Dominus p.21): sube cada efecto la mitad de su valor hacia abajo (+100 → +150,
 * 5 ataques adicionales → 7) y un punto el multiplicador al daño. Las dificultades de RF, +40.
 */
function escalar(m: ModKi): ModKi {
  const r: ModKi = { ...m };
  for (const k of Object.keys(r) as (keyof ModKi)[]) {
    const v = r[k];
    if (typeof v !== 'number' || v <= 0) continue;
    (r[k] as number) = k === 'multDano' ? (v > 1 ? v + 1 : v) : v + Math.floor(v / 2);
  }
  return r;
}

/**
 * Técnica forzada: acumula el doble de cada coste. Una mantenida se fuerza sólo en el asalto en que
 * se ejecuta; en los siguientes se mantiene la técnica normal (`ejecutar` mantiene las partes).
 */
function forzada(t: Tecnica): Tecnica {
  const coste: Partial<Record<CaracteristicaKi, number>> = {};
  for (const c of CARACTERISTICAS_KI) if (t.coste[c]) coste[c] = 2 * t.coste[c]!;
  const v: Tecnica = { ...t, nombre: `${t.nombre} (forzada)`, coste };
  partes.set(v, partesDe(t));
  const ef = efectosDe(t);
  efectosCache.set(v, { ...ef, accion: escalar(ef.accion), asalto: escalar(ef.asalto) });
  return v;
}

/** Subconjuntos de 2 o más (hasta 3) de las combinables. */
function combinaciones(ts: Tecnica[]): Tecnica[][] {
  const r: Tecnica[][] = [];
  for (let i = 0; i < ts.length; i++)
    for (let j = i + 1; j < ts.length; j++) {
      r.push([ts[i], ts[j]]);
      for (let k = j + 1; k < ts.length; k++) r.push([ts[i], ts[j], ts[k]]);
    }
  return r;
}

const repertorios = new WeakMap<Ficha, Tecnica[]>();

/** Todo lo que puede ejecutar: sus técnicas, las combinaciones de las combinables y, si sabe, forzadas. */
export function repertorio(f: Ficha): Tecnica[] {
  let r = repertorios.get(f);
  if (r) return r;
  const base = f.ki?.tecnicas ?? [];
  r = [...base, ...combinaciones(base.filter((t) => t.combinable)).map(combinada)];
  if (habilidadesKi(f).forzar) r = [...r, ...r.map(forzada)];
  repertorios.set(f, r);
  return r;
}

// --------------------------------------------------------------------------- habilidades del Ki

/**
 * Habilidades del Ki que se usan en combate (Core p.103-105, Dominus p.19-22). Las de bono fijo
 * (Armadura de energía TA 2, Daño y Velocidad incrementados, Extensión del aura) ya vienen sumadas en
 * la planilla, igual que la Armadura de energía mayor y la arcana a TA 4 (ver `ajusteTaEnergia`).
 */
export interface HabilidadesKi {
  /** Armadura de energía mayor: TA 4 contra energía pagando 1 de Ki cada 5 asaltos (Dominus p.19). */
  armaduraMayor: boolean;
  /** Armadura de energía arcana: TA 4 gratis; TA 6 pagando 1 de Ki cada 5 asaltos (Dominus p.19). */
  armaduraArcana: boolean;
  /** Recuperación: 1 de cansancio por cada 5 de Ki, uno por asalto (Core p.105). */
  recuperacion: boolean;
  /** Aura de combate (Dominus p.21). */
  aura: boolean;
  /** Absorción de energía: 1 de Ki por cada 5 de daño plenamente energético (Dominus p.20). */
  absorcion: boolean;
  /** PV que cura cada punto de Ki: 2 con Curación por Ki (Core p.104), 5 con la superior (Dominus p.20). */
  curacion: number;
  /**
   * Aumento de características: cuántos puntos puede subir (3; 4 con Incremento superior) y cada
   * cuántos asaltos paga 1 de Ki para mantenerlo (1; 10 con Incremento superior). Core p.105,
   * Dominus p.21. 0 si no la tiene.
   */
  aumento: number;
  asaltosPorPagoAumento: number;
  /** Destrucción por Ki (Core p.104). */
  destruccion: boolean;
  /** Forzar Técnicas: el doble de Ki por la mitad más de efecto (Dominus p.21). */
  forzar: boolean;
}

const habilidades = new WeakMap<Ficha, HabilidadesKi>();

export function habilidadesKi(f: Ficha): HabilidadesKi {
  let h = habilidades.get(f);
  if (!h) {
    const hk = f.rasgos?.habilidadesKi;
    // La planilla las abrevia: "Armadura mayor", "Arm. arcana".
    const arcana = tiene(hk, 'armadura de energia arcana') || tiene(hk, 'arm. arcana') || tiene(hk, 'armadura arcana');
    h = {
      armaduraMayor: arcana || tiene(hk, 'armadura de energia mayor') || tiene(hk, 'armadura mayor'),
      armaduraArcana: arcana,
      recuperacion: tiene(hk, 'recuperacion'),
      aura: tiene(hk, 'aura de combate'),
      absorcion: tiene(hk, 'absorcion de energia'),
      curacion: tiene(hk, 'curacion superior') ? 5 : tiene(hk, 'curacion por ki') ? 2 : 0,
      aumento: tiene(hk, 'incremento superior') ? 4 : tiene(hk, 'aumento de caracteristicas') ? 3 : 0,
      asaltosPorPagoAumento: tiene(hk, 'incremento superior') ? 10 : 1,
      destruccion: tiene(hk, 'destruccion por ki'),
      forzar: tiene(hk, 'forzar tecnicas'),
    };
    habilidades.set(f, h);
  }
  return h;
}

/** PV que todavía se le pueden curar con Ki: nunca más de la mitad del daño sufrido (Core p.104). */
export function curable(l: Luchador): number {
  return Math.max(0, Math.min(Math.floor(l.stats.danoRecibido / 2) - l.curado, l.ficha.pv - l.pv));
}

/** Características que sube Aumento de características y que cambian el combate. */
export type AtributoAumento = 'AGI' | 'CON' | 'DES' | 'FUE';

/**
 * La ficha con una característica subida o bajada de `desde` a `hasta` (Aumento de características,
 * Core p.105): se recalculan los bonos que dependen de ella (Core p.13, Tabla 3). DES: ataque y
 * parada; AGI: esquiva y Tipo de movimiento; AGI y DES: turno; FUE: daño (el doble a dos manos,
 * redondeado en grupos de 10 hacia arriba, Core p.73); CON: RF y Constitución. Sobre la ficha actual,
 * así no se pierde lo que haya cambiado mientras tanto (un arma mellada).
 */
export function fichaConAumento(f: Ficha, a: AtributoAumento, desde: number, hasta: number): Ficha {
  const d = bonoCaracteristica(hasta) - bonoCaracteristica(desde);
  const atributos = { ...f.atributos, [a]: hasta };
  const esquiva = f.tipoDefensa === 'esquiva';
  const dos = f.tamanoArma === 'G' ? 2 : 1;
  const dano = (x: number) => (a === 'FUE' ? Math.max(0, Math.ceil((x + d * dos) / 10) * 10) : x);
  const ataque = a === 'DES' ? d : 0;
  const defensa = (a === 'DES' && !esquiva) || (a === 'AGI' && esquiva) ? d : 0;
  const turno = a === 'DES' || a === 'AGI' ? d : 0;
  const s = f.sinArmas;
  return {
    ...f, atributos,
    ataque: f.ataque + ataque, defensa: f.defensa + defensa, turno: f.turno + turno, danoBase: dano(f.danoBase),
    rf: f.rf + (a === 'CON' ? d : 0),
    constitucion: a === 'CON' ? hasta : f.constitucion,
    tipoMovimiento: a === 'AGI' ? f.tipoMovimiento + (hasta - desde) : f.tipoMovimiento,
    sinArmas: s && {
      ...s, ataque: s.ataque + ataque, danoBase: dano(s.danoBase), turno: s.turno + turno,
      defensa: s.defensa + ((a === 'DES' && s.tipoDefensa !== 'esquiva') || (a === 'AGI' && s.tipoDefensa === 'esquiva') ? d : 0),
    },
  };
}

/**
 * Dificultad de la RF contra Destrucción por Ki con `extra` puntos de Ki además del primero: la
 * Presencia base, +5 por punto, hasta el doble de la Presencia (Core p.104).
 */
export function dificultadDestruccion(l: Luchador, extra: number): number {
  const p = presenciaBase(l.ficha);
  return Math.min(2 * p, p + 5 * extra);
}

/** Usa alguna habilidad que gaste Ki durante el combate. */
function gastaKiEnCombate(h: HabilidadesKi): boolean {
  return h.armaduraMayor || h.recuperacion || h.aura || h.absorcion || h.curacion > 0 || h.aumento > 0 || h.destruccion;
}

/**
 * Presencia base (Core p.25, Tabla 5): la de la planilla; si falta, la RF menos el bono de
 * Constitución, que es como se calcula la RF.
 */
export function presenciaBase(f: Ficha): number {
  return f.presencia ?? f.rf - bonoCaracteristica(f.atributos?.CON ?? f.constitucion);
}

/** Tabla 8 (Dominus p.21): bono a la dificultad del Aura según la suma de las acumulaciones. */
export function bonoAura(sumaAcumulaciones: number): number {
  const s = sumaAcumulaciones;
  return s >= 28 ? 60 : s >= 23 ? 50 : s >= 17 ? 40 : s >= 14 ? 30 : s >= 11 ? 20 : s >= 9 ? 10 : 0;
}

/** Dificultad del Aura: Presencia base + Tabla 8, menos los negativos a la acción (Dominus p.21). */
export function dificultadAura(l: Luchador, negativo: number): number {
  const acum = l.ficha.ki?.acumulacion ?? {};
  let suma = 0;
  for (const c of CARACTERISTICAS_KI) suma += acum[c] ?? 0;
  return presenciaBase(l.ficha) + bonoAura(suma) - negativo;
}

/** El Aura no afecta a quien tiene una Presencia a 10 o menos de la suya (Dominus p.21). */
export function sensibleAlAura(fuente: Luchador, x: Luchador): boolean {
  return presenciaBase(x.ficha) < presenciaBase(fuente.ficha) - 10;
}

/** Radio del Aura en metros: la Presencia entre 5 (Dominus p.21). */
export function radioAura(l: Luchador): number {
  return presenciaBase(l.ficha) / 5;
}

/**
 * Lo que hay que sumar a la TA contra energía de la planilla, que trae la Armadura mayor o la arcana
 * a TA 4. La mayor apagada vuelve a TA 2; la arcana encendida sube a TA 6 (Dominus p.19).
 */
export function ajusteTaEnergia(l: Luchador): number {
  const h = habilidadesKi(l.ficha);
  const activa = !!l.ki?.armaduraActiva;
  if (h.armaduraArcana) return activa ? 2 : 0;
  if (h.armaduraMayor) return activa ? 0 : -2;
  return 0;
}

// --------------------------------------------------------------------------- estado y acumulación

export interface EstadoKi {
  reserva: number;
  /** Ki concentrado en cada característica (sin contar el de las técnicas en espera). */
  acumulado: Partial<Record<CaracteristicaKi, number>>;
  /** Lo que sumó este asalto (si hace otra cosa, al final queda la mitad hacia arriba). */
  ganado: Partial<Record<CaracteristicaKi, number>>;
  acumulando: boolean;
  /** Ejecutó alguna técnica este asalto: al final lo sobrante vuelve a la reserva. */
  ejecuto: boolean;
  /** Efectos de tipo Asalto activos (de técnicas ejecutadas o mantenidas este asalto). */
  activo: ModKi;
  /** Técnicas mantenidas y si ya usaron este asalto sus efectos de Acción. */
  mantenidas: Map<Tecnica, boolean>;
  /**
   * Técnicas en espera (Core p.105, segundo método): su Ki ya está concentrado y apartado; se
   * ejecutan cuando convenga. El número es el asalto en que quedaron listas.
   */
  enEspera: Map<Tecnica, number>;
  /** Defensas de este asalto sin penalizador por Defensa adicional (Dominus p.56). */
  defensasLibres: number;
  /** Asalto en curso (para saber desde cuándo espera una técnica). */
  asalto: number;
  /**
   * Técnica declarada al empezar a acumular: sólo esa puede quedar en espera cuando junte su coste
   * (Core p.105: "si antes de comenzar a acumular declara que quiere usar una Técnica en concreto").
   */
  objetivo: Tecnica | null;
  /** Reserva inicial: los Límites recuperan Ki perdido, sin pasarla (Dominus p.28). */
  reservaMax: number;
  /** Límites que ya se activaron (Caelum y Terminus, una vez) y lo recuperado con Cenobus. */
  limitesUsados: Set<string>;
  danoCenobus: number;
  recuperadoCenobus: number;
  matadosAsalto: number;
  /** Armadura de energía mayor (o arcana a TA 6) encendida, y asaltos desde el último pago. */
  armaduraActiva: boolean;
  asaltosArmadura: number;
  /** Aura de combate encendida, y asaltos desde el último pago (1 de Ki cada 5, Dominus p.21). */
  auraActiva: boolean;
  asaltosAura: number;
  /** Aumento de características activo: qué característica, desde y hasta qué valor, y asaltos sin pagar. */
  aumento: { atributo: AtributoAumento; desde: number; hasta: number; asaltos: number } | null;
}

export function crearEstadoKi(l: Luchador): EstadoKi | null {
  const ki = l.ficha.ki;
  if (!ki || (!ki.tecnicas.length && !gastaKiEnCombate(habilidadesKi(l.ficha))) || ki.reserva <= 0) return null;
  return {
    reserva: ki.reserva, acumulado: {}, ganado: {}, acumulando: false, ejecuto: false,
    activo: { ...SIN_KI }, mantenidas: new Map(), enEspera: new Map(), defensasLibres: 0, asalto: 0, objetivo: null,
    reservaMax: ki.reserva, limitesUsados: new Set(), danoCenobus: 0, recuperadoCenobus: 0, matadosAsalto: 0,
    armaduraActiva: false, asaltosArmadura: 0, auraActiva: false, asaltosAura: 0, aumento: null,
  };
}

/** Acumulación Plena (Dominus p.18): no se reduce por hacer otras acciones. */
function acumulacionPlena(l: Luchador): boolean {
  return tiene(l.ficha.rasgos?.ventajas, 'acumulacion plena');
}

/** Ki concentrado en total: lo acumulado más lo apartado en técnicas en espera. */
function totalConcentrado(e: EstadoKi): number {
  let s = 0;
  for (const c of CARACTERISTICAS_KI) s += e.acumulado[c] ?? 0;
  for (const t of e.enEspera.keys()) s += costeKi(t);
  return s;
}

/** Ki genérico por asalto para tener una técnica en espera: 1, 2 o 3 según su nivel (Core p.105). */
export function costeEspera(t: Tecnica): number {
  return t.nivel;
}

export interface DecisionKi {
  /** Acumula este asalto. */
  acumula: boolean;
  /** Mantenidas que deja de mantener (soltarlas no cuesta nada, Dominus p.48). */
  soltar: Tecnica[];
  /** Técnicas en espera que deja ir (su Ki vuelve a la reserva). */
  liberar: Tecnica[];
  /** Técnica que declara al empezar a acumular desde cero (null si no declara ninguna). */
  objetivo: Tecnica | null;
  /** Enciende (o mantiene) la Armadura de energía mayor o la arcana a TA 6. */
  armadura?: boolean;
  /** Recupera un punto de cansancio con 5 de Ki (Recuperación). */
  recuperar?: boolean;
  /** Desencadena (o mantiene) el Aura de combate. */
  aura?: boolean;
  /** Activa Aumento de características hasta ese valor (si no tiene uno activo). */
  aumentar?: { atributo: AtributoAumento; hasta: number };
}

/**
 * Comienzo del asalto: suelta lo que decidió soltar, paga las mantenidas (de la reserva, sin
 * acumular, Dominus p.48) y las técnicas que siguen en espera (1/2/3 de Ki según su nivel, Core
 * p.105) y, si acumula, suma su acumulación de cada característica. Cada −20 a toda acción baja 1
 * cada acumulación (Core p.232). Lo concentrado nunca supera la reserva.
 */
export function empezarAsalto(l: Luchador, d: DecisionKi, negativo: number, asalto: number) {
  const e = l.ki;
  if (!e) return;
  e.asalto = asalto;
  e.matadosAsalto = 0;
  // Agon: recupera un punto de Ki por asalto de combate (Dominus p.29).
  if (tieneLimite(l, 'agon')) recuperarKi(l, 1);
  e.ejecuto = false;
  e.ganado = {};
  e.activo = { ...SIN_KI };
  e.defensasLibres = 0;
  // Armadura de energía mayor: 1 de Ki al encenderla y cada 5 asaltos que siga (Dominus p.19).
  if (d.armadura && e.reserva >= 1) {
    if (!e.armaduraActiva || e.asaltosArmadura >= 5) {
      e.reserva--;
      e.asaltosArmadura = 0;
    }
    e.armaduraActiva = true;
    e.asaltosArmadura++;
  } else e.armaduraActiva = false;
  // Aura de combate: activarla es pasivo y gratis, pero cada 5 asaltos cuesta 1 de Ki (Dominus p.21).
  if (d.aura && e.reserva >= 1) {
    if (!e.auraActiva || e.asaltosAura >= 5) {
      e.reserva--;
      e.asaltosAura = 0;
    }
    e.auraActiva = true;
    e.asaltosAura++;
  } else e.auraActiva = false;
  // Recuperación: un punto de cansancio por 5 de Ki genérico, uno por asalto (Core p.105).
  const maxCansancio = l.ficha.cansancio ?? l.ficha.constitucion;
  if (d.recuperar && e.reserva >= 5 && l.cansancio < maxCansancio) {
    e.reserva -= 5;
    l.cansancio++;
  }
  for (const t of d.soltar) e.mantenidas.delete(t);
  for (const t of d.liberar) e.enEspera.delete(t);
  for (const t of [...e.mantenidas.keys()]) {
    if (e.reserva >= t.mantenimiento) {
      e.reserva -= t.mantenimiento;
      e.mantenidas.set(t, false);
      e.activo = combinar(e.activo, efectosDe(t).asalto);
    } else e.mantenidas.delete(t);
  }
  for (const [t, desde] of [...e.enEspera]) {
    if (desde >= asalto) continue;
    // Si no puede pagar la espera, la técnica se pierde y su Ki vuelve a la reserva.
    if (e.reserva - costeKi(t) >= costeEspera(t)) e.reserva -= costeEspera(t);
    else e.enEspera.delete(t);
  }
  e.acumulando = d.acumula;
  if (!d.acumula) {
    // Si deja de acumular, lo concentrado vuelve a la reserva (Core p.102); lo que está en espera no.
    e.acumulado = {};
    e.objetivo = null;
    return;
  }
  // Empieza a acumular de cero: es cuando puede declarar la técnica que piensa dejar en espera.
  if (!CARACTERISTICAS_KI.some((c) => e.acumulado[c])) e.objetivo = d.objetivo;
  const baja = Math.max(0, Math.floor(negativo / 20));
  let libre = e.reserva - totalConcentrado(e);
  for (const c of CARACTERISTICAS_KI) {
    const suma = Math.min(libre, Math.max(0, (l.ficha.ki!.acumulacion[c] ?? 0) - baja));
    if (suma <= 0) continue;
    e.acumulado[c] = (e.acumulado[c] ?? 0) + suma;
    e.ganado[c] = suma;
    libre -= suma;
  }
}

/**
 * Fin del asalto. Si ejecutó una técnica, lo sobrante vuelve a la reserva. Si no, y además de
 * acumular hizo cualquier otra cosa (atacar, defenderse, moverse), lo que ganó este asalto queda en
 * la mitad hacia arriba (Core p.102; el ejemplo de Lemures reduce lo ganado, no lo ya juntado). Las
 * técnicas en espera no se tocan.
 */
export function terminarAsalto(l: Luchador, hizoOtraCosa: boolean) {
  const e = l.ki;
  if (!e) return;
  if (e.ejecuto) {
    e.acumulado = {};
    return;
  }
  if (!hizoOtraCosa || acumulacionPlena(l)) return;
  for (const c of CARACTERISTICAS_KI) {
    const g = e.ganado[c] ?? 0;
    // Lo apartado en espera no se pierde: lo que se reduce no baja de 0.
    if (g) e.acumulado[c] = Math.max(0, (e.acumulado[c] ?? 0) - Math.floor(g / 2));
  }
}

/** Le alcanza lo concentrado para ejecutarla (o la tiene en espera). */
export function puedeEjecutar(l: Luchador, t: Tecnica): boolean {
  const e = l.ki;
  if (!e) return false;
  if (e.enEspera.has(t)) return costeKi(t) <= e.reserva;
  return alcanzaLoAcumulado(e, t) && costeKi(t) <= e.reserva;
}

function alcanzaLoAcumulado(e: EstadoKi, t: Tecnica): boolean {
  for (const c of CARACTERISTICAS_KI) if ((e.acumulado[c] ?? 0) < (t.coste[c] ?? 0)) return false;
  return true;
}

/**
 * Deja una técnica en espera (Core p.105): aparta de lo acumulado su coste y la tiene lista para
 * cuando convenga, aunque después ejecute otras o deje de acumular.
 */
export function ponerEnEspera(l: Luchador, t: Tecnica) {
  const e = l.ki!;
  if (e.objetivo === t) e.objetivo = null;
  for (const c of CARACTERISTICAS_KI) {
    const k = t.coste[c] ?? 0;
    if (k) e.acumulado[c] = (e.acumulado[c] ?? 0) - k;
  }
  e.enEspera.set(t, e.asalto);
}

/**
 * Se puede poner en espera: es la que declaró al empezar a acumular, le alcanza lo acumulado y no la
 * tiene ya lista ni mantenida.
 */
export function puedePonerEnEspera(l: Luchador, t: Tecnica): boolean {
  const e = l.ki;
  return !!e && e.objetivo === t && !e.enEspera.has(t) && !enUso(e, t) && alcanzaLoAcumulado(e, t) &&
    totalConcentrado(e) <= e.reserva;
}

/**
 * Ejecuta una técnica: gasta su coste de la reserva (de lo concentrado o de lo que tenía en espera),
 * activa sus efectos de Asalto y, si se mantiene, la deja activa para los asaltos siguientes.
 * Defensa adicional deja sin penalizador las defensas siguientes del asalto. Devuelve los efectos
 * que valen para esta acción (los de Acción más los de Asalto activos).
 */
export function ejecutar(l: Luchador, t: Tecnica): ModKi {
  const e = l.ki!;
  if (e.enEspera.has(t)) e.enEspera.delete(t);
  else {
    for (const c of CARACTERISTICAS_KI) {
      const k = t.coste[c] ?? 0;
      if (k) e.acumulado[c] = (e.acumulado[c] ?? 0) - k;
    }
    e.ejecuto = true;
  }
  e.reserva -= costeKi(t);
  const ef = efectosDe(t);
  e.activo = combinar(e.activo, ef.asalto);
  e.defensasLibres = Math.max(e.defensasLibres, ef.accion.defensasAdicionales);
  for (const p of partesDe(t)) if (p.mantenimiento > 0) e.mantenidas.set(p, true);
  return combinar(e.activo, ef.accion);
}

/**
 * Efectos para una acción sin ejecutar ninguna técnica nueva: los de Asalto activos y, una vez por
 * asalto, los de Acción de una técnica mantenida de esa clase (Dominus p.48).
 */
export function modDeAccion(l: Luchador, clase: 'ataque' | 'defensa', consumir: boolean): ModKi | undefined {
  const e = l.ki;
  if (!e) return undefined;
  let m: ModKi = e.activo;
  for (const [t, usada] of e.mantenidas) {
    const ef = efectosDe(t);
    if (usada || (ef.clase !== clase && !(clase === 'ataque' && ef.clase === 'contra'))) continue;
    m = combinar(m, ef.accion);
    if (consumir) e.mantenidas.set(t, true);
  }
  return m;
}

/** Técnicas que se pueden ejecutar ahora atadas a esta clase de acción. */
export function tecnicasPara(l: Luchador, clase: Clase, esContra = false): Tecnica[] {
  if (!l.ki) return [];
  return repertorio(l.ficha).filter((t) => {
    const c = efectosDe(t).clase;
    const encaja = c === clase || (clase === 'ataque' && esContra && c === 'contra');
    return encaja && !enUso(l.ki!, t) && puedeEjecutar(l, t);
  });
}

// --------------------------------------------------------------------------- Límites (Dominus p.28-29)

function tieneLimite(l: Luchador, nombre: string): boolean {
  return !!l.ficha.ki?.limites?.includes(nombre);
}

/** Recupera Ki perdido, sin pasar la reserva inicial. Devuelve cuánto recuperó. */
export function recuperarKi(l: Luchador, n: number): number {
  const e = l.ki;
  if (!e || n <= 0) return 0;
  const antes = e.reserva;
  e.reserva = Math.min(e.reservaMax, e.reserva + n);
  return e.reserva - antes;
}

/**
 * Pierde PV: Cenobus recupera 1 de Ki cada 5 de daño (máx. 60); Caelum, 30 una vez al bajar de un
 * cuarto de sus PV; Terminus, 30 una vez al quedar con PV negativos. Devuelve qué Límite se activó.
 */
export function alPerderPv(l: Luchador, dano: number): string | null {
  const e = l.ki;
  if (!e || dano <= 0) return null;
  let activado: string | null = null;
  if (tieneLimite(l, 'cenobus') && e.recuperadoCenobus < 60) {
    e.danoCenobus += dano;
    const puntos = Math.min(60 - e.recuperadoCenobus, Math.floor(e.danoCenobus / 5));
    e.danoCenobus -= puntos * 5;
    e.recuperadoCenobus += recuperarKi(l, puntos);
  }
  if (tieneLimite(l, 'caelum') && !e.limitesUsados.has('caelum') && l.pv < l.ficha.pv / 4) {
    e.limitesUsados.add('caelum');
    recuperarKi(l, 30);
    activado = 'Caelum';
  }
  if (tieneLimite(l, 'terminus') && !e.limitesUsados.has('terminus') && l.pv < 0) {
    e.limitesUsados.add('terminus');
    recuperarKi(l, 30);
    activado = 'Terminus';
  }
  return activado;
}

/** Cruor: cada crítico que sufre, tenga o no efectos, recupera 10 de Ki. */
export function alRecibirCritico(l: Luchador): boolean {
  return tieneLimite(l, 'cruor') && recuperarKi(l, 10) > 0;
}

/** Mors: un punto de Ki por cada rival que mata, hasta 10 por asalto. */
export function alMatar(l: Luchador): boolean {
  const e = l.ki;
  if (!e || !tieneLimite(l, 'mors') || e.matadosAsalto >= 10) return false;
  e.matadosAsalto++;
  return recuperarKi(l, 1) > 0;
}

/** Resumen para el registro: "DES 7/14, FUE 6/12 (reserva 93)". */
export function textoKi(l: Luchador): string {
  const e = l.ki;
  if (!e) return '';
  const partes = CARACTERISTICAS_KI.filter((c) => e.acumulado[c]).map((c) => `${c} ${e.acumulado[c]}`);
  const espera = [...e.enEspera.keys()].map((x) => x.nombre);
  return `${partes.join(', ') || 'nada'}${espera.length ? `; en espera: ${espera.join(', ')}` : ''} (reserva ${e.reserva})`;
}


/** Efectos que tendría la acción si ejecutara esta técnica (sin ejecutarla). */
export function vistaPrevia(l: Luchador, t: Tecnica): ModKi {
  const ef = efectosDe(t);
  return combinar(combinar(l.ki?.activo ?? SIN_KI, ef.asalto), ef.accion);
}

/** Ki total que cuesta ejecutarla. */
export function costeKi(t: Tecnica): number {
  let s = 0;
  for (const c of CARACTERISTICAS_KI) s += t.coste[c] ?? 0;
  return s;
}

/**
 * Asaltos que le faltan para poder ejecutarla, con lo que ya tiene concentrado y acumulando la mitad
 * por asalto (porque además pelea). 0 si ya puede; Infinity si nunca junta alguna característica.
 */
export function asaltosQueFaltan(l: Luchador, t: Tecnica): number {
  const e = l.ki;
  const ki = l.ficha.ki;
  if (!e || !ki) return Infinity;
  if (costeKi(t) > e.reserva) return Infinity;
  let faltan = 0;
  for (const c of CARACTERISTICAS_KI) {
    const resto = (t.coste[c] ?? 0) - (e.acumulado[c] ?? 0);
    if (resto <= 0) continue;
    const ritmo = Math.ceil((ki.acumulacion[c] ?? 0) / 2);
    if (!ritmo) return Infinity;
    faltan = Math.max(faltan, Math.ceil(resto / ritmo));
  }
  return faltan;
}

export type { EfectoTecnica };
