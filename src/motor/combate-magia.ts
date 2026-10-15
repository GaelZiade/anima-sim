// Resolución de la magia en combate (Core cap. 11): lanzar un conjuro (control de Proyección, ataques,
// anímicos y efectos del registro), el choque de descargas, las zonas que atacan cada asalto y percibir
// a los invisibles. El motor se presta por `Motor` (efectos/tipos.ts), como en los efectos.

import type { Contexto, Luchador } from './modelo';
import type { Golpe } from './golpe';
import { GRADOS, type Conjuro, type Grado } from './conjuros';
import { DADO_FIJO, textoTirada, tirarD100Cerrada } from './dados';
import { umbralPifia } from './reglas';
import { activo, ataqueMagico, puedeActuar, distancia, enAlcance, nro, penAccion } from './calculos';
import { atributo, bonoCaracteristica } from './maniobras';
import { dejarDeMantener, golpeDeConjuro, lanzar, pagarDeterminada, proyeccionDeterminada, RANURA_MAGIA } from './magia';
import * as iaMagia from './ia-magia';
import { blancosConjuro, detonarMina, efecto, radioArea, type Lanzado, type Lanzamiento, type Motor } from './efectos';

/**
 * Lanza un conjuro (Core p.117-122). Todo conjuro pide un control de Proyección Mágica: con pifia
 * falla aunque gaste el zeon. Los de ataque y los anímicos se resuelven contra la defensa de cada
 * blanco (en área, todos los del radio, o los que elija con Control del Espacio); los automáticos
 * alcanzan sin defensa a quien cumpla su condición; los de efecto quedan activos sobre sus blancos.
 */
