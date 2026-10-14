// Resolución de un combate completo con dados reales. Las decisiones las toma ./ia.

import type { Contexto, Equipo, Ficha, Luchador, OpcionesEscenario } from './modelo';
import { crearRng, dado, type Rng } from './rng';
import { textoTirada, tirarD100, tirarD100Cerrada, valorTirada, type TiradaD100 } from './dados';
import { capacidades, planDeAtaques, type Ranura } from './rasgos';
import {
  bonoContraataque, danoFinal, esCritico, esMaestro, haySorpresa, localizar, nivelCritico, penPifiaTurno, umbralPifia,
  porcentajeDano, type Localizacion, type TipoAtaque,
} from './reglas';
import {
  absorcionContra, activo, ALCANCE, ataqueFinal, barreraFrena, danoBase, defensaFinal, distancia,
  enAlcance, metrosTotales, modControl, umbralPifiaTurno, penAccion, perfilDe, proximaRanura, puedeActuar, turnoFinal, capasDe, zonaDe, type ZonaArmadura,
} from './calculos';
import {
  atributo, caracteristicasControl, controlCaracteristica, controlEnfrentado, dificultadPuntosPresion, esApuntado,
  esManiobraDeControl, esNoLetal, gradoPresa, localizacionApuntada, type EstadoMushin,
  modificadorPorResultado, type Maniobra,
} from './maniobras';
import * as ia from './ia';

export interface OpcionesCombate {
  semilla?: number;
  rng?: Rng;
  registrar?: boolean;
  /** Metros entre los dos bandos al empezar. */
  distanciaInicial?: number;
  maxAsaltos?: number;
  /** Reglas opcionales y condiciones del escenario. */
  escenario?: OpcionesEscenario;
}

export interface ResultadoCombate {
  ganador: Equipo | 'empate';
  asaltos: number;
  luchadores: Luchador[];
  registro: Contexto['registro'];
}

export function crearLuchador(ficha: Ficha, equipo: Equipo, x: number, y: number): Luchador {
  return {
    ficha, equipo, pos: { x, y }, cap: capacidades(ficha), entorno: {},
    pv: ficha.pv,
    cansancio: ficha.cansancio ?? ficha.constitucion,
    penDolor: 0, penFisico: 0,
    estado: 'activo',
    trabados: [],
    iniciativa: 0, haActuado: false, aLaDefensiva: false, defensaTotal: false,
    ataquesDeclarados: 1, planAtaques: [], ataquesRestantes: 0, defensasHechas: 0, cansancioAsalto: 0,
    movioActivo: false, metrosMovidos: 0, sorprendeA: new Set(), previene: new Set(), previenePendiente: new Set(), planResistir: null,
    derribado: false, paralisis: 0, apresadoPor: null, apresando: null, desarmado: false,
    paralisisInducida: 0, paralisisTurnos: 0, amenazadoPor: null, enfundada: false, huyendo: false,
    estiloDefensivo: false,
    modo: { seraphite: 0, berserker: false, ataqueFinal: false },
    bonoVariableEn: null, objetivoUnico: null, godhandListo: false, godhandPreparado: false,
    ataqueFinalUsado: false, maniobraEspecialUsada: false, repitioControl: false, samiel: new Map(), orochi: 0, orochiAsaltos: 0,
    stats: {
      danoCausado: 0, danoRecibido: 0, bajas: 0, criticosCausados: 0, asaltoCaida: null,
      ataquesHechos: 0, contrasHechas: 0, cansancioGastado: 0, asaltosDefensaTotal: 0, maniobras: {},
    },
  };
}

/** D100 abierta con el umbral de pifia de esa tirada (ver `umbralPifia`). */
function tirar(ctx: Contexto, umbral: number): TiradaD100 {
  return tirarD100(ctx.rng, umbral);
}

function log(ctx: Contexto, texto: string | (() => string)) {
  if (ctx.registro) ctx.registro.push({ asalto: ctx.asalto, texto: typeof texto === 'string' ? texto : texto() });
}

function equipoVivo(ctx: Contexto, equipo: Equipo): boolean {
  return ctx.luchadores.some((l) => l.equipo === equipo && activo(l));
}

function terminado(ctx: Contexto): boolean {
  return !equipoVivo(ctx, 'A') || !equipoVivo(ctx, 'B');
}

export function simularCombate(equipoA: Ficha[], equipoB: Ficha[], o: OpcionesCombate = {}): ResultadoCombate {
  const rng = o.rng ?? crearRng(o.semilla ?? Date.now());
  const dist = o.distanciaInicial ?? 10;
  const entorno = o.escenario ?? {};
  const luchadores = [
    ...equipoA.map((f, i) => crearLuchador(f, 'A', 0, (i - (equipoA.length - 1) / 2) * 2)),
    ...equipoB.map((f, i) => crearLuchador(f, 'B', dist, (i - (equipoB.length - 1) / 2) * 2)),
  ];
  for (const l of luchadores) {
    l.entorno = entorno;
    l.enfundada = !!entorno.armasEnfundadas && !l.cap.desarmado;
  }
  const ctx: Contexto = {
    opciones: entorno, rng, luchadores, asalto: 0, registro: o.registrar ? [] : null,
    ataquesEnAsalto: 0, ataquesAsaltoAnterior: 0, movimientosEnAsalto: 0, ventaja: { A: 1, B: 1 },
  };
  const maxAsaltos = o.maxAsaltos ?? 50;
  let asaltosQuietos = 0;

  while (!terminado(ctx) && ctx.asalto < maxAsaltos) {
    ctx.asalto++;
    ctx.ataquesAsaltoAnterior = ctx.ataquesEnAsalto;
    ctx.ataquesEnAsalto = 0;
    ctx.movimientosEnAsalto = 0;
    jugarAsalto(ctx);
    // Nadie ataca ni se mueve durante 3 asaltos: combate estancado.
    asaltosQuietos = ctx.ataquesEnAsalto + ctx.movimientosEnAsalto === 0 ? asaltosQuietos + 1 : 0;
    if (asaltosQuietos >= 3) break;
  }

  const ganador = !equipoVivo(ctx, 'B') && equipoVivo(ctx, 'A') ? 'A'
    : !equipoVivo(ctx, 'A') && equipoVivo(ctx, 'B') ? 'B' : 'empate';
  log(ctx, `Fin: ${ganador === 'empate' ? 'empate' : `gana el equipo ${ganador}`}.`);
  return { ganador, asaltos: ctx.asalto, luchadores, registro: ctx.registro };
}

