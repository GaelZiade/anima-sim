// Moverse en el combate: acercarse (con mapa o en línea), retirarse y huir (Core p.94), y el
// Transporte automático del Ki (Dominus p.59). Recibe el motor (MotorCombate).

import type { Contexto, Luchador } from './modelo';
import { textoTirada, valorTirada } from './dados';
import { umbralPifia } from './reglas';
import { ALCANCE, activo, ataqueFinal, distancia, enAlcance, metrosTotales, nro, penAccion, penAccionFisica, puedeActuar } from './calculos';
import { moverHacia } from './combate-ki';
import { cruzarMuros, transportar } from './efectos';
import { hacerOtraAccion } from './magia';
import { type Celda, type MapaListo, buscarCamino, campoHacia, caminoHasta, celdaDe, celdasAlcanzadas, indice } from './mapa';
import { conIncremento } from './ki';
import type { MotorCombate } from './combate';

/**
 * Retirarse del combate (Core p.94): acción activa. Cada enemigo trabado con ataques disponibles
 * tiene una Acción Respuesta contra él, con el modificador de flanco; si alguna le hace daño, no
 * puede irse este asalto. Si sorprendió a todos, se va sin que lo ataquen. Con Acrobacias puede
 * escapar sin recibir ataques si gana por más de 40 a la habilidad ofensiva de cada uno.
 */
export function retirarse(motor: MotorCombate, ctx: Contexto, l: Luchador) {
  const trabados = ctx.luchadores.filter((e) => e.equipo !== l.equipo && activo(e) && enAlcance(l, e));
  l.ataquesRestantes = 0;
  if (trabados.every((e) => l.sorprendeA.has(e))) return huir(motor, ctx, l);
  if (l.ficha.acrobacias !== undefined) {
    // Acrobacias es una acción física: sufre la columna correspondiente de la Tabla 43 (Core p.90).
    const base = conIncremento(l.ficha.acrobacias, l.ki?.activo.acrobacias ?? 0) - penAccion(l) - penAccionFisica(l);
    const t = motor.tirar(ctx, umbralPifia(l.ficha.acrobacias, l.cap.ajustePifia));
    const acrobacias = base + valorTirada(t);
    const supera = trabados.every((e) => acrobacias - (ataqueFinal(e, l, { esContra: true }) + valorTirada(motor.tirar(ctx, e.cap.umbralAtaque))) > 40);
    motor.log(ctx, () => `${l.ficha.nombre} intenta escapar con Acrobacias (${textoTirada(base, t)} = ${acrobacias})${supera ? ' y lo logra' : ''}.`);
    if (supera) return huir(motor, ctx, l);
  }
  motor.log(ctx, () => `${l.ficha.nombre} intenta retirarse.`);
  l.huyendo = true;
  let danado = false;
  for (const e of trabados) {
    if (!activo(l)) break;
    if (e.ataquesRestantes <= 0 || !puedeActuar(e)) continue;
    const antes = l.pv;
    motor.atacar(ctx, e, l, { esContra: true, bono: 0 });
    if (l.pv < antes) danado = true;
  }
  l.huyendo = false;
  if (!activo(l)) return;
  if (danado) motor.log(ctx, () => `  ${l.ficha.nombre} no logra retirarse.`);
  else huir(motor, ctx, l);
}

export function huir(motor: MotorCombate, ctx: Contexto, l: Luchador) {
  l.estado = 'huido';
  motor.soltar(l);
  if (l.apresando) motor.soltar(l.apresando);
  motor.liberarAmenazados(ctx, l);
  for (const x of ctx.luchadores) x.trabados = x.trabados.filter((e) => e !== l);
  motor.log(ctx, () => `${l.ficha.nombre} huye del combate.`);
}

