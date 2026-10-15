// IA de la magia (Core cap. 11): qué conjuro lanzar, a quién y en qué grado; cómo acumular, preparar
// o usar la magia innata; cuándo levantar un escudo. Todo en PV esperados, como el resto de la IA.

import type { Contexto, Luchador } from './modelo';
import { gradosPosibles, type Conjuro, type Grado } from './conjuros';
import {
  actPara, actPorCansancio, golpeDeConjuro, RANURA_MAGIA, alcanceMagico, bendecir, presenciaDe, costeConjuro, danoLlamas, deArea, maximoInnato, preparadoListo, quitarBendicion, rmDe,
  zeonLibre, ZEON_CONTROL_DEL_ESPACIO, type Mantenido, type PlanMagia,
} from './magia';
import {
  absorcionContra, activo, ataqueMagico, defensaEscudoMagico, ALCANCE, visionEntre, ataqueFinal, defensaFinal, distancia,
  enAlcance, faltaParaLlegar, metrosTotales, danoBase, danoEsperado, penAccion, pronostico, puedeActuar, tablaPara,
} from './calculos';
import { tabla } from './probabilidades';
import { umbralPifia, type TipoAtaque } from './reglas';
import type { Ranura } from './rasgos';
import { efectoCritico } from './valoracion';
import type { ModKi } from './ki';
import { atributo, bonoCaracteristica, pGanaControl } from './maniobras';
import {
  alcanzable, amenaza, base, enemigos, golpeDe, lambda, nuevaDecision, perfil, trabadoConAlguien, valorGolpe, valorNegativo,
} from './ia';

/**
 * Precio de un punto de zeon en PV, como el del Ki: gastar toda la reserva tiene que rendir la mitad
 * de sus PV, y se encarece al vaciarse.
 */
function precioZeon(l: Luchador): number {
  const inicial = Math.max(1, l.ficha.magia?.zeon ?? 1);
  const queda = Math.max(1, (l.magia?.reserva ?? 0) - (l.magia?.acumulado ?? 0));
  return ((0.5 * l.ficha.pv) / inicial) * Math.sqrt(inicial / queda);
}


/** Defensa de `def` contra un conjuro de ataque de `atk`: su escudo mágico, o parar (si para energía) o esquivar. */
function defensaContraConjuro(def: Luchador, atk: Luchador, ki: ModKi): number {
  if (def.magia?.escudo) return defensaEscudoMagico(def, atk, ki);
  return defensaFinal(def, atk, { kiAtk: ki, proyectil: enAlcance(atk, def) ? undefined : 'disparo' });
}

/** Lo que vale para `atk` un conjuro de ataque contra `def`: el golpe, el tempo y la contra si lo toca. */
function valorConjuroContra(atk: Luchador, def: Luchador, c: Conjuro, g: Grado): number {
  const ki = golpeDeConjuro(c, g);
  const p = pronostico(atk, def, ataqueMagico(atk, def), defensaContraConjuro(def, atk, ki), { ki, tipo: c.ta, ranura: RANURA_MAGIA });
  let v = valorGolpe(atk, def, p, 0);
  if (!def.haActuado && puedeActuar(def) && !def.ficha.acumulacion) v += p.pImpacto * amenaza(def, atk);
  if (enAlcance(atk, def) && def.ataquesRestantes > 0 && puedeActuar(def)) v -= lambda(atk) * p.pContra * golpeDe(def, atk);
  return v;
}

/**
 * Blancos de un conjuro: con área, todos los del radio alrededor del objetivo, aliados incluidos (Core
 * p.157); "alrededor del brujo", todos los de su radio salvo él. Con Control del Espacio, sólo los
 * enemigos (Arcana p.28).
 */
export function blancosConjuro(ctx: Contexto, atk: Luchador, objetivo: Luchador, c: Conjuro, g: Grado, control: boolean): Luchador[] {
  const centro = c.efecto === 'consumirEsencia' ? atk : g.area ? objetivo : null;
  if (!centro) return [objetivo];
  const radio = c.efecto === 'consumirEsencia' ? g.radio ?? 0 : g.area!;
  return ctx.luchadores.filter((x) => x !== atk && activo(x) && distancia(x, centro) <= radio && (!control || x.equipo !== atk.equipo));
}

/** Si conviene pagar Control del Espacio: hay algún aliado en el área que elegir dejar afuera. */
function quiereControl(ctx: Contexto, l: Luchador, obj: Luchador, c: Conjuro, g: Grado): boolean {
  return !!l.ficha.magia?.controlDelEspacio && deArea(c, g) && blancosConjuro(ctx, l, obj, c, g, false).some((x) => x.equipo === l.equipo);
}

export type Lanzamiento = {
  conjuro: Conjuro;
  grado: number;
  objetivo: Luchador | null;
  /** Es el conjuro determinado que tenía preparado (ya pagado). */
  preparado?: boolean;
  /** Lanzado con la magia innata: no gasta zeon. */
  innato?: boolean;
  /** Hace estallar esta mina (no lanza nada). */
  detonar?: Mantenido;
  /** Beneficiados (conjuros de efecto) o designados (Incinerar). */
  blancos?: Luchador[];
  /** Usa Control del Espacio para dejar afuera a los suyos (+10 de zeon). */
  control?: boolean;
};

/** Asaltos en que se valora un efecto que dura (armadura, beneficios, tormenta). */
const ASALTOS_EFECTO = 4;

/** P(falla una Resistencia de base `base` contra `dif`) y el fracaso medio cuando falla; el 100 resiste. */
function fallaResistencia(base: number, dif: number): { p: number; fracaso: number } {
  let n = 0;
  let suma = 0;
  for (let d = 1; d <= 99; d++) {
    const f = dif - base - d;
    if (f > 0) {
      n++;
      suma += f;
    }
  }
  return { p: n / 100, fracaso: n ? suma / n : 0 };
}

/** RM (con lo que la sube) y RF de `l`, como en `tirarResistencia`. */
function resistencias(l: Luchador): { rm: number; rf: number } {
  const extra = l.bono?.resistencias ?? 0;
  return { rm: rmDe(l) + extra, rf: l.ficha.rf + l.cap.est.bonoRfDano + (l.ki?.activo.rf ?? 0) + extra };
}

/** P(un conjuro anímico de `atk` alcanza a `def` con un resultado de daño contra su TA de energía). */
function pAlcanzaAnimico(atk: Luchador, def: Luchador, c: Conjuro, g: Grado): number {
  const ki = golpeDeConjuro(c, g);
  const abs = absorcionContra(def, atk, 'normal', 'ENE', RANURA_MAGIA, ki);
  return tablaPara(atk, def).pPorcentajeAlMenos(ataqueMagico(atk, def) - defensaContraConjuro(def, atk, ki), abs, 10);
}

/**
 * Valor de un crítico de nivel fijo (Crítico Directo) contra la RF, como `valorCritico`: fuera de
 * combate pasados 150 (o 50 en la cabeza, 100 en cabeza o corazón) y negativos si no.
 */
