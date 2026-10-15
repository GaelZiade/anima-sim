// Valoración de conjuros para la IA: lo que comparten los efectos (precio del zeon, chance de fallar
// una Resistencia, cuánto vale prender a alguien o beneficiar a un aliado…). Todo en PV esperados.

import type { Contexto, Luchador } from '../modelo';
import type { Conjuro, Grado } from '../conjuros';
import { golpeDeConjuro, nivelLlamas, RANURA_MAGIA, bendecir, danoLlamas, deArea, quitarBendicion, rmDe } from '../magia';
import { rfCritico, rfDe,
  absorcionContra, activo, ataqueMagico, defensaEscudoMagico, ataqueFinal, defensaFinal, distancia, enAlcance, faltaParaLlegar,
  metrosTotales, danoEsperado, penAccion, pronostico, puedeActuar, tablaPara, visionEntre,
} from '../calculos';
import { fallaResistencia, tabla } from '../probabilidades';

export { fallaResistencia };
import { umbralPifia } from '../reglas';
import type { ModKi } from '../ki';
import { amenaza, base, cacheDeDecision, conCambio, enemigos, golpeDe, lambda, pierdeElAsalto, valorGolpe, valorNegativo } from '../ia';
import type { Lanzamiento } from './tipos';
import { blancosConjuro, radioArea } from './comun';

/**
 * Precio de un punto de zeon en PV, como el del Ki: gastar toda la reserva tiene que rendir la mitad
 * de sus PV, y se encarece al vaciarse.
 */
export function precioZeon(l: Luchador): number {
  const inicial = Math.max(1, l.ficha.magia?.zeon ?? 1);
  const queda = Math.max(1, (l.magia?.reserva ?? 0) - (l.magia?.acumulado ?? 0));
  return ((0.5 * l.ficha.pv) / inicial) * Math.sqrt(inicial / queda);
}

/** Defensa de `def` contra un conjuro de ataque de `atk`: su escudo mágico, o parar (si para energía) o esquivar. */
export function defensaContraConjuro(def: Luchador, atk: Luchador, ki: ModKi, area = 0): number {
  if (def.magia?.escudo) return defensaEscudoMagico(def, atk, ki);
  return defensaFinal(def, atk, { kiAtk: ki, proyectil: enAlcance(atk, def) ? undefined : 'disparo', area });
}

/** Lo que vale para `atk` un conjuro de ataque contra `def`: el golpe, el tempo y la contra si lo toca. */
export function valorConjuroContra(atk: Luchador, def: Luchador, c: Conjuro, g: Grado): number {
  const ki = golpeDeConjuro(c, g);
  const area = radioArea(c, g);
  const p = pronostico(atk, def, ataqueMagico(atk, def), defensaContraConjuro(def, atk, ki, area), { ki, tipo: c.ta, ranura: RANURA_MAGIA, area });
  let v = valorGolpe(atk, def, p, 0);
  if (pierdeElAsalto(def)) v += p.pImpacto * amenaza(def, atk);
  if (enAlcance(atk, def) && def.ataquesRestantes > 0 && puedeActuar(def)) v -= lambda(atk) * p.pContra * golpeDe(def, atk);
  return v;
}

/** Si conviene pagar Control del Espacio: hay algún aliado en el área que elegir dejar afuera. */
export function quiereControl(ctx: Contexto, l: Luchador, obj: Luchador, c: Conjuro, g: Grado): boolean {
  return !!l.ficha.magia?.controlDelEspacio && deArea(c, g) && blancosConjuro(ctx, l, obj, c, g, false).some((x) => x.equipo === l.equipo);
}

/** Asaltos en que se valora un efecto que dura (armadura, beneficios, tormenta). */
export const ASALTOS_EFECTO = 4;


/** RM (con lo que la sube) y RF de `l`, como en `tirarResistencia`. */
export function resistencias(l: Luchador): { rm: number; rf: number } {
  const extra = l.bono?.resistencias ?? 0;
  return { rm: rmDe(l) + extra, rf: rfDe(l) };
}

/** P(un conjuro anímico de `atk` alcanza a `def` con un resultado de daño contra su TA de energía). */
export function pAlcanzaAnimico(atk: Luchador, def: Luchador, c: Conjuro, g: Grado): number {
  const ki = golpeDeConjuro(c, g);
  const abs = absorcionContra(def, atk, 'normal', 'ENE', RANURA_MAGIA, ki);
  return tablaPara(atk, def).pPorcentajeAlMenos(ataqueMagico(atk, def) - defensaContraConjuro(def, atk, ki, radioArea(c, g)), abs, 10);
}

