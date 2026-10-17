// Habilidades finales con todos los modificadores. Lo usan el combate y la IA, así nunca difieren.

import type { ArmaDistancia, CapaArmadura, Ficha, Luchador } from './modelo';
import {
  absorcion, BONO_CANSANCIO, bonoFrialdad, MOD_POSICION, MOD_SORPRESA_DEFENSA,
  metrosPorAsalto, negativoCansancio, PEN_ACCION_ACTIVA, PEN_RESISTIR_GOLPE,
  esMaestro, maxAccionesActivas, penDefensaAdicional, penDefensaProyectil, posicionPorOrden, type Posicion, type TipoAtaque,
} from './reglas';
import { tabla } from './probabilidades';
import {
  AMENAZADO, atributo, bonoCaracteristica, esApuntado, esManiobraDeControl, ESTADOS_MUSHIN, modEstados, penManiobra,
  type EstadoMushin, type Maniobra,
} from './maniobras';
import { localizacionArmadura, normalizarRasgo, presenciaBase, tamanoArmaDe, type Ranura } from './rasgos';
import { ajusteTaEnergia, conIncremento, type ModKi } from './ki';
import { hayAura, nivelCeguera, nivelParalisis } from './condiciones';
import { adyacentes, campoHacia, indice, lineaDeVision, type Vision } from './mapa';
import { modVelocidadBlanco } from './proyectiles';

export const ALCANCE = 2;
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

/**
 * Quiénes están en la línea recta de `a` a `b` (sin contarlos): a medio metro o menos de ella, de más
 * cerca a más lejos de `a`. Para la Estela de destrucción (Dominus p.58), sin alcances parciales.
 */
export function enLaLinea(luchadores: Luchador[], a: Luchador, b: Luchador): Luchador[] {
  const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y;
  const largo2 = dx * dx + dy * dy;
  if (!largo2) return [];
  const en: { l: Luchador; t: number }[] = [];
  for (const l of luchadores) {
    if (l === a || l === b || !activo(l)) continue;
    const t = ((l.pos.x - a.pos.x) * dx + (l.pos.y - a.pos.y) * dy) / largo2;
    if (t <= 0 || t >= 1) continue;
    const px = a.pos.x + t * dx - l.pos.x, py = a.pos.y + t * dy - l.pos.y;
    if (px * px + py * py <= 0.25 + 1e-9) en.push({ l, t });
  }
  return en.sort((x, y) => x.t - y.t).map((x) => x.l);
}

/** Trabados cuerpo a cuerpo: en el mapa, en celdas vecinas (también en diagonal). */
export function enAlcance(a: Luchador, b: Luchador): boolean {
  if (a.mapa) return adyacentes(a.mapa, a.pos, b.pos);
  return distancia(a, b) <= ALCANCE + 1e-6;
}

/** Metros que le faltan caminar a `l` para quedar trabado con `e` (por el camino, esquivando muros). */
export function faltaParaLlegar(l: Luchador, e: Luchador): number {
  if (enAlcance(l, e)) return 0;
  if (l.mapa) return campoHacia(l.mapa, e.pos)[indice(l.mapa, l.pos)];
  return Math.max(0, distancia(l, e) - ALCANCE);
}

export function activo(l: Luchador): boolean {
  return l.estado === 'activo';
}

export function puedeActuar(l: Luchador): boolean {
  return l.estado === 'activo' && !l.aLaDefensiva && !l.defensaTotal && !l.fascinado;
}

/** Legado de la Luna: +5 llena, +10 menguante, +15 creciente, +20 nueva, +30 eclipse (Dominus p.79). */
const BONO_LUNAR = { llena: 5, menguante: 10, creciente: 15, nueva: 20, eclipse: 30 } as const;
const PEN_MIEDO = 60;
const PEN_DOLOR = { leve: 20, normal: 40, extremo: 80 } as const;

/**
 * Negativo a toda acción: dolor, críticos y agotamiento. Dos rasgos que dividen a la mitad no se
 * acumulan; Exhausto e Inmunidad se compensan. Berserker y Esencia de vacío ignoran dolor y cansancio.
 */
export function penAccion(l: Luchador): number {
  const c = l.cap;
  const max = l.ficha.cansancio ?? l.ficha.constitucion;
  const fase = l.entorno.faseLunar;
  const luna = c.est.tsukiyomi && fase ? BONO_LUNAR[fase] : 0;
  // Sangre Eterna: consciente con PV negativos, con un negativo igual a esos PV (Dominus p.80).
  const negativos = c.est.sangreEterna && l.pv < 0 ? -l.pv : 0;
  // Miedo: −60 a toda acción que no sea huir (Core p.232); pelear no lo es.
  // El Aura de combate de un rival puede dar miedo o −10 a toda acción (Dominus p.22, Tabla 9).
  const auras = l.auras.size > 0;
  const miedo = (l.ficha.estados?.miedo || (auras && hayAura(l, 'miedo')) ? PEN_MIEDO : 0) + (auras && hayAura(l, 'afectado') ? 10 : 0);
  // Éxtasis: −20 a toda acción en lugar de los demás negativos, salvo los físicos (Core p.128).
  if (l.extasis) return 20 + l.penFisico + l.penTecnica - luna;
  // El penalizador de una técnica (desventaja) no lo quita nada sobrenatural (Dominus p.74).
  if (c.sinDolorNiCansancio || l.modo.berserker) return l.penFisico + l.penTecnica + negativos + miedo - luna;
  // Dolor como estado (Core p.233): no baja con los asaltos como el de los críticos.
  const estadoDolor = l.ficha.estados?.dolor ? PEN_DOLOR[l.ficha.estados.dolor] : 0;
  let cansancio = negativoCansancio(l.cansancio, max) * (c.dobleCansancio ? 2 : 1);
  if (c.mitadCansancio) cansancio = Math.trunc(cansancio / 2);
  const dolor = c.mitadDolorCritico ? Math.trunc(l.penDolor / 2) : l.penDolor;
  return dolor + estadoDolor + l.penFisico + l.penTecnica + cansancio + negativos + miedo - luna;
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
  const grande = !l.cap.desarmado && tamanoArmaDe(l.ficha) === 'G';
  const pen = campo === 'esquiva' || grande ? 40 : 0;
  return pen * e.factorEspacioReducido;
}

/** Desenfundar en el mismo asalto: −25 al ataque o la parada, salvo Batto jutsu (Tabla 43, Core p.65). */
function penDesenfundar(l: Luchador, campo: 'ataque' | 'parada' | 'esquiva'): number {
  if (!l.enfundada || campo === 'esquiva') return 0;
  // Batto jutsu no sirve con armas a dos manos: se toman como tales las grandes.
  return l.cap.est.battoJutsu && tamanoArmaDe(l.ficha) !== 'G' ? 0 : 25;
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
  // Quien pelea con magia usa el turno de las acciones desarmadas (Core p.117).
  const base = l.magia ? l.ficha.magia?.turno ?? l.ficha.sinArmas?.turno ?? l.ficha.turno : l.ficha.turno;
  return base - Math.trunc(penAccion(l) / 2) + modEstados(l).turno + propioTurno(l) +
    (l.amenazadoPor ? AMENAZADO.turno : 0);
}

/*
 * Modificadores propios: los que tiene el luchador sin importar contra quién ni con qué maniobra (modos
 * de los estilos, bono variable, Orochi, Incrementar turno del Ki, beneficios sobrenaturales). Una fuente
 * nueva de este tipo se suma acá y llega a las tres fórmulas (ataque, defensa, turno). Son números, sin
 * armar objetos: están en el camino más caliente.
 */

