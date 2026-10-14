// Habilidades finales con todos los modificadores. Lo usan el combate y la IA, así nunca difieren.

import type { Luchador } from './modelo';
import {
  absorcion, BONO_CANSANCIO, MOD_POSICION, MOD_SORPRESA_DEFENSA,
  metrosPorAsalto, negativoCansancio, PEN_ACCION_ACTIVA, PEN_RESISTIR_GOLPE,
  penDefensaAdicional, posicionPorOrden, type Posicion, type TipoAtaque,
} from './reglas';
import { tabla } from './probabilidades';
import {
  AMENAZADO, atributo, bonoCaracteristica, esManiobraDeControl, ESTADOS_MUSHIN, modEstados, penManiobra,
  type EstadoMushin, type Maniobra,
} from './maniobras';
import type { Ranura } from './rasgos';

export const ALCANCE = 2;
/** Ceguera absoluta (Tabla 43) contra ataques invisibles de Velez arcano. */
const PEN_CEGUERA = 80;
/** Atacar con el crítico secundario del arma (Core p.92). */
const PEN_CRITICO_SECUNDARIO = 10;
/** Prever Sorpresa: −40 a la primera acción enfrentada contra cada adversario elegido (Dominus p.14). */
export const PEN_PREVER_SORPRESA = 40;
/** Posición superior (Tabla 43). */
const BONO_POSICION_SUPERIOR = 20;

