// Armas a distancia en el motor (Core p.94-97): disparar, recargar, apuntar, disparos paralelos,
// atrapar proyectiles, armas de fuego que fallan y el disparo a bocajarro del Ataque combinado.
// Recibe el motor (MotorCombate), como combate-magia.ts y combate-ki.ts.

import type { Contexto, Luchador } from './modelo';
import { textoTirada, valorTirada } from './dados';
import type { Ranura } from './rasgos';
import { umbralPifia } from './reglas';
import { activo, ataqueFinal, enAlcance, nro, penAccion, perfilDe, puedeActuar } from './calculos';
import type { Golpe } from './golpe';
import * as ia from './ia';
import { PEN_ATRAPAR_ADICIONAL, completarArma, dificultadAtrapar, formasDeDisparar, umbralEstallido } from './proyectiles';
import type { MotorCombate } from './combate';

/**
 * Disparar, recargar o apuntar con un arma a distancia: ocupa todo el turno (Core p.94-96). Los
 * disparos van al objetivo y, si cae, al siguiente que mejor rinda (con −10 por cambiar de blanco).
 */
export function accionADistancia(motor: MotorCombate, ctx: Contexto, l: Luchador, d0: ia.AccionDistancia) {
  // El motor sólo acepta las formas de disparar que permite la regla (recarga y cadencia, Core p.97).
  const formas = d0.tipo === 'disparar' ? formasDeDisparar(l, d0.arma) : [];
  const d = d0.tipo === 'disparar' && formas.length && !formas.some((f) => f.disparos === d0.disparos && f.pen === d0.pen) ? { ...d0, ...formas[0] } : d0;
  const arma = l.ficha.armasDistancia![d.arma];
  const st = l.proyectiles[d.arma];
  l.disparo = true;
  if (d.tipo === 'recargar') {
    st.recargaFalta--;
    // Una recámara vacía se recarga entera (ballesta de repetición).
    const recamara = completarArma(arma).recamara;
    if (!st.recargaFalta && recamara) st.enRecamara = Math.min(recamara, st.municion);
    motor.log(ctx, () => `${l.ficha.nombre} recarga ${arma.nombre}${st.recargaFalta ? ` (le falta${st.recargaFalta > 1 ? 'n' : ''} ${st.recargaFalta} asalto${st.recargaFalta > 1 ? 's' : ''})` : ''}.`);
  } else if (d.tipo === 'apuntar') {
    const sigue = l.apuntando?.blanco === d.objetivo && l.apuntando.arma === d.arma;
    l.apuntando = { blanco: d.objetivo, arma: d.arma, asaltos: sigue ? Math.min(3, l.apuntando!.asaltos + 1) : 1 };
    motor.log(ctx, () => `${l.ficha.nombre} apunta con ${arma.nombre} a ${d.objetivo.ficha.nombre} (+${10 * l.apuntando!.asaltos}).`);
  } else {
    // Antes de disparar se aleja de quien lo alcanzaría el asalto que viene (hasta un cuarto de su
    // movimiento, sin penalizador), si desde ahí sigue viendo y alcanzando a su blanco.
    const atras = ia.retroceso(ctx, l, d.objetivo, d.arma);
    if (atras) {
      const desde = { ...l.pos };
      l.pos = atras.celda;
      l.metrosMovidos += atras.metros;
      ctx.movimientosEnAsalto++;
      motor.log(ctx, () => `${l.ficha.nombre} retrocede ${atras.metros.toFixed(1)} m.`, () => ({ camino: { quien: nro(ctx, l), celdas: [desde, { ...l.pos }] } }));
    }
    if (d.disparos > 1) motor.log(ctx, () => `${l.ficha.nombre} ${arma.clase === 'disparo' ? 'dispara' : 'lanza'} ${d.disparos} veces con ${arma.nombre} (−${d.pen} a cada uno).`);
    let blanco: Luchador | null = d.objetivo;
    for (let k = 0; k < d.disparos && blanco; k++) {
      if (!ia.armaUsable(l, d.arma)) break;
      motor.atacar(ctx, l, blanco, { esContra: false, bono: 0, proyectil: { arma: d.arma, pen: d.pen } });
      if (!puedeActuar(l) || motor.terminado(ctx)) break;
      if (!activo(blanco)) blanco = ia.siguienteBlanco(ctx, l, d.arma, d.pen);
    }
    st.recargaFalta = recargaTrasDisparar(l, d.arma, d.recargaFalta);
  }
  l.ataquesRestantes = 0;
}

/** Recarga pendiente después de disparar: con recámara, sólo cuando se vacía (y es la recarga entera). */
export function recargaTrasDisparar(l: Luchador, i: number, segunRecarga: number): number {
  const a = completarArma(l.ficha.armasDistancia![i]);
  if (!a.recamara) return segunRecarga;
  return l.proyectiles[i].enRecamara <= 0 && l.proyectiles[i].municion > 0 ? a.recarga : 0;
}