/** Seraphite +20/+30 (arcano), Berserker +10, Ataque Final +20 (Dominus p.41, p.84, p.86), y lo demás propio. */
export function propioAtaque(l: Luchador): number {
  return (l.modo.seraphite === 3 ? 30 : l.modo.seraphite === 1 ? 20 : 0) + (l.modo.berserker ? 10 : 0) +
    (l.modo.ataqueFinal ? 20 : 0) + bonoVariable(l, 'ataque') + bonoOrochi(l) + (l.bono?.ataque ?? 0) + (l.bono?.toda ?? 0);
}

/** Seraphite −30/−50 (arcano), Berserker −20, y lo demás propio. */
export function propioDefensa(l: Luchador): number {
  return -(l.modo.seraphite === 3 ? 50 : l.modo.seraphite === 1 ? 30 : 0) - (l.modo.berserker ? 20 : 0) +
    bonoVariable(l, 'defensa') + bonoOrochi(l) + (l.bono?.toda ?? 0);
}

export function propioTurno(l: Luchador): number {
  // Lentitud (Armadura del Ki): −5 al turno por punto de TA (Dominus p.61).
  return bonoVariable(l, 'turno') + bonoOrochi(l) + (l.ki ? l.ki.activo.turno - 5 * l.ki.activo.lentitud : 0) + (l.bono?.turno ?? 0);
}

/**
 * Metros por asalto (Tabla 25). Sin Inhumanidad no pasa de Tipo de movimiento 10, y sin Zen de 13
 * (Core p.62); cada 20 de negativo a toda acción le resta 1 (Core p.232), y los bonos no lo suben.
 */
export function metrosTotales(l: Luchador): number {
  return metrosPorAsalto(Math.max(0, tipoMovimientoKi(l) - Math.max(0, Math.trunc(penAccion(l) / 20))));
}

/**
 * Tipo de movimiento con el tope y el Ki: Incremento de movimiento suma de a uno hasta 13 y de a medio
 * por encima, sin necesitar Inhumanidad ni Zen; Lentitud resta, sin bajar de la mitad (Dominus p.61).
 */
function tipoMovimientoKi(l: Luchador): number {
  let tm = Math.min(l.ficha.tipoMovimiento, l.cap.est.topeMovimiento);
  const ki = l.ki?.activo;
  if (!ki || (!ki.movimiento && !ki.lentitud)) return tm;
  for (let i = 0; i < ki.movimiento; i++) tm += tm < 13 ? 1 : 0.5;
  return Math.max(Math.floor(l.ficha.tipoMovimiento / 2), Math.floor(tm) - ki.lentitud);
}

/**
 * Detección del Ki (Core p.103-104): la media entre su CM total y Advertir, +10 por nivel de la
 * ventaja Percepción del Ki (Dominus p.18; "Percepción del Ki 2" es nivel 2, sin número 1).
 */
export function baseDeteccionKi(l: Luchador): number {
  const percepcion = (l.ficha.rasgos?.ventajas ?? []).map(normalizarRasgo).find((v) => v.startsWith('percepcion del ki'));
  const nivel = percepcion === undefined ? 0 : Number(percepcion.match(/(\d+)\s*$/)?.[1] ?? 1);
  return Math.floor(((l.ficha.cm ?? 0) + (l.ficha.advertir ?? 0)) / 2) + 10 * nivel;
}

/** Bono con que contraataca `l`: Selene lo dobla (Dominus p.39). Motor e IA usan esta. */
export function bonoDeContra(l: Luchador, bono: number): number {
  return l.cap.est.doblaBonoContra ? bono * 2 : bono;
}

/**
 * Tabla 41 (Core p.85): ¿le quedan acciones activas después de hacer `mas` más? Sin Destreza y
 * Agilidad en la ficha no hay tope.
 */
export function quedanAccionesActivas(l: Luchador, mas = 0): boolean {
  const a = l.ficha.atributos;
  if (a?.DES === undefined || a.AGI === undefined) return true;
  return l.accionesActivas + mas < maxAccionesActivas(a.DES + a.AGI);
}

/**
 * Columna "Acción física" de la Tabla 43 (Core p.90), para las habilidades físicas como Acrobacias:
 * ceguera −30/−90, derribado −30, parálisis −40/−60/−200, amenazado −100, levitando −60, espacio
 * reducido −20. Las parálisis no se suman: vale la peor.
 */
export function penAccionFisica(l: Luchador): number {
  const ceguera = [0, 30, 90][nivelCeguera(l)];
  const paralisis = nivelParalisis(l);
  return ceguera + (l.derribado ? 30 : 0) + [0, 40, 60, 200][paralisis] + (l.amenazadoPor ? 100 : 0) +
    (l.ficha.estados?.levitando ? 60 : 0) + (l.entorno.espacioReducido ? 20 : 0);
}

/** Dónde está `atacante` respecto de `defensor`, según el orden en que se trabó con él. */
export function posicionDe(atacante: Luchador, defensor: Luchador): Posicion {
  const i = defensor.trabados.indexOf(atacante);
  return i < 0 ? posicionPorOrden(defensor.trabados.length) : posicionPorOrden(i);
}

type Campo = 'ataque' | 'parada' | 'esquiva';

/** Ceguera parcial y absoluta (Tabla 43). */
const CEGUERA: Record<1 | 2, Record<Campo, number>> = {
  1: { ataque: -30, parada: -30, esquiva: -15 },
  2: { ataque: -100, parada: -80, esquiva: -80 },
};

/** Posición y ceguera juntas, en vez de sumarse (Dominus p.11, Tabla 1). */
const POSICION_Y_CEGUERA: Record<'flanco' | 'espalda', Record<1 | 2, Record<Campo, number>>> = {
  flanco: { 1: { ataque: -40, parada: -50, esquiva: -40 }, 2: { ataque: -100, parada: -100, esquiva: -100 } },
  espalda: { 1: { ataque: -40, parada: -90, esquiva: -80 }, 2: { ataque: -100, parada: -120, esquiva: -120 } },
};

export interface Ceguera {
  /** 0 ve, 1 ceguera parcial, 2 absoluta. */
  nivel: 0 | 1 | 2;
  /** Parte del penalizador que sufre (Visión nocturna en la oscuridad total: la mitad). */
  factor: number;
  /** Localiza al rival sin verlo (Detección del Ki): flanco y espalda a la mitad (Dominus p.11). */
  localiza: boolean;
}
const SIN_CEGUERA: Ceguera = { nivel: 0, factor: 1, localiza: false };

/**
 * Ceguera por la oscuridad del escenario. La Visión nocturna (ventaja) ignora la penumbra y reduce a la
 * mitad la carencia absoluta de luz y la oscuridad mágica (Core p.20); la completa anula la oscuridad
 * natural (Core p.318), y ante la mágica se toma como la ventaja.
 */
function cegueraPorOscuridad(l: Luchador): Ceguera {
  const o = l.entorno.oscuridad;
  // Crear Luz alrededor suyo: la oscuridad natural no lo alcanza (Core p.126).
  if (!o || (l.bono?.luz && o !== 'magica')) return SIN_CEGUERA;
  // Visión nocturna del Ki: como la completa (Dominus p.62).
  const vision = l.ki?.activo.visionNocturna ? 2 : l.cap.est.visionNocturna;
  if (o === 'penumbra') return vision ? SIN_CEGUERA : { nivel: 1, factor: 1, localiza: false };
  if (o === 'total' && vision === 2) return SIN_CEGUERA;
  return { nivel: 2, factor: vision ? 0.5 : 1, localiza: false };
}

