// Armas de proyectiles y arrojadizas (Core p.80-81, p.94-96): Tabla 34 (recarga, cadencia y
// alcance), Tabla 47 (modificadores al ataque), recarga y cadencia de fuego, y el tope de 280.

import type { ArmaDistancia, EstadoArmaDistancia, Ficha } from './modelo';
import { normalizarRasgo, tiene } from './rasgos';

interface DatosTabla34 {
  clase: 'disparo' | 'lanzamiento';
  /** Índice de recarga (disparo) o cadencia de fuego (lanzamiento). */
  recarga?: number;
  cadencia?: number;
  alcance: number;
  fuego?: boolean;
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
  [/ballesta de repeticion/, { clase: 'disparo', recarga: 3, alcance: 60 }],
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
  };
}

/** Estado inicial de las armas a distancia de una ficha. */
export function estadoProyectiles(f: Ficha): EstadoArmaDistancia[] {
  return (f.armasDistancia ?? []).map((a) => ({
    // Un arma arrojadiza sin munición declarada es una sola: lanzada, se pierde.
    municion: a.municion ?? (a.clase === 'lanzamiento' ? 1 : Infinity),
    recargaFalta: 0,
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

/** Nivel de pifia desde el que un arma de fuego estalla en vez de encasquillarse: +15 por cada +5. */
export function umbralEstallido(calidad = 0): number {
  return 80 + 3 * Math.max(0, calidad);
}

/** Tabla 47: modificador por la velocidad a la que se movió el blanco (Tipo de movimiento). */
export function modVelocidadBlanco(tipoMovimiento: number): number {
  return tipoMovimiento > 10 ? -60 : tipoMovimiento === 10 ? -40 : tipoMovimiento > 8 ? -20 : 0;
}

/** Extiende su Ki al arma (Extensión del aura al arma): sus proyectiles pasan el tope de 280 (Core p.95). */
export function superaTope(f: Ficha): boolean {
  return tiene(f.rasgos?.habilidadesKi, 'extension del aura');
}
