// Decisiones de la IA en casos donde la respuesta correcta es clara. Se comparan contra la misma
// pelea sin maniobras: si la IA elige bien, con maniobras gana igual o más.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hojaAFicha } from '../src/hoja/ficha';
import type { Ficha } from '../src/motor/modelo';
import { monteCarlo } from '../src/motor/montecarlo';

const FICHAS = fileURLToPath(new URL('../fichas', import.meta.url));
const ABEL = fileURLToPath(new URL('../ejemplos/arquetipos-abel.json', import.meta.url));
const hoja = (prefijo: string): Ficha | null => {
  if (!existsSync(FICHAS)) return null;
  const f = readdirSync(FICHAS).find((x) => x.startsWith(prefijo));
  return f ? hojaAFicha(readFileSync(`${FICHAS}/${f}`)) : null;
};
const abel = Object.fromEntries((JSON.parse(readFileSync(ABEL, 'utf8')).fichas as Ficha[]).map((f) => [f.id, f]));
const copias = (f: Ficha, n: number) => Array.from({ length: n }, (_, i) => ({ ...f, id: `${f.id}-${i}` }));
const kaito = hoja('Kaito');
const teseo = hoja('Teseo');
const isana = hoja('tao');

describe('decisiones de la IA', () => {
  it.skipIf(!kaito)('contra soldados que caen de dos golpes no busca inutilizar ni engatillar', () => {
    const r = monteCarlo([kaito!], copias(abel.elite, 5), 300, { semilla: 1, distanciaInicial: 10 });
    const m = r.luchadores[0].maniobras;
    expect((m.inutilizar ?? 0) + (m.engatillar ?? 0)).toBeLessThan(0.5);
    expect(r.victoriasA / r.combates).toBeGreaterThan(0.93);
  });

  it.skipIf(!teseo)('contra muchos usa el ataque en área y le rinde', () => {
    const o = { semilla: 2, distanciaInicial: 10 };
    const con = monteCarlo([teseo!], copias(abel.oficial, 10), 300, o);
    const sin = monteCarlo([teseo!], copias(abel.oficial, 10), 300, { ...o, escenario: { sinManiobras: true } });
    expect(con.luchadores[0].maniobras.area ?? 0).toBeGreaterThan(5);
    expect(con.victoriasA).toBeGreaterThan(sin.victoriasA * 3);
  });

  it.skipIf(!kaito || !isana)('no resiste el golpe cuando le sale más caro que perder el asalto', () => {
    // Contra Isana (4 ataques antes que él) resistir lo dejaba a −80 y perdía 4 de cada 5 duelos.
    const r = monteCarlo([isana!], [{ ...kaito!, id: 'kaito' }], 1500, { semilla: 3, distanciaInicial: 10 });
    expect(r.victoriasA / r.combates).toBeLessThan(0.62);
  });
});