export function mover(motor: MotorCombate, ctx: Contexto, l: Luchador, obj: Luchador) {
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
  cruzarMuros(motor, ctx, l, desde);
  l.metrosMovidos += paso;
  if (obj.equipo !== l.equipo) l.avanzoHaciaEnemigo = true;
  ctx.movimientosEnAsalto++;
  const yaActivo = l.movioActivo;
  if (l.metrosMovidos > total / 4 && !yaActivo) {
    l.movioActivo = true;
    hacerOtraAccion(l);
    // En carga, correr no penaliza el ataque (Core p.90).
    if (!l.cargando) l.accionesActivas++;
  }
  const nota = l.movioActivo && !yaActivo ? (l.cargando ? ' (a la carga)' : ' (acción activa, −25)') : '';
  motor.log(ctx, () => `${l.ficha.nombre} avanza ${paso.toFixed(1)} m${nota}.`, () => ({ camino: { quien: nro(ctx, l), celdas } }));
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
    for (const i of celdasAlcanzadas(m)) {
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
export function moverEnLinea(l: Luchador, obj: Luchador, disponible: number): number {
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

/** Transporte automático: Muy Difícil advertirlo, las dos primeras veces contra cada rival (Dominus p.59). */
const ADVERTIR_TRANSPORTE = { dificultad: 140, veces: 2 } as const;

/** Llega al instante junto al blanco, sin gastar movimiento (Transporte automático, Proyección). */
export function llegarJunto(motor: MotorCombate, ctx: Contexto, atk: Luchador, def: Luchador, como: string) {
  // Un transporte lo libra de una presa, salvo de una existencial (Dominus p.64).
  if (atk.apresadoPor && !atk.presaExistencial) motor.soltar(atk);
  if (atk.apresadoPor) return;
  if (atk.apresando) motor.soltar(atk.apresando);
  const metros = distancia(atk, def);
  const desde = { ...atk.pos };
  moverHacia(motor, ctx, atk, def, Infinity);
  motor.log(ctx, () => `${atk.ficha.nombre} ${como} ${metros.toFixed(0)} m hasta ${def.ficha.nombre}.`, () => ({ camino: { quien: nro(ctx, atk), celdas: [desde, { ...atk.pos }] } }));
}

/** Aparece junto al blanco (Transporte automático); sus primeras veces, quizá lo sorprende (Dominus p.59). */
export function aparecerJunto(motor: MotorCombate, ctx: Contexto, atk: Luchador, def: Luchador) {
  llegarJunto(motor, ctx, atk, def, 'se transporta');
  const vistas = atk.transportesVistos.get(def) ?? 0;
  if (vistas >= ADVERTIR_TRANSPORTE.veces) return;
  atk.transportesVistos.set(def, vistas + 1);
  motor.advertir(ctx, atk, def, ADVERTIR_TRANSPORTE.dificultad, 'el transporte');
}

/**
 * Retirada con un Transporte automático tras una defensa con éxito (Dominus p.59): los demás trabados
 * con él que aún pueden atacar tiran un ataque natural cada uno contra su defensa plena; si alguno le
 * hace daño, no se va (como al retirarse, Core p.94). Devuelve si se fue.
 */
export function retirarseConTransporte(motor: MotorCombate, ctx: Contexto, l: Luchador, atk: Luchador, metros: number): boolean {
  const antes = l.pv;
  l.defensaPlena = true;
  for (const e of ctx.luchadores) {
    if (e === atk || e.equipo === l.equipo || !activo(e) || !activo(l) || !enAlcance(e, l) || e.aLaDefensiva || e.ataquesRestantes <= 0 || !puedeActuar(e)) continue;
    motor.log(ctx, () => `  ${e.ficha.nombre} intenta impedir que ${l.ficha.nombre} se retire.`);
    motor.atacar(ctx, e, l, { esContra: false, bono: 0, natural: true });
  }
  l.defensaPlena = false;
  const sale = activo(l) && l.pv >= antes;
  if (activo(l) && !sale) motor.log(ctx, () => `  ${l.ficha.nombre} no logra retirarse.`);
  if (sale) transportar(motor, ctx, l, metros);
  return sale;
}
