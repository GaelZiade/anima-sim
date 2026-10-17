// Maniobras de combate (Core p.91-92), controles enfrentados de características (Core p.9) y los
// estados que dejan (Tabla 43).

import type { Atributo, Luchador } from './modelo';
import type { ModKi } from './ki';
import { nivelCondicion } from './condiciones';
import type { Localizacion, TipoAtaque } from './reglas';
import type { Rng } from './rng';
import { dado } from './rng';

export type Maniobra =
  | 'normal' | 'derribo' | 'presa' | 'desarmar' | 'area' | 'cabeza' | 'corazon'
  /** Core p.91: apuntado a una extremidad, mitad de daño pero crítico pleno. */
  | 'inutilizar'
  /** Core p.92: apuntado a la cabeza con crítico contundente, mitad de daño; deja inconsciente. */
  | 'inconsciencia'
  /** Core p.92: −100, sin daño; deja al rival amenazado. */
  | 'engatillar'
  /** Mushin (Dominus p.42): en vez de daño, RF contra el daño + 20. */
  | 'puntosPresion'
  /** Leo (Ars Magnus): golpe con la hoja (−20) y, si alcanza el cuerpo, disparo a bocajarro. */
  | 'combinado'
  /** Destrucción por Ki (Core p.104): un toque que obliga a una RF contra la Presencia; daña el fracaso. */
  | 'destruccionKi'
  /** Ojos de la Muerte: apunta a las líneas existenciales, −10 y +40 al nivel del crítico (Dominus p.78). */
  | 'lineas';

/**
 * Tabla 45: ataques apuntados que interesan en combate. Inutilizar apunta a la pantorrilla (−10): es
 * pierna, como pide la maniobra, y el más barato de brazo y pierna (brazo y muslo −20; Core p.91-92).
 */
export const PEN_APUNTADO = { cabeza: 60, corazon: 60, inutilizar: 10, inconsciencia: 60 } as const;

/** Maniobras que se resuelven contra TA 0 y piden un control enfrentado. */
export function esManiobraDeControl(m: Maniobra): m is 'derribo' | 'presa' | 'desarmar' {
  return m === 'derribo' || m === 'presa' || m === 'desarmar';
}

/** Ataques a un punto vulnerable (crítico con 1/10 de los PV, Core p.97). */
export function esApuntado(m: Maniobra): m is 'cabeza' | 'corazon' | 'inutilizar' | 'inconsciencia' {
  return m === 'cabeza' || m === 'corazon' || m === 'inutilizar' || m === 'inconsciencia';
}

/** Dónde pega un crítico de esta maniobra, o null si se tira la localización (Tabla 51). */
export function localizacionApuntada(m: Maniobra): Localizacion | null {
  if (m === 'cabeza' || m === 'inconsciencia') return 'cabeza';
  if (m === 'corazon') return 'corazon';
  if (m === 'inutilizar') return 'extremidad';
  return null;
}

/** Inutilizar e Inconsciencia hacen la mitad de daño pero cuentan el pleno para el crítico. */
export function esNoLetal(m: Maniobra): m is 'inutilizar' | 'inconsciencia' {
  return m === 'inutilizar' || m === 'inconsciencia';
}

/** Estados que un Maestro Arcano de Mushin puede inducir, con su penalizador al ataque (p.42). */
export const ESTADOS_MUSHIN = {
  debilidad: 5, dolor: 10, dolorExtremo: 25, paralisisMenor: 20, paralisisParcial: 30,
  paralisisCompleta: 50, coma: 60, muerte: 70,
} as const;
export type EstadoMushin = keyof typeof ESTADOS_MUSHIN;

/** Redondeo hacia arriba en grupos de 5 (Sambo supremo, Dominus p.35). */
function arriba5(x: number): number {
  return Math.ceil(x / 5) * 5;
}

/** Penalizador (positivo) de la maniobra para este luchador; Infinity si no puede hacerla. */
export function penManiobra(l: Luchador, m: Maniobra, esContra: boolean, tipo: TipoAtaque = l.ficha.tipoAtaque): number {
  const e = l.cap.est;
  switch (m) {
    case 'normal': return 0;
    case 'derribo': return esContra && e.presaDerriboLibreEnContra ? 0 : e.penDerribo;
    case 'presa':
      if (!e.puedePresar) return Infinity;
      return esContra && e.presaDerriboLibreEnContra ? 0 : e.penPresa;
    case 'desarmar':
      return esContra && e.desarmarLibreEnContra ? 0 : e.penDesarmar;
    case 'area': return e.penArea;
    case 'cabeza':
    case 'corazon':
    case 'inutilizar':
      return arriba5(PEN_APUNTADO[m] * e.factorApuntado);
    case 'inconsciencia':
      // Sin un crítico Contundente (el del golpe, no el del arma), −40 adicional (Core p.92).
      return arriba5(PEN_APUNTADO.inconsciencia * e.factorApuntado) + (tipo === 'CON' ? 0 : 40);
    case 'engatillar': return e.penEngatillar;
    case 'puntosPresion': return e.mushin ? 0 : Infinity;
    case 'combinado': return e.leo ? 20 : Infinity;
    // Basta con alcanzarlo con la habilidad de ataque: sin penalizador (Core p.104).
    case 'destruccionKi': return 0;
    case 'lineas': return e.criticoAutomatico ? 10 : Infinity;
  }
}