function jugarAsalto(ctx: Contexto) {
  const vivos = ctx.luchadores.filter(activo);
  for (const l of vivos) {
    l.haActuado = false; l.aLaDefensiva = false; l.defensasHechas = 0; l.cansancioAsalto = 0;
    l.movioActivo = false; l.metrosMovidos = 0; l.sorprendeA.clear(); l.objetivoUnico = null;
    l.planResistir = null;
    l.repitioControl = false;
    // Godhand: el ataque sacrificado el asalto anterior potencia el primero de este.
    l.godhandListo = l.godhandPreparado;
    l.godhandPreparado = false;
  }

  // 1. Declaración simultánea: todos deciden viendo el asalto anterior, después se aplica.
  ctx.ventaja = ia.ventajaEquipos(ctx);
  const declaraciones = vivos.map((l) => ia.declarar(ctx, l));
  for (const [i, l] of vivos.entries()) {
    const d = declaraciones[i];
    l.defensaTotal = d.defensaTotal;
    l.ataquesDeclarados = Math.max(1, d.ataques);
    l.estiloDefensivo = d.estiloDefensivo;
    l.modo = { seraphite: d.seraphite, berserker: d.berserker, ataqueFinal: l.modo.ataqueFinal || d.ataqueFinal };
    if (d.ataqueFinal) l.ataqueFinalUsado = true;
    l.bonoVariableEn = d.bonoVariableEn;
    l.previene = new Set(d.preverSorpresa);
    l.previenePendiente = new Set(d.preverSorpresa);
    if (d.preverSorpresa.length) log(ctx, () => `${l.ficha.nombre} prevé la sorpresa de ${d.preverSorpresa.map((e) => e.ficha.nombre).join(', ')}.`);
    if (d.despertarOrochi && l.orochi === 0) {
      l.orochi = 1;
      log(ctx, () => `${l.ficha.nombre} despierta la sangre de Orochi.`);
    }
    // Los declarados comparten el penalizador; los extra (segunda arma, patada) van después. Con la
    // Tabla de 2ª Arma: Estilo Defensivo la segunda arma defiende en vez de atacar (Dominus p.28).
    l.planAtaques = d.defensaTotal ? [] : planDeAtaques(l.cap, d.ataques, l.estiloDefensivo);
    l.ataquesRestantes = l.planAtaques.length;
    if (d.defensaTotal) l.stats.asaltosDefensaTotal++;
    const modos = [
      d.seraphite ? (d.seraphite === 3 ? 'Seraphite arcano' : 'Seraphite') : '', d.berserker ? 'Berserker' : '',
      d.ataqueFinal ? 'Ataque Final' : '', d.bonoVariableEn ? `bono variable al ${d.bonoVariableEn}` : '',
    ].filter(Boolean);
    if (modos.length) log(ctx, () => `${l.ficha.nombre}: ${modos.join(', ')}.`);
  }

  // 2. Iniciativa: turno + d100 abierta. Una pifia en turno actúa automáticamente último, sin nivel
  // de pifia; para la sorpresa vale el turno con el penalizador de la Tabla 52 (Core p.98). El turno
  // no es una habilidad: la maestría no baja el umbral, Buena suerte sí (Core p.21).
  const desempate = new Map<Luchador, number>();
  const pifiados = new Set<Luchador>();
  const paraSorpresa = new Map<Luchador, number>();
  const tiradas = ctx.registro ? new Map<Luchador, string>() : null;
  for (const l of vivos) {
    desempate.set(l, ctx.rng.next());
    const t = tirarD100(ctx.rng, umbralPifiaTurno(l));
    const turno = turnoFinal(l);
    if (t.pifia) {
      pifiados.add(l);
      l.iniciativa = turno + t.natural;
      paraSorpresa.set(l, turno + penPifiaTurno(t.natural));
      tiradas?.set(l, `${turno}+${t.natural} (pifia: actúa último, ${penPifiaTurno(t.natural)} para la sorpresa)`);
    } else {
      l.iniciativa = turno + t.valor;
      paraSorpresa.set(l, l.iniciativa);
      tiradas?.set(l, textoTirada(turno, t));
    }
  }
  const orden = [...vivos].sort(
    (a, b) =>
      Number(pifiados.has(a)) - Number(pifiados.has(b)) || b.iniciativa - a.iniciativa ||
      b.ficha.turno - a.ficha.turno || desempate.get(b)! - desempate.get(a)!,
  );
  for (const a of vivos)
    for (const b of vivos)
      // Uroboros sorprende con 100 de diferencia en vez de 150 (Dominus p.79).
      if (
        a.equipo !== b.equipo && !b.previene.has(a) &&
        haySorpresa(paraSorpresa.get(a)! - paraSorpresa.get(b)!, a.cap.est.diferenciaSorpresa)
      ) {
        a.sorprendeA.add(b);
        log(ctx, () => `${a.ficha.nombre} sorprende a ${b.ficha.nombre}.`);
      }
  log(ctx, () => `Iniciativa: ${orden.map((l) => `${l.ficha.nombre} ${l.iniciativa} [${tiradas!.get(l)}]${l.defensaTotal ? ' (defensa total)' : ` (${l.ataquesDeclarados} at.)`}`).join(', ')}`);

  // 3. Acciones en orden.
  for (const l of orden) {
    if (terminado(ctx)) break;
    turno(ctx, l);
  }

  // 4. Fin del asalto.
  for (const l of ctx.luchadores) {
    if (!activo(l)) continue;
    // Quien está apresado y no pudo actuar puede intentar zafarse igual (Core p.92).
    if (l.apresadoPor && !l.haActuado) zafarse(ctx, l);
    l.penDolor = Math.max(0, l.penDolor - 5);
    if (l.paralisisTurnos > 0 && --l.paralisisTurnos === 0) l.paralisisInducida = 0;
    sangreDeOrochi(ctx, l);
  }
}

function turno(ctx: Contexto, l: Luchador) {
  if (puedeActuar(l) && ctx.opciones.huida && ia.quiereHuir(ctx, l)) {
    retirarse(ctx, l);
    l.haActuado = true;
    return;
  }
  if (puedeActuar(l)) {
    // Levantarse es una acción activa: lo siguiente va con −25.
    if (l.derribado) {
      l.derribado = false;
      l.movioActivo = true;
      log(ctx, () => `${l.ficha.nombre} se levanta.`);
    }
    if (l.apresadoPor && !zafarse(ctx, l)) l.ataquesRestantes = 0;
    ia.prepararGodhand(ctx, l);
    while (l.ataquesRestantes > 0 && puedeActuar(l) && !terminado(ctx)) {
      const obj = ia.elegirObjetivo(ctx, l);
      if (!obj) break;
      if (!enAlcance(l, obj)) {
        mover(ctx, l, obj);
        if (!enAlcance(l, obj)) break;
      }
      atacar(ctx, l, obj, { esContra: false, bono: 0 });
    }
    // Sin ataques pero sin trabarse: igual se acerca.
    if (l.ataquesRestantes === 0 && puedeActuar(l) && !l.trabados.some(activo) && !l.apresadoPor) {
      const obj = ia.elegirObjetivo(ctx, l);
      if (obj && !enAlcance(l, obj)) mover(ctx, l, obj);
    }
  }
  l.sorprendeA.clear();
  l.haActuado = true;
}

