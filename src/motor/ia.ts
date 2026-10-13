// IA por heurística: cada decisión puntúa sus opciones en "PV esperados" y elige la mejor.
// No tira dados ni mira hacia adelante; todas las probabilidades salen de las tablas precalculadas.

import type { Contexto, Luchador, Perfil } from './modelo';
import {
  absorcionContra, activo, ALCANCE, ataqueFinal, defensaFinal, distancia, enAlcance, metrosTotales,
  pronostico, puedeActuar, puedeManiobraEspecial, tablaPara, turnoFinal, PEN_PREVER_SORPRESA,
} from './calculos';
import { tabla } from './probabilidades';
import { MAX_CANSANCIO_ASALTO, negativoCansancio, type TipoAtaque } from './reglas';
import { planDeAtaques, type Ranura } from './rasgos';
import {
  caracteristicasControl, dificultadPuntosPresion, esApuntado, esNoLetal, ESTADOS_MUSHIN, modificadorPorResultado,
  pGanaControl, type EstadoMushin, type Maniobra,
} from './maniobras';

/** Peso del daño recibido frente al causado. */
const LAMBDA: Record<Perfil, number> = { agresivo: 0.5, equilibrado: 0.9, cauto: 1.4, bestia: 0.3 };

function perfil(l: Luchador): Perfil {
  if ((l.ficha.inteligencia ?? 6) <= 4) return 'bestia';
  return l.ficha.perfil ?? 'equilibrado';
}

function lambda(l: Luchador): number {
  return LAMBDA[perfil(l)];
}

function enemigos(ctx: Contexto, l: Luchador): Luchador[] {
  return ctx.luchadores.filter((e) => e.equipo !== l.equipo && activo(e));
}

function trabadoConAlguien(l: Luchador): boolean {
  return l.trabados.some((e) => activo(e) && enAlcance(l, e));
}

/** Metros que le faltan para llegar al alcance cuerpo a cuerpo. */
function faltaParaLlegar(l: Luchador, e: Luchador): number {
  return Math.max(0, distancia(l, e) - ALCANCE);
}

/** ¿Puede atacar a `e` este asalto? Si está trabado no se retira. */
function alcanzable(l: Luchador, e: Luchador): boolean {
  if (enAlcance(l, e)) return true;
  if (trabadoConAlguien(l)) return false;
  return faltaParaLlegar(l, e) <= metrosTotales(l) - l.metrosMovidos;
}

function necesitaMovimientoActivo(l: Luchador, e: Luchador): boolean {
  if (enAlcance(l, e) || l.movioActivo) return false;
  return l.metrosMovidos + faltaParaLlegar(l, e) > metrosTotales(l) / 4;
}

/** Daño que `e` le haría a `l` en un ataque normal. */
function golpeDe(e: Luchador, l: Luchador): number {
  return pronostico(e, l, ataqueFinal(e, l), defensaFinal(l, e)).dano;
}

/** Daño esperado de `e` en todo el asalto contra `l` (amenaza). */
function amenaza(e: Luchador, l: Luchador): number {
  return golpeDe(e, l) * Math.max(1, e.ataquesDeclarados || 1);
}

interface Oportunidad {
  objetivo: Luchador;
  valor: number;
}

/** Valor de atacar a `e` con las condiciones dadas. */
function valorAtaque(
  l: Luchador, e: Luchador,
  o: { declarados?: number; ranura?: Ranura; defensasPrevias?: number; bono?: number; primeraVez?: boolean },
): number {
  const hab = ataqueFinal(l, e, {
    declarados: o.declarados, ranura: o.ranura, bono: o.bono, conMovimientoActivo: necesitaMovimientoActivo(l, e),
  });
  const p = pronostico(l, e, hab, defensaFinal(e, l, { defensasPrevias: o.defensasPrevias }), { ranura: o.ranura });
  const amen = amenaza(e, l);
  let v = p.dano + p.pBaja * amen * 2 + p.pCritico * amen * 0.5;
  // Tempo: si todavía no actuó, impactarlo lo deja sin acciones este asalto.
  if (o.primeraVez !== false && !e.haActuado && puedeActuar(e) && !e.ficha.acumulacion)
    v += p.pImpacto * amen;
  // Riesgo de contra: sólo si le quedan ataques para devolverla.
  if (e.ataquesRestantes > 0 && puedeActuar(e)) {
    const golpeContra = pronostico(e, l, ataqueFinal(e, l, { bono: p.bonoContra }), defensaFinal(l, e)).dano;
    v -= lambda(l) * p.pContra * golpeContra;
  }
  return v;
}

// --------------------------------------------------------------------------- declaración

/** Daño esperado por asalto de `l` contra su mejor blanco. */
function tasaDano(ctx: Contexto, l: Luchador): number {
  let mejor = 0;
  for (const e of enemigos(ctx, l)) mejor = Math.max(mejor, golpeDe(l, e));
  return mejor * Math.max(1, l.ataquesDeclarados);
}

