// Registro de efectos de conjuro: cada efecto (conjuros.ts, EfectoConjuro) dice en un solo lugar cómo se
// resuelve en el motor y cuánto vale para la IA. Agregar un efecto es agregar su manejador al registro
// (efectos/index.ts); si falta, no compila.
//
// Los manejadores no importan el motor: lo que necesitan de él (resolver una defensa, perder PV, tirar
// una Resistencia…) les llega en `Motor`, que arma combate.ts. Así no hay dependencias circulares.

import type { Conjuro, Grado } from '../conjuros';
import type { TiradaD100 } from '../dados';
import type { Golpe, OpcionesCritico, ResultadoDefensa } from '../golpe';
import type { EstadoMagia, Mantenido } from '../magia';
import type { Maniobra } from '../maniobras';
import type { Contexto, Evento, Ficha, Luchador } from '../modelo';
import type { Resistencia } from '../reglas';

/** Lo que el motor le presta a los efectos. */
export interface Motor {
  /** Tirada de d100 abierta con ese umbral de pifia. */
  tirar(ctx: Contexto, umbral: number): TiradaD100;
  /** Si quedó fuera de combate por los PV, cae o muere. */
  verificarCaida(ctx: Contexto, atk: Luchador, def: Luchador): void;
  /** Le ofrece un contraataque con ese bono. */
  ofrecerContra(ctx: Contexto, def: Luchador, atk: Luchador, bono: number): void;
  log(ctx: Contexto, texto: string | (() => string), extra?: () => Omit<Evento, 'asalto' | 'texto'>): void;
  /** Resistencia contra una dificultad: si falla y por cuánto (Core p.13). */
  tirarResistencia(ctx: Contexto, l: Luchador, dificultad: number, que: string, cual: 'RM' | 'RF' | 'RM o RF', bono?: number): Resistencia;
  tirarRf(ctx: Contexto, l: Luchador, dificultad: number, que: string, extra?: number): Resistencia;
  perderPv(ctx: Contexto, atk: Luchador, def: Luchador, pv: number): void;
  huir(ctx: Contexto, l: Luchador): void;
  /** Queda fuera de combate: inconsciente o muerto. */
  caer(ctx: Contexto, atk: Luchador, def: Luchador, estado: Luchador['estado']): void;
  /** Lo suelta de una presa. */
  soltar(l: Luchador): void;
  desarmar(ctx: Contexto, l: Luchador, por: Luchador): void;
  critico(ctx: Contexto, atk: Luchador, def: Luchador, dano: number, resistia: boolean, m: Maniobra, o?: OpcionesCritico): void;
  resolverDefensa(ctx: Contexto, atk: Luchador, def: Luchador, habAtk: number, tA: TiradaD100, o: Golpe, etiqueta: string): ResultadoDefensa;
  /** El combate ya tiene un ganador. */
  terminado(ctx: Contexto): boolean;
  cambiarFicha(l: Luchador, f: Ficha): void;
  /** Tabla 76 (Core p.236): lo prende con ese resultado. */
  prender(ctx: Contexto, atk: Luchador, l: Luchador, valor: number): void;
  /** Le baja 20 en la Tabla 76 por intensidad. */
  mitigarFuego(ctx: Contexto, l: Luchador, intensidades: number): void;
}

/** Lo que decide la IA al lanzar un conjuro. */
export type Lanzamiento = {
  conjuro: Conjuro;
  grado: number;
  objetivo: Luchador | null;
  /** Es el conjuro determinado que tenía preparado (ya pagado). */
  preparado?: boolean;
  /** Lanzado con la magia innata: no gasta zeon. */
  innato?: boolean;
  /** Hace estallar esta mina (no lanza nada). */
  detonar?: Mantenido;
  /** Beneficiados (conjuros de efecto) o designados (Incinerar). */
  blancos?: Luchador[];
  /** Usa Control del Espacio para dejar afuera a los suyos (+10 de zeon). */
  control?: boolean;
};

