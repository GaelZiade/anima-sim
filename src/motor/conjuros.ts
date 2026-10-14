// Catálogo de conjuros que el simulador sabe usar en combate (Core cap. 11 y Libros de magia). Sólo
// los números de cada grado y una descripción corta propia: el texto está en el manual.

import type { MagiaFicha } from './modelo';
import type { TipoAtaque } from './reglas';
import { normalizarRasgo } from './rasgos';

export type TipoConjuro = 'ataque' | 'defensa' | 'efecto' | 'animico' | 'automatico' | 'deteccion';
export type NombreGrado = 'base' | 'intermedio' | 'avanzado' | 'arcano';
export const GRADOS: readonly NombreGrado[] = ['base', 'intermedio', 'avanzado', 'arcano'];

/** Lo que hace un grado de un conjuro en combate. */
export interface Grado {
  zeon: number;
  /** Inteligencia mínima para lanzarlo en este grado (Core p.121). */
  int: number;
  /** Mantenimiento por asalto (sin dato: no se mantiene). */
  mantenimiento?: number;
  /** Ataque: daño base. */
  dano?: number;
  /** Ataque: radio del área en metros (alcanza a todos los de adentro, Core p.122). */
  area?: number;
  /** Escudo: puntos de resistencia. */
  resistencia?: number;
  /** Armadura: TA contra energía y contra el resto. */
  taEnergia?: number;
  taResto?: number;
}

export interface Conjuro {
  nombre: string;
  via: string;
  nivel: number;
  /** Activo (en su turno) o pasivo (cuando haga falta, como un escudo, Core p.117). */
  accion: 'activa' | 'pasiva';
  tipos: TipoConjuro[];
  /** TA en la que ataca. */
  ta?: TipoAtaque;
  /** Escudo que sólo dañan los ataques sobrenaturales; los de este tipo le hacen el doble. */
  escudoSoloSobrenatural?: boolean;
  escudoDobleContra?: string;
  /** Base, intermedio, avanzado, arcano. */
  grados: readonly [Grado, Grado, Grado, Grado];
  /** Página del manual. */
  fuente: string;
}

/** Conjuros de combate por vía (Core p.126-159). */
export const CATALOGO: readonly Conjuro[] = [
  {
    nombre: 'Escudo de Luz', via: 'luz', nivel: 10, accion: 'pasiva', tipos: ['defensa'],
    escudoSoloSobrenatural: true, escudoDobleContra: 'oscuridad', fuente: 'Core p.126',
    // El mantenimiento está cortado en la copia del manual: se toma el del Escudo de Oscuridad, su
    // espejo en la vía opuesta (5 / 15 / 20 / 25).
    grados: [
      { zeon: 50, int: 6, resistencia: 300, mantenimiento: 5 },
      { zeon: 120, int: 8, resistencia: 1000, mantenimiento: 15 },
      { zeon: 180, int: 10, resistencia: 1800, mantenimiento: 20 },
      { zeon: 250, int: 14, resistencia: 3000, mantenimiento: 25 },
    ],
  },
  {
    nombre: 'Armadura de Luz', via: 'luz', nivel: 16, accion: 'activa', tipos: ['efecto'], fuente: 'Core p.127',
    grados: [
      { zeon: 60, int: 6, taEnergia: 2, taResto: 1, mantenimiento: 5 },
      { zeon: 90, int: 9, taEnergia: 5, taResto: 2, mantenimiento: 10 },
      { zeon: 120, int: 12, taEnergia: 8, taResto: 4, mantenimiento: 15 },
      { zeon: 150, int: 15, taEnergia: 12, taResto: 6, mantenimiento: 20 },
    ],
  },
  {
    nombre: 'Descarga de Luz', via: 'luz', nivel: 22, accion: 'activa', tipos: ['ataque'], ta: 'ENE', fuente: 'Core p.127',
    grados: [
      { zeon: 50, int: 6, dano: 60 },
      { zeon: 90, int: 9, dano: 90 },
      { zeon: 120, int: 12, dano: 120 },
      { zeon: 150, int: 15, dano: 150 },
    ],
  },
  {
    nombre: 'Bola de Fuego', via: 'fuego', nivel: 16, accion: 'activa', tipos: ['ataque'], ta: 'CAL', fuente: 'Core p.157',
    grados: [
      { zeon: 50, int: 6, dano: 50, area: 5 },
      { zeon: 100, int: 9, dano: 100, area: 25 },
      { zeon: 160, int: 12, dano: 140, area: 80 },
      { zeon: 250, int: 15, dano: 160, area: 150 },
    ],
  },
  {
    nombre: 'Descarga de Calor', via: 'fuego', nivel: 30, accion: 'activa', tipos: ['ataque'], ta: 'CAL', fuente: 'Core p.157',
    grados: [
      { zeon: 60, int: 6, dano: 50 },
      { zeon: 90, int: 9, dano: 70 },
      { zeon: 120, int: 12, dano: 90 },
      { zeon: 150, int: 15, dano: 110 },
    ],
  },
];

/** Los conjuros del catálogo que conoce: los de sus vías hasta su nivel y los libres que eligió. */
export function conjurosDe(m: MagiaFicha): Conjuro[] {
  const vias = new Map(Object.entries(m.vias).map(([v, n]) => [normalizarRasgo(v), n]));
  const libres = new Set((m.libres ?? []).map(normalizarRasgo));
  return CATALOGO.filter((c) => (vias.get(c.via) ?? 0) >= c.nivel || libres.has(normalizarRasgo(c.nombre)));
}

/** Grados que puede usar por su Inteligencia (Core p.121). */
export function gradosPosibles(c: Conjuro, inteligencia: number): number[] {
  const res: number[] = [];
  c.grados.forEach((g, i) => { if (g.int <= inteligencia) res.push(i); });
  return res;
}
