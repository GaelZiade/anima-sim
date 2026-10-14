// Catálogo de conjuros que el simulador sabe usar en combate (Core cap. 11 y Libros de magia). Sólo
// los números de cada grado y una descripción corta propia: el texto está en el manual.

import type { MagiaFicha } from './modelo';
import type { TipoAtaque } from './reglas';
import { normalizarRasgo } from './rasgos';

export type TipoConjuro = 'ataque' | 'defensa' | 'efecto' | 'animico' | 'automatico' | 'deteccion';

/**
 * Lo que hace un conjuro que no es un ataque ni un escudo: cada uno se resuelve caso por caso, porque
 * no hay una forma genérica de manejarlos.
 */
export type EfectoConjuro =
  | 'flash' | 'secar' | 'consumirEsencia' | 'criticoDirecto' | 'incinerar' | 'tormenta' | 'aumentarCritico'
  | 'bendicion' | 'curar';

/** Beneficio que deja un conjuro sobre quien lo recibe (vías de Guerra, Fuego). */
export interface BonoMagico {
  ataque?: number;
  /** A toda acción (Campeón). */
  toda?: number;
  dano?: number;
  turno?: number;
  /** TA contra todo. */
  ta?: number;
  /** A todas las Resistencias. */
  resistencias?: number;
  /** Estado de Ira (Core p.232): pelea sin poder ponerse a la defensiva ni huir. */
  ira?: boolean;
  /** El arma ataca en esta TA como crítico primario (Arma Ígnea), con este bono al daño. */
  tipoArma?: TipoAtaque;
  danoArma?: number;
  /** Cuerpo de llamas: inmune a lo que no sea energía, frío o agua; quema al tocarlo. */
  cuerpoFuego?: boolean;
  /** Bono a las Resistencias contra el calor. */
  resCalor?: number;
}
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
  /** Anímicos y automáticos: Resistencia a superar (RM, RF, o cualquiera de las dos si trae ambas). */
  rm?: number;
  rf?: number;
  /** Radio alrededor del lanzador en metros (los que dicen "alrededor del brujo" o "en su presencia"). */
  radio?: number;
  /** Nivel de Crítico que provoca (Crítico Directo) o que suma (Aumentar el Crítico). */
  critico?: number;
  /** Bono a la tirada de la Tabla 76: En llamas (Incinerar). */
  llamas?: number;
  /** Habilidad final de un ataque automático (Tormenta de Fuego). */
  habilidad?: number;
  /** PV que cura. */
  curar?: number;
  /** Beneficio sobre los afectados. */
  bono?: BonoMagico;
}

export interface Conjuro {
  nombre: string;
  /** Vía (sin acentos), o "libre" para los de libre acceso. */
  via: string;
  /** Sub-vía (Arcana p.32): se conoce si es la elegida para esa vía y la vía llega a su nivel. */
  subvia?: string;
  nivel: number;
  /** Activo (en su turno) o pasivo (cuando haga falta, como un escudo, Core p.117). */
  accion: 'activa' | 'pasiva';
  tipos: TipoConjuro[];
  /** TA en la que ataca. */
  ta?: TipoAtaque;
  /** Escudo que sólo dañan los ataques sobrenaturales; los de este tipo le hacen el doble. */
  escudoSoloSobrenatural?: boolean;
  escudoDobleContra?: string;
  efecto?: EfectoConjuro;
  /** Sobre quién cae un conjuro de efecto: un aliado (o él) o todos los aliados del radio. */
  blanco?: 'aliado' | 'aliados';
  /** Base, intermedio, avanzado, arcano. */
  grados: readonly [Grado, Grado, Grado, Grado];
  /** Página del manual. */
  fuente: string;
}

