// Uso:
//   npm run sim -- ejemplos/duelo.json            → 10.000 combates
//   npm run sim -- ejemplos/duelo.json 50000      → cantidad a elección (en todos los núcleos)
//   npm run sim -- ejemplos/duelo.json 50000 --hilos=1 --semilla=7
//   npm run sim -- ejemplos/duelo.json ver 7      → narra un combate (semilla 7)
//   npm run sim -- ficha "Kaito.xlsm"             → muestra lo que se lee de una planilla
//
// En un escenario, cada luchador puede ser una ficha completa o una planilla:
//   { "hoja": "C:/fichas/Kaito.xlsm", "arma": "Espada", "perfil": "agresivo" }
// La ruta de la planilla puede ser relativa al archivo del escenario.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Ficha, OpcionesEscenario, Perfil } from './motor/modelo';
import { monteCarloParalelo } from './paralelo-node';
import { simularCombate } from './motor/combate';
import { armasCuerpoACuerpo, jsonAFicha, leerHoja } from './hoja/ficha';

interface DesdeHoja {
  hoja: string;
  arma?: string;
  perfil?: Perfil;
  /** Para distinguir dos copias de la misma planilla. */
  nombre?: string;
}

interface Escenario {
  distanciaInicial?: number;
  /** Reglas opcionales: rotura, espacioReducido, armasEnfundadas, faseLunar, huida. */
  opciones?: OpcionesEscenario;
  equipoA: (Ficha | DesdeHoja)[];
  equipoB: (Ficha | DesdeHoja)[];
}

function cargar(entrada: Ficha | DesdeHoja, carpeta: string): Ficha {
  if (!('hoja' in entrada)) return entrada;
  const json = leerHoja(readFileSync(resolve(carpeta, entrada.hoja)));
  const ficha = jsonAFicha(json, { arma: entrada.arma, perfil: entrada.perfil });
  return entrada.nombre ? { ...ficha, nombre: entrada.nombre, id: entrada.nombre } : ficha;
}

const banderas = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const [primero, modo, extra] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!primero) {
  console.error('Falta el archivo del escenario. Ej: npm run sim -- ejemplos/duelo.json');
  process.exit(1);
}

if (primero === 'ficha') {
  if (!modo) {
    console.error('Falta la planilla. Ej: npm run sim -- ficha "Kaito.xlsm"');
    process.exit(1);
  }
  const json = leerHoja(readFileSync(modo));
  console.log(jsonAFicha(json, { arma: extra }));
  console.log('\nArmas cuerpo a cuerpo:');
  console.table(armasCuerpoACuerpo(json).map((a) => ({
    nombre: a.nombre, turno: a.turno, ataque: a.ataque, defensa: `${a.defensa} ${a.defensaTipo}`,
    daño: a.danio, crítico: a.critPrincipal, tamaño: a.tamanoAtaque ?? '-',
  })));
  process.exit(0);
}

const crudo = JSON.parse(readFileSync(primero, 'utf8')) as Escenario;
const carpeta = dirname(resolve(primero));
const esc = {
  distanciaInicial: crudo.distanciaInicial,
  escenario: crudo.opciones,
  equipoA: crudo.equipoA.map((e) => cargar(e, carpeta)),
  equipoB: crudo.equipoB.map((e) => cargar(e, carpeta)),
};

if (modo === 'ver') {
  const r = simularCombate(esc.equipoA, esc.equipoB, {
    semilla: Number(extra ?? 1), registrar: true, distanciaInicial: esc.distanciaInicial, escenario: esc.escenario,
  });
  let asalto = -1;
  for (const e of r.registro!) {
    if (e.asalto !== asalto) {
      asalto = e.asalto;
      console.log(`\n— Asalto ${asalto} —`);
    }
    console.log(e.texto);
  }
} else {
  const n = Number(modo ?? 10000);
  const r = await monteCarloParalelo(
    { equipoA: esc.equipoA, equipoB: esc.equipoB, distanciaInicial: esc.distanciaInicial, escenario: esc.escenario },
    n, { hilos: banderas.hilos ? Number(banderas.hilos) : undefined, semilla: banderas.semilla ? Number(banderas.semilla) : 1 },
  );
  const pct = (x: number) => `${((100 * x) / r.combates).toFixed(1)}%`;
  const nombres = (fs: Ficha[]) => fs.map((f) => f.nombre).join(', ');
  console.log(`${r.combates} combates en ${(r.milisegundos / 1000).toFixed(2)} s (${Math.round(r.combates / (r.milisegundos / 1000))}/s)`);
  console.log(`Equipo A (${nombres(esc.equipoA)}): ${pct(r.victoriasA)}`);
  console.log(`Equipo B (${nombres(esc.equipoB)}): ${pct(r.victoriasB)}`);
  console.log(`Empates: ${pct(r.empates)} · asaltos promedio: ${r.asaltosMedio.toFixed(2)}`);
  console.table(r.luchadores.map((l) => ({
    nombre: `${l.nombre} (${l.equipo})`,
    sobrevive: `${(l.supervivencia * 100).toFixed(1)}%`,
    ...(l.huida > 0 ? { huye: `${(l.huida * 100).toFixed(1)}%` } : {}),
    'daño hecho': l.danoCausado.toFixed(1),
    'daño recibido': l.danoRecibido.toFixed(1),
    críticos: l.criticos.toFixed(2),
    'cae en asalto': l.asaltoCaidaMedio?.toFixed(2) ?? '-',
    ataques: l.ataquesPorCombate.toFixed(2),
    contras: l.contrasPorCombate.toFixed(2),
    cansancio: l.cansancioPorCombate.toFixed(2),
    'def. total': l.defensaTotalPorCombate.toFixed(2),
    maniobras: Object.entries(l.maniobras).map(([m, n]) => `${m} ${n.toFixed(1)}`).join(', ') || '-',
  })));
}
