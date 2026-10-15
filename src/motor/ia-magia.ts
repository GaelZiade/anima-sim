// IA de la magia (Core cap. 11): qué conjuro lanzar, a quién y en qué grado; cómo acumular, preparar
// o usar la magia innata; cuándo levantar un escudo. Todo en PV esperados, como el resto de la IA.

import type { Contexto, Luchador } from './modelo';
import { efecto, habilidadMina, type Lanzamiento, type Meta } from './efectos';
import {
  ASALTOS_EFECTO, defensaContraConjuro, precioZeon,
} from './efectos/valorar';
import { gradosPosibles, type Conjuro, type Grado } from './conjuros';
import {
  actDe, actPara, actPorCansancio, escudoDetiene, mantenidoDe, golpeDeConjuro, RANURA_MAGIA, alcanceMagico, presenciaDe, costeConjuro, danoLlamas, maximoInnato,
  preparadoListo, zeonLibre, ZEON_CONTROL_DEL_ESPACIO, type PlanMagia,
} from './magia';
import {
  danoAEscudo, rfCritico, activo, ataqueMagico, defensaEscudoMagico, ALCANCE, defensaFinal, distancia, danoEsperado, pronostico,
  puedeActuar,
} from './calculos';
import { tabla } from './probabilidades';
import { umbralPifia, type TipoAtaque } from './reglas';
import type { Ranura } from './rasgos';
import { efectoCritico } from './valoracion';
import type { ModKi } from './ki';
import { atributo, bonoCaracteristica } from './maniobras';
import { alcanzable, enemigos, lambda, nuevaDecision, perfil, trabadoConAlguien, valorDejarFuera, valorGolpe, valorNegativo, conCambio,
} from './ia';


/**
 * Sacrificio Vital (Core p.158): PV para sumarle a la Proyección (+5 cada 5), declarado antes de tirar.
 * Los que más suban el valor del golpe por encima de lo que valen esos PV (por λ), sin bajar de la
 * mitad de sus PV.
 */
export function sacrificioVitalPara(ctx: Contexto, l: Luchador, obj: Luchador, c: Conjuro, g: Grado, hab: number): number {
  const m = mantenidoDe(l, 'sacrificioVital');
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
  efecto(c.efecto).valorar?.({ ctx, l, e, c, i, g, alcance, ya, probar, signo, meta: () => metaMagica(ctx, l, alcance) });
  return mejor;
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
      const dano = danoEsperado(l, b, habilidadMina(d, z.radio) - 55, defensaContraConjuro(b, l, ki, z.radio), { ki, tipo: 'CAL', ranura: RANURA_MAGIA, area: z.radio });
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
        const zeon = costeConjuro(g, uso.l.control);
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
  const m = mantenidoDe(l, 'capacidades');
  if (!m || zeonLibre(l.magia!) < 300) return 0;
  return Math.floor((m.conjuro.grados[m.grado].maximo ?? 0) / 25);
}

/**
 * Interceptar una descarga con un conjuro de ataque (Core p.117): con el que más daño base tenga de los
 * que le alcanzan, si su Proyección probablemente llega a 50 del ataque y su descarga no queda muy por
 * debajo (en 1d100 + daño + Poder, perder por más de 50 la deja pasar).
 */
