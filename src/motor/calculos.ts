// Habilidades finales con todos los modificadores. Lo usan el combate y la IA, así nunca difieren.

import type { CapaArmadura, Ficha, Luchador } from './modelo';
import {
  absorcion, BONO_CANSANCIO, MOD_POSICION, MOD_SORPRESA_DEFENSA,
  metrosPorAsalto, negativoCansancio, PEN_ACCION_ACTIVA, PEN_RESISTIR_GOLPE,
  penDefensaAdicional, posicionPorOrden, type Posicion, type TipoAtaque,
} from './reglas';
import { tabla } from './probabilidades';
import {
  AMENAZADO, atributo, bonoCaracteristica, esApuntado, esManiobraDeControl, ESTADOS_MUSHIN, modEstados, penManiobra,
  type EstadoMushin, type Maniobra,
} from './maniobras';
import { localizacionArmadura, type Ranura } from './rasgos';

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

/**
 * En los controles enfrentados de características, cada 20 de negativo a toda acción resta 1 al
 * atributo, y cada +20 de bono suma 1 (Core p.232).
 */
export function modControl(l: Luchador): number {
  return -Math.trunc(penAccion(l) / 20) || 0;
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

/** Umbral de pifia en el turno: 3 más la suerte (el turno no es una habilidad: no tiene maestría). */
export function umbralPifiaTurno(l: Luchador): number {
  return Math.max(0, 3 + l.cap.ajustePifia);
}

/** Turno para la iniciativa, sin el dado. El negativo a toda acción cuenta la mitad (Core p.232). */
export function turnoFinal(l: Luchador): number {
  return l.ficha.turno - Math.trunc(penAccion(l) / 2) + modEstados(l).turno + bonoVariable(l, 'turno') + bonoOrochi(l) +
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

/**
 * Penalizador de flanco o espalda al atacar (Tabla 43): lo sufre quien ataca a un rival que tiene en
 * su lateral o detrás, no quien está ahí (Core p.90: "−30 a parar […] y −10 para atacarlo"). Soo Bahk
 * avanzado ataca a sus laterales con habilidad plena; Hanja, en cualquier posición (Dominus p.38, p.43).
 */
function modPosicionAtaque(atk: Luchador, def: Luchador): number {
  const i = atk.trabados.indexOf(def);
  if (i < 0) return 0;
  const pos = posicionPorOrden(i);
  const e = atk.cap.est;
  if (pos === 'flanco') return e.factorFlanco === 0 ? 0 : MOD_POSICION.flanco.ataque;
  if (pos === 'espalda') return e.factorEspalda === 0 ? 0 : MOD_POSICION.espalda.ataque;
  return 0;
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
  // Sólo ataques normales o apuntados (Inutilizar e Inconsciencia también lo son).
  const m = o.maniobra ?? 'normal';
  return (m === 'normal' || esApuntado(m)) && (atk.objetivoUnico === null || atk.objetivoUnico === def);
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
  // Selene arcano contraataca "con Habilidad de Ataque plena": esas contras no cuentan como ataques,
  // así que no arrastran el penalizador de los ataques adicionales (Dominus p.39).
  const pen = o.esContra && e.contrasIlimitadas ? 0 : (declarados - 1) * atk.cap.penPorAtaque + ranura.pen;
  const activa = atk.movioActivo || o.conMovimientoActivo ? PEN_ACCION_ACTIVA : 0;
  const tipo = o.tipo ?? perfil.tipoAtaque;
  const secundario = tipo !== perfil.tipoAtaque && !e.criticoSecundarioLibre ? PEN_CRITICO_SECUNDARIO : 0;
  // Ataque Final: +20, y cada punto de cansancio da +20 en vez de +15 (Dominus p.86).
  const porCansancio = atk.modo.ataqueFinal ? 20 : BONO_CANSANCIO;
  return (
    perfil.ataque - pen - activa - penAccion(atk) - secundario - penEspacio(atk, 'ataque') -
    (ranura.sinArmas ? 0 : penDesenfundar(atk, 'ataque')) -
    penManiobra(atk, o.maniobra ?? 'normal', !!o.esContra) +
    // Parálisis completa + flanco o espalda se queda en −200 (Dominus p.11, Tabla 1).
    (atk.paralisis === 3 ? 0 : modPosicionAtaque(atk, def)) + modEstados(atk).ataque + desequilibrio(atk, def) +
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
  /** Suponer que lo atacan desde esta posición (la IA, para quien todavía no se trabó). */
  posicion?: Posicion;
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

/** Flanco o espalda + ceguera absoluta, a la defensa (Dominus p.11, Tabla 1). */
const POSICION_Y_CEGUERA: Record<Posicion, number> = { frente: -PEN_CEGUERA, flanco: -100, espalda: -120 };

/**
 * Posición y ceguera a la defensa, combinadas según la Tabla 1 del Dominus (p.11): flanco + ceguera
 * absoluta −100 y espalda + ceguera absoluta −120 en vez de sumarse; con parálisis completa quedan en
 * su −200 (ni posición ni ceguera suman más).
 */
function situacionDefensa(def: Luchador, atk: Luchador, pos: Posicion, factorPos: number): number {
  if (def.paralisis === 3) return 0;
  const posicion = MOD_POSICION[pos].defensa * factorPos;
  if (!noVeElAtaque(def, atk)) return posicion;
  return Math.max(posicion - PEN_CEGUERA, POSICION_Y_CEGUERA[pos]);
}

/**
 * Desequilibrio excesivo en los atributos (Dominus p.10, opcional): si su Destreza + Agilidad supera
 * en más de 7 a la del rival, +10 a toda acción física enfrentada contra él por cada punto de más.
 */
export function desequilibrio(l: Luchador, rival: Luchador): number {
  if (!l.entorno.desequilibrio) return 0;
  const suma = (x: Luchador) => atributo(x, 'DES') + atributo(x, 'AGI');
  const diferencia = suma(l) - suma(rival);
  return diferencia > 7 ? 10 * (diferencia - 7) : 0;
}

export function defensaFinal(def: Luchador, atk: Luchador, o: OpcionesDefensa = {}): number {
  if (def.ficha.acumulacion) return 0;
  const e = def.cap.est;
  // Lama, Lama Tsu y la Tabla de 2ª Arma: Estilo Defensivo eximen algunas defensas.
  const libres = def.cap.defensasLibres + (def.estiloDefensivo ? 1 : 0);
  const previas = Math.max(0, (o.defensasPrevias ?? def.defensasHechas) - libres);
  const total = o.defensaTotal ?? def.defensaTotal;
  // Al retirarse, quien lo ataca lo tiene de flanco, salvo Uroboros (Core p.94, Dominus p.79).
  const pos = def.huyendo && !e.retiradaSinFlanco ? 'flanco' : o.posicion ?? posicionDe(atk, def);
  const factorPos = pos === 'flanco' ? e.factorFlanco : pos === 'espalda' ? e.factorEspalda : 1;
  const est = modEstados(def);
  const campo = (def.ficha.tipoDefensa ?? 'parada') === 'parada' ? 'parada' : 'esquiva';
  // Sorprendido con el arma enfundada: no puede desenfundar y se defiende sin ella (Tabla 43).
  const sinArma = def.enfundada && atk.sorprendeA.has(def) && def.ficha.sinArmas;
  const base = sinArma ? def.ficha.sinArmas!.defensa : def.ficha.defensa;
  let h =
    base - penDefensaAdicional(previas) - penAccion(def) - penEspacio(def, campo) -
    (sinArma ? 0 : penDesenfundar(def, campo)) +
    situacionDefensa(def, atk, pos, factorPos) + desequilibrio(def, atk) +
    ((def.ficha.tipoDefensa ?? 'parada') === 'parada' ? est.parada : est.esquiva) +
    (atk.sorprendeA.has(def) ? MOD_SORPRESA_DEFENSA : 0) -
    (def.previenePendiente.has(atk) ? PEN_PREVER_SORPRESA : 0) +
    (total ? e.bonoDefensaTotal : 0) + BONO_CANSANCIO * (o.cansancio ?? 0) -
    (def.modo.seraphite === 3 ? 50 : def.modo.seraphite === 1 ? 30 : 0) -
    (def.modo.berserker ? 20 : 0) + bonoVariable(def, 'defensa') + bonoOrochi(def) +
    Math.min(150, o.samiel ?? 0) +
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
  const zona = zonaDe(maniobra);
  const reduccion = atk.cap.reduccionTA - (r.sinArmas ? atk.cap.reduccionTAArma : 0) + reduccionHakyoukuken(def, atk, t, zona);
  return absorcion(Math.max(0, taZona(def.ficha, zona, t) - reduccion));
}

export type ZonaArmadura = 'cuerpo' | 'cabeza' | 'extremidad';

/**
 * Zona que protege la armadura ante un golpe (Core p.92: "en los golpes apuntados se aplica
 * únicamente el tipo de armadura de la zona a la que se ataca"). El corazón está en el torso.
 * Inutilizar elige brazo o pierna: la pierna sólo la cubre una armadura completa, y una camisola
 * cubre también los brazos, así que la pierna nunca está más protegida.
 */
export function zonaDe(m: Maniobra): ZonaArmadura {
  if (m === 'cabeza' || m === 'inconsciencia') return 'cabeza';
  if (m === 'inutilizar') return 'extremidad';
  return 'cuerpo';
}

function cubre(c: CapaArmadura, zona: ZonaArmadura): boolean {
  const loc = c.localizacion ?? localizacionArmadura(c.nombre);
  return zona === 'cabeza' ? loc === 'cabeza' : zona === 'extremidad' ? loc === 'completa' : loc !== 'cabeza';
}

/** Capas combinadas (Core p.83): la TA más alta más la mitad de cada una de las otras, hacia abajo. */
function combinarTA(capas: CapaArmadura[], t: TipoAtaque): number {
  const v = capas.map((c) => c.ta[t] ?? 0).sort((a, b) => b - a);
  let total = v[0] ?? 0;
  for (let i = 1; i < v.length; i++) total += Math.floor(v[i] / 2);
  return total;
}

const taPorZona = new WeakMap<Ficha, Map<string, number>>();

/**
 * TA en una zona. El cuerpo usa la TA total de la planilla. La cabeza (yelmo) y las piernas usan sólo
 * las capas que las cubren, más lo que la planilla suma fuera de las capas (armaduras especiales o
 * naturales, como la Armadura de Energía por Ki), que protege todo el cuerpo. Sin capas cargadas no
 * se sabe qué cubre cada cosa y se usa la total.
 */
export function taZona(f: Ficha, zona: ZonaArmadura, t: TipoAtaque): number {
  const total = f.ta[t] ?? 0;
  if (zona === 'cuerpo' || !f.capasArmadura) return total;
  let m = taPorZona.get(f);
  if (!m) taPorZona.set(f, (m = new Map()));
  const clave = zona + t;
  let v = m.get(clave);
  if (v === undefined) {
    const cuerpo = f.capasArmadura.filter((c) => cubre(c, 'cuerpo'));
    const especial = Math.max(0, total - combinarTA(cuerpo, t));
    v = combinarTA(f.capasArmadura.filter((c) => cubre(c, zona)), t) + especial;
    m.set(clave, v);
  }
  return v;
}

/** Capas de armadura que protegen la zona. */
export function capasDe(f: Ficha, zona: ZonaArmadura): CapaArmadura[] {
  return (f.capasArmadura ?? []).filter((c) => cubre(c, zona));
}

/**
 * Hakyoukuken contra armaduras blandas: resta 2 a su TA (base) o la anula salvo el bono de calidad
 * (arcano) (Dominus p.43).
 */
function reduccionHakyoukuken(def: Luchador, atk: Luchador, t: TipoAtaque, zona: ZonaArmadura): number {
  const grado = atk.cap.est.hakyoukuken;
  if (!grado || !def.ficha.capasArmadura) return 0;
  let blanda = 0;
  let calidad = 0;
  for (const c of capasDe(def.ficha, zona)) {
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
