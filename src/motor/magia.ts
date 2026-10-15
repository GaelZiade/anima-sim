// Magia en combate (Core cap. 11, p.117-123): zeon, acumulación, lanzar y mantener conjuros, y lo que
// queda activo de ellos (escudo y armadura mágicos).

import type { Luchador } from './modelo';
import { conjurosDe, esEspecialista, gradosPosibles, type EfectoConjuro, type BonoMagico, type Conjuro, type Grado } from './conjuros';
import type { Rng } from './rng';
import { tirarD100 } from './dados';
import { atributo, bonoCaracteristica } from './maniobras';
import { penAccion } from './calculos';
import { umbralPifia, type TipoAtaque } from './reglas';
import { SIN_KI, type ModKi } from './ki';
import type { Ranura } from './rasgos';

/** Un conjuro mantenido: lo paga cada asalto de la reserva, sin tocar el ACT (Core p.121). */
export interface Mantenido {
  conjuro: Conjuro;
  grado: number;
  /** A quiénes beneficia (conjuros de efecto sobre otros). */
  blancos?: Luchador[];
  /** Zona estática donde sigue actuando (Tormenta de Fuego) y a quiénes deja fuera (Control del Espacio). */
  zona?: { x: number; y: number; radio: number; desde: number; excluye: 'aliados' | 'nadie' };
  /** Innato: se mantiene sin gastar zeon (Core p.117). */
  innato?: boolean;
  /** Lo que deshace al dejar de mantenerlo (lazos, éxtasis, una mina sin estallar). */
  alTerminar?: () => void;
  /** Muro de fuego: el segmento que no se puede cruzar sin recibir su ataque (Barrera de Fuego). */
  muro?: { x1: number; y1: number; x2: number; y2: number };
}

/** Lo que decide al empezar el asalto (Core p.117, Arcana p.27, Core p.159). */
export interface PlanMagia {
  /** Acumula su ACT este asalto. */
  acumula: boolean;
  /** Prepara un conjuro determinado: el ACT va sólo a él (Core p.117). */
  preparar?: { conjuro: Conjuro; grado: number } | null;
  /** Puntos de cansancio que gasta para subir el ACT (+15, o lo que dé Explotación de la Energía Física). */
  cansancio?: number;
  /** Zeon de la reserva que gasta con Sacrificio de Poder: +5 al ACT cada 10 (Core p.159). */
  sacrificioPoder?: number;
  /** PV que sacrifica con Consumir Vida por Magia: 100 de zeon cada 5 (Core p.159). */
  consumirVida?: number;
  /** Este asalto lanza un conjuro innato: no acumula ni lanza otros (Core p.117). */
  innato?: boolean;
  /** Le pasa zeon a un aliado con el Don, en vez de acumular (Core p.117). */
  transferir?: { a: Luchador; zeon: number };
}

/** Un conjuro determinado que prepara o ya tiene listo (Core p.117). */
export interface Preparado {
  conjuro: Conjuro;
  grado: number;
  /** Zeon reunido para él. */
  zeon: number;
  /** Asaltos que lleva listo, sin lanzarlo (lo sostiene tantos como su Poder). */
  esperando: number;
}

/**
 * Un beneficio sobrenatural activo sobre alguien: de quién viene, qué lo da y qué le da. Es la entrada
 * única de los bonos sobrenaturales (conjuros hoy; poderes psíquicos o técnicas mañana): todo lo que
 * calcula ataque, defensa, turno, TA o Resistencias ya lee la suma (`l.bono`).
 */
export interface Bendicion {
  fuente: Luchador;
  /** Lo que lo da (un conjuro, un poder…): el mismo origen de la misma fuente no se acumula. */
  origen: OrigenBono;
  bono: BonoMagico;
}

/** Cualquier cosa con nombre que dé un beneficio. */
export interface OrigenBono {
  readonly nombre: string;
}

