import { dado, type Rng } from './rng';

export interface TiradaD100 {
  /** Lo que se suma a la habilidad. En una pifia es el dado natural (1-3). */
  valor: number;
  natural: number;
  abiertas: number;
  pifia: boolean;
  nivelPifia: number;
  /** Cada dado de una tirada abierta, en orden. Sólo existe si abrió (para no crear arrays de más). */
  dados?: number[];
}

/**
 * D100 con Tirada Abierta y Pifia (Core p.10).
 * Abierta con 90+; la segunda consecutiva pide 91+, la tercera 92+… Un 100 siempre abre.
 * Pifia con 1-3 en la primera tirada (con maestría, 1-2). El nivel de pifia es un d100 sin abierta.
 */
export function tirarD100(rng: Rng, maestria = false): TiradaD100 {
  const natural = dado(rng, 100);
  if (natural <= (maestria ? 2 : 3)) {
    return { valor: natural, natural, abiertas: 0, pifia: true, nivelPifia: dado(rng, 100) };
  }
  let total = natural;
  let ultimo = natural;
  let umbral = 90;
  let abiertas = 0;
  let dados: number[] | undefined;
  while (ultimo >= umbral || ultimo === 100) {
    abiertas++;
    umbral++;
    ultimo = dado(rng, 100);
    total += ultimo;
    (dados ??= [natural]).push(ultimo);
  }
  return { valor: total, natural, abiertas, pifia: false, nivelPifia: 0, dados };
}

/**
 * Habilidad + tirada, para el registro: "170+47", "170+200 (abierta: 95+93+12)",
 * "150−35 (pifia: 2, nivel 37)". `valor` es lo que se suma (en una pifia de defensa, natural − nivel).
 */
export function textoTirada(habilidad: number, t: TiradaD100, valor = t.valor): string {
  const suma = `${habilidad}${valor < 0 ? `−${-valor}` : `+${valor}`}`;
  if (t.pifia) return `${suma} (pifia: ${t.natural}, nivel ${t.nivelPifia})`;
  if (t.dados) return `${suma} (${t.abiertas > 1 ? `abierta ×${t.abiertas}` : 'abierta'}: ${t.dados.join('+')})`;
  return suma;
}

/** D100 sin abierta ni pifia (nivel de crítico, resistencias, nivel de pifia). */
export function tirarD100Cerrada(rng: Rng): number {
  return dado(rng, 100);
}