/** Dificultad de la RF contra un ataque a puntos de presión: daño + 20 (máx. 220; arcano +20, máx. 240). */
export function dificultadPuntosPresion(dano: number, arcano: boolean): number {
  return arcano ? Math.min(240, dano + 40) : Math.min(220, dano + 20);
}

export function atributo(l: Luchador, a: Atributo): number {
  return l.ficha.atributos?.[a] ?? 5;
}

/** Tabla 2: bono por característica. */
export function bonoCaracteristica(valor: number): number {
  const t = [-30, -30, -20, -10, -5, 0, 5, 5, 10, 10, 15, 20, 20, 25, 25, 30, 35, 35, 40, 40, 45];
  return t[Math.max(0, Math.min(20, valor))];
}

/** D10 de un control de características: un 10 cuenta como 12 (Core p.9, regla del 10). */
function d10(rng: Rng): number {
  const n = dado(rng, 10);
  return n === 10 ? 12 : n;
}

/** Control de característica contra una dificultad: d10 + valor ≥ dificultad (Core p.9). */
export function controlCaracteristica(rng: Rng, valor: number, dificultad: number): boolean {
  return valor + d10(rng) >= dificultad;
}

/**
 * Control enfrentado de características (Core p.9). Devuelve la diferencia a favor de A (0 empate).
 * Si las características difieren en más de 4, cada punto de más cuenta doble.
 */
export function controlEnfrentado(rng: Rng, a: number, b: number): number {
  const exceso = Math.max(0, Math.abs(a - b) - 4);
  const va = a + (a > b ? exceso : 0);
  const vb = b + (b > a ? exceso : 0);
  return va + d10(rng) - (vb + d10(rng));
}

/** P(gana A) en un control enfrentado, para la IA. Exacto: 10×10 combinaciones. */
export function pGanaControl(a: number, b: number): number {
  const exceso = Math.max(0, Math.abs(a - b) - 4);
  const va = a + (a > b ? exceso : 0);
  const vb = b + (b > a ? exceso : 0);
  let gana = 0;
  for (let x = 1; x <= 10; x++)
    for (let y = 1; y <= 10; y++) if (va + (x === 10 ? 12 : x) > vb + (y === 10 ? 12 : y)) gana++;
  return gana / 100;
}

/**
 * La mejor de estas características para un control enfrentado de una maniobra (hacerla o sufrirla:
 * Derribo, Presa, Desarmar, zafarse). Velez arcano puede usar su Poder en lugar de Fuerza, Destreza o
 * Agilidad (Dominus p.40).
 */
export function mejorCaracteristica(l: Luchador, as: readonly Atributo[], ki: ModKi | undefined = l.ki?.activo): number {
  let v = -Infinity;
  for (const a of as) v = Math.max(v, atributo(l, a) + capacidad(ki, a));
  return l.cap.est.intangible ? Math.max(v, atributo(l, 'POD')) : v;
}

/** Capacidad incrementada (Ki): bono a una Característica sólo en los controles enfrentados (Dominus p.61). */
export function capacidad(ki: ModKi | undefined, a: Atributo): number {
  let b = 0;
  if (ki?.capacidad.length) for (const c of ki.capacidad) if (c.atributo === a) b = Math.max(b, c.bono);
  return b;
}

/**
 * Mejor característica del atacante y del defensor para cada maniobra (Core p.91-92). `kiAtk`: los
 * efectos de Ki del golpe (la Capacidad incrementada de la técnica).
 */
export function caracteristicasControl(m: 'derribo' | 'presa' | 'desarmar', atk: Luchador, def: Luchador, apresamiento = 0, kiAtk: ModKi | undefined = atk.ki?.activo) {
  const mejor = (l: Luchador, as: readonly Atributo[]) => mejorCaracteristica(l, as, l === atk ? kiAtk : l.ki?.activo);
  if (m === 'desarmar') return { atk: mejor(atk, ['FUE', 'DES']), def: mejor(def, ['FUE', 'DES']) };
  // Apresamiento (Ki): usa el valor de la técnica en lugar de su Fuerza o Destreza (Dominus p.64).
  // Presa existencial: el apresado controla con su Poder (Dominus p.64).
  if (m === 'presa' && apresamiento) return { atk: apresamiento, def: kiAtk?.presaExistencial ? mejor(def, ['POD']) : mejor(def, ['FUE', 'AGI']) };
  // Un arma con regla Presa usa su propia Fuerza, no la del portador (Core p.76).
  if (m === 'presa' && atk.cap.est.fuerzaPresaArma) return { atk: atk.cap.est.fuerzaPresaArma, def: mejor(def, ['FUE', 'AGI']) };
  // Presa Inusual: con armas sin regla de Presa se usa la Destreza con −3 (Dominus p.28).
  const presaInusual = m === 'presa' && !atk.cap.desarmado;
  return {
    atk: presaInusual ? atributo(atk, 'DES') + capacidad(kiAtk, 'DES') - 3 : mejor(atk, ['FUE', 'DES']),
    def: mejor(def, ['FUE', 'AGI']),
  };
}

