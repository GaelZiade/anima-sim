// Catálogo de conjuros que el simulador sabe usar en combate (Core cap. 11 y Libros de magia). Los
// números de cada grado salen del grimorio (grimorio.ts, generado desde la planilla); acá va, caso por
// caso, lo que hace cada uno en combate (COMPORTAMIENTO) y lo que el grimorio no trae o el manual
// corrige. Nunca el texto del manual.

import type { MagiaFicha } from './modelo';
import type { TipoAtaque } from './reglas';
import { normalizarRasgo } from './rasgos';
import { GRIMORIO } from './grimorio';

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

/** Un conjuro del grimorio: sus números por grado, tal como los trae la planilla. */
export interface EntradaGrimorio {
  nombre: string;
  /** Vía o sub-vía sin acentos ("fuego", "guerra"), o "libre acceso". */
  via: string;
  nivel: number;
  /** Mantenimiento diario en vez de por asalto. */
  diario: boolean;
  tipos: string[];
  accion: 'activa' | 'pasiva';
  /** Zeon, Inteligencia, mantenimiento y lo que se pudo leer del efecto (daño, radio, RM, RF, RP…). */
  grados: readonly Readonly<Record<string, number>>[];
}

export interface Conjuro {
  nombre: string;
  /** Vía o sub-vía (sin acentos), o "libre acceso". */
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
  efecto?: EfectoConjuro;
  /** Sobre quién cae un conjuro de efecto: un aliado (o él) o todos los aliados del radio. */
  blanco?: 'aliado' | 'aliados';
  /** Base, intermedio, avanzado, arcano. */
  grados: readonly [Grado, Grado, Grado, Grado];
  /** Página del manual. */
  fuente: string;
}

/**
 * Lo que hace cada conjuro en combate. `centro` dice dónde va el radio que trae el grimorio: alrededor
 * del lanzador (`radio`) o del objetivo (`area`). `grados` y `todos` agregan lo que el grimorio no lee
 * o corrigen donde manda el manual.
 */
interface Comportamiento extends Omit<Conjuro, 'grados' | 'via' | 'nivel' | 'tipos' | 'accion'> {
  tipos?: TipoConjuro[];
  accion?: 'activa' | 'pasiva';
  centro?: 'lanzador' | 'objetivo';
  todos?: Partial<Grado>;
  grados?: readonly Partial<Grado>[];
}

const COMPORTAMIENTO: readonly Comportamiento[] = [
  // Luz (Core p.126-127)
  { nombre: 'Flash Cegador', tipos: ['automatico'], efecto: 'flash', centro: 'lanzador', fuente: 'Core p.126' },
  { nombre: 'Escudo de Luz', escudoSoloSobrenatural: true, escudoDobleContra: 'oscuridad', fuente: 'Core p.126' },
  { nombre: 'Armadura de Luz', fuente: 'Core p.127' },
  { nombre: 'Descarga de Luz', ta: 'ENE', fuente: 'Core p.127' },
  // Fuego (Core p.157-159)
  { nombre: 'Bola de Fuego', ta: 'CAL', centro: 'objetivo', fuente: 'Core p.157' },
  { nombre: 'Descarga de Calor', ta: 'CAL', fuente: 'Core p.157' },
  {
    nombre: 'Arma Ígnea', efecto: 'bendicion', blanco: 'aliado', fuente: 'Core p.157',
    grados: [10, 20, 30, 40].map((n) => ({ bono: { tipoArma: 'CAL', danoArma: n } })),
  },
  { nombre: 'Aumentar el Crítico', efecto: 'aumentarCritico', fuente: 'Core p.157' },
  { nombre: 'Secar', tipos: ['efecto', 'animico'], efecto: 'secar', centro: 'objetivo', fuente: 'Core p.158' },
  {
    // El grimorio dice Int. 12 en avanzado; el manual, 13.
    nombre: 'Cuerpo a Fuego', efecto: 'bendicion', blanco: 'aliado', fuente: 'Core p.158',
    grados: [
      { bono: { cuerpoFuego: true } },
      { bono: { cuerpoFuego: true, resCalor: 30 } },
      { bono: { cuerpoFuego: true, resCalor: 30 }, int: 13 },
      { bono: { cuerpoFuego: true, resCalor: 30 } },
    ],
  },
  {
    // Su mantenimiento no dice qué mantiene: no se mantiene (interpretación confirmada). Int. 14 en
    // avanzado según el manual (el grimorio dice 12).
    nombre: 'Incinerar', efecto: 'incinerar', centro: 'lanzador', fuente: 'Core p.158',
    grados: [{ llamas: 100, mantenimiento: undefined }, { llamas: 120, mantenimiento: undefined }, { llamas: 140, int: 14, mantenimiento: undefined }, { llamas: 160, mantenimiento: undefined }],
  },
  {
    // Int. 12 en avanzado según el manual (el grimorio dice 14).
    nombre: 'Consumir Esencia', efecto: 'consumirEsencia', centro: 'lanzador', fuente: 'Core p.158',
    grados: [{}, {}, { int: 12 }, {}],
  },
  { nombre: 'Crítico Directo', efecto: 'criticoDirecto', fuente: 'Core p.159' },
  {
    nombre: 'Tormenta de Fuego', efecto: 'tormenta', ta: 'CAL', centro: 'objetivo', fuente: 'Core p.159',
    todos: { dano: 100 }, grados: [180, 240, 280, 320].map((habilidad) => ({ habilidad })),
  },
  // Sub-vía de Guerra (Arcana p.34-35)
  { nombre: 'Ira Ancestral', efecto: 'bendicion', blanco: 'aliados', centro: 'lanzador', todos: { bono: { ataque: 10, ira: true } }, fuente: 'Arcana p.35' },
  {
    nombre: 'Velocidad en la Batalla', efecto: 'bendicion', blanco: 'aliados', centro: 'lanzador', fuente: 'Arcana p.35',
    grados: [10, 10, 20, 20].map((turno) => ({ bono: { turno } })),
  },
  {
    nombre: 'Destrucción Desencadenada', efecto: 'bendicion', blanco: 'aliados', centro: 'lanzador', fuente: 'Arcana p.35',
    grados: [20, 20, 30, 40].map((dano) => ({ bono: { dano } })),
  },
  {
    nombre: 'Protección Final', efecto: 'bendicion', blanco: 'aliados', centro: 'lanzador', fuente: 'Arcana p.35',
    grados: [[10, 1], [10, 2], [20, 2], [30, 3]].map(([resistencias, ta]) => ({ bono: { resistencias, ta } })),
  },
  {
    nombre: 'Campeón', efecto: 'bendicion', blanco: 'aliado', fuente: 'Arcana p.35',
    grados: [[10, 10, 10, 2], [10, 20, 20, 3], [20, 20, 20, 4], [30, 30, 30, 5]].map(([toda, dano, turno, ta]) => ({ bono: { toda, dano, turno, ta } })),
  },
  // Libre acceso (Core p.187)
  { nombre: 'Curar Heridas', efecto: 'curar', blanco: 'aliado', fuente: 'Core p.187' },
];

