// Resolución de un combate completo con dados reales. Las decisiones las toma ./ia.

import type { Contexto, Equipo, Evento, Ficha, FotoLuchador, Luchador, OpcionesEscenario, Tecnica } from './modelo';
import { crearRng, type Rng } from './rng';
import { DADO_FIJO, textoTirada, tirarD100, tirarD100Cerrada, valorTirada, type TiradaD100 } from './dados';
import { capacidades, planDeAtaques, type Ranura } from './rasgos';
import {
  absorcion, bonoContraataque, danoFinal, dificultadDisparo, esCritico, haySorpresa, localizar, nivelCritico, penPifiaTurno,
  umbralPifia, porcentajeDano, resultadoResistencia, type Resistencia, type TipoAtaque,
} from './reglas';
import {
  absorcionContra, activo, ALCANCE, bonoCriticoDe, nro, areaDoblaDano, danoAEscudo, rfCritico, rfDe, ataqueFinal, barreraFrena, danoBase,
  defensaFinal, distancia, enAlcance, enLaLinea, inmuneAlGolpe, posicionDe, cegueraContra, metrosTotales, modControl, reduccionFuego, umbralPifiaTurno, penAccion,
  perfilDe, proximaRanura, puedeActuar, turnoFinal, zonaDe, defensaEscudoMagico, modProyectil, visionEntre, PEN_COBERTURA,
  golpeAPuntoVulnerable,
} from './calculos';
import {
  atributo, caracteristicasControl, mejorCaracteristica, controlCaracteristica, controlEnfrentado, esManiobraDeControl, esNoLetal,
  gradoPresa, localizacionApuntada, modificadorPorResultado, type Maniobra,
} from './maniobras';
import type { Golpe, OpcionesCritico, ParadaArea, ResultadoDefensa } from './golpe';
import { estadoVisible, pasarAsalto } from './condiciones';
import * as ia from './ia';
import * as iaMagia from './ia-magia';
import { efectoAnimico, interceptar, lanzarConjuro, percibirInvisibles, zonasMagicas } from './combate-magia';
import {
  aplicarAuras, destruccionPorKi, detectarPresencias, efectosAlImpactar, estadosAutomaticos, fusion, moverHacia, puntosDePresion, reflectar, repetirFascinacion,
} from './combate-ki';
import { roturaDeArmadura, roturaEnParada } from './rotura';
import { apagarse, arder, mitigarFuego, prender, quemarAlTocar } from './llamas';
import { cruzarMuros, transportar, type Motor } from './efectos';
import { GRADOS } from './conjuros';
import {
  crearEstadoMagia, danoAlAcumular, hacerOtraAccion, escudoDetiene, mantenidoDe, dejarDeMantener, empezarAsaltoMagia, lanzar,
  rmDe, romperEscudo, terminarAsaltoMagia, terminarMantenidos, zeonLibre, actPorCansancio, pagarDeterminada,
  proyeccionDeterminada,
} from './magia';
import { completarArma, dificultadAtrapar, estadoProyectiles, PEN_ATRAPAR_ADICIONAL, PEN_ESQUIVA_TRAS_ATRAPAR, superaTope, TOPE_PROYECTIL, umbralEstallido } from './proyectiles';
import {
  buscarCamino, campoHacia, caminoHasta, celdaDe, celdaLibreCerca, indice, mapaAbierto, prepararMapa, transitable,
  type Celda, type MapaListo,
} from './mapa';
import {
  ajusteTaEnergia, alMatar, curable, fichaConAumento, habilidadesKi, type DecisionKi, dificultadAura, radioAura, alPerderPv,
  alRecibirCritico, crearEstadoKi, ejecutar, empezarAsalto, modDeAccion, ponerEnEspera, terminarAsalto, textoKi, costeKi,
  recuperarKi, type ModKi,
  nivelMenos, vistaPrevia, conIncremento, apresamientoMantenido, presenciaBase, efectosDe, cumpleCircunstancias, defensaSirve,
} from './ki';

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
  mapa: MapaListo;
}

export function crearLuchador(ficha: Ficha, equipo: Equipo, x: number, y: number): Luchador {
  const l: Luchador = {
    ficha, equipo, pos: { x, y }, mapa: null, cap: capacidades(ficha), entorno: {},
    pv: ficha.pv,
    cansancio: ficha.cansancio ?? ficha.constitucion,
    penDolor: 0, penFisico: 0, penTecnica: 0, marcas: new Map(), escudoKi: 0, pantallaKi: 0, fascinado: 0,
    estado: 'activo',
    trabados: [],
    iniciativa: 0, haActuado: false, aLaDefensiva: false, defensaTotal: false,
    ataquesDeclarados: 1, planAtaques: [], ataquesRestantes: 0, defensasHechas: 0, cansancioAsalto: 0,
    movioActivo: false, accionesActivas: 0, metrosMovidos: 0, movioAsaltoAnterior: false, cargando: false, sorprendeA: new Set(), previene: new Set(), previenePendiente: new Set(), planResistir: null,
    derribado: false, paralisis: 0, apresadoPor: null, apresando: null, desarmado: false,
    condiciones: {}, aura: null, curado: 0, amenazadoPor: null, enfundada: false, huyendo: false,
    estiloDefensivo: false,
    modo: { seraphite: 0, berserker: false, ataqueFinal: false },
    bonoVariableEn: null, objetivoUnico: null, godhandListo: false, godhandPreparado: false,
    ki: null, magia: null, bendiciones: [], bono: null, llamas: 0, apagando: false, extasis: false, lazos: null, percibe: new Set(), radioDeteccionKi: 0, armaRota: null, detecta: new Set(), descubre: new Set(), holograma: false, atadura: 0, balas: 0, proyectiles: estadoProyectiles(ficha), apuntando: null, ultimoBlanco: null, disparo: false, atrapadas: 0, ataqueFinalUsado: false, maniobraEspecialVista: new Set(), camuflajeConocido: new Map(), transportesVistos: new Map(), defensaPlena: false, presaExistencial: false, intangiblePor: null, camufladoA: new Set(), previsionContra: null, criticoEnAsalto: false, repitioControl: false, samiel: new Map(), orochi: 0, orochiAsaltos: 0,
    stats: {
      danoCausado: 0, danoRecibido: 0, bajas: 0, criticosCausados: 0, asaltoCaida: null,
      ataquesHechos: 0, contrasHechas: 0, cansancioGastado: 0, asaltosDefensaTotal: 0, maniobras: {}, tecnicas: {},
    },
  };
  l.ki = crearEstadoKi(l);
  l.magia = crearEstadoMagia(l);
  l.balas = l.cap.est.leo ? 6 : 0;
  return l;
}

/** D100 abierta con el umbral de pifia de esa tirada (ver `umbralPifia`). */
function tirar(ctx: Contexto, umbral: number): TiradaD100 {
  return tirarD100(ctx.rng, umbral);
}

/** TA contra energía en el cuerpo, con la Armadura de energía mayor o arcana encendida o no. */
function taEnergia(l: Luchador): number {
  return Math.max(0, (l.ficha.ta.ENE ?? 0) + ajusteTaEnergia(l));
}

function log(ctx: Contexto, texto: string | (() => string), extra?: () => Omit<Evento, 'asalto' | 'texto'>) {
  if (!ctx.registro) return;
  const foto = ctx.luchadores.map((l): FotoLuchador => {
    const f: FotoLuchador = { x: l.pos.x, y: l.pos.y, pv: l.pv, estado: l.estado, aLaDefensiva: l.aLaDefensiva };
    const marcas = estadoVisible(l);
    if (marcas.length) f.marcas = marcas;
    if (l.ki) f.ki = l.ki.reserva;
    if (l.magia) f.zeon = zeonLibre(l.magia);
    return f;
  });
  const turno = ctx.turnoDe ? ctx.luchadores.indexOf(ctx.turnoDe) : undefined;
  const linea = typeof texto === 'string' ? texto : texto();
  const ev: Evento = { asalto: ctx.asalto, texto: linea, foto, turno, ...extra?.() };
  ev.sujeto ??= ev.ataque?.de ?? ev.dano?.quien ?? sujetoDe(ctx, linea);
  ctx.registro.push(ev);
}

/** Nombres de los luchadores, los más largos primero ("Soldado (2)" antes que "Soldado"), por combate. */
const nombresPorCombate = new WeakMap<Contexto, { nombre: string; i: number }[]>();

/**
 * De quién habla una línea que no dice explícitamente su sujeto: el primer nombre que aparece en el
 * texto (un nombre que es parte de otro más largo no cuenta). Sólo corre con el registro prendido.
 */
function sujetoDe(ctx: Contexto, texto: string): number | undefined {
  let nombres = nombresPorCombate.get(ctx);
  if (!nombres) {
    nombres = ctx.luchadores.map((l, i) => ({ nombre: l.ficha.nombre, i })).sort((a, b) => b.nombre.length - a.nombre.length);
    nombresPorCombate.set(ctx, nombres);
  }
  const tapado = new Uint8Array(texto.length);
  let mejor: { i: number; pos: number } | undefined;
  for (const n of nombres) {
    for (let pos = texto.indexOf(n.nombre); pos >= 0; pos = texto.indexOf(n.nombre, pos + 1)) {
      if (tapado[pos] || tapado[pos + n.nombre.length - 1]) continue;
      tapado.fill(1, pos, pos + n.nombre.length);
      if (!mejor || pos < mejor.pos) mejor = { i: n.i, pos };
    }
  }
  return mejor?.i;
}

/** Lo que el motor le presta a los efectos de conjuro (efectos/). */
const MOTOR: Motor = {
  log, tirar, tirarResistencia, tirarRf, perderPv, huir, caer, soltar, desarmar, critico, resolverDefensa, terminado, cambiarFicha,
  verificarCaida, ofrecerContra, aplicarDano, limitePorDano, moverEnLinea,
  prender: (ctx, atk, l, valor) => prender(MOTOR, ctx, atk, l, valor),
  mitigarFuego: (ctx, l, intensidades) => mitigarFuego(MOTOR, ctx, l, intensidades),
};


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
  const { mapa, celdas } = colocar(equipoA.length, equipoB.length, dist, entorno);
  const luchadores = [
    ...equipoA.map((f, i) => crearLuchador(f, 'A', celdas[i].x, celdas[i].y)),
    ...equipoB.map((f, i) => crearLuchador(f, 'B', celdas[equipoA.length + i].x, celdas[equipoA.length + i].y)),
  ];
  for (const l of luchadores) {
    l.entorno = entorno;
    l.mapa = mapa;
    l.enfundada = !!entorno.armasEnfundadas && !l.cap.desarmado;
  }
  // Quien empieza al lado de un enemigo ya está trabado con él.
  for (const a of luchadores)
    for (const b of luchadores)
      if (a.equipo !== b.equipo && enAlcance(a, b) && !a.trabados.includes(b)) a.trabados.push(b);
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
  return { ganador, asaltos: ctx.asalto, luchadores, registro: ctx.registro, mapa };
}

/**
 * Mapa y celdas iniciales (equipo A y después B). Sin mapa, uno abierto: el A en una columna y el B
 * a `distancia` metros, de a uno cada 2 m, con 4 m de margen para rodear. Con mapa, cada uno va a
 * la celda pedida o, si falta o está ocupada, a la libre más cercana a la que le tocaría.
 */
/**
 * El escenario sin mapa: un mapa abierto con el A en una columna y el B a `distancia` metros, de a uno
 * cada 2 m, con 4 m de margen para rodear. La página lo usa para mostrar lo mismo que simula el motor.
 */
export function disposicionAbierta(nA: number, nB: number, distancia: number): { ancho: number; alto: number; A: Celda[]; B: Celda[] } {
  const d = Math.max(1, Math.round(distancia));
  const alto = Math.max(9, 2 * Math.max(nA, nB) + 7);
  const columna = (cant: number, x: number) => Array.from({ length: cant }, (_, i) => ({ x, y: Math.floor(alto / 2) - (cant - 1) + 2 * i }));
  return { ancho: d + 9, alto, A: columna(nA, 4), B: columna(nB, 4 + d) };
}

function colocar(nA: number, nB: number, distancia: number, e: OpcionesEscenario): { mapa: MapaListo; celdas: Celda[] } {
  const d = Math.max(1, Math.round(distancia));
  const abierta = e.mapa ? null : disposicionAbierta(nA, nB, distancia);
  const mapa = e.mapa ? prepararMapa(e.mapa) : mapaAbierto(abierta!.ancho, abierta!.alto);
  const xA = Math.min(1, mapa.ancho - 1);
  const xB = Math.max(0, Math.min(mapa.ancho - 2, xA + d));
  const columna = (cant: number, x: number, i: number): Celda => ({ x, y: Math.floor(mapa.alto / 2) - (cant - 1) + 2 * i });
  const ocupadas = new Set<number>();
  const celdas: Celda[] = [];
  const ubicar = (pedida: Celda | null | undefined, porDefecto: Celda) => {
    const quiere = pedida && transitable(mapa, pedida) && !ocupadas.has(indice(mapa, pedida)) ? pedida : porDefecto;
    const c = celdaLibreCerca(mapa, { x: Math.max(0, Math.min(mapa.ancho - 1, quiere.x)), y: Math.max(0, Math.min(mapa.alto - 1, quiere.y)) }, ocupadas);
    if (!c) throw new Error('No entran todos los luchadores en el mapa.');
    ocupadas.add(indice(mapa, c));
    celdas.push(c);
  };
  for (let i = 0; i < nA; i++) ubicar(e.posiciones?.A?.[i], abierta ? abierta.A[i] : columna(nA, xA, i));
  for (let i = 0; i < nB; i++) ubicar(e.posiciones?.B?.[i], abierta ? abierta.B[i] : columna(nB, xB, i));
  return { mapa, celdas };
}

