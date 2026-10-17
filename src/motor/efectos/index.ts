// El registro: qué hace cada efecto de conjuro. Un efecto nuevo en EfectoConjuro sin su manejador acá
// no compila.

import type { EfectoConjuro } from '../conjuros';
import type { ManejadorEfecto } from './tipos';
import { armadura, ataque, aumentarCritico, escudo } from './ataque';
import { consumirEsencia, criticoDirecto, extasis, fundir, secar } from './animicos';
import { calmar, detectar, flash, holograma, lazos, naturaleza } from './luz';
import { barrera, controlFuego, crearFuego, incinerar, mina, mitigar, tormenta } from './fuego';
import {
  atar, bendicion, capacidades, consumirVida, curar, reparar, sacrificioPoder, sacrificioVital, transporte,
} from './apoyo';

export const EFECTOS = {
  ataque, escudo, armadura, aumentarCritico,
  secar, consumirEsencia, criticoDirecto, extasis, fundir,
  flash, calmar, lazos, holograma, detectar, naturaleza,
  incinerar, tormenta, mitigar, barrera, mina, crearFuego, controlFuego,
  bendicion, curar, transporte, reparar, atar, sacrificioVital, sacrificioPoder, consumirVida, capacidades,
} satisfies Record<EfectoConjuro, ManejadorEfecto>;

/** El manejador de un efecto. */
export function efecto(e: EfectoConjuro): ManejadorEfecto {
  return EFECTOS[e];
}

export type { Lanzamiento, Lanzado, Meta, Motor, Valoracion, ManejadorEfecto } from './tipos';
export { afectaElArea, blancosConjuro, radioArea, sirveControl } from './comun';
export { cruzarMuros, detonarMina, habilidadMina } from './fuego';
export { transportar } from './apoyo';