export function lanzarConjuro(motor: Motor, ctx: Contexto, l: Luchador, x: Lanzamiento) {
  const c = x.conjuro;
  if (x.detonar) {
    detonarMina(motor, ctx, l, x.detonar, !!x.control);
    return;
  }
  const h = efecto(c.efecto);
  const g = lanzar(l, c, x.grado, { ...(h.mantieneBlancos ? { blancos: x.blancos } : {}), ...(x.innato ? { innato: true } : {}) }, x.control);
  const nombre = `${c.nombre} (${GRADOS[x.grado]})${x.innato ? ' innato' : x.preparado ? ' preparado' : ''}`;
  l.stats.tecnicas[nombre] = (l.stats.tecnicas[nombre] ?? 0) + 1;
  const zeon = x.innato ? `[innato${x.control ? ', +10 de zeon (Control del Espacio)' : ''}; reserva ${l.magia!.reserva}]`
    : `[zeon ${g.zeon}${x.control ? ' +10 (Control del Espacio)' : ''}; acumulado ${l.magia!.acumulado}, reserva ${l.magia!.reserva}]`;
  const obj = x.objetivo;
  const sobre = h.sobre === 'blancos' && x.blancos?.length ? ` sobre ${x.blancos.map((b) => b.ficha.nombre).join(', ')}`
    : h.sobre === 'objetivo' && obj ? ` sobre ${obj.ficha.nombre}` : '';
  const etiqueta = (b: Luchador) => `${l.ficha.nombre} lanza ${nombre} contra ${b.ficha.nombre}${enAlcance(l, b) ? '' : ` desde ${distancia(l, b).toFixed(0)} m`} ${zeon}`;
  // Proyección Mágica Determinada: un valor fijo pagando zeon, si le conviene (Arcana p.26).
  const det = obj && (c.tipos.includes('ataque') || c.tipos.includes('animico')) ? proyeccionDeterminada(l, ataqueMagico(l, obj)) : null;
  if (det) {
    pagarDeterminada(l, det);
    motor.log(ctx, () => `${l.ficha.nombre} proyecta con Proyección Mágica Determinada: ${det.valor} [zeon ${det.zeon}].`);
  }
  // Sacrificio Vital: PV por +5 cada 5 a la Proyección, declarado antes de tirar (Core p.158).
  const vital = obj && !det && c.tipos.includes('ataque') ? iaMagia.sacrificioVitalPara(ctx, l, obj, c, g, ataqueMagico(l, obj)) : 0;
  if (vital) {
    l.pv -= vital;
    motor.log(ctx, () => `  ${l.ficha.nombre} sacrifica ${vital} PV: +${vital} a la Proyección (Sacrificio Vital).`);
  }
  const t = det ? DADO_FIJO : motor.tirar(ctx, umbralPifia(l.ficha.magia!.proyeccion, l.cap.ajustePifia));
  const habPara = (b: Luchador) => det?.valor ?? ataqueMagico(l, b) + vital;
  if (t.pifia) {
    // El ejemplar recién agregado (de un beneficio a un aliado puede haber uno por blanco).
    const m = [...l.magia!.mantenidos].reverse().find((x) => x.conjuro === c);
    if (m) dejarDeMantener(l, m);
    motor.log(ctx, () => `${obj && (c.tipos.includes('ataque') || c.tipos.includes('animico')) ? etiqueta(obj) : `${l.ficha.nombre} lanza ${nombre}${sobre} ${zeon}`}: ¡pifia! (sacó ${t.natural}, nivel ${t.nivelPifia}): el conjuro falla.`,
      () => (obj ? { ataque: { de: nro(ctx, l), a: nro(ctx, obj), contra: false, resultado: null } } : {}));
    return;
  }
  const lanzado: Lanzado = { ctx, l, x, c, g, obj, nombre, zeon };
  if (h.resolver) {
    motor.log(ctx, () => `${l.ficha.nombre} lanza ${nombre}${sobre} ${zeon}.`);
    h.resolver(motor, lanzado);
    return;
  }
  if (!obj) {
    motor.log(ctx, () => `${l.ficha.nombre} lanza ${nombre} ${zeon}.`);
    return;
  }
  ctx.ataquesEnAsalto++;
  l.stats.ataquesHechos++;
  const afectados: Luchador[] = [];
  const animico = c.tipos.includes('animico') ? { conjuro: c, grado: x.grado, afectados } : undefined;
  // Lo que se deshace al dejar de mantenerlo (Éxtasis, Lazos de Luz): sobre cada afectado.
  const alTerminar = h.alTerminar;
  const mant = alTerminar ? [...l.magia!.mantenidos].reverse().find((m) => m.conjuro === c) : undefined;
  if (mant && alTerminar) mant.alTerminar = () => {
    for (const a of afectados) alTerminar(motor, l, a);
  };
  h.antesDelAtaque?.(motor, lanzado, afectados);
  const blancos = h.blancos ? h.blancos(lanzado) : blancosConjuro(ctx, l, obj, c, g, !!x.control);
  const contras: { quien: Luchador; bono: number }[] = [];
  // Choque de descargas (Core p.117): el blanco puede interceptar un conjuro de ataque con el suyo.
  let factor = 1;
  if (!animico && c.tipos.includes('ataque')) {
    const choque = interceptar(motor, ctx, l, obj, habPara(obj) + t.valor, g.dano ?? 0, true);
    if (choque === 'anulado' || choque === 'pierde') return;
    if (choque !== null) factor = choque;
  }
  for (const b of blancos) {
    if (!activo(b) || !activo(l)) continue;
    const base: Golpe = {
      maniobra: 'normal', esContra: false, tipo: animico ? 'ENE' : c.ta, ranura: RANURA_MAGIA,
      ki: golpeDeConjuro(c, g), aDistancia: !enAlcance(l, b), animico,
      ...(factor !== 1 ? { factorDano: factor } : {}), ...areaDeConjuro(l, obj, c, g),
    };
    const golpe = h.golpe ? h.golpe(lanzado, base) : base;
    const r = motor.resolverDefensa(ctx, l, b, habPara(b), t, golpe, etiqueta(b));
    if (r.contra !== null) contras.push({ quien: r.defensor, bono: r.contra });
    h.trasGolpe?.(motor, lanzado, b, afectados);
  }
  if (mant && !afectados.length) dejarDeMantener(l, mant);
  if (vital) motor.verificarCaida(ctx, l, l);
  l.sorprendeA.clear();
  for (const k of contras) motor.ofrecerContra(ctx, k.quien, l, k.bono);
}

/** El área de un conjuro para la defensa (Core p.101): alrededor del objetivo, o del lanzador si es su radio. */
export function areaDeConjuro(l: Luchador, obj: Luchador, c: Conjuro, g: Grado): Pick<Golpe, 'area' | 'centroArea'> {
  const area = radioArea(c, g);
  return area ? { area, centroArea: { ...(g.area ? obj : l).pos } } : {};
}

/**
 * Choque de descargas (Core p.117, Tabla 57). Con disparos paralelos (sin haber actuado y con menos
 * de 25 de diferencia de turno), un mago que recibe una descarga puede interceptarla con un conjuro de
 * ataque: si su Proyección llega a 50 de la del atacante, chocan. Cada uno tira 1d100 + el daño base
 * + su bono de Poder (sólo los magos): hasta 50 de diferencia se anulan; de 51 a 100, la ganadora pasa
 * con la mitad de daño; más, entera. Devuelve qué pasa con la descarga del atacante: null si no hubo
 * choque, 'anulado', 'pierde' (la del defensor lo alcanza a él) o el factor de daño con que pasa.
 */