function jugarAsalto(ctx: Contexto) {
  const vivos = ctx.luchadores.filter(activo);
  for (const l of vivos) {
    l.haActuado = false; l.aLaDefensiva = false; l.defensasHechas = 0; l.cansancioAsalto = 0;
    l.movioAsaltoAnterior = l.metrosMovidos > 0;
    l.movioActivo = false; l.accionesActivas = 0; l.metrosMovidos = 0; l.sorprendeA.clear(); l.objetivoUnico = null;
    l.disparo = false; l.ultimoBlanco = null; l.atrapadas = 0;
    l.planResistir = null;
    l.repitioControl = false;
    l.previsionContra = null;
    l.criticoEnAsalto = false;
    // Godhand: el ataque sacrificado el asalto anterior potencia el primero de este.
    l.godhandListo = l.godhandPreparado;
    l.godhandPreparado = false;
  }

  // 1. Declaración simultánea: todos deciden viendo el asalto anterior, después se aplica.
  ctx.ventaja = ia.ventajaEquipos(ctx);
  const declaraciones = vivos.map((l) => ia.declarar(ctx, l));
  for (const [i, l] of vivos.entries()) {
    const d = declaraciones[i];
    // Ira (Core p.232): se lanza al ataque, no se queda a la defensiva.
    if (l.bono?.ira) d.defensaTotal = false;
    l.defensaTotal = d.defensaTotal;
    l.ataquesDeclarados = Math.max(1, d.ataques);
    l.estiloDefensivo = d.estiloDefensivo;
    l.modo = { seraphite: d.seraphite, berserker: d.berserker, ataqueFinal: l.modo.ataqueFinal || d.ataqueFinal };
    if (d.ataqueFinal) l.ataqueFinalUsado = true;
    l.bonoVariableEn = d.bonoVariableEn;
    l.previene = new Set(d.preverSorpresa);
    l.previenePendiente = new Set(d.preverSorpresa);
    // Carga (Tabla 43, Core p.90): se declara antes de la iniciativa, corriendo hacia un enemigo desde
    // el asalto anterior y sin estar trabado. Quien puede cargar y va a atacar, carga.
    l.cargando = !d.defensaTotal && l.movioAsaltoAnterior && !l.derribado && !l.apresadoPor &&
      !ctx.luchadores.some((e) => e.equipo !== l.equipo && activo(e) && enAlcance(l, e));
    if (l.cargando) log(ctx, () => `${l.ficha.nombre} carga.`);
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
    // Magia: paga los conjuros mantenidos y acumula su ACT (pasivo, Core p.117).
    if (l.magia) {
      const plan = iaMagia.planMagia(ctx, l);
      if (plan.cansancio) {
        gastarCansancio(l, plan.cansancio);
        log(ctx, () => `${l.ficha.nombre} gasta ${plan.cansancio} de cansancio en su ACT (+${actPorCansancio(l) * plan.cansancio!}).`);
      }
      if (plan.consumirVida) log(ctx, () => `${l.ficha.nombre} consume ${plan.consumirVida} PV por ${(plan.consumirVida! / 5) * 100} de zeon (Consumir Vida por Magia).`);
      if (plan.sacrificioPoder) log(ctx, () => `${l.ficha.nombre} sacrifica ${plan.sacrificioPoder} de zeon por +${(plan.sacrificioPoder! / 10) * 5} al ACT (Sacrificio de Poder).`);
      empezarAsaltoMagia(l, plan);
      if (plan.consumirVida) verificarCaida(ctx, l, l);
      // Pasarle zeon a un aliado con el Don: su ACT por asalto, en contacto o, con Transmisión de Magia,
      // hasta su Presencia en metros (Core p.117, Arcana p.29).
      if (plan.transferir?.a.magia) {
        const z = Math.min(plan.transferir.zeon, zeonLibre(l.magia));
        l.magia.reserva -= z;
        plan.transferir.a.magia.reserva += z;
        log(ctx, () => `${l.ficha.nombre} le pasa ${z} de zeon a ${plan.transferir!.a.ficha.nombre} (reserva ${l.magia!.reserva}).`);
      }
      const e = l.magia;
      if (plan.innato) log(ctx, () => `${l.ficha.nombre} se dispone a usar su magia innata (no acumula).`);
      else if (e.ganado && e.ganadoEn === 'preparado' && e.preparado)
        log(ctx, () => `${l.ficha.nombre} prepara ${e.preparado!.conjuro.nombre} (${GRADOS[e.preparado!.grado]}): ${e.preparado!.zeon} de ${e.preparado!.conjuro.grados[e.preparado!.grado].zeon} (reserva ${e.reserva}).`);
      else if (e.ganado) log(ctx, () => `${l.ficha.nombre} acumula zeon: ${e.acumulado} (reserva ${e.reserva}).`);
    }
    // Ki: suelta lo que ya no conviene mantener, paga mantenidas y técnicas en espera, y acumula
    // (acumular es pasivo, Core p.102). Una técnica que cambia el turno se declara antes de calcular
    // la iniciativa (Core p.105).
    if (l.ki) {
      const decision = ia.decisionKi(ctx, l, d.acumularKi);
      for (const t of decision.soltar) log(ctx, () => `${l.ficha.nombre} deja de mantener ${t.nombre}.`);
      for (const t of decision.liberar) log(ctx, () => `${l.ficha.nombre} deja ir ${t.nombre}, que tenía en espera.`);
      const armaduraAntes = l.ki.armaduraActiva;
      const auraAntes = l.ki.auraActiva;
      const cansancioAntes = l.cansancio;
      empezarAsalto(l, decision, penAccion(l), ctx.asalto);
      if (l.ki.armaduraActiva && !armaduraAntes) log(ctx, () => `${l.ficha.nombre} enciende su Armadura de energía (TA ${taEnergia(l)} contra energía) [reserva ${l.ki!.reserva}].`);
      if (!l.ki.armaduraActiva && armaduraAntes) log(ctx, () => `${l.ficha.nombre} apaga su Armadura de energía.`);
      if (l.ki.auraActiva && !auraAntes) log(ctx, () => `${l.ficha.nombre} desencadena su Aura de combate (dificultad ${dificultadAura(l, penAccion(l))}, ${radioAura(l)} m) [reserva ${l.ki!.reserva}].`);
      aumentoDeCaracteristicas(ctx, l, decision.aumentar);
      if (l.cansancio > cansancioAntes) log(ctx, () => `${l.ficha.nombre} usa Recuperación: recupera un punto de cansancio con 5 de Ki (reserva ${l.ki!.reserva}).`);
      if (d.acumularKi) log(ctx, () => `${l.ficha.nombre} acumula Ki: ${textoKi(l)}.`);
      const tecnica = ia.tecnicaDeTurno(ctx, l);
      if (tecnica) {
        ejecutar(l, tecnica);
        l.stats.tecnicas[tecnica.nombre] = (l.stats.tecnicas[tecnica.nombre] ?? 0) + 1;
        log(ctx, () => `${l.ficha.nombre} ejecuta ${tecnica.nombre} [Ki ${textoKi(l)}].`);
        trasLaTecnica(ctx, l);
        // Intangibilidad con Afectar a otros: también a los aliados que elija (Dominus p.69).
        const otros = l.ki!.activo.intangibleOtros;
        if (otros) for (const a of ia.aliadosIntangibles(ctx, l, otros * presenciaBase(l.ficha))) {
          a.intangiblePor = l;
          log(ctx, () => `  ${a.ficha.nombre} también se vuelve intangible.`);
        }
      }
    }
  }

  aplicarAuras(MOTOR, ctx, vivos);
  zonasMagicas(MOTOR, ctx);
  percibirInvisibles(MOTOR, ctx);
  detectarPresencias(MOTOR, ctx);

  // 2. Iniciativa: turno + d100 abierta. Una pifia en turno actúa automáticamente último, sin nivel
  // de pifia; para la sorpresa vale el turno con el penalizador de la Tabla 52 (Core p.98). El turno
  // no es una habilidad: la maestría no baja el umbral, Buena suerte sí (Core p.21).
  const desempate = new Map<Luchador, number>();
  const pifiados = new Set<Luchador>();
  const paraSorpresa = new Map<Luchador, number>();
  // A igual resultado, actúa primero quien tenga mayor turno final (Core p.86).
  const turnos = new Map<Luchador, number>();
  const tiradas = ctx.registro ? new Map<Luchador, string>() : null;
  for (const l of vivos) {
    desempate.set(l, ctx.rng.next());
    const t = tirarD100(ctx.rng, umbralPifiaTurno(l));
    const turno = turnoFinal(l);
    turnos.set(l, turno);
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
      turnos.get(b)! - turnos.get(a)! || desempate.get(b)! - desempate.get(a)!,
  );
  log(ctx, () => `Iniciativa: ${orden.map((l) => `${l.ficha.nombre} ${l.iniciativa} [${tiradas!.get(l)}]${l.defensaTotal ? ' (defensa total)' : ` (${l.ataquesDeclarados} at.)`}`).join(', ')}`,
    () => ({ orden: orden.map((l) => nro(ctx, l)) }));
  for (const a of vivos)
    for (const b of vivos)
      // Uroboros sorprende con 100 de diferencia en vez de 150 (Dominus p.79).
      if (
        a.equipo !== b.equipo && !b.previene.has(a) &&
        haySorpresa(paraSorpresa.get(a)! - paraSorpresa.get(b)!, a.cap.est.diferenciaSorpresa)
      ) {
        a.sorprendeA.add(b);
        // Previsión: vale contra uno solo de los que lo sorprenden (Dominus p.57).
        if (b.ki?.activo.prevision && !b.previsionContra) b.previsionContra = a;
        log(ctx, () => `${a.ficha.nombre} sorprende a ${b.ficha.nombre} (${paraSorpresa.get(a)! - paraSorpresa.get(b)!} de diferencia).`);
      }

  // 3. Acciones en orden.
  for (const l of orden) {
    if (terminado(ctx)) break;
    ctx.turnoDe = l;
    turno(ctx, l);
  }
  ctx.turnoDe = null;

  // 4. Fin del asalto.
  for (const l of ctx.luchadores) {
    if (!activo(l)) continue;
    // Quien está apresado y no pudo actuar puede intentar zafarse igual (Core p.92).
    if (l.apresadoPor && !l.haActuado) zafarse(ctx, l);
    l.penDolor = Math.max(0, l.penDolor - 5);
    l.penTecnica = Math.max(0, l.penTecnica - 10);
    // Condiciones con duración: un asalto menos (parálisis inducida, ceguera).
    if (pasarAsalto(l).includes('ceguera')) log(ctx, () => `${l.ficha.nombre} vuelve a ver.`);
    arder(MOTOR, ctx, l);
    if (!activo(l)) continue;
    sangreDeOrochi(ctx, l);
    // Si junta la técnica que declaró al empezar a acumular y no la usó, la deja en espera para no
    // perder ese Ki al terminar el asalto (Core p.105).
    const espera = ia.tecnicaParaEspera(ctx, l);
    if (espera) {
      ponerEnEspera(l, espera);
      log(ctx, () => `${l.ficha.nombre} deja ${espera.nombre} en espera.`);
    }
    // Si además de acumular hizo cualquier otra cosa, lo ganado este asalto queda en la mitad.
    terminarAsalto(l, l.defensaTotal || l.defensasHechas > 0 || l.metrosMovidos > 0 || l.ataquesRestantes < l.planAtaques.length);
    terminarAsaltoMagia(l);
  }
}

function turno(ctx: Contexto, l: Luchador) {
  // Recuperar acción (Ki): a la defensiva, si no recibió un crítico, ejecuta la técnica y vuelve a
  // poder actuar; no le da ataques que ya no tenga (Dominus p.57).
  if (activo(l) && l.aLaDefensiva && !l.defensaTotal && l.ataquesRestantes > 0 && !l.criticoEnAsalto) {
    const t = ia.recuperarAccion(ctx, l);
    if (t) {
      ejecutar(l, t);
      l.stats.tecnicas[t.nombre] = (l.stats.tecnicas[t.nombre] ?? 0) + 1;
      l.aLaDefensiva = false;
      log(ctx, () => `${l.ficha.nombre} usa ${t.nombre} [Ki ${textoKi(l)}] y recupera la acción.`);
    }
  }
  if (activo(l) && l.aLaDefensiva && !l.defensaTotal && l.ataquesRestantes > 0)
    log(ctx, () => `${l.ficha.nombre} está a la defensiva: no puede actuar este asalto.`);
  if (puedeActuar(l) && ctx.opciones.huida && !l.bono?.ira && ia.quiereHuir(ctx, l)) {
    retirarse(ctx, l);
    l.haActuado = true;
    return;
  }
  if (puedeActuar(l)) {
    // Levantarse es una acción activa: lo siguiente va con −25 (acumulable con moverse, Core p.87).
    if (l.derribado) {
      l.derribado = false;
      l.accionesActivas++;
      log(ctx, () => `${l.ficha.nombre} se levanta.`);
    }
    if (l.apresadoPor && !zafarse(ctx, l)) l.ataquesRestantes = 0;
    ia.prepararGodhand(ctx, l);
    // En llamas: apagarse ocupa el turno (Core p.236).
    if (l.llamas && l.ataquesRestantes > 0 && iaMagia.quiereApagarse(ctx, l)) apagarse(MOTOR, ctx, l);
    // Un arma a distancia: disparar, recargar o apuntar ocupa el turno (Core p.94-96).
    // Magia: lanzar los conjuros que convengan, o esperar acumulando (Core p.117).
    const magia = l.ataquesRestantes > 0 && puedeActuar(l) ? iaMagia.accionMagica(ctx, l) : null;
    if (magia) {
      if ('lanzar' in magia) for (const x of magia.lanzar) if (puedeActuar(l) && !terminado(ctx)) lanzarConjuro(MOTOR, ctx, l, x);
      l.ataquesRestantes = 0;
      l.disparo = true;
    }
    const distancia0 = l.ataquesRestantes > 0 && puedeActuar(l) ? ia.accionADistancia(ctx, l) : null;
    if (distancia0) accionADistancia(ctx, l, distancia0);
    while (l.ataquesRestantes > 0 && puedeActuar(l) && !terminado(ctx)) {
      // Curación por Ki: una acción activa en lugar de un ataque (interpretación, Core p.104).
      const cura = ia.curacionKi(ctx, l);
      if (cura) {
        curar(ctx, l, cura.quien, cura.ki);
        l.ataquesRestantes--;
        continue;
      }
      // Estados de condición automática: una acción activa sin tirada de ataque (Dominus p.67).
      const auto = ia.estadosAutomaticos(ctx, l);
      if (auto) {
        estadosAutomaticos(MOTOR, ctx, l, auto.tecnica, auto.blancos);
        l.ataquesRestantes--;
        continue;
      }
      const obj = ia.elegirObjetivo(ctx, l);
      // Lejos de su objetivo (o sin ninguno al que llegar): una técnica a distancia en vez de acercarse.
      const lejos = !obj || !enAlcance(l, obj) ? ia.ataqueADistancia(ctx, l) : null;
      if (lejos) {
        atacar(ctx, l, lejos.objetivo, { esContra: false, bono: 0, tecnica: lejos.tecnica });
        continue;
      }
      if (!obj) break;
      if (!enAlcance(l, obj)) {
        mover(ctx, l, obj);
        if (!enAlcance(l, obj)) break;
      }
      atacar(ctx, l, obj, { esContra: false, bono: 0 });
    }
    // Apuntar se pierde si hace otra cosa (Tabla 47).
    if (!l.disparo) l.apuntando = null;
    // Sin ataques pero sin trabarse: igual se acerca (salvo quien usó un arma a distancia).
    if (l.ataquesRestantes === 0 && !l.disparo && puedeActuar(l) && !l.trabados.some(activo) && !l.apresadoPor) {
      const obj = ia.elegirObjetivo(ctx, l);
      if (obj && !enAlcance(l, obj)) mover(ctx, l, obj);
    }
  }
  l.sorprendeA.clear();
  l.haActuado = true;
}