export function disparoParalelo(motor: MotorCombate, ctx: Contexto, l: Luchador, atk: Luchador) {
  if (l.haActuado || l === ctx.turnoDe || !puedeActuar(l) || l.ataquesRestantes <= 0 || !activo(atk)) return;
  if (Math.abs(l.iniciativa - atk.iniciativa) >= 25) return;
  const d = ia.accionADistancia(ctx, l);
  if (d?.tipo !== 'disparar') return;
  motor.log(ctx, () => `  ${l.ficha.nombre} dispara a la vez (disparos paralelos).`);
  accionADistancia(motor, ctx, l, d);
  l.haActuado = true;
}

/**
 * Trucos de manos contra un proyectil (Core p.94): contra la dificultad del proyectil, o enfrentado
 * con el ataque final si es sobrenatural (una técnica de Ki a distancia). −25 por cada control de
 * más en el asalto. Devuelve si lo atrapó.
 */
export function atrapar(motor: MotorCombate, ctx: Contexto, l: Luchador, atk: Luchador, ataqueTotal: number, o: Golpe): boolean {
  const dif = dificultadAtrapar(o.ranura.proyectil);
  const base = (l.ficha.trucosDeManos ?? 0) - penAccion(l) - PEN_ATRAPAR_ADICIONAL * l.atrapadas;
  l.atrapadas++;
  const t = motor.tirar(ctx, umbralPifia(l.ficha.trucosDeManos ?? 0, l.cap.ajustePifia));
  const total = base + valorTirada(t);
  const contra = dif ?? ataqueTotal;
  const logra = !t.pifia && (dif === null ? total > contra : total >= contra);
  motor.log(ctx, () => `  ${l.ficha.nombre} intenta atrapar el ${dif === null ? 'ataque' : 'proyectil'} de ${atk.ficha.nombre} (Trucos de manos ${textoTirada(base, t)} contra ${contra}): ${logra ? '¡lo atrapa!' : 'no lo logra'}.`);
  return logra;
}

/**
 * Pifia con un arma de fuego (Core p.80-81): por debajo del umbral (80, el cañón 70; +15 por cada +5 de calidad)
 * se encasquilla; por encima, estalla. En los dos casos no la puede usar más en el combate.
 */
export function armaDeFuegoFalla(motor: MotorCombate, ctx: Contexto, l: Luchador, i: number, nivel: number) {
  const arma = l.ficha.armasDistancia![i];
  const estalla = nivel >= umbralEstallido(arma.calidad, arma.nombre);
  l.proyectiles[i].inutil = estalla ? 'rota' : 'encasquillada';
  motor.log(ctx, () => `  ¡${estalla ? 'Estalla' : 'Se encasquilla'} ${arma.nombre} de ${l.ficha.nombre}!`);
}

/** Bocajarro: +30 al disparo (Tabla 47). */
const BONO_BOCAJARRO = 30;

const RANURA_BALA: Ranura = { pen: 0, sinArmas: false, bala: true };

/**
 * Segundo ataque del Ataque combinado (Leo, Dominus p.101): el disparo a bocajarro, con +30 y sin más
 * penalizador que el −20 de la maniobra. A bocajarro el defensor no sufre los penalizadores contra
 * disparos: se defiende como de un golpe cuerpo a cuerpo (Core p.96). No consume otro ataque.
 */
export function disparoCombinado(motor: MotorCombate, ctx: Contexto, atk: Luchador, def: Luchador) {
  atk.balas--;
  const opciones = { declarados: 1, ranura: RANURA_BALA, bono: BONO_BOCAJARRO, maniobra: 'combinado' as const, esContra: false };
  const hab = ataqueFinal(atk, def, opciones);
  const tA = motor.tirar(ctx, atk.cap.umbralAtaque);
  const etiqueta = `${atk.ficha.nombre} dispara a bocajarro a ${def.ficha.nombre}`;
  if (tA.pifia) {
    atk.aLaDefensiva = true;
    motor.log(ctx, () => `${etiqueta}: ¡pifia! (sacó ${tA.natural}, nivel ${tA.nivelPifia}).`,
      () => ({ ataque: { de: nro(ctx, atk), a: nro(ctx, def), contra: false, resultado: null } }));
    motor.avisarPifia(ctx, atk);
    if (enAlcance(atk, def)) motor.ofrecerContra(ctx, def, atk, tA.nivelPifia);
    return;
  }
  const r = motor.resolverDefensa(ctx, atk, def, hab, tA, { maniobra: 'normal', esContra: false, ranura: RANURA_BALA, tipo: perfilDe(atk, RANURA_BALA).tipoAtaque }, etiqueta);
  if (r.contra !== null) motor.ofrecerContra(ctx, r.defensor, atk, r.contra);
}
