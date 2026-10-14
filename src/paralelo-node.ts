// Monte Carlo en varios hilos para Node (CLI, scripts). Mismo corte en tandas que la página
// (motor/tandas.ts): con la misma semilla, el resultado es el mismo con cualquier cantidad de hilos.

import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import type { Ficha, OpcionesEscenario } from './motor/modelo';
import { combinar, monteCarlo, type ResultadoMonteCarlo } from './motor/montecarlo';
import { tandas, type Tanda } from './motor/tandas';

export interface EscenarioMC {
  equipoA: Ficha[];
  equipoB: Ficha[];
  distanciaInicial?: number;
  escenario?: OpcionesEscenario;
}

const CARGAR_CON_TSX = `(async () => {
  const { workerData } = require('node:worker_threads');
  const { tsImport } = await import('tsx/esm/api');
  await tsImport(workerData.archivo, workerData.archivo);
})().catch((e) => { console.error(e); process.exit(1); });`;

function correrTanda(e: EscenarioMC, t: Tanda): ResultadoMonteCarlo {
  return monteCarlo(e.equipoA, e.equipoB, t.combates, { semilla: t.semilla, distanciaInicial: e.distanciaInicial, escenario: e.escenario });
}

// Dentro de un worker: corre las tandas que le pidan.
if (!isMainThread && workerData?.anima === 'monteCarlo') {
  const e = workerData.escenario as EscenarioMC;
  parentPort!.on('message', (t: Tanda) => parentPort!.postMessage({ indice: t.indice, resultado: correrTanda(e, t) }));
}

export async function monteCarloParalelo(
  e: EscenarioMC, combates: number, o: { semilla?: number; hilos?: number } = {},
): Promise<ResultadoMonteCarlo> {
  const inicio = performance.now();
  const lista = tandas(combates, o.semilla ?? 1);
  const hilos = Math.max(1, Math.min(o.hilos ?? availableParallelism(), lista.length));
  const partes: ResultadoMonteCarlo[] = new Array(lista.length);
  if (hilos === 1) {
    for (const t of lista) partes[t.indice] = correrTanda(e, t);
  } else {
    let siguiente = 0;
    await Promise.all(Array.from({ length: hilos }, () => new Promise<void>((resolver, rechazar) => {
      const datos = { anima: 'monteCarlo', escenario: e, archivo: import.meta.url };
      // El worker carga este mismo módulo. Sin empaquetar (tsx) lo importa con la API de tsx: su
      // cargador no se activa solo dentro de los hilos.
      const w = import.meta.url.endsWith('.ts')
        ? new Worker(CARGAR_CON_TSX, { eval: true, workerData: datos })
        : new Worker(new URL(import.meta.url), { workerData: datos });
      const pedir = () => {
        if (siguiente >= lista.length) {
          void w.terminate();
          resolver();
        } else w.postMessage(lista[siguiente++]);
      };
      w.on('message', (m: { indice: number; resultado: ResultadoMonteCarlo }) => {
        partes[m.indice] = m.resultado;
        pedir();
      });
      w.on('error', rechazar);
      pedir();
    })));
  }
  return { ...combinar(partes), milisegundos: performance.now() - inicio };
}