/**
 * Aumento de características (Core p.105, Dominus p.21): activarlo cuesta tanto Ki como el valor que
 * alcanza la característica; después, 1 de Ki por asalto (cada 10 con Incremento superior). Si no
 * puede pagar, la característica vuelve a su valor.
 */
function aumentoDeCaracteristicas(ctx: Contexto, l: Luchador, pedido: DecisionKi['aumentar']) {
  const e = l.ki!;
  const a = e.aumento;
  if (a) {
    a.asaltos++;
    if (a.asaltos < habilidadesKi(l.ficha).asaltosPorPagoAumento) return;
    a.asaltos = 0;
    if (e.reserva >= 1) {
      e.reserva--;
      return;
    }
    l.ficha = fichaConAumento(l.ficha, a.atributo, a.hasta, a.desde);
    l.cap = capacidades(l.ficha);
    e.aumento = null;
    log(ctx, () => `${l.ficha.nombre} no puede mantener el Aumento de características: ${a.atributo} vuelve a ${a.desde}.`);
    return;
  }
  if (!pedido || e.reserva < pedido.hasta) return;
  const desde = atributo(l, pedido.atributo);
  e.reserva -= pedido.hasta;
  e.aumento = { atributo: pedido.atributo, desde, hasta: pedido.hasta, asaltos: 0 };
  l.ficha = fichaConAumento(l.ficha, pedido.atributo, desde, pedido.hasta);
  l.cap = capacidades(l.ficha);
  log(ctx, () => `${l.ficha.nombre} usa Aumento de características: ${pedido.atributo} ${desde} → ${pedido.hasta} [reserva ${e.reserva}].`);
}

/** Curación por Ki: 2 PV (5 con la superior) por punto de Ki, sin pasar la mitad del daño sufrido. */
function curar(ctx: Contexto, l: Luchador, quien: Luchador, ki: number) {
  const pv = Math.min(ki * habilidadesKi(l.ficha).curacion, curable(quien));
  l.ki!.reserva -= ki;
  quien.pv += pv;
  quien.curado += pv;
  log(ctx, () => `${l.ficha.nombre} usa Curación por Ki${quien === l ? '' : ` en ${quien.ficha.nombre}`}: ${ki} de Ki, recupera ${pv} PV (${quien.pv}/${quien.ficha.pv}) [reserva ${l.ki!.reserva}].`);
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
    const base = conIncremento(l.ficha.acrobacias, l.ki?.activo.acrobacias ?? 0) - penAccion(l);
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
  if (disponible <= 0) return;
  const desde = { ...l.pos };
  const celdas: { x: number; y: number }[] = [];
  const paso = l.mapa ? moverEnMapa(ctx, l, obj, l.mapa, disponible, celdas) : moverEnLinea(l, obj, disponible);
  if (!celdas.length) celdas.push(desde, { ...l.pos });
  if (paso <= 0) return;
  cruzarMuros(MOTOR, ctx, l, desde);
  l.metrosMovidos += paso;
  ctx.movimientosEnAsalto++;
  const yaActivo = l.movioActivo;
  if (l.metrosMovidos > total / 4 && !yaActivo) {
    l.movioActivo = true;
    hacerOtraAccion(l);
    // En carga, correr no penaliza el ataque (Core p.90).
    if (!l.cargando) l.accionesActivas++;
  }
  const nota = l.movioActivo && !yaActivo ? (l.cargando ? ' (a la carga)' : ' (acción activa, −25)') : '';
  log(ctx, () => `${l.ficha.nombre} avanza ${paso.toFixed(1)} m${nota}.`, () => ({ camino: { quien: nro(ctx, l), celdas } }));
  for (const e of ctx.luchadores) {
    if (e.equipo === l.equipo || !activo(e) || !enAlcance(l, e)) continue;
    if (!e.trabados.includes(l)) e.trabados.push(l);
    if (!l.trabados.includes(e)) l.trabados.push(e);
  }
}

/**
 * En el mapa: entre las celdas a las que llega con lo que le queda de movimiento, sin pisar muros
 * ni a otros, va a la que lo deja más cerca de trabarse con `obj` (y, a igual distancia, a la que
 * le cuesta menos). Devuelve los metros caminados.
 */
function moverEnMapa(ctx: Contexto, l: Luchador, obj: Luchador, m: MapaListo, disponible: number, camino: Celda[]): number {
  const ocupadas = m.ocupadas.fill(0);
  for (const x of ctx.luchadores) if (x !== l && activo(x)) ocupadas[indice(m, x.pos)] = 1;
  const falta = campoHacia(m, obj.pos);
  // La primera celda trabada con el objetivo que sale de la búsqueda es la más barata: ahí termina.
  let mejor = buscarCamino(m, l.pos, ocupadas, disponible + 1e-6, (i) => falta[i] === 0);
  const costo = m.costos;
  if (mejor < 0) {
    // No llega este asalto: la celda alcanzable que más lo acerca (y, a igual distancia, la más barata).
    mejor = indice(m, l.pos);
    for (let i = 0; i < costo.length; i++) {
      if (costo[i] === Infinity) continue;
      if (falta[i] < falta[mejor] - 1e-6 || (Math.abs(falta[i] - falta[mejor]) < 1e-6 && costo[i] < costo[mejor])) mejor = i;
    }
  }
  if (mejor === indice(m, l.pos)) return 0;
  const hasta = celdaDe(m, mejor);
  // El recorrido sólo hace falta para verlo en vivo.
  if (ctx.registro) camino.push(...caminoHasta(m, l.pos, hasta));
  l.pos = hasta;
  return costo[mejor];
}

/** Sin mapa: en línea recta hacia el objetivo, ubicándose alrededor de él al llegar. */
function moverEnLinea(l: Luchador, obj: Luchador, disponible: number): number {
  const d = distancia(l, obj);
  const falta = d - ALCANCE * 0.75;
  const paso = Math.min(Math.max(0, falta), disponible);
  if (paso <= 0) return 0;
  if (paso >= falta) {
    // Llega: se ubica alrededor del objetivo, repartiendo el ángulo entre los que ya están.
    const base = Math.atan2(l.pos.y - obj.pos.y, l.pos.x - obj.pos.x);
    const k = obj.trabados.length;
    const ang = base + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 4);
    l.pos = { x: obj.pos.x + Math.cos(ang) * ALCANCE * 0.75, y: obj.pos.y + Math.sin(ang) * ALCANCE * 0.75 };
  } else {
    l.pos = { x: l.pos.x + ((obj.pos.x - l.pos.x) / d) * paso, y: l.pos.y + ((obj.pos.y - l.pos.y) / d) * paso };
  }
  return paso;
}

function gastarCansancio(l: Luchador, puntos: number) {
  l.cansancio -= puntos;
  l.cansancioAsalto += puntos;
  l.stats.cansancioGastado += puntos;
}

export interface Ataque {
  esContra: boolean;
  bono: number;
  /** Técnica de Ki ya elegida (p. ej. un ataque a distancia que la IA decidió antes de moverse): se usa tal cual. */
  tecnica?: Tecnica | null;
  /** Disparo o lanzamiento: qué arma a distancia de la ficha y su penalizador por recarga o cadencia. */
  proyectil?: { arma: number; pen: number };
  /** Ataque natural: sin maniobras ni técnica (el que frena una retirada por Transporte, Dominus p.59). */
  natural?: boolean;
}

const NOMBRE_MANIOBRA: Record<Maniobra, string> = {
  normal: 'ataca', derribo: 'intenta derribar', presa: 'intenta apresar', desarmar: 'intenta desarmar',
  area: 'ataca en área', cabeza: 'apunta a la cabeza de', corazon: 'apunta al corazón de',
  inutilizar: 'intenta inutilizar', inconsciencia: 'intenta dejar inconsciente', combinado: 'hace un ataque combinado',
  engatillar: 'intenta engatillar', puntosPresion: 'ataca los puntos de presión de', lineas: 'apunta a las líneas existenciales de',
  destruccionKi: 'usa Destrucción por Ki contra',
};

export function atacar(ctx: Contexto, atk: Luchador, def: Luchador, a: Ataque) {
  golpear(ctx, atk, def, a);
  trasLaTecnica(ctx, atk);
}

/**
 * Lo que una técnica le hace al terminar la acción (Dominus p.74-75): Pérdida del arma (se destroza;
 * queda desarmado) y Técnica final (muere).
 */
function trasLaTecnica(ctx: Contexto, l: Luchador) {
  const p = l.ki?.pendiente;
  if (!p || (!p.arma && !p.final)) return;
  if (p.arma) {
    p.arma = false;
    log(ctx, () => `  La energía destroza el arma de ${l.ficha.nombre}.`);
    desarmar(ctx, l, l);
  }
  if (p.final) {
    p.final = false;
    if (l.estado === 'activo') caer(ctx, l, l, 'muerto');
  }
}