/** Conjuros de combate por vía (Core p.126-159). */
export const CATALOGO: readonly Conjuro[] = [
  {
    nombre: 'Flash Cegador', via: 'luz', nivel: 8, accion: 'activa', tipos: ['automatico'], efecto: 'flash', fuente: 'Core p.126',
    grados: [
      { zeon: 50, int: 6, radio: 10, rf: 140 },
      { zeon: 100, int: 9, radio: 25, rf: 140 },
      { zeon: 150, int: 11, radio: 50, rf: 140 },
      { zeon: 200, int: 14, radio: 100, rf: 160 },
    ],
  },
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
  {
    // El nombre está cortado en la copia del manual (interpretación).
    nombre: 'Arma Ígnea', via: 'fuego', nivel: 26, accion: 'activa', tipos: ['efecto'], efecto: 'bendicion', blanco: 'aliado', fuente: 'Core p.157',
    grados: [
      { zeon: 50, int: 6, mantenimiento: 5, bono: { tipoArma: 'CAL', danoArma: 10 } },
      { zeon: 80, int: 9, mantenimiento: 10, bono: { tipoArma: 'CAL', danoArma: 20 } },
      { zeon: 100, int: 11, mantenimiento: 10, bono: { tipoArma: 'CAL', danoArma: 30 } },
      { zeon: 120, int: 14, mantenimiento: 15, bono: { tipoArma: 'CAL', danoArma: 40 } },
    ],
  },
  {
    nombre: 'Aumentar el Crítico', via: 'fuego', nivel: 42, accion: 'pasiva', tipos: ['efecto'], efecto: 'aumentarCritico', fuente: 'Core p.157',
    grados: [
      { zeon: 60, int: 6, critico: 20 },
      { zeon: 90, int: 9, critico: 40 },
      { zeon: 120, int: 12, critico: 60 },
      { zeon: 150, int: 15, critico: 80 },
    ],
  },
  {
    nombre: 'Secar', via: 'fuego', nivel: 46, accion: 'activa', tipos: ['efecto', 'animico'], efecto: 'secar', fuente: 'Core p.158',
    grados: [
      { zeon: 80, int: 8, area: 5, rm: 100, rf: 100 },
      { zeon: 120, int: 10, area: 15, rm: 120, rf: 120 },
      { zeon: 180, int: 12, area: 25, rm: 140, rf: 140 },
      { zeon: 240, int: 14, area: 35, rm: 160, rf: 160 },
    ],
  },
  {
    // El nombre está cortado en la copia del manual: se toma el de su espejo, Cuerpo a Luz (interpretación).
    nombre: 'Cuerpo a Fuego', via: 'fuego', nivel: 52, accion: 'activa', tipos: ['efecto'], efecto: 'bendicion', blanco: 'aliado', fuente: 'Core p.158',
    grados: [
      { zeon: 100, int: 8, mantenimiento: 10, bono: { cuerpoFuego: true } },
      { zeon: 120, int: 11, mantenimiento: 15, bono: { cuerpoFuego: true, resCalor: 30 } },
      { zeon: 140, int: 13, mantenimiento: 15, bono: { cuerpoFuego: true, resCalor: 30 } },
      { zeon: 160, int: 16, mantenimiento: 20, bono: { cuerpoFuego: true, resCalor: 30 } },
    ],
  },
  {
    nombre: 'Incinerar', via: 'fuego', nivel: 60, accion: 'activa', tipos: ['automatico'], efecto: 'incinerar', fuente: 'Core p.158',
    grados: [
      { zeon: 100, int: 10, rm: 140, llamas: 100, radio: 50 },
      { zeon: 150, int: 12, rm: 160, llamas: 120, radio: 100 },
      { zeon: 200, int: 14, rm: 180, llamas: 140, radio: 150 },
      { zeon: 260, int: 16, rm: 200, llamas: 160, radio: 200 },
    ],
  },
  {
    nombre: 'Consumir Esencia', via: 'fuego', nivel: 62, accion: 'activa', tipos: ['animico'], efecto: 'consumirEsencia', fuente: 'Core p.158',
    grados: [
      { zeon: 120, int: 6, radio: 10, rm: 120 },
      { zeon: 180, int: 9, radio: 25, rm: 160 },
      { zeon: 240, int: 12, radio: 50, rm: 200 },
      { zeon: 300, int: 15, radio: 150, rm: 220 },
    ],
  },
  {
    nombre: 'Crítico Directo', via: 'fuego', nivel: 70, accion: 'activa', tipos: ['animico'], efecto: 'criticoDirecto', fuente: 'Core p.159',
    grados: [
      { zeon: 100, int: 9, critico: 120, rm: 140 },
      { zeon: 140, int: 11, critico: 140, rm: 160 },
      { zeon: 200, int: 13, critico: 180, rm: 180 },
      { zeon: 280, int: 16, critico: 220, rm: 200 },
    ],
  },
  {
    nombre: 'Tormenta de Fuego', via: 'fuego', nivel: 76, accion: 'activa', tipos: ['automatico'], efecto: 'tormenta', ta: 'CAL', fuente: 'Core p.159',
    grados: [
      { zeon: 150, int: 8, area: 25, habilidad: 180, dano: 100, mantenimiento: 15 },
      { zeon: 200, int: 10, area: 150, habilidad: 240, dano: 100, mantenimiento: 20 },
      { zeon: 240, int: 12, area: 200, habilidad: 280, dano: 100, mantenimiento: 25 },
      { zeon: 280, int: 15, area: 250, habilidad: 320, dano: 100, mantenimiento: 30 },
    ],
  },
  // Sub-vía de Guerra (Arcana p.34-35): se vincula a Fuego, no a Luz.
  {
    nombre: 'Ira Ancestral', via: 'fuego', subvia: 'guerra', nivel: 14, accion: 'activa', tipos: ['efecto'], efecto: 'bendicion', blanco: 'aliados', fuente: 'Arcana p.35',
    grados: [
      { zeon: 40, int: 6, radio: 10, mantenimiento: 5, bono: { ataque: 10, ira: true } },
      { zeon: 70, int: 9, radio: 50, mantenimiento: 10, bono: { ataque: 10, ira: true } },
      { zeon: 100, int: 12, radio: 250, mantenimiento: 10, bono: { ataque: 10, ira: true } },
      { zeon: 130, int: 15, radio: 500, mantenimiento: 15, bono: { ataque: 10, ira: true } },
    ],
  },
  {
    nombre: 'Velocidad en la Batalla', via: 'fuego', subvia: 'guerra', nivel: 24, accion: 'activa', tipos: ['efecto'], efecto: 'bendicion', blanco: 'aliados', fuente: 'Arcana p.35',
    grados: [
      { zeon: 50, int: 6, radio: 10, mantenimiento: 5, bono: { turno: 10 } },
      { zeon: 90, int: 9, radio: 50, mantenimiento: 10, bono: { turno: 10 } },
      { zeon: 120, int: 12, radio: 250, mantenimiento: 15, bono: { turno: 20 } },
      { zeon: 150, int: 15, radio: 500, mantenimiento: 15, bono: { turno: 20 } },
    ],
  },
  {
    nombre: 'Destrucción Desencadenada', via: 'fuego', subvia: 'guerra', nivel: 34, accion: 'activa', tipos: ['efecto'], efecto: 'bendicion', blanco: 'aliados', fuente: 'Arcana p.35',
    // El mantenimiento falta en la copia del manual: se toma el de Protección Final, que cuesta lo
    // mismo (interpretación).
    grados: [
      { zeon: 80, int: 7, radio: 10, mantenimiento: 5, bono: { dano: 20 } },
      { zeon: 120, int: 9, radio: 50, mantenimiento: 15, bono: { dano: 20 } },
      { zeon: 160, int: 12, radio: 250, mantenimiento: 20, bono: { dano: 30 } },
      { zeon: 200, int: 15, radio: 500, mantenimiento: 20, bono: { dano: 40 } },
    ],
  },
  {
    nombre: 'Protección Final', via: 'fuego', subvia: 'guerra', nivel: 44, accion: 'activa', tipos: ['efecto'], efecto: 'bendicion', blanco: 'aliados', fuente: 'Arcana p.35',
    grados: [
      { zeon: 80, int: 7, radio: 10, mantenimiento: 5, bono: { resistencias: 10, ta: 1 } },
      { zeon: 120, int: 9, radio: 50, mantenimiento: 15, bono: { resistencias: 10, ta: 2 } },
      { zeon: 160, int: 12, radio: 250, mantenimiento: 20, bono: { resistencias: 20, ta: 2 } },
      { zeon: 200, int: 15, radio: 500, mantenimiento: 20, bono: { resistencias: 30, ta: 3 } },
    ],
  },
  {
    nombre: 'Campeón', via: 'fuego', subvia: 'guerra', nivel: 64, accion: 'activa', tipos: ['efecto'], efecto: 'bendicion', blanco: 'aliado', fuente: 'Arcana p.35',
    grados: [
      { zeon: 140, int: 10, mantenimiento: 15, bono: { toda: 10, dano: 10, turno: 10, ta: 2 } },
      { zeon: 180, int: 12, mantenimiento: 15, bono: { toda: 10, dano: 20, turno: 20, ta: 3 } },
      { zeon: 240, int: 14, mantenimiento: 20, bono: { toda: 20, dano: 20, turno: 20, ta: 4 } },
      { zeon: 350, int: 16, mantenimiento: 30, bono: { toda: 30, dano: 30, turno: 30, ta: 5 } },
    ],
  },
  // Libre acceso (Core p.187).
  {
    nombre: 'Curar Heridas', via: 'libre', nivel: 50, accion: 'activa', tipos: ['efecto'], efecto: 'curar', blanco: 'aliado', fuente: 'Core p.187',
    grados: [
      { zeon: 100, int: 8, curar: 40 },
      { zeon: 140, int: 10, curar: 80 },
      { zeon: 180, int: 13, curar: 160 },
      { zeon: 220, int: 16, curar: 320 },
    ],
  },
];

