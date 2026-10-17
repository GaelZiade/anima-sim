// IA por heurística: cada decisión puntúa sus opciones en "PV esperados" y elige la mejor.
// No tira dados ni mira hacia adelante; todas las probabilidades salen de las tablas precalculadas.

import { type Contexto, type Luchador, type Perfil, type Tecnica } from './modelo';
import { apartarCaches, cacheDeDecision, reponerCaches, vaciarCaches } from './cache-decision';
export { CacheDecision, cacheDeDecision } from './cache-decision';
import { buscarCamino, campoHacia, celdaDe, indice, lineaDeVision, type Celda } from './mapa';
import {
  activo, bonoCriticoDe, rfCritico, rfDe, alcanceMaximo, modProyectil, visionEntre, ataqueFinal, defensaFinal, distancia, enAlcance, faltaParaLlegar, metrosTotales,
  danoCon, danoEsperado, modControl, penAccion, preparacion, preparacionCon, pronosticoDesde, zonaDe, type Preparacion, pronostico, umbralPifiaTurno, puedeActuar, puedeManiobraEspecial, turnoFinal, PEN_PREVER_SORPRESA, type Pronostico,
  perfilDe, proximaRanura, golpeAPuntoVulnerable } from './calculos';
import { fallaResistencia, pLlegaArea, tabla } from './probabilidades';
import { absorcion, MOD_SORPRESA_DEFENSA, negativoCansancio, posicionPorOrden, umbralPifia, type TipoAtaque } from './reglas';
import { planDeAtaques, type Ranura } from './rasgos';
import { dificultadAtrapar, formasDeDisparar, puedeAtrapar, PEN_ATRAPAR_ADICIONAL, PEN_ESQUIVA_TRAS_ATRAPAR, superaTope, TOPE_PROYECTIL } from './proyectiles';
import { efectoCritico } from './valoracion';
import { enterezaArma, pRompe, roturaDe } from './rotura';
import { nivelCondicion } from './condiciones';
import {
  nivelMenos, dificultadDestruccion, presenciaBase, habilidadesKi, modDeAccion, SIN_KI, tecnicasPara,
  vistaPrevia, type ModKi } from './ki';
import type { Localizacion } from './reglas';
import {
  caracteristicasControl, dificultadPuntosPresion, esApuntado, esManiobraDeControl, esNoLetal, ESTADOS_MUSHIN, localizacionApuntada, modificadorPorResultado,
  penManiobra, pGanaControl, type EstadoMushin, type Maniobra } from './maniobras';
import { acumulaKi, convieneGuardar, costoTecnica, enCircunstancia, gananciaTecnica, precioKi, sinTecnica, sirveContra, valorAreaKi, valorEfectosKi, valorTurno } from './ia-ki';
// Las decisiones del Ki viven en ia-ki.ts; desde afuera se usan como `ia.xxx`, igual que las de acá.
export * from './ia-ki';

/**
 * Evalúa `f` con un cambio temporal en el estado (lo que haría un conjuro, una armadura…) y lo deshace
 * siempre, aunque `f` falle. `cambiar` aplica el cambio y devuelve cómo deshacerlo. La memoria de la
 * decisión se aparta mientras dura: `f` calcula todo con el estado cambiado, y al volver se recupera
 * lo que ya se sabía del estado real.
 */
export function conCambio<T>(cambiar: () => () => void, f: () => T): T {
  const guardada = apartarMemoria();
  const deshacer = cambiar();
  try {
    return f();
  } finally {
    deshacer();
    recuperarMemoria(guardada);
  }
}

type MemoriaGuardada = { memo: typeof memo; rodean: typeof rodean; caches: Map<unknown, unknown>[] };

/** Deja la memoria de la decisión vacía y devuelve la que había (se intercambian mapas, no se copian). */
function apartarMemoria(): MemoriaGuardada {
  const g: MemoriaGuardada = { memo, rodean, caches: apartarCaches() };
  memo = new Map();
  rodean = new Map();
  return g;
}

function recuperarMemoria(g: MemoriaGuardada) {
  memo = g.memo;
  rodean = g.rodean;
  reponerCaches(g.caches);
}

/** Peso del daño recibido frente al causado. */
const LAMBDA: Record<Perfil, number> = { agresivo: 0.5, equilibrado: 0.9, cauto: 1.4, bestia: 0.3 };

export function perfil(l: Luchador): Perfil {
  if ((l.ficha.inteligencia ?? 6) <= 4) return 'bestia';
  return l.ficha.perfil ?? 'equilibrado';
}

export function lambda(l: Luchador): number {
  return LAMBDA[perfil(l)];
}

export function enemigos(ctx: Contexto, l: Luchador): Luchador[] {
  return ctx.luchadores.filter((e) => e.equipo !== l.equipo && activo(e));
}

/** Cansancio que puede gastar por asalto: 5 con Uso de la Energía Necesaria, propio o de Marcha Implacable. */
export function maxCansancioAsalto(l: Luchador): number {
  return l.bono?.energiaNecesaria ? Math.max(5, l.cap.maxCansancioAsalto) : l.cap.maxCansancioAsalto;
}

export function trabadoConAlguien(l: Luchador): boolean {
  return l.trabados.some((e) => activo(e) && enAlcance(l, e));
}

