import type { Equipo, Ficha, OpcionesEscenario } from './modelo';
import { crearRng } from './rng';
import { simularCombate } from './combate';

export interface ResumenLuchador {
  nombre: string;
  equipo: Equipo;
  supervivencia: number;
  /** Fracción de combates en que huyó (opción de escenario "huida"). */
  huida: number;
  danoCausado: number;
  danoRecibido: number;
  bajas: number;
  criticos: number;
  asaltoCaidaMedio: number | null;
  ataquesPorCombate: number;
  contrasPorCombate: number;
  cansancioPorCombate: number;
  defensaTotalPorCombate: number;
  /** Veces por combate que usó cada maniobra (sin contar los ataques normales). */
  maniobras: Record<string, number>;
}

export interface ResultadoMonteCarlo {
  combates: number;
  victoriasA: number;
  victoriasB: number;
  empates: number;
  asaltosMedio: number;
  luchadores: ResumenLuchador[];
  milisegundos: number;
}

export function monteCarlo(
  equipoA: Ficha[], equipoB: Ficha[], combates: number,
  o: { semilla?: number; distanciaInicial?: number; escenario?: OpcionesEscenario } = {},
): ResultadoMonteCarlo {
  const inicio = performance.now();
  const rng = crearRng(o.semilla ?? 1);
  let victoriasA = 0, victoriasB = 0, empates = 0, asaltos = 0;
  const acum = [...equipoA, ...equipoB].map((f, i) => ({
    nombre: f.nombre, equipo: (i < equipoA.length ? 'A' : 'B') as Equipo,
    vivo: 0, huyo: 0, causado: 0, recibido: 0, bajas: 0, criticos: 0, caidas: 0, sumaCaida: 0,
    ataques: 0, contras: 0, cansancio: 0, defensaTotal: 0, maniobras: {} as Record<string, number>,
  }));

  for (let i = 0; i < combates; i++) {
    const r = simularCombate(equipoA, equipoB, { rng, distanciaInicial: o.distanciaInicial, escenario: o.escenario });
    if (r.ganador === 'A') victoriasA++;
    else if (r.ganador === 'B') victoriasB++;
    else empates++;
    asaltos += r.asaltos;
    r.luchadores.forEach((l, j) => {
      const a = acum[j];
      if (l.estado === 'activo') a.vivo++;
      if (l.estado === 'huido') a.huyo++;
      a.causado += l.stats.danoCausado;
      a.recibido += l.stats.danoRecibido;
      a.bajas += l.stats.bajas;
      a.criticos += l.stats.criticosCausados;
      a.ataques += l.stats.ataquesHechos;
      a.contras += l.stats.contrasHechas;
      a.cansancio += l.stats.cansancioGastado;
      a.defensaTotal += l.stats.asaltosDefensaTotal;
      for (const [m, n] of Object.entries(l.stats.maniobras)) if (m !== 'normal') a.maniobras[m] = (a.maniobras[m] ?? 0) + (n ?? 0);
      if (l.stats.asaltoCaida !== null) {
        a.caidas++;
        a.sumaCaida += l.stats.asaltoCaida;
      }
    });
  }

  return {
    combates, victoriasA, victoriasB, empates,
    asaltosMedio: asaltos / combates,
    milisegundos: performance.now() - inicio,
    luchadores: acum.map((a) => ({
      nombre: a.nombre, equipo: a.equipo,
      supervivencia: a.vivo / combates,
      huida: a.huyo / combates,
      danoCausado: a.causado / combates,
      danoRecibido: a.recibido / combates,
      bajas: a.bajas / combates,
      criticos: a.criticos / combates,
      asaltoCaidaMedio: a.caidas ? a.sumaCaida / a.caidas : null,
      ataquesPorCombate: a.ataques / combates,
      contrasPorCombate: a.contras / combates,
      cansancioPorCombate: a.cansancio / combates,
      defensaTotalPorCombate: a.defensaTotal / combates,
      maniobras: Object.fromEntries(Object.entries(a.maniobras).map(([m, n]) => [m, n / combates])),
    })),
  };
}
