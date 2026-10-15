// Victorias en los enfrentamientos de referencia, para ver el efecto de un cambio de reglas o de IA.
//   npm run medir            → 500 combates por enfrentamiento
//   npm run medir -- 2000    → otra cantidad
// Con la misma semilla, el resultado es reproducible.

import { readFileSync, readdirSync } from 'node:fs';
import { hojaAFicha } from '../src/hoja/ficha';
import { simularCombate } from '../src/motor/combate';
import type { Ficha } from '../src/motor/modelo';
import { crearRng } from '../src/motor/rng';

const hoja = (p: string) => hojaAFicha(readFileSync(`fichas/${readdirSync('fichas').find((f) => f.startsWith(p))!}`));
const abel = Object.fromEntries((JSON.parse(readFileSync('ejemplos/arquetipos-abel.json', 'utf8')).fichas as Ficha[]).map((f) => [f.id, f]));
const copias = (f: Ficha, n: number) => Array.from({ length: n }, (_, i) => ({ ...f, id: `${f.id}-${i}`, nombre: `${f.nombre} ${i + 1}` }));
const [kaito, teseo, kiran, kael, stephan] = ['Kaito', 'Teseo', 'Ficha', 'Kael', 'St'].map(hoja);

const enfrentamientos: [string, Ficha[], Ficha[]][] = [
  ['Stéphan vs Teseo', [stephan], [teseo]],
  ['Stéphan vs Kaito', [stephan], [kaito]],
  ['Stéphan vs Kiran', [stephan], [kiran]],
  ['Stéphan vs 4 soldados', [stephan], copias(abel.soldado, 4)],
  ['Kaito vs Teseo', [kaito], [teseo]],
  ['Kael vs Teseo', [kael], [teseo]],
  ['Kiran vs 8 soldados', [kiran], copias(abel.soldado, 8)],
  ['Stéphan+Kael+Kaito vs Teseo+Kiran+4', [stephan, kael, kaito], [teseo, kiran, ...copias(abel.soldado, 4)]],
];

const n = Number(process.argv[2] ?? 500);
for (const [nombre, a, b] of enfrentamientos) {
  const rng = crearRng(2026);
  let gana = 0, asaltos = 0;
  for (let i = 0; i < n; i++) {
    const r = simularCombate(a, b, { rng, distanciaInicial: 10 });
    if (r.ganador === 'A') gana++;
    asaltos += r.asaltos;
  }
  console.log(`${nombre.padEnd(38)} gana A ${((100 * gana) / n).toFixed(1).padStart(5)}%   asaltos ${(asaltos / n).toFixed(1)}`);
}