/** Un conjuro recién lanzado, sin pifia. */
export interface Lanzado {
  ctx: Contexto;
  l: Luchador;
  x: Lanzamiento;
  c: Conjuro;
  g: Grado;
  obj: Luchador | null;
  /** Para el registro: el conjuro con su grado ("Éxtasis (base) innato") y lo que costó en zeon. */
  nombre: string;
  zeon: string;
}

/** Un conjuro anímico que alcanzó (Core p.122): a quién afecta y con qué dificultad. */
export interface Animico {
  ctx: Contexto;
  atk: Luchador;
  def: Luchador;
  conjuro: Conjuro;
  g: Grado;
  /** Dificultad de la Resistencia, con Romper Resistencias. */
  rm: number;
  /** Cómo se nombra en el registro. */
  que: string;
  /** Los que quedan afectados (para deshacerlo al dejar de mantenerlo). */
  afectados?: Luchador[];
}

/** El conjuro al que conviene apuntar acumulando (ia-magia.ts). */
export interface Meta {
  conjuro: Conjuro;
  grado: number;
  /** Zeon que le falta para lanzarlo, ya con lo acumulado (o reunido, si es el preparado). */
  falta: number;
  porAsalto: number;
}

/** Lo que mira la IA al valorar un conjuro en un grado. */
export interface Valoracion {
  ctx: Contexto;
  l: Luchador;
  e: EstadoMagia;
  c: Conjuro;
  /** Índice del grado. */
  i: number;
  g: Grado;
  /** Alcance de sus conjuros (Recuadro X). */
  alcance: number;
  /** Lo que ya decidió lanzar este turno. */
  ya: readonly Lanzamiento[];
  /** Propone un uso: cuánto vale en PV y cuánto de eso es un costo aparte (Control del Espacio). */
  probar(x: Lanzamiento, valor: number, extra?: number): void;
  /** +1 contra un enemigo, −λ contra un aliado. */
  signo(b: Luchador): number;
  /** La meta de acumulación (para valorar lo que da ACT). */
  meta(): Meta | null;
}

export interface ManejadorEfecto {
  /** Cómo nombra el registro a quién beneficia: sus blancos o el objetivo. */
  sobre?: 'blancos' | 'objetivo';
  /** Se mantiene sobre los blancos elegidos (beneficios, zonas que iluminan): van a `lanzar`. */
  mantieneBlancos?: boolean;
  /** Da ACT o zeon: no es una meta de acumulación (se valora mirando la meta). */
  noEsMeta?: boolean;
  /**
   * Lo que hace al lanzarse. Sin esto, es un ataque o un anímico que se resuelve contra la defensa de
   * cada blanco (Core p.122), con los ganchos que siguen.
   */
  resolver?(m: Motor, x: Lanzado): void;
  /** Ataque: a quiénes alcanza (por defecto, el objetivo o los del área). */
  blancos?(x: Lanzado): Luchador[];
  /** Ataque: antes de resolverlo contra los blancos (Éxtasis a los aliados, que no se resisten). */
  antesDelAtaque?(m: Motor, x: Lanzado, afectados: Luchador[]): void;
  /** Ataque: con qué maniobra golpea (Lazos de Luz: Presa con su Fuerza). */
  golpe?(x: Lanzado, golpe: Golpe): Golpe;
  /** Ataque: después de resolverlo contra un blanco. */
  trasGolpe?(m: Motor, x: Lanzado, b: Luchador, afectados: Luchador[]): void;
  /** Al dejar de mantenerlo, lo que se deshace sobre cada afectado. */
  alTerminar?(m: Motor, l: Luchador, afectado: Luchador): void;
  /** Anímico: lo que hace al alcanzar (RM contra su dificultad, Core p.122). */
  alAlcanzar?(m: Motor, a: Animico): void;
  /** Cada asalto mientras se mantiene (al empezar el asalto). */
  cadaAsalto?(m: Motor, ctx: Contexto, l: Luchador, x: Mantenido): void;
  /** IA: los usos que propone, con su valor (`v.probar`). Sin esto, la IA no lo lanza por su cuenta. */
  valorar?(v: Valoracion): void;
}