export function interceptarCon(_ctx: Contexto, l: Luchador, atk: Luchador, resultado: number, baseAtk: number, atkEsMago: boolean): Lanzamiento | null {
  const e = l.magia!;
  if (perfil(l) === 'bestia') return null;
  const poder = bonoCaracteristica(atributo(l, 'POD'));
  const poderAtk = atkEsMago ? bonoCaracteristica(atributo(atk, 'POD')) : 0;
  let mejor: Lanzamiento | null = null;
  let mejorDano = -1;
  for (const c of e.conjuros) {
    if (!c.tipos.includes('ataque') || c.accion !== 'activa' || c.efecto !== 'ataque') continue;
    for (const i of gradosPosibles(c, l.ficha.inteligencia ?? 6, l.ficha.magia)) {
      const g = c.grados[i];
      // Usando la magia innata, intercepta con un innato; si no, con lo acumulado.
      const alcanza = e.innato ? g.zeon <= maximoInnato(actDe(l)) && !e.mantenidos.some((x) => x.innato) : g.zeon <= e.acumulado;
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
  const maximo = maximoInnato(actDe(l));
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


/** El conjuro al que conviene apuntar acumulando: el que más rinde por asalto de espera. */
function metaMagica(ctx: Contexto, l: Luchador, alcance: number): Meta | null {
  const e = l.magia!;
  let mejor: Meta | null = null;
  for (const c of e.conjuros) {
    // Los que dan ACT o zeon no son una meta (y se valoran mirando la meta).
    if (!lanzable(e, c, []) || efecto(c.efecto).noEsMeta) continue;
    for (const i of gradosPosibles(c, l.ficha.inteligencia ?? 6, l.ficha.magia)) {
      const g = c.grados[i];
      if (g.zeon > zeonLibre(e) + e.acumulado + (e.preparado?.zeon ?? 0)) continue;
      const uso = mejorUso(ctx, l, c, i, alcance, []);
      if (!uso) continue;
      const zeon = costeConjuro(g, uso.l.control);
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
  const vida = mantenidoDe(l, 'consumirVida');
  if (vida && zeonLibre(e) < 2 * actDe(l) && l.pv > l.ficha.pv / 2) {
    const max = vida.conjuro.grados[vida.grado].maximo ?? 0;
    plan.consumirVida = Math.min(max, Math.floor((l.pv - l.ficha.pv / 2) / 5) * 5);
  }
  // Pasarle su ACT de zeon a un mago aliado que se está quedando sin, si a él le sobra (Core p.117).
  const alcanceZeon = l.ficha.magia!.transmision ? presenciaDe(l) : ALCANCE;
  const necesitado = ctx.luchadores.find((x) => x !== l && x.equipo === l.equipo && activo(x) && x.magia &&
    zeonLibre(x.magia) < 2 * actDe(x) && distancia(l, x) <= alcanceZeon);
  if (necesitado && zeonLibre(e) > 600) return { acumula: false, transferir: { a: necesitado, zeon: actDe(l) } };
  const meta = metaMagica(ctx, l, alcance);
  const inn = mejorInnato(ctx, l, alcance);
  if (inn && inn.valor > (meta?.porAsalto ?? 0)) return { ...plan, acumula: false, innato: true };
  if (!meta || !plan.acumula) return plan;
  const especialista = actPara(l, meta.conjuro) > actDe(l);
  if (especialista) plan.preparar = { conjuro: meta.conjuro, grado: meta.grado };
  // Lo que le falta después de este asalto de ACT: con cansancio o Sacrificio de Poder, ¿llega ya?
  let falta = meta.falta - actPara(l, especialista ? meta.conjuro : null);
  if (falta > 0 && falta <= actPorCansancio(l) * Math.max(0, l.cansancio - CANSANCIO_RESERVADO) && (l.ficha.magia!.explotacion ?? 0) > 0) {
    plan.cansancio = Math.ceil(falta / actPorCansancio(l));
    falta = 0;
  }
  const poder = mantenidoDe(l, 'sacrificioPoder');
  if (falta > 0 && poder) {
    const zeon = Math.ceil(falta / 5) * 10;
    if (zeon <= (poder.conjuro.grados[poder.grado].maximo ?? 0) && zeon <= zeonLibre(e) - meta.falta) plan.sacrificioPoder = zeon;
  }
  return plan;
}

/**
 * Aumentar el Crítico (pasivo, antes de tirar el crítico, Core p.157): el grado que más sube el valor
 * del crítico (fuera de combate o negativos) por encima de su zeon.
 */
export function aumentarCritico(ctx: Contexto, atk: Luchador, def: Luchador, base: number): { conjuro: Conjuro; grado: number } | null {
  const e = atk.magia;
  if (!e || perfil(atk) === 'bestia') return null;
  nuevaDecision(ctx);
  const rf = rfCritico(def);
  const valor = (b: number) => {
    const ef = efectoCritico(b, rf, null, { sinMuerte: def.cap.est.sangreEterna, acumulacion: !!def.ficha.acumulacion });
    return ef.pFuera * valorDejarFuera(atk, def) + ef.pNegativo * valorNegativo(atk, def, ef.negativo, 0, 0);
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
export function quiereApagarse(_ctx: Contexto, l: Luchador): boolean {
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
  const golpe = danoAEscudo(atk, def, false, g.ranura, g.ki, g.tipo);
  let mejor: Lanzamiento | null = null;
  let mejorNeto = 0;
  for (const c of e.conjuros) {
    if (c.accion !== 'pasiva' || !c.tipos.includes('defensa')) continue;
    for (const i of gradosPosibles(c, def.ficha.inteligencia ?? 6, def.ficha.magia)) {
      const gr = c.grados[i];
      if (gr.zeon > e.acumulado || (gr.resistencia ?? 0) < golpe) continue;
      const conEscudo = conCambio(() => {
        const previo = e.escudo;
        e.escudo = { conjuro: c, grado: i, resistencia: gr.resistencia ?? 0 };
        return () => { e.escudo = previo; };
      }, () => danoEsperado(atk, def, habAtk, defensaEscudoMagico(def, atk), { ki: g.ki, tipo: g.tipo, ranura: g.ranura }));
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
  if (!escudoDetiene(def, g.tipo)) return false;
  const proyectil = g.aDistancia ? g.ranura.proyectil?.clase ?? 'disparo' : undefined;
  return defensaEscudoMagico(def, atk) >= defensaFinal(def, atk, { kiAtk: g.ki, proyectil });
}
