// Lo que el Ki le hace al combate fuera del golpe (Dominus cap. 5): el Aura de combate, los Estados de
// las técnicas, Impacto, Destrucción por Ki, Interrupción, Reflectar y los puntos de presión del
// Mushin. Recibe el motor por `Motor`, como los efectos de conjuro.

import type { Contexto, Luchador, Tecnica } from './modelo';
import { fichaConArmaKi } from './rotura';
import { DADO_FIJO, textoTirada, tirarD100Cerrada } from './dados';
import { resultadoResistencia, umbralPifia } from './reglas';
import { activo, baseDeteccionKi, ataqueFinal, cegueraContra, nro, frialdadDe, rfDe, danoBase, distancia, enAlcance, modControl, penAccion, perfilDe, proximaRanura } from './calculos';
import { atributo, capacidad, controlEnfrentado, dificultadPuntosPresion, type EstadoMushin } from './maniobras';
import type { Golpe } from './golpe';
import { imponer, nivelCondicion } from './condiciones';
import { aplicarEstado, ESTADOS_DE_ANIMO, NOMBRE_ESTADO } from './efectos/estados';
import { type Motor } from './efectos';
import { terminarMantenidos } from './magia';
import * as ia from './ia';
import { celdaLibreCerca, indice, transitable } from './mapa';
import {
  dificultadDestruccion, dificultadAura, efectosDe, presenciaBase, radioAura, sensibleAlAura, ejecutar, textoKi, SIN_KI,
  type EstadoSobrenatural, type ModKi,
} from './ki';

/**
 * Aura de combate (Dominus p.21-22): cada rival sensible en el radio hace un control con su Presencia
 * base + d100 contra la dificultad del Aura. Quien lo supera no lo repite en el combate; afectado
 * lo repite cada 5 asaltos sin poder empeorar. Por el fracaso (Tabla 9): hasta 19 afectado (−10 a
 * toda acción), hasta 49 miedo, hasta 99 paralización parcial, 100 o más se desvanece.
 */
export function aplicarAuras(motor: Motor, ctx: Contexto, vivos: Luchador[]) {
  for (const fuente of vivos) {
    if (!fuente.ki?.auraActiva || !activo(fuente)) continue;
    // Un bono a toda acción no sube una habilidad sobrenatural (Core p.232): sólo restan los negativos.
    const dificultad = dificultadAura(fuente, Math.max(0, penAccion(fuente)));
    for (const x of ctx.luchadores) {
      // Alcanza a todos los del radio, aliados incluidos (Dominus p.21: "aquellos que lo rodean").
      if (x === fuente || !activo(x) || !sensibleAlAura(fuente, x) || distancia(fuente, x) > radioAura(fuente)) continue;
      const previo = x.auras.get(fuente);
      if (previo && (previo.estado !== 'afectado' || ctx.asalto - previo.asalto < 5)) continue;
      const dado100 = tirarD100Cerrada(ctx.rng);
      // Con Frialdad suma su bono (Dominus p.21, Core p.54).
      const base = presenciaBase(x.ficha) + frialdadDe(x);
      // Un empate no supera el control: "0 a −19", afectado (Dominus p.22, Tabla 9).
      const { falla, fracaso } = resultadoResistencia(base, dado100, dificultad);
      const estado = !falla ? 'resistio' : fracaso < 20 ? 'afectado' : fracaso < 50 ? 'miedo' : fracaso < 100 ? 'paralizado' : 'desvanecido';
      const texto = `${x.ficha.nombre} siente el Aura de combate de ${fuente.ficha.nombre} (Presencia ${base + dado100} [${base}+${dado100}] contra ${dificultad})`;
      // Repetir el control como afectado sólo puede mejorar: o lo supera o sigue igual.
      if (previo && estado !== 'resistio') {
        x.auras.set(fuente, { ...previo, asalto: ctx.asalto });
        motor.log(ctx, () => `${texto}: sigue afectado.`);
        continue;
      }
      if (estado === 'desvanecido') {
        motor.log(ctx, () => `${texto}: falla por ${fracaso} y se desvanece.`);
        motor.caer(ctx, fuente, x, 'inconsciente');
        continue;
      }
      x.auras.set(fuente, { estado, asalto: ctx.asalto });
      if (estado === 'paralizado') {
        // "Incapaz apenas de moverse": paralización parcial (Core p.233), mientras dure el combate.
        imponer(x, 'paralisis', { nivel: Math.max(nivelCondicion(x, 'paralisis'), 2), asaltos: Infinity });
      }
      const efecto = { resistio: 'lo resiste', afectado: `falla por ${fracaso}: queda afectado, −10 a toda acción`,
        miedo: `falla por ${fracaso}: siente miedo, −60 a toda acción`, paralizado: `falla por ${fracaso}: queda paralizado` }[estado];
      motor.log(ctx, () => `${texto}: ${efecto}.`);
    }
  }
}