/** Modificador por el % de daño logrado: <100% −3, >200% +3 (Core p.91). */
export function modificadorPorResultado(porcentaje: number): number {
  return porcentaje < 100 ? -3 : porcentaje > 200 ? 3 : 0;
}

/** Presa: diferencia < 3 parálisis menor, ≥ 3 parcial, > 10 completa (Core p.92). */
export function gradoPresa(diferencia: number): 1 | 2 | 3 {
  return diferencia > 10 ? 3 : diferencia >= 3 ? 2 : 1;
}

export interface ModEstado {
  ataque: number;
  parada: number;
  esquiva: number;
  turno: number;
}

/** Tabla 43: derribado y parálisis. */
const PARALISIS: Record<1 | 2 | 3, ModEstado> = {
  1: { ataque: -20, parada: -20, esquiva: -40, turno: -20 },
  2: { ataque: -80, parada: -80, esquiva: -80, turno: -30 },
  3: { ataque: -200, parada: -200, esquiva: -200, turno: -100 },
};
const DERRIBADO: ModEstado = { ataque: -30, parada: -30, esquiva: -30, turno: -10 };
const DERRIBADO_SOO_BAHK: ModEstado = { ataque: 0, parada: 0, esquiva: 0, turno: -10 };

/** Tabla 43: amenazado (sólo contra quien lo amenaza). */
export const AMENAZADO: ModEstado = { ataque: -20, parada: -120, esquiva: -120, turno: -50 };

/** Suma de los modificadores por estado de un luchador. */
const SIN_ESTADOS: Readonly<ModEstado> = Object.freeze({ ataque: 0, parada: 0, esquiva: 0, turno: 0 });

/** Tabla 43: levitando, vuelo y carga. */
const LEVITANDO: ModEstado = { ataque: -20, parada: -20, esquiva: -40, turno: 0 };
const VUELO_7: ModEstado = { ataque: 10, parada: 10, esquiva: 10, turno: 10 };
const VUELO_15: ModEstado = { ataque: 15, parada: 10, esquiva: 20, turno: 10 };
const CARGANDO: ModEstado = { ataque: 10, parada: -10, esquiva: -20, turno: 0 };

/**
 * Cómo se mueve en el aire: el vuelo (7 o más) necesita "un amplio espacio para maniobrar", así que
 * en un espacio reducido no da bono (Tabla 43, Core p.90).
 */
function enElAire(l: Luchador): ModEstado | null {
  const vuelo = l.ficha.tipoVuelo ?? 0;
  if (vuelo >= 7 && !l.entorno.espacioReducido) return vuelo >= 15 ? VUELO_15 : VUELO_7;
  if (l.ficha.estados?.levitando) return LEVITANDO;
  return null;
}

export function modEstados(l: Luchador): Readonly<ModEstado> {
  const aire = l.ficha.tipoVuelo || l.ficha.estados?.levitando ? enElAire(l) : null;
  // Lo más común: ni derribado, ni paralizado, ni apresando, ni en el aire, ni cargando.
  if (!l.derribado && l.paralisis === 0 && !nivelCondicion(l, 'paralisis') && !l.apresando && !aire && !l.cargando) return SIN_ESTADOS;
  const m: ModEstado = { ataque: 0, parada: 0, esquiva: 0, turno: 0 };
  const sumar = (x: ModEstado, sinDefensa = false) => {
    m.ataque += x.ataque;
    m.turno += x.turno;
    if (!sinDefensa) {
      m.parada += x.parada;
      m.esquiva += x.esquiva;
    }
  };
  const e = l.cap.est;
  // Soo Bahk supremo quita lo de ataque y defensa, no lo del turno (Dominus p.38).
  if (l.derribado) sumar(e.derribadoSinPenalizador ? DERRIBADO_SOO_BAHK : DERRIBADO);
  // Las parálisis no se suman: vale la peor entre la de una presa (sufrida o hecha: quien apresa
  // queda en parálisis menor, salvo Pankration avanzado) y la inducida por Mushin arcano.
  const deLaPresa = Math.max(l.paralisis, l.apresando && !e.sinPenalizadorApresando ? 1 : 0);
  const inducida = nivelCondicion(l, 'paralisis');
  const paralisis = Math.max(deLaPresa, inducida) as 0 | 1 | 2 | 3;
  if (paralisis > 0) sumar(PARALISIS[paralisis as 1 | 2 | 3], e.defensaSinParalisis && paralisis < 3);
  if (aire) sumar(aire);
  if (l.cargando) sumar(CARGANDO);
  return m;
}