/**
 * Retirarse del combate (Core p.94): acción activa. Cada enemigo trabado con ataques disponibles
 * tiene una Acción Respuesta contra él, con el modificador de flanco; si alguna le hace daño, no
 * puede irse este asalto. Si sorprendió a todos, se va sin que lo ataquen. Con Acrobacias puede
 * escapar sin recibir ataques si gana por más de 40 a la habilidad ofensiva de cada uno.
 */
function retirarse(ctx: Contexto, l: Luchador) {
  const trabados = ctx.luchadores.filter((e) => e.equipo !== l.equipo && activo(e) && enAlcance(l, e));
  l.ataquesRestantes = 0;
  if (trabados.every((e) => l.sorprendeA.has(e))) return huir(ctx, l);
  if (l.ficha.acrobacias !== undefined) {
    const base = l.ficha.acrobacias - penAccion(l);
    const t = tirar(ctx, umbralPifia(l.ficha.acrobacias, l.cap.ajustePifia));
    const acrobacias = base + valorTirada(t);
    const supera = trabados.every((e) => acrobacias - (ataqueFinal(e, l, { esContra: true }) + valorTirada(tirar(ctx, e.cap.umbralAtaque))) > 40);
    log(ctx, () => `${l.ficha.nombre} intenta escapar con Acrobacias (${textoTirada(base, t)} = ${acrobacias})${supera ? ' y lo logra' : ''}.`);
    if (supera) return huir(ctx, l);
  }
  log(ctx, () => `${l.ficha.nombre} intenta retirarse.`);
  l.huyendo = true;
  let danado = false;
  for (const e of trabados) {
    if (!activo(l)) break;
    if (e.ataquesRestantes <= 0 || !puedeActuar(e)) continue;
    const antes = l.pv;
    atacar(ctx, e, l, { esContra: true, bono: 0 });
    if (l.pv < antes) danado = true;
  }
  l.huyendo = false;
  if (!activo(l)) return;
  if (danado) log(ctx, () => `  ${l.ficha.nombre} no logra retirarse.`);
  else huir(ctx, l);
}

function huir(ctx: Contexto, l: Luchador) {
  l.estado = 'huido';
  soltar(l);
  if (l.apresando) soltar(l.apresando);
  liberarAmenazados(ctx, l);
  for (const x of ctx.luchadores) x.trabados = x.trabados.filter((e) => e !== l);
  log(ctx, () => `${l.ficha.nombre} huye del combate.`);
}

function mover(ctx: Contexto, l: Luchador, obj: Luchador) {
  if (l.apresadoPor || l.apresando) return;
  if (l.trabados.some((e) => activo(e) && enAlcance(l, e))) return; // trabado: no se retira
  const total = metrosTotales(l);
  const disponible = total - l.metrosMovidos;
  const d = distancia(l, obj);
  const falta = d - ALCANCE * 0.75;
  const paso = Math.min(Math.max(0, falta), disponible);
  if (paso <= 0) return;
  if (paso >= falta) {
    // Llega: se ubica alrededor del objetivo, repartiendo el ángulo entre los que ya están.
    const base = Math.atan2(l.pos.y - obj.pos.y, l.pos.x - obj.pos.x);
    const k = obj.trabados.length;
    const ang = base + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 4);
    l.pos = { x: obj.pos.x + Math.cos(ang) * ALCANCE * 0.75, y: obj.pos.y + Math.sin(ang) * ALCANCE * 0.75 };
  } else {
    l.pos = { x: l.pos.x + ((obj.pos.x - l.pos.x) / d) * paso, y: l.pos.y + ((obj.pos.y - l.pos.y) / d) * paso };
  }
  l.metrosMovidos += paso;
  ctx.movimientosEnAsalto++;
  if (l.metrosMovidos > total / 4) l.movioActivo = true;
  log(ctx, () => `${l.ficha.nombre} avanza ${paso.toFixed(1)} m${l.movioActivo ? ' (acción activa, −25)' : ''}.`);
  for (const e of ctx.luchadores) {
    if (e.equipo === l.equipo || !activo(e) || !enAlcance(l, e)) continue;
    if (!e.trabados.includes(l)) e.trabados.push(l);
    if (!l.trabados.includes(e)) l.trabados.push(e);
  }
}

function gastarCansancio(l: Luchador, puntos: number) {
  l.cansancio -= puntos;
  l.cansancioAsalto += puntos;
  l.stats.cansancioGastado += puntos;
}

export interface Ataque {
  esContra: boolean;
  bono: number;
}

const NOMBRE_MANIOBRA: Record<Maniobra, string> = {
  normal: 'ataca', derribo: 'intenta derribar', presa: 'intenta apresar', desarmar: 'intenta desarmar',
  area: 'ataca en área', cabeza: 'apunta a la cabeza de', corazon: 'apunta al corazón de',
  inutilizar: 'intenta inutilizar', inconsciencia: 'intenta dejar inconsciente',
  engatillar: 'intenta engatillar', puntosPresion: 'ataca los puntos de presión de',
};