/**
 * Cuánto no ve `l` a `rival`: lo peor entre estar cegado (Core p.233), la oscuridad y un ataque
 * invisible. Con Detección del Ki lo localiza: ceguera parcial en vez de absoluta y la mitad de los
 * penalizadores de flanco y espalda (Dominus p.11). Se supone que la tirada de detección sale.
 */
export function cegueraContra(l: Luchador, rival: Luchador, invisible = false): Ceguera {
  // Lo más común (está en el camino más caliente): nada que lo ciegue.
  if (!l.condiciones.ceguera && !invisible && !l.ficha.estados?.ceguera && !rival.bono?.invisible && !l.entorno.oscuridad) return SIN_CEGUERA;
  const propia = nivelCeguera(l);
  const casos: Ceguera[] = [
    propia ? { nivel: propia, factor: 1, localiza: false } : SIN_CEGUERA,
    cegueraPorOscuridad(l),
    invisible ? { nivel: 2, factor: 1, localiza: false } : SIN_CEGUERA,
    // Invisibilidad (Core p.190): si no superó Advertir no lo ve; si lo superó, nota las alteraciones (parcial).
    rival.bono?.invisible ? { nivel: l.percibe.has(rival) ? 1 : 2, factor: 1, localiza: false } : SIN_CEGUERA,
  ];
  const valor = (c: Ceguera) => (c.nivel ? CEGUERA[c.nivel].ataque * c.factor : 0);
  const peor = casos.reduce((a, b) => (valor(b) < valor(a) ? b : a));
  // Detección del Ki: si este asalto lo localiza (`detectarPresencias`), pelea como con ceguera parcial (Dominus p.11).
  if (peor.nivel === 2 && l.radioDeteccionKi > 0 && distancia(l, rival) <= l.radioDeteccionKi) return { nivel: 1, factor: 1, localiza: true };
  // Ojos de la Muerte ve las líneas de los invisibles: contra ellos, sólo ceguera parcial (Dominus p.78).
  if (peor.nivel === 2 && l.cap.est.criticoAutomatico && (invisible || rival.bono?.invisible) && propia < 2 && cegueraPorOscuridad(l).nivel < 2)
    return { nivel: 1, factor: 1, localiza: false };
  return peor;
}

/** Posición (ya con lo que la reduce) más ceguera, con los valores combinados de la Tabla 1 del Dominus. */
function conCeguera(pos: Posicion, posicion: number, c: Ceguera, campo: Campo): number {
  if (c.nivel === 0) return posicion;
  const p = c.localiza ? Math.trunc(posicion / 2) : posicion;
  const suma = p + CEGUERA[c.nivel][campo] * c.factor;
  if (pos === 'frente' || posicion === 0) return suma;
  return Math.max(suma, POSICION_Y_CEGUERA[pos][c.nivel][campo]);
}

/**
 * Penalizador de flanco o espalda al atacar (Tabla 43): lo sufre quien ataca a un rival que tiene en
 * su lateral o detrás, no quien está ahí (Core p.90: "−30 a parar […] y −10 para atacarlo"). Soo Bahk
 * avanzado ataca a sus laterales con habilidad plena; Hanja, en cualquier posición (Dominus p.38, p.43).
 * Se combina con la ceguera; un área de Ki que cubre toda la zona no la sufre (Dominus p.11).
 */
function situacionAtaque(atk: Luchador, def: Luchador, ki: ModKi | undefined): number {
  const i = atk.trabados.indexOf(def);
  const pos = i < 0 ? 'frente' : posicionPorOrden(i);
  const e = atk.cap.est;
  const factor = pos === 'flanco' ? e.factorFlancoAtaque : pos === 'espalda' ? e.factorEspalda : 1;
  const posicion = factor === 0 ? 0 : MOD_POSICION[pos].ataque;
  return conCeguera(pos, posicion, ki?.area ? SIN_CEGUERA : cegueraContra(atk, def), 'ataque');
}

/** Tamaño (Core p.14): el de la ficha, o Fuerza + Constitución; null si no hay con qué calcularlo. */
function tamanoDe(l: Luchador): number | null {
  const a = l.ficha.atributos;
  const t = l.ficha.tamano || (a?.FUE !== undefined && a?.CON !== undefined ? a.FUE + a.CON : null);
  // Modificar el Tamaño: nunca por debajo de 1 (Core p.186).
  return t === null ? null : Math.max(1, t + (l.bono?.tamano ?? 0));
}

/** El rival es 1 pequeño (la mitad del Tamaño o menos) o 2 diminuto (una décima parte), Tabla 43. */
function rivalChico(l: Luchador, rival: Luchador): 0 | 1 | 2 {
  const yo = tamanoDe(l);
  const el = tamanoDe(rival);
  if (yo === null || el === null) return 0;
  return el * 10 <= yo ? 2 : el * 2 <= yo ? 1 : 0;
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
  /** Efectos de Ki de este ataque (técnica ejecutada o mantenida). Por defecto, los de Asalto activos. */
  ki?: ModKi;
}

/** El Xing Quan da su bono si atacó en su turno, sin defenderse antes, siempre al mismo rival. */
export function aplicaXingQuan(atk: Luchador, def: Luchador, o: OpcionesAtaque): boolean {
  if (!atk.cap.est.xingQuan || o.esContra || atk.defensasHechas > 0) return false;
  // Sólo ataques normales o apuntados (Inutilizar e Inconsciencia también lo son).
  const m = o.maniobra ?? 'normal';
  return (m === 'normal' || esApuntado(m)) && (atk.objetivoUnico === null || atk.objetivoUnico === def);
}

/**
 * Da su +20 contra `def` si `def` no la presenció ni sufrió y no la supera por 60 de habilidad base
 * (Dominus p.86).
 */
/**
 * Penalizador de Sorpresa a la defensa de `def` contra `atk`: por turno (Core p.86), menos lo que anule
 * Previsión contra ese rival (Dominus p.57), o por un ataque camuflado que no advirtió (Dominus p.52).
 */
export function sorpresaDefensa(def: Luchador, atk: Luchador): number {
  let pen = 0;
  if (atk.sorprendeA.has(def)) pen = MOD_SORPRESA_DEFENSA + (def.previsionContra === atk ? Math.min(-MOD_SORPRESA_DEFENSA, def.ki?.activo.prevision ?? 0) : 0);
  if (atk.camufladoA.has(def)) pen = Math.min(pen, MOD_SORPRESA_DEFENSA);
  return pen;
}

export function puedeManiobraEspecial(atk: Luchador, def: Luchador): boolean {
  return atk.cap.est.maniobraEspecial && !atk.maniobraEspecialVista.has(def) && def.ficha.defensa < atk.ficha.ataque + 60;
}