/**
 * Valor de un crítico de nivel fijo (Crítico Directo) contra la RF, como `valorCritico`: fuera de
 * combate pasados 150 (o 50 en la cabeza, 100 en cabeza o corazón) y negativos si no.
 */
export function valorCriticoFijo(atk: Luchador, def: Luchador, nivel: number): number {
  const rf = rfCritico(def);
  let pFuera = 0, pNeg = 0, suma = 0;
  for (let d = 1; d <= 99; d++) {
    const f = nivel - rf - d;
    if (f <= 0) continue;
    const fuera = f > 150 ? 1 : f > 100 ? (def.cap.est.sangreEterna ? 0.1 : 0.12) : f > 50 ? 0.1 : 0;
    pFuera += fuera / 100;
    pNeg += (1 - fuera) / 100;
    suma += (f * (1 - fuera)) / 100;
  }
  const negativo = pNeg > 0 ? suma / pNeg : 0;
  return pFuera * (Math.max(0, def.pv) + 2 * amenaza(def, atk)) + pNeg * valorNegativo(atk, def, def.cap.mitadDolorCritico ? negativo * 0.6 : negativo, 0, 0);
}

/** PV que perdería en llamas desde ese nivel de la Tabla 76 en los próximos asaltos, sin apagarse. */
export function danoDeLlamas(l: Luchador, desde: number): number {
  if (desde < 100) return 0;
  let total = 0;
  for (let i = 0, n = desde; i < ASALTOS_EFECTO - 1; i++, n += 10) total += danoLlamas(l, n);
  return Math.min(total, Math.max(0, l.pv));
}

/** Valor de prender a `def` con una tirada de 1d100 + `bono` en la Tabla 76 (si no ardía más). */
export function valorPrender(def: Luchador, bono: number): number {
  if (def.bono?.cuerpoFuego) return 0;
  let v = 0;
  for (let d = 1; d <= 100; d++) {
    const n = nivelLlamas(def, d + bono);
    if (n >= 100 && n > def.llamas) v += danoDeLlamas(def, n) - danoDeLlamas(def, def.llamas);
  }
  return v / 100;
}

/** Puede atacar o golpear a `def` con este conjuro: en alcance y a la vista. */
export function aLaVista(ctx: Contexto, l: Luchador, def: Luchador, alcance: number): boolean {
  return distancia(l, def) <= alcance && (enAlcance(l, def) || visionEntre(ctx.luchadores, l, def) !== 'bloqueada');
}

/**
 * Daño de `a` por asalto contra su mejor blanco y el que recibe de quienes lo pueden atacar. Quien
 * pelea con conjuros (le queda zeon) no usa sus ataques físicos: no hace daño con ellos.
 */
export function intercambio(ctx: Contexto, a: Luchador): { hace: number; recibe: number } {
  const conMagia = !!a.magia && a.magia.reserva - a.magia.acumulado >= 50;
  let hace = 0;
  let recibe = 0;
  for (const e of enemigos(ctx, a)) {
    if (!conMagia) hace = Math.max(hace, danoEsperado(a, e, ataqueFinal(a, e), defensaFinal(e, a)) * Math.max(1, a.ataquesDeclarados || 1));
    if (faltaParaLlegar(e, a) <= metrosTotales(e)) recibe += danoEsperado(e, a, ataqueFinal(e, a), defensaFinal(a, e)) * Math.max(1, e.ataquesDeclarados || 1);
  }
  return { hace, recibe };
}

const sinBeneficio = cacheDeDecision<Luchador, { hace: number; recibe: number }>();

/**
 * Valor de un beneficio sobre `a` en los próximos asaltos: el daño de más que hace a su mejor blanco
 * y el que deja de recibir (por λ de quien lo lanza). El turno se valora como tempo: cada +10, un
 * 10% más de lo que hace y recibe (aproximación).
 */