/** Intercambio de daño relativo a los PV de cada bando. */
export function ventajaEquipos(ctx: Contexto): Record<'A' | 'B', number> {
  const tasa = { A: 0, B: 0 };
  const pv = { A: 0, B: 0 };
  for (const l of ctx.luchadores) {
    if (!activo(l)) continue;
    tasa[l.equipo] += tasaDano(ctx, l);
    pv[l.equipo] += Math.max(1, l.pv);
  }
  const rapidezA = tasa.A / pv.B;
  const rapidezB = tasa.B / pv.A;
  const a = rapidezB > 0 ? rapidezA / rapidezB : rapidezA > 0 ? Infinity : 1;
  return { A: a, B: a === 0 ? Infinity : 1 / a };
}

/** Aliados (sin contarlo a él) que pueden atacar a `e` este asalto. */
function aliadosSobre(ctx: Contexto, l: Luchador, e: Luchador): number {
  let n = 0;
  for (const x of ctx.luchadores)
    if (x !== l && x.equipo === l.equipo && activo(x) && faltaParaLlegar(x, e) <= metrosTotales(x)) n++;
  return n;
}

export interface Declaracion {
  defensaTotal: boolean;
  ataques: number;
  /** Tabla de 2ª Arma: Estilo Defensivo: la segunda arma defiende en vez de atacar. */
  estiloDefensivo: boolean;
  seraphite: 0 | 1 | 3;
  berserker: boolean;
  ataqueFinal: boolean;
  bonoVariableEn: Luchador['bonoVariableEn'];
  despertarOrochi: boolean;
  /** Prever Sorpresa contra estos enemigos (Dominus p.14). */
  preverSorpresa: Luchador[];
}

const SIN_MODOS = {
  estiloDefensivo: false, seraphite: 0 as const, berserker: false, ataqueFinal: false,
  bonoVariableEn: null, despertarOrochi: false, preverSorpresa: [] as Luchador[],
};

export function declarar(ctx: Contexto, l: Luchador): Declaracion {
  const max = l.cap.maxAtaques;
  const objetivos = enemigos(ctx, l).filter((e) => alcanzable(l, e));
  // Quién puede atacarlo a él, repartido entre los blancos que tiene cada uno.
  const entrantes = enemigos(ctx, l)
    .filter((e) => faltaParaLlegar(e, l) <= metrosTotales(e))
    .map((e) => {
      const blancos = ctx.luchadores.filter(
        (x) => x.equipo === l.equipo && activo(x) && faltaParaLlegar(e, x) <= metrosTotales(e),
      ).length;
      return { e, peso: 1 / Math.max(1, blancos) };
    });

  if (objetivos.length === 0 && entrantes.length === 0) return { defensaTotal: false, ataques: 1, ...SIN_MODOS };

  let mejorN = 1;
  let mejorValor = -Infinity;
  for (let n = 1; n <= max; n++) {
    const usos: number[] = [];
    // Ataques en su turno: reparto greedy, cada golpe extra al mismo blanco enfrenta más defensas.
    // En promedio la mitad de los aliados que llegan al blanco lo atacarán antes que él.
    const golpesA = new Map<Luchador, number>();
    // Los n declarados y después los extra (segunda arma, patada), cada uno con su penalizador.
    const plan = planDeAtaques(l.cap, n);
    for (const ranura of plan) {
      let mejor: Oportunidad | null = null;
      for (const e of objetivos) {
        const previos = golpesA.get(e) ?? 0;
        const valor = valorAtaque(l, e, {
          declarados: n, ranura, primeraVez: previos === 0,
          defensasPrevias: e.defensasHechas + previos + Math.floor(aliadosSobre(ctx, l, e) / 2),
        });
        if (!mejor || valor > mejor.valor) mejor = { objetivo: e, valor };
      }
      if (!mejor || mejor.valor <= 0) break;
      usos.push(mejor.valor);
      golpesA.set(mejor.objetivo, (golpesA.get(mejor.objetivo) ?? 0) + 1);
    }
    // Contras: cada ataque que reciba puede dar una Acción Respuesta si le quedan ataques.
    for (const { e, peso } of entrantes) {
      const p = pronostico(e, l, ataqueFinal(e, l), defensaFinal(l, e));
      if (p.pContra <= 0) continue;
      const golpe = pronostico(l, e, ataqueFinal(l, e, { declarados: n, ranura: plan[0], bono: p.bonoContra }), defensaFinal(e, l)).dano;
      usos.push(peso * p.pContra * golpe);
    }
    usos.sort((a, b) => b - a);
    const valor = usos.slice(0, plan.length).reduce((s, v) => s + v, 0);
    if (valor > mejorValor) {
      mejorValor = valor;
      mejorN = n;
    }
  }

  // Defensa total: +30 a cada defensa a cambio de no atacar ni contraatacar. Sólo retrasa su caída,
  // así que sirve si hay aliados que ganan el intercambio de daño mientras él aguanta.
  const pf = perfil(l);
  const tieneAliados = ctx.luchadores.some((x) => x !== l && x.equipo === l.equipo && activo(x));
  if (
    pf !== 'bestia' && pf !== 'agresivo' && entrantes.length > 0 && !l.ficha.acumulacion &&
    tieneAliados && ctx.ventaja[l.equipo] >= 1
  ) {
    let evitado = 0;
    for (const { e, peso } of entrantes) {
      const atk = ataqueFinal(e, l);
      evitado += peso * (pronostico(e, l, atk, defensaFinal(l, e, { defensaTotal: false })).dano -
        pronostico(e, l, atk, defensaFinal(l, e, { defensaTotal: true })).dano);
    }
    if (lambda(l) * evitado > Math.max(0, mejorValor)) {
      const bonoVariableEn = l.cap.est.bonoVariable ? ('defensa' as const) : null;
      return { defensaTotal: true, ataques: 0, ...SIN_MODOS, bonoVariableEn, preverSorpresa: preverSorpresa(l, entrantes) };
    }
  }
  return { defensaTotal: false, ataques: mejorN, ...elegirModos(ctx, l, mejorN, objetivos, entrantes) };
}

