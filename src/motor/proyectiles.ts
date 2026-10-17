// Armas de proyectiles y arrojadizas (Core p.80-81, p.94-96): Tabla 34 (recarga, cadencia y
// alcance), Tabla 47 (modificadores al ataque), recarga y cadencia de fuego, y el tope de 280.

import type { ArmaDistancia, EstadoArmaDistancia, Ficha, Luchador } from './modelo';
import { normalizarRasgo, tiene } from './rasgos';

interface DatosTabla34 {
  clase: 'disparo' | 'lanzamiento';
  /** Índice de recarga (disparo) o cadencia de fuego (lanzamiento). */
  recarga?: number;
  cadencia?: number;
  alcance: number;
  fuego?: boolean;
  recamara?: number;
}

/**
 * Tabla 34 (Core p.80). Las armas de fuego, además, se encasquillan o estallan con una pifia (Core
 * p.80-81). El orden importa: lo más específico primero ("ballesta pesada" antes que "ballesta").
 */
const TABLA_34: [RegExp, DatosTabla34][] = [
  [/abanico/, { clase: 'lanzamiento', cadencia: 40, alcance: 20 }],
  [/arcabuz/, { clase: 'disparo', recarga: 4, alcance: 80, fuego: true }],
  [/arco (largo )?compuesto/, { clase: 'disparo', recarga: 1, alcance: 90 }],
  [/arco corto/, { clase: 'disparo', recarga: 1, alcance: 40 }],
  [/arco/, { clase: 'disparo', recarga: 1, alcance: 60 }],
  [/arpon/, { clase: 'lanzamiento', cadencia: 100, alcance: 20 }],
  [/balista pesada/, { clase: 'disparo', recarga: 12, alcance: 200 }],
  [/balista/, { clase: 'disparo', recarga: 10, alcance: 150 }],
  [/ballesta de mano/, { clase: 'disparo', recarga: 2, alcance: 30 }],
  // Recámara de 4 a 8 virotes (Core p.81): se toma la más corta; vacía, se recarga en 3 asaltos.
  [/ballesta de repeticion/, { clase: 'disparo', recarga: 3, alcance: 60, recamara: 4 }],
  [/ballesta pesada/, { clase: 'disparo', recarga: 2, alcance: 80 }],
  [/ballesta/, { clase: 'disparo', recarga: 2, alcance: 60 }],
  [/boleadoras/, { clase: 'lanzamiento', cadencia: 80, alcance: 20 }],
  [/bolas/, { clase: 'lanzamiento', cadencia: 50, alcance: 20 }],
  [/bumeran/, { clase: 'lanzamiento', cadencia: 60, alcance: 20 }],
  [/canon/, { clase: 'disparo', recarga: 12, alcance: 250, fuego: true }],
  [/cerbatana/, { clase: 'disparo', recarga: 1, alcance: 50 }],
  [/daga de parada/, { clase: 'lanzamiento', cadencia: 50, alcance: 15 }],
  [/dardos/, { clase: 'lanzamiento', cadencia: 40, alcance: 20 }],
  [/daga|cuchillo/, { clase: 'lanzamiento', cadencia: 50, alcance: 20 }],
  [/estilete/, { clase: 'lanzamiento', cadencia: 30, alcance: 30 }],
  [/hacha de mano/, { clase: 'lanzamiento', cadencia: 80, alcance: 10 }],
  [/honda/, { clase: 'disparo', recarga: 1, alcance: 50 }],
  [/jabalina|lanza|turcus/, { clase: 'lanzamiento', cadencia: 80, alcance: 30 }],
  [/pistola|revolver|mosquete|rifle/, { clase: 'disparo', recarga: 4, alcance: 50, fuego: true }],
  [/\bred\b/, { clase: 'lanzamiento', cadencia: 100, alcance: 5 }],
  [/shuriken/, { clase: 'lanzamiento', cadencia: 30, alcance: 20 }],
  [/tridente/, { clase: 'lanzamiento', cadencia: 100, alcance: 15 }],
];

/** Lo que la Tabla 34 dice de un arma, por su nombre (null si no está). */
export function datosProyectil(nombre: string): DatosTabla34 | null {
  const n = normalizarRasgo(nombre);
  return TABLA_34.find(([re]) => re.test(n))?.[1] ?? null;
}

/**
 * Objetos que no figuran en la Tabla 34: cadencia 80 si son medianos o pequeños (Core p.96). Sin
 * alcance conocido, 10 m.
 */
const CADENCIA_SIN_TABLA = 80;

/** El arma con lo que le falte completado de la Tabla 34. */
const completas = new WeakMap<ArmaDistancia, Required<Pick<ArmaDistancia, 'recarga' | 'cadencia'>> & ArmaDistancia>();

export function completarArma(a: ArmaDistancia): Required<Pick<ArmaDistancia, 'recarga' | 'cadencia'>> & ArmaDistancia {
  let c = completas.get(a);
  if (!c) completas.set(a, (c = completar(a)));
  return c;
}

function completar(a: ArmaDistancia): Required<Pick<ArmaDistancia, 'recarga' | 'cadencia'>> & ArmaDistancia {
  const t = datosProyectil(a.nombre);
  return {
    ...a,
    recarga: a.recarga ?? (a.clase === 'disparo' ? t?.recarga ?? 1 : 0),
    cadencia: a.cadencia ?? (a.clase === 'lanzamiento' ? t?.cadencia ?? CADENCIA_SIN_TABLA : 0),
    fuego: a.fuego ?? t?.fuego ?? false,
    recamara: a.recamara ?? t?.recamara,
  };
}

