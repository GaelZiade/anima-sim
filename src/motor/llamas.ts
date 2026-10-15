// En llamas (Core p.236-237, Tabla 76): prenderse, arder cada asalto, apagarse, mitigar el fuego y
// quemarse al tocar un Cuerpo a Fuego. Lo usan los conjuros de fuego, los críticos de calor y el turno.

import type { Contexto, Luchador } from './modelo';
import { tirarD100Cerrada } from './dados';
import { resistenciaCalor } from './calculos';
import { atributo } from './maniobras';
import { danoLlamas, estadoLlamas, nivelLlamas, presenciaDe } from './magia';
import type { Motor } from './efectos';

/** Mitigar Fuego: cada intensidad que quita baja 20 su estado en la Tabla 76 (Core p.155, p.236). */
export function mitigarFuego(m: Motor, ctx: Contexto, quien: Luchador, intensidades: number) {
  quien.llamas = Math.max(0, quien.llamas - 20 * intensidades);
  if (quien.llamas < 100) quien.llamas = 0;
  m.log(ctx, () => `  ${quien.ficha.nombre} ${quien.llamas ? `sigue ${estadoLlamas(quien.llamas)} (${quien.llamas})` : 'deja de arder'}.`);
}

/** Quién lo prendió fuego (para las estadísticas del daño de las llamas). */
const quienPrendio = new WeakMap<Luchador, Luchador>();

/**
 * Tabla 76 (Core p.236): con 100 o más se prende; un ser con acumulación divide el resultado entre 5.
 * Si ya ardía, queda el peor de los dos.
 */
export function prender(m: Motor, ctx: Contexto, atk: Luchador, l: Luchador, valor: number) {
  const nivel = nivelLlamas(l, valor);
  if (nivel < 100 || nivel <= l.llamas || l.bono?.cuerpoFuego) return;
  l.llamas = nivel;
  quienPrendio.set(l, atk);
  m.log(ctx, () => `  ${l.ficha.nombre} queda ${estadoLlamas(nivel)} (Tabla 76: ${nivel}).`);
}

/** Al final del asalto: el fuego quema y, si no intentó apagarlo, crece 10 (Core p.236-237). */
export function arder(m: Motor, ctx: Contexto, l: Luchador) {
  if (!l.llamas) return;
  const dano = danoLlamas(l);
  if (dano > 0) {
    m.log(ctx, () => `${l.ficha.nombre} se quema (${estadoLlamas(l.llamas)}).`);
    m.perderPv(ctx, quienPrendio.get(l) ?? l, l, dano);
  }
  if (!l.apagando) l.llamas += 10;
  l.apagando = false;
}

/**
 * Apagarse (Core p.236): acción con la que tira un dado, le suma su Destreza o Agilidad y lo resta del
 * nivel en la Tabla 76; por debajo de 100 se apaga. Ocupa su turno (interpretación).
 */
export function apagarse(m: Motor, ctx: Contexto, l: Luchador) {
  const caract = Math.max(atributo(l, 'DES'), atributo(l, 'AGI'));
  const dado = tirarD100Cerrada(ctx.rng);
  l.llamas -= dado + caract;
  l.apagando = true;
  l.ataquesRestantes = 0;
  if (l.llamas < 100) l.llamas = 0;
  m.log(ctx, () => `${l.ficha.nombre} intenta apagarse (${dado}+${caract}): ${l.llamas ? `sigue ${estadoLlamas(l.llamas)} (${l.llamas})` : 'se apaga'}.`);
}

/**
 * Cuerpo a Fuego (Core p.158): quien toca sus llamas hace una RF contra el doble de su Presencia (+5
 * por punto de TA contra calor) o pierde la mitad del fracaso. Se toca con un golpe sin armas que
 * alcanza, dado o recibido (interpretación).
 */
export function quemarAlTocar(m: Motor, ctx: Contexto, llamas: Luchador, quien: Luchador) {
  const { fracaso } = m.tirarResistencia(ctx, quien, 2 * presenciaDe(llamas), `las llamas de ${llamas.ficha.nombre}`, 'RF', 5 * (quien.ficha.ta.CAL ?? 0) + resistenciaCalor(quien));
  if (fracaso >= 2) m.perderPv(ctx, llamas, quien, Math.floor(fracaso / 2));
}
