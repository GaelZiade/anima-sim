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
  /** Fracción de combates en que cayó (para combinar `asaltoCaidaMedio`). */
  caidas: number;
  ataquesPorCombate: number;
  contrasPorCombate: number;
  cansancioPorCombate: number;
  defensaTotalPorCombate: number;
  /** Veces por combate que usó cada maniobra (sin contar los ataques normales). */
  maniobras: Record<string, number>;
  /** Veces por combate que ejecutó cada técnica de Ki. */
  tecnicas: Record<string, number>;
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
    ataques: 0, contras: 0, cansancio: 0, defensaTotal: 0, maniobras: {} as Record<string, number>, tecnicas: {} as Record<string, number>,
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
      for (const [k, n] of Object.entries(l.stats.tecnicas)) a.tecnicas[k] = (a.tecnicas[k] ?? 0) + (n ?? 0);
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
      caidas: a.caidas / combates,
      ataquesPorCombate: a.ataques / combates,
      contrasPorCombate: a.contras / combates,
      cansancioPorCombate: a.cansancio / combates,
      defensaTotalPorCombate: a.defensaTotal / combates,
      maniobras: Object.fromEntries(Object.entries(a.maniobras).map(([m, n]) => [m, n / combates])),
      tecnicas: Object.fromEntries(Object.entries(a.tecnicas).map(([m, n]) => [m, n / combates])),
    })),
  };
}

/** Junta resultados de tandas independientes (p. ej. una por worker) en uno solo. */
export function combinar(partes: ResultadoMonteCarlo[]): ResultadoMonteCarlo {
  const combates = partes.reduce((s, p) => s + p.combates, 0);
  /** Promedio de un valor por combate, pesado por la cantidad de combates de cada parte. */
  const media = (f: (p: ResultadoMonteCarlo) => number) => partes.reduce((s, p) => s + f(p) * p.combates, 0) / combates;
  return {
    combates,
    victoriasA: partes.reduce((s, p) => s + p.victoriasA, 0),
    victoriasB: partes.reduce((s, p) => s + p.victoriasB, 0),
    empates: partes.reduce((s, p) => s + p.empates, 0),
    asaltosMedio: media((p) => p.asaltosMedio),
    milisegundos: Math.max(...partes.map((p) => p.milisegundos)),
    luchadores: partes[0].luchadores.map((l0, j) => {
      const m = (f: (l: ResumenLuchador) => number) => media((p) => f(p.luchadores[j]));
      const caidas = m((l) => l.caidas);
      const maniobras: Record<string, number> = {};
      const tecnicas: Record<string, number> = {};
      for (const p of partes) {
        for (const [k, n] of Object.entries(p.luchadores[j].maniobras)) maniobras[k] = (maniobras[k] ?? 0) + (n * p.combates) / combates;
        for (const [k, n] of Object.entries(p.luchadores[j].tecnicas ?? {})) tecnicas[k] = (tecnicas[k] ?? 0) + (n * p.combates) / combates;
      }
      return {
        nombre: l0.nombre, equipo: l0.equipo,
        supervivencia: m((l) => l.supervivencia),
        huida: m((l) => l.huida),
        danoCausado: m((l) => l.danoCausado),
        danoRecibido: m((l) => l.danoRecibido),
        bajas: m((l) => l.bajas),
        criticos: m((l) => l.criticos),
        asaltoCaidaMedio: caidas ? m((l) => (l.asaltoCaidaMedio ?? 0) * l.caidas) / caidas : null,
        caidas,
        ataquesPorCombate: m((l) => l.ataquesPorCombate),
        contrasPorCombate: m((l) => l.contrasPorCombate),
        cansancioPorCombate: m((l) => l.cansancioPorCombate),
        defensaTotalPorCombate: m((l) => l.defensaTotalPorCombate),
        maniobras,
        tecnicas,
      };
    }),
  };
}
