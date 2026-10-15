// Opciones del escenario que se eligen en la página: las casillas de reglas (una tabla), los
// selectores y lo que se guarda del diálogo de "Simular muchos".

import type { OpcionesEscenario } from '../src/motor/modelo';
import { $, crear, marcado, numeroDe } from './dom';

export /** Lo que se elige en el diálogo de "Simular muchos" (también vale para ver en vivo). */
interface OpcionesGuardadas {
  combates: number;
  hilos: number;
  semilla: number;
  oscuridad: string;
  faseLunar: string;
  cuerdas?: string;
  sinManiobras?: string;
  casillas: Record<string, boolean>;
}

type OpcionSiNo = { [K in keyof OpcionesEscenario]-?: OpcionesEscenario[K] extends boolean | undefined ? K : never }[keyof OpcionesEscenario];

/** Reglas que se prenden o apagan: una fila acá arma la casilla, la guarda y la pasa al motor. */
export const CASILLAS: readonly { id: OpcionSiNo; texto: string }[] = [
  { id: 'rotura', texto: 'Rotura de armas y armaduras' },
  { id: 'huida', texto: 'Se puede huir' },
  { id: 'espacioReducido', texto: 'Espacio reducido' },
  { id: 'armasEnfundadas', texto: 'Armas enfundadas' },
  { id: 'desequilibrio', texto: 'Desequilibrio de atributos (Dominus)' },
  { id: 'escasaVisibilidad', texto: 'Escasa visibilidad: niebla, humo (−20 a los proyectiles)' },
  { id: 'disparosParalelos', texto: 'Disparos paralelos (opcional, Core p.95)' },
];

/** Arma las casillas en el diálogo (una vez, al cargar). */
export function armarCasillas() {
  $('casillas').replaceChildren(...CASILLAS.map(({ id, texto }) =>
    crear('label', {}, crear('input', { type: 'checkbox', id }), ` ${texto}`)));
}

/** Las reglas marcadas, para el motor. */
export function casillasMarcadas(): Partial<OpcionesEscenario> {
  return Object.fromEntries(CASILLAS.map((c) => [c.id, marcado(c.id)]));
}

export function leerOpciones(): OpcionesGuardadas {
  return {
    combates: Math.max(1, Math.round(numeroDe('combates')) || 10000),
    hilos: Math.max(1, Math.round(numeroDe('hilos')) || 1),
    semilla: Math.max(1, Math.round(numeroDe('semilla')) || 1),
    oscuridad: $<HTMLSelectElement>('oscuridad').value,
    faseLunar: $<HTMLSelectElement>('faseLunar').value,
    cuerdas: $<HTMLSelectElement>('cuerdas').value,
    sinManiobras: $<HTMLSelectElement>('sinManiobras').value,
    casillas: Object.fromEntries(CASILLAS.map(({ id }) => [id, marcado(id)])),
  };
}

export function mostrarOpciones(o: OpcionesGuardadas) {
  ($('combates') as HTMLInputElement).value = String(o.combates);
  ($('hilos') as HTMLInputElement).value = String(o.hilos);
  ($('semilla') as HTMLInputElement).value = String(o.semilla);
  $<HTMLSelectElement>('oscuridad').value = o.oscuridad;
  $<HTMLSelectElement>('faseLunar').value = o.faseLunar;
  $<HTMLSelectElement>('cuerdas').value = o.cuerdas ?? '';
  $<HTMLSelectElement>('sinManiobras').value = o.sinManiobras ?? '';
  for (const { id } of CASILLAS) ($(id) as HTMLInputElement).checked = !!o.casillas[id];
}