function golpear(ctx: Contexto, atk: Luchador, def: Luchador, a: Ataque) {
  ctx.ataquesEnAsalto++;
  atk.stats.ataquesHechos++;
  if (a.esContra) atk.stats.contrasHechas++;
  // Atacar es hacer otra cosa que lanzar: si acumulaba magia, este asalto acumula la mitad (Core p.117).
  hacerOtraAccion(atk);

  // Selene: dobla el bono del contraataque peleando sin armas (Dominus p.39).
  const bono = a.esContra && atk.cap.est.doblaBonoContra ? a.bono * 2 : a.bono;
  // Transporte automático (Ki): con una técnica que lo lleva hasta el blanco aparece junto a él y lo
  // golpea cuerpo a cuerpo (Dominus p.59).
  const transporte = a.tecnica && !enAlcance(atk, def) ? vistaPrevia(atk, a.tecnica).transporte : 0;
  if (transporte && distancia(atk, def) <= transporte + ALCANCE) aparecerJunto(ctx, atk, def);
  // Fuera del cuerpo a cuerpo sólo se ataca con una técnica a distancia (Dominus p.57) o un arma a
  // distancia (Core p.94): hace falta verlo, y la cobertura resta 40.
  const aDistancia = !enAlcance(atk, def);
  const vision = aDistancia ? visionEntre(ctx.luchadores, atk, def) : 'libre';
  // Un disparo o lanzamiento lleva su ranura (habilidad, daño y crítico del arma) y la Tabla 47; una
  // técnica a distancia no goza de esos modificadores (Dominus p.57), pero la tapa la cobertura.
  const arma = a.proyectil ? atk.ficha.armasDistancia![a.proyectil.arma] : undefined;
  const tabla47 = arma ? modProyectil(atk, def, arma, vision) : null;
  const ranuraProyectil: Ranura | undefined = arma ? { pen: a.proyectil!.pen, sinArmas: false, proyectil: arma, lejos: tabla47!.lejos } : undefined;
  const bonoFinal = bono + (tabla47 ? tabla47.bono : vision === 'cobertura' ? -PEN_COBERTURA : 0);
  // Declaraciones antes de tirar: maniobra, cansancio, Samiel, y del lado del defensor lo mismo.
  const plan = ia.elegirManiobra(ctx, atk, def, a.esContra, bonoFinal, a.tecnica, ranuraProyectil, a.natural);
  const m = plan.maniobra;
  atk.stats.maniobras[m] = (atk.stats.maniobras[m] ?? 0) + 1;
  // La presencian el blanco y los rivales activos que ven al atacante (interpretación de "presenciado").
  if (plan.especial)
    for (const x of ctx.luchadores)
      if (x === def || (x.equipo !== atk.equipo && activo(x) && visionEntre(ctx.luchadores, x, atk) !== 'bloqueada')) atk.maniobraEspecialVista.add(x);
  // Técnica de Ki: se declara antes de tirar y gasta lo concentrado (Core p.105). Sin técnica nueva
  // valen los efectos de Asalto activos y, una vez por asalto, los de Acción de una mantenida.
  let ki: ModKi | undefined;
  if (plan.tecnica) {
    ki = ejecutar(atk, plan.tecnica);
    atk.stats.tecnicas[plan.tecnica.nombre] = (atk.stats.tecnicas[plan.tecnica.nombre] ?? 0) + 1;
  } else ki = modDeAccion(atk, 'ataque', true);
  // Ataque especializado: contra otra clase de defensa la técnica no tiene ningún efecto (Dominus p.72).
  if (ki?.soloContra && (def.ficha.acumulacion ? 'acumulacion' : def.ficha.tipoDefensa ?? 'parada') !== ki.soloContra) ki = atk.ki?.activo;
  // Circunstancia de combate: fuera de ella, tampoco (Dominus p.72).
  const circunstancias = plan.tecnica ? efectosDe(plan.tecnica).desventajas.circunstanciasCombate : [];
  if (circunstancias.length && !cumpleCircunstancias(circunstancias, atk, def, posicionDe(atk, def) === 'espalda', cegueraContra(def, atk).nivel > 0)) ki = atk.ki?.activo;
  // Compleja: +2 al índice de pifia (Dominus p.72).
  const compleja = plan.tecnica && efectosDe(plan.tecnica).desventajas.compleja ? 2 : 0;
  // Sacrificio vital (Aumento de daño): PV a cambio de daño base (Dominus p.54).
  const sacrificio = ki?.sacrificioVital ? ia.sacrificioDeDano(ctx, atk, def, ki, { maniobra: m, tipo: plan.tipo, esContra: a.esContra }) : 0;
  if (ki && sacrificio) {
    atk.pv -= sacrificio;
    ki = { ...ki, dano: ki.dano + ki.sacrificioVital * sacrificio };
    log(ctx, () => `${atk.ficha.nombre} sacrifica ${sacrificio} PV (+${ki!.sacrificioVital * sacrificio} al daño base) [${atk.pv}/${atk.ficha.pv}].`);
  }
  // Destrucción por Ki: se paga al usarla (1 de Ki más los extra), alcance o no (Core p.104).
  if (m === 'destruccionKi') atk.ki!.reserva -= 1 + (plan.kiDestruccion ?? 0);
  const cAtk = ia.cansancioAtaque(ctx, atk, def, bono, plan);
  gastarCansancio(atk, cAtk);
  const samielAtk = ia.gastoSamiel(atk, def, 'ataque');
  // La ranura (qué ataque del asalto es) se fija antes de gastarlo: decide arma o patada.
  const ranura = ranuraProyectil ?? proximaRanura(atk);
  if (arma) {
    const st = atk.proyectiles[a.proyectil!.arma];
    if (arma.leo) atk.balas--;
    else st.municion--;
    st.enRecamara--;
  }
  const opcionesAtk = {
    bono: bonoFinal, cansancio: cAtk, maniobra: m, esContra: a.esContra, tipo: ki?.elemento || plan.tipo, especial: plan.especial, samiel: samielAtk, ranura,
    estadoMushin: plan.estadoMushin ?? null, ki, kiDestruccion: plan.kiDestruccion, costeTecnica: plan.tecnica ? costeKi(plan.tecnica) : 0,
    aDistancia,
  };
  // Ataque Predeterminado: la habilidad final es un valor fijo y no se tiran dados (Dominus p.51).
  const fijo = ki?.ataqueFijo ?? 0;
  const habAtk = fijo || ataqueFinal(atk, def, opcionesAtk);
  if (samielAtk) atk.samiel.set(def, (atk.samiel.get(def) ?? 0) - samielAtk);
  if (!a.esContra || !atk.cap.est.contrasIlimitadas) atk.ataquesRestantes--;
  if (!ranura.sinArmas) atk.enfundada = false;
  if (!a.esContra && atk.cap.est.xingQuan) atk.objetivoUnico = def;
  const godhand = atk.godhandListo;
  atk.godhandListo = false;
  atk.previenePendiente.delete(def);

  const origen = { ...atk.pos };
  const etiquetaPara = (b: Luchador) => `${atk.ficha.nombre}${a.esContra ? ` contraataca (+${bono}) y` : ''} ${arma && m === 'normal' ? (arma.clase === 'disparo' ? 'dispara' : 'lanza') : NOMBRE_MANIOBRA[m]}${m === 'cabeza' || m === 'corazon' || m === 'lineas' ? '' : ' a'} ${b.ficha.nombre}${arma ? ` con ${arma.nombre}` : ranura.sinArmas ? ' con una patada' : ranura.pen > 0 ? ' con la segunda arma' : ''}${godhand ? ' (Godhand)' : ''}${plan.especial ? ' (Maniobra Especial)' : ''}${plan.tecnica ? ` con ${plan.tecnica.nombre} [Ki ${textoKi(atk)}]` : ''}${aDistancia ? ` desde ${Math.hypot(origen.x - b.pos.x, origen.y - b.pos.y).toFixed(0)} m` : ''}${cAtk ? ` gastando ${cAtk} de cansancio` : ''}`;

  // Ataque adicional (Ki): más golpes con los mismos efectos y sin penalizador (Dominus p.55); los
  // limitados, sin los demás efectos de la técnica. Si una contra lo pone a la defensiva, no sigue. El
  // cansancio sólo vale en el primero, salvo con Bono de cansancio añadido (Dominus p.56).
  const conEfectos = 1 + (ki?.ataquesAdicionales ?? 0);
  const golpes = conEfectos + (ki?.adicionalesLimitados ?? 0);
  const kiBase = atk.ki?.activo;
  const opcionesLimitado = { ...opcionesAtk, ki: kiBase, tipo: kiBase?.elemento || plan.tipo, cansancio: 0, costeTecnica: 0 };
  const habLimitado = golpes > conEfectos ? ataqueFinal(atk, def, opcionesLimitado) : 0;
  const habSinCansancio = golpes > 1 && cAtk && !ki?.cansancioAnadido ? fijo || ataqueFinal(atk, def, { ...opcionesAtk, cansancio: 0 }) : habAtk;
  // Un proyectil no pasa de un resultado final de 280, salvo que extienda su Ki al arma (Core p.95).
  const conTope = !!arma && !superaTope(atk.ficha);
  // Estela de destrucción: alcanza también a quien esté en la línea recta hasta el blanco; con
  // Proyección, el atacante viaja con su ataque hasta él (Dominus p.58).
  const estela = aDistancia && ki?.estela ? enLaLinea(ctx.luchadores, atk, def) : [];
  if (aDistancia && ki?.proyeccion && !arma) llegarJunto(ctx, atk, def, 'viaja con su ataque');
  for (let g = 0; g < golpes; g++) {
    if (!activo(atk) || !activo(def) || (g > 0 && atk.aLaDefensiva)) break;
    // Se le fue del alcance (se retiró con un Transporte, lo despidió un Impacto): la serie se corta.
    if (g > 0 && !aDistancia && !enAlcance(atk, def)) break;
    const tA = fijo ? DADO_FIJO : tirar(ctx, atk.cap.umbralAtaque + compleja);
    if (tA.pifia && arma?.fuego) armaDeFuegoFalla(ctx, atk, a.proyectil!.arma, tA.nivelPifia);
    if (tA.pifia) {
      atk.aLaDefensiva = true; // la pifia le niega el resto de acciones activas
      atk.sorprendeA.clear();
      log(ctx, () => `${etiquetaPara(def)}: ¡pifia! (sacó ${tA.natural}, nivel ${tA.nivelPifia}).`,
        () => ({ ataque: { de: nro(ctx, atk), a: nro(ctx, def), contra: a.esContra, resultado: null } }));
      avisarPifia(ctx, atk);
      ofrecerContra(ctx, def, atk, tA.nivelPifia);
      return;
    }
    const limitado = g >= conEfectos;
    const habGolpe = limitado ? habLimitado : g > 0 ? habSinCansancio : habAtk;
    const hab = conTope ? Math.min(habGolpe, TOPE_PROYECTIL - tA.valor) : habGolpe;
    // Un disparo tiene que llegar: su ataque final debe superar la dificultad por distancia (Tabla 48).
    if (aDistancia) {
      const metros = Math.hypot(origen.x - def.pos.x, origen.y - def.pos.y);
      const dif = dificultadDisparo(metros);
      // Llega si el resultado final supera la dificultad (Core p.96).
      if (hab + tA.valor <= dif) {
        log(ctx, () => `${etiquetaPara(def)}: ${textoTirada(hab, tA)} no llega a la dificultad ${dif} (Tabla 48).`);
        continue;
      }
    }

    // Ataque en área: una sola tirada contra varios blancos que se defienden en orden (Core p.92). Un
    // área de Ki alcanza a todos los del radio (Dominus p.58); sin Elección de blanco, aliados incluidos.
    const enArea = ki?.area ? ia.blancosAreaKi(ctx, atk, def, ki) : m === 'area' ? ia.blancosArea(ctx, atk, def) : [def];
    const alcanzados = estela.length ? [...estela.filter((b) => !enArea.includes(b)), ...enArea] : enArea;
    // Parada en área (Ki): quien cubre a sus aliados se defiende primero (Dominus p.58).
    const golpeG = limitado ? opcionesLimitado : opcionesAtk;
    const paradaArea = ia.elegirParadaArea(ctx, atk, alcanzados, hab, golpeG);
    const blancos = paradaArea ? [paradaArea.quien, ...alcanzados.filter((b) => b !== paradaArea.quien)] : alcanzados;
    const contras: { quien: Luchador; bono: number }[] = [];
    let impactoCombinado = false;
    let cortaCombo = false;
    for (const blanco of blancos) {
      if (!activo(blanco) || !activo(atk)) continue;
      // Disparos paralelos (opcional, Core p.95): quien recibe un disparo sin haber actuado y con menos
      // de 25 de diferencia de turno puede disparar a su vez antes de defenderse.
      if (g === 0 && arma && aDistancia && ctx.opciones.disparosParalelos) {
        disparoParalelo(ctx, blanco, atk);
        if (!activo(atk) || !activo(blanco)) continue;
      }
      // Una técnica de Ki a distancia es una descarga: un mago la puede interceptar (Core p.117).
      let opciones: Golpe = paradaArea ? { ...golpeG, paradaArea } : golpeG;
      if (g === 0 && !arma && aDistancia && ki?.distancia && blanco === def) {
        const choque = interceptar(MOTOR, ctx, atk, blanco, hab + tA.valor, danoBase(atk, blanco, false, ranura, ki), false);
        if (choque === 'anulado' || choque === 'pierde') continue;
        if (choque !== null && choque !== 1) opciones = { ...opcionesAtk, factorDano: choque };
      }
      // Un área de Ki se centra en el blanco elegido (Dominus p.58).
      if (ki?.area) opciones = { ...opciones, centroArea: { ...def.pos } };
      // Camuflar ataque: si no lo advierte, se defiende con el penalizador de Sorpresa (Dominus p.52).
      if (g === 0 && !limitado && ki?.camuflar) camuflar(ctx, atk, blanco, ki.camuflar);
      const r = resolverDefensa(ctx, atk, blanco, hab, tA, opciones, etiquetaPara(blanco));
      if (blanco === def && r.defensor === def && r.impacto) impactoCombinado = true;
      if (blanco === def && !r.impacto) cortaCombo = true;
      if (r.contra !== null) {
        contras.push({ quien: r.defensor, bono: r.contra });
        // Parar la maniobra de Ataque en área la intercepta: los demás no tienen que defenderse.
        if (m === 'area' && !ki?.area && (r.defensor.ficha.tipoDefensa ?? 'parada') === 'parada') break;
      }
    }
    // Engatillar: la amenaza se consume cuando quien amenaza ataca a su amenazado.
    if (def.amenazadoPor === atk && m !== 'engatillar') def.amenazadoPor = null;
    // Ataque combinado (Leo): si la hoja alcanzó el cuerpo, dispara a bocajarro antes de cualquier contra.
    if (m === 'combinado' && impactoCombinado && atk.balas > 0 && activo(atk) && activo(def)) disparoCombinado(ctx, atk, def);
    // La sorpresa vale sólo para su primera acción (Core p.86): se gasta al resolverla, después de
    // que el sorprendido se defendió con su −90 y antes de cualquier contra.
    atk.sorprendeA.clear();
    atk.camufladoA.clear();
    // Ataque continuo: no se le puede contraatacar hasta el último golpe (Dominus p.56).
    const ultimo = g === golpes - 1 || (ki?.combo && cortaCombo && g < conEfectos);
    if (!ki?.continuo || ultimo) for (const c of contras) ofrecerContra(ctx, c.quien, atk, c.bono);
    // Combo: si el blanco se defendió con éxito, la cadena se corta (Dominus p.56).
    if (ki?.combo && cortaCombo && g < conEfectos) break;
  }
  atk.sorprendeA.clear();
  if (arma) {
    atk.ultimoBlanco = def;
    atk.apuntando = null;
  }
}

/**
 * Disparar, recargar o apuntar con un arma a distancia: ocupa todo el turno (Core p.94-96). Los
 * disparos van al objetivo y, si cae, al siguiente que mejor rinda (con −10 por cambiar de blanco).
 */
function accionADistancia(ctx: Contexto, l: Luchador, d: ia.AccionDistancia) {
  const arma = l.ficha.armasDistancia![d.arma];
  const st = l.proyectiles[d.arma];
  l.disparo = true;
  if (d.tipo === 'recargar') {
    st.recargaFalta--;
    // Una recámara vacía se recarga entera (ballesta de repetición).
    const recamara = completarArma(arma).recamara;
    if (!st.recargaFalta && recamara) st.enRecamara = Math.min(recamara, st.municion);
    log(ctx, () => `${l.ficha.nombre} recarga ${arma.nombre}${st.recargaFalta ? ` (le falta${st.recargaFalta > 1 ? 'n' : ''} ${st.recargaFalta} asalto${st.recargaFalta > 1 ? 's' : ''})` : ''}.`);
  } else if (d.tipo === 'apuntar') {
    const sigue = l.apuntando?.blanco === d.objetivo && l.apuntando.arma === d.arma;
    l.apuntando = { blanco: d.objetivo, arma: d.arma, asaltos: sigue ? Math.min(3, l.apuntando!.asaltos + 1) : 1 };
    log(ctx, () => `${l.ficha.nombre} apunta con ${arma.nombre} a ${d.objetivo.ficha.nombre} (+${10 * l.apuntando!.asaltos}).`);
  } else {
    // Antes de disparar se aleja de quien lo alcanzaría el asalto que viene (hasta un cuarto de su
    // movimiento, sin penalizador), si desde ahí sigue viendo y alcanzando a su blanco.
    const atras = ia.retroceso(ctx, l, d.objetivo, d.arma);
    if (atras) {
      const desde = { ...l.pos };
      l.pos = atras.celda;
      l.metrosMovidos += atras.metros;
      ctx.movimientosEnAsalto++;
      log(ctx, () => `${l.ficha.nombre} retrocede ${atras.metros.toFixed(1)} m.`, () => ({ camino: { quien: nro(ctx, l), celdas: [desde, { ...l.pos }] } }));
    }
    if (d.disparos > 1) log(ctx, () => `${l.ficha.nombre} ${arma.clase === 'disparo' ? 'dispara' : 'lanza'} ${d.disparos} veces con ${arma.nombre} (−${d.pen} a cada uno).`);
    let blanco: Luchador | null = d.objetivo;
    for (let k = 0; k < d.disparos && blanco; k++) {
      if (!ia.armaUsable(l, d.arma)) break;
      atacar(ctx, l, blanco, { esContra: false, bono: 0, proyectil: { arma: d.arma, pen: d.pen } });
      if (!puedeActuar(l) || terminado(ctx)) break;
      if (!activo(blanco)) blanco = ia.siguienteBlanco(ctx, l, d.arma, d.pen);
    }
    st.recargaFalta = recargaTrasDisparar(l, d.arma, d.recargaFalta);
  }
  l.ataquesRestantes = 0;
}