/**
 * Destrucción por Ki (Core p.104): RF contra la Presencia base del atacante (+5 por punto de Ki extra,
 * hasta el doble); pierde tantos PV como el fracaso, sin que cuente la armadura. Un 100 natural en la
 * RF siempre resiste.
 */
export function destruccionPorKi(motor: Motor, ctx: Contexto, atk: Luchador, def: Luchador, extra: number, resistia: boolean) {
  const dif = dificultadDestruccion(atk, extra);
  const dadoRf = tirarD100Cerrada(ctx.rng);
  const baseRf = rfDe(def);
  const fracaso = dadoRf === 100 ? 0 : dif - (baseRf + dadoRf);
  const tirada = `RF ${baseRf + dadoRf} [${baseRf}+${dadoRf}] contra ${dif}`;
  if (fracaso <= 0) {
    motor.log(ctx, () => `  ${def.ficha.nombre} resiste la Destrucción por Ki (${tirada}).`);
    return;
  }
  motor.log(ctx, () => `  ${def.ficha.nombre} falla la RF contra la Destrucción por Ki (${tirada}) por ${fracaso}.`);
  motor.aplicarDano(ctx, atk, def, fracaso, resistia, 'normal');
}

/**
 * Lo que una técnica hace al alcanzar (Dominus cap. 5): Impacto con sólo superar la defensa; Marca,
 * Interrupción y los Estados de condición Ataque o Beso si el golpe dañaría; los de Contacto físico
 * con que alcance contra TA 0 (Dominus p.68).
 */
export function efectosAlImpactar(motor: Motor, ctx: Contexto, atk: Luchador, def: Luchador, ki: ModKi, dano: number, porcentajeContacto: number) {
  if (ki.marca && dano > 0 && (def.marcas.get(atk) ?? 0) < ki.marca) {
    def.marcas.set(atk, ki.marca);
    motor.log(ctx, () => `  ${def.ficha.nombre} queda marcado por ${atk.ficha.nombre} (+${ki.marca} a sus ataques contra él).`);
  }
  if (ki.interrumpe && dano > 0) interrupcion(motor, ctx, def, dano + ki.interrupcion, ki);
  for (const est of ki.estados) {
    if (!activo(def)) return;
    const alcanza = est.condicion === 'contacto' ? porcentajeContacto > 0 : est.condicion !== 'automatico' && dano > 0;
    if (alcanza) estadoSobrenatural(motor, ctx, atk, def, est);
  }
  if (ki.impacto && activo(def)) impacto(motor, ctx, atk, def, ki.impacto, ki.atraer);
}

/**
 * Estado sobrenatural (Dominus p.67): RF contra su Resistencia; el fracaso decide la intensidad
 * (efectos/estados.ts).
 */
export function estadoSobrenatural(motor: Motor, ctx: Contexto, atk: Luchador, def: Luchador, est: EstadoSobrenatural) {
  if (est.estado === 'ilusion') return;
  // Miedo, Terror y Fascinación afectan el ánimo: suma la Frialdad (Core p.54).
  const { falla, fracaso } = motor.tirarRf(ctx, def, est.rf, NOMBRE_ESTADO[est.estado], ESTADOS_DE_ANIMO.has(est.estado) ? frialdadDe(def) : 0);
  if (falla) aplicarEstado(motor, ctx, atk, def, est.estado, fracaso, { dificultad: est.rf, atributo: est.atributo });
}