export function ataqueFinal(atk: Luchador, def: Luchador, o: OpcionesAtaque = {}): number {
  const e = atk.cap.est;
  const ki = o.ki ?? atk.ki?.activo;
  const ranura = o.ranura ?? proximaRanura(atk);
  // Los disparos llevan su propio penalizador (recarga o cadencia, en la ranura), no el de los ataques declarados.
  const declarados = ranura.proyectil ? 1 : Math.max(1, o.declarados ?? atk.ataquesDeclarados);
  const perfil = perfilDe(atk, ranura);
  // Selene arcano contraataca "con Habilidad de Ataque plena": esas contras no cuentan como ataques,
  // así que no arrastran el penalizador de los ataques adicionales (Dominus p.39).
  const pen = o.esContra && e.contrasIlimitadas ? 0 : (declarados - 1) * atk.cap.penPorAtaque + ranura.pen;
  // Cada acción activa distinta hecha antes en el asalto resta 25, acumulable (Core p.87).
  // En carga correr no cuenta como acción activa (Core p.90).
  // Acción adicional (Ki): esas acciones activas no restan (Dominus p.56-57).
  const libres = Math.max(ki?.accionesAdicionales ?? 0, atk.ki?.activo.accionesAdicionales ?? 0);
  const activa = PEN_ACCION_ACTIVA * Math.max(0, atk.accionesActivas + (o.conMovimientoActivo && !atk.movioActivo && !atk.cargando ? 1 : 0) - libres);
  // Enemigo pequeño −10, diminuto −20; desaparece con un Ataque en área (Core p.91).
  const chico = o.maniobra === 'area' || ki?.area ? 0 : [0, 10, 20][rivalChico(atk, def)];
  const tipo = o.tipo ?? perfil.tipoAtaque;
  // Ataque elemental o sobrenatural (Ki): ataca en esa TA sin el penalizador del crítico secundario.
  const secundario = tipo !== perfil.tipoAtaque && tipo !== ki?.elemento && !e.criticoSecundarioLibre && !((ranura.sinArmas || atk.cap.desarmado) && e.tablasLibres.includes(tipo)) ? PEN_CRITICO_SECUNDARIO : 0;
  // Ataque Final: +20, y cada punto de cansancio da +20 en vez de +15 (Dominus p.86).
  const porCansancio = atk.modo.ataqueFinal ? 20 : BONO_CANSANCIO;
  return (
    perfil.ataque - pen - activa - penAccion(atk) - secundario - penEspacio(atk, 'ataque') -
    (ranura.sinArmas ? 0 : penDesenfundar(atk, 'ataque')) -
    // Maniobras de combate y apuntar (Ki) reduce el penalizador de la maniobra, hasta 0.
    // Apresamiento (Ki): la Presa no tiene penalizador (Dominus p.64).
    (o.maniobra === 'presa' && ki?.apresamiento ? 0 : Math.max(0, penManiobra(atk, o.maniobra ?? 'normal', !!o.esContra, tipo) - (ki?.precision ?? 0))) +
    (ki ? ki.ataque + (o.esContra ? ki.contraataque : 0) : 0) +
    // Parálisis completa + flanco o espalda se queda en −200 (Dominus p.11, Tabla 1).
    (nivelParalisis(atk) === 3 ? 0 : situacionAtaque(atk, def, ki)) + modEstados(atk).ataque + desequilibrio(atk, def) - chico +
    // Contra un rival derribado y al alcance del cuerpo a cuerpo, la posición superior (Tabla 43, Dominus p.38; Core p.90, decisión del usuario).
    (def.derribado && enAlcance(atk, def) ? BONO_POSICION_SUPERIOR : 0) -
    (atk.previenePendiente.has(def) ? PEN_PREVER_SORPRESA : 0) +
    porCansancio * (o.cansancio ?? 0) + (o.bono ?? 0) +
    (o.esContra ? e.bonoContraataque : 0) +
    propioAtaque(atk) +
    (aplicaXingQuan(atk, def, o) ? e.xingQuan : 0) +
    (atk.godhandListo && e.godhand ? e.godhand.ataque : 0) +
    (o.especial && puedeManiobraEspecial(atk, def) ? 20 : 0) + Math.min(150, o.samiel ?? 0) -
    (o.estadoMushin ? ESTADOS_MUSHIN[o.estadoMushin] : 0) +
    // Amenazado: −20 al atacar a quien lo amenaza (Tabla 43).
    (atk.amenazadoPor === def ? AMENAZADO.ataque : 0) +
    // Marca (Ki): bono contra quien marcó (Dominus p.70); Beso: −120 al ataque (Dominus p.68).
    (def.marcas.size ? def.marcas.get(atk) ?? 0 : 0) -
    (ki && ki.estados.length && ki.estados.some((x) => x.condicion === 'beso') ? 120 : 0)
  );
}

export interface OpcionesDefensa {
  defensasPrevias?: number;
  /** Efectos de Ki del ataque (un Ataque sobrenatural no se puede parar). */
  kiAtk?: ModKi;
  /** Se defiende de un proyectil (Tabla 49): disparado (también una técnica a distancia, Dominus p.57) o lanzado. */
  proyectil?: boolean | 'disparo' | 'lanzamiento';
  /** Suponer que lo atacan desde esta posición (la IA, para quien todavía no se trabó). */
  posicion?: Posicion;
  cansancio?: number;
  resistir?: boolean;
  defensaTotal?: boolean;
  samiel?: number;
  /** Efectos de Ki de esta defensa. Por defecto, los de Asalto activos. */
  ki?: ModKi;
  /** Radio de un ataque en área sobrenatural (un conjuro); el de un área de Ki sale de `kiAtk`. */
  area?: number;
  /** Centro del área (sin dato, el defensor está en el centro: es el blanco). */
  centroArea?: { x: number; y: number };
}

/** Un conjuro de calor, frío o electricidad ("como una descarga ígnea", Core p.100). */
function conjuroElemental(kiAtk?: ModKi): boolean {
  return !!kiAtk?.conjuro && (kiAtk.elemento === 'CAL' || kiAtk.elemento === 'FRI' || kiAtk.elemento === 'ELE');
}

/**
 * Velez arcano, un Ataque sobrenatural de Ki (Dominus p.64) o un conjuro de energía ("descargas mágicas
 * intangibles", Core p.100): sólo lo para quien para energía; con un escudo de energía sí se puede.
 */
function paradaAnulada(def: Luchador, atk: Luchador, kiAtk?: ModKi): boolean {
  return (atk.cap.est.intangible || (!!kiAtk?.sobrenatural && !conjuroElemental(kiAtk))) && (def.ficha.tipoDefensa ?? 'parada') === 'parada' &&
    !def.cap.est.paraEnergia && !(def.escudoKi > 0);
}

/** Fascinación: −20 a las acciones pasivas, como defenderse (Core p.233). */
const PEN_FASCINACION = 20;

/** Parar un conjuro de calor, frío o electricidad sin parar energía: −120 (Core p.100). */
const PEN_PARAR_ELEMENTAL = 120;

/**
 * Ataque en área sobrenatural (Core p.101): pararlo sin parar energía, −120; esquivarlo, −80 si no le
 * alcanza el movimiento del asalto para salir del área. Un escudo sobrenatural no sufre nada de esto.
 */
const PEN_AREA = { parada: 120, esquiva: 80 } as const;

function penArea(def: Luchador, radio: number, campo: 'parada' | 'esquiva', centro?: { x: number; y: number }): number {
  if (campo === 'parada') return def.cap.est.paraEnergia ? 0 : PEN_AREA.parada;
  const salir = radio - (centro ? Math.hypot(def.pos.x - centro.x, def.pos.y - centro.y) : 0);
  return metrosTotales(def) >= salir ? 0 : PEN_AREA.esquiva;
}

/** Los ataques de Velez arcano son invisibles para quien no detecta la energía (ceguera absoluta). */
function noVeElAtaque(def: Luchador, atk: Luchador, kiAtk?: ModKi): boolean {
  return (atk.cap.est.intangible || !!kiAtk?.invisible) && !def.cap.est.veEnergia && !def.ki?.activo.veEnergia;
}