/** Recarga pendiente después de disparar: con recámara, sólo cuando se vacía (y es la recarga entera). */
function recargaTrasDisparar(l: Luchador, i: number, segunRecarga: number): number {
  const a = completarArma(l.ficha.armasDistancia![i]);
  if (!a.recamara) return segunRecarga;
  return l.proyectiles[i].enRecamara <= 0 && l.proyectiles[i].municion > 0 ? a.recarga : 0;
}

function disparoParalelo(ctx: Contexto, l: Luchador, atk: Luchador) {
  if (l.haActuado || l === ctx.turnoDe || !puedeActuar(l) || l.ataquesRestantes <= 0 || !activo(atk)) return;
  if (Math.abs(l.iniciativa - atk.iniciativa) >= 25) return;
  const d = ia.accionADistancia(ctx, l);
  if (d?.tipo !== 'disparar') return;
  log(ctx, () => `  ${l.ficha.nombre} dispara a la vez (disparos paralelos).`);
  accionADistancia(ctx, l, d);
  l.haActuado = true;
}


/**
 * Trucos de manos contra un proyectil (Core p.94): contra la dificultad del proyectil, o enfrentado
 * con el ataque final si es sobrenatural (una técnica de Ki a distancia). −25 por cada control de
 * más en el asalto. Devuelve si lo atrapó.
 */
function atrapar(ctx: Contexto, l: Luchador, atk: Luchador, ataqueTotal: number, o: Golpe): boolean {
  const dif = dificultadAtrapar(o.ranura.proyectil);
  const base = (l.ficha.trucosDeManos ?? 0) - penAccion(l) - PEN_ATRAPAR_ADICIONAL * l.atrapadas;
  l.atrapadas++;
  const t = tirar(ctx, umbralPifia(l.ficha.trucosDeManos ?? 0, l.cap.ajustePifia));
  const total = base + valorTirada(t);
  const contra = dif ?? ataqueTotal;
  const logra = !t.pifia && (dif === null ? total > contra : total >= contra);
  log(ctx, () => `  ${l.ficha.nombre} intenta atrapar el ${dif === null ? 'ataque' : 'proyectil'} de ${atk.ficha.nombre} (Trucos de manos ${textoTirada(base, t)} contra ${contra}): ${logra ? '¡lo atrapa!' : 'no lo logra'}.`);
  return logra;
}

/**
 * Pifia con un arma de fuego (Core p.80-81): por debajo del umbral (80, el cañón 70; +15 por cada +5 de calidad)
 * se encasquilla; por encima, estalla. En los dos casos no la puede usar más en el combate.
 */
function armaDeFuegoFalla(ctx: Contexto, l: Luchador, i: number, nivel: number) {
  const arma = l.ficha.armasDistancia![i];
  const estalla = nivel >= umbralEstallido(arma.calidad, arma.nombre);
  l.proyectiles[i].inutil = estalla ? 'rota' : 'encasquillada';
  log(ctx, () => `  ¡${estalla ? 'Estalla' : 'Se encasquilla'} ${arma.nombre} de ${l.ficha.nombre}!`);
}

/** Bocajarro: +30 al disparo (Tabla 47). */
const BONO_BOCAJARRO = 30;
const RANURA_BALA: Ranura = { pen: 0, sinArmas: false, bala: true };

/**
 * Segundo ataque del Ataque combinado (Leo, Dominus p.101): el disparo a bocajarro, con +30 y sin más
 * penalizador que el −20 de la maniobra. A bocajarro el defensor no sufre los penalizadores contra
 * disparos: se defiende como de un golpe cuerpo a cuerpo (Core p.96). No consume otro ataque.
 */
function disparoCombinado(ctx: Contexto, atk: Luchador, def: Luchador) {
  atk.balas--;
  const opciones = { declarados: 1, ranura: RANURA_BALA, bono: BONO_BOCAJARRO, maniobra: 'combinado' as const, esContra: false };
  const hab = ataqueFinal(atk, def, opciones);
  const tA = tirar(ctx, atk.cap.umbralAtaque);
  const etiqueta = `${atk.ficha.nombre} dispara a bocajarro a ${def.ficha.nombre}`;
  if (tA.pifia) {
    atk.aLaDefensiva = true;
    log(ctx, () => `${etiqueta}: ¡pifia! (sacó ${tA.natural}, nivel ${tA.nivelPifia}).`,
      () => ({ ataque: { de: nro(ctx, atk), a: nro(ctx, def), contra: false, resultado: null } }));
    avisarPifia(ctx, atk);
    ofrecerContra(ctx, def, atk, tA.nivelPifia);
    return;
  }
  const r = resolverDefensa(ctx, atk, def, hab, tA, { maniobra: 'normal', esContra: false, ranura: RANURA_BALA, tipo: perfilDe(atk, RANURA_BALA).tipoAtaque }, etiqueta);
  if (r.contra !== null) ofrecerContra(ctx, r.defensor, atk, r.contra);
}

/** La pifia niega el resto de las acciones activas del asalto (Core p.98). */
function avisarPifia(ctx: Contexto, atk: Luchador) {
  if (atk.ataquesRestantes > 0 && activo(atk))
    log(ctx, () => `  ${atk.ficha.nombre} pierde el resto de sus acciones activas del asalto por la pifia.`);
}

/** Tirada de un Ataque o Defensa Predeterminada: no se tiran dados. */

/** Quien amenaza pierde la amenaza si lo impactan o cae (interpretación: la regla no lo precisa). */
function liberarAmenazados(ctx: Contexto, l: Luchador) {
  for (const x of ctx.luchadores) if (x.amenazadoPor === l) x.amenazadoPor = null;
}

/** Un escudo sobrenatural que recibe golpes (de energía del Ki, mágico; mañana, psíquico). */
interface EscudoSobrenatural {
  /** Cómo se lo nombra en el registro ("el escudo de energía de X", "Escudo de Luz de X"). */
  nombre: string;
  resistencia: number;
  quedan(resistencia: number): void;
  romper(): void;
}

/**
 * El escudo detiene un golpe y recibe su daño (Core p.100): si aguanta, pierde esa resistencia; si no,
 * se rompe y el resto pasa sin defensa. Devuelve el daño base que pasa, o −1 si aguantó.
 */
function escudoRecibe(ctx: Contexto, golpe: number, ataqueTotal: number, esc: EscudoSobrenatural): number {
  if (golpe < esc.resistencia) {
    const quedan = esc.resistencia - golpe;
    esc.quedan(quedan);
    log(ctx, () => `  ${esc.nombre[0].toUpperCase()}${esc.nombre.slice(1)} aguanta (le quedan ${quedan}).`);
    return -1;
  }
  const pasa = golpe - esc.resistencia;
  esc.romper();
  log(ctx, () => `  ¡El golpe rompe ${esc.nombre}! Pasa con daño ${pasa} → ${ataqueTotal}.`);
  return pasa;
}

/** Algo que hace que un golpe no llegue al defensor antes de que se defienda (y lo narra). */
type EvitaElGolpe = (ctx: Contexto, atk: Luchador, def: Luchador, o: Golpe, tipo: TipoAtaque, etiqueta: string) => boolean;

/** Intangibilidad (Ki): lo atraviesa todo ataque que no sea de energía (Dominus p.69). */
const intangible: EvitaElGolpe = (ctx, atk, def, o, tipo, etiqueta) => {
  if (!esIntangible(def) || tipo === 'ENE' || atk.cap.danaEnergia || o.ki?.danaEnergia) return false;
  log(ctx, () => `${etiqueta}: el golpe atraviesa a ${def.ficha.nombre}, intangible.`);
  return true;
};

/**
 * Holograma: quien no lo descubrió puede pegarle a la imagen (la mitad de las veces, interpretación); un
 * golpe de energía la deshace (Core p.127).
 */
const holograma: EvitaElGolpe = (ctx, atk, def, o, tipo, etiqueta) => {
  if (!def.holograma || atk.descubre.has(def) || ctx.rng.next() >= 0.5) return false;
  log(ctx, () => `${etiqueta}: ¡ataca a la imagen! El golpe la atraviesa.`);
  if (tipo === 'ENE' || atk.cap.danaEnergia || o.ki?.danaEnergia) {
    const m = mantenidoDe(def, 'holograma');
    if (m) dejarDeMantener(def, m);
    log(ctx, () => `  La imagen se deshace.`);
  }
  return true;
};

/** En este orden: lo que evita el golpe sin defensa. Uno nuevo (un poder psíquico, una ilusión) se agrega acá. */
const EVITAN_EL_GOLPE: readonly EvitaElGolpe[] = [intangible, holograma];

/** Intangible por su técnica o por la de un aliado que todavía la mantiene (Dominus p.69). */
function esIntangible(l: Luchador): boolean {
  const por = l.intangiblePor;
  return !!l.ki?.activo.intangible || (!!por && activo(por) && !!por.ki?.activo.intangible);
}

/**
 * La defensa gana (resultado 0 o menos): absorber Ki de la técnica, Reflectar, el desarme de Emp
 * arcano y la contra que le corresponde.
 */
function defensaGana(
  ctx: Contexto, atk: Luchador, quienDefiende: Luchador, o: Golpe, kiDef: ModKi | undefined, resultado: number, ataqueTotal: number,
): ResultadoDefensa {
  // Absorción de Ki: con una defensa que permita contraatacar absorbe Ki de la técnica (Dominus p.64).
  if (kiDef?.absorcionKi && resultado < 0 && o.costeTecnica && quienDefiende.ki) {
    const absorbe = recuperarKi(quienDefiende, Math.min(kiDef.absorcionKi, o.costeTecnica));
    if (absorbe) log(ctx, () => `  ${quienDefiende.ficha.nombre} absorbe ${absorbe} de Ki de la técnica [reserva ${quienDefiende.ki!.reserva}].`);
  }
  // Reflectar el ataque (Ki): lo devuelve con la habilidad final del atacante, más el bono de
  // contraataque, sin sus efectos esotéricos y sin gastar acciones; cuenta como su contra (Dominus p.71).
  if (kiDef?.reflectar && !o.reflejado && activo(atk)) {
    reflectar(MOTOR, ctx, quienDefiende, atk, ataqueTotal + (resultado < 0 ? bonoContraataque(resultado) : 0), o, kiDef);
    return { defensor: quienDefiende, contra: null, impacto: false };
  }
  // Emp arcano: cada defensa con éxito contra un arma permite desarmar (Dominus p.39).
  if (quienDefiende.cap.est.desarmaAlDefender && !atk.cap.desarmado && activo(atk)) {
    const c = caracteristicasControl('desarmar', quienDefiende, atk);
    // Control directo, sin los modificadores de Emp (Dominus p.39); los negativos sí cuentan.
    if (controlEnfrentado(ctx.rng, c.atk + modControl(quienDefiende), c.def + modControl(atk)) > 0) desarmar(ctx, atk, quienDefiende);
  }
  // Transporte automático atado a la defensa: con éxito puede retirarse del combate (Dominus p.59).
  if (kiDef?.transporte && !quienDefiende.presaExistencial && ia.valorRetirada(ctx, quienDefiende, kiDef.transporte) > 0 && retirarseConTransporte(ctx, quienDefiende, atk, kiDef.transporte)) {
    return { defensor: quienDefiende, contra: null, impacto: false };
  }
  // Parada o esquiva limitada (Ki): no permite contraatacar (Dominus p.53).
  // Ataque indirecto (Ki): no se puede contraatacar (Dominus p.52).
  return { defensor: quienDefiende, contra: resultado < 0 && !kiDef?.sinContra && !o.ki?.indirecto ? bonoContraataque(resultado) : null, impacto: false };
}

/**
 * El golpe entra: maniobras de control, daño contra la armadura, efectos sobrenaturales de la técnica,
 * Engatillar, Destrucción por Ki, puntos de presión, Absorción de energía y el fuego.
 */