/** Fascinación: cada vez que lo atacan repite la RF; si la supera, se libera (Dominus p.67). */
export function repetirFascinacion(motor: Motor, ctx: Contexto, l: Luchador) {
  if (!motor.tirarRf(ctx, l, l.fascinado, 'la Fascinación').falla) l.fascinado = 0;
}

/**
 * Interrupción (Dominus p.69): RF contra el daño más el valor de la técnica (entre cinco contra
 * acumulación); si falla, según los tipos de la técnica: Ki, pierde lo acumulado, las mantenidas y
 * las que tenía en espera; Magia, los conjuros que mantiene.
 */
export function interrupcion(motor: Motor, ctx: Contexto, def: Luchador, dificultad: number, tipos: Pick<ModKi, 'interrumpeKi' | 'interrumpeMagia'>) {
  const e = def.ki;
  const kiEnJuego = tipos.interrumpeKi && !!e;
  const magiaEnJuego = tipos.interrumpeMagia && !!def.magia?.mantenidos.length;
  if (!kiEnJuego && !magiaEnJuego) return;
  const dif = def.ficha.acumulacion ? Math.floor(dificultad / 5) : dificultad;
  if (!motor.tirarRf(ctx, def, dif, 'la Interrupción').falla) return;
  if (magiaEnJuego) {
    terminarMantenidos(def);
    motor.log(ctx, () => `  ${def.ficha.nombre} pierde los conjuros que mantenía.`);
  }
  if (!kiEnJuego || !e) return;
  e.acumulado = {};
  e.ganado = {};
  e.mantenidas.clear();
  e.enEspera.clear();
  e.objetivo = null;
  e.activo = { ...SIN_KI };
  def.escudoKi = 0;
  motor.log(ctx, () => `  ${def.ficha.nombre} pierde su Ki acumulado y sus técnicas activas.`);
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
export function impacto(motor: Motor, ctx: Contexto, atk: Luchador, def: Luchador, fuerza: number, atraer: boolean) {
  const dif = controlEnfrentado(ctx.rng, fuerza, atributo(def, 'FUE') + capacidad(def.ki?.activo, 'FUE') + modControl(def));
  if (dif <= 0) {
    motor.log(ctx, () => `  ${def.ficha.nombre} aguanta el Impacto (control ${dif}).`);
    return;
  }
  if (atraer) {
    if (!enAlcance(atk, def)) moverHacia(motor, ctx, def, atk, Infinity);
    motor.log(ctx, () => `  El Impacto atrae a ${def.ficha.nombre} hasta ${atk.ficha.nombre}.`);
    return;
  }
  const columna = fuerza >= 19 ? 5 : fuerza >= 17 ? 4 : fuerza >= 15 ? 3 : fuerza >= 13 ? 2 : fuerza >= 10 ? 1 : 0;
  const fila = dif >= 9 ? 5 : dif >= 7 ? 4 : dif >= 5 ? 3 : dif >= 3 ? 2 : dif - 1;
  const [metros, grado] = IMPACTO[fila][columna];
  const recorrido = despedir(motor, ctx, atk, def, metros);
  motor.log(ctx, () => `  El Impacto lanza a ${def.ficha.nombre} ${recorrido < metros ? `contra un obstáculo a ${recorrido.toFixed(0)} m` : `a ${metros} m`} (Grado ${grado}).`);
  const dano = Math.max(0, DANO_GRADO[grado] - 10 * (def.ficha.ta.CON ?? 0));
  if (dano > 0) {
    motor.perderPv(ctx, atk, def, dano);
    if (grado >= 4 && activo(def)) motor.critico(ctx, atk, def, 2 * dano, false, 'normal', { sinBonos: true });
  }
}

/** Lo aleja en línea recta de `desde`; en el mapa, celda a celda hasta un muro u otro luchador. */
export function despedir(motor: Motor, ctx: Contexto, desde: Luchador, l: Luchador, metros: number): number {
  motor.soltar(l);
  if (l.apresando) motor.soltar(l.apresando);
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
export function moverHacia(motor: Motor, ctx: Contexto, l: Luchador, obj: Luchador, metros: number) {
  if (l.mapa) {
    const m = l.mapa;
    const ocupadas = new Set(ctx.luchadores.filter((x) => x !== l && activo(x)).map((x) => indice(m, x.pos)));
    const libre = celdaLibreCerca(m, obj.pos, ocupadas);
    if (libre) l.pos = libre;
  } else motor.moverEnLinea(l, obj, metros);
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
export function reflectar(motor: Motor, ctx: Contexto, quien: Luchador, atk: Luchador, total: number, o: Golpe, kiDef?: ModKi) {
  const dano = danoBase(atk, quien, o.esContra, o.ranura, o.ki);
  const tipo = o.tipo ?? perfilDe(atk, o.ranura).tipoAtaque;
  // Reflectar habilidades esotéricas: conserva los efectos sobrenaturales del ataque (Dominus p.71).
  const ki = kiDef?.reflectarEsoterico && o.ki ? { ...o.ki, danoFijo: dano, multDano: 1, dano: 0, danoLimite: false } : { ...SIN_KI, danoFijo: dano };
  const golpe: Golpe = { maniobra: 'normal', esContra: true, tipo, ranura: o.ranura, ki, reflejado: true };
  // Elección del blanco: lo manda contra quien más le convenga, no sólo contra el atacante.
  const blanco = kiDef?.reflectarEligeBlanco ? ia.blancoDelReflejo(ctx, quien, atk, total, golpe) : atk;
  motor.resolverDefensa(ctx, quien, blanco, total, DADO_FIJO, golpe, `${quien.ficha.nombre} refleja el ataque contra ${blanco.ficha.nombre}`);
}

/**
 * Fusión (Dominus p.70): intangible, al alcanzarlo se materializa dentro de él. Cada uno tira 1d100
 * (cerrada) + su Presencia base, él con +20; el que saca menos recibe la diferencia como daño, con
 * crítico automático. Después deja de ser intangible (la técnica termina).
 */
export function fusion(motor: Motor, ctx: Contexto, atk: Luchador, def: Luchador) {
  const pA = presenciaBase(atk.ficha), pD = presenciaBase(def.ficha);
  const dA = tirarD100Cerrada(ctx.rng), dD = tirarD100Cerrada(ctx.rng);
  const totA = dA + pA + 20, totD = dD + pD;
  const herido = totA > totD ? def : atk, otro = herido === def ? atk : def;
  const dano = Math.abs(totA - totD);
  motor.log(ctx, () => `  ${atk.ficha.nombre} se materializa dentro de ${def.ficha.nombre} (Fusión): ${totA} [${dA}+${pA}+20] contra ${totD} [${dD}+${pD}]${dano ? `; ${herido.ficha.nombre} recibe ${dano}` : ''}.`);
  terminarIntangibilidad(atk);
  if (!dano) return;
  motor.perderPv(ctx, otro, herido, dano);
  if (activo(herido)) motor.critico(ctx, otro, herido, dano, false, 'normal');
}

/** Deja de mantener sus técnicas de Intangibilidad (Fusión, o el fin de la técnica). */
function terminarIntangibilidad(l: Luchador) {
  const e = l.ki;
  if (!e) return;
  for (const t of [...e.mantenidas.keys()]) if (efectosDe(t).asalto.intangible) e.mantenidas.delete(t);
  e.activo = { ...e.activo, intangible: false, intangibleOtros: 0, fusion: false };
}

/**
 * Técnica de Estados de condición automática (Dominus p.67-68): una acción activa sin tirada de
 * ataque. Un blanco (o todos los que estén a su distancia si alcanza a varios) hace la RF.
 */
export function estadosAutomaticos(motor: Motor, ctx: Contexto, l: Luchador, tecnica: Tecnica, blancos: Luchador[]) {
  const ki = usarTecnica(motor, ctx, l, tecnica);
  motor.log(ctx, () => `${l.ficha.nombre} usa ${tecnica.nombre} [Ki ${textoKi(l)}] sobre ${blancos.map((b) => b.ficha.nombre).join(', ')}.`);
  for (const b of blancos)
    for (const est of ki.estados) if (est.condicion === 'automatico' && activo(b)) estadoSobrenatural(motor, ctx, l, b, est);
  trasLaTecnica(motor, ctx, l);
}

/**
 * Mushin: RF contra el daño + 20 (máx. 220; arcano +20, máx. 240). Si falla: −fracaso a toda
 * acción (se recupera 5 por asalto) y pierde el doble de PV. El arcano además induce un estado.
 */
export function puntosDePresion(motor: Motor, ctx: Contexto, atk: Luchador, def: Luchador, dano: number, estado: EstadoMushin | null) {
  const dif = dificultadPuntosPresion(dano, atk.cap.est.mushin >= 3);
  const dadoRf = tirarD100Cerrada(ctx.rng);
  // Las Resistencias no sufren el negativo a toda acción (Core p.232).
  const baseRf = rfDe(def);
  const res = baseRf + dadoRf;
  if (!resultadoResistencia(baseRf, dadoRf, dif).falla) {
    motor.log(ctx, () => `  ${def.ficha.nombre} resiste los puntos de presión (RF ${res} [${baseRf}+${dadoRf}] contra ${dif}).`);
    return;
  }
  const fallo = dif - res;
  def.penEstado += fallo;
  def.pv -= 2 * fallo;
  motor.limitePorDano(ctx, def, 2 * fallo);
  atk.stats.danoCausado += 2 * fallo;
  def.stats.danoRecibido += 2 * fallo;
  motor.log(ctx, () => `  ${def.ficha.nombre} falla la RF (${res} [${baseRf}+${dadoRf}] contra ${dif}) por ${fallo}: −${fallo} a toda acción y −${2 * fallo} PV (${def.pv}/${def.ficha.pv}).`,
    () => ({ dano: { quien: nro(ctx, def), cantidad: 2 * fallo } }));
  if (estado) {
    // Estados de la Tabla del Mushin arcano. Las parálisis duran tantos asaltos como el fracaso.
    if (estado === 'debilidad') aplicarEstado(motor, ctx, atk, def, 'debilidad', fallo, { dificultad: dif });
    else if (estado === 'dolor') def.penDolorEstado += 40;
    else if (estado === 'dolorExtremo') def.penDolorEstado += 80;
    else if (estado === 'paralisisMenor' || estado === 'paralisisParcial') {
      imponer(def, 'paralisis', { nivel: estado === 'paralisisMenor' ? 1 : 2, asaltos: fallo });
    } else if (estado === 'paralisisCompleta' || estado === 'coma') motor.caer(ctx, atk, def, 'inconsciente');
    else if (estado === 'muerte') motor.caer(ctx, atk, def, 'muerto');
    motor.log(ctx, () => `  Además sufre ${estado}.`);
  }
  motor.verificarCaida(ctx, atk, def);
}

/**
 * Recuadro VIII (Core p.104): hasta dónde llega la Detección del Ki según la dificultad lograda.
 * Rutinario (contacto) y Fácil (menos de un metro) se toman como estar al lado (interpretación).
 * Inhumano pide Inhumanidad y Zen pide Zen.
 */
const RADIO_DETECCION: readonly [dificultad: number, metros: number][] = [
  [440, Infinity], [320, 1000], [280, 250], [240, 100], [180, 50], [140, 20], [120, 10], [80, 5], [20, 1.5],
];

export function radioDeteccion(resultado: number, topeMovimiento: number): number {
  for (const [dif, metros] of RADIO_DETECCION) {
    if (resultado < dif) continue;
    if (dif === 440 && topeMovimiento < 20) continue;
    if (dif === 320 && topeMovimiento < 13) continue;
    return metros;
  }
  return 0;
}

/**
 * Detección del Ki (Core p.103-104): una vez por asalto (decisión del usuario), quien la tiene y no ve a
 * algún rival tira su habilidad, la media entre su CM total y Advertir; localiza a quienes estén dentro
 * del radio logrado (`cegueraContra`). Sólo tira si le hace falta.
 */
export function detectarPresencias(motor: Motor, ctx: Contexto) {
  for (const l of ctx.luchadores) {
    l.radioDeteccionKi = 0;
    if (!activo(l) || !l.cap.est.deteccionKi) continue;
    const ciego = ctx.luchadores.some((x) => x.equipo !== l.equipo && activo(x) && cegueraContra(l, x).nivel >= 2);
    if (!ciego) continue;
    const base = baseDeteccionKi(l);
    const habilidad = base - penAccion(l);
    const t = motor.tirar(ctx, umbralPifia(base, l.cap.ajustePifia));
    l.radioDeteccionKi = t.pifia ? 0 : radioDeteccion(habilidad + t.valor, l.cap.est.topeMovimiento);
    const radio = l.radioDeteccionKi;
    motor.log(ctx, () => `${l.ficha.nombre} busca presencias con la Detección del Ki (${textoTirada(habilidad, t)}): ${radio ? `localiza hasta ${radio === Infinity ? 'cualquier distancia' : `${radio} m`}` : 'no localiza a nadie'}.`);
  }
}


// --------------------------------------------------------------------------- efectos de Asalto con estado

/**
 * Lo que dejan los efectos de Asalto activos, al ejecutar una técnica y al empezar cada asalto:
 * - Espejismo: aparecen sus ilusiones; cada rival que ve la energía, o que detecta el Ki y supera la
 *   Indetección, las descubre. Al terminar la técnica se desvanecen (Dominus p.65-66).
 * - Armas físicas de Ki: empuña su arma (aunque lo hayan desarmado) con la calidad de la técnica; al
 *   terminar, vuelve a como estaba (Dominus p.63).
 * - Intangibilidad con Afectar a otros: los aliados que elige (Dominus p.69).
 */
export function efectosDeAsalto(motor: Motor, ctx: Contexto, l: Luchador, recienEjecutada: boolean) {
  const ki = l.ki?.activo;
  // Los que hizo intangibles dejan de serlo cuando él ya no mantiene la técnica.
  if (!ki?.intangible) for (const x of ctx.luchadores) if (x.intangiblePor === l) x.intangiblePor = null;
  if (l.espejismos && !ki?.espejismos) {
    l.espejismos = null;
    motor.log(ctx, () => `  Las ilusiones de ${l.ficha.nombre} se desvanecen.`);
  } else if (ki?.espejismos && !l.espejismos && recienEjecutada) crearEspejismos(motor, ctx, l, ki);
  if (l.sinArmaKi && (!ki || ki.armaKi < 0)) {
    const { ficha, desarmado } = l.sinArmaKi;
    l.sinArmaKi = null;
    motor.cambiarFicha(l, ficha);
    l.desarmado = desarmado;
    motor.log(ctx, () => `  El arma de Ki de ${l.ficha.nombre} desaparece.`);
  } else if (ki && ki.armaKi >= 0 && !l.sinArmaKi && recienEjecutada) {
    const armada = fichaConArmaKi(l, ki.armaKi);
    if (armada) {
      l.sinArmaKi = { ficha: l.ficha, desarmado: l.desarmado };
      motor.cambiarFicha(l, armada);
      l.desarmado = false;
      motor.log(ctx, () => `  ${l.ficha.nombre} empuña un arma de Ki de calidad +${ki.armaKi}.`);
    }
  }
  if (recienEjecutada && ki?.intangibleOtros) {
    for (const a of ia.aliadosIntangibles(ctx, l, ki.intangibleOtros * presenciaBase(l.ficha))) {
      if (a.intangiblePor === l) continue;
      a.intangiblePor = l;
      motor.log(ctx, () => `  ${a.ficha.nombre} también se vuelve intangible.`);
    }
  }
}

function crearEspejismos(motor: Motor, ctx: Contexto, l: Luchador, ki: ModKi) {
  const descubren = new Set<Luchador>();
  for (const e of ctx.luchadores) {
    if (e.equipo === l.equipo || !activo(e)) continue;
    if (e.cap.est.veEnergia || e.ki?.activo.veEnergia) descubren.add(e);
    else if (e.cap.est.deteccionKi) {
      // Detección del Ki contra la Indetección; sin ella, quien detecta el Ki las descubre.
      const base = baseDeteccionKi(e);
      const t = motor.tirar(ctx, umbralPifia(base, e.cap.ajustePifia));
      if (!ki.espejismoIndeteccion || (!t.pifia && base - penAccion(e) + t.valor >= ki.espejismoIndeteccion)) descubren.add(e);
    }
  }
  l.espejismos = { n: ki.espejismos, indeteccion: ki.espejismoIndeteccion, fantasmal: ki.espejismoFantasmal, descubren };
  const vistos = [...descubren].map((x) => x.ficha.nombre).join(', ');
  motor.log(ctx, () => `  Aparecen ${ki.espejismos} ilusiones de ${l.ficha.nombre}${vistos ? ` (${vistos} las descubre${descubren.size > 1 ? 'n' : ''})` : ''}.`);
}

/**
 * Espejismo: quien no las descubrió no sabe cuál es el verdadero; el ataque va a uno al azar, y si es
 * una ilusión, la deshace. Devuelve si el ataque se lo llevó una ilusión.
 */
export function golpeAIlusion(motor: Motor, ctx: Contexto, atk: Luchador, def: Luchador): boolean {
  const e = def.espejismos;
  if (!e?.n || e.descubren.has(atk) || atk.cap.est.veEnergia || atk.ki?.activo.veEnergia) return false;
  if (ctx.rng.next() * (e.n + 1) < 1) return false;
  e.n--;
  motor.log(ctx, () => `${atk.ficha.nombre} ataca a una ilusión de ${def.ficha.nombre}, que se deshace (le quedan ${e.n}).`);
  return true;
}

/**
 * Las ilusiones atacan cada una a su blanco, con su habilidad (un ataque natural). Quien las descubrió
 * no se defiende de ellas. Si alcanzan, no hacen nada, salvo las fantasmales a quien falle la RP
 * (Dominus p.65-66).
 */
export function ataquesDeIlusiones(motor: Motor, ctx: Contexto, l: Luchador, blanco: Luchador | null) {
  const e = l.espejismos;
  if (!e?.n || !blanco || !activo(blanco) || !enAlcance(l, blanco) || e.descubren.has(blanco)) return;
  const ranura = proximaRanura(l);
  for (let i = 0; i < e.n && activo(blanco) && activo(l); i++) {
    const hab = ataqueFinal(l, blanco, { ranura });
    const t = motor.tirar(ctx, l.cap.umbralAtaque);
    if (t.pifia) continue;
    const golpe: Golpe = { maniobra: 'normal', esContra: false, ranura, ilusion: { fantasmal: e.fantasmal } };
    motor.resolverDefensa(ctx, l, blanco, hab, t, golpe, `Una ilusión de ${l.ficha.nombre} ataca a ${blanco.ficha.nombre}`);
  }
}

/**
 * Ejecuta una técnica en combate: paga y aplica sus efectos (ki.ts), la cuenta en las estadísticas y
 * deja lo que traen sus efectos de Asalto (Espejismo, Arma de Ki, Afectar a otros). Todo camino que
 * ejecuta una técnica pasa por acá; lo que hace al terminar la acción, `trasLaTecnica`.
 */
export function usarTecnica(motor: Motor, ctx: Contexto, l: Luchador, t: Tecnica): ModKi {
  const ki = ejecutar(l, t);
  l.stats.tecnicas[t.nombre] = (l.stats.tecnicas[t.nombre] ?? 0) + 1;
  efectosDeAsalto(motor, ctx, l, true);
  return ki;
}

/**
 * Lo que una técnica le hace al terminar la acción (Dominus p.74-75): Pérdida del arma (se destroza;
 * queda desarmado) y Técnica final (muere).
 */
export function trasLaTecnica(motor: Motor, ctx: Contexto, l: Luchador) {
  const p = l.ki?.pendiente;
  if (!p || (!p.arma && !p.final)) return;
  if (p.arma) {
    p.arma = false;
    motor.log(ctx, () => `  La energía destroza el arma de ${l.ficha.nombre}.`);
    motor.desarmar(ctx, l, l);
  }
  if (p.final) {
    p.final = false;
    if (l.estado === 'activo') motor.caer(ctx, l, l, 'muerto');
  }
}