export function atacar(ctx: Contexto, atk: Luchador, def: Luchador, a: Ataque) {
  ctx.ataquesEnAsalto++;
  atk.stats.ataquesHechos++;
  if (a.esContra) atk.stats.contrasHechas++;

  // Selene: dobla el bono del contraataque peleando sin armas (Dominus p.39).
  const bono = a.esContra && atk.cap.est.doblaBonoContra ? a.bono * 2 : a.bono;
  // Declaraciones antes de tirar: maniobra, cansancio, Samiel, y del lado del defensor lo mismo.
  const plan = ia.elegirManiobra(ctx, atk, def, a.esContra, bono);
  const m = plan.maniobra;
  atk.stats.maniobras[m] = (atk.stats.maniobras[m] ?? 0) + 1;
  if (plan.especial) atk.maniobraEspecialUsada = true;
  const cAtk = ia.cansancioAtaque(ctx, atk, def, bono, plan);
  gastarCansancio(atk, cAtk);
  const samielAtk = ia.gastoSamiel(atk, def, 'ataque');
  // La ranura (qué ataque del asalto es) se fija antes de gastarlo: decide arma o patada.
  const ranura = proximaRanura(atk);
  const opcionesAtk = {
    bono, cansancio: cAtk, maniobra: m, esContra: a.esContra, tipo: plan.tipo, especial: plan.especial, samiel: samielAtk, ranura,
    estadoMushin: plan.estadoMushin ?? null,
  };
  const habAtk = ataqueFinal(atk, def, opcionesAtk);
  if (samielAtk) atk.samiel.set(def, (atk.samiel.get(def) ?? 0) - samielAtk);
  if (!a.esContra || !atk.cap.est.contrasIlimitadas) atk.ataquesRestantes--;
  if (!ranura.sinArmas) atk.enfundada = false;
  if (!a.esContra && atk.cap.est.xingQuan) atk.objetivoUnico = def;
  const godhand = atk.godhandListo;
  atk.godhandListo = false;
  atk.sorprendeA.clear(); // la sorpresa sólo vale para su primera acción
  atk.previenePendiente.delete(def);

  const tA = tirar(ctx, atk.cap.umbralAtaque);
  const etiqueta = `${atk.ficha.nombre}${a.esContra ? ` contraataca (+${bono}) y` : ''} ${NOMBRE_MANIOBRA[m]}${m === 'cabeza' || m === 'corazon' ? '' : ' a'} ${def.ficha.nombre}${ranura.sinArmas ? ' con una patada' : ranura.pen > 0 ? ' con la segunda arma' : ''}${godhand ? ' (Godhand)' : ''}${plan.especial ? ' (Maniobra Especial)' : ''}`;

  if (tA.pifia) {
    atk.aLaDefensiva = true; // la pifia le niega el resto de acciones activas
    log(ctx, () => `${etiqueta}: ¡pifia! (sacó ${tA.natural}, nivel ${tA.nivelPifia}).`);
    ofrecerContra(ctx, def, atk, tA.nivelPifia);
    return;
  }

  // Ataque en área: una sola tirada contra varios blancos que se defienden en orden (Core p.92).
  const blancos = m === 'area' ? ia.blancosArea(ctx, atk, def) : [def];
  const contras: { quien: Luchador; bono: number }[] = [];
  for (const blanco of blancos) {
    if (!activo(blanco) || !activo(atk)) continue;
    const r = resolverDefensa(ctx, atk, blanco, habAtk, tA, opcionesAtk, etiqueta);
    if (r.contra !== null) {
      contras.push({ quien: r.defensor, bono: r.contra });
      // Parar un ataque en área lo intercepta: los demás no tienen que defenderse.
      if (m === 'area' && (r.defensor.ficha.tipoDefensa ?? 'parada') === 'parada') break;
    }
  }
  // Engatillar: la amenaza se consume cuando quien amenaza ataca a su amenazado.
  if (def.amenazadoPor === atk && m !== 'engatillar') def.amenazadoPor = null;
  for (const c of contras) ofrecerContra(ctx, c.quien, atk, c.bono);
}

/** Quien amenaza pierde la amenaza si lo impactan o cae (interpretación: la regla no lo precisa). */
function liberarAmenazados(ctx: Contexto, l: Luchador) {
  for (const x of ctx.luchadores) if (x.amenazadoPor === l) x.amenazadoPor = null;
}

interface ResultadoDefensa {
  defensor: Luchador;
  /** Bono de contraataque si el defensor ganó, o null. */
  contra: number | null;
}

interface Golpe {
  maniobra: Maniobra;
  estadoMushin?: EstadoMushin | null;
  esContra: boolean;
  tipo?: TipoAtaque;
  ranura: Ranura;
}

