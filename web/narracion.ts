// Lo que se muestra del registro de un combate: texto de cada línea, tiradas resaltadas, estado de
// cada luchador y cuánto dura cada línea al reproducir. Funciones puras sobre el resultado.

import type { ResultadoCombate } from '../src/motor/combate';
import type { Celda } from '../src/motor/mapa';
import type { Evento, FotoLuchador } from '../src/motor/modelo';
import { crear } from './dom';

export /** Marca las tiradas abiertas y las pifias del registro para verlas de un vistazo. */
function resaltarTiradas(texto: string): (Node | string)[] {
  return texto.split(/(\((?:abierta|pifia)[^)]*\)|¡pifia!)/).map((parte, i) => {
    if (i % 2 === 0) return parte;
    return crear('span', { className: parte.includes('abierta') ? 'abierta' : 'pifia' }, parte);
  });
}

export /** Paredes y terreno infranqueable del mapa con que se jugó. */
function celdasDe(r: ResultadoCombate): { paredes: Set<string>; terreno: Set<string> } {
  const paredes = new Set<string>(), terreno = new Set<string>();
  r.mapa.muro.forEach((v, i) => v && (r.mapa.pared[i] ? paredes : terreno).add(`${i % r.mapa.ancho},${Math.floor(i / r.mapa.ancho)}`));
  return { paredes, terreno };
}

/** Metros de un recorrido. */
function metros(celdas: Celda[]): number {
  let m = 0;
  for (let i = 1; i < celdas.length; i++) m += Math.hypot(celdas[i].x - celdas[i - 1].x, celdas[i].y - celdas[i - 1].y);
  return m;
}

const NOMBRE_ESTADO_FINAL: Record<FotoLuchador['estado'], string> = {
  activo: '', caido: 'caído', inconsciente: 'inconsciente', muerto: 'muerto', huido: 'huyó',
};

export /** Lo que se sabe de un luchador en una línea: PV, cómo terminó, sus estados, Ki y zeon. */
function textoEstado(nombre: string, pvMax: number, s: FotoLuchador | undefined, pv: number): string {
  const partes = [`${nombre}: ${s?.pv ?? pv}/${pvMax} PV`];
  if (s && s.estado !== 'activo') partes.push(NOMBRE_ESTADO_FINAL[s.estado]);
  if (s?.marcas) partes.push(...s.marcas);
  if (s?.ki !== undefined) partes.push(`Ki ${s.ki}`);
  if (s?.zeon !== undefined) partes.push(`zeon ${s.zeon}`);
  return partes.join(' · ');
}

/** Cuánto dura cada línea a velocidad `vel`, según lo que pasa en ella. Un recorrido tarda según su largo. */
export function duracionDe(e: Evento, vel: number): number {
  const base = e.camino ? 500 + 140 * metros(e.camino.celdas)
    : e.texto.startsWith('Iniciativa') ? 1600 : e.ataque ? 1500 : e.texto.startsWith('  ') ? 900 : 1100;
  return Math.min(4000, base) / vel;
}
