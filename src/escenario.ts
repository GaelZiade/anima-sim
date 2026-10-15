// El formato de un escenario .json y cómo se lee, el mismo para la página y para la consola: cada
// integrante es una ficha completa o una planilla (con arma, perfil, nombre y estado inicial).

import type { Ficha, OpcionesEscenario, Perfil } from './motor/modelo';
import { jsonAFicha } from './hoja/ficha';
import type { HojaJson } from './hoja/hojaAJson';

/** Un integrante que se lee de una planilla. */
export interface DesdeHoja {
  hoja: string;
  arma?: string;
  perfil?: Perfil;
  /** Para distinguir dos copias de la misma planilla. */
  nombre?: string;
  /** Estado con que empieza (ESTADOS_INICIALES). */
  estado?: string;
}

export interface EscenarioJson {
  distanciaInicial?: number;
  /** Reglas opcionales y condiciones del escenario (mapa, posiciones, oscuridad, rotura…). */
  opciones?: OpcionesEscenario;
  equipoA: (Ficha | DesdeHoja)[];
  equipoB: (Ficha | DesdeHoja)[];
}

/** Estados de la Tabla 43 y del capítulo 14 del Core con que puede empezar un luchador. */
export const ESTADOS_INICIALES: readonly [string, string, (f: Ficha) => Ficha][] = [
  ['', 'Sin estados', (f) => f],
  ['cegueraParcial', 'Ceguera parcial', (f) => ({ ...f, estados: { ...f.estados, ceguera: 'parcial' } })],
  ['cegueraAbsoluta', 'Ceguera absoluta', (f) => ({ ...f, estados: { ...f.estados, ceguera: 'absoluta' } })],
  ['miedo', 'Miedo (−60)', (f) => ({ ...f, estados: { ...f.estados, miedo: true } })],
  ['dolorLeve', 'Dolor leve (−20)', (f) => ({ ...f, estados: { ...f.estados, dolor: 'leve' } })],
  ['dolor', 'Dolor (−40)', (f) => ({ ...f, estados: { ...f.estados, dolor: 'normal' } })],
  ['dolorExtremo', 'Dolor extremo (−80)', (f) => ({ ...f, estados: { ...f.estados, dolor: 'extremo' } })],
  ['levitando', 'Levitando', (f) => ({ ...f, estados: { ...f.estados, levitando: true } })],
  ['vuelo7', 'Vuelo 7 a 14', (f) => ({ ...f, tipoVuelo: 7 })],
  ['vuelo15', 'Vuelo 15 o más', (f) => ({ ...f, tipoVuelo: 15 })],
];

/** La ficha con el estado inicial elegido. */
export function conEstado(f: Ficha, estado = ''): Ficha {
  return (ESTADOS_INICIALES.find(([v]) => v === estado)?.[2] ?? ((x: Ficha) => x))(f);
}

/** La ficha de un integrante leído de una planilla (ya convertida a JSON). */
export function fichaDesdeHoja(json: HojaJson, e: Omit<DesdeHoja, 'hoja'>): Ficha {
  const ficha = jsonAFicha(json, { arma: e.arma, perfil: e.perfil });
  return conEstado(e.nombre ? { ...ficha, nombre: e.nombre, id: e.nombre } : ficha, e.estado);
}

/**
 * Si una ficha se repite (en cualquiera de los dos equipos), las copias se numeran para distinguirlas:
 * "Guardia", "Guardia (2)"…
 */
export function numerarCopias(equipoA: Ficha[], equipoB: Ficha[]): [Ficha[], Ficha[]] {
  const vistos = new Map<string, number>();
  const numerar = (f: Ficha) => {
    const n = (vistos.get(f.id) ?? 0) + 1;
    vistos.set(f.id, n);
    return n === 1 ? f : { ...f, id: `${f.id}-${n}`, nombre: `${f.nombre} (${n})` };
  };
  return [equipoA.map(numerar), equipoB.map(numerar)];
}
