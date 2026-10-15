// Un golpe que se resuelve contra la defensa de alguien: ataque físico, técnica de Ki o conjuro.
// Sólo tipos: lo usan el motor (combate.ts) y los efectos de conjuro (efectos/).

import type { Conjuro } from './conjuros';
import type { ModKi } from './ki';
import type { Luchador } from './modelo';
import type { EstadoMushin, Maniobra } from './maniobras';
import type { Ranura } from './rasgos';
import type { TipoAtaque } from './reglas';

export interface ResultadoDefensa {
  defensor: Luchador;
  /** Bono de contraataque si el defensor ganó, o null. */
  contra: number | null;
  /** El ataque lo alcanzó (resultado positivo), dañara o no. */
  impacto: boolean;
}

export interface Golpe {
  maniobra: Maniobra;
  /** Destrucción por Ki: puntos de Ki extra (+5 a la dificultad cada uno). */
  kiDestruccion?: number;
  /** Efectos de Ki del atacante en este golpe. */
  ki?: ModKi;
  estadoMushin?: EstadoMushin | null;
  esContra: boolean;
  tipo?: TipoAtaque;
  ranura: Ranura;
  /** Ki que costó la técnica del ataque (Absorción de Ki del defensor). */
  costeTecnica?: number;
  /** Es un ataque reflectado: no se vuelve a reflectar (Dominus p.71). */
  reflejado?: boolean;
  /** Ataque a distancia: cuenta como proyectil disparado para la defensa (Dominus p.57, Tabla 49). */
  aDistancia?: boolean;
  /** Conjuro anímico: si alcanza con un resultado de daño, RM en vez de daño (Core p.122). */
  animico?: { conjuro: Conjuro; grado: number; afectados?: Luchador[] };
  /** Multiplica el daño base (una descarga que pasa un choque con la mitad, Tabla 57). */
  factorDano?: number;
  /**
   * Ataque en área sobrenatural (Core p.101): su radio (un área de Ki lo trae en `ki`) y su centro (sin
   * dato, el defensor). Penaliza la defensa y dobla el daño contra la acumulación (Core p.99).
   */
  area?: number;
  centroArea?: { x: number; y: number };
}