export function interceptar(motor: Motor, ctx: Contexto, atk: Luchador, def: Luchador, resultado: number, baseAtk: number, atkEsMago: boolean): 'anulado' | 'pierde' | number | null {
  if (!ctx.opciones.disparosParalelos || !def.magia || def.haActuado || def === ctx.turnoDe || !puedeActuar(def) || def.ataquesRestantes <= 0) return null;
  if (Math.abs(def.iniciativa - atk.iniciativa) >= 25) return null;
  const x = iaMagia.interceptarCon(ctx, def, atk, resultado, baseAtk, atkEsMago);
  if (!x) return null;
  const c = x.conjuro;
  const g = lanzar(def, c, x.grado, x.innato ? { innato: true } : {}, false);
  def.haActuado = true;
  def.ataquesRestantes = 0;
  const nombre = `${c.nombre} (${GRADOS[x.grado]})${x.innato ? ' innato' : ''}`;
  def.stats.tecnicas[nombre] = (def.stats.tecnicas[nombre] ?? 0) + 1;
  const t = motor.tirar(ctx, umbralPifia(def.ficha.magia!.proyeccion, def.cap.ajustePifia));
  const habDef = ataqueMagico(def, atk);
  const etiqueta = `${def.ficha.nombre} intercepta con ${nombre} [zeon ${g.zeon}; reserva ${def.magia!.reserva}]`;
  if (t.pifia) {
    motor.log(ctx, () => `${etiqueta}: ¡pifia! (sacó ${t.natural}): el conjuro falla.`);
    return null;
  }
  const suyo = habDef + t.valor;
  const golpeDef: Golpe = { maniobra: 'normal', esContra: false, tipo: c.ta, ranura: RANURA_MAGIA, ki: golpeDeConjuro(c, g), aDistancia: !enAlcance(def, atk) };
  if (suyo < resultado - 50) {
    // No llega a interceptarla: es un disparo paralelo común.
    motor.log(ctx, () => `${etiqueta}: ${textoTirada(habDef, t)} no llega a 50 de ${resultado}; no chocan.`);
    motor.resolverDefensa(ctx, def, atk, habDef, t, golpeDef, `${def.ficha.nombre} lanza ${nombre} contra ${atk.ficha.nombre}`);
    return activo(atk) ? null : 'anulado';
  }
  // Magia por Capacidades: zeon por Poder hasta el fin del turno, para el bono del choque (Core p.159).
  const extraPod = (l: Luchador, mago: boolean) => {
    const k = mago ? iaMagia.poderPorCapacidades(l) : 0;
    if (k) {
      l.magia!.reserva -= 25 * k;
      motor.log(ctx, () => `  ${l.ficha.nombre} gasta ${25 * k} de zeon por +${k} al Poder (Magia por Capacidades).`);
    }
    return k;
  };
  const podAtk = extraPod(atk, atkEsMago), podDef = extraPod(def, true);
  const poder = (l: Luchador, mago: boolean) => (mago ? bonoCaracteristica(atributo(l, 'POD') + (l === atk ? podAtk : podDef)) : 0);
  const dA = tirarD100Cerrada(ctx.rng), dD = tirarD100Cerrada(ctx.rng);
  const totA = dA + baseAtk + poder(atk, atkEsMago);
  const totD = dD + (g.dano ?? 0) + poder(def, true);
  const dif = Math.abs(totA - totD);
  const factor = dif > 100 ? 1 : dif > 50 ? 0.5 : 0;
  motor.log(ctx, () => `${etiqueta}: ${textoTirada(habDef, t)} contra ${resultado} → ¡chocan! ${atk.ficha.nombre} ${totA} [${dA}+${baseAtk}${atkEsMago ? `+${poder(atk, true)}` : ''}] contra ${def.ficha.nombre} ${totD} [${dD}+${g.dano ?? 0}+${poder(def, true)}]: ${factor === 0 ? 'se anulan' : `${totA > totD ? atk.ficha.nombre : def.ficha.nombre} pasa${factor === 0.5 ? ' con la mitad de daño' : ''}`} (Tabla 57).`);
  if (factor === 0) return 'anulado';
  if (totA > totD) return factor;
  motor.resolverDefensa(ctx, def, atk, habDef, t, { ...golpeDef, ...(factor !== 1 ? { factorDano: factor } : {}) }, `  La descarga de ${def.ficha.nombre} sigue hacia ${atk.ficha.nombre}`);
  return 'pierde';
}

/**
 * Invisibilidad (Core p.190): cada asalto, quien enfrenta a alguien invisible hace un control de
 * Advertir contra la dificultad del grado; si lo supera nota las alteraciones (ceguera parcial), si no,
 * no lo ve (absoluta).
 */