function golpeQueEntra(
  ctx: Contexto, atk: Luchador, def: Luchador, o: Golpe, resultado: number, baseTrasEscudo: number, tipoGolpe: TipoAtaque,
  resiste: boolean, avisar: () => void,
): ResultadoDefensa {
  const m = o.maniobra;
  const porcentaje = porcentajeDano(resultado, absorcionContra(def, atk, m, o.tipo, o.ranura, o.ki));

  if (esManiobraDeControl(m)) {
    if (porcentaje >= 10) resolverControl(ctx, atk, def, m, porcentaje, o.esContra, o.ki?.apresamiento ?? 0, o.ki);
    else log(ctx, () => `  No alcanza el 10% necesario para la maniobra.`);
    if (m === 'desarmar') {
      avisar();
      return { defensor: def, contra: null, impacto: true };
    }
  }

  // Daño: Derribo y Presa a la mitad (Grappling supremo completo), contra la armadura real.
  let base = baseTrasEscudo >= 0 ? baseTrasEscudo : danoBase(atk, def, o.esContra, o.ranura, o.ki);
  if (o.factorDano !== undefined) base = Math.floor(base * o.factorDano);
  if (def.bono?.inmuneFuego) base = Math.max(0, base - reduccionFuego(def, tipoGolpe));
  if ((m === 'derribo' || m === 'presa') && !atk.cap.est.danoCompletoEnPresa) base = Math.floor(base / 2);
  // Contra la armadura real (los controles van contra TA 0 sólo para alcanzar el 10%); en un
  // apuntado, la de la zona.
  const abs = absorcionContra(def, atk, esManiobraDeControl(m) ? 'normal' : m, o.tipo, o.ranura, o.ki);
  const tipo = o.tipo ?? perfilDe(atk, o.ranura).tipoAtaque;
  const frena = barreraFrena(def, atk, base, o.ki);
  let dano = frena ? 0 : danoFinal(base, porcentajeDano(resultado, abs));
  // Sangre de Aeon: daño de su elemento a la mitad.
  if (def.cap.est.elementoAfin && def.cap.est.elementoAfin === tipo) dano = Math.floor(dano / 2);
  // Un área contra un ser con acumulación: el doble de daño (Core p.99).
  if (areaDoblaDano(atk, def, m, o.area, o.ki)) dano *= 2;
  // Efectos sobrenaturales de la técnica: los que piden dañar cuentan el daño que habría hecho aunque
  // tenga Daño reducido (Dominus p.69, p.73). Impacto basta con superar la defensa (p.68).
  const ki = o.ki;
  if (ki && (ki.impacto || ki.marca || ki.interrumpe || ki.estados.length || ki.danoReducido) && !esManiobraDeControl(m)) {
    const habriaDanado = dano;
    if (ki.danoReducido) dano = Math.floor(dano * (1 - ki.danoReducido));
    const porcentajeContacto = porcentajeDano(resultado, absorcion(0));
    efectosAlImpactar(MOTOR, ctx, atk, def, ki, habriaDanado, porcentajeContacto);
    if (!activo(def)) {
      avisar();
      return { defensor: def, contra: null, impacto: true };
    }
  }

  // Engatillar: si el ataque habría dañado, no daña y deja al rival amenazado (Core p.92).
  if (m === 'engatillar') {
    if (dano > 0) {
      def.amenazadoPor = atk;
      log(ctx, () => `  ${def.ficha.nombre} queda amenazado por ${atk.ficha.nombre}.`);
    } else log(ctx, () => `  No logra engatillarlo.`);
    avisar();
    return { defensor: def, contra: null, impacto: true };
  }
  // Destrucción por Ki: basta con alcanzarlo, aunque el golpe no dañe (Core p.104).
  if (m === 'destruccionKi') {
    destruccionPorKi(MOTOR, ctx, atk, def, o.kiDestruccion ?? 0, resiste);
    avisar();
    return { defensor: def, contra: null, impacto: true };
  }
  // Puntos de presión (Mushin): en vez de daño, RF contra el daño + 20 (Dominus p.42).
  if (m === 'puntosPresion') {
    if (dano > 0) puntosDePresion(MOTOR, ctx, atk, def, dano, o.estadoMushin ?? null);
    else log(ctx, () => `  No alcanza los puntos de presión.`);
    avisar();
    return { defensor: def, contra: null, impacto: true };
  }
  // Absorción de energía: el daño plenamente energético se puede pagar con Ki, 1 cada 5 (Dominus p.20).
  let absorbido = false;
  if (dano > 0 && (tipo === 'ENE' || o.ki?.sobrenatural)) {
    const ki = ia.kiParaAbsorber(def, dano);
    if (ki > 0) {
      def.ki!.reserva -= ki;
      const antes = dano;
      dano = Math.max(0, dano - 5 * ki);
      absorbido = true;
      log(ctx, () => `  ${def.ficha.nombre} absorbe ${antes - dano} de daño con ${ki} de Ki (Absorción de energía) [reserva ${def.ki!.reserva}].`);
    }
  }
  if (dano > 0) {
    aplicarDano(ctx, atk, def, dano, resiste, m, o.ki);
    // Daño por calor: 1d100 (cerrada) + el daño en la Tabla 76 (Core p.236).
    if (tipo === 'CAL' && activo(def)) prender(MOTOR, ctx, atk, def, tirarD100Cerrada(ctx.rng) + dano);
  } else if (frena) log(ctx, () => `  Impacta, pero la barrera de daño ${def.cap.barrera} frena el daño base ${base}.`);
  else if (!esManiobraDeControl(m) && !absorbido) {
    log(ctx, () => `  Impacta sin daño (absorción ${abs}).`);
    // La armadura evitó el daño: puede romperse (Core p.93).
    if (ctx.opciones.rotura) roturaDeArmadura(MOTOR, ctx, atk, def, o.ranura, zonaDe(m));
  }
  avisar();
  return { defensor: def, contra: null, impacto: true };
}

function resolverDefensa(
  ctx: Contexto, atk: Luchador, def: Luchador, habAtk: number, tA: TiradaD100, o: Golpe, etiqueta: string,
): ResultadoDefensa {
  const r = defenderse(ctx, atk, def, habAtk, tA, o, etiqueta);
  trasLaTecnica(ctx, r.defensor);
  return r;
}

function defenderse(
  ctx: Contexto, atk: Luchador, def: Luchador, habAtk: number, tA: TiradaD100, o: Golpe, etiqueta: string,
): ResultadoDefensa {
  // Parada en área (Ki): lo cubre la de un aliado, que ya se defendió (Dominus p.58).
  const pa = o.paradaArea;
  if (pa && pa.quien !== def && pa.resultado !== undefined && def.equipo === pa.quien.equipo && distancia(def, pa.quien) <= pa.radio) {
    return defensaCubierta(ctx, atk, def, habAtk, tA, o, etiqueta, pa);
  }
  const cubre = pa?.quien === def ? pa : undefined;
  // Un aliado puede defender en su lugar: Guardián (−10, sin necesitar el turno, Dominus p.86) o
  // Apartar (esquiva −30, Guardaespaldas −10; acción activa reservada, Core p.93).
  const proteccion = cubre ? null : ia.protectorPara(ctx, def, atk);
  const quienDefiende = proteccion?.quien ?? def;
  // Fascinación: al verse en peligro repite la RF (Dominus p.67).
  if (def.fascinado) repetirFascinacion(MOTOR, ctx, def);
  const tipoGolpe = o.tipo ?? perfilDe(atk, o.ranura).tipoAtaque;
  // Lo que hace que el golpe no llegue, antes de defenderse (intangible, holograma…).
  if (!proteccion && EVITAN_EL_GOLPE.some((evita) => evita(ctx, atk, def, o, tipoGolpe, etiqueta))) return { defensor: def, contra: null, impacto: false };
  if (proteccion?.apartar) quienDefiende.ataquesRestantes--;
  const resiste = !proteccion && !cubre && !def.ficha.acumulacion && ia.resistir(ctx, def, atk);
  // Haima: sacrifica PV para crear una sombra de sangre que recibe el golpe (Dominus p.88).
  const sacrificio = !proteccion && !cubre && def.cap.est.haima ? ia.sacrificioHaima(def, atk, habAtk) : 0;
  if (sacrificio) {
    def.pv -= sacrificio;
    log(ctx, () => `${def.ficha.nombre} sacrifica ${sacrificio} PV en una sombra de sangre (aguante ${2 * sacrificio}).`);
  }
  const cDef = ia.cansancioDefensa(ctx, quienDefiende, atk, habAtk, resiste);
  gastarCansancio(quienDefiende, cDef);
  const samielDef = ia.gastoSamiel(quienDefiende, atk, 'defensa');
  if (samielDef) quienDefiende.samiel.set(atk, (quienDefiende.samiel.get(atk) ?? 0) - samielDef);
  // Trucos de manos: atrapar el proyectil en el aire, como defensa pasiva; si falla, se defiende igual
  // con −50 (Core p.94).
  let trasAtrapar = 0;
  if (!proteccion && o.aDistancia && !def.ficha.acumulacion && def.ficha.trucosDeManos !== undefined && ia.intentaAtrapar(ctx, def, atk, habAtk, o)) {
    if (atrapar(ctx, def, atk, habAtk + tA.valor, o)) return { defensor: def, contra: null, impacto: false };
    trasAtrapar = PEN_ESQUIVA_TRAS_ATRAPAR;
  }
  // Escudo mágico (Core p.100): lo levanta como conjuro pasivo si le conviene y, si lo tiene, se
  // defiende con él (no se combina con parar o esquivar).
  if (!proteccion && !cubre && def.magia) {
    const nuevo = iaMagia.escudoMagicoAlDefender(ctx, def, atk, habAtk, o);
    if (nuevo) {
      const g = lanzar(def, nuevo.conjuro, nuevo.grado);
      def.stats.tecnicas[`${nuevo.conjuro.nombre} (${GRADOS[nuevo.grado]})`] = (def.stats.tecnicas[`${nuevo.conjuro.nombre} (${GRADOS[nuevo.grado]})`] ?? 0) + 1;
      log(ctx, () => `${def.ficha.nombre} levanta ${nuevo.conjuro.nombre} (${GRADOS[nuevo.grado]}, ${g.resistencia} de resistencia) [zeon ${g.zeon}; reserva ${def.magia!.reserva}].`);
    }
  }
  const conEscudo = !proteccion && !cubre && escudoDetiene(def, tipoGolpe) && iaMagia.defiendeConEscudoMagico(def, atk, { ...o, tipo: tipoGolpe });
  // Defenderse sin el escudo es hacer otra cosa que lanzar: ACT a la mitad (Core p.117).
  if (!conEscudo) hacerOtraAccion(quienDefiende);
  // Técnica de defensa (Ki), declarada antes de que nadie tire (Core p.105).
  const elegida = cubre ? cubre.tecnica : quienDefiende.ficha.acumulacion || conEscudo ? null : ia.elegirTecnicaDefensa(ctx, quienDefiende, atk, habAtk, o);
  // Defensa especializada: contra otra clase de ataque no da nada (Dominus p.73).
  const tecnica = elegida && defensaSirve(efectosDe(elegida).desventajas.defensaContra, o) ? elegida : null;
  let kiDef: ModKi | undefined;
  if (tecnica) {
    kiDef = ejecutar(quienDefiende, tecnica);
    quienDefiende.stats.tecnicas[tecnica.nombre] = (quienDefiende.stats.tecnicas[tecnica.nombre] ?? 0) + 1;
  } else kiDef = modDeAccion(quienDefiende, 'defensa', true);
  const habDef = conEscudo ? defensaEscudoMagico(quienDefiende, atk, o.ki) - trasAtrapar : defensaFinal(quienDefiende, atk, { cansancio: cDef, resistir: resiste, samiel: samielDef, ki: kiDef, kiAtk: o.ki, proyectil: o.aDistancia ? o.ranura.proyectil?.clase ?? 'disparo' : undefined, area: o.area, centroArea: o.centroArea }) - (proteccion?.pen ?? 0) - trasAtrapar;
  quienDefiende.previenePendiente.delete(atk);
  const para = (quienDefiende.ficha.tipoDefensa ?? 'parada') === 'parada';
  // Parar con el arma la desenfunda (si no lo sorprendieron, que entonces se defiende sin ella).
  if (para && !atk.sorprendeA.has(quienDefiende)) quienDefiende.enfundada = false;

  let resultado: number;
  if (quienDefiende.ficha.acumulacion) {
    resultado = habAtk + tA.valor;
    log(ctx, () => `${etiqueta}: ${textoTirada(habAtk, tA)} contra acumulación → ${resultado}.`,
      () => ({ ataque: { de: nro(ctx, atk), a: nro(ctx, quienDefiende), contra: o.esContra, resultado } }));
  } else if (quienDefiende.ki && quienDefiende.ki.sinDefensa === quienDefiende.ki.asalto) {
    // Sin defensa: ejecutó una técnica que le baja la guardia todo el asalto (Dominus p.75).
    resultado = habAtk + tA.valor;
    log(ctx, () => `${etiqueta}: ${textoTirada(habAtk, tA)}; ${quienDefiende.ficha.nombre} no puede defenderse (Sin defensa) → ${resultado}.`,
      () => ({ ataque: { de: nro(ctx, atk), a: nro(ctx, quienDefiende), contra: o.esContra, resultado } }));
  } else {
    // Defensa Predeterminada (Ki): defensa final fija, sin dados (Dominus p.53). Con el escudo mágico,
    // la Proyección Mágica Determinada hace lo mismo pagando zeon (Arcana p.26).
    const det = conEscudo ? proyeccionDeterminada(quienDefiende, habDef) : null;
    if (det) {
      pagarDeterminada(quienDefiende, det);
      log(ctx, () => `${quienDefiende.ficha.nombre} defiende con Proyección Mágica Determinada: ${det.valor} [zeon ${det.zeon}].`);
    }
    const fija = det?.valor ?? kiDef?.defensaFija ?? 0;
    // Con un escudo mágico tira su Proyección: la maestría es la de ella (Core p.10, p.17).
    const umbralDef = (conEscudo ? umbralPifia(quienDefiende.ficha.magia!.proyeccionDefensa ?? quienDefiende.ficha.magia!.proyeccion, quienDefiende.cap.ajustePifia) : quienDefiende.cap.umbralDefensa) +
      (tecnica && efectosDe(tecnica).desventajas.compleja ? 2 : 0);
    const tD = fija ? DADO_FIJO : tirar(ctx, umbralDef);
    const valorDef = valorTirada(tD);
    quienDefiende.defensasHechas++;
    // Una pifia resta su nivel directamente de la defensa, sin mínimo (Core p.98), como en el pronóstico.
    const total = fija || habDef + valorDef;
    resultado = habAtk + tA.valor - total;
    if (cubre) cubre.resultado = resultado;
    // Con acumulación, si superan la defensa de su escudo mágico pierde la acción (Core p.99).
    if (conEscudo && def.ficha.acumulacion && resultado > 0) def.aLaDefensiva = true;
    const quien = proteccion ? `${proteccion.quien.ficha.nombre} (${proteccion.apartar ? 'aparta' : 'Guardián'}) ` : '';
    const conTecnica = tecnica ? ` con ${tecnica.nombre}` : conEscudo ? ` con ${def.magia!.escudo!.conjuro.nombre}` : '';
    log(ctx, () => `${etiqueta}: ${textoTirada(habAtk, tA)} contra ${quien}${fija ? `${fija} (fija)` : textoTirada(habDef, tD)}${conTecnica}${resiste ? ' (resiste el golpe)' : ''} → ${resultado}.`,
      () => ({ ataque: { de: nro(ctx, atk), a: nro(ctx, quienDefiende), contra: o.esContra, resultado } }));
    if (para && !conEscudo && ctx.opciones.rotura) roturaEnParada(MOTOR, ctx, atk, quienDefiende, o.ranura, resultado <= 0);
  }

  // Escudo de energía (Ki): si detiene el golpe recibe su daño base (+10 por punto de TA que reste),
  // salvo que no pase su barrera de daño 40; si lo rompe, el resto alcanza al defensor sin defensa
  // (Core p.100, Dominus p.11, p.66).
  let baseTrasEscudo = -1;
  if (resultado <= 0 && quienDefiende.escudoKi > 0 && !quienDefiende.ficha.acumulacion) {
    const golpe = danoAEscudo(atk, quienDefiende, o.esContra, o.ranura, o.ki, o.tipo);
    if (golpe >= 40) {
      baseTrasEscudo = escudoRecibe(ctx, golpe, habAtk + tA.valor, {
        nombre: `el escudo de energía de ${quienDefiende.ficha.nombre}`, resistencia: quienDefiende.escudoKi,
        quedan: (r) => { quienDefiende.escudoKi = r; }, romper: () => { quienDefiende.escudoKi = 0; },
      });
      if (baseTrasEscudo >= 0) resultado = habAtk + tA.valor;
    }
  }

  // Escudo mágico: si detiene el golpe recibe su daño base (+10 por TA que reste); el de Luz sólo lo
  // dañan los ataques sobrenaturales. Si se rompe, el resto pasa sin defensa (Core p.100, p.126).
  if (resultado <= 0 && conEscudo && def.magia?.escudo) {
    const esc = def.magia.escudo;
    const tipoG = o.tipo ?? perfilDe(atk, o.ranura).tipoAtaque;
    const sobrenatural = atk.cap.danaEnergia || !!o.ki?.danaEnergia || !!o.ki?.sobrenatural || tipoG === 'ENE';
    if (!esc.conjuro.escudoSoloSobrenatural || sobrenatural) {
      baseTrasEscudo = escudoRecibe(ctx, danoAEscudo(atk, def, o.esContra, o.ranura, o.ki, o.tipo), habAtk + tA.valor, {
        nombre: `${esc.conjuro.nombre} de ${def.ficha.nombre}`, resistencia: esc.resistencia,
        quedan: (r) => { esc.resistencia = r; }, romper: () => romperEscudo(def),
      });
      if (baseTrasEscudo >= 0) resultado = habAtk + tA.valor;
    }
  }

  if (resultado <= 0) return defensaGana(ctx, atk, quienDefiende, o, kiDef, resultado, habAtk + tA.valor);
  return golpeRecibido(ctx, atk, def, o, resultado, baseTrasEscudo, tipoGolpe, resiste, sacrificio);
}

