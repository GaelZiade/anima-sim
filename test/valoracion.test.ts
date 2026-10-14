// La valoración del crítico de la IA contra las reglas del motor, tirando dados de verdad.

import { describe, expect, it } from 'vitest';
import { efectoCritico } from '../src/motor/valoracion';
import { localizar, nivelCritico, type Localizacion } from '../src/motor/reglas';
import { crearRng, dado } from '../src/motor/rng';

/** Lo mismo que `critico` de combate.ts: nivel contra RF, localización y quién queda fuera. */
function empirico(base: number, rf: number, loc: Localizacion | null, inconsciencia: boolean, n: number) {
  const rng = crearRng(99);
  let fuera = 0, negativos = 0, suma = 0;
  for (let i = 0; i < n; i++) {
    const nivel = nivelCritico(base, dado(rng, 100), false);
    const dadoRf = dado(rng, 100);
    if (dadoRf === 100 || rf + dadoRf >= nivel) continue;
    const fallo = nivel - rf - dadoRf;
    const donde = loc ?? localizar(dado(rng, 100));
    const cae = inconsciencia
      ? fallo > 50
      : (fallo > 100 && (donde === 'cabeza' || donde === 'corazon')) || fallo > 150 || (fallo > 50 && donde === 'cabeza');
    if (cae) fuera++;
    else {
      negativos++;
      suma += fallo;
    }
  }
  return { pFuera: fuera / n, pNegativo: negativos / n, negativo: negativos ? suma / negativos : 0 };
}

describe('efecto esperado de un crítico', () => {
  const casos: [number, number, Localizacion | null, boolean][] = [
    [90, 35, null, false], [150, 60, null, false], [250, 80, null, false],
    [90, 35, 'extremidad', false], [120, 50, 'cabeza', false], [200, 70, 'corazon', false], [80, 40, 'cabeza', true],
  ];
  for (const [base, rf, loc, inc] of casos) {
    it(`daño ${base} contra RF ${rf} (${loc ?? 'al azar'}${inc ? ', inconsciencia' : ''})`, () => {
      const exacto = efectoCritico(base, rf, loc, { inconsciencia: inc });
      const e = empirico(base, rf, loc, inc, 400_000);
      expect(exacto.pFuera).toBeCloseTo(e.pFuera, 2);
      expect(exacto.pNegativo).toBeCloseTo(e.pNegativo, 2);
      expect(exacto.negativo).toBeCloseTo(e.negativo, 0);
    });
  }
});