export interface EstadoMagia {
  /** Zeon que le queda, con lo acumulado incluido. */
  reserva: number;
  /** Zeon acumulado para lanzar (Core p.117). */
  acumulado: number;
  /** Lo que acumuló este asalto (si hace otra cosa, queda la mitad). */
  ganado: number;
  acumulando: boolean;
  /** Lanzó al menos un conjuro este asalto: al terminarlo, lo que sobra vuelve a la reserva. */
  lanzo: boolean;
  conjuros: Conjuro[];
  mantenidos: Mantenido[];
  /** Escudo mágico activo: resistencia que le queda. */
  escudo: { conjuro: Conjuro; grado: number; resistencia: number } | null;
  /** Armadura mágica activa: TA contra energía y contra el resto (una capa más, sin penalizar el turno). */
  armadura: { energia: number; resto: number } | null;
  /** Hizo este asalto algo que no es lanzar conjuros (atacar, defenderse sin escudo, moverse): ACT a la mitad. */
  otraAccion: boolean;
  /** Conjuro determinado que prepara o tiene listo. Su zeon está en la reserva, aparte de lo acumulado. */
  preparado: Preparado | null;
  /** Este asalto usa la magia innata (no acumula ni lanza otros conjuros). */
  innato: boolean;
  /** A dónde fue lo acumulado este asalto: magia pura o el conjuro preparado. */
  ganadoEn: 'puro' | 'preparado';
}