export function valorBendicion(ctx: Contexto, l: Luchador, a: Luchador, c: Conjuro, g: Grado): number {
  // Sin el beneficio es lo mismo para todos los conjuros y grados que se prueban en esta decisión.
  let antes = sinBeneficio.get(a);
  if (!antes) sinBeneficio.set(a, (antes = intercambio(ctx, a)));
  const despues = conCambio(() => {
    bendecir(a, l, c, g.bono!);
    return () => quitarBendicion(a, l, c);
  }, () => {
    const d = intercambio(ctx, a);
    // Invisible: cada enemigo puede notarlo con Advertir (ceguera parcial); se pondera por esa chance.
    const dif = g.bono!.invisible;
    if (!dif) return d;
    let pNota = 0;
    const rivales = enemigos(ctx, a);
    for (const e of rivales) {
      const advertir = (e.ficha.advertir ?? 0) + (e.bono?.advertir ?? 0) - penAccion(e);
      pNota += dif === Infinity ? 0 : tabla(umbralPifia(e.ficha.advertir ?? 0), 0, true).pImpacto(advertir - dif + 1);
    }
    // Si lo notan todos: se agrega a lo que perciben sólo quien todavía no lo percibía, y se deshace eso.
    const notado = conCambio(() => {
      const nuevos = rivales.filter((e) => !e.percibe.has(a));
      for (const e of nuevos) e.percibe.add(a);
      return () => { for (const e of nuevos) e.percibe.delete(a); };
    }, () => intercambio(ctx, a));
    const p = rivales.length ? pNota / rivales.length : 0;
    return { hace: d.hace, recibe: (1 - p) * d.recibe + p * notado.recibe };
  });
  const turno = ((g.bono!.turno ?? 0) / 100) * (antes.hace + lambda(l) * antes.recibe);
  // Moral: sólo vale si hay un Aura de combate o efectos de miedo enfrente (aproximación: 10% de lo que recibe).
  const moral = g.bono!.frialdad && enemigos(ctx, a).some((x) => x.ki?.auraActiva || x.ficha.ki?.tecnicas.some((t) => t.efectos.some((ef) => /miedo|terror/i.test(ef.opciones.join(' ')))))
    ? 0.1 * lambda(l) * antes.recibe : 0;
  // Marcha Implacable: más cansancio por asalto para quien lo usa al atacar (aproximación: 10% de lo que hace).
  const marcha = g.bono!.energiaNecesaria && a.cap.maxCansancioAsalto < 5 && a.cansancio > 3 ? 0.1 * antes.hace : 0;
  return ASALTOS_EFECTO * (despues.hace - antes.hace + lambda(l) * (antes.recibe - despues.recibe) + turno + moral + marcha);
}

/**
 * Aliados (él incluido) dentro del radio de un beneficio que todavía no lo tienen de él (un ejemplar
 * por blanco), sin los que ya va a recibir este turno.
 */
export function aliadosEnRadio(ctx: Contexto, l: Luchador, c: Conjuro, radio: number, ya: readonly Lanzamiento[] = []): Luchador[] {
  return ctx.luchadores.filter((x) => x.equipo === l.equipo && activo(x) && distancia(l, x) <= radio &&
    !x.bendiciones.some((b) => b.fuente === l && b.origen === c) &&
    !ya.some((y) => y.conjuro === c && y.blancos?.includes(x)));
}

/**
 * Campeón: sólo uno de cada 10 del grupo de batalla (al menos uno, Arcana p.35). Los demás beneficios a
 * un aliado, uno por blanco.
 */
export function cupoAgotado(ctx: Contexto, l: Luchador, c: Conjuro, ya: readonly Lanzamiento[]): boolean {
  if (c.nombre !== 'Campeón') return false;
  const grupo = ctx.luchadores.filter((x) => x.equipo === l.equipo && activo(x)).length;
  const usados = (l.magia?.mantenidos.filter((x) => x.conjuro === c).length ?? 0) + ya.filter((x) => x.conjuro === c).length;
  return usados >= Math.max(1, Math.floor(grupo / 10));
}

/**
 * Lo que ahorra una armadura mágica en los próximos asaltos (4): el daño que dejarían de hacerle los
 * que lo pueden atacar, con la armadura puesta y sin ella.
 */
export function valorArmaduraMagica(ctx: Contexto, l: Luchador, g: Grado): number {
  const e = l.magia!;
  let sin = 0;
  let con = 0;
  for (const x of enemigos(ctx, l)) {
    const b = base(x, l);
    sin += b.golpe;
    con += conCambio(() => {
      const previa = e.armadura;
      e.armadura = { energia: g.taEnergia!, resto: g.taResto ?? 0 };
      return () => { e.armadura = previa; };
    }, () => danoEsperado(x, l, b.hab, b.def));
  }
  return lambda(l) * (sin - con) * Math.max(1, ...enemigos(ctx, l).map((x) => x.ataquesDeclarados || 1)) * ASALTOS_EFECTO;
}