/** Estado inicial de las armas a distancia de una ficha. */
export function estadoProyectiles(f: Ficha): EstadoArmaDistancia[] {
  return (f.armasDistancia ?? []).map((a) => ({
    // Un arma arrojadiza sin munición declarada es una sola: lanzada, se pierde.
    municion: a.municion ?? (a.clase === 'lanzamiento' ? 1 : Infinity),
    recargaFalta: 0,
    enRecamara: completarArma(a).recamara ?? Infinity,
    inutil: '',
  }));
}

/** Resultado final máximo de un proyectil, salvo que extienda su Ki al arma (Core p.95). */
export const TOPE_PROYECTIL = 280;

/**
 * Disparos de un asalto (Core p.96): por cada 100 de habilidad puede bajar un asalto la recarga con
 * −30 acumulable a todos; por debajo de 1 dispara varias veces. Devuelve cuántos dispara, con qué
 * penalizador y cuántos asaltos de recarga quedan después.
 */
export function disparosConRecarga(recarga: number, reducciones: number): { disparos: number; pen: number; recargaFalta: number } {
  const efectiva = recarga - reducciones;
  return {
    disparos: efectiva >= 1 ? 1 : reducciones - recarga + 2,
    pen: 30 * reducciones,
    // Con índice 1 vuelve a estar listo el asalto siguiente; con 2, pierde un turno recargando.
    recargaFalta: Math.max(0, efectiva - 1),
  };
}

/** Reducciones de recarga que permite su habilidad: una por cada 100 (Core p.96). */
export function reduccionesPosibles(ataque: number): number {
  return Math.max(0, Math.floor(ataque / 100));
}

/**
 * Lanzamientos de un asalto (Core p.96): uno por cada CF de habilidad (mínimo uno), con −10 a
 * todos por cada uno de más.
 */
export function lanzamientosPosibles(ataque: number, cadencia: number): number {
  return Math.max(1, Math.floor(ataque / Math.max(1, cadencia)));
}

/**
 * Nivel de pifia desde el que un arma de fuego estalla en vez de encasquillarse: 80 (arcabuz, pistola)
 * o 70 (cañón), +15 por cada +5 de calidad (Core p.80-81).
 */
export function umbralEstallido(calidad = 0, nombre = ''): number {
  return (normalizarRasgo(nombre).includes('canon') ? 70 : 80) + 3 * Math.max(0, calidad);
}

/** Tabla 47: modificador por la velocidad a la que se movió el blanco (Tipo de movimiento). */
export function modVelocidadBlanco(tipoMovimiento: number): number {
  return tipoMovimiento > 10 ? -60 : tipoMovimiento === 10 ? -40 : tipoMovimiento > 8 ? -20 : 0;
}

/**
 * Dificultad para atrapar un proyectil con Trucos de manos (Core p.94): lanzado Absurdo (180),
 * disparado Casi Imposible (240), un arma de fuego Inhumano (320, y hace falta maestría). Contra uno
 * sobrenatural (técnica de Ki, conjuro) es un control enfrentado con su ataque final: null.
 */
export function dificultadAtrapar(arma: ArmaDistancia | undefined): number | null {
  if (!arma) return null;
  if (arma.fuego) return 320;
  return arma.clase === 'lanzamiento' ? 180 : 240;
}

/** Puede intentar atraparlo: una bala pide maestría en Trucos de manos (200, Core p.94). */
export function puedeAtrapar(trucos: number, arma: ArmaDistancia | undefined): boolean {
  return !arma?.fuego || trucos >= 200;
}

/** Cada control de Trucos de manos de más en el asalto: −25 (Core p.94). */
export const PEN_ATRAPAR_ADICIONAL = 25;
/** Si no lo atrapa, todavía puede esquivarlo con −50 (Core p.94). */
export const PEN_ESQUIVA_TRAS_ATRAPAR = 50;

/** Extiende su Ki al arma (Extensión del aura al arma): sus proyectiles pasan el tope de 280 (Core p.95). */
export function superaTope(f: Ficha): boolean {
  return tiene(f.rasgos?.habilidadesKi, 'extension del aura');
}

/**
 * Formas de usar el arma este asalto: con recarga, bajándola de a una por cada 100 de habilidad
 * (−30 cada vez); arrojadiza, lanzando de una a tantas como permita la cadencia (−10 por cada una
 * de más), sin pasar de las que tiene (Core p.96).
 */
export function formasDeDisparar(l: Luchador, i: number): { disparos: number; pen: number; recargaFalta: number }[] {
  const a = completarArma(l.ficha.armasDistancia![i]);
  // Recarga y cadencia: la más alta entre su ataque y sus Trucos de manos (Core p.97).
  const hab = Math.max(a.ataque, l.ficha.trucosDeManos ?? 0);
  if (a.clase === 'disparo' && a.recamara) {
    // Con recámara dispara como con índice 1 hasta vaciarla; vacía, la recarga entera (Core p.81).
    const res = [];
    const quedan = Math.min(l.proyectiles[i].enRecamara, l.proyectiles[i].municion);
    for (let k = 0; k <= reduccionesPosibles(hab) && k < quedan; k++)
      res.push({ disparos: k + 1, pen: 30 * k, recargaFalta: k + 1 >= quedan ? a.recarga : 0 });
    return res;
  }
  if (a.clase === 'disparo') {
    const res = [];
    for (let k = 0; k <= reduccionesPosibles(hab); k++) res.push(disparosConRecarga(a.recarga, k));
    const quedan = a.leo ? l.balas : l.proyectiles[i].municion;
    return res.filter((x) => x.disparos <= quedan || x.disparos === 1);
  }
  const res = [];
  const tope = Math.min(lanzamientosPosibles(hab, a.cadencia), l.proyectiles[i].municion);
  for (let n = 1; n <= tope; n++) res.push({ disparos: n, pen: 10 * (n - 1), recargaFalta: 0 });
  return res;
}