function resolverDefensa(
  ctx: Contexto, atk: Luchador, def: Luchador, habAtk: number, tA: TiradaD100, o: Golpe, etiqueta: string,
): ResultadoDefensa {
  // Un aliado puede defender en su lugar: Guardián (−10, sin necesitar el turno, Dominus p.86) o
  // Apartar (esquiva −30, Guardaespaldas −10; acción activa reservada, Core p.93).
  const proteccion = ia.protectorPara(ctx, def, atk);
  const quienDefiende = proteccion?.quien ?? def;
  if (proteccion?.apartar) quienDefiende.ataquesRestantes--;
  const resiste = !proteccion && !def.ficha.acumulacion && ia.resistir(ctx, def, atk);
  // Haima: sacrifica PV para crear una sombra de sangre que recibe el golpe (Dominus p.88).
  const sacrificio = !proteccion && def.cap.est.haima ? ia.sacrificioHaima(def, atk, habAtk) : 0;
  if (sacrificio) {
    def.pv -= sacrificio;
    log(ctx, () => `${def.ficha.nombre} sacrifica ${sacrificio} PV en una sombra de sangre (aguante ${2 * sacrificio}).`);
  }
  const cDef = ia.cansancioDefensa(ctx, quienDefiende, atk, habAtk, resiste);
  gastarCansancio(quienDefiende, cDef);
  const samielDef = ia.gastoSamiel(quienDefiende, atk, 'defensa');
  if (samielDef) quienDefiende.samiel.set(atk, (quienDefiende.samiel.get(atk) ?? 0) - samielDef);
  const habDef = defensaFinal(quienDefiende, atk, { cansancio: cDef, resistir: resiste, samiel: samielDef }) - (proteccion?.pen ?? 0);
  quienDefiende.previenePendiente.delete(atk);
  const para = (quienDefiende.ficha.tipoDefensa ?? 'parada') === 'parada';
  // Parar con el arma la desenfunda (si no lo sorprendieron, que entonces se defiende sin ella).
  if (para && !atk.sorprendeA.has(quienDefiende)) quienDefiende.enfundada = false;

  let resultado: number;
  if (quienDefiende.ficha.acumulacion) {
    resultado = habAtk + tA.valor;
    log(ctx, () => `${etiqueta}: ${textoTirada(habAtk, tA)} contra acumulación → ${resultado}.`);
  } else {
    const tD = tirar(ctx, quienDefiende.cap.umbralDefensa);
    const valorDef = valorTirada(tD);
    quienDefiende.defensasHechas++;
    // La defensa final nunca es negativa.
    const total = Math.max(0, habDef + valorDef);
    resultado = habAtk + tA.valor - total;
    const quien = proteccion ? `${proteccion.quien.ficha.nombre} (${proteccion.apartar ? 'aparta' : 'Guardián'}) ` : '';
    log(ctx, () => `${etiqueta}: ${textoTirada(habAtk, tA)} contra ${quien}${textoTirada(habDef, tD)}${habDef + valorDef < 0 ? ' (=0)' : ''}${resiste ? ' (resiste el golpe)' : ''} → ${resultado}.`);
    if (para && ctx.opciones.rotura) roturaEnParada(ctx, atk, quienDefiende, o.ranura, resultado <= 0);
  }

  if (resultado <= 0) {
    // Emp arcano: cada defensa con éxito contra un arma permite desarmar (Dominus p.39).
    if (quienDefiende.cap.est.desarmaAlDefender && !atk.cap.desarmado && activo(atk)) {
      const c = caracteristicasControl('desarmar', quienDefiende, atk);
      // Control directo, sin los modificadores de Emp (Dominus p.39); los negativos sí cuentan.
      if (controlEnfrentado(ctx.rng, c.atk + modControl(quienDefiende), c.def + modControl(atk)) > 0) desarmar(ctx, atk, quienDefiende);
    }
    return { defensor: quienDefiende, contra: resultado < 0 ? bonoContraataque(resultado) : null };
  }

  // Haima: si el daño no supera el aguante de la sombra, la sombra lo recibe y no pierde la acción;
  // si lo supera, recibe el daño pleno y queda a la defensiva.
  if (sacrificio) {
    const golpe = danoFinal(danoBase(atk, def, o.esContra, o.ranura), porcentajeDano(resultado, absorcionContra(def, atk, esManiobraDeControl(o.maniobra) ? 'normal' : o.maniobra, o.tipo, o.ranura)));
    if (golpe <= 2 * sacrificio) {
      log(ctx, () => `  La sombra de sangre recibe el golpe (${golpe} de ${2 * sacrificio}).`);
      return { defensor: def, contra: null };
    }
    log(ctx, () => `  El golpe (${golpe}) atraviesa la sombra de sangre.`);
  }

  // Impacta: el agredido queda a la defensiva (aunque lo haya cubierto un Guardián que falló).
  // Seraphite arcano sigue actuando salvo que un crítico tenga efecto (Dominus p.40).
  if (!def.ficha.acumulacion && !resiste && def.modo.seraphite !== 3) def.aLaDefensiva = true;
  liberarAmenazados(ctx, def);
  const m = o.maniobra;
  const porcentaje = porcentajeDano(resultado, absorcionContra(def, atk, m, o.tipo, o.ranura));

  if (esManiobraDeControl(m)) {
    if (porcentaje >= 10) resolverControl(ctx, atk, def, m, porcentaje, o.esContra);
    else log(ctx, () => `  No alcanza el 10% necesario para la maniobra.`);
    if (m === 'desarmar') return { defensor: def, contra: null };
  }

  // Daño: Derribo y Presa a la mitad (Grappling supremo completo), contra la armadura real.
  let base = danoBase(atk, def, o.esContra, o.ranura);
  if ((m === 'derribo' || m === 'presa') && !atk.cap.est.danoCompletoEnPresa) base = Math.floor(base / 2);
  // Contra la armadura real (los controles van contra TA 0 sólo para alcanzar el 10%); en un
  // apuntado, la de la zona.
  const abs = absorcionContra(def, atk, esManiobraDeControl(m) ? 'normal' : m, o.tipo, o.ranura);
  const tipo = o.tipo ?? perfilDe(atk, o.ranura).tipoAtaque;
  const frena = barreraFrena(def, atk, base);
  let dano = frena ? 0 : danoFinal(base, porcentajeDano(resultado, abs));
  // Sangre de Aeon: daño de su elemento a la mitad.
  if (def.cap.est.elementoAfin && def.cap.est.elementoAfin === tipo) dano = Math.floor(dano / 2);

  // Engatillar: si el ataque habría dañado, no daña y deja al rival amenazado (Core p.92).
  if (m === 'engatillar') {
    if (dano > 0) {
      def.amenazadoPor = atk;
      log(ctx, () => `  ${def.ficha.nombre} queda amenazado por ${atk.ficha.nombre}.`);
    } else log(ctx, () => `  No logra engatillarlo.`);
    return { defensor: def, contra: null };
  }
  // Puntos de presión (Mushin): en vez de daño, RF contra el daño + 20 (Dominus p.42).
  if (m === 'puntosPresion') {
    if (dano > 0) puntosDePresion(ctx, atk, def, dano, o.estadoMushin ?? null);
    else log(ctx, () => `  No alcanza los puntos de presión.`);
    return { defensor: def, contra: null };
  }
  if (dano > 0) aplicarDano(ctx, atk, def, dano, resiste, m);
  else if (frena) log(ctx, () => `  Impacta, pero la barrera de daño ${def.cap.barrera} frena el daño base ${base}.`);
  else if (!esManiobraDeControl(m)) {
    log(ctx, () => `  Impacta sin daño (absorción ${abs}).`);
    // La armadura evitó el daño: puede romperse (Core p.93).
    if (ctx.opciones.rotura) roturaDeArmadura(ctx, atk, def, o.ranura, zonaDe(m));
  }
  return { defensor: def, contra: null };
}

/**
 * Mushin: RF contra el daño + 20 (máx. 220; arcano +20, máx. 240). Si falla: −fracaso a toda
 * acción (se recupera 5 por asalto) y pierde el doble de PV. El arcano además induce un estado.
 */
function puntosDePresion(ctx: Contexto, atk: Luchador, def: Luchador, dano: number, estado: EstadoMushin | null) {
  const dif = dificultadPuntosPresion(dano, atk.cap.est.mushin >= 3);
  const dadoRf = tirarD100Cerrada(ctx.rng);
  // Las Resistencias no sufren el negativo a toda acción (Core p.232).
  const baseRf = def.ficha.rf;
  const res = baseRf + dadoRf;
  if (dadoRf === 100 || res >= dif) {
    log(ctx, () => `  ${def.ficha.nombre} resiste los puntos de presión (RF ${res} [${baseRf}+${dadoRf}] contra ${dif}).`);
    return;
  }
  const fallo = dif - res;
  def.penDolor += fallo;
  def.pv -= 2 * fallo;
  atk.stats.danoCausado += 2 * fallo;
  def.stats.danoRecibido += 2 * fallo;
  log(ctx, () => `  ${def.ficha.nombre} falla la RF (${res} [${baseRf}+${dadoRf}] contra ${dif}) por ${fallo}: −${fallo} a toda acción y −${2 * fallo} PV (${def.pv}/${def.ficha.pv}).`);
  if (estado) {
    // Estados de la Tabla del Mushin arcano. Las parálisis duran tantos asaltos como el fracaso.
    if (estado === 'dolor') def.penDolor += 40;
    else if (estado === 'dolorExtremo') def.penDolor += 80;
    else if (estado === 'paralisisMenor' || estado === 'paralisisParcial') {
      def.paralisisInducida = estado === 'paralisisMenor' ? 1 : 2;
      def.paralisisTurnos = fallo;
    } else if (estado === 'paralisisCompleta' || estado === 'coma') caer(ctx, atk, def, 'inconsciente');
    else if (estado === 'muerte') caer(ctx, atk, def, 'muerto');
    log(ctx, () => `  Además sufre ${estado}.`);
  }
  verificarCaida(ctx, atk, def);
}