/**
 * Prever Sorpresa contra cada enemigo que puede atacarlo: anula el −90 de su sorpresa a cambio de −40
 * seguro en la primera acción enfrentada contra él. Conviene si P(sorpresa) × lo que cuesta el −90
 * supera lo que cuesta el −40 (Dominus p.14).
 */
function preverSorpresa(l: Luchador, entrantes: { e: Luchador; peso: number }[]): Luchador[] {
  if (perfil(l) === 'bestia') return [];
  const t = tabla(false, false, false);
  const elegidos: Luchador[] = [];
  for (const { e } of entrantes) {
    // P(iniciativa de e − la suya ≥ umbral): la diferencia de dos d100 abiertas, como un ataque.
    const pSorpresa = t.pImpacto(turnoFinal(e) - turnoFinal(l) - e.cap.est.diferenciaSorpresa + 1);
    const atk = ataqueFinal(e, l);
    const def = defensaFinal(l, e);
    const dano = (pen: number) => pronostico(e, l, atk, def - pen).dano;
    if (pSorpresa * (dano(90) - dano(0)) > dano(PEN_PREVER_SORPRESA) - dano(0)) elegidos.push(e);
  }
  return elegidos;
}

/** Valor neto de un asalto con la modalidad que tenga puesta: lo que pega menos λ × lo que recibe. */
function valorDelAsalto(l: Luchador, n: number, objetivos: Luchador[], entrantes: { e: Luchador; peso: number }[]): number {
  let ofensiva = 0;
  for (const e of objetivos) ofensiva = Math.max(ofensiva, valorAtaque(l, e, { declarados: n }));
  let recibido = 0;
  for (const { e, peso } of entrantes) recibido += peso * amenaza(e, l);
  return ofensiva * n - lambda(l) * recibido;
}

/** Modalidades declaradas antes de la iniciativa: se prueba cada una y se queda con la mejor. */
function elegirModos(
  ctx: Contexto, l: Luchador, n: number, objetivos: Luchador[], entrantes: { e: Luchador; peso: number }[],
): Omit<Declaracion, 'defensaTotal' | 'ataques'> {
  const e = l.cap.est;
  const original = { modo: l.modo, bonoVariableEn: l.bonoVariableEn };
  const probar = (modo: Luchador['modo'], bonoVariableEn: Luchador['bonoVariableEn']) => {
    l.modo = modo;
    l.bonoVariableEn = bonoVariableEn;
    const v = valorDelAsalto(l, n, objetivos, entrantes);
    l.modo = original.modo;
    l.bonoVariableEn = original.bonoVariableEn;
    return v;
  };
  // Ataque Final: una vez, por debajo de la mitad de los PV (Dominus p.86). Se usa en cuanto se puede.
  const activarAtaqueFinal = e.ataqueFinal && !l.ataqueFinalUsado && l.pv < l.ficha.pv / 2;
  const base = { seraphite: 0 as 0 | 1 | 3, berserker: false, ataqueFinal: l.modo.ataqueFinal || activarAtaqueFinal };
  let mejor = { modo: base, bonoVariableEn: null as Luchador['bonoVariableEn'], valor: -Infinity };
  const seraphites: (0 | 1 | 3)[] = e.seraphite === 3 ? [0, 1, 3] : e.seraphite === 1 ? [0, 1] : [0];
  const bonos: Luchador['bonoVariableEn'][] = e.bonoVariable ? ['ataque', 'defensa', 'dano'] : [null];
  for (const seraphite of seraphites)
    for (const berserker of e.berserker ? [false, true] : [false])
      for (const bonoVariableEn of bonos) {
        const modo = { ...base, seraphite, berserker };
        let valor = probar(modo, bonoVariableEn);
        // Seraphite arcano sigue actuando aunque lo pongan a la defensiva: vale su ofensiva perdida.
        if (seraphite === 3) valor += 0.3 * Math.max(0, valorDelAsalto(l, n, objetivos, []));
        if (valor > mejor.valor) mejor = { modo, bonoVariableEn, valor };
      }

  // Estilo Defensivo: cambiar el ataque de la segunda arma por una defensa sin penalizador.
  let estiloDefensivo = false;
  if (l.cap.estiloDefensivo && entrantes.length >= 2) {
    const mejorEntrante = entrantes.reduce((a, b) => (amenaza(b.e, l) > amenaza(a.e, l) ? b : a)).e;
    const atk = ataqueFinal(mejorEntrante, l);
    const evitado =
      pronostico(mejorEntrante, l, atk, defensaFinal(l, mejorEntrante, { defensasPrevias: 1 })).dano -
      pronostico(mejorEntrante, l, atk, defensaFinal(l, mejorEntrante, { defensasPrevias: 0 })).dano;
    const segunda = l.cap.extras.find((x) => x.nombre.startsWith('Segunda arma'));
    let ataqueExtra = 0;
    const ranura = { pen: segunda?.pen ?? 40, sinArmas: false };
    for (const o of objetivos) ataqueExtra = Math.max(ataqueExtra, valorAtaque(l, o, { declarados: n, ranura }));
    estiloDefensivo = lambda(l) * evitado > ataqueExtra;
  }
  // Sangre de Orochi: se despierta si el combate no está claramente ganado; cuesta 2 PV por asalto.
  const despertarOrochi = e.orochi && l.orochi === 0 && ctx.ventaja[l.equipo] < 1.5;
  return {
    estiloDefensivo, seraphite: mejor.modo.seraphite, berserker: mejor.modo.berserker,
    ataqueFinal: activarAtaqueFinal && !l.modo.ataqueFinal, bonoVariableEn: mejor.bonoVariableEn, despertarOrochi,
    preverSorpresa: preverSorpresa(l, entrantes),
  };
}

