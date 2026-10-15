// Genera src/motor/grimorio.ts desde la hoja "Tablas Magia" de una planilla: todos los conjuros de
// todas las vías, sub-vías y libre acceso, con sus números por grado. Sólo nombres y números: el
// texto de los efectos (que es el del manual) no se copia; de él se leen los valores que se pueden
// leer sin ambigüedad (daño, radio, RM, RF, RP, resistencia, crítico, PV, TA).
//
// Uso: npx tsx scripts/grimorio.ts [planilla.xlsm]   (por defecto, la de Stéphan)

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { Libro, normalizar } from '../src/hoja/libro';

const HOJA = 'Tablas Magia';
const PRIMERA = 6;
const ULTIMA = 700;

const ruta = process.argv[2] ?? `fichas/${readdirSync('fichas').find((f) => f.startsWith('St'))}`;
const libro = Libro.leer(readFileSync(ruta));
if (!libro.tieneHoja(HOJA)) throw new Error(`${ruta} no tiene la hoja ${HOJA}`);

// Columnas de la tabla: D nombre, E vía, F nivel, G diario, H tipo, I acción, J-M Int. R., N-Q
// zeon, R-U mantenimiento, V-Y efecto de cada grado.
const filas = libro.filas(HOJA, `D${PRIMERA}:Y${ULTIMA}`, Array.from({ length: 22 }, (_, i) => i + 1));

const numero = (s: string | undefined): number | null => {
  if (s === undefined) return null;
  const t = s.trim().replace(/\./g, '');
  return /^\d+$/.test(t) ? Number(t) : null;
};

/** El tipo, como lo escribe la planilla ("Auto", "Animico", "Efec. / Ataq."…), a nuestros nombres. */
function tipos(s: string | undefined): string[] {
  const t = normalizar(s ?? '');
  const res: string[] = [];
  if (/efec|efcto/.test(t)) res.push('efecto');
  if (/ataq/.test(t)) res.push('ataque');
  if (/anim/.test(t)) res.push('animico');
  if (/auto/.test(t)) res.push('automatico');
  if (/defen/.test(t)) res.push('defensa');
  if (/detec|\(det\)/.test(t)) res.push('deteccion');
  return res.length ? res : ['efecto'];
}

/** Valores que se leen del efecto de un grado sin ambigüedad. */
function leer(efecto: string | undefined): Record<string, number> {
  const t = (efecto ?? '').replace(/(\d)\.(\d{3})/g, '$1$2');
  const r: Record<string, number> = {};
  const uno = (re: RegExp) => {
    const m = re.exec(t);
    return m ? Number(m.slice(1).find((x) => x !== undefined)) : undefined;
  };
  const poner = (k: string, v: number | undefined) => {
    if (v !== undefined && !Number.isNaN(v)) r[k] = v;
  };
  poner('dano', uno(/Daño(?: [Bb]ase)?(?: de)? (\d+)/));
  poner('radio', uno(/(\d+) (?:metros|m) de radio|[Rr]adio de (\d+) metros|[ÁA]rea de (\d+) metros|(\d+)m radio/));
  const rmRf = uno(/RM o RF (\d+)/);
  const rmRp = uno(/RM o RP (\d+)/);
  poner('rm', rmRf ?? rmRp ?? uno(/\bRM (\d+)|(\d+) RM\b/));
  poner('rf', rmRf ?? uno(/\bRF (\d+)|(\d+) RF\b/));
  poner('rp', rmRp ?? uno(/\bRP (\d+)|(\d+) RP\b/));
  poner('resistencia', uno(/(\d+) puntos de [Rr]esistencia/));
  poner('critico', uno(/Cr[ií]tico (\d+)|\+(\d+) al [Nn]ivel de [Cc]r[ií]tico/));
  poner('pv', uno(/(\d+) [Pp]untos de [Vv]ida/));
  const ta = /TA (\d+) en Energ[ií]a y TA (\d+) en el resto/.exec(t);
  if (ta) {
    r.taEnergia = Number(ta[1]);
    r.taResto = Number(ta[2]);
  }
  return r;
}

interface Entrada {
  nombre: string;
  via: string;
  nivel: number;
  diario: boolean;
  tipos: string[];
  accion: 'activa' | 'pasiva';
  grados: Record<string, number>[];
}

const entradas: Entrada[] = [];
for (const f of filas) {
  const [nombre, via, nivel] = [f[0]?.trim(), f[1]?.trim(), numero(f[2])];
  if (!nombre || !via || nivel === null || nombre.startsWith('>')) continue;
  const grados: Record<string, number>[] = [];
  for (let g = 0; g < 4; g++) {
    const int = numero(f[6 + g]);
    const zeon = numero(f[10 + g]);
    if (int === null || zeon === null) throw new Error(`${nombre}: grado ${g} sin Int. R. o zeon`);
    const mant = numero(f[14 + g]);
    grados.push({ zeon, int, ...(mant ? { mantenimiento: mant } : {}), ...leer(f[18 + g]) });
  }
  entradas.push({
    nombre, via: normalizar(via), nivel, diario: normalizar(f[3] ?? '') === 'si', tipos: tipos(f[4]),
    accion: normalizar(f[5] ?? '') === 'pasiva' ? 'pasiva' : 'activa', grados,
  });
}

const json = (x: unknown) => JSON.stringify(x).replace(/"(\w+)":/g, '$1:').replace(/"/g, "'");
const salida = `// GENERADO por scripts/grimorio.ts desde la hoja "${HOJA}" de la planilla: no editar a mano.
// Todos los conjuros (${entradas.length}) con sus números por grado. Sólo nombres y números: lo que hace
// cada uno en combate está en conjuros.ts (COMPORTAMIENTO). Los valores fuera de zeon, int y
// mantenimiento se leen del efecto de cada grado y pueden faltar.

import type { EntradaGrimorio } from './conjuros';

export const GRIMORIO: readonly EntradaGrimorio[] = [
${entradas.map((e) => `  ${json(e)},`).join('\n')}
];
`;
writeFileSync('src/motor/grimorio.ts', salida);
console.log(`${entradas.length} conjuros → src/motor/grimorio.ts`);