const clave = (nombre: string) => normalizarRasgo(nombre);
const porNombre = new Map(GRIMORIO.map((e) => [clave(e.nombre), e]));

/** El grado de un conjuro: los números del grimorio, en los campos que usa el motor, más su comportamiento. */
function gradoDe(e: Readonly<Record<string, number>>, b: Comportamiento, i: number): Grado {
  const g: Grado = { zeon: e.zeon, int: e.int };
  if (e.mantenimiento) g.mantenimiento = e.mantenimiento;
  for (const k of ['dano', 'resistencia', 'taEnergia', 'taResto', 'rm', 'rf', 'critico'] as const) if (e[k] !== undefined) g[k] = e[k];
  if (e.pv !== undefined) g.curar = e.pv;
  if (e.radio !== undefined && b.centro) g[b.centro === 'lanzador' ? 'radio' : 'area'] = e.radio;
  Object.assign(g, b.todos, b.grados?.[i]);
  for (const k of Object.keys(g) as (keyof Grado)[]) if (g[k] === undefined) delete g[k];
  return g;
}

/** Los conjuros que el simulador sabe usar en combate, con los números del grimorio. */
export const CATALOGO: readonly Conjuro[] = COMPORTAMIENTO.map((b) => {
  const e = porNombre.get(clave(b.nombre));
  if (!e) throw new Error(`${b.nombre} no está en el grimorio`);
  const { centro: _c, todos: _t, grados: _g, ...resto } = b;
  return {
    ...resto, via: e.via, nivel: e.nivel, accion: b.accion ?? e.accion, tipos: b.tipos ?? (e.tipos as TipoConjuro[]),
    grados: e.grados.map((x, i) => gradoDe(x, b, i)) as unknown as Conjuro['grados'],
  };
});

/**
 * Los conjuros del grimorio que conoce: los de sus vías hasta su nivel, los de la sub-vía que eligió
 * para cada una (hasta el nivel de esa vía, Arcana p.32) y los que eligió por nombre: de libre acceso
 * o seleccionados de cualquier vía (Core p.120).
 */
export function conocidos(m: MagiaFicha): EntradaGrimorio[] {
  const nivel = new Map<string, number>();
  for (const [v, n] of Object.entries(m.vias)) nivel.set(normalizarRasgo(v), n);
  for (const [v, sv] of Object.entries(m.subvias ?? {})) nivel.set(normalizarRasgo(sv), m.vias[v] ?? 0);
  const libres = new Set((m.libres ?? []).map(clave));
  return GRIMORIO.filter((e) =>
    libres.has(clave(e.nombre)) || (e.via !== 'libre acceso' && (nivel.get(e.via) ?? 0) >= e.nivel));
}

/** Los conjuros que conoce y el simulador sabe usar en combate. */
export function conjurosDe(m: MagiaFicha): Conjuro[] {
  const sabe = new Set(conocidos(m).map((e) => clave(e.nombre)));
  return CATALOGO.filter((c) => sabe.has(clave(c.nombre)));
}

/** Los que conoce pero el simulador todavía no usa (falta catalogar qué hacen en combate). */
export function sinSimular(m: MagiaFicha): EntradaGrimorio[] {
  const simula = new Set(CATALOGO.map((c) => clave(c.nombre)));
  return conocidos(m).filter((e) => !simula.has(clave(e.nombre)));
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
