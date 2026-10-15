// Benchmark de la simulación (un hilo) y huella de resultados.
//   npm run bench            → combates por segundo en cada escenario
//   npm run bench -- grupo   → sólo los escenarios que dicen "grupo"
//   npm run bench -- huella  → además, una huella de los resultados: con la misma semilla debe ser
//                              idéntica antes y después de una optimización o de un cambio de estructura.
// La huella tiene dos partes: la del resultado de cada combate y la del registro completo (cada línea
// narrada, con la foto de todos) de los primeros combates de cada escenario. La segunda ve cualquier
// cambio en lo que pasa, aunque no cambie quién gana.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { hojaAFicha } from '../src/hoja/ficha';
import { simularCombate } from '../src/motor/combate';
import type { Ficha, OpcionesEscenario } from '../src/motor/modelo';
import { crearRng } from '../src/motor/rng';

// Se corre desde la raíz del proyecto (npm run bench), empaquetado en node_modules/.cache.
const raiz = `${process.cwd()}/`;
const hoja = (p: string) => hojaAFicha(readFileSync(`${raiz}fichas/${readdirSync(`${raiz}fichas`).find((f) => f.startsWith(p))!}`));
const ejemplo = (f: string) => JSON.parse(readFileSync(`${raiz}ejemplos/${f}.json`, 'utf8'));
const porId = (f: string) => Object.fromEntries((ejemplo(f).fichas as Ficha[]).map((x) => [x.id, x]));
const abel = porId('arquetipos-abel');
const tiradores = porId('tiradores');
const duelo = ejemplo('duelo');
const estilos = ejemplo('estilos');
const copias = (f: Ficha, n: number) => Array.from({ length: n }, (_, i) => ({ ...f, id: `${f.id}-${i}`, nombre: `${f.nombre} ${i + 1}` }));
const [kaito, teseo, kiran, kael, isana, stephan] = ['Kaito', 'Teseo', 'Ficha', 'Kael', 'tao', 'St'].map(hoja);

// Reglas opcionales y condiciones raras juntas, para que la huella las cubra.
const revuelto: OpcionesEscenario = { cuerdas: 'soga', oscuridad: 'penumbra', disparosParalelos: true, rotura: true, huida: true, desequilibrio: true };

const escenarios: [string, Ficha[], Ficha[], number, OpcionesEscenario?][] = [
  ['duelo simple', duelo.equipoA, duelo.equipoB, 3000],
  ['Kaito vs Teseo', [kaito], [teseo], 1500],
  ['Kiran vs 8 soldados', [kiran], copias(abel.soldado, 8), 300],
  // Kael es el único con técnicas de Ki: mide lo que cuesta decidir con ellas (sin Ki va el doble de rápido).
  ['Kael vs Teseo', [kael], [teseo], 1000],
  ['Kael sin Ki vs Teseo', [{ ...kael, ki: undefined }], [teseo], 1000],
  // Stéphan es el único mago: cubre la magia (conjuros, zeon, mantenidos, bendiciones).
  ['Stéphan vs Teseo', [stephan], [teseo], 500],
  ['Stéphan vs 4 soldados', [stephan], copias(abel.soldado, 4), 200],
  ['estilos', estilos.equipoA, estilos.equipoB, 500],
  ['tiradores vs soldados', [tiradores.arquero, tiradores.ballestero, tiradores.arcabucero], copias(abel.soldado, 3), 500],
  ['revuelto', [stephan, kaito, kael], [teseo, kiran, ...copias(abel.elite, 2)], 100, revuelto],
  ['grupo vs 22', [kaito, teseo, kiran, kael, isana], [...copias(abel.oficial, 2), ...copias(abel.elite, 6), ...copias(abel.soldado, 14)], 60],
];

const huella = process.argv.includes('huella');
// Combates por escenario cuyo registro entra en la huella.
const CON_REGISTRO = 20;
// Con un argumento que no sea "huella", sólo los escenarios cuyo nombre lo contiene.
const filtro = process.argv.slice(2).find((x) => x !== 'huella');
for (const [nombre, a, b, n, escenario] of escenarios.filter(([x]) => !filtro || x.includes(filtro))) {
  const rng = crearRng(12345);
  const hash = createHash('sha1');
  const inicio = performance.now();
  // BENCH_X multiplica la cantidad de combates (para perfilar sin que pese la carga de las planillas).
  const total = n * Number(process.env.BENCH_X ?? 1);
  for (let i = 0; i < total; i++) {
    const r = simularCombate(a, b, { rng, distanciaInicial: 10, escenario });
    if (huella) hash.update(`${r.ganador}${r.asaltos}${r.luchadores.map((l) => `${l.pv},${l.estado},${l.stats.ataquesHechos}`).join(';')}|`);
  }
  const ms = performance.now() - inicio;
  let deRegistro = '';
  if (huella) {
    const h = createHash('sha1');
    const rngR = crearRng(777);
    for (let i = 0; i < CON_REGISTRO; i++) h.update(JSON.stringify(simularCombate(a, b, { rng: rngR, distanciaInicial: 10, escenario, registrar: true }).registro));
    deRegistro = ` registro ${h.digest('hex').slice(0, 12)}`;
  }
  console.log(`${nombre.padEnd(22)} ${String(Math.round((total * 1000) / ms)).padStart(6)} combates/s${huella ? `  huella ${hash.digest('hex').slice(0, 12)}${deRegistro}` : ''}`);
}