export function percibirInvisibles(motor: Motor, ctx: Contexto) {
  for (const l of ctx.luchadores) {
    l.percibe.clear();
    for (const x of l.detecta) l.percibe.add(x);
    if (!activo(l)) continue;
    // Holograma (Core p.127): Advertir contra 240 o Buscar contra 140 para darse cuenta de que es una imagen.
    for (const x of ctx.luchadores) {
      if (!x.holograma || x.equipo === l.equipo || l.descubre.has(x)) continue;
      const adv = (l.ficha.advertir ?? 0) + (l.bono?.advertir ?? 0) - penAccion(l) + motor.tirar(ctx, umbralPifia(l.ficha.advertir ?? 0, l.cap.ajustePifia)).valor;
      const bus = (l.ficha.buscar ?? 0) - penAccion(l) + motor.tirar(ctx, umbralPifia(l.ficha.buscar ?? 0, l.cap.ajustePifia)).valor;
      if (adv >= 240 || bus >= 140) {
        l.descubre.add(x);
        motor.log(ctx, () => `${l.ficha.nombre} se da cuenta de que la imagen de ${x.ficha.nombre} es un holograma.`);
      }
    }
    for (const x of ctx.luchadores) {
      const dif = x.bono?.invisible;
      if (!dif || x.equipo === l.equipo || !activo(x) || l.percibe.has(x)) continue;
      const advertir = (l.ficha.advertir ?? 0) + (l.bono?.advertir ?? 0) - penAccion(l);
      const t = motor.tirar(ctx, umbralPifia(l.ficha.advertir ?? 0, l.cap.ajustePifia));
      const ve = !t.pifia && advertir + t.valor >= dif;
      if (ve) l.percibe.add(x);
      motor.log(ctx, () => `${l.ficha.nombre} ${ve ? 'nota' : 'no nota'} a ${x.ficha.nombre}, invisible (Advertir ${textoTirada(advertir, t)} contra ${dif === Infinity ? 'nada' : dif}).`);
    }
  }
}

/**
 * Tormenta de Fuego (Core p.159): cada asalto desde el siguiente al lanzamiento, todos los que estén
 * en la zona sufren un ataque automático con la habilidad final del grado; con Control del Espacio
 * deja fuera a los suyos. Se resuelve al empezar el asalto (interpretación).
 */
export function zonasMagicas(motor: Motor, ctx: Contexto) {
  for (const l of ctx.luchadores) {
    for (const x of l.magia?.mantenidos ?? []) {
      // Destrucción de Sombras, Dominio Lumínico: una RM nueva cada asalto mientras se mantenga.
      efecto(x.conjuro.efecto).cadaAsalto?.(motor, ctx, l, x);
      const z = x.zona;
      if (!z || ctx.asalto < z.desde) continue;
      const g = x.conjuro.grados[x.grado];
      for (const b of ctx.luchadores) {
        if (!activo(b) || Math.hypot(b.pos.x - z.x, b.pos.y - z.y) > z.radio || (z.excluye === 'aliados' && b.equipo === l.equipo)) continue;
        const golpe: Golpe = { maniobra: 'normal', esContra: false, tipo: x.conjuro.ta, ranura: RANURA_MAGIA, ki: golpeDeConjuro(x.conjuro, g), aDistancia: true, area: z.radio, centroArea: { x: z.x, y: z.y } };
        motor.resolverDefensa(ctx, l, b, g.habilidad ?? 0, DADO_FIJO, golpe, `${x.conjuro.nombre} de ${l.ficha.nombre} ataca a ${b.ficha.nombre}`);
        if (motor.terminado(ctx)) return;
      }
    }
  }
}

/**
 * Lo que hace un conjuro anímico al alcanzar (Core p.122): RM contra su dificultad (con Romper
 * Resistencias, +5 o +10 por cada 50% de daño, Arcana p.30); el fracaso decide el efecto.
 */
export function efectoAnimico(motor: Motor, ctx: Contexto, atk: Luchador, def: Luchador, a: NonNullable<Golpe['animico']>, porcentaje: number) {
  const g = a.conjuro.grados[a.grado];
  const romper = (atk.ficha.magia?.romperResistencias ?? 0) * 5 * Math.floor(porcentaje / 50);
  const rm = (g.rm ?? 0) + romper;
  const que = `${a.conjuro.nombre}${romper ? ` (+${romper} por Romper Resistencias)` : ''}`;
  efecto(a.conjuro.efecto).alAlcanzar?.(motor, { ctx, atk, def, conjuro: a.conjuro, g, rm, que, afectados: a.afectados });
}
