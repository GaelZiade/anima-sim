// Cómo se corta un Monte Carlo en tandas independientes, para repartirlas entre hilos. Lo usan la
// página (web/paralelo.ts) y el CLI: con la misma semilla dan el mismo resultado, con uno o con
// muchos hilos, porque cada tanda tiene su propia semilla.

export const COMBATES_POR_TANDA = 250;

export interface Tanda {
  indice: number;
  combates: number;
  semilla: number;
}

export function tandas(combates: number, semilla: number): Tanda[] {
  const n = Math.ceil(combates / COMBATES_POR_TANDA);
  return Array.from({ length: n }, (_, i) => ({
    indice: i,
    combates: Math.min(COMBATES_POR_TANDA, combates - i * COMBATES_POR_TANDA),
    // Una semilla distinta por tanda, derivada de la de la corrida.
    semilla: (Math.imul(semilla, 0x9e3779b1) + i) >>> 0,
  }));
}
