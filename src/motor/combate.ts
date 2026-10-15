// Resolución de un combate completo con dados reales. Las decisiones las toma ./ia.

import type { Atributo, Contexto, Equipo, Evento, Ficha, Luchador, OpcionesEscenario, Tecnica } from './modelo';
import { crearRng, dado, type Rng } from './rng';
import { textoTirada, tirarD100, tirarD100Cerrada, valorTirada, type TiradaD100 } from './dados';
import { capacidades, planDeAtaques, type Ranura } from './rasgos';
import {
  absorcion, bonoContraataque, danoFinal, dificultadDisparo, esCritico, esMaestro, haySorpresa, localizar, nivelCritico, penPifiaTurno, umbralPifia,
  porcentajeDano, type Localizacion, type TipoAtaque,
} from './reglas';
import {
  absorcionContra, activo, ALCANCE, ataqueFinal, barreraFrena, danoBase, defensaFinal, distancia,
  enAlcance, inmuneAlGolpe, metrosTotales, modControl, umbralPifiaTurno, penAccion, perfilDe, proximaRanura, puedeActuar, turnoFinal, capasDe, zonaDe, ataqueMagico, defensaEscudoMagico, modProyectil, visionEntre, PEN_COBERTURA, alcanceMaximo, type ZonaArmadura,
} from './calculos';
import {
  atributo, bonoCaracteristica, caracteristicasControl, controlCaracteristica, controlEnfrentado, dificultadPuntosPresion, esApuntado,
  esManiobraDeControl, esNoLetal, gradoPresa, localizacionApuntada, type EstadoMushin,
  modificadorPorResultado, type Maniobra,
} from './maniobras';
import * as ia from './ia';
import { GRADOS, type Conjuro } from './conjuros';
import {
  crearEstadoMagia, danoAlAcumular, dejarDeMantener, empezarAsaltoMagia, lanzar, mantenidoCon, presenciaDe, rmDe, romperEscudo,
  terminarAsaltoMagia, terminarMantenidos, estadoLlamas, danoLlamas, actPorCansancio, pagarDeterminada, proyeccionDeterminada,
} from './magia';
import { completarArma, dificultadAtrapar, estadoProyectiles, PEN_ATRAPAR_ADICIONAL, PEN_ESQUIVA_TRAS_ATRAPAR, superaTope, TOPE_PROYECTIL, umbralEstallido } from './proyectiles';
import {
  buscarCamino, campoHacia, caminoHasta, celdaDe, celdaLibreCerca, indice, mapaAbierto, prepararMapa, transitable,
  type Celda, type MapaListo,
} from './mapa';
import {
  ajusteTaEnergia, alMatar, curable, dificultadDestruccion, fichaConAumento, habilidadesKi, type DecisionKi, dificultadAura, presenciaBase, radioAura, sensibleAlAura, alPerderPv, alRecibirCritico, crearEstadoKi, ejecutar, empezarAsalto, modDeAccion, ponerEnEspera, terminarAsalto,
  textoKi, costeKi, recuperarKi, SIN_KI, type EstadoSobrenatural, type ModKi,
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
    paralisisInducida: 0, paralisisTurnos: 0, aura: null, curado: 0, amenazadoPor: null, enfundada: false, huyendo: false,
    estiloDefensivo: false,
    modo: { seraphite: 0, berserker: false, ataqueFinal: false },
    bonoVariableEn: null, objetivoUnico: null, godhandListo: false, godhandPreparado: false,
    ki: null, magia: null, bendiciones: [], bono: null, cegado: 0, llamas: 0, apagando: false, balas: 0, proyectiles: estadoProyectiles(ficha), apuntando: null, ultimoBlanco: null, disparo: false, atrapadas: 0, ataqueFinalUsado: false, maniobraEspecialUsada: false, repitioControl: false, samiel: new Map(), orochi: 0, orochiAsaltos: 0,
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

/**
 * Aura de combate (Dominus p.21-22): cada rival sensible en el radio hace un control con su Presencia
 * base + d100 contra la dificultad del Aura. Quien lo supera no lo repite en el combate; afectado
 * lo repite cada 5 asaltos sin poder empeorar. Por el fracaso (Tabla 9): hasta 19 afectado (−10 a
 * toda acción), hasta 49 miedo, hasta 99 paralización parcial, 100 o más se desvanece.
 */
function aplicarAuras(ctx: Contexto, vivos: Luchador[]) {
  for (const fuente of vivos) {
    if (!fuente.ki?.auraActiva || !activo(fuente)) continue;
    const dificultad = dificultadAura(fuente, penAccion(fuente));
    for (const x of ctx.luchadores) {
      // Alcanza a todos los del radio, aliados incluidos (Dominus p.21: "aquellos que lo rodean").
      if (x === fuente || !activo(x) || !sensibleAlAura(fuente, x) || distancia(fuente, x) > radioAura(fuente)) continue;
      const previo = x.aura;
      if (previo && (previo.estado !== 'afectado' || ctx.asalto - previo.asalto < 5)) continue;
      const dado100 = tirarD100Cerrada(ctx.rng);
      const base = presenciaBase(x.ficha);
      const fracaso = dado100 === 100 ? 0 : dificultad - (base + dado100);
      const estado = fracaso <= 0 ? 'resistio' : fracaso < 20 ? 'afectado' : fracaso < 50 ? 'miedo' : fracaso < 100 ? 'paralizado' : 'desvanecido';
      const texto = `${x.ficha.nombre} siente el Aura de combate de ${fuente.ficha.nombre} (Presencia ${base + dado100} [${base}+${dado100}] contra ${dificultad})`;
      // Repetir el control como afectado sólo puede mejorar: o lo supera o sigue igual.
      if (previo && estado !== 'resistio') {
        x.aura = { ...previo, asalto: ctx.asalto };
        log(ctx, () => `${texto}: sigue afectado.`);
        continue;
      }
      if (estado === 'desvanecido') {
        log(ctx, () => `${texto}: falla por ${fracaso} y se desvanece.`);
        caer(ctx, fuente, x, 'inconsciente');
        continue;
      }
      x.aura = { fuente, estado, asalto: ctx.asalto };
      if (estado === 'paralizado') {
        // "Incapaz apenas de moverse": paralización parcial (Core p.233), mientras dure el combate.
        x.paralisisInducida = Math.max(x.paralisisInducida, 2) as 2 | 3;
        x.paralisisTurnos = Infinity;
      }
      const efecto = { resistio: 'lo resiste', afectado: `falla por ${fracaso}: queda afectado, −10 a toda acción`,
        miedo: `falla por ${fracaso}: siente miedo, −60 a toda acción`, paralizado: `falla por ${fracaso}: queda paralizado` }[estado];
      log(ctx, () => `${texto}: ${efecto}.`);
    }
  }
}

/** TA contra energía en el cuerpo, con la Armadura de energía mayor o arcana encendida o no. */
function taEnergia(l: Luchador): number {
  return Math.max(0, (l.ficha.ta.ENE ?? 0) + ajusteTaEnergia(l));
}

function log(ctx: Contexto, texto: string | (() => string), extra?: () => Omit<Evento, 'asalto' | 'texto'>) {
  if (!ctx.registro) return;
  const foto = ctx.luchadores.map((l) => ({ x: l.pos.x, y: l.pos.y, pv: l.pv, estado: l.estado, aLaDefensiva: l.aLaDefensiva }));
  const turno = ctx.turnoDe ? ctx.luchadores.indexOf(ctx.turnoDe) : undefined;
  ctx.registro.push({ asalto: ctx.asalto, texto: typeof texto === 'string' ? texto : texto(), foto, turno, ...extra?.() });
}

/** Índice de un luchador, para el registro. */
const nro = (ctx: Contexto, l: Luchador) => ctx.luchadores.indexOf(l);

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
function colocar(nA: number, nB: number, distancia: number, e: OpcionesEscenario): { mapa: MapaListo; celdas: Celda[] } {
  const d = Math.max(1, Math.round(distancia));
  const n = Math.max(nA, nB);
  const mapa = e.mapa ? prepararMapa(e.mapa) : mapaAbierto(d + 9, Math.max(9, 2 * n + 7));
  const xA = e.mapa ? Math.min(1, mapa.ancho - 1) : 4;
  const xB = e.mapa ? Math.max(0, Math.min(mapa.ancho - 2, xA + d)) : 4 + d;
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
  for (let i = 0; i < nA; i++) ubicar(e.posiciones?.A?.[i], columna(nA, xA, i));
  for (let i = 0; i < nB; i++) ubicar(e.posiciones?.B?.[i], columna(nB, xB, i));
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
      const plan = ia.planMagia(ctx, l);
      if (plan.cansancio) {
        gastarCansancio(l, plan.cansancio);
        log(ctx, () => `${l.ficha.nombre} gasta ${plan.cansancio} de cansancio en su ACT (+${actPorCansancio(l) * plan.cansancio!}).`);
      }
      if (plan.consumirVida) log(ctx, () => `${l.ficha.nombre} consume ${plan.consumirVida} PV por ${(plan.consumirVida! / 5) * 100} de zeon (Consumir Vida por Magia).`);
      if (plan.sacrificioPoder) log(ctx, () => `${l.ficha.nombre} sacrifica ${plan.sacrificioPoder} de zeon por +${(plan.sacrificioPoder! / 10) * 5} al ACT (Sacrificio de Poder).`);
      empezarAsaltoMagia(l, plan);
      if (plan.consumirVida) verificarCaida(ctx, l, l);
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
      }
    }
  }

  aplicarAuras(ctx, vivos);
  zonasMagicas(ctx);

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
    if (l.paralisisTurnos > 0 && --l.paralisisTurnos === 0) l.paralisisInducida = 0;
    if (l.cegado > 0 && --l.cegado === 0) log(ctx, () => `${l.ficha.nombre} vuelve a ver.`);
    arder(ctx, l);
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
    if (l.llamas && l.ataquesRestantes > 0 && ia.quiereApagarse(ctx, l)) apagarse(ctx, l);
    // Un arma a distancia: disparar, recargar o apuntar ocupa el turno (Core p.94-96).
    // Magia: lanzar los conjuros que convengan, o esperar acumulando (Core p.117).
    const magia = l.ataquesRestantes > 0 && puedeActuar(l) ? ia.accionMagica(ctx, l) : null;
    if (magia) {
      if ('lanzar' in magia) for (const x of magia.lanzar) if (puedeActuar(l) && !terminado(ctx)) lanzarConjuro(ctx, l, x);
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
        estadosAutomaticos(ctx, l, auto.tecnica, auto.blancos);
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
  if (disponible <= 0) return;
  const desde = { ...l.pos };
  const celdas: { x: number; y: number }[] = [];
  const paso = l.mapa ? moverEnMapa(ctx, l, obj, l.mapa, disponible, celdas) : moverEnLinea(l, obj, disponible);
  if (!celdas.length) celdas.push(desde, { ...l.pos });
  if (paso <= 0) return;
  l.metrosMovidos += paso;
  ctx.movimientosEnAsalto++;
  const yaActivo = l.movioActivo;
  if (l.metrosMovidos > total / 4 && !yaActivo) {
    l.movioActivo = true;
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
  /** Técnica de Ki ya elegida (un ataque a distancia, que la IA decidió antes de moverse). */
  tecnica?: Tecnica | null;
  /** Disparo o lanzamiento: qué arma a distancia de la ficha y su penalizador por recarga o cadencia. */
  proyectil?: { arma: number; pen: number };
}

const NOMBRE_MANIOBRA: Record<Maniobra, string> = {
  normal: 'ataca', derribo: 'intenta derribar', presa: 'intenta apresar', desarmar: 'intenta desarmar',
  area: 'ataca en área', cabeza: 'apunta a la cabeza de', corazon: 'apunta al corazón de',
  inutilizar: 'intenta inutilizar', inconsciencia: 'intenta dejar inconsciente', combinado: 'hace un ataque combinado',
  engatillar: 'intenta engatillar', puntosPresion: 'ataca los puntos de presión de',
  destruccionKi: 'usa Destrucción por Ki contra',
};

export function atacar(ctx: Contexto, atk: Luchador, def: Luchador, a: Ataque) {
  ctx.ataquesEnAsalto++;
  atk.stats.ataquesHechos++;
  if (a.esContra) atk.stats.contrasHechas++;
  // Atacar es hacer otra cosa que lanzar: si acumulaba magia, este asalto acumula la mitad (Core p.117).
  if (atk.magia) atk.magia.otraAccion = true;

  // Selene: dobla el bono del contraataque peleando sin armas (Dominus p.39).
  const bono = a.esContra && atk.cap.est.doblaBonoContra ? a.bono * 2 : a.bono;
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
  const plan = ia.elegirManiobra(ctx, atk, def, a.esContra, bonoFinal, a.tecnica, ranuraProyectil);
  const m = plan.maniobra;
  atk.stats.maniobras[m] = (atk.stats.maniobras[m] ?? 0) + 1;
  if (plan.especial) atk.maniobraEspecialUsada = true;
  // Técnica de Ki: se declara antes de tirar y gasta lo concentrado (Core p.105). Sin técnica nueva
  // valen los efectos de Asalto activos y, una vez por asalto, los de Acción de una mantenida.
  let ki: ModKi | undefined;
  if (plan.tecnica) {
    ki = ejecutar(atk, plan.tecnica);
    atk.stats.tecnicas[plan.tecnica.nombre] = (atk.stats.tecnicas[plan.tecnica.nombre] ?? 0) + 1;
  } else ki = modDeAccion(atk, 'ataque', true);
  // Ataque especializado: contra otra clase de defensa la técnica no tiene ningún efecto (Dominus p.72).
  if (ki?.soloContra && (def.ficha.acumulacion ? 'acumulacion' : def.ficha.tipoDefensa ?? 'parada') !== ki.soloContra) ki = atk.ki?.activo;
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

  const etiquetaPara = (b: Luchador) => `${atk.ficha.nombre}${a.esContra ? ` contraataca (+${bono}) y` : ''} ${arma && m === 'normal' ? (arma.clase === 'disparo' ? 'dispara' : 'lanza') : NOMBRE_MANIOBRA[m]}${m === 'cabeza' || m === 'corazon' ? '' : ' a'} ${b.ficha.nombre}${arma ? ` con ${arma.nombre}` : ranura.sinArmas ? ' con una patada' : ranura.pen > 0 ? ' con la segunda arma' : ''}${godhand ? ' (Godhand)' : ''}${plan.especial ? ' (Maniobra Especial)' : ''}${plan.tecnica ? ` con ${plan.tecnica.nombre} [Ki ${textoKi(atk)}]` : ''}${aDistancia ? ` desde ${distancia(atk, b).toFixed(0)} m` : ''}${cAtk ? ` gastando ${cAtk} de cansancio` : ''}`;

  // Ataque adicional (Ki): más golpes con los mismos efectos y sin penalizador (Dominus p.55). Si
  // una contra lo pone a la defensiva, no sigue.
  const golpes = 1 + (ki?.ataquesAdicionales ?? 0);
  // Un proyectil no pasa de un resultado final de 280, salvo que extienda su Ki al arma (Core p.95).
  const conTope = !!arma && !superaTope(atk.ficha);
  for (let g = 0; g < golpes; g++) {
    if (!activo(atk) || !activo(def) || (g > 0 && atk.aLaDefensiva)) break;
    const tA = fijo ? DADO_FIJO : tirar(ctx, atk.cap.umbralAtaque);
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
    const hab = conTope ? Math.min(habAtk, TOPE_PROYECTIL - tA.valor) : habAtk;
    // Un disparo tiene que llegar: su ataque final debe superar la dificultad por distancia (Tabla 48).
    if (aDistancia) {
      const metros = distancia(atk, def);
      const dif = dificultadDisparo(metros);
      if (hab + tA.valor < dif) {
        log(ctx, () => `${etiquetaPara(def)}: ${textoTirada(hab, tA)} no llega a la dificultad ${dif} (Tabla 48).`);
        continue;
      }
    }

    // Ataque en área: una sola tirada contra varios blancos que se defienden en orden (Core p.92). Un
    // área de Ki alcanza a todos los del radio (Dominus p.58); sin Elección de blanco, aliados incluidos.
    const blancos = ki?.area ? ia.blancosAreaKi(ctx, atk, def, ki) : m === 'area' ? ia.blancosArea(ctx, atk, def) : [def];
    const contras: { quien: Luchador; bono: number }[] = [];
    let impactoCombinado = false;
    for (const blanco of blancos) {
      if (!activo(blanco) || !activo(atk)) continue;
      // Disparos paralelos (opcional, Core p.95): quien recibe un disparo sin haber actuado y con menos
      // de 25 de diferencia de turno puede disparar a su vez antes de defenderse.
      if (g === 0 && arma && aDistancia && ctx.opciones.disparosParalelos) {
        disparoParalelo(ctx, blanco, atk);
        if (!activo(atk) || !activo(blanco)) continue;
      }
      // Una técnica de Ki a distancia es una descarga: un mago la puede interceptar (Core p.117).
      let opciones: Golpe = opcionesAtk;
      if (g === 0 && !arma && aDistancia && ki?.distancia && blanco === def) {
        const choque = interceptar(ctx, atk, blanco, hab + tA.valor, danoBase(atk, blanco, false, ranura, ki), false);
        if (choque === 'anulado' || choque === 'pierde') continue;
        if (choque !== null && choque !== 1) opciones = { ...opcionesAtk, factorDano: choque };
      }
      const r = resolverDefensa(ctx, atk, blanco, hab, tA, opciones, etiquetaPara(blanco));
      if (blanco === def && r.defensor === def && r.impacto) impactoCombinado = true;
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
    for (const c of contras) ofrecerContra(ctx, c.quien, atk, c.bono);
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
      if (!ia.armaListaParaDisparar(l, d.arma)) break;
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
 * Lanza un conjuro (Core p.117-122). Todo conjuro pide un control de Proyección Mágica: con pifia
 * falla aunque gaste el zeon. Los de ataque y los anímicos se resuelven contra la defensa de cada
 * blanco (en área, todos los del radio, o los que elija con Control del Espacio); los automáticos
 * alcanzan sin defensa a quien cumpla su condición; los de efecto quedan activos sobre sus blancos.
 */
function lanzarConjuro(ctx: Contexto, l: Luchador, x: ia.Lanzamiento) {
  const c = x.conjuro;
  const g = lanzar(l, c, x.grado, { ...(c.efecto === 'bendicion' ? { blancos: x.blancos } : {}), ...(x.innato ? { innato: true } : {}) }, x.control);
  const nombre = `${c.nombre} (${GRADOS[x.grado]})${x.innato ? ' innato' : x.preparado ? ' preparado' : ''}`;
  l.stats.tecnicas[nombre] = (l.stats.tecnicas[nombre] ?? 0) + 1;
  const zeon = x.innato ? `[innato${x.control ? ', +10 de zeon (Control del Espacio)' : ''}; reserva ${l.magia!.reserva}]`
    : `[zeon ${g.zeon}${x.control ? ' +10 (Control del Espacio)' : ''}; acumulado ${l.magia!.acumulado}, reserva ${l.magia!.reserva}]`;
  const obj = x.objetivo;
  const sobre = c.efecto === 'bendicion' && x.blancos?.length ? ` sobre ${x.blancos.map((b) => b.ficha.nombre).join(', ')}`
    : c.efecto === 'curar' && obj ? ` sobre ${obj.ficha.nombre}` : '';
  const etiqueta = (b: Luchador) => `${l.ficha.nombre} lanza ${nombre} contra ${b.ficha.nombre}${enAlcance(l, b) ? '' : ` desde ${distancia(l, b).toFixed(0)} m`} ${zeon}`;
  // Proyección Mágica Determinada: un valor fijo pagando zeon, si le conviene (Arcana p.26).
  const det = obj && (c.tipos.includes('ataque') || c.tipos.includes('animico')) ? proyeccionDeterminada(l, ataqueMagico(l, obj)) : null;
  if (det) {
    pagarDeterminada(l, det);
    log(ctx, () => `${l.ficha.nombre} proyecta con Proyección Mágica Determinada: ${det.valor} [zeon ${det.zeon}].`);
  }
  const t = det ? DADO_FIJO : tirar(ctx, umbralPifia(l.ficha.magia!.proyeccion));
  const habPara = (b: Luchador) => det?.valor ?? ataqueMagico(l, b);
  if (t.pifia) {
    // El ejemplar recién agregado (de un beneficio a un aliado puede haber uno por blanco).
    const m = [...l.magia!.mantenidos].reverse().find((x) => x.conjuro === c);
    if (m) dejarDeMantener(l, m);
    log(ctx, () => `${obj && (c.tipos.includes('ataque') || c.tipos.includes('animico')) ? etiqueta(obj) : `${l.ficha.nombre} lanza ${nombre}${sobre} ${zeon}`}: ¡pifia! (sacó ${t.natural}, nivel ${t.nivelPifia}): el conjuro falla.`,
      () => (obj ? { ataque: { de: nro(ctx, l), a: nro(ctx, obj), contra: false, resultado: null } } : {}));
    return;
  }
  switch (c.efecto) {
    case 'bendicion':
    case 'curar':
    case 'sacrificioPoder':
    case 'consumirVida':
    case 'flash':
    case 'incinerar':
    case 'tormenta':
      log(ctx, () => `${l.ficha.nombre} lanza ${nombre}${sobre} ${zeon}.`);
      if (c.efecto === 'curar' && obj) curarConMagia(ctx, l, obj, g.curar ?? 0);
      if (c.efecto === 'flash') flashCegador(ctx, l, g.rf ?? 0, g.radio ?? 0, !!x.control);
      if (c.efecto === 'incinerar') for (const b of x.blancos ?? []) if (activo(b)) incinerar(ctx, l, b, g.rm ?? 0, g.llamas ?? 0);
      if (c.efecto === 'tormenta' && obj) {
        mantenidoCon(l, c)!.zona = { x: obj.pos.x, y: obj.pos.y, radio: g.area ?? 0, desde: ctx.asalto + 1, excluye: x.control ? 'aliados' : 'nadie' };
        log(ctx, () => `  La tormenta cubre ${g.area} m alrededor de donde está ${obj.ficha.nombre}: ataca desde el asalto siguiente.`);
      }
      return;
  }
  if (!obj) {
    log(ctx, () => `${l.ficha.nombre} lanza ${nombre} ${zeon}.`);
    return;
  }
  ctx.ataquesEnAsalto++;
  l.stats.ataquesHechos++;
  const animico = c.tipos.includes('animico') ? { conjuro: c, grado: x.grado } : undefined;
  const contras: { quien: Luchador; bono: number }[] = [];
  // Choque de descargas (Core p.117): el blanco puede interceptar un conjuro de ataque con el suyo.
  let factor = 1;
  if (!animico && c.tipos.includes('ataque')) {
    const choque = interceptar(ctx, l, obj, habPara(obj) + t.valor, g.dano ?? 0, true);
    if (choque === 'anulado' || choque === 'pierde') return;
    if (choque !== null) factor = choque;
  }
  for (const b of ia.blancosConjuro(ctx, l, obj, c, g, !!x.control)) {
    if (!activo(b) || !activo(l)) continue;
    const golpe: Golpe = {
      maniobra: 'normal', esContra: false, tipo: animico ? 'ENE' : c.ta, ranura: ia.RANURA_MAGIA, ki: ia.golpeDeConjuro(c, g), aDistancia: !enAlcance(l, b), animico,
      ...(factor !== 1 ? { factorDano: factor } : {}),
    };
    const r = resolverDefensa(ctx, l, b, habPara(b), t, golpe, etiqueta(b));
    if (r.contra !== null) contras.push({ quien: r.defensor, bono: r.contra });
  }
  l.sorprendeA.clear();
  for (const k of contras) ofrecerContra(ctx, k.quien, l, k.bono);
}

/**
 * Choque de descargas (Core p.117, Tabla 57). Con disparos paralelos (sin haber actuado y con menos
 * de 25 de diferencia de turno), un mago que recibe una descarga puede interceptarla con un conjuro de
 * ataque: si su Proyección llega a 50 de la del atacante, chocan. Cada uno tira 1d100 + el daño base
 * + su bono de Poder (sólo los magos): hasta 50 de diferencia se anulan; de 51 a 100, la ganadora pasa
 * con la mitad de daño; más, entera. Devuelve qué pasa con la descarga del atacante: null si no hubo
 * choque, 'anulado', 'pierde' (la del defensor lo alcanza a él) o el factor de daño con que pasa.
 */
function interceptar(ctx: Contexto, atk: Luchador, def: Luchador, resultado: number, baseAtk: number, atkEsMago: boolean): 'anulado' | 'pierde' | number | null {
  if (!ctx.opciones.disparosParalelos || !def.magia || def.haActuado || def === ctx.turnoDe || !puedeActuar(def) || def.ataquesRestantes <= 0) return null;
  if (Math.abs(def.iniciativa - atk.iniciativa) >= 25) return null;
  const x = ia.interceptarCon(ctx, def, atk, resultado, baseAtk, atkEsMago);
  if (!x) return null;
  const c = x.conjuro;
  const g = lanzar(def, c, x.grado, x.innato ? { innato: true } : {}, false);
  def.haActuado = true;
  def.ataquesRestantes = 0;
  const nombre = `${c.nombre} (${GRADOS[x.grado]})${x.innato ? ' innato' : ''}`;
  def.stats.tecnicas[nombre] = (def.stats.tecnicas[nombre] ?? 0) + 1;
  const t = tirar(ctx, umbralPifia(def.ficha.magia!.proyeccion));
  const habDef = ataqueMagico(def, atk);
  const etiqueta = `${def.ficha.nombre} intercepta con ${nombre} [zeon ${g.zeon}; reserva ${def.magia!.reserva}]`;
  if (t.pifia) {
    log(ctx, () => `${etiqueta}: ¡pifia! (sacó ${t.natural}): el conjuro falla.`);
    return null;
  }
  const suyo = habDef + t.valor;
  const golpeDef: Golpe = { maniobra: 'normal', esContra: false, tipo: c.ta, ranura: ia.RANURA_MAGIA, ki: ia.golpeDeConjuro(c, g), aDistancia: !enAlcance(def, atk) };
  if (suyo < resultado - 50) {
    // No llega a interceptarla: es un disparo paralelo común.
    log(ctx, () => `${etiqueta}: ${textoTirada(habDef, t)} no llega a 50 de ${resultado}; no chocan.`);
    resolverDefensa(ctx, def, atk, habDef, t, golpeDef, `${def.ficha.nombre} lanza ${nombre} contra ${atk.ficha.nombre}`);
    return activo(atk) ? null : 'anulado';
  }
  const poder = (l: Luchador, mago: boolean) => (mago ? bonoCaracteristica(atributo(l, 'POD')) : 0);
  const dA = tirarD100Cerrada(ctx.rng), dD = tirarD100Cerrada(ctx.rng);
  const totA = dA + baseAtk + poder(atk, atkEsMago);
  const totD = dD + (g.dano ?? 0) + poder(def, true);
  const dif = Math.abs(totA - totD);
  const factor = dif > 100 ? 1 : dif > 50 ? 0.5 : 0;
  log(ctx, () => `${etiqueta}: ${textoTirada(habDef, t)} contra ${resultado} → ¡chocan! ${atk.ficha.nombre} ${totA} [${dA}+${baseAtk}${atkEsMago ? `+${poder(atk, true)}` : ''}] contra ${def.ficha.nombre} ${totD} [${dD}+${g.dano ?? 0}+${poder(def, true)}]: ${factor === 0 ? 'se anulan' : `${totA > totD ? atk.ficha.nombre : def.ficha.nombre} pasa${factor === 0.5 ? ' con la mitad de daño' : ''}`} (Tabla 57).`);
  if (factor === 0) return 'anulado';
  if (totA > totD) return factor;
  resolverDefensa(ctx, def, atk, habDef, t, { ...golpeDef, ...(factor !== 1 ? { factorDano: factor } : {}) }, `  La descarga de ${def.ficha.nombre} sigue hacia ${atk.ficha.nombre}`);
  return 'pierde';
}

/** Curar Heridas: recupera PV sin pasar de los suyos (Core p.187). */
function curarConMagia(ctx: Contexto, l: Luchador, quien: Luchador, pv: number) {
  const cura = Math.max(0, Math.min(pv, quien.ficha.pv - quien.pv));
  quien.pv += cura;
  log(ctx, () => `  ${quien.ficha.nombre} recupera ${cura} PV (${quien.pv}/${quien.ficha.pv}).`);
}

/**
 * Flash Cegador (Core p.126): todos los del radio salvo el lanzador (con Control del Espacio, sólo los
 * enemigos) hacen una RF; quedan ciegos tantos asaltos como decenas por las que fallen.
 */
function flashCegador(ctx: Contexto, l: Luchador, rf: number, radio: number, control: boolean) {
  for (const b of ctx.luchadores) {
    if (b === l || !activo(b) || distancia(l, b) > radio || (control && b.equipo === l.equipo)) continue;
    const asaltos = Math.floor(tirarRf(ctx, b, rf, 'el Flash Cegador') / 10);
    if (asaltos > 0) {
      b.cegado = Math.max(b.cegado, asaltos);
      log(ctx, () => `  ${b.ficha.nombre} queda ciego ${asaltos} asalto${asaltos > 1 ? 's' : ''}.`);
    }
  }
}

/** Incinerar (Core p.158): RM o se prende, con una tirada con bono en la Tabla 76. */
function incinerar(ctx: Contexto, l: Luchador, b: Luchador, rm: number, bono: number) {
  if (!tirarResistencia(ctx, b, rm, 'Incinerar', 'RM', b.bono?.resCalor ?? 0)) return;
  prender(ctx, l, b, tirarD100Cerrada(ctx.rng) + bono);
}

/** Quién lo prendió fuego (para las estadísticas del daño de las llamas). */
const quienPrendio = new WeakMap<Luchador, Luchador>();

/**
 * Tabla 76 (Core p.236): con 100 o más se prende; un ser con acumulación divide el resultado entre 5.
 * Si ya ardía, queda el peor de los dos.
 */
function prender(ctx: Contexto, atk: Luchador, l: Luchador, valor: number) {
  const nivel = l.ficha.acumulacion ? Math.floor(valor / 5) : valor;
  if (nivel < 100 || nivel <= l.llamas || l.bono?.cuerpoFuego) return;
  l.llamas = nivel;
  quienPrendio.set(l, atk);
  log(ctx, () => `  ${l.ficha.nombre} queda ${estadoLlamas(nivel)} (Tabla 76: ${nivel}).`);
}

/** Al final del asalto: el fuego quema y, si no intentó apagarlo, crece 10 (Core p.236-237). */
function arder(ctx: Contexto, l: Luchador) {
  if (!l.llamas) return;
  const dano = danoLlamas(l);
  if (dano > 0) {
    log(ctx, () => `${l.ficha.nombre} se quema (${estadoLlamas(l.llamas)}).`);
    perderPv(ctx, quienPrendio.get(l) ?? l, l, dano);
  }
  if (!l.apagando) l.llamas += 10;
  l.apagando = false;
}

/**
 * Apagarse (Core p.236): acción con la que tira un dado, le suma su Destreza o Agilidad y lo resta del
 * nivel en la Tabla 76; por debajo de 100 se apaga. Ocupa su turno (interpretación).
 */
function apagarse(ctx: Contexto, l: Luchador) {
  const caract = Math.max(atributo(l, 'DES'), atributo(l, 'AGI'));
  const dado = tirarD100Cerrada(ctx.rng);
  l.llamas -= dado + caract;
  l.apagando = true;
  l.ataquesRestantes = 0;
  if (l.llamas < 100) l.llamas = 0;
  log(ctx, () => `${l.ficha.nombre} intenta apagarse (${dado}+${caract}): ${l.llamas ? `sigue ${estadoLlamas(l.llamas)} (${l.llamas})` : 'se apaga'}.`);
}

/**
 * Tormenta de Fuego (Core p.159): cada asalto desde el siguiente al lanzamiento, todos los que estén
 * en la zona sufren un ataque automático con la habilidad final del grado; con Control del Espacio
 * deja fuera a los suyos. Se resuelve al empezar el asalto (interpretación).
 */
function zonasMagicas(ctx: Contexto) {
  for (const l of ctx.luchadores) {
    for (const x of l.magia?.mantenidos ?? []) {
      const z = x.zona;
      if (!z || ctx.asalto < z.desde) continue;
      const g = x.conjuro.grados[x.grado];
      for (const b of ctx.luchadores) {
        if (!activo(b) || Math.hypot(b.pos.x - z.x, b.pos.y - z.y) > z.radio || (z.excluye === 'aliados' && b.equipo === l.equipo)) continue;
        const golpe: Golpe = { maniobra: 'normal', esContra: false, tipo: x.conjuro.ta, ranura: ia.RANURA_MAGIA, ki: ia.golpeDeConjuro(x.conjuro, g), aDistancia: true };
        resolverDefensa(ctx, l, b, g.habilidad ?? 0, DADO_FIJO, golpe, `${x.conjuro.nombre} de ${l.ficha.nombre} ataca a ${b.ficha.nombre}`);
        if (terminado(ctx)) return;
      }
    }
  }
}

/**
 * Lo que hace un conjuro anímico al alcanzar (Core p.122): RM contra su dificultad (con Romper
 * Resistencias, +5 o +10 por cada 50% de daño, Arcana p.30); el fracaso decide el efecto.
 */
function efectoAnimico(ctx: Contexto, atk: Luchador, def: Luchador, a: NonNullable<Golpe['animico']>, porcentaje: number) {
  const g = a.conjuro.grados[a.grado];
  const romper = (atk.ficha.magia?.romperResistencias ?? 0) * 5 * Math.floor(porcentaje / 50);
  const rm = (g.rm ?? 0) + romper;
  const que = `${a.conjuro.nombre}${romper ? ` (+${romper} por Romper Resistencias)` : ''}`;
  switch (a.conjuro.efecto) {
    case 'secar': {
      // A un ser vivo le hace la mitad del fracaso; resiste con la mejor de RM y RF (interpretación).
      const fracaso = tirarResistencia(ctx, def, rm, que, 'RM o RF');
      if (fracaso >= 2) perderPv(ctx, atk, def, Math.floor(fracaso / 2));
      return;
    }
    case 'consumirEsencia': {
      const fracaso = tirarResistencia(ctx, def, rm, que, 'RM');
      if (!fracaso) return;
      const e = def.magia;
      if (e) {
        const pierde = Math.min(fracaso, e.reserva);
        e.reserva -= pierde;
        e.acumulado = Math.min(e.acumulado, e.reserva);
        log(ctx, () => `  ${def.ficha.nombre} pierde ${pierde} de zeon (reserva ${e.reserva}).`);
      }
      perderPv(ctx, atk, def, fracaso);
      return;
    }
    case 'criticoDirecto':
      if (tirarResistencia(ctx, def, rm, que, 'RM')) critico(ctx, atk, def, 0, false, 'normal', 0, g.critico);
      return;
  }
}

/**
 * Cuerpo a Fuego (Core p.158): quien toca sus llamas hace una RF contra el doble de su Presencia (+5
 * por punto de TA contra calor) o pierde la mitad del fracaso. Se toca con un golpe sin armas que
 * alcanza, dado o recibido (interpretación).
 */
function quemarAlTocar(ctx: Contexto, llamas: Luchador, quien: Luchador) {
  const fracaso = tirarResistencia(ctx, quien, 2 * presenciaDe(llamas), `las llamas de ${llamas.ficha.nombre}`, 'RF', 5 * (quien.ficha.ta.CAL ?? 0));
  if (fracaso >= 2) perderPv(ctx, llamas, quien, Math.floor(fracaso / 2));
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
  const t = tirar(ctx, umbralPifia(l.ficha.trucosDeManos ?? 0));
  const total = base + valorTirada(t);
  const contra = dif ?? ataqueTotal;
  const logra = !t.pifia && (dif === null ? total > contra : total >= contra);
  log(ctx, () => `  ${l.ficha.nombre} intenta atrapar el ${dif === null ? 'ataque' : 'proyectil'} de ${atk.ficha.nombre} (Trucos de manos ${textoTirada(base, t)} contra ${contra}): ${logra ? '¡lo atrapa!' : 'no lo logra'}.`);
  return logra;
}

/**
 * Pifia con un arma de fuego (Core p.80-81): por debajo del umbral (80, +15 por cada +5 de calidad)
 * se encasquilla; por encima, estalla. En los dos casos no la puede usar más en el combate.
 */
function armaDeFuegoFalla(ctx: Contexto, l: Luchador, i: number, nivel: number) {
  const arma = l.ficha.armasDistancia![i];
  const estalla = nivel >= umbralEstallido(arma.calidad);
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
const DADO_FIJO: TiradaD100 = { valor: 0, natural: 0, abiertas: 0, pifia: false, nivelPifia: 0 };

/** Quien amenaza pierde la amenaza si lo impactan o cae (interpretación: la regla no lo precisa). */
function liberarAmenazados(ctx: Contexto, l: Luchador) {
  for (const x of ctx.luchadores) if (x.amenazadoPor === l) x.amenazadoPor = null;
}

interface ResultadoDefensa {
  defensor: Luchador;
  /** Bono de contraataque si el defensor ganó, o null. */
  contra: number | null;
  /** El ataque lo alcanzó (resultado positivo), dañara o no. */
  impacto: boolean;
}

interface Golpe {
  maniobra: Maniobra;
  /** Destrucción por Ki: puntos de Ki extra (+5 a la dificultad cada uno). */
  kiDestruccion?: number;
  /** Efectos de Ki del atacante en este golpe. */
  ki?: ModKi;
  estadoMushin?: EstadoMushin | null;
  esContra: boolean;
  tipo?: TipoAtaque;
  ranura: Ranura;
  /** Ki que costó la técnica del ataque (Absorción de Ki del defensor). */
  costeTecnica?: number;
  /** Es un ataque reflectado: no se vuelve a reflectar (Dominus p.71). */
  reflejado?: boolean;
  /** Ataque a distancia: cuenta como proyectil disparado para la defensa (Dominus p.57, Tabla 49). */
  aDistancia?: boolean;
  /** Conjuro anímico: si alcanza con un resultado de daño, RM en vez de daño (Core p.122). */
  animico?: { conjuro: Conjuro; grado: number };
  /** Multiplica el daño base (una descarga que pasa un choque con la mitad, Tabla 57). */
  factorDano?: number;
}

function resolverDefensa(
  ctx: Contexto, atk: Luchador, def: Luchador, habAtk: number, tA: TiradaD100, o: Golpe, etiqueta: string,
): ResultadoDefensa {
  // Un aliado puede defender en su lugar: Guardián (−10, sin necesitar el turno, Dominus p.86) o
  // Apartar (esquiva −30, Guardaespaldas −10; acción activa reservada, Core p.93).
  const proteccion = ia.protectorPara(ctx, def, atk);
  const quienDefiende = proteccion?.quien ?? def;
  // Fascinación: al verse en peligro repite la RF (Dominus p.67).
  if (def.fascinado) repetirFascinacion(ctx, def);
  // Intangibilidad (Ki): lo atraviesa todo ataque que no sea de energía (Dominus p.69).
  const tipoGolpe = o.tipo ?? perfilDe(atk, o.ranura).tipoAtaque;
  if (!proteccion && def.ki?.activo.intangible && tipoGolpe !== 'ENE' && !atk.cap.danaEnergia && !o.ki?.danaEnergia) {
    log(ctx, () => `${etiqueta}: el golpe atraviesa a ${def.ficha.nombre}, intangible.`);
    return { defensor: def, contra: null, impacto: false };
  }
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
  // Trucos de manos: atrapar el proyectil en el aire, como defensa pasiva; si falla, se defiende igual
  // con −50 (Core p.94).
  let trasAtrapar = 0;
  if (!proteccion && o.aDistancia && !def.ficha.acumulacion && def.ficha.trucosDeManos !== undefined && ia.intentaAtrapar(ctx, def, atk, habAtk, o)) {
    if (atrapar(ctx, def, atk, habAtk + tA.valor, o)) return { defensor: def, contra: null, impacto: false };
    trasAtrapar = PEN_ESQUIVA_TRAS_ATRAPAR;
  }
  // Escudo mágico (Core p.100): lo levanta como conjuro pasivo si le conviene y, si lo tiene, se
  // defiende con él (no se combina con parar o esquivar).
  if (!proteccion && def.magia && !def.ficha.acumulacion) {
    const nuevo = ia.escudoMagicoAlDefender(ctx, def, atk, habAtk, o);
    if (nuevo) {
      const g = lanzar(def, nuevo.conjuro, nuevo.grado);
      def.stats.tecnicas[`${nuevo.conjuro.nombre} (${GRADOS[nuevo.grado]})`] = (def.stats.tecnicas[`${nuevo.conjuro.nombre} (${GRADOS[nuevo.grado]})`] ?? 0) + 1;
      log(ctx, () => `${def.ficha.nombre} levanta ${nuevo.conjuro.nombre} (${GRADOS[nuevo.grado]}, ${g.resistencia} de resistencia) [zeon ${g.zeon}; reserva ${def.magia!.reserva}].`);
    }
  }
  const conEscudo = !proteccion && ia.defiendeConEscudoMagico(def, atk, o);
  // Defenderse sin el escudo es hacer otra cosa que lanzar: ACT a la mitad (Core p.117).
  if (quienDefiende.magia && !conEscudo) quienDefiende.magia.otraAccion = true;
  // Técnica de defensa (Ki), declarada antes de que nadie tire (Core p.105).
  const tecnica = quienDefiende.ficha.acumulacion || conEscudo ? null : ia.elegirTecnicaDefensa(ctx, quienDefiende, atk, habAtk, o);
  let kiDef: ModKi | undefined;
  if (tecnica) {
    kiDef = ejecutar(quienDefiende, tecnica);
    quienDefiende.stats.tecnicas[tecnica.nombre] = (quienDefiende.stats.tecnicas[tecnica.nombre] ?? 0) + 1;
  } else kiDef = modDeAccion(quienDefiende, 'defensa', true);
  const habDef = conEscudo ? defensaEscudoMagico(quienDefiende, atk, o.ki) - trasAtrapar : defensaFinal(quienDefiende, atk, { cansancio: cDef, resistir: resiste, samiel: samielDef, ki: kiDef, kiAtk: o.ki, proyectil: o.aDistancia ? o.ranura.proyectil?.clase ?? 'disparo' : undefined }) - (proteccion?.pen ?? 0) - trasAtrapar;
  quienDefiende.previenePendiente.delete(atk);
  const para = (quienDefiende.ficha.tipoDefensa ?? 'parada') === 'parada';
  // Parar con el arma la desenfunda (si no lo sorprendieron, que entonces se defiende sin ella).
  if (para && !atk.sorprendeA.has(quienDefiende)) quienDefiende.enfundada = false;

  let resultado: number;
  if (quienDefiende.ficha.acumulacion) {
    resultado = habAtk + tA.valor;
    log(ctx, () => `${etiqueta}: ${textoTirada(habAtk, tA)} contra acumulación → ${resultado}.`,
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
    const tD = fija ? DADO_FIJO : tirar(ctx, quienDefiende.cap.umbralDefensa);
    const valorDef = valorTirada(tD);
    quienDefiende.defensasHechas++;
    // La defensa final nunca es negativa.
    const total = fija || Math.max(0, habDef + valorDef);
    resultado = habAtk + tA.valor - total;
    const quien = proteccion ? `${proteccion.quien.ficha.nombre} (${proteccion.apartar ? 'aparta' : 'Guardián'}) ` : '';
    const conTecnica = tecnica ? ` con ${tecnica.nombre}` : conEscudo ? ` con ${def.magia!.escudo!.conjuro.nombre}` : '';
    log(ctx, () => `${etiqueta}: ${textoTirada(habAtk, tA)} contra ${quien}${fija ? `${fija} (fija)` : textoTirada(habDef, tD)}${conTecnica}${habDef + valorDef < 0 ? ' (=0)' : ''}${resiste ? ' (resiste el golpe)' : ''} → ${resultado}.`,
      () => ({ ataque: { de: nro(ctx, atk), a: nro(ctx, quienDefiende), contra: o.esContra, resultado } }));
    if (para && !conEscudo && ctx.opciones.rotura) roturaEnParada(ctx, atk, quienDefiende, o.ranura, resultado <= 0);
  }

  // Escudo de energía (Ki): si detiene el golpe recibe su daño base (+10 por punto de TA que reste),
  // salvo que no pase su barrera de daño 40; si lo rompe, el resto alcanza al defensor sin defensa
  // (Core p.100, Dominus p.11, p.66).
  let baseTrasEscudo = -1;
  if (resultado <= 0 && quienDefiende.escudoKi > 0 && !quienDefiende.ficha.acumulacion) {
    const golpe = danoBase(atk, quienDefiende, o.esContra, o.ranura, o.ki) + 10 * (o.ki?.reduccionTA ?? 0);
    if (golpe >= 40) {
      if (golpe < quienDefiende.escudoKi) {
        quienDefiende.escudoKi -= golpe;
        log(ctx, () => `  El escudo de energía de ${quienDefiende.ficha.nombre} aguanta (le quedan ${quienDefiende.escudoKi}).`);
      } else {
        baseTrasEscudo = golpe - quienDefiende.escudoKi;
        quienDefiende.escudoKi = 0;
        resultado = habAtk + tA.valor;
        log(ctx, () => `  ¡El golpe rompe el escudo de energía de ${quienDefiende.ficha.nombre}! Pasa con daño ${baseTrasEscudo} → ${resultado}.`);
      }
    }
  }

  // Escudo mágico: si detiene el golpe recibe su daño base (+10 por TA que reste); el de Luz sólo lo
  // dañan los ataques sobrenaturales. Si se rompe, el resto pasa sin defensa (Core p.100, p.126).
  if (resultado <= 0 && conEscudo && def.magia?.escudo) {
    const esc = def.magia.escudo;
    const tipoG = o.tipo ?? perfilDe(atk, o.ranura).tipoAtaque;
    const sobrenatural = atk.cap.danaEnergia || !!o.ki?.danaEnergia || !!o.ki?.sobrenatural || tipoG === 'ENE';
    if (!esc.conjuro.escudoSoloSobrenatural || sobrenatural) {
      const golpe = danoBase(atk, def, o.esContra, o.ranura, o.ki) + 10 * (o.ki?.reduccionTA ?? 0);
      if (golpe < esc.resistencia) {
        esc.resistencia -= golpe;
        log(ctx, () => `  ${esc.conjuro.nombre} de ${def.ficha.nombre} aguanta (le quedan ${esc.resistencia}).`);
      } else {
        baseTrasEscudo = golpe - esc.resistencia;
        romperEscudo(def);
        resultado = habAtk + tA.valor;
        log(ctx, () => `  ¡El golpe rompe ${esc.conjuro.nombre} de ${def.ficha.nombre}! Pasa con daño ${baseTrasEscudo} → ${resultado}.`);
      }
    }
  }

  if (resultado <= 0) {
    // Absorción de Ki: con una defensa que permita contraatacar absorbe Ki de la técnica (Dominus p.64).
    if (kiDef?.absorcionKi && resultado < 0 && o.costeTecnica && quienDefiende.ki) {
      const absorbe = recuperarKi(quienDefiende, Math.min(kiDef.absorcionKi, o.costeTecnica));
      if (absorbe) log(ctx, () => `  ${quienDefiende.ficha.nombre} absorbe ${absorbe} de Ki de la técnica [reserva ${quienDefiende.ki!.reserva}].`);
    }
    // Reflectar el ataque (Ki): lo devuelve con la habilidad final del atacante, más el bono de
    // contraataque, sin sus efectos esotéricos y sin gastar acciones; cuenta como su contra (Dominus p.71).
    if (kiDef?.reflectar && !o.reflejado && activo(atk)) {
      reflectar(ctx, quienDefiende, atk, habAtk + tA.valor + (resultado < 0 ? bonoContraataque(resultado) : 0), o);
      return { defensor: quienDefiende, contra: null, impacto: false };
    }
    // Emp arcano: cada defensa con éxito contra un arma permite desarmar (Dominus p.39).
    if (quienDefiende.cap.est.desarmaAlDefender && !atk.cap.desarmado && activo(atk)) {
      const c = caracteristicasControl('desarmar', quienDefiende, atk);
      // Control directo, sin los modificadores de Emp (Dominus p.39); los negativos sí cuentan.
      if (controlEnfrentado(ctx.rng, c.atk + modControl(quienDefiende), c.def + modControl(atk)) > 0) desarmar(ctx, atk, quienDefiende);
    }
    // Parada o esquiva limitada (Ki): no permite contraatacar (Dominus p.53).
    // Ataque indirecto (Ki): no se puede contraatacar (Dominus p.52).
    return { defensor: quienDefiende, contra: resultado < 0 && !kiDef?.sinContra && !o.ki?.indirecto ? bonoContraataque(resultado) : null, impacto: false };
  }

  // Conjuro anímico (Core p.122): alcanza si logra un resultado de daño contra la TA de energía; en
  // vez de dañar, el blanco hace la RM. No lo deja a la defensiva: no lo golpea (interpretación).
  if (o.animico) {
    const pct = porcentajeDano(resultado, absorcionContra(def, atk, 'normal', 'ENE', o.ranura, o.ki));
    if (pct <= 0) {
      log(ctx, () => `  No alcanza un resultado de daño contra su TA de energía: el conjuro no lo afecta.`);
      return { defensor: def, contra: null, impacto: false };
    }
    efectoAnimico(ctx, atk, def, o.animico, pct);
    return { defensor: def, contra: null, impacto: true };
  }

  // Cuerpo a Fuego: lo que no es energía, frío o agua lo atraviesa sin dañarlo; quien lo toca se
  // quema (Core p.158).
  const sinArmasCerca = o.ranura.sinArmas && !o.aDistancia && !o.ki?.conjuro;
  if (def.bono?.cuerpoFuego && inmuneAlGolpe(def, atk, tipoGolpe, o.ki)) {
    log(ctx, () => `  El golpe atraviesa las llamas del cuerpo de ${def.ficha.nombre} sin dañarlo.`);
    if (sinArmasCerca && activo(atk)) quemarAlTocar(ctx, def, atk);
    return { defensor: def, contra: null, impacto: false };
  }
  if (atk.bono?.cuerpoFuego && sinArmasCerca && activo(def)) quemarAlTocar(ctx, atk, def);
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
  const m = o.maniobra;
  const porcentaje = porcentajeDano(resultado, absorcionContra(def, atk, m, o.tipo, o.ranura, o.ki));

  if (esManiobraDeControl(m)) {
    if (porcentaje >= 10) resolverControl(ctx, atk, def, m, porcentaje, o.esContra, o.ki?.apresamiento ?? 0);
    else log(ctx, () => `  No alcanza el 10% necesario para la maniobra.`);
    if (m === 'desarmar') {
      avisar();
      return { defensor: def, contra: null, impacto: true };
    }
  }

  // Daño: Derribo y Presa a la mitad (Grappling supremo completo), contra la armadura real.
  let base = baseTrasEscudo >= 0 ? baseTrasEscudo : danoBase(atk, def, o.esContra, o.ranura, o.ki);
  if (o.factorDano !== undefined) base = Math.floor(base * o.factorDano);
  if ((m === 'derribo' || m === 'presa') && !atk.cap.est.danoCompletoEnPresa) base = Math.floor(base / 2);
  // Contra la armadura real (los controles van contra TA 0 sólo para alcanzar el 10%); en un
  // apuntado, la de la zona.
  const abs = absorcionContra(def, atk, esManiobraDeControl(m) ? 'normal' : m, o.tipo, o.ranura, o.ki);
  const tipo = o.tipo ?? perfilDe(atk, o.ranura).tipoAtaque;
  const frena = barreraFrena(def, atk, base, o.ki);
  let dano = frena ? 0 : danoFinal(base, porcentajeDano(resultado, abs));
  // Sangre de Aeon: daño de su elemento a la mitad.
  if (def.cap.est.elementoAfin && def.cap.est.elementoAfin === tipo) dano = Math.floor(dano / 2);
  // Efectos sobrenaturales de la técnica: los que piden dañar cuentan el daño que habría hecho aunque
  // tenga Daño reducido (Dominus p.69, p.73). Impacto basta con superar la defensa (p.68).
  const ki = o.ki;
  if (ki && (ki.impacto || ki.marca || ki.interrumpe || ki.estados.length || ki.danoReducido) && !esManiobraDeControl(m)) {
    const habriaDanado = dano;
    if (ki.danoReducido) dano = Math.floor(dano * (1 - ki.danoReducido));
    const porcentajeContacto = porcentajeDano(resultado, absorcion(0));
    efectosAlImpactar(ctx, atk, def, ki, habriaDanado, porcentajeContacto);
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
    destruccionPorKi(ctx, atk, def, o.kiDestruccion ?? 0, resiste);
    avisar();
    return { defensor: def, contra: null, impacto: true };
  }
  // Puntos de presión (Mushin): en vez de daño, RF contra el daño + 20 (Dominus p.42).
  if (m === 'puntosPresion') {
    if (dano > 0) puntosDePresion(ctx, atk, def, dano, o.estadoMushin ?? null);
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
    if (tipo === 'CAL' && activo(def)) prender(ctx, atk, def, tirarD100Cerrada(ctx.rng) + dano);
  } else if (frena) log(ctx, () => `  Impacta, pero la barrera de daño ${def.cap.barrera} frena el daño base ${base}.`);
  else if (!esManiobraDeControl(m) && !absorbido) {
    log(ctx, () => `  Impacta sin daño (absorción ${abs}).`);
    // La armadura evitó el daño: puede romperse (Core p.93).
    if (ctx.opciones.rotura) roturaDeArmadura(ctx, atk, def, o.ranura, zonaDe(m));
  }
  avisar();
  return { defensor: def, contra: null, impacto: true };
}

/**
 * Destrucción por Ki (Core p.104): RF contra la Presencia base del atacante (+5 por punto de Ki extra,
 * hasta el doble); pierde tantos PV como el fracaso, sin que cuente la armadura. Un 100 natural en la
 * RF siempre resiste.
 */
function destruccionPorKi(ctx: Contexto, atk: Luchador, def: Luchador, extra: number, resistia: boolean) {
  const dif = dificultadDestruccion(atk, extra);
  const dadoRf = tirarD100Cerrada(ctx.rng);
  const baseRf = def.ficha.rf + def.cap.est.bonoRfDano;
  const fracaso = dadoRf === 100 ? 0 : dif - (baseRf + dadoRf);
  const tirada = `RF ${baseRf + dadoRf} [${baseRf}+${dadoRf}] contra ${dif}`;
  if (fracaso <= 0) {
    log(ctx, () => `  ${def.ficha.nombre} resiste la Destrucción por Ki (${tirada}).`);
    return;
  }
  log(ctx, () => `  ${def.ficha.nombre} falla la RF contra la Destrucción por Ki (${tirada}) por ${fracaso}.`);
  aplicarDano(ctx, atk, def, fracaso, resistia, 'normal');
}

// --------------------------------------------------------------------------- efectos sobrenaturales (Ki)

/**
 * Lo que una técnica hace al alcanzar (Dominus cap. 5): Impacto con sólo superar la defensa; Marca,
 * Interrupción y los Estados de condición Ataque o Beso si el golpe dañaría; los de Contacto físico
 * con que alcance contra TA 0 (Dominus p.68).
 */
function efectosAlImpactar(ctx: Contexto, atk: Luchador, def: Luchador, ki: ModKi, dano: number, porcentajeContacto: number) {
  if (ki.marca && dano > 0 && (def.marcas.get(atk) ?? 0) < ki.marca) {
    def.marcas.set(atk, ki.marca);
    log(ctx, () => `  ${def.ficha.nombre} queda marcado por ${atk.ficha.nombre} (+${ki.marca} a sus ataques contra él).`);
  }
  if (ki.interrumpe && dano > 0) interrupcion(ctx, atk, def, dano + ki.interrupcion);
  for (const est of ki.estados) {
    if (!activo(def)) return;
    const alcanza = est.condicion === 'contacto' ? porcentajeContacto > 0 : est.condicion !== 'automatico' && dano > 0;
    if (alcanza) estadoSobrenatural(ctx, atk, def, est);
  }
  if (ki.impacto && activo(def)) impacto(ctx, atk, def, ki.impacto, ki.atraer);
}

/** RF del defensor contra una dificultad (las Resistencias no sufren negativos, Core p.232). Devuelve el fracaso (0 si resiste). */
function tirarRf(ctx: Contexto, l: Luchador, dificultad: number, que: string): number {
  const dadoRf = tirarD100Cerrada(ctx.rng);
  const baseRf = l.ficha.rf + l.cap.est.bonoRfDano + (l.ki?.activo.rf ?? 0) + (l.bono?.resistencias ?? 0);
  const fracaso = dadoRf === 100 ? 0 : dificultad - (baseRf + dadoRf);
  const tirada = `RF ${baseRf + dadoRf} [${baseRf}+${dadoRf}] contra ${dificultad}`;
  if (fracaso <= 0) log(ctx, () => `  ${l.ficha.nombre} resiste ${que} (${tirada}).`);
  else log(ctx, () => `  ${l.ficha.nombre} falla la RF contra ${que} (${tirada}) por ${fracaso}.`);
  return Math.max(0, fracaso);
}

/**
 * RM o RF contra un conjuro (las Resistencias no sufren negativos, Core p.232); con "RM o RF" usa la
 * mejor (interpretación). Un 100 natural siempre resiste. Devuelve el fracaso (0 si resiste).
 */
function tirarResistencia(ctx: Contexto, l: Luchador, dificultad: number, que: string, cual: 'RM' | 'RF' | 'RM o RF', bono = 0): number {
  const rf = l.ficha.rf + l.cap.est.bonoRfDano + (l.ki?.activo.rf ?? 0);
  const rm = rmDe(l);
  const usa = cual === 'RF' || (cual === 'RM o RF' && rf > rm) ? 'RF' : 'RM';
  const base = (usa === 'RF' ? rf : rm) + (l.bono?.resistencias ?? 0) + bono;
  const dado = tirarD100Cerrada(ctx.rng);
  const fracaso = dado === 100 ? 0 : dificultad - (base + dado);
  const tirada = `${usa} ${base + dado} [${base}+${dado}] contra ${dificultad}`;
  if (fracaso <= 0) log(ctx, () => `  ${l.ficha.nombre} resiste ${que} (${tirada}).`);
  else log(ctx, () => `  ${l.ficha.nombre} falla la ${usa} contra ${que} (${tirada}) por ${fracaso}.`);
  return Math.max(0, fracaso);
}

const NOMBRE_ESTADO: Record<EstadoSobrenatural['estado'], string> = {
  ceguera: 'la Ceguera', coma: 'el Coma', control: 'el Control', dano: 'el Daño', dobleDano: 'el Doble daño',
  dolor: 'el Dolor', dolorExtremo: 'el Dolor extremo', drenajeVida: 'el Drenaje de vida', drenajeKi: 'el Drenaje de Ki',
  fascinacion: 'la Fascinación', inconsciencia: 'la Inconsciencia', miedo: 'el Miedo', terror: 'el Terror',
  muerte: 'la Muerte', paralisisParcial: 'la Paralización parcial', paralisisTotal: 'la Paralización total',
  penalizacionMenor: 'la Penalización a toda acción', penalizacionMayor: 'la Penalización a toda acción mayor',
  reduccionCaracteristicas: 'la Reducción de características', reduccionCaracteristica: 'la Reducción de una característica',
  reduccionRf: 'la Reducción de RF', ilusion: 'la Ilusión',
};

/**
 * Estado sobrenatural (Dominus p.67): RF contra su Resistencia; el fracaso decide la intensidad. Los
 * que duran minutos u horas duran todo el combate. Ilusión no se simula; Control lo deja fuera del
 * combate y Terror lo hace huir (interpretaciones).
 */
function estadoSobrenatural(ctx: Contexto, atk: Luchador, def: Luchador, est: EstadoSobrenatural) {
  if (est.estado === 'ilusion') return;
  const fracaso = tirarRf(ctx, def, est.rf, NOMBRE_ESTADO[est.estado]);
  if (!fracaso) return;
  const f = def.ficha;
  switch (est.estado) {
    case 'dano':
    case 'dobleDano':
    case 'drenajeVida': {
      const pv = est.estado === 'dobleDano' ? 2 * fracaso : fracaso;
      perderPv(ctx, atk, def, pv);
      if (est.estado === 'drenajeVida' && activo(atk)) {
        const cura = Math.min(pv, atk.ficha.pv - atk.pv);
        if (cura > 0) {
          atk.pv += cura;
          log(ctx, () => `  ${atk.ficha.nombre} absorbe ${cura} PV (${atk.pv}/${atk.ficha.pv}).`);
        }
      }
      return;
    }
    case 'drenajeKi': {
      const quita = Math.min(fracaso, def.ki?.reserva ?? 0);
      if (def.ki) def.ki.reserva -= quita;
      const gana = recuperarKi(atk, quita);
      log(ctx, () => `  ${def.ficha.nombre} pierde ${quita} de Ki${gana ? ` y ${atk.ficha.nombre} recupera ${gana}` : ''}.`);
      return;
    }
    case 'dolor':
    case 'dolorExtremo': {
      const dolor = est.estado === 'dolor' ? 'normal' : 'extremo';
      if (f.estados?.dolor !== 'extremo') cambiarFicha(def, { ...f, estados: { ...f.estados, dolor } });
      log(ctx, () => `  ${def.ficha.nombre} sufre ${dolor === 'normal' ? 'Dolor (−40' : 'Dolor extremo (−80'} a toda acción).`);
      return;
    }
    case 'miedo':
      if (!f.estados?.miedo) cambiarFicha(def, { ...f, estados: { ...f.estados, miedo: true } });
      log(ctx, () => `  ${def.ficha.nombre} queda con Miedo (−60 a toda acción).`);
      return;
    case 'ceguera':
      cambiarFicha(def, { ...f, estados: { ...f.estados, ceguera: 'absoluta' } });
      log(ctx, () => `  ${def.ficha.nombre} queda ciego.`);
      return;
    case 'paralisisParcial':
    case 'paralisisTotal': {
      const grado = est.estado === 'paralisisParcial' ? 2 : 3;
      if (def.paralisisTurnos <= 0 || def.paralisisInducida <= grado) {
        def.paralisisInducida = grado;
        def.paralisisTurnos = Math.max(def.paralisisTurnos, fracaso);
      }
      log(ctx, () => `  ${def.ficha.nombre} queda en ${grado === 2 ? 'parálisis parcial' : 'parálisis completa'} ${fracaso} asaltos.`);
      return;
    }
    case 'penalizacionMenor':
      def.penDolor += fracaso;
      log(ctx, () => `  ${def.ficha.nombre} sufre −${fracaso} a toda acción (baja 5 por asalto).`);
      return;
    case 'penalizacionMayor':
      def.penFisico += fracaso;
      log(ctx, () => `  ${def.ficha.nombre} sufre −${fracaso} a toda acción.`);
      return;
    case 'reduccionRf':
      cambiarFicha(def, { ...f, rf: f.rf - fracaso });
      log(ctx, () => `  ${def.ficha.nombre} pierde ${fracaso} de RF.`);
      return;
    case 'reduccionCaracteristica':
    case 'reduccionCaracteristicas': {
      const puntos = Math.floor(fracaso / 10);
      if (!puntos) return;
      const cuales: Atributo[] = est.estado === 'reduccionCaracteristicas' ? ['AGI', 'CON', 'DES', 'FUE', 'INT', 'PER', 'POD', 'VOL'] : [est.atributo ?? 'FUE'];
      let g = f;
      for (const a of cuales) {
        const v = g.atributos?.[a] ?? 5;
        g = a === 'AGI' || a === 'CON' || a === 'DES' || a === 'FUE'
          ? fichaConAumento(g, a, v, Math.max(1, v - puntos))
          : { ...g, atributos: { ...g.atributos, [a]: Math.max(1, v - puntos) } };
      }
      cambiarFicha(def, g);
      log(ctx, () => `  ${def.ficha.nombre} pierde ${puntos} en ${cuales.join(', ')}.`);
      return;
    }
    case 'fascinacion':
      def.fascinado = est.rf;
      log(ctx, () => `  ${def.ficha.nombre} queda fascinado: no puede hacer acciones activas.`);
      return;
    case 'inconsciencia':
    case 'coma':
      log(ctx, () => `  ${def.ficha.nombre} queda inconsciente.`);
      caer(ctx, atk, def, 'inconsciente');
      return;
    case 'muerte':
      log(ctx, () => `  ${def.ficha.nombre} muere.`);
      caer(ctx, atk, def, 'muerto');
      return;
    case 'control':
      log(ctx, () => `  ${def.ficha.nombre} queda bajo el control de ${atk.ficha.nombre}: deja de pelear.`);
      huir(ctx, def);
      return;
    case 'terror':
      log(ctx, () => `  ${def.ficha.nombre} queda aterrorizado.`);
      huir(ctx, def);
      return;
  }
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

/** Fascinación: cada vez que lo atacan repite la RF; si la supera, se libera (Dominus p.67). */
function repetirFascinacion(ctx: Contexto, l: Luchador) {
  if (!tirarRf(ctx, l, l.fascinado, 'la Fascinación')) l.fascinado = 0;
}

/**
 * Interrupción del Ki (Dominus p.69): RF contra el daño más el valor de la técnica (entre cinco
 * contra acumulación); si falla, pierde lo acumulado, las mantenidas y las que tenía en espera.
 */
function interrupcion(ctx: Contexto, atk: Luchador, def: Luchador, dificultad: number) {
  const e = def.ki;
  if (!e) return;
  const dif = def.ficha.acumulacion ? Math.floor(dificultad / 5) : dificultad;
  if (!tirarRf(ctx, def, dif, 'la Interrupción')) return;
  e.acumulado = {};
  e.ganado = {};
  e.mantenidas.clear();
  e.enEspera.clear();
  e.objetivo = null;
  e.activo = { ...SIN_KI };
  def.escudoKi = 0;
  log(ctx, () => `  ${def.ficha.nombre} pierde su Ki acumulado y sus técnicas activas.`);
}

/** Tabla 2 del Dominus (p.12): metros (el mínimo de cada rango) y Grado, por Fuerza y fracaso. */
const IMPACTO: [number, number][][] = [
  // Fue 6-9, 10-12, 13-14, 15-16, 17-18, 19-20; filas por fracaso 1, 2, 3-4, 5-6, 7-8, 9+.
  [[1, 1], [5, 1], [10, 2], [15, 2], [30, 3], [50, 4]],
  [[2, 1], [7, 1], [15, 2], [30, 3], [50, 3], [100, 4]],
  [[3, 1], [10, 2], [30, 3], [50, 3], [150, 4], [500, 4]],
  [[5, 1], [15, 2], [50, 3], [100, 4], [500, 4], [1000, 5]],
  [[7, 1], [20, 2], [80, 3], [200, 4], [1000, 5], [5000, 5]],
  [[10, 2], [30, 2], [120, 4], [500, 4], [5000, 5], [25000, 5]],
];
/** Tabla 3: daño medio de cada Grado (G1 va incluido en el del ataque). */
const DANO_GRADO = [0, 0, 8, 30, 75, 175];

/**
 * Impacto (Dominus p.68, p.12): control enfrentado de su Fuerza contra la del Impacto; si lo pierde,
 * sale despedido según la Tabla 2 y sufre el daño del Grado (−10 por punto de TA contundente; desde
 * G4 crítico con el doble del daño). Con Atraer, en cambio, lo trae al cuerpo a cuerpo. Lejos del
 * combate, queda fuera del alcance de todos.
 */
function impacto(ctx: Contexto, atk: Luchador, def: Luchador, fuerza: number, atraer: boolean) {
  const dif = controlEnfrentado(ctx.rng, fuerza, atributo(def, 'FUE') + modControl(def));
  if (dif <= 0) {
    log(ctx, () => `  ${def.ficha.nombre} aguanta el Impacto (control ${dif}).`);
    return;
  }
  if (atraer) {
    if (!enAlcance(atk, def)) moverHacia(ctx, def, atk, Infinity);
    log(ctx, () => `  El Impacto atrae a ${def.ficha.nombre} hasta ${atk.ficha.nombre}.`);
    return;
  }
  const columna = fuerza >= 19 ? 5 : fuerza >= 17 ? 4 : fuerza >= 15 ? 3 : fuerza >= 13 ? 2 : fuerza >= 10 ? 1 : 0;
  const fila = dif >= 9 ? 5 : dif >= 7 ? 4 : dif >= 5 ? 3 : dif >= 3 ? 2 : dif - 1;
  const [metros, grado] = IMPACTO[fila][columna];
  const recorrido = despedir(ctx, atk, def, metros);
  log(ctx, () => `  El Impacto lanza a ${def.ficha.nombre} ${recorrido < metros ? `contra un obstáculo a ${recorrido.toFixed(0)} m` : `a ${metros} m`} (Grado ${grado}).`);
  const dano = Math.max(0, DANO_GRADO[grado] - 10 * (def.ficha.ta.CON ?? 0));
  if (dano > 0) {
    perderPv(ctx, atk, def, dano);
    if (grado >= 4 && activo(def)) critico(ctx, atk, def, 2 * dano, false, 'normal');
  }
}

/** Lo aleja en línea recta de `desde`; en el mapa, celda a celda hasta un muro u otro luchador. */
function despedir(ctx: Contexto, desde: Luchador, l: Luchador, metros: number): number {
  soltar(l);
  if (l.apresando) soltar(l.apresando);
  const dx = l.pos.x - desde.pos.x, dy = l.pos.y - desde.pos.y;
  const d = Math.hypot(dx, dy) || 1;
  let recorrido = metros;
  if (l.mapa) {
    const m = l.mapa;
    const paso = { x: Math.round(dx / d), y: Math.round(dy / d) };
    if (!paso.x && !paso.y) paso.x = 1;
    const ocupadas = new Set(ctx.luchadores.filter((x) => x !== l && activo(x)).map((x) => indice(m, x.pos)));
    let n = 0;
    while (n < metros) {
      const sig = { x: l.pos.x + paso.x, y: l.pos.y + paso.y };
      if (!transitable(m, sig) || ocupadas.has(indice(m, sig))) break;
      l.pos = sig;
      n++;
    }
    recorrido = n * (paso.x && paso.y ? Math.SQRT2 : 1);
  } else l.pos = { x: l.pos.x + (dx / d) * metros, y: l.pos.y + (dy / d) * metros };
  for (const x of ctx.luchadores) if (!enAlcance(x, l)) x.trabados = x.trabados.filter((e) => e !== l);
  l.trabados = l.trabados.filter((e) => enAlcance(l, e));
  return recorrido;
}

/** Lo acerca hasta trabarse con `obj` sin gastar su movimiento (Atraer). */
function moverHacia(ctx: Contexto, l: Luchador, obj: Luchador, metros: number) {
  if (l.mapa) {
    const m = l.mapa;
    const ocupadas = new Set(ctx.luchadores.filter((x) => x !== l && activo(x)).map((x) => indice(m, x.pos)));
    const libre = celdaLibreCerca(m, obj.pos, ocupadas);
    if (libre) l.pos = libre;
  } else moverEnLinea(l, obj, metros);
  for (const e of ctx.luchadores) {
    if (e.equipo === l.equipo || !activo(e) || !enAlcance(l, e)) continue;
    if (!e.trabados.includes(l)) e.trabados.push(l);
    if (!l.trabados.includes(e)) l.trabados.push(e);
  }
}

/**
 * Reflectar el ataque (Dominus p.71): lo devuelve contra quien lo lanzó con su misma habilidad final
 * (más el bono de contra), con el daño del ataque pero sin sus efectos esotéricos.
 */
function reflectar(ctx: Contexto, quien: Luchador, atk: Luchador, total: number, o: Golpe) {
  const dano = danoBase(atk, quien, o.esContra, o.ranura, o.ki);
  const tipo = o.tipo ?? perfilDe(atk, o.ranura).tipoAtaque;
  const golpe: Golpe = { maniobra: 'normal', esContra: true, tipo, ranura: o.ranura, ki: { ...SIN_KI, danoFijo: dano }, reflejado: true };
  resolverDefensa(ctx, quien, atk, total, DADO_FIJO, golpe, `${quien.ficha.nombre} refleja el ataque contra ${atk.ficha.nombre}`);
}

/**
 * Técnica de Estados de condición automática (Dominus p.67-68): una acción activa sin tirada de
 * ataque. Un blanco (o todos los que estén a su distancia si alcanza a varios) hace la RF.
 */
function estadosAutomaticos(ctx: Contexto, l: Luchador, tecnica: Tecnica, blancos: Luchador[]) {
  const ki = ejecutar(l, tecnica);
  l.stats.tecnicas[tecnica.nombre] = (l.stats.tecnicas[tecnica.nombre] ?? 0) + 1;
  log(ctx, () => `${l.ficha.nombre} usa ${tecnica.nombre} [Ki ${textoKi(l)}] sobre ${blancos.map((b) => b.ficha.nombre).join(', ')}.`);
  for (const b of blancos)
    for (const est of ki.estados) if (est.condicion === 'automatico' && activo(b)) estadoSobrenatural(ctx, l, b, est);
}

/**
 * Mushin: RF contra el daño + 20 (máx. 220; arcano +20, máx. 240). Si falla: −fracaso a toda
 * acción (se recupera 5 por asalto) y pierde el doble de PV. El arcano además induce un estado.
 */
function puntosDePresion(ctx: Contexto, atk: Luchador, def: Luchador, dano: number, estado: EstadoMushin | null) {
  const dif = dificultadPuntosPresion(dano, atk.cap.est.mushin >= 3);
  const dadoRf = tirarD100Cerrada(ctx.rng);
  // Las Resistencias no sufren el negativo a toda acción (Core p.232).
  const baseRf = def.ficha.rf + def.cap.est.bonoRfDano;
  const res = baseRf + dadoRf;
  if (dadoRf === 100 || res >= dif) {
    log(ctx, () => `  ${def.ficha.nombre} resiste los puntos de presión (RF ${res} [${baseRf}+${dadoRf}] contra ${dif}).`);
    return;
  }
  const fallo = dif - res;
  def.penDolor += fallo;
  def.pv -= 2 * fallo;
  limitePorDano(ctx, def, 2 * fallo);
  atk.stats.danoCausado += 2 * fallo;
  def.stats.danoRecibido += 2 * fallo;
  log(ctx, () => `  ${def.ficha.nombre} falla la RF (${res} [${baseRf}+${dadoRf}] contra ${dif}) por ${fallo}: −${fallo} a toda acción y −${2 * fallo} PV (${def.pv}/${def.ficha.pv}).`,
    () => ({ dano: { quien: nro(ctx, def), cantidad: 2 * fallo } }));
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
      limitePorDano(ctx, def, 5 * falla);
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
function resolverControl(ctx: Contexto, atk: Luchador, def: Luchador, m: 'derribo' | 'presa' | 'desarmar', porcentaje: number, esContra: boolean, apresamiento = 0) {
  const c = caracteristicasControl(m, atk, def, apresamiento);
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
  limitePorDano(ctx, def, dano);
  // Puntos vulnerables: un ataque apuntado a cabeza, corazón o (para inutilizar) una extremidad
  // critica con 1/10 de los PV actuales (Core p.91, p.97). Inutilizar no funciona con acumulación.
  // Ojos de la Muerte: todo golpe que daña es crítico; contra acumulación, en cambio, todo su cuerpo
  // cuenta como punto vulnerable (Dominus p.78).
  // Crítico automático (Ki) funciona igual (Dominus p.71).
  const ojos = atk.cap.est.criticoAutomatico || !!ki?.criticoAuto;
  const acumula = !!def.ficha.acumulacion;
  const vulnerable = (esApuntado(m) && !def.cap.est.sangreEterna && !acumula) || (ojos && acumula);
  const critica =
    (ojos && !acumula) || esCritico(danoPleno, pvAntes) || (vulnerable && pvAntes > 0 && danoPleno * 10 >= pvAntes);
  const enuthArcano = atk.cap.est.enuth >= 3;
  if (critica) critico(ctx, atk, def, danoPleno, resistia, m, ki?.critico ?? 0);
  // Enuth arcano: todo ataque que dañe obliga a un control de inconsciencia (Dominus p.43).
  else if (enuthArcano && activo(def)) critico(ctx, atk, def, danoPleno, resistia, 'inconsciencia');
  verificarCaida(ctx, atk, def);
}

/** Límites que se activan por perder PV (Caelum, Terminus, Cenobus). */
function limitePorDano(ctx: Contexto, l: Luchador, dano: number) {
  // Perder PV mientras acumula magia: Resistir el dolor para no perder la concentración (Core p.118).
  const conc = l.magia ? danoAlAcumular(l, dano, ctx.rng) : null;
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
function critico(ctx: Contexto, atk: Luchador, def: Luchador, dano: number, resistia: boolean, m: Maniobra, bonoKi = 0, nivelFijo?: number) {
  atk.stats.criticosCausados++;
  if (alRecibirCritico(def)) log(ctx, () => `  ${def.ficha.nombre} activa su Límite Cruor: recupera 10 de Ki.`);
  const e = atk.cap.est;
  const apuntado = localizacionApuntada(m);
  const vital = m === 'cabeza' || m === 'corazon';
  // Enuth: +20 al crítico para dejar inconsciente; arcano +50 (Dominus p.43).
  const bonoEnuth = m === 'inconsciencia' ? (e.enuth >= 3 ? 50 : e.enuth >= 1 ? 20 : 0) : 0;
  // Potenciar Crítico (Ki) suma a la tirada del crítico (Dominus p.70).
  let bono = atk.cap.bonoCritico + e.bonoCriticoEstilos + (vital ? e.bonoCriticoVital : 0) + bonoEnuth + bonoKi;
  // Aumentar el Crítico: conjuro pasivo que se declara antes de tirar (Core p.157).
  const aumento = nivelFijo === undefined && atk.magia ? ia.aumentarCritico(ctx, atk, def, dano + bono) : null;
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
  const baseRf = def.ficha.rf + def.cap.est.bonoRfCritico + def.cap.est.bonoRfDano + (def.ki?.activo.rf ?? 0) + (def.bono?.resistencias ?? 0);
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