/**
 * Parada en área (Dominus p.58): cubierto por la de un aliado, no se defiende. Si la Parada ganó no
 * le pasa nada (ni contraataca); si perdió, recibe el daño por esa diferencia.
 */
function defensaCubierta(
  ctx: Contexto, atk: Luchador, def: Luchador, habAtk: number, tA: TiradaD100, o: Golpe, etiqueta: string, pa: ParadaArea,
): ResultadoDefensa {
  const resultado = pa.resultado!;
  log(ctx, () => `${etiqueta}: ${textoTirada(habAtk, tA)}, cubierto por la Parada en área de ${pa.quien.ficha.nombre} → ${resultado}.`,
    () => ({ ataque: { de: nro(ctx, atk), a: nro(ctx, def), contra: o.esContra, resultado } }));
  if (resultado <= 0) return { defensor: def, contra: null, impacto: false };
  return golpeRecibido(ctx, atk, def, o, resultado, -1, o.tipo ?? perfilDe(atk, o.ranura).tipoAtaque, false, 0);
}

/** El ataque superó la defensa: anímico, Cuerpo a Fuego, Haima y, si entra, el golpe. */
function golpeRecibido(
  ctx: Contexto, atk: Luchador, def: Luchador, o: Golpe, resultado: number, baseTrasEscudo: number, tipoGolpe: TipoAtaque,
  resiste: boolean, sacrificio: number,
): ResultadoDefensa {


  // Conjuro anímico (Core p.122): alcanza si logra un resultado de daño contra la TA de energía; en
  // vez de dañar, el blanco hace la RM. No lo deja a la defensiva: no lo golpea (interpretación).
  if (o.animico) {
    const pct = porcentajeDano(resultado, absorcionContra(def, atk, 'normal', 'ENE', o.ranura, o.ki));
    if (pct <= 0) {
      log(ctx, () => `  No alcanza un resultado de daño contra su TA de energía: el conjuro no lo afecta.`);
      return { defensor: def, contra: null, impacto: false };
    }
    efectoAnimico(MOTOR, ctx, atk, def, o.animico, pct);
    return { defensor: def, contra: null, impacto: true };
  }

  // Cuerpo a Fuego: lo que no es energía, frío o agua lo atraviesa sin dañarlo; quien lo toca se
  // quema (Core p.158).
  const sinArmasCerca = o.ranura.sinArmas && !o.aDistancia && !o.ki?.conjuro;
  if (def.bono?.cuerpoFuego && inmuneAlGolpe(def, atk, tipoGolpe, o.ki)) {
    log(ctx, () => `  El golpe atraviesa las llamas del cuerpo de ${def.ficha.nombre} sin dañarlo.`);
    if (sinArmasCerca && activo(atk)) quemarAlTocar(MOTOR, ctx, def, atk);
    return { defensor: def, contra: null, impacto: false };
  }
  if (atk.bono?.cuerpoFuego && sinArmasCerca && activo(def)) quemarAlTocar(MOTOR, ctx, atk, def);
  if (!activo(def)) return { defensor: def, contra: null, impacto: true };

  // Haima: si el daño no supera el aguante de la sombra, la sombra lo recibe y no pierde la acción;
  // si lo supera, recibe el daño pleno y queda a la defensiva.
  if (sacrificio) {
    const golpe = danoFinal(danoBase(atk, def, o.esContra, o.ranura, o.ki), porcentajeDano(resultado, absorcionContra(def, atk, esManiobraDeControl(o.maniobra) ? 'normal' : o.maniobra, o.tipo, o.ranura, o.ki)));
    if (golpe <= 2 * sacrificio) {
      log(ctx, () => `  La sombra de sangre recibe el golpe (${golpe} de ${2 * sacrificio}).`);
      return { defensor: def, contra: null, impacto: true };
    }
    log(ctx, () => `  El golpe (${golpe}) atraviesa la sombra de sangre.`);
  }

  // Impacta: el agredido queda a la defensiva (aunque lo haya cubierto un Guardián que falló).
  // Seraphite arcano sigue actuando salvo que un crítico tenga efecto (Dominus p.40).
  const yaEstaba = def.aLaDefensiva;
  if (!def.ficha.acumulacion && !resiste && def.modo.seraphite !== 3) def.aLaDefensiva = true;
  // Se narra después del daño: impactado, queda a la defensiva le haya hecho daño o no (Core p.89).
  const avisar = () => {
    if (yaEstaba || !activo(def) || def.ficha.acumulacion) return;
    if (def.aLaDefensiva) {
      const porCritico = resiste || def.modo.seraphite === 3 ? ' por el crítico' : '';
      log(ctx, () => `  ${def.ficha.nombre} queda a la defensiva${porCritico}.`);
    } else if (resiste) log(ctx, () => `  ${def.ficha.nombre} resistió el golpe: sigue pudiendo actuar.`);
  };
  liberarAmenazados(ctx, def);
  // Fusión: intangible, se materializa dentro de él en vez de golpearlo (Dominus p.70).
  if (atk.ki?.activo.fusion && atk.ki.activo.intangible && !o.esContra && ia.quiereFusion(atk, def)) {
    fusion(MOTOR, ctx, atk, def);
    avisar();
    return { defensor: def, contra: null, impacto: true };
  }
  return golpeQueEntra(ctx, atk, def, o, resultado, baseTrasEscudo, tipoGolpe, resiste, avisar);
}

// --------------------------------------------------------------------------- efectos sobrenaturales (Ki)

/** RF del defensor contra una dificultad (las Resistencias no sufren negativos, Core p.232). */
function tirarRf(ctx: Contexto, l: Luchador, dificultad: number, que: string, extra = 0): Resistencia {
  return controlResistencia(ctx, l, 'RF', rfDe(l) + extra, dificultad, que);
}

/** Tira una Resistencia y lo narra (Core p.13). */
function controlResistencia(ctx: Contexto, l: Luchador, cual: string, base: number, dificultad: number, que: string): Resistencia {
  const dado = tirarD100Cerrada(ctx.rng);
  const r = resultadoResistencia(base, dado, dificultad);
  const tirada = `${cual} ${base + dado} [${base}+${dado}] contra ${dificultad}`;
  if (!r.falla) log(ctx, () => `  ${l.ficha.nombre} resiste ${que} (${tirada}).`);
  else log(ctx, () => `  ${l.ficha.nombre} falla la ${cual} contra ${que} (${tirada})${r.fracaso ? ` por ${r.fracaso}` : ''}.`);
  return r;
}

/**
 * RM o RF contra un conjuro (las Resistencias no sufren negativos, Core p.232); con "RM o RF" usa la
 * mejor (interpretación). Un 100 natural siempre resiste. Devuelve el fracaso (0 si resiste).
 */
function tirarResistencia(ctx: Contexto, l: Luchador, dificultad: number, que: string, cual: 'RM' | 'RF' | 'RM o RF', bono = 0): Resistencia {
  const rf = rfDe(l);
  const rm = rmDe(l) + (l.bono?.resistencias ?? 0);
  const usa = cual === 'RF' || (cual === 'RM o RF' && rf > rm) ? 'RF' : 'RM';
  return controlResistencia(ctx, l, usa, (usa === 'RF' ? rf : rm) + bono, dificultad, que);
}

/** Ficha nueva por un estado que dura el combate: las capacidades se derivan de la ficha. */
function cambiarFicha(l: Luchador, f: Ficha) {
  l.ficha = f;
  l.cap = capacidades(f);
}

/** Pérdida directa de PV, sin armadura ni crítico (Daño de un Estado, Destrucción por Ki). */
function perderPv(ctx: Contexto, atk: Luchador, def: Luchador, pv: number) {
  def.pv -= pv;
  atk.stats.danoCausado += pv;
  def.stats.danoRecibido += pv;
  log(ctx, () => `  ${def.ficha.nombre} pierde ${pv} PV (${def.pv}/${def.ficha.pv}).`, () => ({ dano: { quien: nro(ctx, def), cantidad: pv } }));
  limitePorDano(ctx, def, pv);
  verificarCaida(ctx, atk, def);
}

// --------------------------------------------------------------------------- rotura (opcional, Core p.93)

/** Derribo, Presa o Desarmar: control enfrentado de características (Core p.91-92). */
function resolverControl(ctx: Contexto, atk: Luchador, def: Luchador, m: 'derribo' | 'presa' | 'desarmar', porcentaje: number, esContra: boolean, apresamiento = 0, kiAtk?: ModKi) {
  const c = caracteristicasControl(m, atk, def, apresamiento, kiAtk ?? atk.ki?.activo);
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
    def.presaExistencial = !!kiAtk?.presaExistencial && !!apresamiento;
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
  l.presaExistencial = false;
  l.paralisis = 0;
  l.atadura = 0;
}

/** Intento de zafarse de una Presa: control con −3 (Pankration supremo −5). Devuelve si se libró. */
function zafarse(ctx: Contexto, l: Luchador): boolean {
  const captor = l.apresadoPor;
  if (!captor) return true;
  if (l.lazos) {
    log(ctx, () => `${l.ficha.nombre} no puede romper los Lazos de Luz.`);
    return false;
  }
  if (l.atadura) {
    // Atado: contra la Fuerza de las sogas o cadenas, no la del mago.
    const yo = mejorCaracteristica(l, ['FUE', 'AGI']) + modControl(l);
    if (controlEnfrentado(ctx.rng, yo, l.atadura) > 0) {
      l.atadura = 0;
      soltar(l);
      l.accionesActivas++;
      log(ctx, () => `${l.ficha.nombre} se libera de las ataduras.`);
      return true;
    }
    log(ctx, () => `${l.ficha.nombre} no logra liberarse de las ataduras.`);
    return false;
  }
  if (!activo(captor) && !l.atadura) {
    soltar(l);
    return true;
  }
  if (l.paralisis >= 3) return false; // presa perfecta: ya no puede librarse
  const yo = mejorCaracteristica(l, l.presaExistencial ? ['POD'] : ['FUE', 'AGI']) - captor.cap.est.penZafarse + l.cap.est.resistePresaDerribo + modControl(l);
  // Quien presa con un arma con regla Presa sostiene con la Fuerza del arma (Core p.76); con una
  // técnica de Apresamiento mantenida, con su valor (Dominus p.65).
  const el = Math.max(captor.cap.est.fuerzaPresaArma || mejorCaracteristica(captor, ['FUE', 'DES']), apresamientoMantenido(captor)) + modControl(captor);
  let dif = controlEnfrentado(ctx.rng, yo, el);
  if (dif <= 0 && l.cap.est.repiteControlDefensivo && !l.repitioControl) {
    l.repitioControl = true;
    dif = controlEnfrentado(ctx.rng, yo, el);
  }
  if (dif > 0) {
    soltar(l);
    l.accionesActivas++;
    log(ctx, () => `${l.ficha.nombre} se zafa de ${captor.ficha.nombre}.`);
    return true;
  }
  log(ctx, () => `${l.ficha.nombre} no logra zafarse.`);
  return false;
}