// --------------------------------------------------------------------------- en su turno

/**
 * Elige a quién atacar con el próximo ataque, o null para guardar los que le quedan para contras.
 * Si nadie está al alcance devuelve el enemigo hacia el que conviene moverse.
 */
export function elegirObjetivo(ctx: Contexto, l: Luchador): Luchador | null {
  const todos = enemigos(ctx, l);
  if (todos.length === 0) return null;
  const cercano = todos.reduce((a, b) => (distancia(l, b) < distancia(l, a) ? b : a));

  if (perfil(l) === 'bestia') {
    const alAlcance = todos.filter((e) => enAlcance(l, e));
    if (alAlcance.length === 0) return cercano;
    return alAlcance.reduce((a, b) => (b.pv < a.pv ? b : a));
  }

  // Xing Quan: una vez que usó el bono contra alguien, no puede atacar a otro ese asalto (Dominus p.38).
  if (l.objetivoUnico) return activo(l.objetivoUnico) && alcanzable(l, l.objetivoUnico) ? l.objetivoUnico : null;
  const candidatos = todos.filter((e) => alcanzable(l, e));
  if (candidatos.length === 0) return trabadoConAlguien(l) ? null : cercano;

  let mejor: Oportunidad | null = null;
  for (const e of candidatos) {
    const valor = valorAtaque(l, e, {}) - 0.05 * faltaParaLlegar(l, e);
    if (!mejor || valor > mejor.valor) mejor = { objetivo: e, valor };
  }
  // Guardar el ataque para contraatacar es esperar: sólo conviene si su equipo gana el intercambio
  // de daño y hubo acción reciente (si nadie ataca, el combate se estanca).
  if (
    mejor && mejor.valor < 0 && ctx.ventaja[l.equipo] >= 1 &&
    ctx.ataquesEnAsalto + ctx.ataquesAsaltoAnterior > 0
  ) return null;
  return mejor?.objetivo ?? null;
}

// --------------------------------------------------------------------------- reacciones

/** ¿Usa ya la Acción Respuesta contra `atk` o guarda el ataque? */
export function usarContra(ctx: Contexto, l: Luchador, atk: Luchador, bono: number): boolean {
  if (perfil(l) === 'bestia') return true;
  const ahora = valorAtaque(l, atk, { bono });
  if (ahora <= 0) return false;
  if (l.haActuado || l.ataquesRestantes > 1) return true;
  // Le queda un solo ataque y todavía no actuó: comparar con su mejor ataque en su turno.
  let alternativa = 0;
  for (const e of enemigos(ctx, l)) if (alcanzable(l, e)) alternativa = Math.max(alternativa, valorAtaque(l, e, {}));
  return ahora >= 0.9 * alternativa;
}

/**
 * Resistir el golpe (Core p.93): −80 a la defensa pero conserva la acción. Sirve sólo si resiste
 * TODOS los ataques que le lleguen antes de actuar: con uno que lo impacte sin resistir queda a la
 * defensiva igual y lo pagado se pierde. Por eso se decide una vez, al primer ataque del asalto, y
 * se mantiene hasta que actúe.
 */
export function resistir(ctx: Contexto, l: Luchador, atk: Luchador): boolean {
  if (l.ficha.acumulacion || l.haActuado || !puedeActuar(l) || perfil(l) === 'bestia') return false;
  l.planResistir ??= convieneResistir(ctx, l, atk);
  return l.planResistir;
}