/** ¿Puede atacar a `e` este asalto? Si está trabado no se retira. */
export function alcanzable(l: Luchador, e: Luchador): boolean {
  if (enAlcance(l, e)) return true;
  if (trabadoConAlguien(l)) return false;
  return faltaParaLlegar(l, e) <= metrosTotales(l) - l.metrosMovidos;
}

export function necesitaMovimientoActivo(l: Luchador, e: Luchador): boolean {
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
  /** Lo mismo para una contra de `e` (sin el bono que le deje el golpe), calculado al pedirlo. */
  contra?: { hab: number; prep: Preparacion };
}
let memo = new Map<Luchador, Map<Luchador, Base>>();
/** Enemigos que pueden atacar a cada luchador este asalto (para la amenaza), por decisión. */
let rodean = new Map<Luchador, Luchador[]>();
let ctxActual: Contexto | null = null;

export function nuevaDecision(ctx?: Contexto) {
  memo.clear();
  rodean.clear();
  vaciarCaches();
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

export function base(e: Luchador, l: Luchador): Base {
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

/**
 * ¿Puede aprovechar una contra? Como `ofrecerContra` (combate.ts): con acciones activas y ataques
 * que le queden, salvo Selene arcano, que contraataca sin límite (Core p.89, Dominus p.39).
 */
export function puedeContraatacar(def: Luchador): boolean {
  return puedeActuar(def) && (def.ataquesRestantes > 0 || def.cap.est.contrasIlimitadas);
}

/** Daño esperado de una contra de `def` sobre `atk` con este bono, con sus modificadores de contraataque. */
export function golpeDeContra(def: Luchador, atk: Luchador, bono: number): number {
  const b = base(def, atk);
  b.contra ??= { hab: ataqueFinal(def, atk, { esContra: true }), prep: preparacionCon(def, atk, { esContra: true }) };
  return danoCon(b.contra.prep, b.contra.hab + bono - b.def);
}

/** Lo que arriesga `atk` si su golpe (con pronóstico `p`) deja contraatacar a `def`, por su λ. */
export function riesgoContra(atk: Luchador, def: Luchador, p: Pronostico): number {
  return puedeContraatacar(def) && p.pContra > 0 ? lambda(atk) * p.pContra * golpeDeContra(def, atk, p.bonoContra) : 0;
}

/** Daño que `e` le haría a `l` en un ataque normal. */
export function golpeDe(e: Luchador, l: Luchador): number {
  return base(e, l).golpe;
}

/**
 * Daño esperado de `e` en todo el asalto contra `l` (amenaza). Si `l` está rodeado, `e` no lo
 * encuentra con la defensa entera: en promedio la mitad de los demás que llegan a él ya lo atacó,
 * y cada defensa adicional le resta (−30, −50, −70, −90). Sin esto, uno de muchos parece inofensivo.
 */
export function amenaza(e: Luchador, l: Luchador): number {
  const b = base(e, l);
  return (b.amen ??= calcularAmenaza(e, l, b));
}

/**
 * Lo que vale para `atk` dejar a `def` fuera de combate: los PV que le quedarían (después de
 * `danoPrevio`) más su amenaza de dos asaltos. Una sola cuenta para golpes, críticos, estados y conjuros.
 */
export function valorDejarFuera(atk: Luchador, def: Luchador, danoPrevio = 0): number {
  return Math.max(0, def.pv - danoPrevio) + 2 * amenaza(def, atk);
}

/**
 * Otras fuentes de daño por asalto además del golpe: cada dominio sobrenatural registra la suya (la
 * magia en ia-magia.ts; las técnicas de Ki, acá abajo) y la amenaza toma la mayor. Así un mago no parece
 * inofensivo por pegar poco con el arma, y un dominio nuevo (psíquicos) sólo agrega su fuente.
 */
export type FuenteAmenaza = (e: Luchador, l: Luchador) => number;
const FUENTES_AMENAZA: FuenteAmenaza[] = [];
export function registrarFuenteAmenaza(f: FuenteAmenaza) {
  FUENTES_AMENAZA.push(f);
}

/** Su mejor técnica de Ki de ataque que puede ejecutar ya: el daño de un golpe con ella. */
function amenazaKi(e: Luchador, l: Luchador): number {
  if (!e.ki || !e.ficha.ki?.tecnicas.length) return 0;
  let mejor = 0;
  for (const t of tecnicasPara(e, 'ataque')) {
    const ki = vistaPrevia(e, t);
    if (!sirveContra(ki, l)) continue;
    mejor = Math.max(mejor, ki.ataqueFijo
      ? danoEsperado(e, l, ki.ataqueFijo, defensaFinal(l, e, { kiAtk: ki }), { ki })
      : danoEsperado(e, l, ataqueFinal(e, l, { ki }), defensaFinal(l, e, { kiAtk: ki }), { ki }));
  }
  return mejor;
}
FUENTES_AMENAZA.push(amenazaKi);

function calcularAmenaza(e: Luchador, l: Luchador, b: Base): number {
  let sobrenatural = 0;
  for (const f of FUENTES_AMENAZA) sobrenatural = Math.max(sobrenatural, f(e, l));
  // Una técnica o un conjuro reemplazan un ataque del asalto, no se suman a todos.
  return Math.max(golpeFisico(e, l, b), sobrenatural + b.golpe * Math.max(0, (e.ataquesDeclarados || 1) - 1));
}

/** Lo que pegan sus ataques con el arma en el asalto, si a `l` le llegan varios, con lo que eso le resta. */
function golpeFisico(e: Luchador, l: Luchador, b: Base): number {
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
export function valorNegativo(atk: Luchador, def: Luchador, pen: number, golpes: number, danoPrevio: number): number {
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
  const base = danoPleno + bonoCriticoDe(atk, m, bonoKi);
  const ef = efectoCritico(base, rfCritico(def), loc, {
    inconsciencia: m === 'inconsciencia', sinMuerte: def.cap.est.sangreEterna, acumulacion: !!def.ficha.acumulacion,
  });
  // Quien reduce el dolor de los críticos (Inmunidad, Eliminación) sufre más o menos la mitad.
  const negativo = def.cap.mitadDolorCritico ? ef.negativo * 0.6 : ef.negativo;
  const fuera = valorDejarFuera(atk, def, danoPrevio);
  // Un brazo del arma inservible lo desarma; una pierna, lo tira al suelo (Core p.98).
  const miembro = (ef.pBrazoArma ? ef.pBrazoArma * valorDesarmarlo(atk, def) : 0) + (ef.pPierna ? ef.pPierna * 0.3 * amenaza(def, atk) : 0);
  return pCritica * (ef.pFuera * fuera + ef.pNegativo * valorNegativo(atk, def, negativo, golpes, danoPrevio) + miembro);
}

/** Lo que vale desarmarlo: cuánto pega menos sin su arma, dos asaltos (Core p.92). */
export function valorDesarmarlo(atk: Luchador, def: Luchador): number {
  if (def.cap.desarmado) return 0;
  const s = def.ficha.sinArmas;
  const caida = s ? Math.max(0, 1 - s.ataque / Math.max(1, def.ficha.ataque)) : 0.5;
  return 2 * caida * amenaza(def, atk);
}

/**
 * Lo que vale para `atk` un golpe con este pronóstico contra `def`, en PV: el daño, la chance de
 * dejarlo fuera por PV (le saca su amenaza de dos asaltos) y el crítico. Es la misma cuenta para
 * lo que uno pega y para lo que uno recibe, así las decisiones comparan en la misma escala.
 */
export function valorGolpe(atk: Luchador, def: Luchador, p: Pronostico, golpes: number): number {
  const danoSiImpacta = p.pImpacto > 0 ? p.dano / p.pImpacto : 0;
  return p.dano + p.pBaja * amenaza(def, atk) * 2 +
    valorCritico(atk, def, p.pCritico, Math.max(def.pv / 2, danoSiImpacta), null, 'normal', golpes, p.dano);
}

/**
 * ¿Impactarlo ahora le quita el asalto? Como el motor: a quien todavía no actuó y no tiene
 * acumulación, salvo Seraphite arcano (Dominus p.40) o si decidió resistir el golpe (Core p.93).
 */
export function pierdeElAsalto(def: Luchador): boolean {
  return !def.haActuado && puedeActuar(def) && !def.ficha.acumulacion && def.modo.seraphite !== 3 && !def.planResistir;
}

interface Oportunidad {
  objetivo: Luchador;
  valor: number;
}

/** Valor de atacar a `e` con las condiciones dadas. */
export function valorAtaque(
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
  if (o.primeraVez !== false && pierdeElAsalto(e))
    v += p.pImpacto * amen;
  return v - riesgoContra(l, e, p);
}

/** Lo que vale su mejor ataque común de este turno (0 si no alcanza a nadie): con qué se compara usar la acción en otra cosa. */
export function mejorAtaque(ctx: Contexto, l: Luchador): number {
  let v = 0;
  for (const e of enemigos(ctx, l)) if (alcanzable(l, e)) v = Math.max(v, valorAtaque(l, e, {}));
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

/** Aliados de `l` (sin contarlo a él) que pueden atacar a `e` este asalto; por par, no cambia en una decisión. */
const aliadosSobreMemo = cacheDeDecision<Luchador, Map<Luchador, number>>();

function aliadosSobre(ctx: Contexto, l: Luchador, e: Luchador): number {
  let m = aliadosSobreMemo.get(l);
  if (!m) aliadosSobreMemo.set(l, (m = new Map()));
  let n = m.get(e);
  if (n === undefined) {
    n = 0;
    for (const x of ctx.luchadores)
      if (x !== l && x.equipo === l.equipo && activo(x) && faltaParaLlegar(x, e) <= metrosTotales(x)) n++;
    m.set(e, n);
  }
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
    // Contras: cada ataque que reciba puede dar una Acción Respuesta si le quedan ataques; las de
    // Selene arcano no los gastan, así que se suman aparte (Dominus p.39).
    let contrasLibres = 0;
    for (const { e, peso, p } of contras) {
      if (p.pContra <= 0) continue;
      const golpe = danoEsperado(l, e, ataqueFinal(l, e, { declarados: n, ranura: plan[0], bono: p.bonoContra, esContra: true }), defensaFinal(e, l));
      if (l.cap.est.contrasIlimitadas) contrasLibres += peso * p.pContra * golpe;
      else usos.push(peso * p.pContra * golpe);
    }
    usos.sort((a, b) => b - a);
    const valor = usos.slice(0, plan.length).reduce((s, v) => s + v, 0) + contrasLibres;
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
/**
 * P(que la iniciativa de `a` supere la de `b` por `umbral` o más) si sus turnos difieren en `dif`: la
 * diferencia de dos d100 abiertas, como un ataque, cada una con el umbral de pifia del turno
 * (aproximado: la tabla trata la pifia de `b` como la de defensa). Con `umbral` 1, actuar antes; con
 * su diferencia de sorpresa, sorprenderlo (combate.ts, Core p.86).
 */
export function pIniciativa(a: Luchador, b: Luchador, dif: number, umbral: number): number {
  return tabla(umbralPifiaTurno(a), umbralPifiaTurno(b), false).pImpacto(dif - umbral + 1);
}

function preverSorpresa(l: Luchador, entrantes: { e: Luchador; peso: number }[]): Luchador[] {
  if (perfil(l) === 'bestia') return [];
  const elegidos: Luchador[] = [];
  for (const { e } of entrantes) {
    const pSorpresa = pIniciativa(e, l, turnoFinal(e) - turnoFinal(l), e.cap.est.diferenciaSorpresa);
    const b = base(e, l);
    const dano = (pen: number) => danoCon(b.prep, b.hab - b.def + pen);
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
  const probar = (modo: Luchador['modo'], bonoVariableEn: Luchador['bonoVariableEn']) => conCambio(() => {
    l.modo = modo;
    l.bonoVariableEn = bonoVariableEn;
    return () => {
      l.modo = original.modo;
      l.bonoVariableEn = original.bonoVariableEn;
    };
  }, () => {
    const v = valorDelAsalto(l, n, objetivos, entrantes);
    // Seraphite arcano sigue actuando aunque lo pongan a la defensiva: vale su ofensiva perdida.
    return modo.seraphite === 3 ? v + 0.3 * Math.max(0, valorDelAsalto(l, n, objetivos, [])) : v;
  });
  // Ataque Final: una vez, por debajo de la mitad de los PV (Dominus p.86). Se usa en cuanto se puede.
  const activarAtaqueFinal = e.ataqueFinal && !l.ataqueFinalUsado && l.pv < l.ficha.pv / 2;
  const base = { seraphite: 0 as 0 | 1 | 3, berserker: false, ataqueFinal: l.modo.ataqueFinal || activarAtaqueFinal };
  let mejor = { modo: base, bonoVariableEn: null as Luchador['bonoVariableEn'], valor: -Infinity };
  const seraphites: (0 | 1 | 3)[] = e.seraphite === 3 ? [0, 1, 3] : e.seraphite === 1 ? [0, 1] : [0];
  // Kung Fu: el bono va al ataque, la defensa, el daño o el turno (Dominus p.32). El turno no cambia lo
  // que pega ni lo que recibe en el asalto: vale por actuar antes y sorprender (`valorTurno`).
  const bonos: Luchador['bonoVariableEn'][] = e.bonoVariable ? ['ataque', 'defensa', 'dano', 'turno'] : [null];
  const conTurno = e.bonoVariable
    ? conCambio(() => {
      const previo = l.bonoVariableEn;
      l.bonoVariableEn = null;
      return () => { l.bonoVariableEn = previo; };
    }, () => valorTurno(ctx, l, e.bonoVariable))
    : 0;
  // Con una sola combinación posible no hace falta valorarla.
  if (seraphites.length === 1 && !e.berserker && !e.bonoVariable) mejor = { modo: { ...base, seraphite: 0, berserker: false }, bonoVariableEn: null, valor: 0 };
  else for (const seraphite of seraphites)
    for (const berserker of e.berserker ? [false, true] : [false])
      for (const bonoVariableEn of bonos) {
        const modo = { ...base, seraphite, berserker };
        const valor = probar(modo, bonoVariableEn) + (bonoVariableEn === 'turno' ? conTurno : 0);
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
  return ahora >= 0.9 * mejorAtaque(ctx, l);
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

/** `f` recordada por nivel de cansancio: se pide varias veces el mismo k en una decisión. */
function porNivel<T>(f: (k: number) => T): (k: number) => T {
  const vistos: T[] = [];
  return (k) => (k in vistos ? vistos[k] : (vistos[k] = f(k)));
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
  const disponibles = Math.min(maxCansancioAsalto(l) - l.cansancioAsalto, l.cansancio);
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
  const valor = porNivel((k) => {
    const o = { bono, cansancio: k, maniobra: plan.maniobra, tipo: plan.tipo, especial: plan.especial };
    const p = pronostico(atk, def, ataqueFinal(atk, def, o), defensa, { maniobra: plan.maniobra, tipo: plan.tipo });
    return p.dano + p.pBaja * def.pv;
  });
  // La referencia es su propia vida: lo que vale el cansancio depende de él, no del blanco.
  return decidirCansancio(atk, valor, Math.max(1, atk.pv));
}

export function cansancioDefensa(ctx: Contexto, def: Luchador, atk: Luchador, habAtaque: number, resistiendo: boolean): number {
  nuevaDecision(ctx);
  if (def.ficha.acumulacion) return 0;
  const pron = porNivel((k) =>
    pronostico(atk, def, habAtaque, defensaFinal(def, atk, { cansancio: k, resistir: resistiendo })));
  const gastar = decidirCansancio(def, (k) => -(pron(k).dano + pron(k).pBaja * def.pv), Math.max(1, def.pv));
  if (gastar > 0) return gastar;
  // Desesperado: agotarse sólo si baja mucho la chance de quedar fuera de combate ahora, y con lo
  // mínimo que lo logra (con Uso de la energía necesaria podría quemar 5 de golpe).
  const disponibles = Math.min(maxCansancioAsalto(def) - def.cansancioAsalto, def.cansancio);
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
function valorEstadoMushin(estado: EstadoMushin, def: Luchador, amen: number, fallo: number, negativo: (pen: number) => number): number {
  switch (estado) {
    // −1 a las cuatro características físicas cada 10 de fracaso (Core p.233): cerca de −5 a lo que
    // hace con cada una (aproximación: el bono de característica cambia de a 5 en la zona 5-10).
    case 'debilidad': return negativo(5 * Math.floor(fallo / 10));
    case 'dolor': return 0.4 * 2 * amen;
    case 'dolorExtremo': return 0.8 * 2 * amen;
    case 'paralisisMenor': return 0.3 * 2 * amen;
    case 'paralisisParcial': return 0.8 * 2 * amen;
    case 'paralisisCompleta':
    case 'coma':
    case 'muerte': return def.pv + 2 * amen;
  }
}

/** Chance de que `def` advierta el ataque camuflado de `atk` (Dominus p.52), como `camuflar` en el motor. */
function pAdvierteCamuflaje(atk: Luchador, def: Luchador, dificultad: number): number {
  const conocido = atk.camuflajeConocido.get(def);
  if (conocido === 'superado') return 1;
  const dif = conocido === 'visto' ? nivelMenos(dificultad) : dificultad;
  const advertir = (def.ficha.advertir ?? 0) + (def.bono?.advertir ?? 0) - penAccion(def);
  return tabla(umbralPifia(def.ficha.advertir ?? 0, def.cap.ajustePifia), 0, true).pImpacto(advertir - dif + 1);
}

/** Enemigos al alcance que un ataque en área alcanzaría, empezando por el elegido. */
export function blancosArea(ctx: Contexto, atk: Luchador, def: Luchador): Luchador[] {
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
  natural = false,
): PlanAtaque {
  nuevaDecision(ctx);
  const sin = ctx.opciones.sinManiobras;
  const soloNormal = perfil(atk) === 'bestia' || sin === true || sin === atk.equipo;
  // Ataque natural: sin maniobras ni técnica nueva.
  if (natural) return mejorManiobra(ctx, atk, def, esContra, bono, modDeAccion(atk, 'ataque', false), true).plan;
  // A distancia (o con un proyectil, aun a bocajarro): con la técnica que eligió al decidir atacar de
  // lejos, o con una a distancia activa; un arma a distancia no se combina con técnicas.
  if (!enAlcance(atk, def) || ranura?.proyectil) {
    if (tecnica) return { ...mejorManiobra(ctx, atk, def, esContra, bono, vistaPrevia(atk, tecnica), soloNormal, true, ranura).plan, tecnica };
    return mejorManiobra(ctx, atk, def, esContra, bono, modDeAccion(atk, 'ataque', false), soloNormal, true, ranura).plan;
  }
  // Una técnica ya elegida (por quien llama) se usa: sólo se elige la maniobra.
  if (tecnica) return { ...mejorManiobra(ctx, atk, def, esContra, bono, vistaPrevia(atk, tecnica), soloNormal).plan, tecnica };
  const comun = !esContra && bono === 0 && !soloNormal;
  const base = comun
    ? sinTecnica(ctx, atk, def)
    : mejorManiobra(ctx, atk, def, esContra, bono, modDeAccion(atk, 'ataque', false), soloNormal);
  if (!atk.ki) return base.plan;
  let mejor = base;
  let mejorNeto = base.valor;
  let elegida: Tecnica | undefined;
  for (const tec of tecnicasPara(atk, 'ataque', esContra)) {
    const ki = vistaPrevia(atk, tec);
    if (!sirveContra(ki, def) || !enCircunstancia(tec, atk, def)) continue;
    const r = mejorManiobra(ctx, atk, def, esContra, bono, ki, soloNormal);
    const neto = r.valor - costoTecnica(atk, def, tec);
    if (neto > mejorNeto) {
      mejor = r;
      mejorNeto = neto;
      elegida = tec;
    }
  }
  if (!elegida || convieneGuardar(ctx, atk, def, elegida, mejorNeto - base.valor)) return base.plan;
  return { ...mejor.plan, tecnica: elegida };
}

/**
 * Lo que vale la rotura si el rival para con su arma (`pParada`): romperle el arma (sin calidad lo
 * desarma; con calidad pierde un grado, unos 5 de cada 100 de lo que pega) menos el riesgo de que se
 * rompa la propia (Core p.93). Aumentar rotura y entereza del Ki ya están en los valores.
 */
function valorRotura(atk: Luchador, def: Luchador, r: Ranura, pParada: number, amen: number): number {
  if (!pParada || r.sinArmas || r.proyectil || atk.cap.desarmado || def.cap.desarmado || (def.ficha.tipoDefensa ?? 'parada') !== 'parada') return 0;
  const perdida = (l: Luchador, a: number) => ((l.ficha.arma?.calidad ?? 0) < 5 ? (l.ficha.sinArmas ? Math.max(0, 1 - l.ficha.sinArmas.ataque / Math.max(1, l.ficha.ataque)) : 0.5) : 0.1) * a;
  // Lo que el rival le deja de pegar (por λ) y lo que él deja de pegarle, dos asaltos.
  const rompeSuya = pRompe(roturaDe(atk, r), enterezaArma(def)) * perdida(def, 2 * lambda(atk) * amen);
  const rompeMia = pRompe(roturaDe(def, { pen: 0, sinArmas: false }), enterezaArma(atk)) * perdida(atk, 2 * amenaza(atk, def));
  return pParada * (rompeSuya - rompeMia);
}

/** La mejor maniobra con estos efectos de Ki, y lo que vale en PV. */
export function mejorManiobra(
  ctx: Contexto, atk: Luchador, def: Luchador, esContra: boolean, bono: number, ki: ModKi | undefined, soloNormal: boolean,
  aDistancia = false, ranura?: Ranura,
): { plan: PlanAtaque; valor: number } {
  const e = atk.cap.est;
  const amen = amenaza(def, atk);
  // Un proyectil a bocajarro se defiende como un golpe; de lejos, con la Tabla 49 (Core p.96).
  const lejos = !enAlcance(atk, def);
  const proyectil = aDistancia && lejos ? ranura?.proyectil?.clase ?? 'disparo' : undefined;
  // Camuflar ataque: si no lo advierte se defiende con −90 (Dominus p.52); se cuenta por su chance.
  const habDef = (ki?.sobrenatural || ki?.area || proyectil ? defensaFinal(def, atk, { kiAtk: ki, proyectil }) : defensaFinal(def, atk)) +
    (ki?.camuflar ? (1 - pAdvierteCamuflaje(atk, def, ki.camuflar)) * MOD_SORPRESA_DEFENSA : 0);
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
    return Math.min(tope, h - Math.max(0, penManiobra(atk, m, esContra, tipo ?? perfilDe(atk, ranura ?? proximaRanura(atk)).tipoAtaque) - (ki?.precision ?? 0)));
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
  const valor = (m: Maniobra, tipo?: TipoAtaque, estadoMushin: EstadoMushin | null = null): number => {
    const hab = ki?.ataqueFijo || habDe(m, tipo, estadoMushin);
    // Daño reducido (desventaja): ese golpe hace la mitad o nada, pero sus efectos funcionan.
    const reducido = ki?.danoReducido ? 1 - ki.danoReducido : undefined;
    const p = pronosticoDesde(prepDe(m, tipo, reducido), def, hab - habDef);
    // Inutilizar e Inconsciencia: la mitad de daño (y de chance de tumbarlo por PV); el crítico, pleno.
    const real = esNoLetal(m) ? pronosticoDesde(prepDe(m, tipo, 0.5 * (reducido ?? 1)), def, hab - habDef) : p;
    // Los ataques que no dañan (engatillar, puntos de presión) se valoran sólo por su efecto.
    const sinDano = m === 'engatillar' || m === 'puntosPresion';
    const danoEste = sinDano ? 0 : real.dano;
    let v = danoEste + (sinDano || m === 'inconsciencia' ? 0 : real.pBaja * amen * 2);
    // Ataque indirecto (Ki) o desde lejos: no se le puede contraatacar (Dominus p.52).
    const contra = ki?.indirecto || (aDistancia && lejos) ? 0 : riesgoContra(atk, def, p);
    if (ki && ki !== SIN_KI && !esManiobraDeControl(m) && (ki.estados.length || ki.impacto || ki.marca || ki.interrumpe)) {
      // Como el motor: Marca, Interrupción y los Estados de ataque piden que el golpe dañe (contra la
      // armadura real, con el daño sin reducir); los de contacto, alcanzar el 10% contra TA 0.
      const prep = prepDe(m, tipo, undefined);
      const s = hab - habDef;
      const pDana = prep.nulo ? 0 : prep.t.pPorcentajeAlMenos(s, prep.absDano, 10);
      const pContacto = prep.t.pPorcentajeAlMenos(s, absorcion(0), 10);
      const pleno = reducido !== undefined ? pronosticoDesde(prep, def, s) : p;
      const danoPleno = pleno.pImpacto > 0 ? pleno.dano / pleno.pImpacto : 0;
      v += valorEfectosKi(atk, def, ki, p, golpesSiguientes, pDana, pContacto, danoPleno);
    }

    // Crítico (cuándo critica lo decide `preparar`): un punto vulnerable pega donde apuntó (Core p.97);
    // cualquier otro golpe, en un lugar al azar.
    const danoSiImpacta = p.pImpacto > 0 ? p.dano / p.pImpacto : 0;
    if (!sinDano) {
      const vulnerable = golpeAPuntoVulnerable(atk, def, m, ki);
      const minimo = vulnerable ? def.pv / 10 : def.pv / 2;
      v += valorCritico(atk, def, p.pCritico, Math.max(minimo, danoSiImpacta), vulnerable && esApuntado(m) ? localizacionApuntada(m) : null, m, golpesSiguientes, danoEste, ki?.critico);
      // Enuth arcano: si daña sin criticar, igual obliga a un control de inconsciencia (Dominus p.43).
      if (e.enuth >= 3) {
        const pr = prepDe(m, tipo, reducido);
        const pDana = pr.nulo ? 0 : pr.t.pPorcentajeAlMenos(hab - habDef, pr.absDano, 10);
        v += valorCritico(atk, def, Math.max(0, pDana - p.pCritico), danoSiImpacta, null, 'inconsciencia', golpesSiguientes, danoEste);
      }
    }

    if (m === 'derribo' || m === 'presa' || m === 'desarmar') {
      const c = caracteristicasControl(m, atk, def, ki?.apresamiento, ki);
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
      if (m === 'desarmar') v += pGana * valorDesarmarlo(atk, def);
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
      disparo -= riesgoContra(atk, def, p2);
      v += p.pImpacto * disparo;
    }
    if (m === 'puntosPresion') {
      // RF contra daño + 20: si falla, −fracaso a toda acción y −2×fracaso PV (Dominus p.42).
      const dif = dificultadPuntosPresion(danoSiImpacta, e.mushin >= 3);
      const { p: pFalla, fracaso: fallo } = fallaResistencia(rfDe(def), dif);
      v += p.pImpacto * pFalla * (Math.min(2 * fallo, def.pv) + valorNegativo(atk, def, fallo, golpesSiguientes, 2 * fallo));
      if (estadoMushin) v += p.pImpacto * pFalla * valorEstadoMushin(estadoMushin, def, amen, fallo, (pen) => valorNegativo(atk, def, pen, golpesSiguientes, 2 * fallo));
    }
    // Ataque adicional (Ki): cada golpe vale lo mismo y arriesga su contra; el asalto se le quita
    // una vez, si lo impacta alguno (Dominus p.55). Con Combo cada golpe sigue sólo si el anterior
    // impactó; con Ataque continuo sólo queda la contra del último; los limitados valen como un ataque
    // común (Dominus p.56).
    // Rotura (opcional, Core p.93): al parar con el arma chocan las dos y cada una puede romperse.
    if (ctx.opciones.rotura) v += valorRotura(atk, def, ranura ?? proximaRanura(atk), 1 - p.pImpacto, amen);
    const golpes = 1 + (ki?.ataquesAdicionales ?? 0);
    const efectivos = ki?.combo && p.pImpacto < 1 ? (1 - Math.pow(p.pImpacto, golpes)) / (1 - p.pImpacto) : golpes;
    const contras = ki?.continuo ? Math.min(1, efectivos) : efectivos;
    const tempo = pierdeElAsalto(def) ? (1 - Math.pow(1 - p.pImpacto, efectivos)) * amen : 0;
    const limitados = ki?.adicionalesLimitados ? ki.adicionalesLimitados * Math.max(0, valorAtaque(atk, def, {})) : 0;
    return efectivos * v - contras * contra + tempo + limitados;
  };

  // Tipo de crítico: el principal, el secundario del arma (Tabla de Ataque Inusual) o una tabla que el
  // estilo deja elegir sin armas (Dumah, Kung Fu supremo): la que más rinda.
  let tipo: TipoAtaque | undefined = ki?.elemento || undefined;
  // El golpe normal ya queda valorado: no se vuelve a calcular en la recorrida de maniobras.
  let vNormal: number | undefined;
  if (!tipo && !ranura?.proyectil) {
    const principal = perfilDe(atk, ranura ?? proximaRanura(atk)).tipoAtaque;
    const sinArmas = ranura?.sinArmas || atk.cap.desarmado;
    // El crítico secundario es del arma: no vale para una patada.
    const sec = !ranura?.sinArmas ? atk.ficha.arma?.critSecundario : undefined;
    const otras = new Set<TipoAtaque>([...(sec ? [sec] : []), ...(sinArmas ? e.tablasLibres : [])]);
    otras.delete(principal);
    if (otras.size) {
      vNormal = valor('normal');
      for (const t of otras) {
        const v = valor('normal', t);
        if (v > vNormal) {
          vNormal = v;
          tipo = t;
        }
      }
    }
  }

  const { opciones, area } = opcionesDeManiobra(ctx, atk, def, ki, esContra, soloNormal, aDistancia);

  let mejor: PlanAtaque = { maniobra: 'normal', tipo, especial: false };
  let mejorValor = -Infinity;
  for (const m of opciones) {
    let v = 0;
    if (m === 'area') {
      v = valorAtaqueArea(atk, def, area, bono, tipo, golpesSiguientes);
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
      const d = mejorDestruccionKi(atk, def, bono, esContra, tipo, habDef, golpesSiguientes);
      if (d.valor > mejorValor) {
        mejorValor = d.valor;
        mejor = { maniobra: m, tipo, especial: false, kiDestruccion: d.extra };
      }
      continue;
    } else v = (m === 'normal' && vNormal !== undefined ? vNormal : valor(m, tipo)) + (ki?.area ? valorAreaKi(ctx, atk, def, ki, bono, m, tipo, proyectil) : 0);
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

/** Maniobras que puede intentar contra `def` con este ataque, y los blancos de uno en área. */
function opcionesDeManiobra(
  ctx: Contexto, atk: Luchador, def: Luchador, ki: ModKi | undefined, esContra: boolean, soloNormal: boolean, aDistancia: boolean,
): { opciones: Maniobra[]; area: Luchador[] } {
  const e = atk.cap.est;
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
  if (e.criticoAutomatico && !soloNormal && !def.ficha.acumulacion) opciones.push('lineas');
  // Destrucción por Ki es un ataque propio: no se combina con una técnica que mejore el golpe.
  const golpeConTecnica = !!ki && (ki.ataque > 0 || ki.dano > 0 || ki.multDano > 1 || ki.danoFijo > 0 || ki.area > 0 || ki.ataqueFijo > 0);
  if (!soloNormal && !aDistancia && !golpeConTecnica && habilidadesKi(atk.ficha).destruccion && (atk.ki?.reserva ?? 0) >= 1) opciones.push('destruccionKi');
  // No se puede aprovechar una contra para un ataque en área (Core p.89). Con un área de Ki la
  // maniobra sobra: la técnica ya alcanza a todos los del radio.
  const area = esContra || soloNormal || aDistancia || ki?.area ? [] : blancosArea(ctx, atk, def);
  if (area.length >= 2) opciones.push('area');
  return { opciones, area };
}

/** Lo que vale un Ataque en área sobre `area` (el elegido primero). */
function valorAtaqueArea(atk: Luchador, def: Luchador, area: Luchador[], bono: number, tipo: TipoAtaque | undefined, golpesSiguientes: number): number {
  let v = 0;
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
    if (pierdeElAsalto(b)) vb += p.pImpacto * amenaza(b, atk);
    vb -= riesgoContra(atk, b, p);
    v += llega[i] * vb;
  });
  return v;
}

/**
 * Destrucción por Ki (Core p.104): prueba cada cantidad de Ki extra (+5 a la dificultad cada una) y
 * devuelve la que más rinde.
 */
function mejorDestruccionKi(
  atk: Luchador, def: Luchador, bono: number, esContra: boolean, tipo: TipoAtaque | undefined, habDef: number, golpesSiguientes: number,
): { valor: number; extra: number } {
  const m: Maniobra = 'destruccionKi';
  const amen = amenaza(def, atk);
  let mejor = { valor: -Infinity, extra: 0 };
  const hab = ataqueFinal(atk, def, { bono, maniobra: m, esContra, tipo });
  const p = pronostico(atk, def, hab, habDef, { maniobra: m, esContra, tipo });
  const rf = rfDe(def);
  const tope = Math.min(Math.floor(presenciaBase(atk.ficha) / 5), atk.ki!.reserva - 1);
  let base = 0;
  if (pierdeElAsalto(def)) base += p.pImpacto * amen;
  base -= riesgoContra(atk, def, p);
  for (let extra = 0; extra <= tope; extra++) {
    // Pierde el fracaso de la RF en PV (Core p.104): su media, la chance de dejarlo a 0 PV y la de
    // criticar (el daño llega a la mitad de sus PV), como cualquier daño en el motor.
    const dif = dificultadDestruccion(atk, extra);
    const { p: pFalla, fracaso } = fallaResistencia(rf, dif);
    const pBaja = fallaResistencia(rf + Math.max(1, def.pv), dif).p;
    const pCrit = fallaResistencia(rf + Math.max(1, Math.ceil(def.pv / 2)), dif).p;
    const ve = base + p.pImpacto * (pFalla * fracaso + pBaja * 2 * amen +
      valorCritico(atk, def, pCrit - pBaja, def.pv / 2, null, 'normal', golpesSiguientes, pFalla * fracaso)) - precioKi(atk) * (1 + extra);
    if (ve > mejor.valor) mejor = { valor: ve, extra };
  }
  return mejor;
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

// --------------------------------------------------------------------------- a distancia

/** Lo que hace con un arma a distancia en su turno (Core p.94-96). */
export type AccionDistancia =
  | { tipo: 'disparar'; arma: number; objetivo: Luchador; disparos: number; pen: number; recargaFalta: number }
  | { tipo: 'recargar'; arma: number }
  | { tipo: 'apuntar'; arma: number; objetivo: Luchador };

/** Un arma a distancia que todavía puede usar: ni encasquillada ni rota, y con proyectiles. */
export function armaUsable(l: Luchador, i: number): boolean {
  const a = l.ficha.armasDistancia![i];
  const st = l.proyectiles[i];
  return !st.inutil && (a.leo ? l.balas > 0 : st.municion > 0);
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
  if (!puedeAtrapar(trucos, arma)) return false;
  nuevaDecision(ctx);
  // Como `atrapar` (combate.ts): Trucos de manos abierta, con su pifia, contra la dificultad del
  // proyectil (la iguala) o, si no tiene, contra el resultado del ataque (lo supera).
  const dif = dificultadAtrapar(arma);
  const base = trucos - penAccion(def) - PEN_ATRAPAR_ADICIONAL * def.atrapadas;
  const umbral = umbralPifia(trucos, def.cap.ajustePifia);
  const p = dif === null
    ? tabla(umbral, atk.cap.umbralAtaque, false).pImpacto(base - habAtk)
    : tabla(umbral, 0, true).pImpacto(base - dif + 1);
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
  return !e.apresadoPor && e.paralisis < 3 && nivelCondicion(e, 'paralisis') < 3 && metrosTotales(e) > 0;
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
 * Daño de `a` por asalto contra su mejor blanco y el que recibe de quienes lo pueden atacar. Quien
 * pelea con conjuros (le queda zeon) no usa sus ataques físicos: no hace daño con ellos.
 */
export function intercambio(ctx: Contexto, a: Luchador): { hace: number; recibe: number } {
  const conMagia = !!a.magia && a.magia.reserva - a.magia.acumulado >= 50;
  let hace = 0;
  let recibe = 0;
  for (const e of enemigos(ctx, a)) {
    if (!conMagia) hace = Math.max(hace, base(a, e).golpe * Math.max(1, a.ataquesDeclarados || 1));
    if (faltaParaLlegar(e, a) <= metrosTotales(e)) recibe += base(e, a).golpe * Math.max(1, e.ataquesDeclarados || 1);
  }
  return { hace, recibe };
}

