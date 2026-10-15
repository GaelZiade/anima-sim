// IA por heurística: cada decisión puntúa sus opciones en "PV esperados" y elige la mejor.
// No tira dados ni mira hacia adelante; todas las probabilidades salen de las tablas precalculadas.

import { CARACTERISTICAS_KI, type Contexto, type Luchador, type Perfil, type Tecnica } from './modelo';
import { gradosPosibles, type Conjuro, type Grado } from './conjuros';
import {
  actPara, actPorCansancio, alcanceMagico, bendecir, costeConjuro, danoLlamas, deArea, maximoInnato, preparadoListo, quitarBendicion, rmDe,
  zeonLibre, ZEON_CONTROL_DEL_ESPACIO, type PlanMagia,
} from './magia';
import { buscarCamino, campoHacia, celdaDe, indice, lineaDeVision, type Celda } from './mapa';
import {
  absorcionContra, activo, ataqueMagico, defensaEscudoMagico, ALCANCE, alcanceMaximo, modProyectil, visionEntre, PEN_COBERTURA, ataqueFinal, defensaFinal, distancia, enAlcance, faltaParaLlegar, metrosTotales,
  danoBase, danoCon, danoEsperado, modControl, penAccion, preparacion, preparacionCon, pronosticoDesde, zonaDe, type Preparacion, pronostico, umbralPifiaTurno, puedeActuar, puedeManiobraEspecial, tablaPara, turnoFinal, PEN_PREVER_SORPRESA, type Pronostico,
} from './calculos';
import { pLlegaArea, tabla } from './probabilidades';
import { negativoCansancio, posicionPorOrden, umbralPifia, type TipoAtaque } from './reglas';
import { capacidades, planDeAtaques, type Ranura } from './rasgos';
import { completarArma, dificultadAtrapar, disparosConRecarga, PEN_ATRAPAR_ADICIONAL, PEN_ESQUIVA_TRAS_ATRAPAR, lanzamientosPosibles, reduccionesPosibles, superaTope, TOPE_PROYECTIL } from './proyectiles';
import { efectoCritico } from './valoracion';
import {
  asaltosQueFaltan, combinar, costeKi, curable, dificultadDestruccion, efectosDe, presenciaBase, fichaConAumento, habilidadesKi, modDeAccion, sensibleAlAura, radioAura, puedeEjecutar, puedePonerEnEspera, SIN_KI, tecnicasPara,
  enUso, repertorio, vistaPrevia, type DecisionKi, type EstadoSobrenatural, type ModKi,
} from './ki';
import type { Localizacion } from './reglas';
import {
  atributo, bonoCaracteristica, caracteristicasControl, dificultadPuntosPresion, esApuntado, esManiobraDeControl, esNoLetal, ESTADOS_MUSHIN, localizacionApuntada, modificadorPorResultado,
  penManiobra, pGanaControl, type EstadoMushin, type Maniobra,
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

// Memoria de una decisión: habilidades y golpe normal de cada par, que no cambian mientras la IA
// compara opciones. Se vacía al empezar cada decisión (las funciones exportadas) y al probar otro
// modo en `elegirModos`, así nunca sobrevive a un cambio de estado.
interface Base {
  /** Ataque final de `e` contra `l`, defensa final de `l` contra `e` y el daño esperado. */
  hab: number;
  def: number;
  golpe: number;
  /** Amenaza de `e` sobre `l` en el asalto (ver `amenaza`), calculada al pedirla. */
  amen?: number;
  /** Tabla, absorción y daño base de `e` contra `l`: el daño esperado con otras habilidades sin recalcularlos. */
  prep: Preparacion;
}
const memo = new Map<Luchador, Map<Luchador, Base>>();
/** Enemigos que pueden atacar a cada luchador este asalto (para la amenaza), por decisión. */
const rodean = new Map<Luchador, Luchador[]>();
let ctxActual: Contexto | null = null;

function nuevaDecision(ctx?: Contexto) {
  memo.clear();
  rodean.clear();
  if (ctx) ctxActual = ctx;
}

function quienesLlegan(l: Luchador): Luchador[] {
  let r = rodean.get(l);
  if (!r) {
    r = ctxActual ? ctxActual.luchadores.filter((x) => x.equipo !== l.equipo && activo(x) && faltaParaLlegar(x, l) <= metrosTotales(x)) : [];
    rodean.set(l, r);
  }
  return r;
}

function base(e: Luchador, l: Luchador): Base {
  let m = memo.get(e);
  if (!m) memo.set(e, (m = new Map()));
  let b = m.get(l);
  if (!b) {
    const hab = ataqueFinal(e, l);
    const def = defensaFinal(l, e);
    const prep = preparacion(e, l);
    b = { hab, def, golpe: danoCon(prep, hab - def), prep };
    m.set(l, b);
  }
  return b;
}

/** Daño que `e` le haría a `l` en un ataque normal. */
function golpeDe(e: Luchador, l: Luchador): number {
  return base(e, l).golpe;
}

/**
 * Daño esperado de `e` en todo el asalto contra `l` (amenaza). Si `l` está rodeado, `e` no lo
 * encuentra con la defensa entera: en promedio la mitad de los demás que llegan a él ya lo atacó,
 * y cada defensa adicional le resta (−30, −50, −70, −90). Sin esto, uno de muchos parece inofensivo.
 */
function amenaza(e: Luchador, l: Luchador): number {
  const b = base(e, l);
  return (b.amen ??= calcularAmenaza(e, l, b));
}

function calcularAmenaza(e: Luchador, l: Luchador, b: Base): number {
  let otros = 0;
  for (const x of quienesLlegan(l)) if (x !== e) otros++;
  if (otros < 2) return b.golpe * Math.max(1, e.ataquesDeclarados || 1);
  // Llega en promedio después de la mitad de los demás: con esa posición (frente, flanco o
  // espalda, Tabla 43) y esas defensas adicionales, si ya no está trabado en otro lugar.
  const antes = Math.floor(otros / 2);
  const trabado = l.trabados.indexOf(e);
  const posicion = trabado >= 0 ? posicionPorOrden(trabado) : posicionPorOrden(Math.max(antes, l.trabados.length));
  const golpe = danoEsperado(e, l, b.hab, defensaFinal(l, e, { defensasPrevias: l.defensasHechas + antes, posicion }));
  return golpe * Math.max(1, e.ataquesDeclarados || 1);
}

/**
 * Valor de dejar a `def` con −`pen` a toda acción, en PV: lo que deja de pegarle a `atk` (lo que
 * le queda de este asalto si no actuó, y el próximo si sigue en pie) más lo que pegan de más los
 * `golpes` siguientes de `atk`. Esto último nunca pasa de los PV que le quedarían: no se valora
 * daño sobre alguien que ya cae (`danoPrevio`: lo que se espera que ya pierda antes).
 */
function valorNegativo(atk: Luchador, def: Luchador, pen: number, golpes: number, danoPrevio: number): number {
  if (pen <= 0) return 0;
  const rival = base(def, atk);
  const perdida = rival.golpe - danoCon(rival.prep, rival.hab - pen - rival.def);
  const mio = base(atk, def);
  const quedan = Math.max(0, def.pv - danoPrevio - golpes * mio.golpe);
  const ganancia = Math.min(golpes * (danoCon(mio.prep, mio.hab - (mio.def - pen)) - mio.golpe), quedan);
  const ataques = Math.max(1, def.ataquesDeclarados || 1);
  const asaltos = (def.haActuado ? 0 : 1) + (quedan > 0 ? 1 : 0);
  return perdida * ataques * asaltos + ganancia;
}

/**
 * Valor esperado del crítico de un golpe, en PV: P(critica) × [P(fuera de combate) × (PV que le
 * quedarían + su amenaza de dos asaltos) + P(sólo negativos) × valor de esos negativos].
 */
function valorCritico(
  atk: Luchador, def: Luchador, pCritica: number, danoPleno: number, loc: Localizacion | null, m: Maniobra,
  golpes: number, danoPrevio: number, bonoKi = 0,
): number {
  if (pCritica <= 0) return 0;
  const e = atk.cap.est;
  const vital = m === 'cabeza' || m === 'corazon';
  const bonoEnuth = m === 'inconsciencia' ? (e.enuth >= 3 ? 50 : e.enuth >= 1 ? 20 : 0) : 0;
  const base = danoPleno + atk.cap.bonoCritico + e.bonoCriticoEstilos + (vital ? e.bonoCriticoVital : 0) + bonoEnuth + bonoKi;
  const ef = efectoCritico(base, def.ficha.rf + def.cap.est.bonoRfCritico + def.cap.est.bonoRfDano, loc, {
    inconsciencia: m === 'inconsciencia', sinMuerte: def.cap.est.sangreEterna, acumulacion: !!def.ficha.acumulacion,
  });
  // Quien reduce el dolor de los críticos (Inmunidad, Eliminación) sufre más o menos la mitad.
  const negativo = def.cap.mitadDolorCritico ? ef.negativo * 0.6 : ef.negativo;
  const fuera = Math.max(0, def.pv - danoPrevio) + 2 * amenaza(def, atk);
  return pCritica * (ef.pFuera * fuera + ef.pNegativo * valorNegativo(atk, def, negativo, golpes, danoPrevio));
}

/**
 * Lo que vale para `atk` un golpe con este pronóstico contra `def`, en PV: el daño, la chance de
 * dejarlo fuera por PV (le saca su amenaza de dos asaltos) y el crítico. Es la misma cuenta para
 * lo que uno pega y para lo que uno recibe, así las decisiones comparan en la misma escala.
 */
function valorGolpe(atk: Luchador, def: Luchador, p: Pronostico, golpes: number): number {
  const danoSiImpacta = p.pImpacto > 0 ? p.dano / p.pImpacto : 0;
  return p.dano + p.pBaja * amenaza(def, atk) * 2 +
    valorCritico(atk, def, p.pCritico, Math.max(def.pv / 2, danoSiImpacta), null, 'normal', golpes, p.dano);
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
  let v = valorGolpe(l, e, p, Math.max(0, (o.declarados ?? l.ataquesDeclarados) - 1));
  // Tempo: si todavía no actuó, impactarlo lo deja sin acciones este asalto.
  if (o.primeraVez !== false && !e.haActuado && puedeActuar(e) && !e.ficha.acumulacion)
    v += p.pImpacto * amen;
  // Riesgo de contra: sólo si le quedan ataques para devolverla.
  if (e.ataquesRestantes > 0 && puedeActuar(e)) {
    const golpeContra = danoEsperado(e, l, ataqueFinal(e, l, { bono: p.bonoContra }), defensaFinal(l, e));
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
  nuevaDecision(ctx);
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
  /** Acumula Ki este asalto (Core p.102). */
  acumularKi: boolean;
}

const SIN_MODOS = {
  estiloDefensivo: false, seraphite: 0 as const, berserker: false, ataqueFinal: false,
  bonoVariableEn: null, despertarOrochi: false, preverSorpresa: [] as Luchador[],
};

export function declarar(ctx: Contexto, l: Luchador): Declaracion {
  return { ...declararSinKi(ctx, l), acumularKi: acumulaKi(l) };
}

function declararSinKi(ctx: Contexto, l: Luchador): Omit<Declaracion, 'acumularKi'> {
  nuevaDecision(ctx);
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

  // Lo que no depende de cuántos ataques declare: se calcula una vez.
  const aliadosAntes = objetivos.map((e) => Math.floor(aliadosSobre(ctx, l, e) / 2));
  const contras = entrantes.map(({ e, peso }) => ({ e, peso, p: pronostico(e, l, ataqueFinal(e, l), defensaFinal(l, e)) }));
  let mejorN = 1;
  let mejorValor = -Infinity;
  for (let n = 1; n <= max; n++) {
    const usos: number[] = [];
    // Ataques en su turno: reparto greedy, cada golpe extra al mismo blanco enfrenta más defensas.
    // En promedio la mitad de los aliados que llegan al blanco lo atacarán antes que él.
    const golpes = new Array<number>(objetivos.length).fill(0);
    // Valor de cada blanco para la ranura anterior: si la ranura es igual (los n declarados lo son),
    // sólo cambia el del blanco elegido, y el resto no se recalcula.
    const valores = new Array<number>(objetivos.length).fill(0);
    let ranuraAnterior: Ranura | null = null;
    let elegidoAnterior = -1;
    // Los n declarados y después los extra (segunda arma, patada), cada uno con su penalizador.
    const plan = planDeAtaques(l.cap, n);
    for (const ranura of plan) {
      const igual = ranuraAnterior !== null && ranura.pen === ranuraAnterior.pen && ranura.sinArmas === ranuraAnterior.sinArmas;
      let mejor = -1;
      for (let i = 0; i < objetivos.length; i++) {
        if (!igual || i === elegidoAnterior) {
          const e = objetivos[i];
          valores[i] = valorAtaque(l, e, {
            declarados: n, ranura, primeraVez: golpes[i] === 0, defensasPrevias: e.defensasHechas + golpes[i] + aliadosAntes[i],
          });
        }
        if (mejor < 0 || valores[i] > valores[mejor]) mejor = i;
      }
      if (mejor < 0 || valores[mejor] <= 0) break;
      usos.push(valores[mejor]);
      golpes[mejor]++;
      ranuraAnterior = ranura;
      elegidoAnterior = mejor;
    }
    // Contras: cada ataque que reciba puede dar una Acción Respuesta si le quedan ataques.
    for (const { e, peso, p } of contras) {
      if (p.pContra <= 0) continue;
      const golpe = danoEsperado(l, e, ataqueFinal(l, e, { declarados: n, ranura: plan[0], bono: p.bonoContra }), defensaFinal(e, l));
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
      evitado += peso * (danoEsperado(e, l, atk, defensaFinal(l, e, { defensaTotal: false })) -
        danoEsperado(e, l, atk, defensaFinal(l, e, { defensaTotal: true })));
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
  const elegidos: Luchador[] = [];
  for (const { e } of entrantes) {
    // P(iniciativa de e − la suya ≥ umbral): la diferencia de dos d100 abiertas, como un ataque, cada
    // una con el umbral de pifia del turno (aproximado: la tabla trata su pifia como la de defensa).
    const t = tabla(umbralPifiaTurno(e), umbralPifiaTurno(l), false);
    const pSorpresa = t.pImpacto(turnoFinal(e) - turnoFinal(l) - e.cap.est.diferenciaSorpresa + 1);
    const atk = ataqueFinal(e, l);
    const def = defensaFinal(l, e);
    const dano = (pen: number) => danoEsperado(e, l, atk, def - pen);
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
): Omit<Declaracion, 'defensaTotal' | 'ataques' | 'acumularKi'> {
  const e = l.cap.est;
  const original = { modo: l.modo, bonoVariableEn: l.bonoVariableEn };
  const probar = (modo: Luchador['modo'], bonoVariableEn: Luchador['bonoVariableEn']) => {
    l.modo = modo;
    l.bonoVariableEn = bonoVariableEn;
    nuevaDecision();
    let v = valorDelAsalto(l, n, objetivos, entrantes);
    // Seraphite arcano sigue actuando aunque lo pongan a la defensiva: vale su ofensiva perdida.
    if (modo.seraphite === 3) v += 0.3 * Math.max(0, valorDelAsalto(l, n, objetivos, []));
    l.modo = original.modo;
    l.bonoVariableEn = original.bonoVariableEn;
    nuevaDecision();
    return v;
  };
  // Ataque Final: una vez, por debajo de la mitad de los PV (Dominus p.86). Se usa en cuanto se puede.
  const activarAtaqueFinal = e.ataqueFinal && !l.ataqueFinalUsado && l.pv < l.ficha.pv / 2;
  const base = { seraphite: 0 as 0 | 1 | 3, berserker: false, ataqueFinal: l.modo.ataqueFinal || activarAtaqueFinal };
  let mejor = { modo: base, bonoVariableEn: null as Luchador['bonoVariableEn'], valor: -Infinity };
  const seraphites: (0 | 1 | 3)[] = e.seraphite === 3 ? [0, 1, 3] : e.seraphite === 1 ? [0, 1] : [0];
  const bonos: Luchador['bonoVariableEn'][] = e.bonoVariable ? ['ataque', 'defensa', 'dano'] : [null];
  // Con una sola combinación posible no hace falta valorarla.
  if (seraphites.length === 1 && !e.berserker && !e.bonoVariable) mejor = { modo: { ...base, seraphite: 0, berserker: false }, bonoVariableEn: null, valor: 0 };
  else for (const seraphite of seraphites)
    for (const berserker of e.berserker ? [false, true] : [false])
      for (const bonoVariableEn of bonos) {
        const modo = { ...base, seraphite, berserker };
        const valor = probar(modo, bonoVariableEn);
        if (valor > mejor.valor) mejor = { modo, bonoVariableEn, valor };
      }

  // Estilo Defensivo: cambiar el ataque de la segunda arma por una defensa sin penalizador.
  let estiloDefensivo = false;
  if (l.cap.estiloDefensivo && entrantes.length >= 2) {
    const mejorEntrante = entrantes.reduce((a, b) => (amenaza(b.e, l) > amenaza(a.e, l) ? b : a)).e;
    const atk = ataqueFinal(mejorEntrante, l);
    const evitado =
      danoEsperado(mejorEntrante, l, atk, defensaFinal(l, mejorEntrante, { defensasPrevias: 1 })) -
      danoEsperado(mejorEntrante, l, atk, defensaFinal(l, mejorEntrante, { defensasPrevias: 0 }));
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
  nuevaDecision(ctx);
  const todos = enemigos(ctx, l);
  if (todos.length === 0) return null;
  const cercano = todos.reduce((a, b) => (faltaParaLlegar(l, b) < faltaParaLlegar(l, a) ? b : a));

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
  nuevaDecision(ctx);
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
  nuevaDecision(ctx);
  if (l.ficha.acumulacion || l.haActuado || !puedeActuar(l) || perfil(l) === 'bestia') return false;
  l.planResistir ??= convieneResistir(ctx, l, atk);
  return l.planResistir;
}

function convieneResistir(ctx: Contexto, l: Luchador, atk: Luchador): boolean {
  // Lo que pierde si lo ponen a la defensiva: su daño esperado del asalto. El tempo (dejar sin
  // asalto a quien todavía no actuó) sólo vale contra quien actúa después que él: el que lo está
  // atacando ahora ya habrá actuado cuando le toque.
  let miAsalto = 0;
  for (const e of enemigos(ctx, l)) {
    if (!alcanzable(l, e)) continue;
    const despues = e !== atk && e.iniciativa < l.iniciativa;
    miAsalto = Math.max(miAsalto, valorAtaque(l, e, { primeraVez: despues }));
  }
  miAsalto *= Math.max(1, l.ataquesRestantes);
  if (miAsalto <= 0) return false;

  // Ataques que probablemente reciba antes de su turno: el que lo ataca ahora y los que actúan antes
  // que él, repartidos entre los blancos que tengan.
  let costo = 0;
  let pSinImpacto = 1;
  // Resistiendo, también puede caer antes de actuar: entonces el asalto se pierde igual.
  let pSigueEnPie = 1;
  for (const e of enemigos(ctx, l)) {
    const ahora = e === atk;
    if (!ahora && (e.haActuado || e.iniciativa < l.iniciativa || !puedeActuar(e))) continue;
    if (!ahora && !alcanzable(e, l)) continue;
    const blancos = ctx.luchadores.filter((x) => x.equipo === l.equipo && activo(x) && alcanzable(e, x)).length;
    const ataques = (e.ataquesRestantes + (ahora ? 1 : 0)) / Math.max(1, ahora ? 1 : blancos);
    const hab = ataqueFinal(e, l);
    const normal = pronostico(e, l, hab, defensaFinal(l, e));
    const resistiendo = pronostico(e, l, hab, defensaFinal(l, e, { resistir: true }));
    const golpes = Math.max(0, ataques - 1);
    costo += ataques * lambda(l) * (valorGolpe(e, l, resistiendo, golpes) - valorGolpe(e, l, normal, golpes));
    pSinImpacto *= Math.pow(1 - normal.pImpacto, ataques);
    pSigueEnPie *= Math.pow(1 - resistiendo.pBaja, ataques);
  }
  // Si no resiste, pierde su asalto con la probabilidad de que al menos un ataque lo impacte.
  return costo < (1 - pSinImpacto) * pSigueEnPie * miAsalto;
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
  const disponibles = Math.min(l.cap.maxCansancioAsalto - l.cansancioAsalto, l.cansancio);
  if (disponibles <= 0 || perfil(l) === 'bestia') return 0;
  let gastar = 0;
  for (let k = 1; k <= disponibles && !agota(l, k); k++) {
    if (ganancia(k) - ganancia(k - 1) >= 0.08 * referencia) gastar = k;
    else break;
  }
  return gastar;
}

export function cansancioAtaque(ctx: Contexto, atk: Luchador, def: Luchador, bono: number, plan: PlanAtaque = NORMAL): number {
  nuevaDecision(ctx);
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
  nuevaDecision(ctx);
  if (def.ficha.acumulacion) return 0;
  const pron = (k: number) =>
    pronostico(atk, def, habAtaque, defensaFinal(def, atk, { cansancio: k, resistir: resistiendo }));
  const gastar = decidirCansancio(def, (k) => -(pron(k).dano + pron(k).pBaja * def.pv), Math.max(1, def.pv));
  if (gastar > 0) return gastar;
  // Desesperado: agotarse sólo si baja mucho la chance de quedar fuera de combate ahora, y con lo
  // mínimo que lo logra (con Uso de la energía necesaria podría quemar 5 de golpe).
  const disponibles = Math.min(def.cap.maxCansancioAsalto - def.cansancioAsalto, def.cansancio);
  const pBaja = pron(0).pBaja;
  for (let k = 1; k <= disponibles; k++) if (pBaja - pron(k).pBaja >= 0.2) return k;
  return 0;
}

// --------------------------------------------------------------------------- maniobras

export interface PlanAtaque {
  maniobra: Maniobra;
  tipo?: TipoAtaque;
  especial: boolean;
  /** Mushin arcano: estado a inducir con los puntos de presión. */
  estadoMushin?: EstadoMushin | null;
  /** Técnica de Ki que ejecuta con este ataque. */
  tecnica?: Tecnica;
  /** Destrucción por Ki: puntos de Ki que pone además del primero (+5 a la dificultad cada uno). */
  kiDestruccion?: number;
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
  nuevaDecision(ctx);
  const otros = enemigos(ctx, atk).filter((e) => e !== def && enAlcance(atk, e));
  return [def, ...otros].slice(0, atk.cap.est.blancosArea);
}

/**
 * Elige maniobra, tipo de crítico, técnica de Ki y si usa la Maniobra Especial para este ataque. Cada
 * técnica que puede ejecutar se prueba con cada maniobra (Disparo Vital rinde más apuntando a la
 * cabeza) y se descuenta lo que vale el Ki que gasta.
 */
export function elegirManiobra(
  ctx: Contexto, atk: Luchador, def: Luchador, esContra: boolean, bono: number, tecnica?: Tecnica | null, ranura?: Ranura,
): PlanAtaque {
  nuevaDecision(ctx);
  const sin = ctx.opciones.sinManiobras;
  const soloNormal = perfil(atk) === 'bestia' || sin === true || sin === atk.equipo;
  // A distancia (o con un proyectil, aun a bocajarro): con la técnica que eligió al decidir atacar de
  // lejos, o con una a distancia activa; un arma a distancia no se combina con técnicas.
  if (!enAlcance(atk, def) || ranura?.proyectil) {
    if (tecnica) return { ...mejorManiobra(ctx, atk, def, esContra, bono, vistaPrevia(atk, tecnica), soloNormal, true, ranura).plan, tecnica };
    return mejorManiobra(ctx, atk, def, esContra, bono, modDeAccion(atk, 'ataque', false), soloNormal, true, ranura).plan;
  }
  const base = mejorManiobra(ctx, atk, def, esContra, bono, modDeAccion(atk, 'ataque', false), soloNormal);
  if (!atk.ki) return base.plan;
  let mejor = base;
  let mejorNeto = base.valor;
  let elegida: Tecnica | undefined;
  for (const tec of tecnicasPara(atk, 'ataque', esContra)) {
    const ki = vistaPrevia(atk, tec);
    // Ataque especializado contra otra defensa: no tendría ningún efecto (Dominus p.72).
    if (ki.soloContra && (def.ficha.acumulacion ? 'acumulacion' : def.ficha.tipoDefensa ?? 'parada') !== ki.soloContra) continue;
    const r = mejorManiobra(ctx, atk, def, esContra, bono, ki, soloNormal);
    const neto = r.valor - precioKi(atk) * costeKi(tec) - costoDesventajas(atk, def, tec);
    if (neto > mejorNeto) {
      mejor = r;
      mejorNeto = neto;
      elegida = tec;
    }
  }
  // Si es un ataque común, el valor sin técnica es el mismo que el que `convieneGuardar` necesita.
  const sinTecnica = !esContra && bono === 0 && !soloNormal ? base.valor : undefined;
  if (!elegida || convieneGuardar(ctx, atk, def, elegida, mejorNeto - base.valor, sinTecnica)) return base.plan;
  return { ...mejor.plan, tecnica: elegida };
}

/** La mejor maniobra con estos efectos de Ki, y lo que vale en PV. */
function mejorManiobra(
  ctx: Contexto, atk: Luchador, def: Luchador, esContra: boolean, bono: number, ki: ModKi | undefined, soloNormal: boolean,
  aDistancia = false, ranura?: Ranura,
): { plan: PlanAtaque; valor: number } {
  const e = atk.cap.est;
  const amen = amenaza(def, atk);
  // Un proyectil a bocajarro se defiende como un golpe; de lejos, con la Tabla 49 (Core p.96).
  const lejos = !enAlcance(atk, def);
  const proyectil = aDistancia && lejos ? ranura?.proyectil?.clase ?? 'disparo' : undefined;
  const habDef = ki?.sobrenatural || proyectil ? defensaFinal(def, atk, { kiAtk: ki, proyectil }) : defensaFinal(def, atk);
  // Tope de 280 de los proyectiles (Core p.95): se aproxima topeando la habilidad en 280 − 50.
  const tope = ranura?.proyectil && !superaTope(atk.ficha) ? TOPE_PROYECTIL - 50 : Infinity;
  const golpesSiguientes = Math.max(0, atk.ataquesRestantes - 1) + aliadosSobre(ctx, atk, def) / 2;
  // Cuánto más pegan los golpes que siguen si el rival queda con −pen a su defensa, sin pasar de los
  // PV que le quedarían después de este golpe y de esos mismos golpes sin la ventaja.
  const { hab: hNormal, golpe: golpeNormal } = base(atk, def);
  const ganancia = (pen: number, golpes: number, danoEste: number) => {
    const quedan = Math.max(0, def.pv - danoEste - golpes * golpeNormal);
    return Math.min(golpes * (danoEsperado(atk, def, hNormal, habDef - pen) - golpeNormal), quedan);
  };

  // El ataque final sólo cambia de una maniobra a otra en su penalizador (y en el estado de Mushin):
  // se calcula una vez por tipo de crítico y se le resta el de cada maniobra.
  const habNormal = new Map<TipoAtaque | undefined, number>();
  const habDe = (m: Maniobra, tipo: TipoAtaque | undefined, estadoMushin: EstadoMushin | null): number => {
    // Xing Quan también depende de la maniobra (sólo golpes normales o apuntados, Dominus p.38).
    if (estadoMushin || m === 'area' || (atk.cap.est.xingQuan && m !== 'normal' && !esApuntado(m))) return Math.min(tope, ataqueFinal(atk, def, { bono, maniobra: m, esContra, tipo, estadoMushin, ki, ranura }));
    let h = habNormal.get(tipo);
    if (h === undefined) habNormal.set(tipo, (h = ataqueFinal(atk, def, { bono, maniobra: 'normal', esContra, tipo, ki, ranura })));
    if (m === 'normal' || (m === 'presa' && ki?.apresamiento)) return Math.min(tope, h);
    return Math.min(tope, h - Math.max(0, penManiobra(atk, m, esContra) - (ki?.precision ?? 0)));
  };
  // Tabla, absorción y daño base sólo cambian con la zona (o la maniobra de control), el tipo de
  // crítico y el factor de daño: se preparan una vez por combinación.
  const preps = new Map<string, Preparacion>();
  const prepDe = (m: Maniobra, tipo: TipoAtaque | undefined, factorDano: number | undefined): Preparacion => {
    const clave = `${esManiobraDeControl(m) ? m : zonaDe(m)}|${tipo}|${factorDano}`;
    let p = preps.get(clave);
    if (!p) preps.set(clave, (p = preparacionCon(atk, def, { maniobra: m, esContra, tipo, ki, factorDano, ranura })));
    return p;
  };
  const criticoAuto = !!ki?.criticoAuto;
  const valor = (m: Maniobra, tipo?: TipoAtaque, estadoMushin: EstadoMushin | null = null): number => {
    const hab = ki?.ataqueFijo || habDe(m, tipo, estadoMushin);
    // Daño reducido (desventaja): ese golpe hace la mitad o nada, pero sus efectos funcionan.
    const reducido = ki?.danoReducido ? 1 - ki.danoReducido : undefined;
    const p = pronosticoDesde(prepDe(m, tipo, reducido), def, hab - habDef, criticoAuto);
    // Inutilizar e Inconsciencia: la mitad de daño (y de chance de tumbarlo por PV); el crítico, pleno.
    const real = esNoLetal(m) ? pronosticoDesde(prepDe(m, tipo, 0.5 * (reducido ?? 1)), def, hab - habDef, criticoAuto) : p;
    // Los ataques que no dañan (engatillar, puntos de presión) se valoran sólo por su efecto.
    const sinDano = m === 'engatillar' || m === 'puntosPresion';
    const danoEste = sinDano ? 0 : real.dano;
    let v = danoEste + (sinDano || m === 'inconsciencia' ? 0 : real.pBaja * amen * 2);
    if (!def.haActuado && puedeActuar(def) && !def.ficha.acumulacion) v += p.pImpacto * amen;
    // Ataque indirecto (Ki) o desde lejos: no se le puede contraatacar (Dominus p.52).
    if (def.ataquesRestantes > 0 && puedeActuar(def) && !ki?.indirecto && !(aDistancia && lejos)) v -= lambda(atk) * p.pContra * golpeDe(def, atk);
    if (ki && ki !== SIN_KI) v += valorEfectosKi(atk, def, ki, p, m, golpesSiguientes);

    // Crítico: un punto vulnerable critica con 1/10 de los PV (Core p.97) y pega donde apuntó;
    // cualquier otro golpe, con la mitad de los PV y en un lugar al azar.
    const danoSiImpacta = p.pImpacto > 0 ? p.dano / p.pImpacto : 0;
    const vulnerable = esApuntado(m) && !def.cap.est.sangreEterna && !def.ficha.acumulacion;
    if (!sinDano && vulnerable) {
      const t = tablaPara(atk, def);
      const base = Math.max(1, danoBase(atk, def, esContra, ranura, ki));
      const pct = Math.max(10, Math.ceil(def.pv / 10 / base * 10) * 10);
      const pCrit = t.pPorcentajeAlMenos(hab - habDef, absorcionContra(def, atk, m, tipo, ranura, ki), pct);
      v += valorCritico(atk, def, pCrit, Math.max(def.pv / 10, danoSiImpacta), localizacionApuntada(m), m, golpesSiguientes, danoEste, ki?.critico);
    } else if (!sinDano) {
      v += valorCritico(atk, def, p.pCritico, Math.max(def.pv / 2, danoSiImpacta), null, m, golpesSiguientes, danoEste, ki?.critico);
    }

    if (m === 'derribo' || m === 'presa' || m === 'desarmar') {
      const c = caracteristicasControl(m, atk, def, ki?.apresamiento);
      const bonoC = m === 'desarmar'
        ? (esContra ? e.controlDesarmarEnContra : e.controlDesarmar)
        : (esContra ? e.controlPresaDerriboEnContra : e.controlPresaDerribo);
      const resiste = m === 'desarmar' ? def.cap.est.resisteDesarme : def.cap.est.resistePresaDerribo;
      const pGana = p.pManiobra * pGanaControl(c.atk + bonoC + modificadorPorResultado(50) + modControl(atk), c.def + resiste + modControl(def));
      // Derribado: −30 a su defensa y +20 de posición superior para quien le pegue; levantarse le
      // gasta la acción activa del asalto siguiente (−25 a lo que haga).
      if (m === 'derribo') v += pGana * (0.3 * amen + ganancia(50, golpesSiguientes, danoEste));
      if (m === 'presa') {
        // Una presa suele durar más de un asalto y deja al rival en parálisis parcial (−80).
        v += pGana * (1.5 * 0.8 * amen + ganancia(80, golpesSiguientes, danoEste));
        if (!e.sinPenalizadorApresando && !ki?.apresamiento) v -= 0.2 * lambda(atk) * amen;
      }
      if (m === 'desarmar') {
        const s = def.ficha.sinArmas;
        const caida = s ? Math.max(0, 1 - s.ataque / Math.max(1, def.ficha.ataque)) : 0.5;
        v += pGana * 2 * caida * amen;
      }
    }
    if (m === 'engatillar') {
      // Amenazado: −120 a defenderse de él y −20 al atacarlo (Tabla 43). Dura hasta que lo use: si no
      // le quedan ataques este asalto, vale para el primero del siguiente.
      v += p.pManiobra * (0.2 * amen + ganancia(120, Math.max(1, atk.ataquesRestantes - 1), 0));
    }
    if (m === 'combinado') {
      // Leo: si la hoja lo alcanza, dispara a bocajarro con +30 y sin más penalizador que el −20,
      // contra una defensa más (Dominus p.101, Core p.96).
      const bala: Ranura = { pen: 0, sinArmas: false, bala: true };
      const hab2 = ataqueFinal(atk, def, { declarados: 1, ranura: bala, bono: 30, maniobra: 'combinado' });
      const def2 = defensaFinal(def, atk, { defensasPrevias: def.defensasHechas + 1 });
      const p2 = pronostico(atk, def, hab2, def2, { ranura: bala });
      let disparo = valorGolpe(atk, def, p2, golpesSiguientes);
      if (def.ataquesRestantes > 0 && puedeActuar(def)) disparo -= lambda(atk) * p2.pContra * golpeDe(def, atk);
      v += p.pImpacto * disparo;
    }
    if (m === 'puntosPresion') {
      // RF contra daño + 20: si falla, −fracaso a toda acción y −2×fracaso PV (Dominus p.42).
      const dif = dificultadPuntosPresion(danoSiImpacta, e.mushin >= 3);
      const margen = dif - def.ficha.rf - def.cap.est.bonoRfDano;
      // Falla si el d100 de la RF sale por debajo del margen; el fracaso medio es la mitad del margen.
      const pFalla = Math.max(0, Math.min(1, (margen - 1) / 100));
      const fallo = Math.max(0, Math.min(margen, 100) / 2);
      v += p.pImpacto * pFalla * (Math.min(2 * fallo, def.pv) + valorNegativo(atk, def, fallo, golpesSiguientes, 2 * fallo));
      if (estadoMushin) v += p.pImpacto * pFalla * valorEstadoMushin(estadoMushin, def, amen);
    }
    return v;
  };

  // Tipo de crítico: el principal o el secundario, el que más rinda (Tabla de Ataque Inusual).
  let tipo: TipoAtaque | undefined = ki?.elemento || undefined;
  const sec = ranura?.proyectil ? undefined : atk.ficha.arma?.critSecundario;
  // El golpe normal ya queda valorado: no se vuelve a calcular en la recorrida de maniobras.
  let vNormal: number | undefined;
  if (!tipo && sec && sec !== atk.ficha.tipoAtaque) {
    const vSec = valor('normal', sec);
    const vPrincipal = valor('normal');
    if (vSec > vPrincipal) tipo = sec;
    vNormal = vSec > vPrincipal ? vSec : vPrincipal;
  }

  const opciones: Maniobra[] = ['normal'];
  // A distancia sólo se puede apuntar (Core p.91); el resto de maniobras pide contacto.
  if (aDistancia) {
    if (!def.ficha.acumulacion && !soloNormal && !def.cap.est.sangreEterna) opciones.push('cabeza', 'corazon', 'inutilizar');
  } else if (!def.ficha.acumulacion && !soloNormal) {
    if (!def.derribado) opciones.push('derribo');
    if ((e.puedePresar || ki?.apresamiento) && !def.apresadoPor && !atk.apresando) opciones.push('presa');
    if (!def.cap.desarmado) opciones.push('desarmar');
    if (!def.cap.est.sangreEterna) opciones.push('cabeza', 'corazon', 'inutilizar');
    opciones.push('inconsciencia', 'engatillar');
    if (e.mushin) opciones.push('puntosPresion');
  }
  if (e.leo && atk.balas > 0 && !aDistancia) opciones.push('combinado');
  // Destrucción por Ki es un ataque propio: no se combina con una técnica que mejore el golpe.
  const golpeConTecnica = !!ki && (ki.ataque > 0 || ki.dano > 0 || ki.multDano > 1 || ki.danoFijo > 0 || ki.area > 0 || ki.ataqueFijo > 0);
  if (!soloNormal && !aDistancia && !golpeConTecnica && habilidadesKi(atk.ficha).destruccion && (atk.ki?.reserva ?? 0) >= 1) opciones.push('destruccionKi');
  // No se puede aprovechar una contra para un ataque en área (Core p.89). Con un área de Ki la
  // maniobra sobra: la técnica ya alcanza a todos los del radio.
  const area = esContra || soloNormal || aDistancia || ki?.area ? [] : blancosArea(ctx, atk, def);
  if (area.length >= 2) opciones.push('area');

  let mejor: PlanAtaque = { maniobra: 'normal', tipo, especial: false };
  let mejorValor = -Infinity;
  for (const m of opciones) {
    let v = 0;
    if (m === 'area') {
      // Cada blanco con la misma cuenta que un golpe normal: daño, baja, crítico, tempo y su contra.
      // Si uno que para lo desvía (le queda contra), lo intercepta: los siguientes no reciben nada,
      // así que cada blanco cuenta con la probabilidad de que el ataque llegue hasta él (Core p.92).
      const habs = area.map((b) => ({ hab: ataqueFinal(atk, b, { bono, maniobra: 'area', tipo }), def: defensaFinal(b, atk) }));
      const llega = pLlegaArea(atk.cap.umbralAtaque, area.map((b, i) => ({
        s: habs[i].hab - habs[i].def, umbralDefensa: b.cap.umbralDefensa,
        para: (b.ficha.tipoDefensa ?? 'parada') === 'parada' && !b.ficha.acumulacion,
      })));
      area.forEach((b, i) => {
        const p = pronostico(atk, b, habs[i].hab, habs[i].def, { tipo });
        let vb = valorGolpe(atk, b, p, b === def ? golpesSiguientes : 0);
        if (!b.haActuado && puedeActuar(b) && !b.ficha.acumulacion) vb += p.pImpacto * amenaza(b, atk);
        if (b.ataquesRestantes > 0 && puedeActuar(b)) vb -= lambda(atk) * p.pContra * golpeDe(b, atk);
        v += llega[i] * vb;
      });
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
    } else if (m === 'destruccionKi') {
      // Destrucción por Ki: se prueba cada cantidad de Ki extra (+5 a la dificultad cada una).
      const hab = ataqueFinal(atk, def, { bono, maniobra: m, esContra, tipo });
      const p = pronostico(atk, def, hab, habDef, { maniobra: m, esContra, tipo });
      const rf = def.ficha.rf + def.cap.est.bonoRfDano;
      const tope = Math.min(Math.floor(presenciaBase(atk.ficha) / 5), atk.ki!.reserva - 1);
      let base = 0;
      if (!def.haActuado && puedeActuar(def) && !def.ficha.acumulacion) base += p.pImpacto * amen;
      if (def.ataquesRestantes > 0 && puedeActuar(def)) base -= lambda(atk) * p.pContra * golpeDe(def, atk);
      for (let extra = 0; extra <= tope; extra++) {
        // Fracaso = margen − d100 (1-99; el 100 resiste): su media y la chance de dejarlo a 0 PV.
        const margen = dificultadDestruccion(atk, extra) - rf;
        let medio = 0;
        for (let d = 1; d <= 99 && d < margen; d++) medio += (margen - d) / 100;
        const pBaja = Math.max(0, Math.min(99, margen - Math.max(1, def.pv))) / 100;
        const ve = base + p.pImpacto * (medio + pBaja * 2 * amen) - precioKi(atk) * (1 + extra);
        if (ve > mejorValor) {
          mejorValor = ve;
          mejor = { maniobra: m, tipo, especial: false, kiDestruccion: extra };
        }
      }
      continue;
    } else v = (m === 'normal' && vNormal !== undefined ? vNormal : valor(m, tipo)) + (ki?.area ? valorAreaKi(ctx, atk, def, ki, bono, m, tipo) : 0);
    if (v > mejorValor) {
      mejorValor = v;
      mejor = { maniobra: m, tipo, especial: false };
    }
  }
  // Maniobra Especial (+20, una vez): se usa cuando sube claramente la chance de baja o de crítico.
  if (mejor.maniobra !== 'area' && !ki?.ataqueFijo && puedeManiobraEspecial(atk, def)) {
    const h = (especial: boolean) => ataqueFinal(atk, def, { bono, maniobra: mejor.maniobra, esContra, tipo, especial, ki });
    const sin = pronostico(atk, def, h(false), habDef, { maniobra: mejor.maniobra, tipo, ki });
    const con = pronostico(atk, def, h(true), habDef, { maniobra: mejor.maniobra, tipo, ki });
    if (con.pBaja + con.pCritico - sin.pBaja - sin.pCritico >= 0.1) mejor.especial = true;
  }
  return { plan: mejor, valor: mejorValor };
}

/**
 * Godhand: sacrificar un ataque para que el primero del asalto siguiente tenga +30 HA y +50 de
 * daño (arcano +60 / +100). Conviene si el golpe potenciado vale más que el ataque que se pierde.
 */
export function prepararGodhand(ctx: Contexto, l: Luchador) {
  nuevaDecision(ctx);
  const g = l.cap.est.godhand;
  if (!g || l.godhandPreparado || l.ataquesRestantes < 1 || !puedeActuar(l)) return;
  let normal = 0;
  let potenciado = 0;
  const base = Math.max(1, l.ficha.danoBase);
  for (const e of enemigos(ctx, l)) {
    if (!alcanzable(l, e)) continue;
    const h = ataqueFinal(l, e);
    const d = defensaFinal(e, l);
    normal = Math.max(normal, danoEsperado(l, e, h, d));
    potenciado = Math.max(potenciado, (danoEsperado(l, e, h + g.ataque, d) * (base + g.dano)) / base);
  }
  // El golpe potenciado llega un asalto tarde: se descuenta.
  if (potenciado * 0.7 - normal > normal * (l.ataquesRestantes > 1 ? 0.5 : 1)) {
    l.ataquesRestantes--;
    l.godhandPreparado = true;
  }
}

/** Puntos de Samiel a gastar (máx. 150 por acción) contra quien lo dañó (Dominus p.92). */
export function gastoSamiel(l: Luchador, rival: Luchador, uso: 'ataque' | 'defensa'): number {
  nuevaDecision();
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
  nuevaDecision(ctx);
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
  nuevaDecision();
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
  nuevaDecision(ctx);
  // El Berserker no comprende cuándo debe retirarse (Dominus p.84).
  if (perfil(l) === 'agresivo' || l.modo.berserker) return false;
  return l.pv < l.ficha.pv / 4 && ctx.ventaja[l.equipo] < 0.5;
}

// --------------------------------------------------------------------------- Ki

/**
 * Lo que vale un punto de Ki, en PV: gastar toda la reserva tiene que rendir al menos la mitad de
 * sus PV. Sube a medida que se vacía la reserva.
 */
function precioKi(l: Luchador): number {
  const inicial = Math.max(1, l.ficha.ki?.reserva ?? 1);
  const queda = Math.max(1, l.ki?.reserva ?? 0);
  return ((0.5 * l.ficha.pv) / inicial) * Math.sqrt(inicial / queda);
}

/** Acumular es pasivo y no cuesta nada: se acumula mientras quede reserva y tenga técnicas. */
function acumulaKi(l: Luchador): boolean {
  return !!l.ki && l.ki.reserva > 0 && !!l.ficha.ki?.tecnicas.length;
}

/**
 * Absorción de energía (Dominus p.20): cuánto Ki pone para no perder PV con un daño plenamente
 * energético, a 1 de Ki cada 5 de daño. Es voluntaria: lo hace mientras un punto de Ki le valga menos
 * que los 5 PV que ahorra.
 */
export function kiParaAbsorber(l: Luchador, dano: number): number {
  if (!l.ki || !habilidadesKi(l.ficha).absorcion || perfil(l) === 'bestia') return 0;
  if (precioKi(l) >= 5) return 0;
  return Math.min(l.ki.reserva, Math.ceil(dano / 5));
}

/** Asaltos que se supone que dura lo que se activa al empezar (para comparar con lo que cuesta). */
const ASALTOS_PREVISTOS = 4;

/**
 * Aumento de características: prueba subir cada una hasta el máximo con la ficha cambiada y mide lo
 * que gana por asalto (lo que pega de más al rival principal y lo que deja de recibir de cada uno que
 * puede atacarlo). Conviene si en los asaltos previstos supera el Ki de activarlo y mantenerlo.
 */
function elegirAumento(ctx: Contexto, l: Luchador): DecisionKi['aumentar'] {
  const h = habilidadesKi(l.ficha);
  const rival = rivalPrincipal(ctx, l);
  if (!rival) return undefined;
  const medir = () => {
    nuevaDecision(ctx);
    let v = golpeDe(l, rival) * Math.max(1, l.cap.maxAtaques);
    for (const e of enemigos(ctx, l)) if (alcanzable(e, l)) v -= lambda(l) * amenaza(e, l);
    return v;
  };
  const antes = medir();
  const original = { ficha: l.ficha, cap: l.cap };
  let mejor: DecisionKi['aumentar'];
  let mejorNeto = 0;
  for (const a of ['DES', 'AGI', 'FUE', 'CON'] as const) {
    const desde = l.ficha.atributos?.[a] ?? 5;
    const hasta = desde + h.aumento;
    const mantener = Math.ceil(ASALTOS_PREVISTOS / h.asaltosPorPagoAumento);
    if (l.ki!.reserva < hasta + mantener) continue;
    l.ficha = fichaConAumento(original.ficha, a, desde, hasta);
    l.cap = capacidades(l.ficha);
    const ganancia = medir() - antes;
    l.ficha = original.ficha;
    l.cap = original.cap;
    const neto = ganancia * ASALTOS_PREVISTOS - precioKi(l) * (hasta + mantener);
    if (neto > mejorNeto) {
      mejorNeto = neto;
      mejor = { atributo: a, hasta };
    }
  }
  nuevaDecision(ctx);
  return mejor;
}

/**
 * Curación por Ki en su turno, en lugar de un ataque: a sí mismo o al aliado en contacto que más la
 * necesite. Los PV curados valen lo mismo que el daño recibido (λ), y conviene si eso menos el Ki
 * supera su mejor ataque. Sólo con 30% o más de los PV perdidos.
 */
export function curacionKi(ctx: Contexto, l: Luchador): { quien: Luchador; ki: number } | null {
  const rate = habilidadesKi(l.ficha).curacion;
  if (!rate || !l.ki || l.ki.reserva <= 0 || perfil(l) === 'bestia') return null;
  nuevaDecision(ctx);
  let mejor: { quien: Luchador; ki: number; valor: number } | null = null;
  for (const x of ctx.luchadores) {
    if (x.equipo !== l.equipo || !activo(x) || (x !== l && !enAlcance(l, x)) || x.pv > 0.7 * x.ficha.pv) continue;
    const pv = Math.min(curable(x), l.ki.reserva * rate);
    if (pv <= 0) continue;
    const ki = Math.ceil(pv / rate);
    const valor = lambda(l) * pv - precioKi(l) * ki;
    if (!mejor || valor > mejor.valor) mejor = { quien: x, ki, valor };
  }
  if (!mejor || mejor.valor <= 0) return null;
  let ataque = 0;
  for (const e of enemigos(ctx, l)) if (alcanzable(l, e)) ataque = Math.max(ataque, valorAtaque(l, e, {}));
  return mejor.valor > ataque ? { quien: mejor.quien, ki: mejor.ki } : null;
}

/** Algún enemigo puede atacarlo con crítico de energía: vale la pena encender la Armadura mayor. */
function hayAtaquesDeEnergia(ctx: Contexto, l: Luchador): boolean {
  return enemigos(ctx, l).some((e) =>
    e.ficha.tipoAtaque === 'ENE' || e.ficha.arma?.critSecundario === 'ENE' || e.ficha.sinArmas?.tipoAtaque === 'ENE');
}

/**
 * Recuperación (Core p.105): 5 de Ki por un punto de cansancio. Sin técnicas, el Ki no tiene otro
 * uso; con técnicas, sólo si le sobra el doble de la más cara.
 */
function convieneRecuperar(l: Luchador): boolean {
  const e = l.ki!;
  if (!habilidadesKi(l.ficha).recuperacion || e.reserva < 5) return false;
  if (l.cansancio >= (l.ficha.cansancio ?? l.ficha.constitucion)) return false;
  const tecnicas = l.ficha.ki?.tecnicas ?? [];
  return !tecnicas.length || e.reserva - 5 >= 2 * Math.max(...tecnicas.map(costeKi));
}

/**
 * Guardar Ki para una técnica de ataque mejor que todavía no alcanza: ejecutar ahora devuelve lo
 * sobrante a la reserva y empieza de cero. Conviene esperar si lo que gana con la otra, descontado
 * por los asaltos que faltan, supera lo que gana ahora en todos esos asaltos.
 */
function convieneGuardar(
  ctx: Contexto, l: Luchador, rival: Luchador, elegida: Tecnica, ganancia: number, conocido?: number,
): boolean {
  // El ataque sin técnica sólo hace falta si alguna está a 1-3 asaltos.
  let sinTecnica = conocido;
  for (const t of repertorio(l.ficha)) {
    if (t === elegida || efectosDe(t).clase !== 'ataque' || enUso(l.ki!, t)) continue;
    const faltan = asaltosQueFaltan(l, t);
    if (faltan < 1 || faltan > 3) continue;
    sinTecnica ??= mejorManiobra(ctx, l, rival, false, 0, modDeAccion(l, 'ataque', false), false).valor;
    const otra = mejorManiobra(ctx, l, rival, false, 0, vistaPrevia(l, t), false).valor - sinTecnica - precioKi(l) * costeKi(t);
    if (otra * Math.pow(0.8, faltan) > ganancia * (1 + faltan)) return true;
  }
  return false;
}

/**
 * Blancos de un ataque en área de Ki: todos los que estén en el radio alrededor del blanco. Sin
 * Elección de blanco no puede excluir a nadie, aliados incluidos (Dominus p.58).
 */
export function blancosAreaKi(ctx: Contexto, atk: Luchador, def: Luchador, ki: ModKi): Luchador[] {
  const otros = ctx.luchadores.filter(
    (x) => x !== atk && x !== def && activo(x) && distancia(x, def) <= ki.area && (!ki.eleccionBlanco || x.equipo !== atk.equipo),
  );
  return [def, ...otros];
}

/** Lo que suma un área de Ki por los demás blancos del radio (los aliados restan). */
function valorAreaKi(
  ctx: Contexto, atk: Luchador, def: Luchador, ki: ModKi, bono: number, maniobra: Maniobra, tipo?: TipoAtaque,
): number {
  let v = 0;
  for (const b of blancosAreaKi(ctx, atk, def, ki)) {
    if (b === def) continue;
    // La maniobra (y su penalizador) es la misma para todos los del área.
    const hab = ki.ataqueFijo || ataqueFinal(atk, b, { bono, tipo, ki, maniobra });
    const p = pronostico(atk, b, hab, defensaFinal(b, atk), { tipo, ki });
    if (b.equipo === atk.equipo) {
      v -= p.dano + p.pBaja * amenaza(atk, b);
      continue;
    }
    let vb = valorGolpe(atk, b, p, 0);
    if (!b.haActuado && puedeActuar(b) && !b.ficha.acumulacion) vb += p.pImpacto * amenaza(b, atk);
    if (b.ataquesRestantes > 0 && puedeActuar(b)) vb -= lambda(atk) * p.pContra * golpeDe(b, atk);
    v += vb;
  }
  return v;
}

/**
 * RF contra una dificultad: P(fallarla) y el fracaso medio si la falla. El d100 no es abierto y el
 * 100 natural siempre resiste.
 */
function fracasoRf(def: Luchador, dificultad: number): { p: number; medio: number } {
  const margen = dificultad - (def.ficha.rf + def.cap.est.bonoRfDano + (def.ki?.activo.rf ?? 0));
  const tope = Math.min(99, margen - 1);
  if (tope < 1) return { p: 0, medio: 0 };
  return { p: tope / 100, medio: margen - (tope + 1) / 2 };
}

/** Lo que vale para `atk`, en PV, que `def` sufra este Estado sobrenatural (Dominus p.67) si falla la RF. */
function valorEstado(atk: Luchador, def: Luchador, est: EstadoSobrenatural, golpes: number): number {
  const { p, medio } = fracasoRf(def, est.rf);
  if (!p) return 0;
  const pv = Math.max(0, def.pv);
  const fuera = pv + 2 * amenaza(def, atk);
  switch (est.estado) {
    case 'dano': return p * Math.min(medio, pv);
    case 'dobleDano': return p * Math.min(2 * medio, pv);
    case 'drenajeVida': return p * (Math.min(medio, pv) + lambda(atk) * Math.min(medio, atk.ficha.pv - atk.pv));
    case 'drenajeKi': return p * Math.min(medio, def.ki?.reserva ?? 0) * (def.ki ? precioKi(def) + precioKi(atk) : 0);
    case 'dolor': return def.ficha.estados?.dolor ? 0 : p * valorNegativo(atk, def, 40, golpes, 0) * 2;
    case 'dolorExtremo': return def.ficha.estados?.dolor === 'extremo' ? 0 : p * valorNegativo(atk, def, 80, golpes, 0) * 2;
    case 'miedo': return def.ficha.estados?.miedo ? 0 : p * valorNegativo(atk, def, 60, golpes, 0) * 2;
    case 'ceguera': return def.ficha.estados?.ceguera === 'absoluta' ? 0 : p * valorNegativo(atk, def, 90, golpes, 0) * 2;
    case 'penalizacionMenor': return p * valorNegativo(atk, def, medio, golpes, 0);
    case 'penalizacionMayor': return p * valorNegativo(atk, def, medio, golpes, 0) * 2;
    case 'paralisisParcial': return p * valorNegativo(atk, def, 80, golpes, 0) * Math.min(2, medio / 2);
    case 'fascinacion': return p * amenaza(def, atk);
    case 'reduccionRf': return p * medio * 0.1;
    case 'reduccionCaracteristica': return p * Math.floor(medio / 10) * 0.1 * amenaza(def, atk);
    case 'reduccionCaracteristicas': return p * Math.floor(medio / 10) * 0.3 * amenaza(def, atk);
    case 'ilusion': return 0;
    // Paralización total, inconsciencia, coma, muerte, control y terror: lo sacan de la pelea.
    default: return p * fuera;
  }
}

/**
 * Efectos sobrenaturales de un golpe con técnica, en PV (Dominus cap. 5): Estados si daña (o si toca,
 * con Contacto físico), Impacto si supera la defensa, Marca para los golpes que sigan, Interrupción
 * del Ki que tenga concentrado.
 */
function valorEfectosKi(atk: Luchador, def: Luchador, ki: ModKi, p: Pronostico, m: Maniobra, golpes: number): number {
  if (!ki.estados.length && !ki.impacto && !ki.marca && !ki.interrumpe) return 0;
  let v = 0;
  for (const est of ki.estados) {
    if (est.condicion === 'automatico') continue;
    v += (est.condicion === 'contacto' ? p.pManiobra : p.pImpacto) * valorEstado(atk, def, est, golpes);
  }
  if (ki.impacto) {
    // Lanzado lejos pierde lo que le queda del asalto; atraído, queda a su alcance.
    const pGana = pGanaControl(ki.impacto, atributo(def, 'FUE') + modControl(def));
    v += p.pImpacto * pGana * (ki.atraer ? 0.2 * amenaza(def, atk) : amenaza(def, atk));
  }
  if (ki.marca && !def.marcas.has(atk)) {
    const b = base(atk, def);
    v += p.pImpacto * Math.max(1, golpes) * (danoEsperado(atk, def, b.hab + ki.marca, b.def) - b.golpe);
  }
  if (ki.interrumpe && def.ki) {
    let concentrado = 0;
    for (const c of CARACTERISTICAS_KI) concentrado += def.ki.acumulado[c] ?? 0;
    for (const t of def.ki.enEspera.keys()) concentrado += costeKi(t);
    for (const t of def.ki.mantenidas.keys()) concentrado += costeKi(t);
    const danoMedio = p.pImpacto > 0 ? p.dano / p.pImpacto : 0;
    v += p.pImpacto * fracasoRf(def, danoMedio + ki.interrupcion).p * concentrado * precioKi(def);
  }
  return m === 'desarmar' ? 0 : v;
}

/**
 * Lo que cuestan sus desventajas al ejecutarla (Dominus p.71-74): Exceso de energía otra vez su Ki,
 * Agotamiento unos 5 PV por punto de cansancio y el Penalizador a toda Acción lo que le hace perder
 * contra su rival principal.
 */
function costoDesventajas(l: Luchador, rival: Luchador | null, t: Tecnica): number {
  const d = efectosDe(t).desventajas;
  let c = 0;
  if (d.exceso) c += precioKi(l) * costeKi(t);
  if (d.agotamiento) c += 5 * d.agotamiento;
  if (d.penalizador && rival) c += valorNegativo(rival, l, d.penalizador, 0, 0) * Math.max(1, d.penalizador / 20);
  return c;
}

/** Lo que hace con un arma a distancia en su turno (Core p.94-96). */
export type AccionDistancia =
  | { tipo: 'disparar'; arma: number; objetivo: Luchador; disparos: number; pen: number; recargaFalta: number }
  | { tipo: 'recargar'; arma: number }
  | { tipo: 'apuntar'; arma: number; objetivo: Luchador };

/** Un arma a distancia que todavía puede usar: ni encasquillada ni rota, y con proyectiles. */
function armaUsable(l: Luchador, i: number): boolean {
  const a = l.ficha.armasDistancia![i];
  const st = l.proyectiles[i];
  return !st.inutil && (a.leo ? l.balas > 0 : st.municion > 0);
}

/**
 * Formas de usar el arma este asalto: con recarga, bajándola de a una por cada 100 de habilidad
 * (−30 cada vez); arrojadiza, lanzando de una a tantas como permita la cadencia (−10 por cada una
 * de más), sin pasar de las que tiene (Core p.96).
 */
function formasDeDisparar(l: Luchador, i: number): { disparos: number; pen: number; recargaFalta: number }[] {
  const a = completarArma(l.ficha.armasDistancia![i]);
  if (a.clase === 'disparo' && a.recamara) {
    // Con recámara dispara como con índice 1 hasta vaciarla; vacía, la recarga entera (Core p.81).
    const res = [];
    const quedan = Math.min(l.proyectiles[i].enRecamara, l.proyectiles[i].municion);
    for (let k = 0; k <= reduccionesPosibles(a.ataque) && k < quedan; k++)
      res.push({ disparos: k + 1, pen: 30 * k, recargaFalta: k + 1 >= quedan ? a.recarga : 0 });
    return res;
  }
  if (a.clase === 'disparo') {
    const res = [];
    for (let k = 0; k <= reduccionesPosibles(a.ataque); k++) res.push(disparosConRecarga(a.recarga, k));
    const quedan = a.leo ? l.balas : l.proyectiles[i].municion;
    return res.filter((x) => x.disparos <= quedan || x.disparos === 1);
  }
  const res = [];
  const tope = Math.min(lanzamientosPosibles(a.ataque, a.cadencia), l.proyectiles[i].municion);
  for (let n = 1; n <= tope; n++) res.push({ disparos: n, pen: 10 * (n - 1), recargaFalta: 0 });
  return res;
}

/** Si puede dispararle a `e` con esa arma (lo alcanza y lo ve), la Tabla 47 de ese disparo. */
function tabla47(ctx: Contexto, l: Luchador, e: Luchador, i: number): { bono: number; lejos: boolean } | null {
  const a = l.ficha.armasDistancia![i];
  if (distancia(l, e) > alcanceMaximo(a) + 1e-6) return null;
  const vision = enAlcance(l, e) ? 'libre' : visionEntre(ctx.luchadores, l, e);
  if (vision === 'bloqueada') return null;
  return modProyectil(l, e, a, vision);
}

/** El valor de un disparo de `l` a `e` con esa arma y ese penalizador (null si no puede). */
function valorDisparo(ctx: Contexto, l: Luchador, e: Luchador, i: number, pen: number, t = tabla47(ctx, l, e, i)): number | null {
  if (!t) return null;
  const ranura: Ranura = { pen, sinArmas: false, proyectil: l.ficha.armasDistancia![i], lejos: t.lejos };
  return mejorManiobra(ctx, l, e, false, t.bono, modDeAccion(l, 'ataque', false), false, true, ranura).valor;
}

/**
 * Lo que agrega su mejor técnica de Ki a un golpe contra `e`, descontado el Ki (0 sin técnicas): con
 * un arma a distancia no se ejecutan, así que dejar de pegar también es dejar de usarlas.
 */
function gananciaTecnica(ctx: Contexto, l: Luchador, e: Luchador): number {
  if (!l.ki) return 0;
  const tecnicas = tecnicasPara(l, 'ataque');
  if (!tecnicas.length) return 0;
  const sin = mejorManiobra(ctx, l, e, false, 0, modDeAccion(l, 'ataque', false), false).valor;
  let mejor = 0;
  for (const t of tecnicas) mejor = Math.max(mejor, mejorManiobra(ctx, l, e, false, 0, vistaPrevia(l, t), false).valor - precioKi(l) * costeKi(t) - sin);
  return mejor;
}

/**
 * Su turno con un arma a distancia, o null para pelear (o acercarse) como siempre: dispara si eso
 * rinde por asalto más que su mejor ataque cuerpo a cuerpo (con la recarga repartida entre los
 * asaltos que lleva); recarga si no le conviene otra cosa; y si nadie está todavía al alcance pero
 * alguien llegará, le apunta (+10 por asalto, hasta +30).
 */
export function accionADistancia(ctx: Contexto, l: Luchador): AccionDistancia | null {
  const armas = l.ficha.armasDistancia;
  if (!armas?.length || perfil(l) === 'bestia' || l.apresadoPor || l.apresando) return null;
  nuevaDecision(ctx);
  // Lo que rinde pelear cuerpo a cuerpo este asalto: se calcula sólo si hay algo con qué compararlo.
  let cuerpoMemo: number | undefined;
  const cuerpo = () => {
    if (cuerpoMemo === undefined) {
      cuerpoMemo = 0;
      for (const e of enemigos(ctx, l)) if (alcanzable(l, e)) cuerpoMemo = Math.max(cuerpoMemo, valorAtaque(l, e, {}) + gananciaTecnica(ctx, l, e));
      cuerpoMemo *= Math.max(1, l.ataquesDeclarados);
    }
    return cuerpoMemo;
  };
  let mejor: { accion: AccionDistancia; valor: number } | null = null;
  let recargar: number | null = null;
  let cargada: number | null = null;
  for (let i = 0; i < armas.length; i++) {
    if (!armaUsable(l, i)) continue;
    if (l.proyectiles[i].recargaFalta > 0) {
      recargar ??= i;
      continue;
    }
    cargada ??= i;
    const formas = formasDeDisparar(l, i);
    for (const e of enemigos(ctx, l)) {
      const t = tabla47(ctx, l, e, i);
      if (!t) continue;
      for (const forma of formas) {
        const v = valorDisparo(ctx, l, e, i, forma.pen, t)!;
        const valor = (forma.disparos * v) / (1 + forma.recargaFalta);
        if (!mejor || valor > mejor.valor) mejor = { accion: { tipo: 'disparar', arma: i, objetivo: e, ...forma }, valor };
      }
    }
  }
  if (mejor && mejor.valor > 0 && mejor.valor >= cuerpo()) return mejor.accion;
  if (trabadoConAlguien(l)) return null;
  // Recargar vale el disparo que podrá hacer, repartido entre los asaltos que le faltan (contra los
  // enemigos tal como están ahora).
  if (recargar !== null) {
    let disparo = 0;
    for (const e of enemigos(ctx, l)) disparo = Math.max(disparo, valorDisparo(ctx, l, e, recargar, 0) ?? 0);
    if (disparo / l.proyectiles[recargar].recargaFalta >= cuerpo()) return { tipo: 'recargar', arma: recargar };
  }
  if (cuerpo() > 0) return null;
  // Nadie al alcance: apunta al que llegará antes, si lo ve.
  if (cargada !== null && !mejor) {
    const a = armas[cargada];
    let blanco: Luchador | null = null;
    for (const e of enemigos(ctx, l)) {
      const d = distancia(l, e);
      if (d > alcanceMaximo(a) + metrosTotales(e) || visionEntre(ctx.luchadores, l, e) === 'bloqueada') continue;
      if (!blanco || d < distancia(l, blanco)) blanco = e;
    }
    if (blanco) return { tipo: 'apuntar', arma: cargada, objetivo: blanco };
  }
  return null;
}

/** Puede disparar ya con esa arma: usable y sin recarga pendiente. */
export function armaListaParaDisparar(l: Luchador, i: number): boolean {
  return armaUsable(l, i);
}

/** Si cae el blanco a mitad de los disparos: el enemigo al que más rinde seguir disparando. */
export function siguienteBlanco(ctx: Contexto, l: Luchador, i: number, pen: number): Luchador | null {
  nuevaDecision(ctx);
  let mejor: Luchador | null = null;
  let mejorValor = 0;
  for (const e of enemigos(ctx, l)) {
    const v = valorDisparo(ctx, l, e, i, pen);
    if (v !== null && v > mejorValor) {
      mejor = e;
      mejorValor = v;
    }
  }
  return mejor;
}

/**
 * Atrapar un proyectil con Trucos de manos (Core p.94) si lo que espera recibir intentándolo (si falla,
 * se defiende con −50) es menos que defendiéndose como siempre. Contra un arma de fuego hace falta
 * maestría.
 */
export function intentaAtrapar(ctx: Contexto, def: Luchador, atk: Luchador, habAtk: number, g: { ranura: Ranura; ki?: ModKi }): boolean {
  if (perfil(def) === 'bestia') return false;
  const trucos = def.ficha.trucosDeManos ?? 0;
  const arma = g.ranura.proyectil;
  if (arma?.fuego && trucos < 200) return false;
  nuevaDecision(ctx);
  const dif = dificultadAtrapar(arma) ?? habAtk + 50;
  const base = trucos - penAccion(def) - PEN_ATRAPAR_ADICIONAL * def.atrapadas;
  const p = Math.max(0, Math.min(1, (101 - (dif - base)) / 100));
  if (p <= 0) return false;
  const proyectil = arma?.clase ?? 'disparo';
  const hab = defensaFinal(def, atk, { proyectil, kiAtk: g.ki });
  const o = { ranura: g.ranura, ki: g.ki };
  return (1 - p) * danoEsperado(atk, def, habAtk, hab - PEN_ESQUIVA_TRAS_ATRAPAR, o) < danoEsperado(atk, def, habAtk, hab, o);
}

/**
 * Celda a la que retroceder antes de disparar (hasta un cuarto de su movimiento: sin penalizador,
 * Tabla 47), o null: sólo si algún enemigo lo alcanzaría el asalto que viene, y
 * desde la celda nueva ninguno lo alcanza y sigue viendo y alcanzando a su blanco. La más cercana.
 */
export function retroceso(ctx: Contexto, l: Luchador, blanco: Luchador, i: number): { celda: Celda; metros: number } | null {
  const m = l.mapa;
  if (!m || perfil(l) === 'bestia' || trabadoConAlguien(l) || l.apresadoPor) return null;
  const amenazas = enemigos(ctx, l).filter((e) => puedeAvanzar(e) && faltaParaLlegar(e, l) <= metrosTotales(e));
  if (!amenazas.length) return null;
  const tope = metrosTotales(l) / 4 - l.metrosMovidos;
  if (tope < 1) return null;
  // Alejarse `tope` metros alarga el camino de cada uno a lo sumo eso: si igual lo alcanzaría, no hay caso.
  if (amenazas.some((e) => faltaParaLlegar(e, l) + tope <= metrosTotales(e))) return null;
  const ocupadas = m.ocupadas.fill(0);
  for (const x of ctx.luchadores) if (x !== l && activo(x)) ocupadas[indice(m, x.pos)] = 1;
  buscarCamino(m, l.pos, ocupadas, tope + 1e-6, () => false);
  const costos = Float32Array.from(m.costos);
  const arma = l.ficha.armasDistancia![i];
  let mejor: { celda: Celda; metros: number } | null = null;
  for (let j = 0; j < costos.length; j++) {
    const c = costos[j];
    if (c === Infinity || c === 0 || (mejor && c >= mejor.metros)) continue;
    const celda = celdaDe(m, j);
    if (amenazas.some((e) => campoHacia(m, celda)[indice(m, e.pos)] <= metrosTotales(e))) continue;
    if (Math.hypot(celda.x - blanco.pos.x, celda.y - blanco.pos.y) > alcanceMaximo(arma)) continue;
    if (lineaDeVision(m, celda, blanco.pos) === 'bloqueada') continue;
    mejor = { celda, metros: c };
  }
  return mejor;
}

/** Puede moverse este asalto (no está apresado ni paralizado del todo). */
function puedeAvanzar(e: Luchador): boolean {
  return !e.apresadoPor && e.paralisis < 3 && e.paralisisInducida < 3 && metrosTotales(e) > 0;
}

/** Contraataque con una técnica de Ki a distancia (o una activa) que alcance y vea a quien lo atacó. */
export function contraKiADistancia(ctx: Contexto, l: Luchador, atk: Luchador): { tecnica: Tecnica | null } | null {
  if (!l.ki || perfil(l) === 'bestia') return null;
  const d = distancia(l, atk);
  const activo0 = modDeAccion(l, 'ataque', false);
  const opciones: [Tecnica | null, ModKi][] = [];
  if (activo0 && activo0.distancia >= d) opciones.push([null, activo0]);
  for (const t of tecnicasPara(l, 'ataque', true)) {
    const k = vistaPrevia(l, t);
    if (k.distancia >= d) opciones.push([t, k]);
  }
  if (!opciones.length) return null;
  const vision = visionEntre(ctx.luchadores, l, atk);
  if (vision === 'bloqueada') return null;
  nuevaDecision(ctx);
  const bono = vision === 'cobertura' ? -PEN_COBERTURA : 0;
  let mejor: { tecnica: Tecnica | null; valor: number } | null = null;
  for (const [t, k] of opciones) {
    const v = mejorManiobra(ctx, l, atk, true, bono, k, false, true).valor - (t ? precioKi(l) * costeKi(t) + costoDesventajas(l, atk, t) : 0);
    if (v > 0 && (!mejor || v > mejor.valor)) mejor = { tecnica: t, valor: v };
  }
  return mejor ? { tecnica: mejor.tecnica } : null;
}

/** Contraataque a quien lo atacó desde lejos: con un arma a distancia cargada que lo alcance y lo vea. */
export function contraADistancia(ctx: Contexto, l: Luchador, atk: Luchador): number | null {
  const armas = l.ficha.armasDistancia;
  if (!armas?.length || perfil(l) === 'bestia') return null;
  nuevaDecision(ctx);
  let mejor: number | null = null;
  let mejorValor = 0;
  for (let i = 0; i < armas.length; i++) {
    if (!armaUsable(l, i) || l.proyectiles[i].recargaFalta > 0) continue;
    const v = valorDisparo(ctx, l, atk, i, 0);
    if (v !== null && v > mejorValor) {
      mejor = i;
      mejorValor = v;
    }
  }
  return mejor;
}

/**
 * Ataque a distancia con Ki (Dominus p.57): al enemigo fuera del cuerpo a cuerpo que más rinda con
 * una técnica que lo alcance (o con una a distancia ya activa), si rinde más que acercarse a pegarle.
 * Sin la dificultad de la Tabla 48 en la cuenta: a estas habilidades casi nunca falla.
 */
export function ataqueADistancia(ctx: Contexto, l: Luchador): { objetivo: Luchador; tecnica: Tecnica | null } | null {
  if (!l.ki || perfil(l) === 'bestia' || l.apresadoPor || l.apresando) return null;
  const activo0 = modDeAccion(l, 'ataque', false);
  const opciones: [Tecnica | null, ModKi][] = [];
  if (activo0?.distancia) opciones.push([null, activo0]);
  for (const t of tecnicasPara(l, 'ataque')) {
    const k = vistaPrevia(l, t);
    if (k.distancia) opciones.push([t, k]);
  }
  if (!opciones.length) return null;
  nuevaDecision(ctx);
  let mejor: { objetivo: Luchador; tecnica: Tecnica | null; valor: number } | null = null;
  for (const e of enemigos(ctx, l)) {
    if (enAlcance(l, e)) continue;
    const d = distancia(l, e);
    // Hace falta verlo; la cobertura resta 40.
    const vision = visionEntre(ctx.luchadores, l, e);
    if (vision === 'bloqueada') continue;
    const bono = vision === 'cobertura' ? -PEN_COBERTURA : 0;
    const cuerpo = alcanzable(l, e) ? valorAtaque(l, e, {}) : 0;
    for (const [t, k] of opciones) {
      if (k.distancia + 1e-6 < d) continue;
      const v = mejorManiobra(ctx, l, e, false, bono, k, false, true).valor - (t ? precioKi(l) * costeKi(t) + costoDesventajas(l, e, t) : 0);
      if (v > cuerpo && (!mejor || v > mejor.valor)) mejor = { objetivo: e, tecnica: t, valor: v };
    }
  }
  return mejor && mejor.valor > 0 ? { objetivo: mejor.objetivo, tecnica: mejor.tecnica } : null;
}

/**
 * Técnica de Estados de condición automática (Dominus p.67-68) a usar en lugar de un ataque: sobre el
 * enemigo que más rinda a su distancia o, si alcanza a varios, sobre todos los que estén a esa
 * distancia (aliados incluidos, que cuentan en contra). Conviene si supera su mejor ataque.
 */
export function estadosAutomaticos(ctx: Contexto, l: Luchador): { tecnica: Tecnica; blancos: Luchador[] } | null {
  if (!l.ki || perfil(l) === 'bestia') return null;
  const candidatas = tecnicasPara(l, 'ataque', false, true);
  if (!candidatas.length) return null;
  nuevaDecision(ctx);
  let mejor: { tecnica: Tecnica; blancos: Luchador[]; valor: number } | null = null;
  for (const t of candidatas) {
    const autos = vistaPrevia(l, t).estados.filter((x) => x.condicion === 'automatico');
    const alcance = Math.max(ALCANCE, ...autos.map((x) => x.distancia));
    const valorDe = (b: Luchador) => autos.reduce((s, est) => s + valorEstado(l, b, est, 1), 0);
    const enRango = ctx.luchadores.filter((x) => x !== l && activo(x) && distancia(l, x) <= alcance + 1e-6);
    let blancos: Luchador[] = [];
    let valor = 0;
    if (autos.some((x) => x.varios)) {
      blancos = enRango;
      for (const b of enRango) valor += b.equipo === l.equipo ? -lambda(l) * valorDe(b) : valorDe(b);
    } else
      for (const b of enRango) {
        if (b.equipo === l.equipo) continue;
        const vb = valorDe(b);
        if (vb > valor) {
          valor = vb;
          blancos = [b];
        }
      }
    if (!blancos.length) continue;
    const neto = valor - precioKi(l) * costeKi(t) - costoDesventajas(l, blancos[0], t);
    if (!mejor || neto > mejor.valor) mejor = { tecnica: t, blancos, valor: neto };
  }
  if (!mejor || mejor.valor <= 0) return null;
  let ataque = 0;
  for (const e of enemigos(ctx, l)) if (alcanzable(l, e)) ataque = Math.max(ataque, valorAtaque(l, e, {}));
  return mejor.valor > ataque ? { tecnica: mejor.tecnica, blancos: mejor.blancos } : null;
}

/**
 * Técnica de defensa a ejecutar contra este golpe, o null. Se compara lo que le cuesta el golpe
 * (daño, baja, crítico, menos la contra que pueda devolver) con y sin ella. Sus efectos de Asalto
 * (Armadura, parada completa) protegen también de los demás golpes del asalto.
 */
export function elegirTecnicaDefensa(
  ctx: Contexto, def: Luchador, atk: Luchador, habAtk: number,
  g: { maniobra: Maniobra; tipo?: TipoAtaque; ki?: ModKi; esContra: boolean; costeTecnica?: number; aDistancia?: boolean },
): Tecnica | null {
  if (!def.ki || perfil(def) === 'bestia') return null;
  const candidatas = tecnicasPara(def, 'defensa');
  if (!candidatas.length) return null;
  nuevaDecision(ctx);
  const costo = (mod: ModKi | undefined) => {
    // Defensa Predeterminada: equivale a una habilidad unos 50 por debajo (lo que suma el d100 medio).
    const hab = mod?.defensaFija ? mod.defensaFija - 50 : defensaFinal(def, atk, { ki: mod, kiAtk: g.ki, proyectil: g.aDistancia });
    const p = pronostico(atk, def, habAtk, hab, { maniobra: g.maniobra, tipo: g.tipo, ki: g.ki, kiDef: mod, esContra: g.esContra });
    const contra = !mod?.sinContra && !g.ki?.indirecto && def.ataquesRestantes > 0 && puedeActuar(def) ? p.pContra * golpeDe(def, atk) : 0;
    let extra = 0;
    // Reflectar: si lo detiene, el golpe vuelve contra el atacante con su habilidad (Dominus p.71).
    if (mod?.reflectar) {
      const vuelta = pronostico(def, atk, habAtk + 50, defensaFinal(atk, def), { ki: { ...SIN_KI, danoFijo: danoBase(atk, def, g.esContra, undefined, g.ki) } });
      extra += (1 - p.pImpacto) * valorGolpe(def, atk, vuelta, 0);
    }
    // Absorción de Ki: con una defensa que deja contraatacar se queda con Ki de la técnica.
    if (mod?.absorcionKi && g.costeTecnica) extra += p.pContra * Math.min(mod.absorcionKi, g.costeTecnica) * precioKi(def);
    // Acumulación: la pantalla se come el daño antes que sus PV.
    if (mod?.pantalla) extra += Math.min(mod.pantalla, p.dano);
    return valorGolpe(atk, def, p, 0) - contra - extra;
  };
  const sinTecnica = costo(modDeAccion(def, 'defensa', false));
  // Ataques que probablemente reciba después en el asalto (para los efectos de Asalto).
  let otros = 0;
  for (const e of enemigos(ctx, def)) if (e !== atk && !e.haActuado && puedeActuar(e) && alcanzable(e, def)) otros += 0.5;
  let mejor: Tecnica | null = null;
  let mejorNeto = 0;
  for (const t of candidatas) {
    const ef = efectosDe(t);
    const ganancia = sinTecnica - costo(vistaPrevia(def, t));
    const deAsalto = ef.asalto.ta || ef.asalto.parada || ef.asalto.esquiva || ef.asalto.escudo || ef.asalto.pantalla ? otros : 0;
    const neto = ganancia * (1 + deAsalto) - precioKi(def) * costeKi(t) - costoDesventajas(def, atk, t);
    if (neto > mejorNeto) {
      mejor = t;
      mejorNeto = neto;
    }
  }
  if (mejor && convieneGuardar(ctx, def, atk, mejor, mejorNeto)) return null;
  return mejor;
}

/**
 * Técnica que sube el turno, a ejecutar antes de la iniciativa (Core p.105), o null. Vale lo que
 * gana actuando antes que cada rival (lo deja sin asalto si lo impacta) y la chance de sorprenderlo.
 */
export function tecnicaDeTurno(ctx: Contexto, l: Luchador): Tecnica | null {
  if (!l.ki || perfil(l) === 'bestia') return null;
  nuevaDecision(ctx);
  let mejor: Tecnica | null = null;
  let mejorNeto = 0;
  for (const t of repertorio(l.ficha)) {
    const ef = efectosDe(t);
    const bono = ef.asalto.turno;
    if ((!bono && !ef.asalto.intangible) || ef.clase !== 'variable' || enUso(l.ki, t) || !puedeEjecutar(l, t)) continue;
    // Intangibilidad (Dominus p.69): le ahorra lo que le pegarían este asalto quienes no dañan energía.
    let intangible = 0;
    if (ef.asalto.intangible)
      for (const e of enemigos(ctx, l)) if (!e.cap.danaEnergia && e.ficha.tipoAtaque !== 'ENE' && alcanzable(e, l)) intangible += lambda(l) * amenaza(e, l);
    const neto = (bono ? valorTurno(ctx, l, bono) : 0) + intangible - precioKi(l) * costeKi(t) - costoDesventajas(l, rivalPrincipal(ctx, l), t);
    if (neto > mejorNeto) {
      mejor = t;
      mejorNeto = neto;
    }
  }
  return mejor;
}

/**
 * Lo que vale subir el turno en `bono` este asalto: actuar antes que cada rival (lo deja sin asalto si
 * lo impacta) y la chance de sorprenderlo. Se mide sobre el turno sin las técnicas que ya lo suben.
 */
function valorTurno(ctx: Contexto, l: Luchador, bono: number): number {
  const propio = turnoFinal(l) - (l.ki?.activo.turno ?? 0);
  let valor = 0;
  for (const e of enemigos(ctx, l)) {
    if (!alcanzable(l, e) && !alcanzable(e, l)) continue;
    const tb = tabla(umbralPifiaTurno(l), umbralPifiaTurno(e), false);
    const dif = propio - turnoFinal(e);
    const sorpresa = (s: number) => tb.pImpacto(s - l.cap.est.diferenciaSorpresa + 1);
    const b = base(l, e);
    const conSorpresa = danoEsperado(l, e, b.hab, b.def - 90) - b.golpe;
    valor += (tb.pImpacto(dif + bono) - tb.pImpacto(dif)) * amenaza(e, l) * 0.5 +
      (sorpresa(dif + bono) - sorpresa(dif)) * conSorpresa;
  }
  return valor;
}

/** El mejor rival para valorar una técnica de ataque: al que más le pega hoy. */
function rivalPrincipal(ctx: Contexto, l: Luchador): Luchador | null {
  let mejor: Luchador | null = null;
  for (const e of enemigos(ctx, l)) if (!mejor || golpeDe(l, e) > golpeDe(l, mejor)) mejor = e;
  return mejor;
}

/** Lo que gana un ataque contra `rival` con estos efectos de Ki, frente a uno sin técnica. */
function gananciaAtaque(ctx: Contexto, l: Luchador, rival: Luchador, ki: ModKi): number {
  return mejorManiobra(ctx, l, rival, false, 0, ki, false).valor -
    mejorManiobra(ctx, l, rival, false, 0, modDeAccion(l, 'ataque', false), false).valor;
}

/**
 * Lo que rinde un asalto más de una técnica mantenida: el turno, un ataque con sus efectos, o lo que
 * le ahorra a su defensa contra quienes pueden atacarlo.
 */
function valorMantener(ctx: Contexto, l: Luchador, t: Tecnica): number {
  const ef = efectosDe(t);
  let v = ef.asalto.turno ? valorTurno(ctx, l, ef.asalto.turno) : 0;
  const rival = rivalPrincipal(ctx, l);
  if (rival && ef.clase === 'ataque') v += gananciaAtaque(ctx, l, rival, combinar(ef.asalto, ef.accion));
  if (ef.clase === 'defensa') {
    const sube = combinar(ef.asalto, ef.accion);
    for (const e of enemigos(ctx, l)) {
      if (!alcanzable(e, l)) continue;
      const hab = ataqueFinal(e, l);
      const ataques = Math.max(1, e.ataquesDeclarados || 1);
      v += ataques * (danoEsperado(e, l, hab, defensaFinal(l, e, { ki: SIN_KI })) -
        danoEsperado(e, l, hab, defensaFinal(l, e, { ki: sube }), { kiDef: sube }));
    }
  }
  return v;
}

/** Asaltos para juntar el coste de una técnica empezando de cero (el primero entero, después la mitad). */
function asaltosDesdeCero(l: Luchador, t: Tecnica): number {
  let n = 1;
  for (const c of CARACTERISTICAS_KI) {
    const k = t.coste[c] ?? 0;
    if (!k) continue;
    const acu = l.ficha.ki?.acumulacion[c] ?? 0;
    if (!acu) return Infinity;
    if (k > acu) n = Math.max(n, 1 + Math.ceil((k - acu) / Math.ceil(acu / 2)));
  }
  return n;
}

/**
 * Decisiones de Ki al empezar el asalto:
 * - Deja de mantener una técnica si un asalto más rinde menos que su mantenimiento (soltarla es
 *   gratis, Dominus p.48).
 * - Deja ir una técnica que lleva más de 3 asaltos en espera sin usarse.
 * - Si empieza a acumular de cero, declara la técnica de ataque que más rinde por asalto de
 *   acumulación entre las que tardan más de un asalto en juntarse, para poder dejarla en espera
 *   cuando la junte (Core p.105).
 */
export function decisionKi(ctx: Contexto, l: Luchador, acumula: boolean): DecisionKi {
  const e = l.ki;
  if (!e || perfil(l) === 'bestia') return { acumula, soltar: [], liberar: [], objetivo: null };
  nuevaDecision(ctx);
  const h = habilidadesKi(l.ficha);
  const armadura = h.armaduraMayor && hayAtaquesDeEnergia(ctx, l);
  const recuperar = convieneRecuperar(l);
  // Aura de combate: activarla es gratis salvo 1 de Ki cada 5 asaltos; vale si algún rival es sensible
  // y no alcanza a ningún aliado sensible (afecta a todos los del radio, Dominus p.21).
  const aura = h.aura && enemigos(ctx, l).some((x) => sensibleAlAura(l, x)) &&
    !ctx.luchadores.some((x) => x !== l && x.equipo === l.equipo && activo(x) && sensibleAlAura(l, x) && distancia(l, x) <= radioAura(l) + 5);
  const aumentar = h.aumento && !e.aumento ? elegirAumento(ctx, l) : undefined;
  const soltar = [...e.mantenidas.keys()].filter((t) => valorMantener(ctx, l, t) < precioKi(l) * t.mantenimiento);
  const liberar = [...e.enEspera].filter(([, desde]) => ctx.asalto - desde > 3).map(([t]) => t);
  let objetivo: Tecnica | null = null;
  const rival = rivalPrincipal(ctx, l);
  if (acumula && rival && !CARACTERISTICAS_KI.some((c) => e.acumulado[c])) {
    let mejorRitmo = 0;
    // Sólo vale declarar las que tardan más de un asalto en juntarse: las demás se usan en el asalto.
    const candidatas = repertorio(l.ficha).filter(
      (t) => efectosDe(t).clase === 'ataque' && !e.enEspera.has(t) && costeKi(t) <= e.reserva && asaltosDesdeCero(l, t) >= 2,
    );
    const sinTecnica = candidatas.length ? mejorManiobra(ctx, l, rival, false, 0, modDeAccion(l, 'ataque', false), false).valor : 0;
    for (const t of candidatas) {
      const ganancia = mejorManiobra(ctx, l, rival, false, 0, vistaPrevia(l, t), false).valor - sinTecnica;
      const ritmo = (ganancia - precioKi(l) * costeKi(t)) / asaltosDesdeCero(l, t);
      if (ritmo > mejorRitmo) {
        mejorRitmo = ritmo;
        objetivo = t;
      }
    }
  }
  return { acumula, soltar, liberar, objetivo, armadura, recuperar, aura, aumentar };
}

/**
 * Técnica a dejar en espera al final del asalto: la declarada al empezar a acumular, si le alcanza y
 * no la usó. En espera su Ki queda apartado: no se pierde al terminar el asalto, puede seguir
 * acumulando y ejecutar otras sin perderla (Core p.105).
 */
export function tecnicaParaEspera(ctx: Contexto, l: Luchador): Tecnica | null {
  const t = l.ki?.objetivo;
  if (!t || !puedePonerEnEspera(l, t)) return null;
  return t;
}

// --------------------------------------------------------------------------- magia (Core cap. 11)

/**
 * Precio de un punto de zeon en PV, como el del Ki: gastar toda la reserva tiene que rendir la mitad
 * de sus PV, y se encarece al vaciarse.
 */
function precioZeon(l: Luchador): number {
  const inicial = Math.max(1, l.ficha.magia?.zeon ?? 1);
  const queda = Math.max(1, (l.magia?.reserva ?? 0) - (l.magia?.acumulado ?? 0));
  return ((0.5 * l.ficha.pv) / inicial) * Math.sqrt(inicial / queda);
}


/**
 * Un conjuro de ataque o anímico como un golpe sobrenatural: daña energía, en su TA y con su daño.
 * Los anímicos no tienen daño y son invisibles para quien no ve la magia (Core p.122).
 */
export function golpeDeConjuro(c: Conjuro, g: Grado): ModKi {
  const animico = c.tipos.includes('animico');
  return {
    ...SIN_KI, sobrenatural: true, danaEnergia: true, elemento: animico ? 'ENE' : c.ta ?? 'ENE', danoFijo: g.dano ?? 0, conjuro: true,
    invisible: animico && !c.tipos.includes('ataque'),
  };
}

/** Los conjuros no usan la calidad del arma: se resuelven como sin armas (y con su propio daño). */
export const RANURA_MAGIA: Ranura = { pen: 0, sinArmas: true };

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

/** PV que perdería en llamas desde ese nivel de la Tabla 76 en los próximos asaltos, sin apagarse. */
function danoDeLlamas(l: Luchador, desde: number): number {
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
  const despues = intercambio(ctx, a);
  quitarBendicion(a, l, c);
  const turno = ((g.bono!.turno ?? 0) / 100) * (antes.hace + lambda(l) * antes.recibe);
  return ASALTOS_EFECTO * (despues.hace - antes.hace + lambda(l) * (antes.recibe - despues.recibe) + turno);
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
export function defiendeConEscudoMagico(def: Luchador, atk: Luchador, g: { ki?: ModKi; aDistancia?: boolean; ranura: Ranura }): boolean {
  if (!def.magia?.escudo) return false;
  const proyectil = g.aDistancia ? g.ranura.proyectil?.clase ?? 'disparo' : undefined;
  return defensaEscudoMagico(def, atk) >= defensaFinal(def, atk, { kiAtk: g.ki, proyectil });
}
