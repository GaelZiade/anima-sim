// Reparte un Monte Carlo entre varios workers (uno por núcleo, como pide la fase 2 de DISENO.md).
// Los combates se cortan en tandas chicas: cada worker pide la siguiente al terminar la anterior,
// así ninguno queda ocioso aunque los combates tarden distinto.

import { combinar, type ResultadoMonteCarlo } from '../src/motor/montecarlo';
import { tandas as cortar } from '../src/motor/tandas';
import type { Preparar, Tanda, TandaHecha, Fallo } from './simulacion.worker';

export interface Corrida {
  /** Resultado final, con el tiempo real (no la suma de los workers). */
  resultado: Promise<ResultadoMonteCarlo>;
  cancelar(): void;
}

export function correrEnParalelo(
  escenario: Omit<Preparar, 'tipo'>,
  combates: number,
  o: { hilos: number; semilla: number; alAvanzar?: (hechos: number, parcial: ResultadoMonteCarlo) => void },
): Corrida {
  const inicio = performance.now();
  const lista = cortar(combates, o.semilla);
  const tandas = lista.length;
  // Las partes se guardan por índice de tanda: el resultado no depende del orden en que terminan.
  const partes: ResultadoMonteCarlo[] = new Array(tandas);
  const workers = Array.from({ length: Math.max(1, Math.min(o.hilos, tandas)) }, () =>
    new Worker(new URL('./simulacion.worker.ts', import.meta.url), { type: 'module' }));
  let siguiente = 0;
  let hechos = 0;
  let ultimoAviso = 0;
  let cancelar = () => {};

  const resultado = new Promise<ResultadoMonteCarlo>((resolver, rechazar) => {
    const terminar = () => workers.forEach((w) => w.terminate());
    cancelar = () => {
      terminar();
      rechazar(new Error('cancelado'));
    };
    const pedir = (w: Worker) => {
      if (siguiente >= tandas) return;
      const { indice, combates: n, semilla } = lista[siguiente++];
      const tanda: Tanda = { tipo: 'tanda', indice, combates: n, semilla };
      w.postMessage(tanda);
    };
    for (const w of workers) {
      w.onmessage = (e: MessageEvent<TandaHecha | Fallo>) => {
        if (e.data.tipo === 'error') {
          terminar();
          rechazar(new Error(e.data.mensaje));
          return;
        }
        partes[e.data.indice] = e.data.resultado;
        hechos += e.data.resultado.combates;
        if (hechos >= combates) {
          terminar();
          resolver({ ...combinar(partes), milisegundos: performance.now() - inicio });
          return;
        }
        pedir(w);
        // Avisar a lo sumo 5 veces por segundo: combinar recorre todas las tandas.
        const ahora = performance.now();
        if (o.alAvanzar && ahora - ultimoAviso > 200) {
          ultimoAviso = ahora;
          o.alAvanzar(hechos, combinar(partes.filter(Boolean)));
        }
      };
      w.onerror = (e) => {
        terminar();
        rechazar(new Error(e.message || 'Falló un worker'));
      };
      const preparar: Preparar = { tipo: 'preparar', ...escenario };
      w.postMessage(preparar);
      pedir(w);
    }
  });

  return { resultado, cancelar: () => cancelar() };
}