function valorCriticoFijo(atk: Luchador, def: Luchador, nivel: number): number {
  const rf = def.ficha.rf + def.cap.est.bonoRfCritico + def.cap.est.bonoRfDano + (def.ki?.activo.rf ?? 0) + (def.bono?.resistencias ?? 0);
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

/**
 * Sacrificio Vital (Core p.158): PV para sumarle a la Proyección (+5 cada 5), declarado antes de tirar.
 * Los que más suban el valor del golpe por encima de lo que valen esos PV (por λ), sin bajar de la
 * mitad de sus PV.
 */
export function sacrificioVitalPara(ctx: Contexto, l: Luchador, obj: Luchador, c: Conjuro, g: Grado, hab: number): number {
  const m = l.magia?.mantenidos.find((x) => x.conjuro.efecto === 'sacrificioVital');
  if (!m || perfil(l) === 'bestia') return 0;
  nuevaDecision(ctx);
  const max = Math.min(m.conjuro.grados[m.grado].maximo ?? 0, Math.floor((l.pv - l.ficha.pv / 2) / 5) * 5);
  const ki = golpeDeConjuro(c, g);
  const def = defensaContraConjuro(obj, l, ki);
  const valor = (h: number) => valorGolpe(l, obj, pronostico(l, obj, h, def, { ki, tipo: c.ta, ranura: RANURA_MAGIA }), 0);
  const sin = valor(hab);
  let mejor = 0;
  let mejorNeto = 0;
  for (let k = 10; k <= max; k += 10) {
    const neto = valor(hab + k) - sin - lambda(l) * k;
    if (neto > mejorNeto) {
      mejor = k;
      mejorNeto = neto;
    }
  }
  return mejor;
}

/** PV que perdería en llamas desde ese nivel de la Tabla 76 en los próximos asaltos, sin apagarse. */
function danoDeLlamas(l: Luchador, desde: number): number {
  if (desde < 100) return 0;
  const antes = l.llamas;
  let total = 0;
  for (let i = 0, n = desde; i < ASALTOS_EFECTO - 1; i++, n += 10) {
    l.llamas = n;
    total += danoLlamas(l);
  }
  l.llamas = antes;
  return Math.min(total, Math.max(0, l.pv));
}

/** Valor de prender a `def` con una tirada de 1d100 + `bono` en la Tabla 76 (si no ardía más). */
function valorPrender(def: Luchador, bono: number): number {
  if (def.bono?.cuerpoFuego) return 0;
  let v = 0;
  for (let d = 1; d <= 100; d++) {
    const n = def.ficha.acumulacion ? Math.floor((d + bono) / 5) : d + bono;
    if (n >= 100 && n > def.llamas) v += danoDeLlamas(def, n) - danoDeLlamas(def, def.llamas);
  }
  return v / 100;
}

/** Puede atacar o golpear a `def` con este conjuro: en alcance y a la vista. */
function aLaVista(ctx: Contexto, l: Luchador, def: Luchador, alcance: number): boolean {
  return distancia(l, def) <= alcance && (enAlcance(l, def) || visionEntre(ctx.luchadores, l, def) !== 'bloqueada');
}

/**
 * Daño de `a` por asalto contra su mejor blanco y el que recibe de quienes lo pueden atacar. Quien
 * pelea con conjuros (le queda zeon) no usa sus ataques físicos: no hace daño con ellos.
 */
function intercambio(ctx: Contexto, a: Luchador): { hace: number; recibe: number } {
  const conMagia = !!a.magia && a.magia.reserva - a.magia.acumulado >= 50;
  let hace = 0;
  let recibe = 0;
  for (const e of enemigos(ctx, a)) {
    if (!conMagia) hace = Math.max(hace, danoEsperado(a, e, ataqueFinal(a, e), defensaFinal(e, a)) * Math.max(1, a.ataquesDeclarados || 1));
    if (faltaParaLlegar(e, a) <= metrosTotales(e)) recibe += danoEsperado(e, a, ataqueFinal(e, a), defensaFinal(a, e)) * Math.max(1, e.ataquesDeclarados || 1);
  }
  return { hace, recibe };
}

/**
 * Valor de un beneficio sobre `a` en los próximos asaltos: el daño de más que hace a su mejor blanco
 * y el que deja de recibir (por λ de quien lo lanza). El turno se valora como tempo: cada +10, un
 * 10% más de lo que hace y recibe (aproximación).
 */
function valorBendicion(ctx: Contexto, l: Luchador, a: Luchador, c: Conjuro, g: Grado): number {
  const antes = intercambio(ctx, a);
  bendecir(a, l, c, g.bono!);
  let despues = intercambio(ctx, a);
  // Invisible: cada enemigo puede notarlo con Advertir (ceguera parcial); se pondera por esa chance.
  const dif = g.bono!.invisible;
  if (dif) {
    let pNota = 0;
    const rivales = enemigos(ctx, a);
    for (const e of rivales) {
      const advertir = (e.ficha.advertir ?? 0) + (e.bono?.advertir ?? 0) - penAccion(e);
      pNota += dif === Infinity ? 0 : tabla(umbralPifia(e.ficha.advertir ?? 0), 0, true).pImpacto(advertir - dif + 1);
      e.percibe.add(a);
    }
    const notado = intercambio(ctx, a);
    for (const e of rivales) e.percibe.delete(a);
    const p = rivales.length ? pNota / rivales.length : 0;
    despues = { hace: despues.hace, recibe: (1 - p) * despues.recibe + p * notado.recibe };
  }
  quitarBendicion(a, l, c);
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
function aliadosEnRadio(ctx: Contexto, l: Luchador, c: Conjuro, radio: number, ya: readonly Lanzamiento[] = []): Luchador[] {
  return ctx.luchadores.filter((x) => x.equipo === l.equipo && activo(x) && distancia(l, x) <= radio &&
    !x.bendiciones.some((b) => b.fuente === l && b.conjuro === c) &&
    !ya.some((y) => y.conjuro === c && y.blancos?.includes(x)));
}

/**
 * Campeón: sólo uno de cada 10 del grupo de batalla (al menos uno, Arcana p.35). Los demás beneficios a
 * un aliado, uno por blanco.
 */
function cupoAgotado(ctx: Contexto, l: Luchador, c: Conjuro, ya: readonly Lanzamiento[]): boolean {
  if (c.nombre !== 'Campeón') return false;
  const grupo = ctx.luchadores.filter((x) => x.equipo === l.equipo && activo(x)).length;
  const usados = (l.magia?.mantenidos.filter((x) => x.conjuro === c).length ?? 0) + ya.filter((x) => x.conjuro === c).length;
  return usados >= Math.max(1, Math.floor(grupo / 10));
}

/**
 * El mejor uso de un conjuro en un grado: a quién, y cuánto vale en PV (sin restar su zeon). Cada
 * conjuro se valora a su manera, como se resuelve en el motor.
 */
function mejorUso(ctx: Contexto, l: Luchador, c: Conjuro, i: number, alcance: number, ya: readonly Lanzamiento[]): { l: Lanzamiento; valor: number; extra: number } | null {
  const g = c.grados[i];
  const e = l.magia!;
  let mejor: { l: Lanzamiento; valor: number; extra: number } | null = null;
  const probar = (x: Lanzamiento, valor: number, extra = 0) => {
    if (valor - extra > (mejor ? mejor.valor - mejor.extra : 0)) mejor = { l: x, valor, extra };
  };
  const signo = (b: Luchador) => (b.equipo === l.equipo ? -lambda(l) : 1);
  switch (c.efecto) {
    case undefined: {
      if (c.tipos.includes('ataque')) {
        for (const obj of enemigos(ctx, l)) {
          if (!aLaVista(ctx, l, obj, alcance)) continue;
          const control = quiereControl(ctx, l, obj, c, g);
          let v = 0;
          for (const b of blancosConjuro(ctx, l, obj, c, g, control)) v += signo(b) * valorConjuroContra(l, b, c, g);
          probar({ conjuro: c, grado: i, objetivo: obj, control }, v, control ? precioZeon(l) * ZEON_CONTROL_DEL_ESPACIO : 0);
        }
      } else if (g.taEnergia !== undefined && !e.armadura) probar({ conjuro: c, grado: i, objetivo: null }, valorArmaduraMagica(ctx, l, g));
      return mejor;
    }
    case 'secar':
    case 'consumirEsencia':
    case 'criticoDirecto': {
      for (const obj of enemigos(ctx, l)) {
        if (c.efecto === 'consumirEsencia' ? distancia(l, obj) > (g.radio ?? 0) : !aLaVista(ctx, l, obj, alcance)) continue;
        const control = quiereControl(ctx, l, obj, c, g);
        let v = 0;
        for (const b of blancosConjuro(ctx, l, obj, c, g, control)) {
          const r = resistencias(b);
          const p = pAlcanzaAnimico(l, b, c, g);
          if (c.efecto === 'criticoDirecto') {
            v += signo(b) * p * fallaResistencia(r.rm, g.rm ?? 0).p * valorCriticoFijo(l, b, g.critico ?? 0);
            continue;
          }
          const f = fallaResistencia(c.efecto === 'secar' ? Math.max(r.rm, r.rf) : r.rm, g.rm ?? 0);
          const pv = Math.min(Math.max(0, b.pv), c.efecto === 'secar' ? f.fracaso / 2 : f.fracaso);
          v += signo(b) * p * f.p * pv;
        }
        probar({ conjuro: c, grado: i, objetivo: obj, control }, v, control ? precioZeon(l) * ZEON_CONTROL_DEL_ESPACIO : 0);
        if (c.efecto === 'consumirEsencia') break;
      }
      return mejor;
    }
    case 'flash': {
      // Ciego, cada asalto vale lo que un −90 a sus acciones durante medio intercambio (aproximación).
      const control = !!l.ficha.magia?.controlDelEspacio && ctx.luchadores.some((x) => x !== l && x.equipo === l.equipo && activo(x) && distancia(l, x) <= (g.radio ?? 0));
      let v = 0;
      for (const b of ctx.luchadores) {
        if (b === l || !activo(b) || distancia(l, b) > (g.radio ?? 0) || (control && b.equipo === l.equipo) || b.cegado > 1) continue;
        const f = fallaResistencia(resistencias(b).rf, g.rf ?? 0);
        const asaltos = Math.min(3, Math.floor(f.fracaso / 10));
        const rival = b.equipo === l.equipo ? enemigos(ctx, b)[0] : l;
        if (!rival || !asaltos) continue;
        v += signo(b) * f.p * asaltos * valorNegativo(rival, b, 90, 1, 0) / 2;
      }
      probar({ conjuro: c, grado: i, objetivo: null, control }, v, control ? precioZeon(l) * ZEON_CONTROL_DEL_ESPACIO : 0);
      return mejor;
    }
    case 'incinerar': {
      const blancos: Luchador[] = [];
      let v = 0;
      for (const b of enemigos(ctx, l)) {
        if (!aLaVista(ctx, l, b, g.radio ?? 0)) continue;
        const valor = fallaResistencia(resistencias(b).rm + (b.bono?.resCalor ?? 0), g.rm ?? 0).p * valorPrender(b, g.llamas ?? 0);
        if (valor > 0) {
          blancos.push(b);
          v += valor;
        }
      }
      if (blancos.length) probar({ conjuro: c, grado: i, objetivo: null, blancos }, v);
      return mejor;
    }
    case 'tormenta': {
      const ki = golpeDeConjuro(c, g);
      for (const obj of enemigos(ctx, l)) {
        if (!aLaVista(ctx, l, obj, alcance)) continue;
        const control = !!l.ficha.magia?.controlDelEspacio && ctx.luchadores.some((x) => x.equipo === l.equipo && activo(x) && distancia(x, obj) <= g.area!);
        let v = 0;
        for (const b of ctx.luchadores) {
          if (!activo(b) || distancia(b, obj) > g.area! || (control && b.equipo === l.equipo)) continue;
          // El ataque automático no tira: su habilidad es la final (aproximación: la media de una tirada menos).
          const dano = danoEsperado(l, b, (g.habilidad ?? 0) - 55, defensaContraConjuro(b, l, ki), { ki, tipo: c.ta, ranura: RANURA_MAGIA });
          v += signo(b) * Math.min(Math.max(0, b.pv), (ASALTOS_EFECTO - 1) * dano);
        }
        probar({ conjuro: c, grado: i, objetivo: obj, control }, v, (control ? ZEON_CONTROL_DEL_ESPACIO : 0) * precioZeon(l));
      }
      return mejor;
    }
    case 'bendicion': {
      if (c.blanco === 'aliados') {
        const blancos = aliadosEnRadio(ctx, l, c, g.radio ?? 0);
        let v = 0;
        for (const a of blancos) v += valorBendicion(ctx, l, a, c, g);
        if (blancos.length) probar({ conjuro: c, grado: i, objetivo: null, blancos }, v);
      } else {
        if (cupoAgotado(ctx, l, c, ya)) return null;
        for (const a of aliadosEnRadio(ctx, l, c, alcance, ya)) probar({ conjuro: c, grado: i, objetivo: null, blancos: [a] }, valorBendicion(ctx, l, a, c, g));
      }
      return mejor;
    }
    case 'mitigar': {
      for (const a of ctx.luchadores) {
        if (!activo(a) || distancia(l, a) > alcance) continue;
        // Un ser de fuego enemigo: 5 de daño por intensidad si no supera la RM.
        if (a.equipo !== l.equipo && a.ficha.naturaleza?.includes('fuego')) {
          const p = fallaResistencia(resistencias(a).rm, g.rm ?? 0).p;
          probar({ conjuro: c, grado: i, objetivo: a }, p * (a.ficha.acumulacion ? 25 : 5) * (g.intensidades ?? 0));
          continue;
        }
        if (a.equipo !== l.equipo || !a.llamas) continue;
        const queda = Math.max(0, a.llamas - 20 * (g.intensidades ?? 0));
        probar({ conjuro: c, grado: i, objetivo: a }, lambda(l) * (danoDeLlamas(a, a.llamas) - danoDeLlamas(a, queda < 100 ? 0 : queda)));
      }
      return mejor;
    }
    case 'calmar': {
      // Quitarle el Miedo (−60) a los suyos del radio.
      let v = 0;
      for (const a of ctx.luchadores) {
        if (a.equipo !== l.equipo || !activo(a) || distancia(l, a) > (g.radio ?? 0) || !(a.ficha.estados?.miedo || a.aura?.estado === 'miedo')) continue;
        const rival = enemigos(ctx, a).sort((x, y) => distancia(a, x) - distancia(a, y))[0];
        if (rival) v += valorNegativo(rival, a, 60, 1, 0);
      }
      probar({ conjuro: c, grado: i, objetivo: null, control: !!l.ficha.magia?.controlDelEspacio && v > 0 }, v, l.ficha.magia?.controlDelEspacio ? precioZeon(l) * ZEON_CONTROL_DEL_ESPACIO : 0);
      return mejor;
    }
    case 'extasis': {
      // −20 a toda acción en lugar de sus negativos: malo para quien tiene pocos, bueno para quien tiene muchos.
      const control = !!l.ficha.magia?.controlDelEspacio;
      const blancos: Luchador[] = [];
      let v = 0;
      for (const b of ctx.luchadores) {
        if (b === l || !activo(b) || distancia(l, b) > (g.radio ?? 0) || b.extasis) continue;
        const delta = 20 + b.penFisico + b.penTecnica - penAccion(b);
        let valor: number;
        if (b.equipo === l.equipo) {
          const rival = enemigos(ctx, b).sort((x, y) => distancia(b, x) - distancia(b, y))[0];
          valor = delta < 0 && rival ? 2 * valorNegativo(rival, b, -delta, 1, 0) : delta > 0 && rival ? -2 * lambda(l) * valorNegativo(rival, b, delta, 1, 0) : 0;
        } else {
          const p = pAlcanzaAnimico(l, b, c, g) * fallaResistencia(resistencias(b).rm, g.rm ?? 0).p;
          valor = 2 * p * (delta > 0 ? valorNegativo(l, b, delta, 1, 0) : -valorNegativo(b, l, -delta, 1, 0));
        }
        if (control && valor <= 0) continue;
        blancos.push(b);
        v += valor;
      }
      const obj = blancos.find((b) => b.equipo !== l.equipo) ?? blancos[0];
      if (obj) probar({ conjuro: c, grado: i, objetivo: obj, blancos, control }, v, control ? precioZeon(l) * ZEON_CONTROL_DEL_ESPACIO : 0);
      return mejor;
    }
    case 'lazos': {
      // Presa sin penalizador con la Fuerza de los lazos; sujeto, con parálisis y sin poder romperlos.
      const ki = { ...golpeDeConjuro(c, g), apresamiento: g.fuerza ?? 0 };
      for (const obj of enemigos(ctx, l)) {
        if (!aLaVista(ctx, l, obj, alcance) || obj.apresadoPor || obj.ficha.acumulacion) continue;
        const p = pronostico(l, obj, ataqueMagico(l, obj), defensaContraConjuro(obj, l, ki), { maniobra: 'presa', ki, tipo: 'ENE', ranura: RANURA_MAGIA });
        const control = pGanaControl(g.fuerza ?? 0, Math.max(atributo(obj, 'FUE'), atributo(obj, 'AGI')));
        probar({ conjuro: c, grado: i, objetivo: obj }, p.pManiobra * control * 2 * valorNegativo(l, obj, 80, 1, 0));
      }
      return mejor;
    }
    case 'barrera': {
      // Un muro entre él y quien viene hacia él: cada uno que lo cruce recibe un ataque automático.
      if (e.mantenidos.some((x) => x.muro)) return null;
      const ki = golpeDeConjuro(c, g);
      const vienen = enemigos(ctx, l).filter((x) => !enAlcance(l, x) && faltaParaLlegar(x, l) <= 2 * metrosTotales(x) && !x.ficha.armasDistancia?.length);
      if (!vienen.length) return null;
      const obj = vienen.sort((a, b) => distancia(l, a) - distancia(l, b))[0];
      let v = 0;
      for (const x of vienen) v += danoEsperado(l, x, (g.habilidad ?? 240) - 55, defensaContraConjuro(x, l, ki), { ki, tipo: 'CAL', ranura: RANURA_MAGIA });
      probar({ conjuro: c, grado: i, objetivo: obj }, v);
      return mejor;
    }
    case 'mina': {
      // Donde más enemigos haya en el radio; se descuenta que se muevan antes de que estalle.
      if (e.mantenidos.some((x) => x.conjuro === c)) return null;
      const ki = golpeDeConjuro(c, g);
      for (const obj of enemigos(ctx, l)) {
        if (!aLaVista(ctx, l, obj, alcance)) continue;
        let v = 0;
        for (const b of ctx.luchadores) {
          if (!activo(b) || distancia(b, obj) > (g.area ?? 0)) continue;
          const dano = danoEsperado(l, b, 280 - 55, defensaContraConjuro(b, l, ki), { ki, tipo: 'CAL', ranura: RANURA_MAGIA });
          v += (b.equipo === l.equipo ? (l.ficha.magia?.controlDelEspacio ? 0 : -lambda(l)) : 1) * dano;
        }
        probar({ conjuro: c, grado: i, objetivo: obj }, 0.6 * v);
      }
      return mejor;
    }
    case 'fundir': {
      // Los enemigos armados del radio sueltan el arma si fallan: valen lo que dejan de pegar.
      const blancos: Luchador[] = [];
      let v = 0;
      for (const b of enemigos(ctx, l)) {
        if (distancia(l, b) > (g.radio ?? 0) || b.desarmado || b.cap.desarmado || !b.ficha.arma || b.ficha.arma.desarmado) continue;
        const pObjeto = Math.max(0, Math.min(1, ((g.rf ?? 0) - 20 - (b.ficha.arma.calidad ?? 0)) / 100));
        const valor = pAlcanzaAnimico(l, b, c, g) * pObjeto * 1.5 * amenaza(b, l);
        if (valor <= 0) continue;
        blancos.push(b);
        v += valor;
      }
      if (blancos.length) probar({ conjuro: c, grado: i, objetivo: blancos[0], blancos }, v);
      return mejor;
    }
    case 'sacrificioVital':
      // Se lanza una vez y queda: rinde en los ataques que vienen (aproximación: 5% de sus PV por asalto).
      probar({ conjuro: c, grado: i, objetivo: null }, ASALTOS_EFECTO * 0.05 * l.ficha.pv);
      return mejor;
    case 'transporte': {
      // Salir de un cuerpo a cuerpo: se ahorra lo que le pegarían este asalto y el siguiente.
      if (!trabadoConAlguien(l)) return null;
      // Si lo alcanzan de nuevo enseguida (corren más que lo que se aleja), apenas gana un respiro.
      let v = 0;
      for (const x of enemigos(ctx, l)) if (enAlcance(l, x)) v += amenaza(x, l) * (metrosTotales(x) < (g.metros ?? 0) ? 1.5 : 0.25);
      probar({ conjuro: c, grado: i, objetivo: l }, lambda(l) * v);
      return mejor;
    }
    case 'holograma': {
      // Cada enemigo que no lo descubra le erra la mitad de las veces a la imagen (por λ, unos asaltos).
      if (l.holograma) return null;
      let v = 0;
      for (const x of enemigos(ctx, l)) {
        if (l.descubre.has(x)) continue;
        const pAdv = tabla(umbralPifia(x.ficha.advertir ?? 0), 0, true).pImpacto((x.ficha.advertir ?? 0) - 240 + 1);
        const pBus = tabla(umbralPifia(x.ficha.buscar ?? 0), 0, true).pImpacto((x.ficha.buscar ?? 0) - 140 + 1);
        v += 0.5 * (1 - Math.max(pAdv, pBus)) * amenaza(x, l);
      }
      probar({ conjuro: c, grado: i, objetivo: null }, lambda(l) * 2 * v);
      return mejor;
    }
    case 'atar': {
      // Con sogas o cadenas en la escena: como Lazos, pero se pueden romper.
      if (!ctx.opciones.cuerdas) return null;
      const fuerza = ctx.opciones.cuerdas === 'cadena' ? 12 : 10;
      for (const obj of enemigos(ctx, l)) {
        if (!aLaVista(ctx, l, obj, alcance) || obj.apresadoPor || obj.ficha.acumulacion) continue;
        const p = tabla(0, obj.cap.umbralDefensa, false).pImpacto((g.habilidad ?? 0) - 55 - defensaFinal(obj, l));
        const control = pGanaControl(fuerza, Math.max(atributo(obj, 'FUE'), atributo(obj, 'AGI')));
        probar({ conjuro: c, grado: i, objetivo: obj }, p * control * valorNegativo(l, obj, 80, 1, 0));
      }
      return mejor;
    }
    case 'crearFuego': {
      for (const obj of enemigos(ctx, l)) {
        if (!aLaVista(ctx, l, obj, alcance) || obj.llamas) continue;
        probar({ conjuro: c, grado: i, objetivo: obj }, valorPrender(obj, 20 * (g.intensidades ?? 0)));
      }
      return mejor;
    }
    case 'controlFuego': {
      for (const obj of ctx.luchadores) {
        if (!activo(obj) || !aLaVista(ctx, l, obj, alcance)) continue;
        if (obj.equipo !== l.equipo && obj.ficha.naturaleza?.includes('fuego')) {
          const p = fallaResistencia(resistencias(obj).rm, g.rm ?? 0).p;
          probar({ conjuro: c, grado: i, objetivo: obj }, p * (Math.max(0, obj.pv) + 2 * amenaza(obj, l)));
        } else if (obj.llamas) {
          const n = 20 * (g.intensidades ?? 0);
          const cambio = obj.equipo === l.equipo
            ? lambda(l) * (danoDeLlamas(obj, obj.llamas) - danoDeLlamas(obj, obj.llamas - n < 100 ? 0 : obj.llamas - n))
            : danoDeLlamas(obj, obj.llamas + n) - danoDeLlamas(obj, obj.llamas);
          probar({ conjuro: c, grado: i, objetivo: obj }, cambio);
        }
      }
      return mejor;
    }
    case 'detectar': {
      // Ubicar a un enemigo invisible: de ceguera absoluta a parcial contra él.
      const blancos = enemigos(ctx, l).filter((x) => x.bono?.invisible && !l.detecta.has(x) && distancia(l, x) <= (g.radio ?? 0));
      let v = 0;
      for (const x of blancos) v += fallaResistencia(resistencias(x).rm, g.rm ?? 0).p * ASALTOS_EFECTO * 0.3 * amenaza(x, l);
      if (blancos.length) probar({ conjuro: c, grado: i, objetivo: null, blancos }, v);
      return mejor;
    }
    case 'naturaleza': {
      // Sólo hay algo que hacer si enfrente hay seres de esa naturaleza en el radio.
      let v = 0;
      for (const x of enemigos(ctx, l)) {
        if (distancia(l, x) > (g.radio ?? 0) || !x.ficha.naturaleza?.includes(g.naturaleza ?? '')) continue;
        const f = fallaResistencia(resistencias(x).rm, g.rm ?? 0);
        v += f.p * (g.contraNaturaleza === 'domina' ? Math.max(0, x.pv) + 2 * amenaza(x, l) : Math.min(Math.max(0, x.pv), (x.ficha.acumulacion ? 20 : 2) * f.fracaso) * 2);
      }
      const suyos = ctx.luchadores.filter((x) => x.equipo === l.equipo && activo(x) && distancia(l, x) <= (g.radio ?? 0));
      if (v > 0) probar({ conjuro: c, grado: i, objetivo: null, blancos: suyos }, v);
      return mejor;
    }
    case 'reparar': {
      for (const a of aliadosEnRadio(ctx, l, c, alcance)) {
        if (!a.armaRota) continue;
        // Recupera más o menos el doble de lo que hace desarmado (aproximación).
        probar({ conjuro: c, grado: i, objetivo: a }, ASALTOS_EFECTO * intercambio(ctx, a).hace);
      }
      return mejor;
    }
    case 'capacidades':
      // Sólo cambia algo en un choque de descargas (el bono de Poder): si hay con quién chocar.
      if (!ctx.opciones.disparosParalelos || !enemigos(ctx, l).some((x) => x.magia || x.ficha.ki?.tecnicas.length)) return null;
      probar({ conjuro: c, grado: i, objetivo: null }, ASALTOS_EFECTO * 2);
      return mejor;
    case 'consumirVida': {
      // Lo vale cuando la reserva no alcanza para el resto del combate: el zeon que daría en dos
      // asaltos, a su precio, menos los PV (por λ).
      if (zeonLibre(e) >= 3 * l.ficha.magia!.act || l.pv <= l.ficha.pv * 0.6) return null;
      const pv = Math.min(g.maximo ?? 0, Math.floor((l.pv - l.ficha.pv / 2) / 5) * 5);
      probar({ conjuro: c, grado: i, objetivo: null }, 2 * (precioZeon(l) * 20 * pv - lambda(l) * pv));
      return mejor;
    }
    case 'sacrificioPoder': {
      // Más ACT por asalto (5 cada 10 de zeon): lo que adelanta de su mejor conjuro, menos el zeon que pierde.
      const meta = metaMagica(ctx, l, alcance);
      if (!meta) return null;
      const act = (g.maximo ?? 0) / 2;
      probar({ conjuro: c, grado: i, objetivo: null }, ASALTOS_EFECTO * ((act / l.ficha.magia!.act) * meta.porAsalto - precioZeon(l) * act));
      return mejor;
    }
    case 'curar': {
      for (const a of aliadosEnRadio(ctx, l, c, alcance)) {
        if (a.pv > 0.7 * a.ficha.pv) continue;
        probar({ conjuro: c, grado: i, objetivo: a }, lambda(l) * Math.min(g.curar ?? 0, a.ficha.pv - a.pv));
      }
      return mejor;
    }
  }
  return null;
}

/** Un conjuro que se puede mirar este asalto: activo y, si se mantiene, sin otro ejemplar (uno por blanco en los beneficios a un aliado). */
function lanzable(e: NonNullable<Luchador['magia']>, c: Conjuro, ya: readonly Lanzamiento[]): boolean {
  const porBlanco = c.blanco === 'aliado';
  return c.accion === 'activa' && (porBlanco || !e.mantenidos.some((x) => x.conjuro === c)) &&
    (porBlanco || !ya.some((x) => x.conjuro === c && !c.tipos.includes('ataque')));
}

/**
 * Su turno con magia (Core p.117): los conjuros activos que rinden más que su zeon (y lo que costará
 * mantenerlos), de a uno mientras le alcance lo acumulado; el conjuro preparado, si ya está listo y
 * rinde algo (su zeon ya está reunido); o, si este asalto usa la magia innata, el mejor innato. Si no,
 * esperar acumulando si no tiene a nadie cuerpo a cuerpo (hacer otra cosa le baja el ACT a la mitad);
 * o null para pelear como siempre.
 */
export function accionMagica(ctx: Contexto, l: Luchador): { lanzar: Lanzamiento[] } | { esperar: true } | null {
  const e = l.magia;
  if (!e || perfil(l) === 'bestia') return null;
  nuevaDecision(ctx);
  const inteligencia = l.ficha.inteligencia ?? 6;
  const alcance = alcanceMagico(l.ficha.magia!.proyeccion);
  if (e.innato) {
    const inn = mejorInnato(ctx, l, alcance);
    return inn ? { lanzar: [inn.l] } : null;
  }
  const res: Lanzamiento[] = [];
  // Una mina puesta: estalla si lo que haría ya vale la pena (no se espera más que eso).
  const mina = e.mantenidos.find((x) => x.conjuro.efecto === 'mina' && x.zona);
  if (mina) {
    const z = mina.zona!;
    const control = !!l.ficha.magia?.controlDelEspacio && zeonLibre(e) >= ZEON_CONTROL_DEL_ESPACIO;
    const gM = mina.conjuro.grados[mina.grado];
    const ki = golpeDeConjuro(mina.conjuro, gM);
    let v = 0;
    let enemigosDentro = 0;
    for (const b of ctx.luchadores) {
      const d = Math.hypot(b.pos.x - z.x, b.pos.y - z.y);
      if (!activo(b) || d > z.radio || (control && b.equipo === l.equipo)) continue;
      const dano = danoEsperado(l, b, (d < 1 ? 320 : d < z.radio / 2 ? 280 : 240) - 55, defensaContraConjuro(b, l, ki), { ki, tipo: 'CAL', ranura: RANURA_MAGIA });
      if (b.equipo !== l.equipo) enemigosDentro++;
      v += (b.equipo === l.equipo ? -lambda(l) : 1) * dano;
    }
    if (enemigosDentro && v > 0) res.push({ conjuro: mina.conjuro, grado: mina.grado, objetivo: null, detonar: mina, control });
  }
  // El preparado: lo lanza si rinde algo; si no, lo sigue sosteniendo.
  const pr = preparadoListo(e);
  if (pr && lanzable(e, pr.conjuro, res)) {
    const uso = mejorUso(ctx, l, pr.conjuro, pr.grado, alcance, res);
    const extra = precioZeon(l) * (pr.conjuro.grados[pr.grado].mantenimiento ?? 0) * (ASALTOS_EFECTO - 1);
    if (uso && uso.valor - uso.extra - extra > 0 && (!uso.l.control || zeonLibre(e) >= ZEON_CONTROL_DEL_ESPACIO)) res.push({ ...uso.l, preparado: true });
  }
  let disponible = e.acumulado;
  for (;;) {
    let mejor: { l: Lanzamiento; valor: number; zeon: number } | null = null;
    for (const c of e.conjuros) {
      if (!lanzable(e, c, res)) continue;
      for (const i of gradosPosibles(c, inteligencia, l.ficha.magia)) {
        const g = c.grados[i];
        if (g.zeon > disponible) continue;
        const uso = mejorUso(ctx, l, c, i, alcance, res);
        if (!uso) continue;
        const zeon = costeConjuro(c, g, uso.l.control);
        if (zeon > disponible) continue;
        const coste = precioZeon(l) * (zeon + (g.mantenimiento ?? 0) * (ASALTOS_EFECTO - 1));
        if (uso.valor - coste > (mejor?.valor ?? 0)) mejor = { l: uso.l, valor: uso.valor - coste, zeon };
      }
    }
    if (!mejor) break;
    res.push(mejor.l);
    disponible -= mejor.zeon;
  }
  if (res.length) return { lanzar: res };
  // Sin nada que valga la pena lanzar: espera acumulando, salvo que lo tengan trabado.
  if (!trabadoConAlguien(l) && enemigos(ctx, l).some((x) => distancia(l, x) <= alcance)) return { esperar: true };
  return null;
}

/**
 * Magia por Capacidades en un choque (Core p.159): cuánto Poder compra (25 de zeon cada uno, hasta lo
 * del grado por asalto) para subir el bono de Poder del choque, si le sobra zeon (más de 300 libres).
 */
export function poderPorCapacidades(l: Luchador): number {
  const m = l.magia?.mantenidos.find((x) => x.conjuro.efecto === 'capacidades');
  if (!m || zeonLibre(l.magia!) < 300) return 0;
  return Math.floor((m.conjuro.grados[m.grado].maximo ?? 0) / 25);
}

/**
 * Interceptar una descarga con un conjuro de ataque (Core p.117): con el que más daño base tenga de los
 * que le alcanzan, si su Proyección probablemente llega a 50 del ataque y su descarga no queda muy por
 * debajo (en 1d100 + daño + Poder, perder por más de 50 la deja pasar).
 */
export function interceptarCon(ctx: Contexto, l: Luchador, atk: Luchador, resultado: number, baseAtk: number, atkEsMago: boolean): Lanzamiento | null {
  const e = l.magia!;
  if (perfil(l) === 'bestia') return null;
  const poder = bonoCaracteristica(atributo(l, 'POD'));
  const poderAtk = atkEsMago ? bonoCaracteristica(atributo(atk, 'POD')) : 0;
  let mejor: Lanzamiento | null = null;
  let mejorDano = -1;
  for (const c of e.conjuros) {
    if (!c.tipos.includes('ataque') || c.accion !== 'activa' || c.efecto) continue;
    for (const i of gradosPosibles(c, l.ficha.inteligencia ?? 6, l.ficha.magia)) {
      const g = c.grados[i];
      // Usando la magia innata, intercepta con un innato; si no, con lo acumulado.
      const alcanza = e.innato ? g.zeon <= maximoInnato(l.ficha.magia!.act) && !e.mantenidos.some((x) => x.innato) : g.zeon <= e.acumulado;
      if (!alcanza || (g.dano ?? 0) <= mejorDano) continue;
      mejor = { conjuro: c, grado: i, objetivo: atk, ...(e.innato ? { innato: true } : {}) };
      mejorDano = g.dano ?? 0;
    }
  }
  if (!mejor) return null;
  // P(su Proyección llega a resultado − 50) con la tabla de tiradas abiertas.
  const hab = ataqueMagico(l, atk);
  const pLlega = tabla(umbralPifia(l.ficha.magia!.proyeccion), 0, true).pImpacto(hab - (resultado - 50) + 1);
  return pLlega >= 0.5 && mejorDano + poder >= baseAtk + poderAtk - 50 ? mejor : null;
}

/**
 * El mejor conjuro innato (Core p.117, Tabla 58): de valor zeónico hasta lo que da su ACT, sin gastar
 * zeon; si se mantiene, se sostiene gratis, pero mientras tanto no puede lanzar otro innato.
 */
function mejorInnato(ctx: Contexto, l: Luchador, alcance: number): { l: Lanzamiento; valor: number } | null {
  const e = l.magia!;
  if (e.mantenidos.some((x) => x.innato)) return null;
  const maximo = maximoInnato(l.ficha.magia!.act);
  let mejor: { l: Lanzamiento; valor: number } | null = null;
  for (const c of e.conjuros) {
    if (!lanzable(e, c, [])) continue;
    for (const i of gradosPosibles(c, l.ficha.inteligencia ?? 6, l.ficha.magia)) {
      if (c.grados[i].zeon > maximo) continue;
      const uso = mejorUso(ctx, l, c, i, alcance, []);
      if (!uso || (uso.l.control && zeonLibre(e) < ZEON_CONTROL_DEL_ESPACIO)) continue;
      const v = uso.valor - uso.extra;
      if (v > (mejor?.valor ?? 0)) mejor = { l: { ...uso.l, innato: true }, valor: v };
    }
  }
  return mejor;
}

/** Valor neto por asalto de esperar al mejor conjuro: lo que rinde menos su zeon, dividido por los asaltos que tarda. */
interface Meta {
  conjuro: Conjuro;
  grado: number;
  /** Zeon que le falta para lanzarlo, ya con lo acumulado (o reunido, si es el preparado). */
  falta: number;
  porAsalto: number;
}

/** El conjuro al que conviene apuntar acumulando: el que más rinde por asalto de espera. */
function metaMagica(ctx: Contexto, l: Luchador, alcance: number): Meta | null {
  const e = l.magia!;
  let mejor: Meta | null = null;
  for (const c of e.conjuros) {
    // Los que dan ACT o zeon no son una meta (y se valoran mirando la meta).
    if (!lanzable(e, c, []) || c.efecto === 'sacrificioPoder' || c.efecto === 'consumirVida') continue;
    for (const i of gradosPosibles(c, l.ficha.inteligencia ?? 6, l.ficha.magia)) {
      const g = c.grados[i];
      if (g.zeon > zeonLibre(e) + e.acumulado + (e.preparado?.zeon ?? 0)) continue;
      const uso = mejorUso(ctx, l, c, i, alcance, []);
      if (!uso) continue;
      const zeon = costeConjuro(c, g, uso.l.control);
      const neto = uso.valor - precioZeon(l) * (zeon + (g.mantenimiento ?? 0) * (ASALTOS_EFECTO - 1));
      if (neto <= 0) continue;
      const pr = e.preparado;
      const reunido = pr && pr.conjuro === c && pr.grado === i ? pr.zeon : e.acumulado;
      const falta = Math.max(0, zeon - reunido);
      const porAsalto = neto / (1 + Math.ceil(falta / Math.max(1, actPara(l, c))));
      if (porAsalto > (mejor?.porAsalto ?? 0)) mejor = { conjuro: c, grado: i, falta, porAsalto };
    }
  }
  return mejor;
}

/** Puntos de cansancio que conserva siempre (por debajo de 5 empiezan los negativos, Core p.62). */
const CANSANCIO_RESERVADO = 5;

/**
 * Lo que decide al empezar el asalto (Core p.117): acumular magia pura o preparar un conjuro
 * determinado (cuando es su Conjuro Especialista, por el +10 al ACT), o usar la magia innata si su mejor
 * innato rinde más que un asalto de espera. Si con cansancio (Explotación de la Energía Física) o con
 * Sacrificio de Poder llega a lanzar la meta este mismo asalto, los gasta. Con Consumir Vida por Magia
 * convierte PV en zeon cuando la reserva se le acaba.
 */
export function planMagia(ctx: Contexto, l: Luchador): PlanMagia {
  const e = l.magia;
  if (!e || !enemigos(ctx, l).length) return { acumula: false };
  if (perfil(l) === 'bestia') return { acumula: zeonLibre(e) > 0 };
  nuevaDecision(ctx);
  const alcance = alcanceMagico(l.ficha.magia!.proyeccion);
  const plan: PlanMagia = { acumula: zeonLibre(e) > 0 };
  // Consumir Vida por Magia: cuando le queda menos de dos asaltos de ACT libres y conserva la mitad de sus PV.
  const vida = e.mantenidos.find((x) => x.conjuro.efecto === 'consumirVida');
  if (vida && zeonLibre(e) < 2 * l.ficha.magia!.act && l.pv > l.ficha.pv / 2) {
    const max = vida.conjuro.grados[vida.grado].maximo ?? 0;
    plan.consumirVida = Math.min(max, Math.floor((l.pv - l.ficha.pv / 2) / 5) * 5);
  }
  // Pasarle su ACT de zeon a un mago aliado que se está quedando sin, si a él le sobra (Core p.117).
  const alcanceZeon = l.ficha.magia!.transmision ? presenciaDe(l) : ALCANCE;
  const necesitado = ctx.luchadores.find((x) => x !== l && x.equipo === l.equipo && activo(x) && x.magia &&
    zeonLibre(x.magia) < 2 * (x.ficha.magia?.act ?? 0) && distancia(l, x) <= alcanceZeon);
  if (necesitado && zeonLibre(e) > 600) return { acumula: false, transferir: { a: necesitado, zeon: l.ficha.magia!.act } };
  const meta = metaMagica(ctx, l, alcance);
  const inn = mejorInnato(ctx, l, alcance);
  if (inn && inn.valor > (meta?.porAsalto ?? 0)) return { ...plan, acumula: false, innato: true };
  if (!meta || !plan.acumula) return plan;
  const especialista = actPara(l, meta.conjuro) > l.ficha.magia!.act;
  if (especialista) plan.preparar = { conjuro: meta.conjuro, grado: meta.grado };
  // Lo que le falta después de este asalto de ACT: con cansancio o Sacrificio de Poder, ¿llega ya?
  let falta = meta.falta - actPara(l, especialista ? meta.conjuro : null);
  if (falta > 0 && falta <= actPorCansancio(l) * Math.max(0, l.cansancio - CANSANCIO_RESERVADO) && (l.ficha.magia!.explotacion ?? 0) > 0) {
    plan.cansancio = Math.ceil(falta / actPorCansancio(l));
    falta = 0;
  }
  const poder = e.mantenidos.find((x) => x.conjuro.efecto === 'sacrificioPoder');
  if (falta > 0 && poder) {
    const zeon = Math.ceil(falta / 5) * 10;
    if (zeon <= (poder.conjuro.grados[poder.grado].maximo ?? 0) && zeon <= zeonLibre(e) - meta.falta) plan.sacrificioPoder = zeon;
  }
  return plan;
}

/**
 * Lo que ahorra una armadura mágica en los próximos asaltos (4): el daño que dejarían de hacerle los
 * que lo pueden atacar, con la armadura puesta y sin ella.
 */
function valorArmaduraMagica(ctx: Contexto, l: Luchador, g: Grado): number {
  const e = l.magia!;
  let sin = 0;
  let con = 0;
  for (const x of enemigos(ctx, l)) {
    const b = base(x, l);
    sin += b.golpe;
    e.armadura = { energia: g.taEnergia!, resto: g.taResto ?? 0 };
    con += danoEsperado(x, l, b.hab, b.def);
    e.armadura = null;
  }
  return lambda(l) * (sin - con) * Math.max(1, ...enemigos(ctx, l).map((x) => x.ataquesDeclarados || 1)) * ASALTOS_EFECTO;
}

/**
 * Aumentar el Crítico (pasivo, antes de tirar el crítico, Core p.157): el grado que más sube el valor
 * del crítico (fuera de combate o negativos) por encima de su zeon.
 */
export function aumentarCritico(ctx: Contexto, atk: Luchador, def: Luchador, base: number): { conjuro: Conjuro; grado: number } | null {
  const e = atk.magia;
  if (!e || perfil(atk) === 'bestia') return null;
  nuevaDecision(ctx);
  const rf = def.ficha.rf + def.cap.est.bonoRfCritico + def.cap.est.bonoRfDano + (def.ki?.activo.rf ?? 0) + (def.bono?.resistencias ?? 0);
  const valor = (b: number) => {
    const ef = efectoCritico(b, rf, null, { sinMuerte: def.cap.est.sangreEterna, acumulacion: !!def.ficha.acumulacion });
    return ef.pFuera * (Math.max(0, def.pv) + 2 * amenaza(def, atk)) + ef.pNegativo * valorNegativo(atk, def, ef.negativo, 0, 0);
  };
  const sin = valor(base);
  let mejor: { conjuro: Conjuro; grado: number } | null = null;
  let mejorNeto = 0;
  for (const c of e.conjuros) {
    if (c.efecto !== 'aumentarCritico') continue;
    for (const i of gradosPosibles(c, atk.ficha.inteligencia ?? 6, atk.ficha.magia)) {
      const g = c.grados[i];
      if (g.zeon > e.acumulado) continue;
      const neto = valor(base + (g.critico ?? 0)) - sin - precioZeon(atk) * g.zeon;
      if (neto > mejorNeto) {
        mejor = { conjuro: c, grado: i };
        mejorNeto = neto;
      }
    }
  }
  return mejor;
}

/**
 * Apagarse en su turno (Core p.236): si ya lo quema, o si está por empezar a quemarlo (aproximación;
 * la regla sólo dice cómo, no cuándo conviene).
 */
export function quiereApagarse(ctx: Contexto, l: Luchador): boolean {
  if (perfil(l) === 'bestia') return false;
  return danoLlamas(l) > 0 || l.llamas >= 170;
}

/**
 * Levantar un escudo mágico (conjuro pasivo) al recibir un ataque, si le alcanza lo acumulado: si lo
 * que espera recibir defendiéndose con él, éste y los siguientes ataques del asalto, ahorra más que su
 * zeon. Elige el grado más barato que aguante el golpe.
 */
export function escudoMagicoAlDefender(ctx: Contexto, def: Luchador, atk: Luchador, habAtk: number, g: { ki?: ModKi; tipo?: TipoAtaque; ranura: Ranura }): Lanzamiento | null {
  const e = def.magia;
  if (!e || e.escudo || perfil(def) === 'bestia') return null;
  nuevaDecision(ctx);
  const fisica = danoEsperado(atk, def, habAtk, defensaFinal(def, atk, { kiAtk: g.ki }), { ki: g.ki, tipo: g.tipo, ranura: g.ranura });
  let otros = 0;
  for (const x of enemigos(ctx, def)) if (x !== atk && !x.haActuado && puedeActuar(x) && alcanzable(x, def)) otros += 1;
  const golpe = danoBase(atk, def, false, g.ranura, g.ki);
  let mejor: Lanzamiento | null = null;
  let mejorNeto = 0;
  for (const c of e.conjuros) {
    if (c.accion !== 'pasiva' || !c.tipos.includes('defensa')) continue;
    for (const i of gradosPosibles(c, def.ficha.inteligencia ?? 6, def.ficha.magia)) {
      const gr = c.grados[i];
      if (gr.zeon > e.acumulado || (gr.resistencia ?? 0) < golpe) continue;
      e.escudo = { conjuro: c, grado: i, resistencia: gr.resistencia ?? 0 };
      const conEscudo = danoEsperado(atk, def, habAtk, defensaEscudoMagico(def, atk), { ki: g.ki, tipo: g.tipo, ranura: g.ranura });
      e.escudo = null;
      const neto = lambda(def) * (fisica - conEscudo) * (1 + otros) - precioZeon(def) * gr.zeon;
      if (neto > mejorNeto) {
        mejor = { conjuro: c, grado: i, objetivo: null };
        mejorNeto = neto;
      }
    }
  }
  return mejor;
}

/** Con un escudo mágico levantado, se defiende con él si su Proyección rinde más que su defensa física. */
export function defiendeConEscudoMagico(def: Luchador, atk: Luchador, g: { ki?: ModKi; aDistancia?: boolean; ranura: Ranura; tipo?: TipoAtaque }): boolean {
  const esc = def.magia?.escudo;
  if (!esc) return false;
  // La Barrera de Fuego sólo detiene calor y frío; en avanzado, también energía; en arcano, todo (Core p.157).
  if (esc.conjuro.efecto === 'barrera' && esc.grado < 3 && g.tipo !== 'CAL' && g.tipo !== 'FRI' && !(esc.grado === 2 && g.tipo === 'ENE')) return false;
  const proyectil = g.aDistancia ? g.ranura.proyectil?.clase ?? 'disparo' : undefined;
  return defensaEscudoMagico(def, atk) >= defensaFinal(def, atk, { kiAtk: g.ki, proyectil });
}
