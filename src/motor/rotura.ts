// Rotura y entereza de armas y armaduras (Core p.93, regla opcional).

import type { Contexto, Luchador } from './modelo';
import { dado } from './rng';
import { capacidades, localizacionArmadura, type Ranura } from './rasgos';
import { esMaestro } from './reglas';
import { activo, capasDe, type ZonaArmadura } from './calculos';
import { atributo } from './maniobras';
import { type Motor } from './efectos';

/** Bono a la rotura por Fuerza (Core p.93). */
export function bonoRoturaFuerza(fue: number): number {
  return fue >= 15 ? 5 : fue >= 13 ? 4 : fue >= 11 ? 3 : fue === 10 ? 2 : fue >= 8 ? 1 : 0;
}

/** Rotura de un golpe: la del arma (o la del perfil sin armas) + Fuerza + Dumah y Ojos de la Muerte. */
export function roturaDe(l: Luchador, ranura: Ranura): number {
  const sinArmas = ranura.sinArmas || l.cap.desarmado;
  const base = sinArmas ? (l.ficha.sinArmas?.rotura ?? 0) : (l.ficha.arma?.rotura ?? 0);
  return base + bonoRoturaFuerza(atributo(l, 'FUE')) + (sinArmas ? l.cap.est.roturaSinArmas : 0) + l.cap.est.roturaExtra;
}

/** Control de rotura: d10 + rotura contra la entereza; devuelve por cuánto la supera (0 si no). */
function controlRotura(ctx: Contexto, rotura: number, entereza: number): number {
  return Math.max(0, rotura + dado(ctx.rng, 10) - entereza);
}

/**
 * Al parar: si las dos armas chocan, cada una puede romper a la otra. Si el defensor para sin armas
 * un arma, controla con su Constitución o Destreza (o la entereza de una armadura dura de camisola o
 * completa) y recibe 5 de daño por punto que falle, salvo maestría en parada sin armas o Malla-yuddha
 * avanzado (Core p.93, Dominus p.35).
 */
export function roturaEnParada(motor: Motor, ctx: Contexto, atk: Luchador, def: Luchador, ranura: Ranura, paro: boolean) {
  const atkArmado = !ranura.sinArmas && !atk.cap.desarmado;
  if (!atkArmado) return;
  if (def.cap.desarmado) {
    if (!paro || esMaestro(def.ficha.defensa) || def.cap.est.paradaSinArmasSegura) return;
    // Con una armadura dura de camisola o completa puede bloquear con ella, con su entereza (Core p.93).
    const armadura = Math.max(0, ...(def.ficha.capasArmadura ?? [])
      .filter((c) => c.clase === 'dura' && ['camisola', 'completa'].includes(c.localizacion ?? localizacionArmadura(c.nombre)))
      .map((c) => c.entereza));
    const entereza = Math.max(atributo(def, 'CON') + def.cap.est.enterezaSinArmas, atributo(def, 'DES') + def.cap.est.enterezaSinArmas, armadura);
    const falla = controlRotura(ctx, roturaDe(atk, ranura), entereza);
    if (falla > 0) {
      def.pv -= 5 * falla;
      motor.limitePorDano(ctx, def, 5 * falla);
      def.stats.danoRecibido += 5 * falla;
      atk.stats.danoCausado += 5 * falla;
      motor.log(ctx, () => `  ${def.ficha.nombre} para sin armas y recibe ${5 * falla} de daño (${def.pv}/${def.ficha.pv}).`);
      motor.verificarCaida(ctx, atk, def);
    }
    return;
  }
  const rDef = { pen: 0, sinArmas: false };
  if (controlRotura(ctx, roturaDe(atk, ranura), def.ficha.arma?.entereza ?? 10) > 0) romperArma(motor, ctx, def);
  if (activo(atk) && controlRotura(ctx, roturaDe(def, rDef), atk.ficha.arma?.entereza ?? 10) > 0) romperArma(motor, ctx, atk);
}

/**
 * Un arma de calidad +5 o más no se rompe: pierde un grado (−5 ataque y parada, −5 turno, −10 daño,
 * −2 rotura, −10 entereza). Sin calidad se destruye y el luchador queda desarmado (Core p.93, p.76).
 */
export function romperArma(motor: Motor, ctx: Contexto, l: Luchador) {
  const arma = l.ficha.arma ?? {};
  l.armaRota ??= l.ficha;
  const calidad = arma.calidad ?? 0;
  if (calidad < 5) {
    motor.log(ctx, () => `  ¡Se rompe el arma de ${l.ficha.nombre}!`);
    motor.desarmar(ctx, l, l);
    return;
  }
  const paraConEsta = (l.ficha.tipoDefensa ?? 'parada') === 'parada';
  l.ficha = {
    ...l.ficha,
    ataque: l.ficha.ataque - 5,
    defensa: l.ficha.defensa - (paraConEsta ? 5 : 0),
    turno: l.ficha.turno - 5,
    danoBase: l.ficha.danoBase - 10,
    arma: { ...arma, calidad: calidad - 5, rotura: (arma.rotura ?? 0) - 2, entereza: (arma.entereza ?? 10) - 10 },
  };
  l.cap = capacidades(l.ficha);
  motor.log(ctx, () => `  El arma de ${l.ficha.nombre} se mella: baja a calidad +${calidad - 5}.`);
}

/**
 * La armadura que evitó el daño puede romperse: cada capa rota pierde un punto de todas sus TA. Sólo
 * se controlan las capas de la zona golpeada (el yelmo en un golpe a la cabeza).
 */
export function roturaDeArmadura(motor: Motor, ctx: Contexto, atk: Luchador, def: Luchador, ranura: Ranura, zona: ZonaArmadura) {
  const capas = def.ficha.capasArmadura;
  if (!capas?.length) return;
  const enZona = new Set(capasDe(def.ficha, zona));
  if (!enZona.size) return;
  const rotura = roturaDe(atk, ranura);
  let rotas = 0;
  let rotasCuerpo = 0;
  const nuevas = capas.map((c) => {
    if (!enZona.has(c) || controlRotura(ctx, rotura, c.entereza) === 0) return c;
    rotas++;
    if ((c.localizacion ?? 'completa') !== 'cabeza') rotasCuerpo++;
    return { ...c, ta: Object.fromEntries(Object.entries(c.ta).map(([t, v]) => [t, Math.max(0, (v ?? 0) - 1)])) };
  });
  if (!rotas) return;
  // La TA total de la planilla es la del cuerpo: el yelmo no cuenta en ella.
  const ta = { ...def.ficha.ta };
  for (const t of Object.keys(ta) as (keyof typeof ta)[]) ta[t] = Math.max(0, (ta[t] ?? 0) - rotasCuerpo);
  def.ficha = { ...def.ficha, ta, capasArmadura: nuevas };
  motor.log(ctx, () => `  La armadura de ${def.ficha.nombre} se daña: −${rotas} a la TA de ${zona === 'cabeza' ? 'su yelmo' : 'las capas golpeadas'}.`);
}