/**
 * Posición y ceguera a la defensa, combinadas según la Tabla 1 del Dominus (p.11): flanco + ceguera
 * absoluta −100 y espalda + ceguera absoluta −120 en vez de sumarse; con parálisis completa quedan en
 * su −200 (ni posición ni ceguera suman más).
 */
function situacionDefensa(def: Luchador, atk: Luchador, pos: Posicion, factorPos: number, campo: 'parada' | 'esquiva', kiAtk?: ModKi): number {
  if (nivelParalisis(def) === 3) return 0;
  const posicion = MOD_POSICION[pos].defensa * factorPos;
  return conCeguera(pos, posicion, cegueraContra(def, atk, noVeElAtaque(def, atk, kiAtk)), campo);
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
  const ki = o.ki ?? def.ki?.activo;
  // Lama, Lama Tsu y la Tabla de 2ª Arma: Estilo Defensivo eximen algunas defensas; Defensa
  // adicional (Ki) también (Dominus p.56).
  const libres = def.cap.defensasLibres + (def.estiloDefensivo ? 1 : 0) +
    Math.max(ki?.defensasAdicionales ?? 0, def.ki?.defensasLibres ?? 0);
  // Un escudo de energía no sufre los penalizadores por defensas adicionales (Core p.100, Dominus p.66).
  const escudo = def.escudoKi > 0 || (ki?.escudo ?? 0) > 0;
  // Al retirarse con un Transporte automático, defensa plena: sin defensas previas ni posición (Dominus p.59).
  const plena = def.defensaPlena;
  const previas = escudo || plena ? 0 : Math.max(0, (o.defensasPrevias ?? def.defensasHechas) - libres);
  const total = o.defensaTotal ?? def.defensaTotal;
  // Al retirarse, quien lo ataca lo tiene de flanco, salvo Uroboros (Core p.94, Dominus p.79).
  // Flanco y espalda son lugares alrededor del rodeado: un ataque a distancia o en área de quien no está
  // trabado con él llega de frente (Core p.90).
  const deLejos = (o.proyectil || o.area || o.kiAtk?.area || o.kiAtk?.distancia) && !def.trabados.includes(atk);
  const pos = plena || deLejos ? 'frente' : def.huyendo && !e.retiradaSinFlanco ? 'flanco' : o.posicion ?? posicionDe(atk, def);
  const factorPos = pos === 'flanco' ? e.factorFlanco : pos === 'espalda' ? e.factorEspalda : 1;
  const est = modEstados(def);
  const campo = (def.ficha.tipoDefensa ?? 'parada') === 'parada' ? 'parada' : 'esquiva';
  // Sorprendido con el arma enfundada: no puede desenfundar y se defiende sin ella (Tabla 43).
  const sinArma = def.enfundada && atk.sorprendeA.has(def) && def.ficha.sinArmas;
  const base = sinArma ? def.ficha.sinArmas!.defensa : def.ficha.defensa;
  let h =
    base - penDefensaAdicional(previas) - penAccion(def) - penEspacio(def, campo) -
    (sinArma ? 0 : penDesenfundar(def, campo)) +
    situacionDefensa(def, atk, pos, factorPos, campo, o.kiAtk) + desequilibrio(def, atk) -
    // Parar a un enemigo diminuto: −10 (Tabla 43).
    (campo === 'parada' && rivalChico(def, atk) === 2 ? 10 : 0) +
    ((def.ficha.tipoDefensa ?? 'parada') === 'parada' ? est.parada : est.esquiva) +
    sorpresaDefensa(def, atk) -
    (def.previenePendiente.has(atk) ? PEN_PREVER_SORPRESA : 0) +
    (total ? e.bonoDefensaTotal : 0) + BONO_CANSANCIO * (o.cansancio ?? 0) +
    propioDefensa(def) +
    Math.min(150, o.samiel ?? 0) + (ki ? (campo === 'parada' ? ki.parada : ki.esquiva) : 0) +
    // Amenazado: −120 a defenderse de quien lo amenaza (Tabla 43), salvo Hanja arcano (Dominus p.44).
    (def.amenazadoPor === atk && !e.defensaSinParalisis ? AMENAZADO.parada : 0);
  // Contra un proyectil disparado (Tabla 49, Core p.96); un escudo sobrenatural no lo sufre (p.100).
  if (o.proyectil && !escudo) h -= penDefensaProyectil(campo, esMaestro(def.ficha.defensa), o.proyectil === 'lanzamiento' ? 'lanzamiento' : 'disparo', !!def.ficha.escudo);
  if (paradaAnulada(def, atk, o.kiAtk)) h = Math.min(h, 0);
  else if (campo === 'parada' && conjuroElemental(o.kiAtk) && !def.cap.est.paraEnergia && !escudo) h -= PEN_PARAR_ELEMENTAL;
  const area = o.area ?? o.kiAtk?.area ?? 0;
  if (area > 0 && !escudo) h -= penArea(def, area, campo, o.centroArea);
  // Fascinado: −20 a las acciones pasivas (Core p.233).
  if (def.fascinado) h -= PEN_FASCINACION;
  if (o.resistir) h = Math.max(0, h - PEN_RESISTIR_GOLPE);
  return h;
}

/**
 * Cuánta TA le resta el ataque: la calidad del arma (un proyectil, la suya), Hakyoukuken y Destruir
 * armadura del Ki, que se acumulan (Dominus p.60).
 */
function reduccionTA(def: Luchador, atk: Luchador, r: Ranura, t: TipoAtaque, zona: ZonaArmadura, ki?: ModKi): number {
  // Un proyectil resta la TA por su propia calidad, no por la del arma cuerpo a cuerpo.
  return atk.cap.reduccionTA - (r.sinArmas || r.proyectil ? atk.cap.reduccionTAArma : 0) +
    (r.proyectil ? Math.floor((r.proyectil.calidad ?? 0) / 5) : 0) +
    reduccionHakyoukuken(def, atk, t, zona) + (ki?.reduccionTA ?? 0);
}

/**
 * Daño que le hace un golpe a un escudo sobrenatural (mágico, psíquico o de energía): su daño base, +10
 * por cada punto de TA que reste el ataque, venga de donde venga, y +200 si es Sin armadura (Dominus
 * p.13, p.60).
 */
export function danoAEscudo(atk: Luchador, def: Luchador, esContra: boolean, ranura: Ranura, ki?: ModKi, tipo?: TipoAtaque): number {
  const t = tipo ?? perfilDe(atk, ranura).tipoAtaque;
  return danoBase(atk, def, esContra, ranura, ki) + 10 * Math.max(0, reduccionTA(def, atk, ranura, t, 'cuerpo', ki)) + (ki?.sinArmadura ? 200 : 0);
}

/**
 * TA del defensor menos lo que le resta el ataque; no baja de 0. Derribo, Presa y Desarmar se
 * resuelven siempre contra TA 0 (Core p.91).
 */
