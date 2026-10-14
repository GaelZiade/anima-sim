// Benchmark de la simulación (un hilo) y huella de resultados.
//   npm run bench            → combates por segundo en cada escenario
//   npm run bench -- grupo   → sólo los escenarios que dicen "grupo"
//   npm run bench -- huella  → además, una huella de los resultados: con la misma semilla debe ser
//                              idéntica antes y después de una optimización.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { hojaAFicha } from '../src/hoja/ficha';
import { simularCombate } from '../src/motor/combate';
import type { Ficha } from '../src/motor/modelo';
import { crearRng } from '../src/motor/rng';

// Se corre desde la raíz del proyecto (npm run bench), empaquetado en node_modules/.cache.
const raiz = `${process.cwd()}/`;
const hoja = (p: string) => hojaAFicha(readFileSync(`${raiz}fichas/${readdirSync(`${raiz}fichas`).find((f) => f.startsWith(p))!}`));
const abel = Object.fromEntries((JSON.parse(readFileSync(`${raiz}ejemplos/arquetipos-abel.json`, 'utf8')).fichas as Ficha[]).map((f) => [f.id, f]));
const duelo = JSON.parse(readFileSync(`${raiz}ejemplos/duelo.json`, 'utf8'));
const copias = (f: Ficha, n: number) => Array.from({ length: n }, (_, i) => ({ ...f, id: `${f.id}-${i}`, nombre: `${f.nombre} ${i + 1}` }));
const [kaito, teseo, kiran, kael, isana] = ['Kaito', 'Teseo', 'Ficha', 'Kael', 'tao'].map(hoja);

const escenarios: [string, Ficha[], Ficha[], number][] = [
  ['duelo simple', duelo.equipoA, duelo.equipoB, 3000],
  ['Kaito vs Teseo', [kaito], [teseo], 1500],
  ['Kiran vs 8 soldados', [kiran], copias(abel.soldado, 8), 300],
  // Kael es el único con técnicas de Ki: mide lo que cuesta decidir con ellas (sin Ki va el doble de rápido).
  ['Kael vs Teseo', [kael], [teseo], 1000],
  ['Kael sin Ki vs Teseo', [{ ...kael, ki: undefined }], [teseo], 1000],
  ['grupo vs 22', [kaito, teseo, kiran, kael, isana], [...copias(abel.oficial, 2), ...copias(abel.elite, 6), ...copias(abel.soldado, 14)], 60],
];

const huella = process.argv.includes('huella');
// Con un argumento que no sea "huella", sólo los escenarios cuyo nombre lo contiene.
const filtro = process.argv.slice(2).find((x) => x !== 'huella');
for (const [nombre, a, b, n] of escenarios.filter(([x]) => !filtro || x.includes(filtro))) {
  const rng = crearRng(12345);
  const hash = createHash('sha1');
  const inicio = performance.now();
  // BENCH_X multiplica la cantidad de combates (para perfilar sin que pese la carga de las planillas).
  const total = n * Number(process.env.BENCH_X ?? 1);
  for (let i = 0; i < total; i++) {
    const r = simularCombate(a, b, { rng, distanciaInicial: 10 });
    if (huella) hash.update(`${r.ganador}${r.asaltos}${r.luchadores.map((l) => `${l.pv},${l.estado},${l.stats.ataquesHechos}`).join(';')}|`);
  }
  const ms = performance.now() - inicio;
  console.log(`${nombre.padEnd(22)} ${String(Math.round((total * 1000) / ms)).padStart(6)} combates/s${huella ? `  huella ${hash.digest('hex').slice(0, 12)}` : ''}`);
}