function convieneResistir(ctx: Contexto, l: Luchador, atk: Luchador): boolean {
  // Lo que pierde si lo ponen a la defensiva: su daño esperado del asalto.
  let miAsalto = 0;
  for (const e of enemigos(ctx, l)) if (alcanzable(l, e)) miAsalto = Math.max(miAsalto, valorAtaque(l, e, {}));
  miAsalto *= Math.max(1, l.ataquesRestantes);
  if (miAsalto <= 0) return false;

  // Ataques que probablemente reciba antes de su turno: el que lo ataca ahora y los que actúan antes
  // que él, repartidos entre los blancos que tengan.
  let costo = 0;
  let pSinImpacto = 1;
  for (const e of enemigos(ctx, l)) {
    const ahora = e === atk;
    if (!ahora && (e.haActuado || e.iniciativa < l.iniciativa || !puedeActuar(e))) continue;
    if (!ahora && !alcanzable(e, l)) continue;
    const blancos = ctx.luchadores.filter((x) => x.equipo === l.equipo && activo(x) && alcanzable(e, x)).length;
    const ataques = (e.ataquesRestantes + (ahora ? 1 : 0)) / Math.max(1, ahora ? 1 : blancos);
    const hab = ataqueFinal(e, l);
    const normal = pronostico(e, l, hab, defensaFinal(l, e));
    const resistiendo = pronostico(e, l, hab, defensaFinal(l, e, { resistir: true }));
    costo += ataques * (
      lambda(l) * (resistiendo.dano - normal.dano) +
      (resistiendo.pCritico - normal.pCritico) * l.pv * 0.5 +
      (resistiendo.pBaja - normal.pBaja) * l.pv * 2);
    pSinImpacto *= Math.pow(1 - normal.pImpacto, ataques);
  }
  // Si no resiste, pierde su asalto con la probabilidad de que al menos un ataque lo impacte.
  return costo < (1 - pSinImpacto) * miAsalto;
}

/** ¿Gastar `k` puntos lo deja agotado (Tabla 27)? */
function agota(l: Luchador, k: number): boolean {
  return negativoCansancio(l.cansancio - k, l.ficha.cansancio ?? l.ficha.constitucion) > 0;
}

/**
 * Puntos de cansancio a gastar (0-2). `ganancia(k)` = PV esperados ganados gastando k.
 * Sólo se gastan puntos que no agotan: el agotamiento penaliza toda acción el resto del combate.
 */
function decidirCansancio(l: Luchador, ganancia: (k: number) => number, referencia: number): number {
  const disponibles = Math.min(MAX_CANSANCIO_ASALTO - l.cansancioAsalto, l.cansancio);
  if (disponibles <= 0 || perfil(l) === 'bestia') return 0;
  let gastar = 0;
  for (let k = 1; k <= disponibles && !agota(l, k); k++) {
    if (ganancia(k) - ganancia(k - 1) >= 0.08 * referencia) gastar = k;
    else break;
  }
  return gastar;
}

export function cansancioAtaque(ctx: Contexto, atk: Luchador, def: Luchador, bono: number, plan: PlanAtaque = NORMAL): number {
  const defensa = defensaFinal(def, atk);
  const valor = (k: number) => {
    const o = { bono, cansancio: k, maniobra: plan.maniobra, tipo: plan.tipo, especial: plan.especial };
    const p = pronostico(atk, def, ataqueFinal(atk, def, o), defensa, { maniobra: plan.maniobra, tipo: plan.tipo });
    return p.dano + p.pBaja * def.pv;
  };
  // La referencia es su propia vida: lo que vale el cansancio depende de él, no del blanco.
  return decidirCansancio(atk, valor, Math.max(1, atk.pv));
}

export function cansancioDefensa(ctx: Contexto, def: Luchador, atk: Luchador, habAtaque: number, resistiendo: boolean): number {
  if (def.ficha.acumulacion) return 0;
  const pron = (k: number) =>
    pronostico(atk, def, habAtaque, defensaFinal(def, atk, { cansancio: k, resistir: resistiendo }));
  const gastar = decidirCansancio(def, (k) => -(pron(k).dano + pron(k).pBaja * def.pv), Math.max(1, def.pv));
  if (gastar > 0) return gastar;
  // Desesperado: agotarse sólo si baja mucho la chance de quedar fuera de combate ahora.
  const disponibles = Math.min(MAX_CANSANCIO_ASALTO - def.cansancioAsalto, def.cansancio);
  for (let k = disponibles; k >= 1; k--) if (pron(0).pBaja - pron(k).pBaja >= 0.2) return k;
  return 0;
}

// --------------------------------------------------------------------------- maniobras

export interface PlanAtaque {
  maniobra: Maniobra;
  tipo?: TipoAtaque;
  especial: boolean;
  /** Mushin arcano: estado a inducir con los puntos de presión. */
  estadoMushin?: EstadoMushin | null;
}

const NORMAL: PlanAtaque = { maniobra: 'normal', especial: false };

/** Valor de inducir un estado con Mushin arcano, en PV equivalentes. */
function valorEstadoMushin(estado: EstadoMushin, def: Luchador, amen: number): number {
  switch (estado) {
    case 'debilidad': return 0;
    case 'dolor': return 0.4 * 2 * amen;
    case 'dolorExtremo': return 0.8 * 2 * amen;
    case 'paralisisMenor': return 0.3 * 2 * amen;
    case 'paralisisParcial': return 0.8 * 2 * amen;
    case 'paralisisCompleta':
    case 'coma':
    case 'muerte': return def.pv + 2 * amen;
  }
}

