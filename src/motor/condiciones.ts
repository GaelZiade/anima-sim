// Condiciones con duración: lo que le queda a un luchador por unos asaltos (o todo el combate) y se
// descuenta junto al terminar cada asalto. Un solo mecanismo para lo que provoquen conjuros, técnicas
// de Ki, maniobras o poderes psíquicos. El estado con que empieza (la planilla) está en `ficha.estados`.

import type { Luchador } from './modelo';

export type TipoCondicion = 'ceguera' | 'paralisis';

export interface Condicion {
  /** Intensidad: ceguera 1 parcial, 2 absoluta; parálisis 1 menor, 2 parcial, 3 completa (Core p.233). */
  nivel: number;
  /** Asaltos que le quedan (Infinity: todo el combate). */
  asaltos: number;
  /** Ceguera por un destello: el asalto previo a recuperar la vista, sólo parcial (Core p.233). */
  destello?: boolean;
}

/** La condición, si sigue activa. */
export function condicion(l: Luchador, tipo: TipoCondicion): Condicion | undefined {
  const c = l.condiciones[tipo];
  return c && c.asaltos > 0 ? c : undefined;
}

/** Su intensidad ahora (0 si no la tiene). */
export function nivelCondicion(l: Luchador, tipo: TipoCondicion): number {
  return condicion(l, tipo)?.nivel ?? 0;
}

/** Le pone (o reemplaza) una condición. Cómo se combina con la que ya tenía lo decide quien la impone. */
export function imponer(l: Luchador, tipo: TipoCondicion, c: Condicion) {
  l.condiciones[tipo] = c;
}

/** Al terminar el asalto: descuenta uno a cada condición y devuelve las que se terminaron. */
export function pasarAsalto(l: Luchador): TipoCondicion[] {
  const terminadas: TipoCondicion[] = [];
  for (const tipo of Object.keys(l.condiciones) as TipoCondicion[]) {
    const c = l.condiciones[tipo]!;
    if (c.asaltos > 0 && --c.asaltos === 0) {
      delete l.condiciones[tipo];
      terminadas.push(tipo);
    }
  }
  return terminadas;
}

const NOMBRE_NIVEL: Record<TipoCondicion, readonly string[]> = {
  ceguera: ['', 'ceguera parcial', 'ceguera absoluta'],
  paralisis: ['', 'parálisis menor', 'parálisis parcial', 'parálisis completa'],
};

/**
 * Lo que se ve de un luchador además de sus PV y su lugar, para mostrarlo (registro y página): una
 * etiqueta por estado. Un estado nuevo se muestra agregando una línea acá.
 */
const VISIBLES: readonly ((l: Luchador) => string | false | null | undefined)[] = [
  (l) => l.derribado && 'derribado',
  (l) => l.apresadoPor && 'apresado',
  (l) => l.apresando && 'apresando',
  (l) => (l.lazos || l.atadura > 0) && 'atado',
  (l) => l.desarmado && 'desarmado',
  (l) => l.amenazadoPor && 'engatillado',
  (l) => l.llamas > 0 && `en llamas (${l.llamas})`,
  (l) => l.fascinado > 0 && 'fascinado',
  (l) => l.ficha.estados?.miedo && 'miedo',
  (l) => l.ficha.estados?.dolor && l.ficha.estados.dolor !== 'leve' && (l.ficha.estados.dolor === 'extremo' ? 'dolor extremo' : 'dolor'),
  (l) => l.extasis && 'éxtasis',
];

export function estadoVisible(l: Luchador): string[] {
  const r: string[] = [];
  for (const f of VISIBLES) {
    const e = f(l);
    if (e) r.push(e);
  }
  for (const tipo of Object.keys(NOMBRE_NIVEL) as TipoCondicion[]) {
    // La parálisis de una presa (l.paralisis) y la inducida se muestran como una, la peor.
    const nivel = tipo === 'paralisis' ? Math.max(l.paralisis, nivelCondicion(l, tipo)) : nivelCondicion(l, tipo);
    if (nivel) r.push(NOMBRE_NIVEL[tipo][nivel]);
  }
  return r;
}