export function crearEstadoMagia(l: Luchador): EstadoMagia | null {
  const m = l.ficha.magia;
  if (!m || m.zeon <= 0) return null;
  const conjuros = conjurosDe(m);
  if (!conjuros.length) return null;
  return {
    reserva: m.zeon, acumulado: 0, ganado: 0, acumulando: false, lanzo: false, conjuros, mantenidos: [],
    escudo: null, armadura: null, otraAccion: false, preparado: null, innato: false, ganadoEn: 'puro',
  };
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

/** Lo que pierde al soltar lo acumulado sin usarlo: 10 de zeon (Core p.117). */
const PERDIDA_AL_SOLTAR = 10;

function soltar(e: EstadoMagia) {
  if (e.acumulado <= 0) return;
  e.reserva = Math.max(0, e.reserva - Math.min(PERDIDA_AL_SOLTAR, e.acumulado));
  e.acumulado = 0;
}

/** ACT extra por cada punto de cansancio: +15, o +25 / +40 con Explotación de la Energía Física (Arcana p.27). */
export function actPorCansancio(l: Luchador): number {
  const n = l.ficha.magia?.explotacion ?? 0;
  return n >= 2 ? 40 : n === 1 ? 25 : 15;
}

/** Zeon de valor máximo que puede lanzar como innato según su ACT (Tabla 58, Core p.117). */
export function maximoInnato(act: number): number {
  if (act < 10) return 0;
  if (act <= 50) return 10;
  if (act <= 70) return 20;
  if (act <= 90) return 30;
  if (act <= 110) return 40;
  if (act <= 130) return 50;
  if (act <= 150) return 60;
  if (act <= 180) return 70;
  if (act <= 200) return 80;
  return 90;
}

/**
 * Su ACT con los negativos: la mitad del negativo a toda acción, redondeada hacia arriba en grupos de 5;
 * los bonos a toda acción no lo suben (Core p.232).
 */
export function actDe(l: Luchador): number {
  const pen = Math.ceil(Math.max(0, penAccion(l)) / 10) * 5;
  return Math.max(0, l.ficha.magia!.act - pen);
}

/** Su ACT este asalto preparando ese conjuro: +10 si es su Conjuro Especialista (Arcana p.30). */
export function actPara(l: Luchador, c?: Conjuro | null): number {
  return actDe(l) + (c && esEspecialista(c, l.ficha.magia) ? 10 : 0);
}

/** Zeon libre de la reserva: lo que no está acumulado ni en un conjuro preparado. */
export function zeonLibre(e: EstadoMagia): number {
  return e.reserva - e.acumulado - (e.preparado?.zeon ?? 0);
}

/**
 * Comienzo del asalto: paga los mantenidos (de la reserva, sin usar lo acumulado; el que no pueda
 * pagar se cae; los innatos y los diarios no cuestan) y acumula según el plan: magia pura o un conjuro
 * determinado, con lo que sumen el cansancio y Sacrificio de Poder, sin pasar la reserva. Si deja de
 * acumular magia pura, lo acumulado vuelve a la reserva menos 10 (Core p.117). Un conjuro listo se
 * sostiene tantos asaltos como su Poder; después vuelve a la reserva menos 10.
 */
export function empezarAsaltoMagia(l: Luchador, plan: PlanMagia | boolean) {
  const e = l.magia;
  if (!e) return;
  const p: PlanMagia = typeof plan === 'boolean' ? { acumula: plan } : plan;
  e.lanzo = false;
  e.ganado = 0;
  e.otraAccion = false;
  e.innato = !!p.innato;
  // Consumir Vida por Magia: PV por zeon a la reserva (Core p.159).
  if (p.consumirVida) {
    l.pv -= p.consumirVida;
    e.reserva += (p.consumirVida / 5) * 100;
  }
  e.mantenidos = e.mantenidos.filter((x) => {
    // Un beneficio cuyos blancos ya cayeron no se sigue pagando.
    if (x.blancos?.length && !x.blancos.some((b) => b.estado === 'activo')) {
      quitarEfecto(e, x, l);
      return false;
    }
    const coste = x.innato ? 0 : x.conjuro.grados[x.grado].mantenimiento ?? 0;
    if (zeonLibre(e) < coste) {
      quitarEfecto(e, x, l);
      return false;
    }
    e.reserva -= coste;
    return true;
  });
  // Un conjuro listo: un asalto más de espera; pasado su Poder, vuelve a la reserva menos 10.
  const pr = e.preparado;
  if (pr && pr.zeon >= pr.conjuro.grados[pr.grado].zeon && ++pr.esperando > atributo(l, 'POD')) {
    e.reserva -= Math.min(PERDIDA_AL_SOLTAR, pr.zeon);
    e.preparado = null;
  }
  e.acumulando = p.acumula && !p.innato;
  const prepara = p.preparar && !p.innato ? p.preparar : null;
  if (!e.acumulando || prepara) soltar(e);
  if (!e.acumulando) return;
  // Sacrificio de Poder: zeon de la reserva por ACT (Core p.159).
  const sacrificio = Math.min(p.sacrificioPoder ?? 0, zeonLibre(e));
  e.reserva -= sacrificio;
  const act = actPara(l, prepara?.conjuro) + actPorCansancio(l) * (p.cansancio ?? 0) + Math.floor(sacrificio / 10) * 5;
  if (prepara) {
    if (!e.preparado || e.preparado.conjuro !== prepara.conjuro || e.preparado.grado !== prepara.grado) {
      if (e.preparado) e.reserva -= Math.min(PERDIDA_AL_SOLTAR, e.preparado.zeon);
      e.preparado = { conjuro: prepara.conjuro, grado: prepara.grado, zeon: 0, esperando: 0 };
    }
    const falta = prepara.conjuro.grados[prepara.grado].zeon - e.preparado.zeon;
    e.ganado = Math.max(0, Math.min(act, falta, zeonLibre(e)));
    e.preparado.zeon += e.ganado;
    e.ganadoEn = 'preparado';
    return;
  }
  e.ganadoEn = 'puro';
  e.ganado = Math.max(0, Math.min(act, zeonLibre(e)));
  e.acumulado += e.ganado;
}

/**
 * Fin del asalto. Si lanzó algo, lo que le sobra vuelve a la reserva menos 10. Si no, y además de
 * acumular hizo otra cosa que no sea lanzar, este asalto acumuló la mitad (Core p.117).
 */
export function terminarAsaltoMagia(l: Luchador) {
  const e = l.magia;
  if (!e) return;
  if (e.lanzo) {
    soltar(e);
    return;
  }
  if (!((e.otraAccion || l.movioActivo) && e.ganado)) return;
  // Lo que ganó preparando un conjuro determinado también queda a la mitad.
  if (e.ganadoEn === 'preparado' && e.preparado) e.preparado.zeon -= Math.floor(e.ganado / 2);
  else e.acumulado -= Math.floor(e.ganado / 2);
}

/** Proyección Mágica Determinada por esferas: habilidad final fija y su zeon (Arcana p.26). */
const DETERMINADA: readonly { valor: number; zeon: number }[] = [
  { valor: 120, zeon: 10 }, { valor: 140, zeon: 20 }, { valor: 180, zeon: 40 }, { valor: 240, zeon: 60 }, { valor: 280, zeon: 80 },
];

/**
 * Proyección Mágica Determinada (Arcana p.26): en vez de tirar, una habilidad final fija pagando zeon de
 * la reserva (sin acumularlo). Conviene cuando su Proyección con la tirada media (unos 55) no llega:
 * cegado o con muchos negativos. Devuelve el nivel que conviene, o null.
 */
export function proyeccionDeterminada(l: Luchador, habilidad: number): { valor: number; zeon: number } | null {
  const e = l.magia;
  const n = l.ficha.magia?.proyeccionDeterminada ?? 0;
  if (!e || !n) return null;
  let mejor: { valor: number; zeon: number } | null = null;
  for (const d of DETERMINADA.slice(0, n)) if (d.valor > habilidad + 55 && d.zeon <= zeonLibre(e)) mejor = d;
  return mejor;
}

/** Paga la Proyección Determinada: de la reserva, sin acumular. */
export function pagarDeterminada(l: Luchador, d: { zeon: number }) {
  l.magia!.reserva -= d.zeon;
}

/** El conjuro preparado está listo para lanzarse. */
export function preparadoListo(e: EstadoMagia): Preparado | null {
  const p = e.preparado;
  return p && p.zeon >= p.conjuro.grados[p.grado].zeon ? p : null;
}

/** Puede lanzarlo en ese grado: le alcanza lo acumulado y su Inteligencia (Core p.121). */
export function puedeLanzar(l: Luchador, c: Conjuro, grado: number): boolean {
  const e = l.magia;
  const g = c.grados[grado];
  return !!e && e.acumulado >= g.zeon && gradosPosibles(c, l.ficha.inteligencia ?? 6, l.ficha.magia).includes(grado) && !estaMantenido(e, c);
}

/**
 * Ya lo mantiene: un solo ejemplar de cada conjuro, salvo los que benefician a un aliado, de los que
 * mantiene uno por blanco (se elige a quién al lanzarlo).
 */
function estaMantenido(e: EstadoMagia, c: Conjuro): boolean {
  return c.blanco !== 'aliado' && e.mantenidos.some((x) => x.conjuro === c);
}

/** Zeon extra por elegir los blancos de un conjuro de área con Control del Espacio (Arcana p.28). */
export const ZEON_CONTROL_DEL_ESPACIO = 10;

/**
 * Conjuro ofensivo de área que alcanza a todos los de adentro: con Control del Espacio puede elegir a
 * quiénes (Arcana p.28).
 */
export function deArea(c: Conjuro, g: Grado): boolean {
  return !!g.area || (!!g.radio && !!c.radioOfensivo);
}

/** Lo que cuesta lanzarlo: su zeon, más 10 si usa Control del Espacio para elegir blancos. */
export function costeConjuro(g: Grado, control = false): number {
  return g.zeon + (control ? ZEON_CONTROL_DEL_ESPACIO : 0);
}

/** Resistencia Mágica: la de la planilla, o la Presencia más el bono de Poder (Core p.12). */
export function rmDe(l: Luchador): number {
  return l.ficha.rm ?? presenciaDe(l) + bonoCaracteristica(atributo(l, 'POD'));
}

/** Presencia: la de la planilla, o la que deja la RF sin el bono de Constitución (Core p.12). */
export function presenciaDe(l: Luchador): number {
  return l.ficha.presencia ?? Math.max(0, l.ficha.rf - bonoCaracteristica(atributo(l, 'CON')));
}

/**
 * Lanza un conjuro: gasta su zeon de lo acumulado y deja activo lo que se mantiene (con sus
 * beneficiados o su zona).
 */
export function lanzar(l: Luchador, c: Conjuro, grado: number, extra: Omit<Mantenido, 'conjuro' | 'grado'> = {}, control = false): Grado {
  const e = l.magia!;
  const g = c.grados[grado];
  const coste = costeConjuro(g, control);
  const pr = preparadoListo(e);
  if (extra.innato) {
    // Innato: no gasta zeon (Core p.117); Control del Espacio, sí, de la reserva.
    e.reserva -= coste - g.zeon;
  } else if (pr && pr.conjuro === c && pr.grado === grado) {
    // El conjuro preparado: se paga con lo reunido para él (Core p.117).
    e.reserva -= coste;
    e.preparado = null;
  } else {
    e.acumulado -= coste;
    e.reserva -= coste;
    e.lanzo = true;
  }
  // Un escudo nuevo reemplaza al que tenga, salvo la Barrera de Fuego, que sólo sirve de escudo si no hay otro.
  if (g.resistencia && (!c.escudoSiNoHayOtro || !e.escudo)) e.escudo = { conjuro: c, grado, resistencia: g.resistencia };
  if (g.taEnergia !== undefined) e.armadura = { energia: g.taEnergia, resto: g.taResto ?? 0 };
  if (g.bono) for (const b of extra.blancos ?? []) bendecir(b, l, c, g.bono);
  if (g.mantenimiento || c.diario) e.mantenidos.push({ conjuro: c, grado, ...extra });
  return g;
}

/** Deja de mantener un conjuro (al soltarlo o al no poder pagarlo). */
function quitarEfecto(e: EstadoMagia, x: Mantenido, l?: Luchador) {
  if (e.escudo?.conjuro === x.conjuro) e.escudo = null;
  if (x.conjuro.grados[x.grado].taEnergia !== undefined) e.armadura = null;
  if (l) for (const b of x.blancos ?? []) quitarBendicion(b, l, x.conjuro);
  x.alTerminar?.();
}

/** Termina todos sus conjuros mantenidos (al morir: ya no hay esencia que los sostenga). */
export function terminarMantenidos(l: Luchador) {
  const e = l.magia;
  if (!e) return;
  for (const x of e.mantenidos) quitarEfecto(e, x, l);
  e.mantenidos = [];
}

/** Deja de mantener un conjuro en particular. */
export function dejarDeMantener(l: Luchador, x: Mantenido) {
  const e = l.magia!;
  quitarEfecto(e, x, l);
  e.mantenidos = e.mantenidos.filter((m) => m !== x);
}

/** Le pone un beneficio; el mismo origen de la misma fuente no se acumula. */
export function bendecir(l: Luchador, fuente: Luchador, origen: OrigenBono, bono: BonoMagico) {
  l.bendiciones = l.bendiciones.filter((b) => !(b.fuente === fuente && b.origen === origen));
  l.bendiciones.push({ fuente, origen, bono });
  sumarBendiciones(l);
}

export function quitarBendicion(l: Luchador, fuente: Luchador, origen: OrigenBono) {
  const antes = l.bendiciones.length;
  l.bendiciones = l.bendiciones.filter((b) => !(b.fuente === fuente && b.origen === origen));
  if (l.bendiciones.length !== antes) sumarBendiciones(l);
}

/**
 * Suma de los beneficios. Distintos conjuros se suman; el mismo conjuro de dos fuentes no se
 * superpone: vale el mayor (interpretación).
 */
function sumarBendiciones(l: Luchador) {
  if (!l.bendiciones.length) {
    l.bono = null;
    return;
  }
  const porConjuro = new Map<OrigenBono, BonoMagico>();
  for (const b of l.bendiciones) {
    const previo = porConjuro.get(b.origen);
    const peso = (x: BonoMagico) => (x.dano ?? 0) + (x.danoArma ?? 0) + (x.ta ?? 0) + (x.turno ?? 0) + (x.toda ?? 0) + (x.resistencias ?? 0) +
      (x.inmuneFuego ?? 0) + Math.min(1000, x.invisible ?? 0) + (x.advertir ?? 0) - (x.tamano ?? 0) + (x.frialdad ?? 0);
    if (!previo || peso(b.bono) > peso(previo)) porConjuro.set(b.origen, b.bono);
  }
  const t: Required<Omit<BonoMagico, 'tipoArma'>> & Pick<BonoMagico, 'tipoArma'> = {
    ataque: 0, toda: 0, dano: 0, turno: 0, ta: 0, resistencias: 0, ira: false, cuerpoFuego: false, resCalor: 0, danoArma: 0,
    inmuneFuego: 0, invisible: 0, advertir: 0, tamano: 0, luz: false, frialdad: 0, energiaNecesaria: false,
  };
  for (const b of porConjuro.values()) {
    t.ataque += b.ataque ?? 0;
    t.toda += b.toda ?? 0;
    t.dano += b.dano ?? 0;
    t.turno += b.turno ?? 0;
    t.ta += b.ta ?? 0;
    t.resistencias += b.resistencias ?? 0;
    t.ira ||= !!b.ira;
    t.cuerpoFuego ||= !!b.cuerpoFuego;
    t.resCalor = Math.max(t.resCalor, b.resCalor ?? 0);
    t.danoArma += b.danoArma ?? 0;
    t.inmuneFuego = Math.max(t.inmuneFuego, b.inmuneFuego ?? 0);
    t.invisible = Math.max(t.invisible, b.invisible ?? 0);
    t.advertir += b.advertir ?? 0;
    t.tamano += b.tamano ?? 0;
    t.luz ||= !!b.luz;
    t.frialdad += b.frialdad ?? 0;
    t.energiaNecesaria ||= !!b.energiaNecesaria;
    if (b.tipoArma) t.tipoArma = b.tipoArma;
  }
  l.bono = t;
}

/** El escudo se rompe: deja de mantenerse. */
export function romperEscudo(l: Luchador) {
  const e = l.magia;
  if (!e?.escudo) return;
  const c = e.escudo.conjuro;
  e.escudo = null;
  e.mantenidos = e.mantenidos.filter((x) => x.conjuro !== c);
}

/** El conjuro con ese efecto que mantiene (Sacrificio Vital, una mina…), si hay. */
export function mantenidoDe(l: Luchador, efecto: EfectoConjuro): Mantenido | undefined {
  return l.magia?.mantenidos.find((x) => x.conjuro.efecto === efecto);
}

/** Su escudo mágico detiene ese tipo de ataque (la Barrera de Fuego, sólo algunos, Core p.157). */
export function escudoDetiene(l: Luchador, tipo?: TipoAtaque): boolean {
  const esc = l.magia?.escudo;
  if (!esc) return false;
  const contra = esc.conjuro.grados[esc.grado].escudoContra;
  return !contra || (!!tipo && contra.includes(tipo));
}

/** Ese conjuro, si lo mantiene. */
export function mantenidoCon(l: Luchador, c: Conjuro): Mantenido | undefined {
  return l.magia?.mantenidos.find((x) => x.conjuro === c);
}

/**
 * Recibir daño mientras acumula (Core p.118): Resistir el dolor contra el doble del daño para
 * conservar lo acumulado; si ni siquiera llega al daño, lo pierde; si no, vuelve a la reserva.
 * Devuelve qué pasó, para narrarlo.
 */
export function danoAlAcumular(l: Luchador, dano: number, rng: Rng, critico = false): { tirada: number; resultado: 'conserva' | 'vuelve' | 'pierde' } | null {
  const e = l.magia;
  // Un conjuro determinado que todavía prepara también está en juego; uno listo, no (ya no acumula).
  const prep = e?.preparado && !preparadoListo(e) && e.preparado.zeon > 0 ? e.preparado : null;
  // Con acumulación de daño no lo hace, salvo que el ataque le cause un crítico (Core p.118).
  if (!e || (e.acumulado <= 0 && !prep) || dano <= 0 || (l.ficha.acumulacion && !critico)) return null;
  // Preparando un conjuro determinado (y sin magia pura en juego), +40 (Core p.118).
  const habilidad = (l.ficha.resistirDolor ?? 0) + (e.acumulado <= 0 ? 40 : 0);
  const t = tirarD100(rng, umbralPifia(habilidad, l.cap.ajustePifia));
  const tirada = habilidad + t.valor;
  if (!t.pifia && tirada >= 2 * dano) return { tirada, resultado: 'conserva' };
  if (!t.pifia && tirada >= dano) {
    // Vuelve a la reserva, con los 10 que se pierden al interrumpir la acumulación (Core p.117).
    soltar(e);
    if (prep) {
      e.reserva -= Math.min(PERDIDA_AL_SOLTAR, prep.zeon);
      e.preparado = null;
    }
    return { tirada, resultado: 'vuelve' };
  }
  e.reserva -= e.acumulado + (prep?.zeon ?? 0);
  e.acumulado = 0;
  if (prep) e.preparado = null;
  return { tirada, resultado: 'pierde' };
}

/** Alcance de los conjuros según su Proyección Mágica (Recuadro X, Core p.118). */
export function alcanceMagico(proyeccion: number): number {
  return proyeccion >= 180 ? 500 : proyeccion >= 140 ? 250 : proyeccion >= 120 ? 100 : proyeccion >= 80 ? 25 : proyeccion >= 40 ? 5 : 1;
}

// --------------------------------------------------------------------------- Tabla 76: En llamas (Core p.236)

const ESTADOS_LLAMAS: [number, string][] = [[300, 'calcinado'], [240, 'en llamas'], [180, 'ardiendo'], [100, 'prendido']];

/** Estado en la Tabla 76: En llamas (Core p.236), o '' si no arde. */
export function estadoLlamas(nivel: number): string {
  return ESTADOS_LLAMAS.find(([n]) => nivel >= n)?.[1] ?? '';
}

/**
 * Nivel en la Tabla 76 con el que queda prendido por un resultado: un ser con acumulación lo divide entre
 * 5, y cada intensidad de calor a la que es inmune lo baja 20 (Core p.236).
 */
export function nivelLlamas(l: Luchador, valor: number): number {
  return (l.ficha.acumulacion ? Math.floor(valor / 5) : valor) - 20 * (l.bono?.inmuneFuego ?? 0);
}

/** PV que pierde por asalto en ese estado (Core p.237): la armadura contra calor resta 2 por TA, salvo calcinado. */
export function danoLlamas(l: Luchador, n = l.llamas): number {
  const acumula = !!l.ficha.acumulacion;
  if (n >= 300) return acumula ? 250 : 50;
  const base = n >= 240 ? 25 : n >= 180 ? 10 : 0;
  if (!base) return 0;
  const ta = l.ficha.ta.CAL ?? 0;
  return Math.max(0, acumula ? 5 * base - 5 * ta : base - 2 * ta);
}
