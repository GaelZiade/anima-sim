// Worker de Monte Carlo: recibe el escenario una vez y después corre las tandas que le pidan.
// Cada tanda tiene su propia semilla, así el resultado no depende de qué worker la corrió.

import type { Ficha, OpcionesEscenario } from '../src/motor/modelo';
import { monteCarlo, type ResultadoMonteCarlo } from '../src/motor/montecarlo';

export interface Preparar {
  tipo: 'preparar';
  equipoA: Ficha[];
  equipoB: Ficha[];
  distanciaInicial?: number;
  escenario?: OpcionesEscenario;
}

export interface Tanda {
  tipo: 'tanda';
  indice: number;
  combates: number;
  semilla: number;
}

export interface TandaHecha {
  tipo: 'tanda';
  indice: number;
  resultado: ResultadoMonteCarlo;
}

export interface Fallo {
  tipo: 'error';
  mensaje: string;
}

const ambito = self as unknown as {
  onmessage: (e: MessageEvent<Preparar | Tanda>) => void;
  postMessage: (m: TandaHecha | Fallo) => void;
};

let escenario: Preparar | null = null;

ambito.onmessage = (e) => {
  const m = e.data;
  if (m.tipo === 'preparar') {
    escenario = m;
    return;
  }
  try {
    const { equipoA, equipoB, distanciaInicial, escenario: opciones } = escenario!;
    const resultado = monteCarlo(equipoA, equipoB, m.combates, { semilla: m.semilla, distanciaInicial, escenario: opciones });
    ambito.postMessage({ tipo: 'tanda', indice: m.indice, resultado });
  } catch (error) {
    ambito.postMessage({ tipo: 'error', mensaje: error instanceof Error ? error.message : String(error) });
  }
};