/** P(X − Y > k) con X, Y uniformes en 1..100 (d100 sin abierta). */
function pDiferenciaD100(kReal: number): number {
  // X − Y es entero: X − Y > k equivale a X − Y > ⌊k⌋ (y evita recursión infinita con fracciones).
  const k = Math.floor(kReal);
  if (k >= 99) return 0;
  if (k < -99) return 1;
  if (k >= 0) return ((99 - k) * (100 - k)) / 2 / 10000;
  return 1 - pDiferenciaD100(-k - 1);
}

/** Enemigos al alcance que un ataque en área alcanzaría, empezando por el elegido. */
export function blancosArea(ctx: Contexto, atk: Luchador, def: Luchador): Luchador[] {
  const otros = enemigos(ctx, atk).filter((e) => e !== def && enAlcance(atk, e));
  return [def, ...otros].slice(0, atk.cap.est.blancosArea);
}

/**
 * Elige maniobra, tipo de crítico y si usa la Maniobra Especial para este ataque. Cada opción se
 * valora como un ataque normal (daño, chance de baja y de crítico, riesgo de contra) más lo que deja
 * la maniobra: un rival derribado o apresado pega y defiende peor, uno desarmado amenaza menos.
 */
export function elegirManiobra(ctx: Contexto, atk: Luchador, def: Luchador, esContra: boolean, bono: number): PlanAtaque {
  if (perfil(atk) === 'bestia') return NORMAL;
  const e = atk.cap.est;
  const amen = amenaza(def, atk);
  const habDef = defensaFinal(def, atk);
  const golpesSiguientes = Math.max(0, atk.ataquesRestantes - 1) + aliadosSobre(ctx, atk, def) / 2;
  // Cuánto más pegan los golpes que siguen si el rival queda con −pen a su defensa.
  const mejora = (pen: number) => {
    const h = ataqueFinal(atk, def, { bono: 0 });
    return pronostico(atk, def, h, habDef - pen).dano - pronostico(atk, def, h, habDef).dano;
  };

  const valor = (m: Maniobra, tipo?: TipoAtaque, estadoMushin: EstadoMushin | null = null): number => {
    const hab = ataqueFinal(atk, def, { bono, maniobra: m, esContra, tipo, estadoMushin });
    const p = pronostico(atk, def, hab, habDef, { maniobra: m, esContra, tipo });
    // Los ataques que no dañan (engatillar, puntos de presión) se valoran sólo por su efecto.
    const sinDano = m === 'engatillar' || m === 'puntosPresion';
    const mitad = esNoLetal(m) ? 0.5 : 1;
    let v = sinDano ? 0 : mitad * p.dano + (m === 'inconsciencia' ? 0 : p.pBaja * amen * 2 + p.pCritico * amen * 0.5);
    if (!def.haActuado && puedeActuar(def) && !def.ficha.acumulacion) v += p.pImpacto * amen;
    if (def.ataquesRestantes > 0 && puedeActuar(def)) v -= lambda(atk) * p.pContra * golpeDe(def, atk);

    if (m === 'derribo' || m === 'presa' || m === 'desarmar') {
      const c = caracteristicasControl(m, atk, def);
      const bonoC = m === 'desarmar'
        ? (esContra ? e.controlDesarmarEnContra : e.controlDesarmar)
        : (esContra ? e.controlPresaDerriboEnContra : e.controlPresaDerribo);
      const resiste = m === 'desarmar' ? def.cap.est.resisteDesarme : def.cap.est.resistePresaDerribo;
      const pGana = p.pManiobra * pGanaControl(c.atk + bonoC + modificadorPorResultado(50), c.def + resiste);
      // Derribado: −30 a su defensa y +20 de posición superior para quien le pegue.
      if (m === 'derribo') v += pGana * (0.3 * amen + golpesSiguientes * mejora(50));
      if (m === 'presa') {
        // Una presa suele durar más de un asalto y deja al rival en parálisis parcial (−80).
        v += pGana * (1.5 * 0.8 * amen + golpesSiguientes * mejora(80));
        if (!e.sinPenalizadorApresando) v -= 0.2 * lambda(atk) * amen;
      }
      if (m === 'desarmar') {
        const s = def.ficha.sinArmas;
        const caida = s ? Math.max(0, 1 - s.ataque / Math.max(1, def.ficha.ataque)) : 0.5;
        v += pGana * 2 * caida * amen;
      }
    }
    if (esApuntado(m)) {
      // Un punto vulnerable critica con 1/10 de los PV; cabeza: inconsciente si falla por más de 50,
      // corazón: muerte si falla por más de 100 (Core p.97-98). Inutilizar: la extremidad es punto
      // débil y el crítico deja negativos. Inconsciencia: inconsciente si falla por más de 50.
      const t = tablaPara(atk, def);
      const base = Math.max(1, atk.ficha.danoBase);
      const pct = Math.max(10, Math.ceil(def.pv / 10 / base * 10) * 10);
      const pCrit = t.pPorcentajeAlMenos(hab - habDef, absorcionContra(def, atk, m, tipo), pct);
      const danoSiCritica = Math.max(def.pv / 10, p.dano / Math.max(0.05, p.pImpacto));
      const bonoEnuth = m === 'inconsciencia' ? (e.enuth >= 3 ? 50 : e.enuth >= 1 ? 20 : 0) : 0;
      const ventaja = danoSiCritica + atk.cap.bonoCritico + e.bonoCriticoEstilos + bonoEnuth +
        (m === 'cabeza' || m === 'corazon' ? e.bonoCriticoVital : 0) - (def.ficha.rf + def.cap.est.bonoRfCritico);
      if (m === 'inutilizar') {
        // Negativo esperado: lo que falla la RF, si falla (aprox. triangular de dos d100).
        const fallo = Math.max(0, ventaja + 33);
        v += pCrit * pDiferenciaD100(-ventaja) * Math.min(1, fallo / 100) * (2 * amen + golpesSiguientes * mejora(fallo));
      } else {
        const fueraDeCombate = pDiferenciaD100((m === 'corazon' ? 100 : 50) - ventaja);
        v += pCrit * fueraDeCombate * (def.pv + 2 * amen);
      }
    }
    if (m === 'engatillar') {
      // Amenazado: −120 a defenderse de él y −20 al atacarlo (Tabla 43).
      v += p.pManiobra * (0.2 * amen + Math.max(0, atk.ataquesRestantes - 1) * mejora(120));
    }
    if (m === 'puntosPresion') {
      // RF contra daño + 20: si falla, −fracaso a toda acción y −2×fracaso PV (Dominus p.42).
      const danoSiImpacta = p.dano / Math.max(0.05, p.pImpacto);
      const dif = dificultadPuntosPresion(danoSiImpacta, e.mushin >= 3);
      const margen = dif - def.ficha.rf;
      // Falla si el d100 de la RF sale por debajo del margen; el fracaso medio es la mitad del margen.
      const pFalla = Math.max(0, Math.min(1, (margen - 1) / 100));
      const fallo = Math.max(0, Math.min(margen, 100) / 2);
      v += p.pImpacto * pFalla * (2 * fallo + Math.min(1, fallo / 100) * 2 * amen);
      if (estadoMushin) v += p.pImpacto * pFalla * valorEstadoMushin(estadoMushin, def, amen);
    }
    return v;
  };

  // Tipo de crítico: el principal o el secundario, el que más rinda (Tabla de Ataque Inusual).
  let tipo: TipoAtaque | undefined;
  const sec = atk.ficha.arma?.critSecundario;
  if (sec && sec !== atk.ficha.tipoAtaque && valor('normal', sec) > valor('normal')) tipo = sec;

  const opciones: Maniobra[] = ['normal'];
  if (!def.ficha.acumulacion) {
    if (!def.derribado) opciones.push('derribo');
    if (e.puedePresar && !def.apresadoPor && !atk.apresando) opciones.push('presa');
    if (!def.cap.desarmado) opciones.push('desarmar');
    if (!def.cap.est.sangreEterna) opciones.push('cabeza', 'corazon', 'inutilizar');
    opciones.push('inconsciencia', 'engatillar');
    if (e.mushin) opciones.push('puntosPresion');
  }
  // No se puede aprovechar una contra para un ataque en área (Core p.89).
  const area = esContra ? [] : blancosArea(ctx, atk, def);
  if (area.length >= 2) opciones.push('area');

  let mejor: PlanAtaque = { maniobra: 'normal', tipo, especial: false };
  let mejorValor = -Infinity;
  for (const m of opciones) {
    let v = 0;
    if (m === 'area') {
      for (const b of area) {
        const p = pronostico(atk, b, ataqueFinal(atk, b, { bono, maniobra: 'area', tipo }), defensaFinal(b, atk), { tipo });
        v += p.dano + p.pBaja * amenaza(b, atk) * 2;
      }
    } else if (m === 'puntosPresion' && e.mushin >= 3) {
      // Mushin arcano: se prueba cada estado con su penalizador al ataque.
      for (const estado of [null, ...(Object.keys(ESTADOS_MUSHIN) as EstadoMushin[])]) {
        const ve = valor(m, tipo, estado);
        if (ve > mejorValor) {
          mejorValor = ve;
          mejor = { maniobra: m, tipo, especial: false, estadoMushin: estado };
        }
      }
      continue;
    } else v = valor(m, tipo);
    if (v > mejorValor) {
      mejorValor = v;
      mejor = { maniobra: m, tipo, especial: false };
    }
  }
  // Maniobra Especial (+20, una vez): se usa cuando sube claramente la chance de baja o de crítico.
  if (mejor.maniobra !== 'area' && puedeManiobraEspecial(atk, def)) {
    const h = (especial: boolean) => ataqueFinal(atk, def, { bono, maniobra: mejor.maniobra, esContra, tipo, especial });
    const sin = pronostico(atk, def, h(false), habDef, { maniobra: mejor.maniobra, tipo });
    const con = pronostico(atk, def, h(true), habDef, { maniobra: mejor.maniobra, tipo });
    if (con.pBaja + con.pCritico - sin.pBaja - sin.pCritico >= 0.1) mejor.especial = true;
  }
  return mejor;
}

