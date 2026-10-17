// Rotura y entereza de armas y armaduras (Core p.93, regla opcional).

import type { Contexto, Ficha, Luchador } from './modelo';
import { dado } from './rng';
import { capacidades, localizacionArmadura, type Ranura } from './rasgos';
import { esMaestro } from './reglas';
import { activo, capasDe, combinarTA, type ZonaArmadura } from './calculos';
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
  // Aumentar rotura (Ki, Dominus p.60).
  return base + bonoRoturaFuerza(atributo(l, 'FUE')) + (sinArmas ? l.cap.est.roturaSinArmas : 0) + l.cap.est.roturaExtra + (l.ki?.activo.rotura ?? 0);
}

/** Aumentar entereza (Ki): a la del arma y a la de la armadura (Dominus p.60). */
function enterezaKi(l: Luchador): number {
  return l.ki?.activo.entereza ?? 0;
}

/** Entereza del arma que empuña, con Aumentar entereza. */
export function enterezaArma(l: Luchador): number {
  return (l.ficha.arma?.entereza ?? 10) + enterezaKi(l);
}

/** Chance de que d10 + rotura supere la entereza (la del control de abajo, para la IA). */
export function pRompe(rotura: number, entereza: number): number {
  return Math.max(0, Math.min(10, 10 + rotura - entereza)) / 10;
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
export function roturaEnParada(motor: Motor, ctx: Contexto, atk: Luchador, def: Luchador, ranura: Ranura, paro: boolean, descarga?: number) {
  // Una descarga tiene rotura igual a su daño base entre 20 y puede romper el arma que la para (Core p.122).
  if (descarga !== undefined) {
    if (!def.cap.desarmado && controlRotura(ctx, Math.floor(descarga / 20), enterezaArma(def)) > 0) romperArma(motor, ctx, def);
    return;
  }
  const atkArmado = !ranura.sinArmas && !atk.cap.desarmado;
  if (!atkArmado) return;
  if (def.cap.desarmado) {
    if (!paro || esMaestro(def.ficha.defensa) || def.cap.est.paradaSinArmasSegura) return;
    // Con una armadura dura de camisola o completa puede bloquear con ella, con su entereza (Core p.93).
    const armadura = Math.max(0, ...(def.ficha.capasArmadura ?? [])
      .filter((c) => c.clase === 'dura' && ['camisola', 'completa'].includes(c.localizacion ?? localizacionArmadura(c.nombre)))
      .map((c) => c.entereza + enterezaKi(def)));
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
  if (controlRotura(ctx, roturaDe(atk, ranura), enterezaArma(def)) > 0) romperArma(motor, ctx, def);
  if (activo(atk) && controlRotura(ctx, roturaDe(def, rDef), enterezaArma(atk)) > 0) romperArma(motor, ctx, atk);
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
  l.ficha = fichaConCalidad(l.ficha, calidad - 5);
  l.cap = capacidades(l.ficha);
  motor.log(ctx, () => `  El arma de ${l.ficha.nombre} se mella: baja a calidad +${calidad - 5}.`);
}

/**
 * La ficha con su arma de otra calidad: por cada 5, ±5 al ataque, a la parada (si para con ella) y al
 * turno, ±10 al daño, ±2 a la rotura y ±10 a la entereza (Core p.76, Tabla 30).
 */
export function fichaConCalidad(f: Ficha, calidad: number): Ficha {
  const arma = f.arma ?? {};
  const g = (calidad - (arma.calidad ?? 0)) / 5;
  if (!g) return f;
  const paraConEsta = (f.tipoDefensa ?? 'parada') === 'parada';
  return {
    ...f,
    ataque: f.ataque + 5 * g,
    defensa: f.defensa + (paraConEsta ? 5 * g : 0),
    turno: f.turno + 5 * g,
    danoBase: f.danoBase + 10 * g,
    arma: { ...arma, calidad, rotura: (arma.rotura ?? 0) + 2 * g, entereza: (arma.entereza ?? 10) + 10 * g },
  };
}

/**
 * Armas físicas de Ki (Dominus p.63): la ficha con su arma (la que tenía si lo desarmaron o se la
 * rompieron) de la calidad de la técnica; null si nunca tuvo una.
 */
export function fichaConArmaKi(l: Luchador, calidad: number): Ficha | null {
  const base = l.desarmado || l.cap.desarmado ? l.fichaArmada ?? l.armaRota : l.ficha;
  return base && !base.arma?.desarmado ? fichaConCalidad(base, calidad) : null;
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
  const nuevas = capas.map((c) => {
    if (!enZona.has(c) || controlRotura(ctx, rotura, c.entereza + enterezaKi(def)) === 0) return c;
    rotas++;
    return { ...c, ta: Object.fromEntries(Object.entries(c.ta).map(([t, v]) => [t, Math.max(0, (v ?? 0) - 1)])) };
  });
  if (!rotas) return;
  // La TA total de la planilla es la del cuerpo (el yelmo no cuenta): baja lo que baja la combinación
  // de sus capas, la mayor más la mitad de las otras (Core p.83), y el resto de la TA queda igual.
  const antes = capasDe(def.ficha, 'cuerpo');
  const despues = capasDe({ ...def.ficha, capasArmadura: nuevas }, 'cuerpo');
  const ta = { ...def.ficha.ta };
  for (const t of Object.keys(ta) as (keyof typeof ta)[]) ta[t] = Math.max(0, (ta[t] ?? 0) - (combinarTA(antes, t) - combinarTA(despues, t)));
  def.ficha = { ...def.ficha, ta, capasArmadura: nuevas };
  motor.log(ctx, () => `  La armadura de ${def.ficha.nombre} se daña: −${rotas} a la TA de ${zona === 'cabeza' ? 'su yelmo' : 'las capas golpeadas'}.`);
}
