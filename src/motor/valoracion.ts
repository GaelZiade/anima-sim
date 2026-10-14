// Piezas de valoración que comparte la IA: lo que se espera de un crítico ya producido.
// Exacto respecto de las reglas del motor (combate.ts, `critico`), sin tirar dados.

import { nivelCritico, type Localizacion } from './reglas';

export interface EfectoCritico {
  /** P(queda fuera de combate: inconsciente o muerto). */
  pFuera: number;
  /** P(falla la RF y sigue en pie: sólo negativos). */
  pNegativo: number;
  /** Negativo medio a toda acción cuando falla y sigue en pie. */
  negativo: number;
}

/**
 * Fracción de cada tramo de fracaso que deja fuera de combate, según dónde pega (Tabla 51 y
 * `critico`): ≤50, 51-100, 101-150, >150. Con localización al azar, cabeza es 91-100 (10%) y
 * corazón 49-50 (2%): cabeza deja inconsciente pasado 50, cabeza o corazón matan pasado 100.
 */
function fueraPorTramo(loc: Localizacion | null, inconsciencia: boolean, sinMuerte: boolean): [number, number, number, number] {
  if (inconsciencia || loc === 'cabeza') return [0, 1, 1, 1];
  if (loc === 'corazon') return sinMuerte ? [0, 0, 0, 1] : [0, 0, 1, 1];
  if (loc === 'extremidad' || loc === 'torso') return [0, 0, 0, 1];
  return [0, 0.1, sinMuerte ? 0.1 : 0.12, 1];
}

/**
 * Crítico de nivel `base` + d100 (reducido sobre 200; a la mitad con acumulación) contra RF + d100.
 * Un 100 natural en la RF siempre resiste. `loc` null: localización al azar.
 */
export function efectoCritico(
  base: number, rf: number, loc: Localizacion | null,
  o: { inconsciencia?: boolean; sinMuerte?: boolean; acumulacion?: boolean } = {},
): EfectoCritico {
  const fuera = fueraPorTramo(loc, !!o.inconsciencia, !!o.sinMuerte);
  const cortes = [0, 50, 100, 150, Infinity];
  let pFuera = 0, pNegativo = 0, sumaNegativo = 0;
  for (let x = 1; x <= 100; x++) {
    const c = nivelCritico(base, x, !!o.acumulacion) - rf;
    // Fracaso = c − Y con Y en 1..99 (el 100 resiste). Por tramo (lo, hi]: Y en [c − hi, c − lo − 1].
    for (let t = 0; t < 4; t++) {
      const desde = Math.max(1, cortes[t + 1] === Infinity ? 1 : c - cortes[t + 1]);
      const hasta = Math.min(99, c - cortes[t] - 1);
      if (hasta < desde) continue;
      const n = hasta - desde + 1;
      const suma = n * c - ((desde + hasta) * n) / 2;
      pFuera += (n / 100) * fuera[t];
      pNegativo += (n / 100) * (1 - fuera[t]);
      sumaNegativo += (suma / 100) * (1 - fuera[t]);
    }
  }
  return { pFuera: pFuera / 100, pNegativo: pNegativo / 100, negativo: pNegativo > 0 ? sumaNegativo / pNegativo : 0 };
}
