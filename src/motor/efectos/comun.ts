// Reglas comunes a varios efectos de conjuro.

import { activo, distancia } from '../calculos';
import type { Conjuro, Grado } from '../conjuros';
import type { Contexto, Luchador } from '../modelo';

/**
 * Blancos de un conjuro: con área, todos los del radio alrededor del objetivo, aliados incluidos (Core
 * p.157); "alrededor del brujo", todos los de su radio salvo él. Con Control del Espacio, sólo los
 * enemigos (Arcana p.28).
 */
export function blancosConjuro(ctx: Contexto, atk: Luchador, objetivo: Luchador, c: Conjuro, g: Grado, control: boolean): Luchador[] {
  const centro = c.radioOfensivo ? atk : g.area ? objetivo : null;
  if (!centro) return [objetivo];
  const radio = c.radioOfensivo ? g.radio ?? 0 : g.area!;
  return ctx.luchadores.filter((x) => x !== atk && activo(x) && distancia(x, centro) <= radio && (!control || x.equipo !== atk.equipo));
}

/** Radio del área de un conjuro (Core p.101): alrededor del objetivo, o del lanzador si es su radio ofensivo; 0 si no es de área. */
export function radioArea(c: Conjuro, g: Grado): number {
  return g.area || (c.radioOfensivo ? g.radio ?? 0 : 0);
}