// --------------------------------------------------------------------------- rotura (opcional, Core p.93)

/** Bono a la rotura por Fuerza (Core p.93). */
function bonoRoturaFuerza(fue: number): number {
  return fue >= 15 ? 5 : fue >= 13 ? 4 : fue >= 11 ? 3 : fue === 10 ? 2 : fue >= 8 ? 1 : 0;
}

/** Rotura de un golpe: la del arma (o la del perfil sin armas) + Fuerza + Dumah y Ojos de la Muerte. */
function roturaDe(l: Luchador, ranura: Ranura): number {
  const sinArmas = ranura.sinArmas || l.cap.desarmado;
  const base = sinArmas ? (l.ficha.sinArmas?.rotura ?? 0) : (l.ficha.arma?.rotura ?? 0);
  return base + bonoRoturaFuerza(atributo(l, 'FUE')) + (sinArmas ? l.cap.est.roturaSinArmas : 0) + l.cap.est.roturaExtra;
}

/** Control de rotura: d10 + rotura contra la entereza; devuelve por cuánto la supera (0 si no). */
function controlRotura(ctx: Contexto, rotura: number, entereza: number): number {
  return Math.max(0, rotura + dado(ctx.rng, 10) - entereza);
}

/**
 * Al parar: si las dos armas chocan, cada una puede romper a la otra. Si el defensor para sin armas
 * un arma, controla con su Constitución o Destreza y recibe 5 de daño por punto que falle, salvo
 * maestría en parada sin armas o Malla-yuddha avanzado (Core p.94, Dominus p.35).
 */
function roturaEnParada(ctx: Contexto, atk: Luchador, def: Luchador, ranura: Ranura, paro: boolean) {
  const atkArmado = !ranura.sinArmas && !atk.cap.desarmado;
  if (!atkArmado) return;
  if (def.cap.desarmado) {
    if (!paro || esMaestro(def.ficha.defensa) || def.cap.est.paradaSinArmasSegura) return;
    const entereza = Math.max(atributo(def, 'CON'), atributo(def, 'DES')) + def.cap.est.enterezaSinArmas;
    const falla = controlRotura(ctx, roturaDe(atk, ranura), entereza);
    if (falla > 0) {
      def.pv -= 5 * falla;
      def.stats.danoRecibido += 5 * falla;
      atk.stats.danoCausado += 5 * falla;
      log(ctx, () => `  ${def.ficha.nombre} para sin armas y recibe ${5 * falla} de daño (${def.pv}/${def.ficha.pv}).`);
      verificarCaida(ctx, atk, def);
    }
    return;
  }
  const rDef = { pen: 0, sinArmas: false };
  if (controlRotura(ctx, roturaDe(atk, ranura), def.ficha.arma?.entereza ?? 10) > 0) romperArma(ctx, def);
  if (activo(atk) && controlRotura(ctx, roturaDe(def, rDef), atk.ficha.arma?.entereza ?? 10) > 0) romperArma(ctx, atk);
}

/**
 * Un arma de calidad +5 o más no se rompe: pierde un grado (−5 ataque y parada, −5 turno, −10 daño,
 * −2 rotura, −10 entereza). Sin calidad se destruye y el luchador queda desarmado (Core p.93, p.76).
 */
function romperArma(ctx: Contexto, l: Luchador) {
  const arma = l.ficha.arma ?? {};
  const calidad = arma.calidad ?? 0;
  if (calidad < 5) {
    log(ctx, () => `  ¡Se rompe el arma de ${l.ficha.nombre}!`);
    desarmar(ctx, l, l);
    return;
  }
  const paraConEsta = (l.ficha.tipoDefensa ?? 'parada') === 'parada';
  l.ficha = {
    ...l.ficha,
    ataque: l.ficha.ataque - 5,
    defensa: l.ficha.defensa - (paraConEsta ? 5 : 0),
    turno: l.ficha.turno - 5,
    danoBase: l.ficha.danoBase - 10,
    arma: { ...arma, calidad: calidad - 5, rotura: (arma.rotura ?? 0) - 2, entereza: (arma.entereza ?? 10) - 10 },
  };
  l.cap = capacidades(l.ficha);
  log(ctx, () => `  El arma de ${l.ficha.nombre} se mella: baja a calidad +${calidad - 5}.`);
}

/**
 * La armadura que evitó el daño puede romperse: cada capa rota pierde un punto de todas sus TA. Sólo
 * se controlan las capas de la zona golpeada (el yelmo en un golpe a la cabeza).
 */
function roturaDeArmadura(ctx: Contexto, atk: Luchador, def: Luchador, ranura: Ranura, zona: ZonaArmadura) {
  const capas = def.ficha.capasArmadura;
  if (!capas?.length) return;
  const enZona = new Set(capasDe(def.ficha, zona));
  if (!enZona.size) return;
  const rotura = roturaDe(atk, ranura);
  let rotas = 0;
  let rotasCuerpo = 0;
  const nuevas = capas.map((c) => {
    if (!enZona.has(c) || controlRotura(ctx, rotura, c.entereza) === 0) return c;
    rotas++;
    if ((c.localizacion ?? 'completa') !== 'cabeza') rotasCuerpo++;
    return { ...c, ta: Object.fromEntries(Object.entries(c.ta).map(([t, v]) => [t, Math.max(0, (v ?? 0) - 1)])) };
  });
  if (!rotas) return;
  // La TA total de la planilla es la del cuerpo: el yelmo no cuenta en ella.
  const ta = { ...def.ficha.ta };
  for (const t of Object.keys(ta) as (keyof typeof ta)[]) ta[t] = Math.max(0, (ta[t] ?? 0) - rotasCuerpo);
  def.ficha = { ...def.ficha, ta, capasArmadura: nuevas };
  log(ctx, () => `  La armadura de ${def.ficha.nombre} se daña: −${rotas} a la TA de ${zona === 'cabeza' ? 'su yelmo' : 'las capas golpeadas'}.`);
}

