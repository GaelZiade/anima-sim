// Reglas comunes a varios efectos de conjuro.

import { activo, distancia } from '../calculos';
import type { Conjuro, Grado } from '../conjuros';
import type { Contexto, Luchador } from '../modelo';

/**
 * Selección de blancos (Core p.123): ¿un ataque de área de `c` alcanza a `b`, que está en el radio?
 * El mago elige (sólo los enemigos), salvo que el conjuro diga que no se pueden designar: entonces a
 * todos, él incluido si el conjuro no lo excluye, a menos que pague Control del Espacio (Arcana p.28).
 */
export function afectaElArea(atk: Luchador, b: Luchador, c: Conjuro, control: boolean): boolean {
  if (!c.sinElegirBlancos || control) return b.equipo !== atk.equipo;
  return b !== atk || c.sinElegirBlancos === 'todos';
}

/** Control del Espacio sólo cambia algo en un conjuro que no deja designar blancos (Arcana p.28). */
export function sirveControl(l: Luchador, c: Conjuro): boolean {
  return !!l.ficha.magia?.controlDelEspacio && !!c.sinElegirBlancos;
}

/** Blancos de un conjuro: con área, los del radio alrededor del objetivo (o del brujo) que alcanza (`afectaElArea`). */
export function blancosConjuro(ctx: Contexto, atk: Luchador, objetivo: Luchador, c: Conjuro, g: Grado, control: boolean): Luchador[] {
  const centro = c.radioOfensivo ? atk : g.area ? objetivo : null;
  if (!centro) return [objetivo];
  const radio = c.radioOfensivo ? g.radio ?? 0 : g.area!;
  return ctx.luchadores.filter((x) => activo(x) && distancia(x, centro) <= radio && afectaElArea(atk, x, c, control));
}

/** Radio del área de un conjuro (Core p.101): alrededor del objetivo, o del lanzador si es su radio ofensivo; 0 si no es de área. */
export function radioArea(c: Conjuro, g: Grado): number {
  return g.area || (c.radioOfensivo ? g.radio ?? 0 : 0);
}