export function distancia(a: Luchador, b: Luchador): number {
  const dx = a.pos.x - b.pos.x;
  const dy = a.pos.y - b.pos.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function enAlcance(a: Luchador, b: Luchador): boolean {
  return distancia(a, b) <= ALCANCE + 1e-6;
}

export function activo(l: Luchador): boolean {
  return l.estado === 'activo';
}

export function puedeActuar(l: Luchador): boolean {
  return l.estado === 'activo' && !l.aLaDefensiva && !l.defensaTotal;
}

/**
 * Negativo a toda acción: dolor, críticos y agotamiento. Dos rasgos que dividen a la mitad no se
 * acumulan; Exhausto e Inmunidad se compensan. Berserker y Esencia de vacío ignoran dolor y cansancio.
 */
/** Legado de la Luna: +5 llena, +10 menguante, +15 creciente, +20 nueva, +30 eclipse (Dominus p.79). */
const BONO_LUNAR = { llena: 5, menguante: 10, creciente: 15, nueva: 20, eclipse: 30 } as const;

export function penAccion(l: Luchador): number {
  const c = l.cap;
  const max = l.ficha.cansancio ?? l.ficha.constitucion;
  const fase = l.entorno.faseLunar;
  const luna = c.est.tsukiyomi && fase ? BONO_LUNAR[fase] : 0;
  // Sangre Eterna: consciente con PV negativos, con un negativo igual a esos PV (Dominus p.80).
  const negativos = c.est.sangreEterna && l.pv < 0 ? -l.pv : 0;
  if (c.sinDolorNiCansancio || l.modo.berserker) return l.penFisico + negativos - luna;
  let cansancio = negativoCansancio(l.cansancio, max) * (c.dobleCansancio ? 2 : 1);
  if (c.mitadCansancio) cansancio = Math.trunc(cansancio / 2);
  const dolor = c.mitadDolorCritico ? Math.trunc(l.penDolor / 2) : l.penDolor;
  return dolor + l.penFisico + cansancio + negativos - luna;
}

/** Espacio reducido (Tabla 43): ataque y parada −40 sólo con armas grandes, esquiva −40. */
function penEspacio(l: Luchador, campo: 'ataque' | 'parada' | 'esquiva'): number {
  if (!l.entorno.espacioReducido) return 0;
  const e = l.cap.est;
  if (campo !== 'ataque' && e.defensaSinEspacioReducido) return 0;
  const grande = !l.cap.desarmado && l.ficha.tamanoArma === 'G';
  const pen = campo === 'esquiva' || grande ? 40 : 0;
  return pen * e.factorEspacioReducido;
}

/** Desenfundar en el mismo asalto: −25 al ataque o la parada, salvo Batto jutsu (Tabla 43, Core p.65). */
function penDesenfundar(l: Luchador, campo: 'ataque' | 'parada' | 'esquiva'): number {
  if (!l.enfundada || campo === 'esquiva') return 0;
  // Batto jutsu no sirve con armas a dos manos: se toman como tales las grandes.
  return l.cap.est.battoJutsu && l.ficha.tamanoArma !== 'G' ? 0 : 25;
}

/** Bono de la sangre de Orochi: +20 despierta, +30 desencadenada (Dominus p.81). */
function bonoOrochi(l: Luchador): number {
  if (l.orochiAsaltos < 1) return 0; // tarda un turno entero en empezar a actuar
  return l.orochi === 2 ? 30 : l.orochi === 1 ? 20 : 0;
}

/** Bono variable de Kung Fu / Asakusen si lo puso en `campo` este asalto. */
function bonoVariable(l: Luchador, campo: Luchador['bonoVariableEn']): number {
  return l.bonoVariableEn === campo ? l.cap.est.bonoVariable : 0;
}

/** Turno para la iniciativa, sin el dado. */
export function turnoFinal(l: Luchador): number {
  return l.ficha.turno - penAccion(l) + modEstados(l).turno + bonoVariable(l, 'turno') + bonoOrochi(l) +
    (l.amenazadoPor ? AMENAZADO.turno : 0);
}

export function metrosTotales(l: Luchador): number {
  return metrosPorAsalto(l.ficha.tipoMovimiento);
}

/** Dónde está `atacante` respecto de `defensor`, según el orden en que se trabó con él. */
export function posicionDe(atacante: Luchador, defensor: Luchador): Posicion {
  const i = defensor.trabados.indexOf(atacante);
  return i < 0 ? posicionPorOrden(defensor.trabados.length) : posicionPorOrden(i);
}

export interface OpcionesAtaque {
  /** Ataques declarados a usar para el penalizador. Por defecto, los del asalto. */
  declarados?: number;
  /** Qué ataque del asalto es (penalizador propio y si es sin armas). Por defecto, el próximo. */
  ranura?: Ranura;
  bono?: number;
  cansancio?: number;
  /** Suponer que se mueve activamente antes de atacar. */
  conMovimientoActivo?: boolean;
  maniobra?: Maniobra;
  esContra?: boolean;
  /** Tipo de crítico con el que ataca (el secundario cuesta −10 sin la Tabla de Ataque Inusual). */
  tipo?: TipoAtaque;
  /** Usa su Maniobra Especial (Ars Magnus, +20). */
  especial?: boolean;
  /** Puntos de Samiel gastados en este ataque. */
  samiel?: number;
  /** Mushin arcano: estado a inducir, con su penalizador al ataque (Dominus p.42). */
  estadoMushin?: EstadoMushin | null;
}

/** El Xing Quan da su bono si atacó en su turno, sin defenderse antes, siempre al mismo rival. */
function aplicaXingQuan(atk: Luchador, def: Luchador, o: OpcionesAtaque): boolean {
  if (!atk.cap.est.xingQuan || o.esContra || atk.defensasHechas > 0) return false;
  const m = o.maniobra ?? 'normal';
  return (m === 'normal' || m === 'cabeza' || m === 'corazon') && (atk.objetivoUnico === null || atk.objetivoUnico === def);
}

/** Puede usar la Maniobra Especial: sin usar, y el defensor no la supera por 60 de habilidad base. */
export function puedeManiobraEspecial(atk: Luchador, def: Luchador): boolean {
  return atk.cap.est.maniobraEspecial && !atk.maniobraEspecialUsada && def.ficha.defensa < atk.ficha.ataque + 60;
}

export function ataqueFinal(atk: Luchador, def: Luchador, o: OpcionesAtaque = {}): number {
  const e = atk.cap.est;
  const declarados = Math.max(1, o.declarados ?? atk.ataquesDeclarados);
  const ranura = o.ranura ?? proximaRanura(atk);
  const perfil = perfilDe(atk, ranura);
  const pen = (declarados - 1) * atk.cap.penPorAtaque + ranura.pen;
  const activa = atk.movioActivo || o.conMovimientoActivo ? PEN_ACCION_ACTIVA : 0;
  const tipo = o.tipo ?? perfil.tipoAtaque;
  const secundario = tipo !== perfil.tipoAtaque && !e.criticoSecundarioLibre ? PEN_CRITICO_SECUNDARIO : 0;
  // Ataque Final: +20, y cada punto de cansancio da +20 en vez de +15 (Dominus p.86).
  const porCansancio = atk.modo.ataqueFinal ? 20 : BONO_CANSANCIO;
  return (
    perfil.ataque - pen - activa - penAccion(atk) - secundario - penEspacio(atk, 'ataque') -
    (ranura.sinArmas ? 0 : penDesenfundar(atk, 'ataque')) -
    penManiobra(atk, o.maniobra ?? 'normal', !!o.esContra) +
    MOD_POSICION[posicionDe(atk, def)].ataque + modEstados(atk).ataque +
    // Contra un rival derribado se suma la posición superior (Tabla 43, Dominus p.38).
    (def.derribado ? BONO_POSICION_SUPERIOR : 0) -
    (atk.previenePendiente.has(def) ? PEN_PREVER_SORPRESA : 0) +
    porCansancio * (o.cansancio ?? 0) + (o.bono ?? 0) +
    (o.esContra ? e.bonoContraataque : 0) +
    (atk.modo.seraphite === 3 ? 30 : atk.modo.seraphite === 1 ? 20 : 0) +
    (atk.modo.berserker ? 10 : 0) + (atk.modo.ataqueFinal ? 20 : 0) +
    bonoVariable(atk, 'ataque') + bonoOrochi(atk) +
    (aplicaXingQuan(atk, def, o) ? e.xingQuan : 0) +
    (atk.godhandListo && e.godhand ? e.godhand.ataque : 0) +
    (o.especial && puedeManiobraEspecial(atk, def) ? 20 : 0) + Math.min(150, o.samiel ?? 0) -
    (o.estadoMushin ? ESTADOS_MUSHIN[o.estadoMushin] : 0) +
    // Amenazado: −20 al atacar a quien lo amenaza (Tabla 43).
    (atk.amenazadoPor === def ? AMENAZADO.ataque : 0)
  );
}

export interface OpcionesDefensa {
  defensasPrevias?: number;
  cansancio?: number;
  resistir?: boolean;
  defensaTotal?: boolean;
  samiel?: number;
}

/** Ataques intangibles (Velez arcano): sólo se paran si se puede parar energía. */
function paradaAnulada(def: Luchador, atk: Luchador): boolean {
  return atk.cap.est.intangible && (def.ficha.tipoDefensa ?? 'parada') === 'parada' && !def.cap.est.paraEnergia;
}

/** Los ataques de Velez arcano son invisibles para quien no detecta la energía (ceguera absoluta). */
function noVeElAtaque(def: Luchador, atk: Luchador): boolean {
  return atk.cap.est.intangible && !def.cap.est.veEnergia;
}

export function defensaFinal(def: Luchador, atk: Luchador, o: OpcionesDefensa = {}): number {
  if (def.ficha.acumulacion) return 0;
  const e = def.cap.est;
  // Lama, Lama Tsu y la Tabla de 2ª Arma: Estilo Defensivo eximen algunas defensas.
  const libres = def.cap.defensasLibres + (def.estiloDefensivo ? 1 : 0);
  const previas = Math.max(0, (o.defensasPrevias ?? def.defensasHechas) - libres);
  const total = o.defensaTotal ?? def.defensaTotal;
  // Al retirarse, quien lo ataca lo tiene de flanco, salvo Uroboros (Core p.94, Dominus p.79).
  const pos = def.huyendo && !e.retiradaSinFlanco ? 'flanco' : posicionDe(atk, def);
  const factorPos = pos === 'flanco' ? e.factorFlanco : pos === 'espalda' ? e.factorEspalda : 1;
  const est = modEstados(def);
  const campo = (def.ficha.tipoDefensa ?? 'parada') === 'parada' ? 'parada' : 'esquiva';
  // Sorprendido con el arma enfundada: no puede desenfundar y se defiende sin ella (Tabla 43).
  const sinArma = def.enfundada && atk.sorprendeA.has(def) && def.ficha.sinArmas;
  const base = sinArma ? def.ficha.sinArmas!.defensa : def.ficha.defensa;
  let h =
    base - penDefensaAdicional(previas) - penAccion(def) - penEspacio(def, campo) -
    (sinArma ? 0 : penDesenfundar(def, campo)) +
    MOD_POSICION[pos].defensa * factorPos +
    ((def.ficha.tipoDefensa ?? 'parada') === 'parada' ? est.parada : est.esquiva) +
    (atk.sorprendeA.has(def) ? MOD_SORPRESA_DEFENSA : 0) -
    (def.previenePendiente.has(atk) ? PEN_PREVER_SORPRESA : 0) +
    (total ? e.bonoDefensaTotal : 0) + BONO_CANSANCIO * (o.cansancio ?? 0) -
    (def.modo.seraphite === 3 ? 50 : def.modo.seraphite === 1 ? 30 : 0) -
    (def.modo.berserker ? 20 : 0) + bonoVariable(def, 'defensa') + bonoOrochi(def) +
    Math.min(150, o.samiel ?? 0) - (noVeElAtaque(def, atk) ? PEN_CEGUERA : 0) +
    // Amenazado: −120 a defenderse de quien lo amenaza (Tabla 43), salvo Hanja arcano (Dominus p.44).
    (def.amenazadoPor === atk && !e.defensaSinParalisis ? AMENAZADO.parada : 0);
  if (paradaAnulada(def, atk)) h = Math.min(h, 0);
  if (o.resistir) h = Math.max(0, h - PEN_RESISTIR_GOLPE);
  return h;
}

/**
 * TA del defensor menos lo que le resta el ataque; no baja de 0. Derribo, Presa y Desarmar se
 * resuelven siempre contra TA 0 (Core p.91).
 */
export function absorcionContra(
  def: Luchador, atk: Luchador, maniobra: Maniobra = 'normal', tipo?: TipoAtaque, ranura?: Ranura,
): number {
  if (esManiobraDeControl(maniobra)) return absorcion(0);
  const r = ranura ?? proximaRanura(atk);
  const t = tipo ?? perfilDe(atk, r).tipoAtaque;
  const reduccion = atk.cap.reduccionTA - (r.sinArmas ? atk.cap.reduccionTAArma : 0) + reduccionHakyoukuken(def, atk, t);
  return absorcion(Math.max(0, (def.ficha.ta[t] ?? 0) - reduccion));
}

/**
 * Hakyoukuken contra armaduras blandas: resta 2 a su TA (base) o la anula salvo el bono de calidad
 * (arcano) (Dominus p.43).
 */
function reduccionHakyoukuken(def: Luchador, atk: Luchador, t: TipoAtaque): number {
  const grado = atk.cap.est.hakyoukuken;
  if (!grado || !def.ficha.capasArmadura) return 0;
  let blanda = 0;
  let calidad = 0;
  for (const c of def.ficha.capasArmadura) {
    if (c.clase !== 'blanda') continue;
    blanda += c.ta[t] ?? 0;
    calidad += Math.floor(Math.max(0, c.calidad) / 5);
  }
  return grado >= 3 ? Math.max(0, blanda - calidad) : Math.min(2, blanda);
}

/** Daño base de este ataque: Godhand, Kung Fu en daño y Aikido en las contras. */
export function danoBase(atk: Luchador, def: Luchador, esContra = false, ranura?: Ranura): number {
  const e = atk.cap.est;
  let d = perfilDe(atk, ranura ?? proximaRanura(atk)).danoBase + bonoVariable(atk, 'dano');
  if (atk.godhandListo && e.godhand) d += e.godhand.dano;
  // Aikido: en un contraataque suma 2× (supremo 4×) el bono de FUE del rival, mínimo +5 (Dominus p.31).
  if (esContra && e.aikidoMultiplicadorFue)
    d += Math.max(5, e.aikidoMultiplicadorFue * bonoCaracteristica(atributo(def, 'FUE')));
  return d;
}

/** La barrera de daño del defensor frena el ataque: daño base menor y no daña energía. */
export function barreraFrena(def: Luchador, atk: Luchador, base = atk.ficha.danoBase): boolean {
  return def.cap.barrera > 0 && !atk.cap.danaEnergia && base < def.cap.barrera;
}

const RANURA_COMUN: Ranura = { pen: 0, sinArmas: false };

/** El próximo ataque del asalto que usaría (un ataque declarado común si no le queda ninguno). */
export function proximaRanura(l: Luchador): Ranura {
  return l.planAtaques[l.planAtaques.length - l.ataquesRestantes] ?? RANURA_COMUN;
}

/** Habilidad, daño y crítico con los que hace un ataque: el arma, o el perfil sin armas para la patada. */
export function perfilDe(l: Luchador, ranura: Ranura): { ataque: number; danoBase: number; tipoAtaque: TipoAtaque } {
  const s = l.ficha.sinArmas;
  return ranura.sinArmas && s ? s : l.ficha;
}

export function tablaPara(atk: Luchador, def: Luchador) {
  return tabla(atk.cap.umbralAtaque, def.cap.umbralDefensa, !!def.ficha.acumulacion);
}

export interface Pronostico {
  /** Daño esperado en PV. */
  dano: number;
  pImpacto: number;
  pContra: number;
  /** Bono medio de la contra, condicionado a que haya contra. */
  bonoContra: number;
  /** P(dejarlo a 0 PV o menos de un golpe). */
  pBaja: number;
  /** P(provocar un crítico). */
  pCritico: number;
  /** P(resultado de al menos 10% contra TA 0): la maniobra alcanza el control enfrentado. */
  pManiobra: number;
}

/** % de daño necesario para quitar `pv` con un arma de daño `base`. */
function porcentajePara(pv: number, base: number): number {
  return Math.max(10, Math.ceil((pv * 100) / Math.max(1, base) / 10) * 10);
}

export interface OpcionesPronostico {
  maniobra?: Maniobra;
  esContra?: boolean;
  tipo?: TipoAtaque;
  ranura?: Ranura;
  /** Multiplica el daño base (Inutilizar e Inconsciencia hacen la mitad). */
  factorDano?: number;
}

/** Lo que comparten `pronostico` y `danoEsperado`: tabla, ventaja, absorciones y daño base. */
function preparar(atk: Luchador, def: Luchador, habAtaque: number, habDefensa: number, o: OpcionesPronostico) {
  const m = o.maniobra ?? 'normal';
  const abs = absorcionContra(def, atk, m, o.tipo, o.ranura);
  let base = danoBase(atk, def, o.esContra, o.ranura);
  // Derribo y Presa dañan a la mitad (contra la armadura real) si el atacante quiere; Desarmar no daña.
  if (m === 'desarmar') base = 0;
  else if ((m === 'derribo' || m === 'presa') && !atk.cap.est.danoCompletoEnPresa) base = Math.floor(base / 2);
  if (o.factorDano !== undefined) base = Math.floor(base * o.factorDano);
  const absDano = esManiobraDeControl(m) ? absorcionContra(def, atk, 'normal', o.tipo, o.ranura) : abs;
  const nulo = base === 0 || barreraFrena(def, atk, base);
  return { t: tablaPara(atk, def), s: habAtaque - habDefensa, abs, absDano, base, nulo };
}

/** Pronóstico de un ataque a partir de las habilidades finales (sin dados). */
export function pronostico(
  atk: Luchador, def: Luchador, habAtaque: number, habDefensa: number, o: OpcionesPronostico = {},
): Pronostico {
  const { t, s, abs, absDano, base, nulo } = preparar(atk, def, habAtaque, habDefensa, o);
  const pContra = def.ficha.acumulacion ? 0 : t.pContra(s);
  return {
    dano: nulo ? 0 : (t.porcentajeEsperado(s, absDano) * base) / 100,
    pImpacto: t.pImpacto(s),
    pContra,
    bonoContra: pContra > 0 ? t.bonoContraEsperado(s) / pContra : 0,
    pBaja: nulo ? 0 : def.pv > 0 ? t.pPorcentajeAlMenos(s, absDano, porcentajePara(def.pv, base)) : 1,
    pCritico: nulo || def.pv <= 0 ? 0 : t.pPorcentajeAlMenos(s, absDano, porcentajePara(def.pv / 2, base)),
    pManiobra: t.pPorcentajeAlMenos(s, abs, 10),
  };
}

/** Sólo el daño esperado de `pronostico`, sin calcular (ni crear) el resto. */
export function danoEsperado(
  atk: Luchador, def: Luchador, habAtaque: number, habDefensa: number, o: OpcionesPronostico = {},
): number {
  const { t, s, absDano, base, nulo } = preparar(atk, def, habAtaque, habDefensa, o);
  return nulo ? 0 : (t.porcentajeEsperado(s, absDano) * base) / 100;
}