/** Derribo, Presa o Desarmar: control enfrentado de características (Core p.91-92). */
function resolverControl(ctx: Contexto, atk: Luchador, def: Luchador, m: 'derribo' | 'presa' | 'desarmar', porcentaje: number, esContra: boolean) {
  const c = caracteristicasControl(m, atk, def);
  const e = atk.cap.est;
  const bonoAtk = m === 'desarmar'
    ? (esContra ? e.controlDesarmarEnContra : e.controlDesarmar)
    : (esContra ? e.controlPresaDerriboEnContra : e.controlPresaDerribo);
  const bonoDef = m === 'desarmar' ? def.cap.est.resisteDesarme : def.cap.est.resistePresaDerribo;
  const a = c.atk + modificadorPorResultado(porcentaje) + bonoAtk + modControl(atk);
  const d = c.def + bonoDef + modControl(def);
  let dif = controlEnfrentado(ctx.rng, a, d);
  // Kardad supremo: repite una vez por asalto un control fallado al defenderse (Dominus p.37).
  if (dif > 0 && m !== 'desarmar' && def.cap.est.repiteControlDefensivo && !def.repitioControl) {
    def.repitioControl = true;
    dif = controlEnfrentado(ctx.rng, a, d);
  }
  if (dif <= 0) {
    log(ctx, () => `  ${def.ficha.nombre} gana el control (${dif}).`);
    return;
  }
  if (m === 'derribo') {
    def.derribado = true;
    log(ctx, () => `  ${def.ficha.nombre} cae derribado.`);
  } else if (m === 'presa') {
    soltar(def);
    def.apresadoPor = atk;
    def.paralisis = gradoPresa(dif);
    atk.apresando = def;
    log(ctx, () => `  ${def.ficha.nombre} queda apresado (${['', 'parálisis menor', 'parálisis parcial', 'parálisis completa'][def.paralisis]}).`);
  } else desarmar(ctx, def, atk);
}

/** Lo desarman: pasa a pelear con su perfil sin armas (Core p.92). */
function desarmar(ctx: Contexto, l: Luchador, por: Luchador) {
  if (l.desarmado || l.cap.desarmado) return;
  const s = l.ficha.sinArmas;
  l.desarmado = true;
  l.ficha = {
    ...l.ficha,
    turno: s?.turno ?? l.ficha.turno + 20,
    ataque: s?.ataque ?? Math.floor(l.ficha.ataque / 2),
    defensa: s?.defensa ?? Math.floor(l.ficha.defensa / 2),
    danoBase: s?.danoBase ?? 10,
    tipoAtaque: s?.tipoAtaque ?? 'CON',
    tipoDefensa: s?.tipoDefensa ?? l.ficha.tipoDefensa,
    tamanoArma: undefined,
    arma: { nombre: 'Desarmado', desarmado: true },
  };
  l.cap = capacidades(l.ficha);
  log(ctx, () => `  ${por.ficha.nombre} desarma a ${l.ficha.nombre}.`);
}

function soltar(l: Luchador) {
  if (l.apresadoPor) l.apresadoPor.apresando = null;
  l.apresadoPor = null;
  l.paralisis = 0;
}

/** Intento de zafarse de una Presa: control con −3 (Pankration supremo −5). Devuelve si se libró. */
function zafarse(ctx: Contexto, l: Luchador): boolean {
  const captor = l.apresadoPor;
  if (!captor) return true;
  if (!activo(captor)) {
    soltar(l);
    return true;
  }
  if (l.paralisis >= 3) return false; // presa perfecta: ya no puede librarse
  const yo = Math.max(atributo(l, 'FUE'), atributo(l, 'AGI')) - captor.cap.est.penZafarse + l.cap.est.resistePresaDerribo + modControl(l);
  const el = Math.max(atributo(captor, 'FUE'), atributo(captor, 'DES')) + modControl(captor);
  let dif = controlEnfrentado(ctx.rng, yo, el);
  if (dif <= 0 && l.cap.est.repiteControlDefensivo && !l.repitioControl) {
    l.repitioControl = true;
    dif = controlEnfrentado(ctx.rng, yo, el);
  }
  if (dif > 0) {
    soltar(l);
    l.movioActivo = true;
    log(ctx, () => `${l.ficha.nombre} se zafa de ${captor.ficha.nombre}.`);
    return true;
  }
  log(ctx, () => `${l.ficha.nombre} no logra zafarse.`);
  return false;
}

function ofrecerContra(ctx: Contexto, def: Luchador, atk: Luchador, bono: number) {
  const ilimitadas = def.cap.est.contrasIlimitadas;
  if (
    !activo(atk) || !activo(def) || def.ficha.acumulacion || !puedeActuar(def) ||
    (def.ataquesRestantes <= 0 && !ilimitadas) || !enAlcance(def, atk) || !ia.usarContra(ctx, def, atk, bono)
  ) return;
  atacar(ctx, def, atk, { esContra: true, bono });
}

function aplicarDano(ctx: Contexto, atk: Luchador, def: Luchador, danoPleno: number, resistia: boolean, m: Maniobra) {
  // Inutilizar e Inconsciencia: mitad de daño, pero el crítico se calcula con el pleno (Core p.91-92).
  const dano = esNoLetal(m) ? Math.floor(danoPleno / 2) : danoPleno;
  const pvAntes = def.pv;
  def.pv -= dano;
  atk.stats.danoCausado += dano;
  def.stats.danoRecibido += dano;
  // Samiel: el daño recibido de este enemigo se acumula como bono contra él (Dominus p.92).
  if (def.cap.est.samiel && !def.ficha.acumulacion) def.samiel.set(atk, (def.samiel.get(atk) ?? 0) + dano);
  log(ctx, () => `  ${def.ficha.nombre} pierde ${dano} PV (${def.pv}/${def.ficha.pv}).`);
  // Puntos vulnerables: un ataque apuntado a cabeza, corazón o (para inutilizar) una extremidad
  // critica con 1/10 de los PV actuales (Core p.91, p.97). Inutilizar no funciona con acumulación.
  // Ojos de la Muerte: todo golpe que daña es crítico; contra acumulación, en cambio, todo su cuerpo
  // cuenta como punto vulnerable (Dominus p.78).
  const ojos = atk.cap.est.criticoAutomatico;
  const acumula = !!def.ficha.acumulacion;
  const vulnerable = (esApuntado(m) && !def.cap.est.sangreEterna && !acumula) || (ojos && acumula);
  const critica =
    (ojos && !acumula) || esCritico(danoPleno, pvAntes) || (vulnerable && pvAntes > 0 && danoPleno * 10 >= pvAntes);
  const enuthArcano = atk.cap.est.enuth >= 3;
  if (critica) critico(ctx, atk, def, danoPleno, resistia, m);
  // Enuth arcano: todo ataque que dañe obliga a un control de inconsciencia (Dominus p.43).
  else if (enuthArcano && activo(def)) critico(ctx, atk, def, danoPleno, resistia, 'inconsciencia');
  verificarCaida(ctx, atk, def);
}