function ofrecerContra(ctx: Contexto, def: Luchador, atk: Luchador, bono: number) {
  const ilimitadas = def.cap.est.contrasIlimitadas;
  if (!activo(atk) || !activo(def) || def.ficha.acumulacion) return;
  // Sólo puede aprovechar la contra quien todavía puede hacer acciones activas y atacar (Core p.89).
  const motivo = def.aLaDefensiva ? 'está a la defensiva'
    : def.defensaTotal ? 'está en Defensa total'
    : def.ataquesRestantes <= 0 && !ilimitadas ? 'ya usó todos sus ataques del asalto'
    : null;
  // Desde lejos sólo se contraataca con un arma a distancia, y sin el bono (Core p.95).
  if (!motivo && !enAlcance(def, atk)) {
    // Con un Transporte automático aparece junto a quien lo atacó y conserva el bono (Dominus p.59).
    const salto = ia.contraConTransporte(ctx, def, atk, bono);
    if (salto) {
      atacar(ctx, def, atk, { esContra: true, bono, tecnica: salto });
      return;
    }
    const arma = ia.contraADistancia(ctx, def, atk);
    // Una técnica de Ki a distancia también sirve, y sin bono (Dominus p.57: cuenta como proyectil).
    const ki = arma === null ? ia.contraKiADistancia(ctx, def, atk) : null;
    if (ki) {
      atacar(ctx, def, atk, { esContra: true, bono: 0, tecnica: ki.tecnica });
      return;
    }
    if (arma === null) {
      log(ctx, () => `  ${def.ficha.nombre} no puede aprovechar la contra (+${bono}): no tiene a ${atk.ficha.nombre} a su alcance.`);
      return;
    }
    atacar(ctx, def, atk, { esContra: true, bono: 0, proyectil: { arma, pen: 0 } });
    const a = completarArma(def.ficha.armasDistancia![arma]);
    if (a.clase === 'disparo') def.proyectiles[arma].recargaFalta = recargaTrasDisparar(def, arma, Math.max(0, a.recarga - 1));
    return;
  }
  if (motivo) {
    log(ctx, () => `  ${def.ficha.nombre} no puede aprovechar la contra (+${bono}): ${motivo}.`);
    return;
  }
  if (!ia.usarContra(ctx, def, atk, bono)) {
    log(ctx, () => `  ${def.ficha.nombre} no aprovecha la contra (+${bono}).`);
    return;
  }
  atacar(ctx, def, atk, { esContra: true, bono });
}

function aplicarDano(ctx: Contexto, atk: Luchador, def: Luchador, danoPlenoIn: number, resistia: boolean, m: Maniobra, ki?: ModKi) {
  let danoPleno = danoPlenoIn;
  // Acumulación (Ki): la pantalla de energía pierde los PV antes que él (Dominus p.65).
  if (def.pantallaKi > 0) {
    const tapa = Math.min(def.pantallaKi, danoPleno);
    def.pantallaKi -= tapa;
    danoPleno -= tapa;
    log(ctx, () => `  La pantalla de energía de ${def.ficha.nombre} recibe ${tapa} (le quedan ${def.pantallaKi}).`);
    if (danoPleno <= 0) return;
  }
  // Inutilizar e Inconsciencia: mitad de daño, pero el crítico se calcula con el pleno (Core p.91-92).
  const dano = esNoLetal(m) ? Math.floor(danoPleno / 2) : danoPleno;
  const pvAntes = def.pv;
  def.pv -= dano;
  atk.stats.danoCausado += dano;
  def.stats.danoRecibido += dano;
  // Samiel: el daño recibido de este enemigo se acumula como bono contra él (Dominus p.92).
  if (def.cap.est.samiel && !def.ficha.acumulacion) def.samiel.set(atk, (def.samiel.get(atk) ?? 0) + dano);
  log(ctx, () => `  ${def.ficha.nombre} pierde ${dano} PV (${def.pv}/${def.ficha.pv}).`, () => ({ dano: { quien: nro(ctx, def), cantidad: dano } }));
  // Puntos vulnerables: un ataque apuntado a cabeza, corazón o (para inutilizar) una extremidad
  // critica con 1/10 de los PV actuales (Core p.91, p.97). Inutilizar no funciona con acumulación.
  // Ojos de la Muerte: todo golpe que daña es crítico; contra acumulación, en cambio, todo su cuerpo
  // cuenta como punto vulnerable (Dominus p.78).
  // Crítico automático (Ki) funciona igual (Dominus p.71).
  const ojos = atk.cap.est.criticoAutomatico || !!ki?.criticoAuto;
  const acumula = !!def.ficha.acumulacion;
  const vulnerable = golpeAPuntoVulnerable(atk, def, m, ki);
  const critica =
    (ojos && !acumula) || esCritico(danoPleno, pvAntes) || (vulnerable && pvAntes > 0 && danoPleno * 10 >= pvAntes);
  limitePorDano(ctx, def, dano, critica);
  const enuthArcano = atk.cap.est.enuth >= 3;
  if (critica) critico(ctx, atk, def, danoPleno, resistia, m, { bonoKi: ki?.critico ?? 0 });
  // Enuth arcano: todo ataque que dañe obliga a un control de inconsciencia (Dominus p.43).
  else if (enuthArcano && activo(def)) critico(ctx, atk, def, danoPleno, resistia, 'inconsciencia');
  verificarCaida(ctx, atk, def);
}

/**
 * Camuflar ataque (Dominus p.52): Advertir contra la dificultad; si falla, se defiende de este golpe con
 * el penalizador de Sorpresa. Quien ya lo presenció o lo sufrió baja un nivel la dificultad, y quien lo
 * superó una vez conoce el truco y no le vuelve a afectar.
 */
function camuflar(ctx: Contexto, atk: Luchador, blanco: Luchador, dificultad: number) {
  const conocido = atk.camuflajeConocido.get(blanco);
  if (conocido === 'superado') return;
  const dif = conocido === 'visto' ? nivelMenos(dificultad) : dificultad;
  const advierte = advertir(ctx, atk, blanco, dif, 'el ataque camuflado');
  atk.camuflajeConocido.set(blanco, advierte ? 'superado' : 'visto');
}

/** Control de Advertir contra un ataque inesperado; si no lo advierte, se defiende con Sorpresa. */
function advertir(ctx: Contexto, atk: Luchador, blanco: Luchador, dif: number, que: string): boolean {
  const hab = (blanco.ficha.advertir ?? 0) + (blanco.bono?.advertir ?? 0) - penAccion(blanco);
  const t = tirar(ctx, umbralPifia(blanco.ficha.advertir ?? 0, blanco.cap.ajustePifia));
  const advierte = !t.pifia && hab + t.valor >= dif;
  if (!advierte) atk.camufladoA.add(blanco);
  log(ctx, () => `  ${blanco.ficha.nombre} ${advierte ? 'advierte' : 'no advierte'} ${que} (Advertir ${textoTirada(hab, t)} contra ${dif}).`);
  return advierte;
}

/** Transporte automático: Muy Difícil advertirlo, las dos primeras veces contra cada rival (Dominus p.59). */
const ADVERTIR_TRANSPORTE = { dificultad: 140, veces: 2 } as const;

/** Llega al instante junto al blanco, sin gastar movimiento (Transporte automático, Proyección). */
function llegarJunto(ctx: Contexto, atk: Luchador, def: Luchador, como: string) {
  // Un transporte lo libra de una presa, salvo de una existencial (Dominus p.64).
  if (atk.apresadoPor && !atk.presaExistencial) soltar(atk);
  if (atk.apresadoPor) return;
  if (atk.apresando) soltar(atk.apresando);
  const metros = distancia(atk, def);
  const desde = { ...atk.pos };
  moverHacia(MOTOR, ctx, atk, def, Infinity);
  log(ctx, () => `${atk.ficha.nombre} ${como} ${metros.toFixed(0)} m hasta ${def.ficha.nombre}.`, () => ({ camino: { quien: nro(ctx, atk), celdas: [desde, { ...atk.pos }] } }));
}

/** Aparece junto al blanco (Transporte automático); sus primeras veces, quizá lo sorprende (Dominus p.59). */
function aparecerJunto(ctx: Contexto, atk: Luchador, def: Luchador) {
  llegarJunto(ctx, atk, def, 'se transporta');
  const vistas = atk.transportesVistos.get(def) ?? 0;
  if (vistas >= ADVERTIR_TRANSPORTE.veces) return;
  atk.transportesVistos.set(def, vistas + 1);
  advertir(ctx, atk, def, ADVERTIR_TRANSPORTE.dificultad, 'el transporte');
}

/**
 * Retirada con un Transporte automático tras una defensa con éxito (Dominus p.59): los demás trabados
 * con él que aún pueden atacar tiran un ataque natural cada uno contra su defensa plena; si alguno le
 * hace daño, no se va (como al retirarse, Core p.94). Devuelve si se fue.
 */
function retirarseConTransporte(ctx: Contexto, l: Luchador, atk: Luchador, metros: number): boolean {
  const antes = l.pv;
  l.defensaPlena = true;
  for (const e of ctx.luchadores) {
    if (e === atk || e.equipo === l.equipo || !activo(e) || !activo(l) || !enAlcance(e, l) || e.aLaDefensiva || e.ataquesRestantes <= 0 || !puedeActuar(e)) continue;
    log(ctx, () => `  ${e.ficha.nombre} intenta impedir que ${l.ficha.nombre} se retire.`);
    atacar(ctx, e, l, { esContra: false, bono: 0, natural: true });
  }
  l.defensaPlena = false;
  const sale = activo(l) && l.pv >= antes;
  if (activo(l) && !sale) log(ctx, () => `  ${l.ficha.nombre} no logra retirarse.`);
  if (sale) transportar(MOTOR, ctx, l, metros);
  return sale;
}

/** Límites que se activan por perder PV (Caelum, Terminus, Cenobus). */
function limitePorDano(ctx: Contexto, l: Luchador, dano: number, critico = false) {
  // Perder PV mientras acumula magia: Resistir el dolor para no perder la concentración (Core p.118).
  const conc = l.magia ? danoAlAcumular(l, dano, ctx.rng, critico) : null;
  if (conc) log(ctx, () => `  ${l.ficha.nombre} ${conc.resultado === 'conserva' ? 'conserva la concentración' : conc.resultado === 'vuelve' ? 'pierde la concentración: el zeon vuelve a su reserva (menos 10)' : 'pierde la concentración y el zeon acumulado'} (Resistir el dolor ${conc.tirada} contra ${2 * dano}).`);
  const limite = alPerderPv(l, dano);
  if (limite) log(ctx, () => `  ${l.ficha.nombre} activa su Límite ${limite}: recupera Ki (reserva ${l.ki!.reserva}).`);
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

/** Crítico (Core p.96). Con `nivelFijo` (Crítico Directo) no se tira: ese es el nivel. */
function critico(ctx: Contexto, atk: Luchador, def: Luchador, dano: number, resistia: boolean, m: Maniobra, o: OpcionesCritico = {}) {
  const { bonoKi = 0, nivelFijo } = o;
  atk.stats.criticosCausados++;
  def.criticoEnAsalto = true;
  if (alRecibirCritico(def)) log(ctx, () => `  ${def.ficha.nombre} activa su Límite Cruor: recupera 10 de Ki.`);
  const apuntado = localizacionApuntada(m);
  // Un crítico que no viene del arma del atacante (el choque de un Impacto) no suma sus bonos (Dominus p.12).
  let bono = o.sinBonos ? 0 : bonoCriticoDe(atk, m, bonoKi);
  // Aumentar el Crítico: conjuro pasivo que se declara antes de tirar (Core p.157).
  const aumento = nivelFijo === undefined && !o.sinBonos && atk.magia ? iaMagia.aumentarCritico(ctx, atk, def, dano + bono) : null;
  if (aumento) {
    const g = lanzar(atk, aumento.conjuro, aumento.grado);
    const nombre = `${aumento.conjuro.nombre} (${GRADOS[aumento.grado]})`;
    atk.stats.tecnicas[nombre] = (atk.stats.tecnicas[nombre] ?? 0) + 1;
    bono += g.critico ?? 0;
    log(ctx, () => `  ${atk.ficha.nombre} lanza ${nombre}: +${g.critico} al crítico [zeon ${g.zeon}; reserva ${atk.magia!.reserva}].`);
  }
  const dadoCritico = nivelFijo === undefined ? tirarD100Cerrada(ctx.rng) : 0;
  const nivel = nivelFijo ?? nivelCritico(dano + bono, dadoCritico, !!def.ficha.acumulacion);
  const dadoRf = tirarD100Cerrada(ctx.rng);
  // Las Resistencias no sufren el negativo a toda acción (Core p.232).
  // Incremento de Resistencia Física (Ki) suma a la RF durante el asalto (Dominus p.61).
  const baseRf = rfCritico(def);
  const res = baseRf + dadoRf;
  const tiradas = () => {
    if (nivelFijo !== undefined) return `Crítico ${nivel} contra RF ${res} [${baseRf}+${dadoRf}]`;
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
  if (estado === 'muerto' && atk !== def && alMatar(atk)) log(ctx, () => `  ${atk.ficha.nombre} activa su Límite Mors: recupera 1 de Ki.`);
  if (atk !== def) atk.stats.bajas++;
  // Muerto, ya no sostiene sus conjuros (inconsciente sí los mantiene, Core p.122).
  if (estado === 'muerto') terminarMantenidos(def);
  soltar(def);
  if (def.apresando) soltar(def.apresando);
  liberarAmenazados(ctx, def);
  def.amenazadoPor = null;
  for (const l of ctx.luchadores) l.trabados = l.trabados.filter((e) => e !== def);
  log(ctx, () => `  ${def.ficha.nombre} queda ${estado === 'caido' ? 'fuera de combate' : estado}.`);
}