export function absorcionContra(
  def: Luchador, atk: Luchador, maniobra: Maniobra = 'normal', tipo?: TipoAtaque, ranura?: Ranura,
  ki: ModKi | undefined = atk.ki?.activo, kiDef: ModKi | undefined = def.ki?.activo,
): number {
  if (esManiobraDeControl(maniobra)) return absorcion(0);
  const r = ranura ?? proximaRanura(atk);
  const t = tipo ?? perfilDe(atk, r).tipoAtaque;
  // Armadura (Ki): una capa más contra todo, energía incluida, salvo la Armadura física (Dominus p.60-61).
  const extra = kiDef?.ta && !(kiDef.taFisica && t === 'ENE') ? kiDef.ta : 0;
  // Destruir armadura "Sin armadura" ignora toda la TA; la Inmodificable queda a la mitad (Dominus p.60-61).
  if (ki?.sinArmadura) return absorcion(kiDef?.taInmodificable ? Math.ceil(extra / 2) : 0);
  const zona = zonaDe(maniobra);
  const reduccion = reduccionTA(def, atk, r, t, zona, ki);
  let ta = taZona(def.ficha, zona, t);
  // Armadura de energía mayor apagada (TA 2) o arcana subida a TA 6 (Dominus p.19).
  if (t === 'ENE') ta = Math.max(0, ta + ajusteTaEnergia(def));
  // La capa del Ki: la mayor más la mitad de la otra (Core p.83).
  if (extra) ta = Math.max(ta, extra) + Math.floor(Math.min(ta, extra) / 2);
  // Armadura mágica (Armadura de Luz): otra capa, igual (Core p.83, p.127).
  const magica = def.magia?.armadura ? taMagica(def, t) : 0;
  if (magica) ta = Math.max(ta, magica) + Math.floor(Math.min(ta, magica) / 2);
  // Protección Final, Campeón: +TA contra todo (Arcana p.35).
  ta += def.bono?.ta ?? 0;
  // Inmodificable: lo que reste el ataque no baja la TA de la técnica (Dominus p.61).
  const abs = absorcion(Math.max(0, ta - reduccion, kiDef?.taInmodificable ? extra : 0));
  // Un ser con acumulación sorprendido recibe el golpe de lleno: Absorción a la mitad (Core p.99).
  return def.ficha.acumulacion && atk.sorprendeA.has(def) ? Math.floor(abs / 2) : abs;
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
export function combinarTA(capas: CapaArmadura[], t: TipoAtaque): number {
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
/** Tipos de ataque elementales: los de Fuego, Aire y Agua (Dominus p.63). */
const ELEMENTALES: ReadonlySet<TipoAtaque> = new Set(['CAL', 'ELE', 'FRI']);

export function danoBase(atk: Luchador, def: Luchador, esContra = false, ranura?: Ranura, ki: ModKi | undefined = atk.ki?.activo): number {
  const e = atk.cap.est;
  let arma = perfilDe(atk, ranura ?? proximaRanura(atk)).danoBase;
  if (ki) {
    // Sustitución de Daño reemplaza el del arma; un ataque en área de Ki puede usar el doble de la
    // Presencia base más el bono de Poder (Dominus p.55, p.58). El multiplicador va antes de sumar
    // cualquier otro bono (p.55).
    if (ki.danoFijo) arma = ki.danoFijo;
    if (ki.area || ki.distancia) arma = Math.max(arma, 2 * presenciaBase(atk.ficha) + bonoCaracteristica(atributo(atk, 'POD')));
    arma = arma * ki.multDano + ki.dano;
    // Dañar energía o Ataque elemental en quien ya lo hace por sí mismo (su habilidad o su arma): +10
    // al daño base de la técnica (Dominus p.63).
    if (ki.danaEnergia && atk.cap.danaEnergia) arma += 10;
    // Daño límite: + los PV que ya perdió; no con acumulación (Dominus p.54).
    if (ki.danoLimite && !atk.ficha.acumulacion) arma += Math.max(0, atk.ficha.pv - atk.pv);
    if (ki.elemento && !ki.conjuro && ELEMENTALES.has(perfilDe(atk, ranura ?? proximaRanura(atk)).tipoAtaque)) arma += 10;
    // Afinidad elemental (Sangre de Aeon): +10 a sus ataques de Ki o Magia en su elemento (Dominus p.76).
    if (ki.elemento && ki.elemento === e.elementoAfin) arma += 10;
  }
  let d = arma + bonoVariable(atk, 'dano');
  // Conjuros de Guerra (Destrucción Desencadenada, Campeón): al daño de sus ataques, no de los conjuros.
  if (atk.bono?.dano && !ki?.conjuro) d += atk.bono.dano;
  if (atk.godhandListo && e.godhand) d += e.godhand.dano;
  // Aikido: en un contraataque suma 2× (supremo 4×) el bono de FUE del rival, mínimo +5 (Dominus p.31).
  if (esContra && e.aikidoMultiplicadorFue)
    d += Math.max(5, e.aikidoMultiplicadorFue * bonoCaracteristica(atributo(def, 'FUE')));
  return d;
}

/**
 * Cuerpo a Fuego (Core p.158): el golpe no lo daña si no es de energía, frío o agua, ni de quien daña
 * energía (los conjuros no cuentan como tales: sólo los de energía, Core p.122).
 */
export function inmuneAlGolpe(def: Luchador, atk: Luchador, tipo: TipoAtaque, ki?: ModKi): boolean {
  if (!def.bono?.cuerpoFuego || tipo === 'ENE' || tipo === 'FRI') return false;
  return ki?.conjuro || !(atk.cap.danaEnergia || ki?.danaEnergia);
}

/** Inmunidad contra el Fuego: −5 al daño base de un ataque de calor por intensidad (Core p.156). */
export function reduccionFuego(def: Luchador, tipo: TipoAtaque): number {
  return tipo === 'CAL' ? 5 * (def.bono?.inmuneFuego ?? 0) : 0;
}

/** La barrera de daño del defensor frena el ataque: daño base menor y no daña energía. */
export function barreraFrena(def: Luchador, atk: Luchador, base = atk.ficha.danoBase, ki: ModKi | undefined = atk.ki?.activo): boolean {
  return def.cap.barrera > 0 && !atk.cap.danaEnergia && !ki?.danaEnergia && base < def.cap.barrera;
}

const RANURA_COMUN: Ranura = { pen: 0, sinArmas: false };

/** El próximo ataque del asalto que usaría (un ataque declarado común si no le queda ninguno). */
export function proximaRanura(l: Luchador): Ranura {
  return l.planAtaques[l.planAtaques.length - l.ataquesRestantes] ?? RANURA_COMUN;
}

/** Habilidad, daño y crítico con los que hace un ataque: el arma, o el perfil sin armas para la patada. */
export function perfilDe(l: Luchador, ranura: Ranura): { ataque: number; danoBase: number; tipoAtaque: TipoAtaque } {
  const leo = l.cap.est.leo;
  if (ranura.bala && leo) return { ataque: l.ficha.ataque, danoBase: leo.dano, tipoAtaque: leo.tipo };
  const p = ranura.proyectil;
  // Más allá del alcance efectivo el proyectil hace la mitad de daño (Core p.95).
  if (p) return { ataque: p.ataque, danoBase: ranura.lejos ? Math.floor(p.danoBase / 2) : p.danoBase, tipoAtaque: p.tipoAtaque };
  const s = l.ficha.sinArmas;
  if (ranura.sinArmas && s) return s;
  // Arma Ígnea: el arma ataca en calor como crítico primario, con más daño (Core p.157).
  const b = l.bono;
  if (b?.tipoArma) return { ataque: l.ficha.ataque, danoBase: l.ficha.danoBase + (b.danoArma ?? 0), tipoAtaque: b.tipoArma };
  return l.ficha;
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
  /** Efectos de Ki del atacante en este ataque y del defensor (por defecto, sus efectos de Asalto). */
  ki?: ModKi;
  kiDef?: ModKi;
  /** Radio de un ataque en área sobrenatural (un conjuro; el de Ki sale de `ki`): dobla el daño contra la acumulación. */
  area?: number;
}

/**
 * ¿El golpe va a un punto vulnerable (critica con 1/10 de los PV, Core p.97)? Un ataque apuntado,
 * salvo contra Sangre eterna o la acumulación; contra la acumulación, todo el cuerpo lo es para Ojos
 * de la Muerte y el crítico automático (Dominus p.78, p.71) y para Enuth arcano (Dominus p.43).
 */
export function golpeAPuntoVulnerable(atk: Luchador, def: Luchador, m: Maniobra, ki?: ModKi): boolean {
  if (!def.ficha.acumulacion) return esApuntado(m) && !def.cap.est.sangreEterna;
  return atk.cap.est.criticoAutomatico || !!ki?.criticoAuto || atk.cap.est.enuth >= 3;
}

/** Lo que comparten `pronostico` y `danoEsperado`: tabla, ventaja, absorciones y daño base. */
function preparar(atk: Luchador, def: Luchador, habAtaque: number, habDefensa: number, o: OpcionesPronostico) {
  const m = o.maniobra ?? 'normal';
  const kiDef = o.kiDef ?? def.ki?.activo;
  const abs = absorcionContra(def, atk, m, o.tipo, o.ranura, o.ki, kiDef);
  let base = danoBase(atk, def, o.esContra, o.ranura, o.ki);
  // Derribo y Presa dañan a la mitad (contra la armadura real) si el atacante quiere; Desarmar no daña.
  if (m === 'desarmar') base = 0;
  else if ((m === 'derribo' || m === 'presa') && !atk.cap.est.danoCompletoEnPresa) base = Math.floor(base / 2);
  if (o.factorDano !== undefined) base = Math.floor(base * o.factorDano);
  if (def.bono?.inmuneFuego) base = Math.max(0, base - reduccionFuego(def, o.tipo ?? perfilDe(atk, o.ranura ?? proximaRanura(atk)).tipoAtaque));
  const absDano = esManiobraDeControl(m) ? absorcionContra(def, atk, 'normal', o.tipo, o.ranura, o.ki, kiDef) : abs;
  const nulo = base === 0 || barreraFrena(def, atk, base, o.ki) ||
    (!!def.bono?.cuerpoFuego && inmuneAlGolpe(def, atk, o.tipo ?? perfilDe(atk, o.ranura ?? proximaRanura(atk)).tipoAtaque, o.ki ?? atk.ki?.activo));
  // Un área sobrenatural contra un ser con acumulación: el doble de daño (Core p.99).
  if (areaDoblaDano(atk, def, m, o.area, o.ki)) base *= 2;
  // Porcentaje desde el que critica, como `aplicarDano` (combate.ts): Ojos de la Muerte y el crítico
  // automático de Ki critican en cuanto dañan (Dominus p.78, p.71); un punto vulnerable con 1/10 de
  // los PV (Core p.97), y con Ojos todo el cuerpo de un ser con acumulación lo es; si no, la mitad.
  const ojos = atk.cap.est.criticoAutomatico || !!o.ki?.criticoAuto;
  const acumula = !!def.ficha.acumulacion;
  const vulnerable = golpeAPuntoVulnerable(atk, def, m, o.ki);
  // Critica con el daño pleno: el de Inutilizar e Inconsciencia antes de reducirlo a la mitad.
  const pleno = base / (o.factorDano || 1);
  const pctCritico = ojos && !acumula ? 10 : porcentajePara(vulnerable ? def.pv / 10 : def.pv / 2, pleno);
  return { t: tablaPara(atk, def), s: habAtaque - habDefensa, abs, absDano, base, nulo, pctCritico };
}

/** Pronóstico de un ataque a partir de las habilidades finales (sin dados). */
export function pronostico(
  atk: Luchador, def: Luchador, habAtaque: number, habDefensa: number, o: OpcionesPronostico = {},
): Pronostico {
  return pronosticoDesde(preparar(atk, def, habAtaque, habDefensa, o), def, habAtaque - habDefensa);
}

/** `pronostico` a partir de una preparación ya hecha (`preparacionCon`) y la ventaja `s`. */
export function pronosticoDesde(p: Preparacion, def: Luchador, s: number): Pronostico {
  const { t, abs, absDano, base, nulo, pctCritico } = p;
  const pContra = def.ficha.acumulacion ? 0 : t.pContra(s);
  return {
    dano: nulo ? 0 : (t.porcentajeEsperado(s, absDano) * base) / 100,
    pImpacto: t.pImpacto(s),
    pContra,
    bonoContra: pContra > 0 ? t.bonoContraEsperado(s) / pContra : 0,
    pBaja: nulo ? 0 : def.pv > 0 ? t.pPorcentajeAlMenos(s, absDano, porcentajePara(def.pv, base)) : 1,
    pCritico: nulo || def.pv <= 0 ? 0 : t.pPorcentajeAlMenos(s, absDano, pctCritico),
    pManiobra: t.pPorcentajeAlMenos(s, abs, 10),
  };
}

/** Lo de `preparar` que no depende de las habilidades: se puede reusar mientras nada cambie. */
export type Preparacion = Omit<ReturnType<typeof preparar>, 's'>;

/** `preparar` con las opciones por defecto, para reusar con distintas habilidades (`danoCon`). */
export function preparacion(atk: Luchador, def: Luchador): Preparacion {
  return preparar(atk, def, 0, 0, {});
}

/** `preparar` con estas opciones, para pronosticar con distintas habilidades (`pronosticoDesde`). */
export function preparacionCon(atk: Luchador, def: Luchador, o: OpcionesPronostico): Preparacion {
  return preparar(atk, def, 0, 0, o);
}

/** El daño esperado de `danoEsperado` con opciones por defecto, a partir de su preparación. */
export function danoCon(p: Preparacion, s: number): number {
  return p.nulo ? 0 : (p.t.porcentajeEsperado(s, p.absDano) * p.base) / 100;
}

/** Sólo el daño esperado de `pronostico`, sin calcular (ni crear) el resto. */
export function danoEsperado(
  atk: Luchador, def: Luchador, habAtaque: number, habDefensa: number, o: OpcionesPronostico = {},
): number {
  const { t, s, absDano, base, nulo } = preparar(atk, def, habAtaque, habDefensa, o);
  return nulo ? 0 : (t.porcentajeEsperado(s, absDano) * base) / 100;
}

// --------------------------------------------------------------------------- a distancia (Core p.94-96)

/**
 * Línea de visión de `a` a `b` en el mapa: las paredes la cortan; un cuerpo en medio (o la esquina de
 * una pared) da cobertura. Sin mapa siempre se ve.
 */
export function visionEntre(luchadores: readonly Luchador[], a: Luchador, b: Luchador): Vision {
  const m = a.mapa;
  if (!m) return 'libre';
  let cuerpos: Set<number> | null = null;
  for (const x of luchadores)
    if (x !== a && x !== b && activo(x)) (cuerpos ??= new Set()).add(indice(m, x.pos));
  return lineaDeVision(m, a.pos, b.pos, cuerpos ? (i) => cuerpos!.has(i) : undefined);
}

/** Cobertura del blanco (Tabla 47): −40. */
export const PEN_COBERTURA = 40;

/**
 * Tabla 47 (Core p.94-96) para un disparo o lanzamiento de `atk` a `def` con `arma`: moverse,
 * cobertura, cambiar de blanco, la velocidad del blanco, haberse defendido, pasar el alcance
 * efectivo, apuntar y disparar a bocajarro. `lejos`: más allá del alcance efectivo (mitad de daño).
 */
export function modProyectil(atk: Luchador, def: Luchador, arma: ArmaDistancia, vision: Vision): { bono: number; lejos: boolean } {
  const metros = distancia(atk, def);
  const bocajarro = enAlcance(atk, def);
  const lejos = !bocajarro && metros > arma.alcance;
  let bono = 0;
  const total = metrosTotales(atk);
  if (atk.metrosMovidos >= total && total > 0) bono -= 50;
  else if (atk.metrosMovidos > total / 4) bono -= 10;
  if (vision === 'cobertura' && !bocajarro) bono -= PEN_COBERTURA;
  if ((atk.ultimoBlanco && atk.ultimoBlanco !== def) || (atk.apuntando && atk.apuntando.blanco !== def)) bono -= 10;
  if (def.metrosMovidos > 0) bono += modVelocidadBlanco(def.ficha.tipoMovimiento);
  if (atk.defensasHechas > 0) bono -= 40;
  if (lejos) bono -= 30;
  if (atk.apuntando?.blanco === def) bono += 10 * Math.min(3, atk.apuntando.asaltos);
  if (bocajarro) bono += 30;
  if (atk.entorno.escasaVisibilidad && !bocajarro) bono -= 20;
  // Blanco grande: más de 2,5 m (Tamaño 22, Tabla 3); no contra acumulación (Core p.95).
  if ((tamanoDe(def) ?? 0) >= 22 && !def.ficha.acumulacion) bono += 30;
  return { bono, lejos };
}

/** Hasta dónde llega: el doble del alcance efectivo (Core p.95). */
export function alcanceMaximo(arma: ArmaDistancia): number {
  return 2 * arma.alcance;
}

// --------------------------------------------------------------------------- magia (Core p.118)

/**
 * Proyección Mágica para lanzar un conjuro de ataque o anímico contra `def`: no sufre ninguno de los
 * penalizadores del combate (ataques adicionales, proyectiles, posición) salvo los negativos a toda
 * acción y la ceguera; +40 si lo toca (Core p.118, p.100). Un bono a toda acción (Campeón, la Luna) no
 * la sube (Core p.232).
 */
export function ataqueMagico(atk: Luchador, def: Luchador): number {
  const m = atk.ficha.magia!;
  return m.proyeccion - Math.max(0, penAccion(atk)) + conCeguera('frente', 0, cegueraContra(atk, def), 'ataque') +
    (enAlcance(atk, def) ? 40 : 0);
}

/**
 * Defensa con un escudo mágico: su Proyección Mágica, sin penalizadores por defensas adicionales ni
 * por proyectiles; sólo los negativos a toda acción, la sorpresa, estar amenazado y la ceguera (Core
 * p.100, p.118).
 */
export function defensaEscudoMagico(def: Luchador, atk: Luchador, kiAtk?: ModKi): number {
  const m = def.ficha.magia!;
  return (m.proyeccionDefensa ?? m.proyeccion) - Math.max(0, penAccion(def)) +
    conCeguera('frente', 0, cegueraContra(def, atk, noVeElAtaque(def, atk, kiAtk)), 'parada') +
    sorpresaDefensa(def, atk) +
    (def.amenazadoPor === atk ? AMENAZADO.parada : 0) - (def.fascinado ? PEN_FASCINACION : 0) -
    // Con acumulación de daño, −80 a la Proyección para usar un escudo mágico (Core p.99).
    (def.ficha.acumulacion ? 80 : 0);
}

/** Bono de la Frialdad (con lo que le sume Moral) a resistir efectos sobre el ánimo (Core p.54, Tabla 13). */
export function frialdadDe(l: Luchador): number {
  return bonoFrialdad(conIncremento(l.ficha.frialdad ?? 0, l.ki?.activo.frialdad ?? 0) + (l.bono?.frialdad ?? 0));
}

// --------------------------------------------------------------------------- Resistencias

/**
 * RF de la ficha. La de la planilla ya trae el +10 de Dominio físico (Dominus p.22): no se vuelve a
 * sumar. Las Resistencias no sufren el negativo a toda acción (Core p.232).
 */
export function rfBase(l: Luchador): number {
  return l.ficha.rf;
}

/**
 * RF con lo que la sube durante el combate: Incremento de Resistencia Física del Ki (Dominus p.61) y
 * el "+ a todas las Resistencias" de un conjuro (Protección Final, Arcana p.35).
 */
export function rfDe(l: Luchador): number {
  return rfBase(l) + (l.ki?.activo.rf ?? 0) + (l.bono?.resistencias ?? 0);
}

/** RF contra un crítico: con los bonos que sólo valen contra críticos. */
export function rfCritico(l: Luchador): number {
  return rfDe(l) + l.cap.est.bonoRfCritico;
}

/**
 * Bono a las Resistencias contra el calor: el de Cuerpo a Fuego y +5 por cada intensidad de calor a la
 * que es inmune (Inmunidad contra el Fuego, Core p.156, p.158).
 */
export function resistenciaCalor(l: Luchador): number {
  // Afinidad elemental al Fuego: +20 a las Resistencias contra él (Dominus p.76).
  return (l.bono?.resCalor ?? 0) + 5 * (l.bono?.inmuneFuego ?? 0) + (l.cap.est.elementoAfin === 'CAL' ? 20 : 0);
}

/** TA de la armadura mágica contra ese tipo de ataque (0 sin armadura). */
export function taMagica(l: Luchador, tipo: string): number {
  const a = l.magia?.armadura;
  return a ? (tipo === 'ENE' ? a.energia : a.resto) : 0;
}

/** Tamaño humano o menor: el tope de lo que cubre la mitad de un arma grande (Core p.99, decisión del usuario). */
const TAMANO_HUMANO = 22;

/**
 * Un ataque en área le hace el doble de daño a un ser con acumulación si cubre la mitad de su cuerpo
 * (Core p.99): uno sobrenatural (un conjuro, un área de Ki), o la maniobra con un arma grande (la que
 * alcanza a cinco: Grande, Capoeira, Área excepcional) contra un ser de Tamaño humano o menor.
 */
export function areaDoblaDano(atk: Luchador, def: Luchador, maniobra: Maniobra, area?: number, ki?: ModKi): boolean {
  if (!def.ficha.acumulacion) return false;
  if (area || ki?.area) return true;
  return maniobra === 'area' && atk.cap.est.blancosArea >= 5 && (tamanoDe(def) ?? 0) <= TAMANO_HUMANO;
}

/** Índice de un luchador, para el registro. */
export const nro = (ctx: { luchadores: Luchador[] }, l: Luchador) => ctx.luchadores.indexOf(l);

/**
 * Lo que el atacante le suma al crítico: Crítico incrementado, estilos (Moai Thai, Hakyoukuken), el bono
 * a los puntos vitales, Enuth para dejar inconsciente (+20, arcano +50, Dominus p.43) y Potenciar
 * Crítico del Ki (Dominus p.70). Lo usan el motor y la IA.
 */
export function bonoCriticoDe(atk: Luchador, m: Maniobra, bonoKi = 0): number {
  const e = atk.cap.est;
  const vital = m === 'cabeza' || m === 'corazon';
  const enuth = m === 'inconsciencia' ? (e.enuth >= 3 ? 50 : e.enuth >= 1 ? 20 : 0) : 0;
  // Ojos de la Muerte apuntando a las líneas existenciales: +40 al nivel del crítico (Dominus p.78).
  const lineas = m === 'lineas' ? 40 : 0;
  return atk.cap.bonoCritico + e.bonoCriticoEstilos + (vital ? e.bonoCriticoVital : 0) + enuth + lineas + bonoKi;
}