/**
 * Godhand: sacrificar un ataque para que el primero del asalto siguiente tenga +30 HA y +50 de
 * daño (arcano +60 / +100). Conviene si el golpe potenciado vale más que el ataque que se pierde.
 */
export function prepararGodhand(ctx: Contexto, l: Luchador) {
  const g = l.cap.est.godhand;
  if (!g || l.godhandPreparado || l.ataquesRestantes < 1 || !puedeActuar(l)) return;
  let normal = 0;
  let potenciado = 0;
  const base = Math.max(1, l.ficha.danoBase);
  for (const e of enemigos(ctx, l)) {
    if (!alcanzable(l, e)) continue;
    const h = ataqueFinal(l, e);
    const d = defensaFinal(e, l);
    normal = Math.max(normal, pronostico(l, e, h, d).dano);
    potenciado = Math.max(potenciado, (pronostico(l, e, h + g.ataque, d).dano * (base + g.dano)) / base);
  }
  // El golpe potenciado llega un asalto tarde: se descuenta.
  if (potenciado * 0.7 - normal > normal * (l.ataquesRestantes > 1 ? 0.5 : 1)) {
    l.ataquesRestantes--;
    l.godhandPreparado = true;
  }
}

/** Puntos de Samiel a gastar (máx. 150 por acción) contra quien lo dañó (Dominus p.92). */
export function gastoSamiel(l: Luchador, rival: Luchador, uso: 'ataque' | 'defensa'): number {
  const puntos = l.samiel.get(rival) ?? 0;
  if (puntos < 20) return 0;
  const urgente = uso === 'ataque' ? rival.pv <= 0.4 * rival.ficha.pv : l.pv <= 0.35 * l.ficha.pv;
  return urgente ? Math.min(150, puntos) : 0;
}