function verificarCaida(ctx: Contexto, atk: Luchador, def: Luchador) {
  if (!activo(def)) return;
  // Sangre Eterna: sigue consciente hasta −20×CON (Dominus p.80).
  const limite = def.cap.est.sangreEterna ? -20 * def.ficha.constitucion : 0;
  // Aguanta hasta el quíntuple de su Constitución en negativos; por debajo, muere (Core p.60).
  if (def.pv > limite) return;
  const muere = def.pv < -5 * def.ficha.constitucion && !def.cap.est.sangreEterna;
  // Orochi desencadenada no cae a 0 PV: sigue en pie con un control de Voluntad por asalto (Dominus p.81).
  if (!muere && def.orochi === 2) return;
  caer(ctx, atk, def, muere ? 'muerto' : 'caido');
}

function critico(ctx: Contexto, atk: Luchador, def: Luchador, dano: number, resistia: boolean, m: Maniobra) {
  atk.stats.criticosCausados++;
  const e = atk.cap.est;
  const apuntado = localizacionApuntada(m);
  const vital = m === 'cabeza' || m === 'corazon';
  // Enuth: +20 al crítico para dejar inconsciente; arcano +50 (Dominus p.43).
  const bonoEnuth = m === 'inconsciencia' ? (e.enuth >= 3 ? 50 : e.enuth >= 1 ? 20 : 0) : 0;
  const bono = atk.cap.bonoCritico + e.bonoCriticoEstilos + (vital ? e.bonoCriticoVital : 0) + bonoEnuth;
  const dadoCritico = tirarD100Cerrada(ctx.rng);
  const nivel = nivelCritico(dano + bono, dadoCritico, !!def.ficha.acumulacion);
  const dadoRf = tirarD100Cerrada(ctx.rng);
  // Las Resistencias no sufren el negativo a toda acción (Core p.232).
  const baseRf = def.ficha.rf + def.cap.est.bonoRfCritico;
  const res = baseRf + dadoRf;
  const tiradas = () => {
    const suma = dano + bono + dadoCritico;
    const detalle = suma === nivel ? `${dano + bono}+${dadoCritico}` : `${dano + bono}+${dadoCritico}=${suma}, reducido`;
    return `Crítico ${nivel} [${detalle}] contra RF ${res} [${baseRf}+${dadoRf}]`;
  };
  furiaDeOrochi(ctx, def);
  if (dadoRf === 100 || res >= nivel) {
    log(ctx, () => `  ${tiradas()}: ${def.ficha.nombre} lo resiste${dadoRf === 100 ? ' (100 natural)' : ''}.`);
    return;
  }
  const fallo = nivel - res;
  const loc = apuntado ?? localizar(tirarD100Cerrada(ctx.rng));
  if (fallo <= 50) def.penDolor += fallo;
  else {
    def.penDolor += Math.ceil(fallo / 2);
    def.penFisico += Math.floor(fallo / 2);
  }
  // Un crítico con efectos quita la acción a quien resistía el golpe, a Seraphite arcano y, si pasa
  // de 50, a los seres con acumulación.
  if (def.ficha.acumulacion ? fallo > 50 : resistia || def.modo.seraphite === 3) def.aLaDefensiva = true;
  log(ctx, () => `  ${tiradas()}: ${def.ficha.nombre} falla por ${fallo}${fallo > 50 ? ` (${loc})` : ''}, −${fallo} a toda acción.`);
  if (!activo(def)) return;
  // Inconsciencia: sólo negativos o la inconsciencia buscada, nunca la muerte (Core p.92).
  if (m === 'inconsciencia') {
    if (fallo > 50) caer(ctx, atk, def, 'inconsciente');
    return;
  }
  // Sangre Eterna es inmune a la muerte automática por críticos en puntos vulnerables.
  if (fallo > 100 && (loc === 'cabeza' || loc === 'corazon') && !def.cap.est.sangreEterna) caer(ctx, atk, def, 'muerto');
  else if (fallo > 150 || (fallo > 50 && loc === 'cabeza')) caer(ctx, atk, def, 'inconsciente');
}

/** Sangre de Orochi: al recibir un crítico, control de Voluntad o se desencadena (Dominus p.81). */
function furiaDeOrochi(ctx: Contexto, l: Luchador) {
  if (!l.cap.est.orochi || l.orochi === 2) return;
  // Control de Voluntad sin dificultad precisada: Normal, 10 (Core p.9). Con la sangre despierta, −3.
  if (!controlCaracteristica(ctx.rng, atributo(l, 'VOL') - (l.orochi === 1 ? 3 : 0), 10)) {
    l.orochi = 2;
    if (l.orochiAsaltos < 1) l.orochiAsaltos = 1;
    log(ctx, () => `  ${l.ficha.nombre} desencadena la sangre de Orochi.`);
  }
}

/** Pérdida de PV por mantener la sangre de Orochi (sacrificio) y avance de su activación. */
function sangreDeOrochi(ctx: Contexto, l: Luchador) {
  if (!l.orochi) return;
  l.orochiAsaltos++;
  if (l.orochi === 2 && l.pv <= 0) {
    // Desencadenada, a 0 PV deja de perderlos y hace un control de Voluntad por asalto: si lo falla,
    // cae inconsciente (Dominus p.81). Control sin dificultad precisada: 10 (Core p.9).
    if (!controlCaracteristica(ctx.rng, atributo(l, 'VOL'), 10)) caer(ctx, l, l, 'inconsciente');
    else log(ctx, () => `${l.ficha.nombre} sigue en pie a ${l.pv} PV por la sangre de Orochi.`);
    return;
  }
  const costo = l.orochi === 2 ? 5 : 2;
  // Desencadenada deja de restar al llegar a 0 PV.
  l.pv = l.orochi === 2 ? Math.max(0, l.pv - costo) : l.pv - costo;
  verificarCaida(ctx, l, l);
}

function caer(ctx: Contexto, atk: Luchador, def: Luchador, estado: Luchador['estado']) {
  def.estado = estado;
  def.stats.asaltoCaida = ctx.asalto;
  if (atk !== def) atk.stats.bajas++;
  soltar(def);
  if (def.apresando) soltar(def.apresando);
  liberarAmenazados(ctx, def);
  def.amenazadoPor = null;
  for (const l of ctx.luchadores) l.trabados = l.trabados.filter((e) => e !== def);
  log(ctx, () => `  ${def.ficha.nombre} queda ${estado === 'caido' ? 'fuera de combate' : estado}.`);
}