/**
 * Los conjuros del catálogo que conoce: los de sus vías hasta su nivel, los de la sub-vía que eligió
 * para cada una (Arcana p.32) y los libres que eligió.
 */
export function conjurosDe(m: MagiaFicha): Conjuro[] {
  const vias = new Map(Object.entries(m.vias).map(([v, n]) => [normalizarRasgo(v), n]));
  const subvias = new Map(Object.entries(m.subvias ?? {}).map(([v, s]) => [normalizarRasgo(v), normalizarRasgo(s)]));
  const libres = new Set((m.libres ?? []).map(normalizarRasgo));
  return CATALOGO.filter((c) => {
    if (libres.has(normalizarRasgo(c.nombre))) return true;
    if ((vias.get(c.via) ?? 0) < c.nivel) return false;
    return !c.subvia || subvias.get(c.via) === c.subvia;
  });
}

/**
 * Grados que puede usar por su Inteligencia (Core p.121). Conjuro Especialista suma +1 a la
 * Inteligencia para ese conjuro (Arcana p.30).
 */
export function gradosPosibles(c: Conjuro, inteligencia: number, m?: MagiaFicha): number[] {
  const int = inteligencia + (m?.especialista?.some((x) => normalizarRasgo(x) === normalizarRasgo(c.nombre)) ? 1 : 0);
  const res: number[] = [];
  c.grados.forEach((g, i) => { if (g.int <= int) res.push(i); });
  return res;
}