export interface Proteccion {
  quien: Luchador;
  /** Penalizador a la defensa del protector. */
  pen: number;
  /** Apartar: gasta una acción reservada (un ataque que no usó). */
  apartar: boolean;
}

/**
 * Un aliado próximo defiende en lugar del atacado si su defensa es claramente mejor:
 * - Guardián (Ars Magnus): −10, sin necesitar el turno; no si el atacante lo sorprendió (Dominus p.86).
 * - Apartar (Core p.93): sólo quien esquiva, −30 (Tabla de Guardaespaldas −10). Es una acción
 *   activa: necesita haber ganado el turno al atacante y tener reservado un ataque sin usar.
 */
export function protectorPara(ctx: Contexto, def: Luchador, atk: Luchador): Proteccion | null {
  let mejor: Proteccion | null = null;
  let mejorDefensa = defensaFinal(def, atk) + 10;
  for (const g of ctx.luchadores) {
    if (g === def || g.equipo !== def.equipo || !activo(g) || g.ficha.acumulacion || !enAlcance(g, def)) continue;
    if (atk.sorprendeA.has(g)) continue;
    const base = defensaFinal(g, atk);
    if (g.cap.est.guardian && base - 10 > mejorDefensa) {
      mejorDefensa = base - 10;
      mejor = { quien: g, pen: 10, apartar: false };
      continue;
    }
    const esquiva = (g.ficha.tipoDefensa ?? 'parada') === 'esquiva';
    const reservo = g.iniciativa > atk.iniciativa && g.ataquesRestantes > 0 && puedeActuar(g);
    const pen = g.cap.est.penApartar;
    if (esquiva && reservo && base - pen > mejorDefensa) {
      mejorDefensa = base - pen;
      mejor = { quien: g, pen, apartar: true };
    }
  }
  return mejor;
}

/**
 * Haima: PV a sacrificar para que la sombra (aguante = 2 × sacrificio) reciba el golpe. Conviene si
 * el golpe probablemente impacta: se sacrifica algo más de la mitad del daño esperado si impacta.
 */
export function sacrificioHaima(def: Luchador, atk: Luchador, habAtk: number): number {
  const p = pronostico(atk, def, habAtk, defensaFinal(def, atk));
  if (p.pImpacto < 0.5 || p.dano <= 0) return 0;
  const danoSiImpacta = p.dano / p.pImpacto;
  const sacrificio = Math.max(5, Math.ceil((danoSiImpacta * 1.2) / 2));
  // Sólo si lo que paga es menos que lo que se ahorra (el daño y la acción).
  return sacrificio < danoSiImpacta * 0.9 && sacrificio < def.pv - 1 ? sacrificio : 0;
}

/**
 * Huir (con la opción de escenario "huida"): por debajo de un cuarto de los PV, si su equipo pierde
 * claramente el intercambio de daño. Los agresivos no huyen.
 */
export function quiereHuir(ctx: Contexto, l: Luchador): boolean {
  if (perfil(l) === 'agresivo') return false;
  return l.pv < l.ficha.pv / 4 && ctx.ventaja[l.equipo] < 0.5;
}
