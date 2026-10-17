// IA del Ki (Dominus cap. 5, Core p.102-107): qué técnica usar al defenderse, antes de la
// iniciativa o al reaccionar (contra con transporte, choque, reflejo…), cuánto cuesta cada técnica con
// sus desventajas, qué acumular y qué mantener. Las técnicas de ataque se eligen en `ia.ts`
// (`elegirManiobra`), que usa de acá el costo y lo que valen los efectos.

import { CARACTERISTICAS_KI, type Contexto, type Luchador, type Tecnica } from './modelo';
import {
  activo, enLaLinea, frialdadDe, rfDe, ALCANCE, visionEntre, PEN_COBERTURA, ataqueFinal, defensaFinal, distancia, enAlcance, metrosTotales,
  danoBase, danoCon, danoEsperado, modControl, penAccion, pronostico, puedeActuar, turnoFinal, type Pronostico,
  posicionDe, cegueraContra } from './calculos';
import { fallaResistencia, tabla } from './probabilidades';
import { MOD_SORPRESA_DEFENSA, PEN_ACCION_ACTIVA, type TipoAtaque } from './reglas';
import { capacidades } from './rasgos';
import { MEDIA_TIRADA, sinDado } from './dados';
import type { ParadaArea } from './golpe';
import { fichaConArmaKi } from './rotura';
import { rpDe } from './magia';
import { nivelCeguera } from './condiciones';
import { ESTADOS_DE_ANIMO } from './efectos/estados';
import {
  asaltosParaJuntar, combinar, costeKi, curable, efectosDe, presenciaBase, fichaConAumento, habilidadesKi, modDeAccion, sensibleAlAura, radioAura, puedeEjecutar, puedePonerEnEspera, SIN_KI, tecnicasPara,
  enUso, repertorio, vistaPrevia, cumpleCircunstancias, defensaSirve, type DecisionKi, type EstadoSobrenatural, type ModKi } from './ki';
import {
  atributo, pGanaControl, type Maniobra } from './maniobras';
import { type PlanAtaque, alcanzable, amenaza, base, conCambio, enemigos, golpeDe, golpeDeContra, intercambio, lambda, mejorAtaque, mejorManiobra, necesitaMovimientoActivo, nuevaDecision, pIniciativa, perfil, pierdeElAsalto, puedeContraatacar, riesgoContra, trabadoConAlguien, valorAtaque, valorDejarFuera, valorGolpe, valorNegativo } from './ia';
import { cacheDeDecision } from './cache-decision';

/**
 * Lo que vale un punto de Ki, en PV: gastar toda la reserva tiene que rendir al menos la mitad de
 * sus PV. Sube a medida que se vacía la reserva.
 */
export function precioKi(l: Luchador): number {
  const inicial = Math.max(1, l.ficha.ki?.reserva ?? 1);
  const queda = Math.max(1, l.ki?.reserva ?? 0);
  return ((0.5 * l.ficha.pv) / inicial) * Math.sqrt(inicial / queda);
}

/** Acumular es pasivo y no cuesta nada: se acumula mientras quede reserva y tenga técnicas. */
export function acumulaKi(l: Luchador): boolean {
  return !!l.ki && l.ki.reserva > 0 && !!l.ficha.ki?.tecnicas.length;
}

/**
 * Absorción de energía (Dominus p.20): cuánto Ki pone para no perder PV con un daño plenamente
 * energético, a 1 de Ki cada 5 de daño. Es voluntaria: lo hace mientras un punto de Ki le valga menos
 * que los 5 PV que ahorra.
 */
export function kiParaAbsorber(l: Luchador, dano: number): number {
  if (!l.ki || !habilidadesKi(l.ficha).absorcion || perfil(l) === 'bestia') return 0;
  if (precioKi(l) >= 5) return 0;
  return Math.min(l.ki.reserva, Math.ceil(dano / 5));
}

/** Asaltos que se supone que dura lo que se activa al empezar (para comparar con lo que cuesta). */
const ASALTOS_PREVISTOS = 4;

/**
 * Aumento de características: prueba subir cada una hasta el máximo con la ficha cambiada y mide lo
 * que gana por asalto (lo que pega de más al rival principal y lo que deja de recibir de cada uno que
 * puede atacarlo). Conviene si en los asaltos previstos supera el Ki de activarlo y mantenerlo.
 */
function elegirAumento(ctx: Contexto, l: Luchador): DecisionKi['aumentar'] {
  const h = habilidadesKi(l.ficha);
  const rival = rivalPrincipal(ctx, l);
  if (!rival) return undefined;
  const medir = () => {
    nuevaDecision(ctx);
    let v = golpeDe(l, rival) * Math.max(1, l.cap.maxAtaques);
    for (const e of enemigos(ctx, l)) if (alcanzable(e, l)) v -= lambda(l) * amenaza(e, l);
    return v;
  };
  const antes = medir();
  const original = { ficha: l.ficha, cap: l.cap };
  let mejor: DecisionKi['aumentar'];
  let mejorNeto = 0;
  for (const a of ['DES', 'AGI', 'FUE', 'CON'] as const) {
    const desde = l.ficha.atributos?.[a] ?? 5;
    const hasta = desde + h.aumento;
    const mantener = Math.ceil(ASALTOS_PREVISTOS / h.asaltosPorPagoAumento);
    if (l.ki!.reserva < hasta + mantener) continue;
    const ganancia = conCambio(() => {
      l.ficha = fichaConAumento(original.ficha, a, desde, hasta);
      l.cap = capacidades(l.ficha);
      return () => {
        l.ficha = original.ficha;
        l.cap = original.cap;
      };
    }, medir) - antes;
    const neto = ganancia * ASALTOS_PREVISTOS - precioKi(l) * (hasta + mantener);
    if (neto > mejorNeto) {
      mejorNeto = neto;
      mejor = { atributo: a, hasta };
    }
  }
  nuevaDecision(ctx);
  return mejor;
}

/**
 * Curación por Ki en su turno, en lugar de un ataque: a sí mismo o al aliado en contacto que más la
 * necesite. Los PV curados valen lo mismo que el daño recibido (λ), y conviene si eso menos el Ki
 * supera su mejor ataque. Sólo con 30% o más de los PV perdidos.
 */
export function curacionKi(ctx: Contexto, l: Luchador): { quien: Luchador; ki: number } | null {
  const rate = habilidadesKi(l.ficha).curacion;
  if (!rate || !l.ki || l.ki.reserva <= 0 || perfil(l) === 'bestia') return null;
  nuevaDecision(ctx);
  let mejor: { quien: Luchador; ki: number; valor: number } | null = null;
  for (const x of ctx.luchadores) {
    if (x.equipo !== l.equipo || !activo(x) || (x !== l && !enAlcance(l, x)) || x.pv > 0.7 * x.ficha.pv) continue;
    const pv = Math.min(curable(x), l.ki.reserva * rate);
    if (pv <= 0) continue;
    const ki = Math.ceil(pv / rate);
    const valor = lambda(l) * pv - precioKi(l) * ki;
    if (!mejor || valor > mejor.valor) mejor = { quien: x, ki, valor };
  }
  if (!mejor || mejor.valor <= 0) return null;
  return mejor.valor > mejorAtaque(ctx, l) ? { quien: mejor.quien, ki: mejor.ki } : null;
}

/** Algún enemigo puede atacarlo con crítico de energía: vale la pena encender la Armadura mayor. */
function hayAtaquesDeEnergia(ctx: Contexto, l: Luchador): boolean {
  return enemigos(ctx, l).some((e) =>
    e.ficha.tipoAtaque === 'ENE' || e.ficha.arma?.critSecundario === 'ENE' || e.ficha.sinArmas?.tipoAtaque === 'ENE');
}

/**
 * Recuperación (Core p.105): 5 de Ki por un punto de cansancio. Sin técnicas, el Ki no tiene otro
 * uso; con técnicas, sólo si le sobra el doble de la más cara.
 */
function convieneRecuperar(l: Luchador): boolean {
  const e = l.ki!;
  if (!habilidadesKi(l.ficha).recuperacion || e.reserva < 5) return false;
  if (l.cansancio >= (l.ficha.cansancio ?? l.ficha.constitucion)) return false;
  const tecnicas = l.ficha.ki?.tecnicas ?? [];
  return !tecnicas.length || e.reserva - 5 >= 2 * Math.max(...tecnicas.map(costeKi));
}

/**
 * Guardar Ki para una técnica de ataque mejor que todavía no alcanza: ejecutar ahora devuelve lo
 * sobrante a la reserva y empieza de cero. Conviene esperar si lo que gana con la otra, descontado
 * por los asaltos que faltan, supera lo que gana ahora en todos esos asaltos.
 */
export function convieneGuardar(ctx: Contexto, l: Luchador, rival: Luchador, elegida: Tecnica, ganancia: number): boolean {
  for (const t of repertorio(l.ficha)) {
    if (t === elegida || efectosDe(t).clase !== 'ataque' || enUso(l.ki!, t)) continue;
    const faltan = asaltosParaJuntar(l, t, penAccion(l));
    if (faltan < 1 || faltan > 3) continue;
    const otra = netoTecnica(ctx, l, rival, t);
    if (otra * Math.pow(0.8, faltan) > ganancia * (1 + faltan)) return true;
  }
  return false;
}

/**
 * Blancos de un ataque en área de Ki: todos los que estén en el radio alrededor del blanco. Sin
 * Elección de blanco no puede excluir a nadie, aliados incluidos (Dominus p.58).
 */
export function blancosAreaKi(ctx: Contexto, atk: Luchador, def: Luchador, ki: ModKi): Luchador[] {
  const otros = ctx.luchadores.filter(
    (x) => x !== atk && x !== def && activo(x) && distancia(x, def) <= ki.area && (!ki.eleccionBlanco || x.equipo !== atk.equipo),
  );
  return [def, ...otros];
}

/**
 * Lo que suma un área de Ki por los demás blancos del radio. Los aliados restan lo que pierden, con
 * el mismo peso (λ) que el daño propio; de lejos se defienden como de un proyectil.
 */
export function valorAreaKi(
  ctx: Contexto, atk: Luchador, def: Luchador, ki: ModKi, bono: number, maniobra: Maniobra, tipo?: TipoAtaque,
  proyectil?: 'disparo' | 'lanzamiento',
): number {
  let v = 0;
  for (const b of blancosAreaKi(ctx, atk, def, ki)) {
    if (b === def) continue;
    // La maniobra (y su penalizador) es la misma para todos los del área.
    const hab = ki.ataqueFijo || ataqueFinal(atk, b, { bono, tipo, ki, maniobra });
    const p = pronostico(atk, b, hab, defensaFinal(b, atk, { kiAtk: ki, centroArea: def.pos, proyectil }), { tipo, ki, maniobra });
    if (b.equipo === atk.equipo) {
      v -= lambda(atk) * (p.dano + p.pBaja * amenaza(atk, b));
      continue;
    }
    let vb = valorGolpe(atk, b, p, 0);
    if (pierdeElAsalto(b)) vb += p.pImpacto * amenaza(b, atk);
    vb -= riesgoContra(atk, b, p);
    v += vb;
  }
  return v;
}

/** Lo que vale para `atk`, en PV, que `def` sufra este Estado sobrenatural (Dominus p.67) si falla la RF. */
function valorEstado(atk: Luchador, def: Luchador, est: EstadoSobrenatural, golpes: number): number {
  // Miedo, Terror y Fascinación afectan el ánimo: suma la Frialdad (Core p.54), como en el motor.
  const animo = ESTADOS_DE_ANIMO.has(est.estado);
  const { p, fracaso: medio } = fallaResistencia(rfDe(def) + (animo ? frialdadDe(def) : 0), est.rf);
  if (!p) return 0;
  const pv = Math.max(0, def.pv);
  const fuera = valorDejarFuera(atk, def);
  switch (est.estado) {
    case 'dano': return p * Math.min(medio, pv);
    case 'dobleDano': return p * Math.min(2 * medio, pv);
    case 'drenajeVida': return p * (Math.min(medio, pv) + lambda(atk) * Math.min(medio, atk.ficha.pv - atk.pv));
    case 'drenajeKi': return p * Math.min(medio, def.ki?.reserva ?? 0) * (def.ki ? precioKi(def) + precioKi(atk) : 0);
    case 'dolor': return def.ficha.estados?.dolor ? 0 : p * valorNegativo(atk, def, 40, golpes, 0) * 2;
    case 'dolorExtremo': return def.ficha.estados?.dolor === 'extremo' ? 0 : p * valorNegativo(atk, def, 80, golpes, 0) * 2;
    case 'miedo': return def.ficha.estados?.miedo ? 0 : p * valorNegativo(atk, def, 60, golpes, 0) * 2;
    case 'ceguera': return nivelCeguera(def) >= 2 ? 0 : p * valorNegativo(atk, def, 90, golpes, 0) * 2;
    case 'penalizacionMenor': return p * valorNegativo(atk, def, medio, golpes, 0);
    case 'penalizacionMayor': return p * valorNegativo(atk, def, medio, golpes, 0) * 2;
    case 'paralisisParcial': return p * valorNegativo(atk, def, 80, golpes, 0) * Math.min(2, medio / 2);
    case 'fascinacion': return p * amenaza(def, atk);
    case 'reduccionRf': return p * medio * 0.1;
    case 'reduccionCaracteristica': return p * Math.floor(medio / 10) * 0.1 * amenaza(def, atk);
    case 'reduccionCaracteristicas': return p * Math.floor(medio / 10) * 0.3 * amenaza(def, atk);
    // −1 a las cuatro físicas cada 10: cerca de −5 a lo que hace con cada una, todo el combate.
    case 'debilidad': return p * valorNegativo(atk, def, 5 * Math.floor(medio / 10), golpes, 0) * 2;
    case 'ilusion': return 0;
    // Lo sacan de la pelea.
    case 'paralisisTotal': case 'inconsciencia': case 'coma': case 'muerte': case 'control': case 'terror':
      return p * fuera;
    // Sin `default`: un estado nuevo no compila hasta que se diga cuánto vale.
  }
}

/**
 * Efectos sobrenaturales de un golpe con técnica, en PV (Dominus cap. 5): Estados si daña (o si toca,
 * con Contacto físico), Impacto si supera la defensa, Marca para los golpes que sigan, Interrupción
 * del Ki que tenga concentrado.
 */
export function valorEfectosKi(
  atk: Luchador, def: Luchador, ki: ModKi, p: Pronostico, golpes: number, pDana: number, pContacto: number, danoPleno: number,
): number {
  let v = 0;
  for (const est of ki.estados) {
    if (est.condicion === 'automatico') continue;
    v += (est.condicion === 'contacto' ? pContacto : pDana) * valorEstado(atk, def, est, golpes);
  }
  if (ki.impacto) {
    // Lanzado lejos pierde lo que le queda del asalto; atraído, queda a su alcance.
    const pGana = pGanaControl(ki.impacto, atributo(def, 'FUE') + modControl(def));
    v += p.pImpacto * pGana * (ki.atraer ? 0.2 * amenaza(def, atk) : amenaza(def, atk));
  }
  // Una marca mayor reemplaza a la que tenía (Dominus p.70).
  const marcaPrevia = def.marcas.get(atk) ?? 0;
  if (ki.marca > marcaPrevia) {
    const b = base(atk, def);
    v += pDana * Math.max(1, golpes) * (danoCon(b.prep, b.hab + ki.marca - b.def) - danoCon(b.prep, b.hab + marcaPrevia - b.def));
  }
  if (ki.interrumpe && def.ki) {
    let concentrado = 0;
    for (const c of CARACTERISTICAS_KI) concentrado += def.ki.acumulado[c] ?? 0;
    for (const t of def.ki.enEspera.keys()) concentrado += costeKi(t);
    for (const t of def.ki.mantenidas.keys()) concentrado += costeKi(t);
    // Contra la acumulación, la dificultad entre 5 (Dominus p.69).
    const dif = danoPleno + ki.interrupcion;
    v += pDana * fallaResistencia(rfDe(def), def.ficha.acumulacion ? Math.floor(dif / 5) : dif).p * concentrado * precioKi(def);
  }
  return v;
}

/**
 * Lo que cuestan sus desventajas al ejecutarla (Dominus p.71-74): Exceso de energía otra vez su Ki,
 * Agotamiento unos 5 PV por punto de cansancio y el Penalizador a toda Acción lo que le hace perder
 * contra su rival principal.
 */
function costoDesventajas(l: Luchador, rival: Luchador | null, t: Tecnica): number {
  const d = efectosDe(t).desventajas;
  let c = 0;
  if (d.exceso) c += precioKi(l) * costeKi(t);
  if (d.agotamiento) c += 5 * d.agotamiento;
  if (d.penalizador && rival) c += valorNegativo(rival, l, d.penalizador, 0, 0) * Math.max(1, d.penalizador / 20);
  // Sacrificio: los PV, como daño recibido; Completo, todos (Dominus p.75).
  if (d.sacrificioPv) c += lambda(l) * (d.sacrificioPv === Infinity ? Math.max(0, l.pv) : d.sacrificioPv);
  // Lo que pierde: un punto de característica, el arma, la vida, defenderse este asalto, las demás
  // técnicas mientras dura la Sobrecarga.
  if (rival) {
    if (d.sacrificioAtributo) c += 0.1 * amenaza(l, rival);
    if (d.perdidaArma && !l.cap.desarmado) c += amenaza(l, rival);
    if (d.final) c += valorDejarFuera(rival, l);
    if (d.sinDefensa) c += lambda(l) * amenaza(rival, l);
    if (d.sobrecarga) c += d.sobrecarga * precioKi(l) * costeKi(t) / 2;
  }
  return c;
}

/** Lo que cuesta ejecutar `t`: su Ki y sus desventajas. */
export function costoTecnica(l: Luchador, rival: Luchador | null, t: Tecnica): number {
  return precioKi(l) * costeKi(t) + costoDesventajas(l, rival, t);
}

/** Un ataque especializado contra otra defensa no tiene ningún efecto (Dominus p.72). */
export function sirveContra(ki: ModKi, def: Luchador): boolean {
  return !ki.soloContra || (def.ficha.acumulacion ? 'acumulacion' : def.ficha.tipoDefensa ?? 'parada') === ki.soloContra;
}

/** Circunstancia de combate: fuera de ella la técnica no hace nada (Dominus p.72). */
export function enCircunstancia(t: Tecnica, atk: Luchador, def: Luchador): boolean {
  const cs = efectosDe(t).desventajas.circunstanciasCombate;
  return !cs.length || cumpleCircunstancias(cs, atk, def, posicionDe(atk, def) === 'espalda', cegueraContra(def, atk).nivel > 0);
}

/** Su ataque común contra `e` sin técnica: la referencia con que se compara cada técnica en la decisión. */
const sinTecnicaMemo = cacheDeDecision<Luchador, Map<Luchador, { plan: PlanAtaque; valor: number }>>();

export function sinTecnica(ctx: Contexto, l: Luchador, e: Luchador): { plan: PlanAtaque; valor: number } {
  let m = sinTecnicaMemo.get(l);
  if (!m) sinTecnicaMemo.set(l, (m = new Map()));
  let r = m.get(e);
  if (!r) m.set(e, (r = mejorManiobra(ctx, l, e, false, 0, modDeAccion(l, 'ataque', false), false)));
  return r;
}

function valorSinTecnica(ctx: Contexto, l: Luchador, e: Luchador): number {
  return sinTecnica(ctx, l, e).valor;
}

/** Lo que gana un ataque común contra `e` con la técnica `t` frente a uno sin técnica, neto de su costo. */
function netoTecnica(ctx: Contexto, l: Luchador, e: Luchador, t: Tecnica): number {
  const ki = vistaPrevia(l, t);
  if (!sirveContra(ki, e)) return -Infinity;
  return mejorManiobra(ctx, l, e, false, 0, ki, false).valor - valorSinTecnica(ctx, l, e) - costoTecnica(l, e, t);
}

/**
 * Lo que agrega su mejor técnica de Ki a un golpe contra `e`, descontado el Ki (0 sin técnicas): con
 * un arma a distancia no se ejecutan, así que dejar de pegar también es dejar de usarlas.
 */
export function gananciaTecnica(ctx: Contexto, l: Luchador, e: Luchador): number {
  if (!l.ki) return 0;
  const tecnicas = tecnicasPara(l, 'ataque');
  if (!tecnicas.length) return 0;
  let mejor = 0;
  for (const t of tecnicas) mejor = Math.max(mejor, netoTecnica(ctx, l, e, t));
  return mejor;
}

/** Contraataque con una técnica de Ki a distancia (o una activa) que alcance y vea a quien lo atacó. */
export function contraKiADistancia(ctx: Contexto, l: Luchador, atk: Luchador): { tecnica: Tecnica | null } | null {
  if (!l.ki || perfil(l) === 'bestia') return null;
  const d = distancia(l, atk);
  const activo0 = modDeAccion(l, 'ataque', false);
  const opciones: [Tecnica | null, ModKi][] = [];
  if (activo0 && activo0.distancia >= d) opciones.push([null, activo0]);
  for (const t of tecnicasPara(l, 'ataque', true)) {
    const k = vistaPrevia(l, t);
    if (k.distancia >= d) opciones.push([t, k]);
  }
  if (!opciones.length) return null;
  const vision = visionEntre(ctx.luchadores, l, atk);
  if (vision === 'bloqueada') return null;
  nuevaDecision(ctx);
  const bono = vision === 'cobertura' ? -PEN_COBERTURA : 0;
  let mejor: { tecnica: Tecnica | null; valor: number } | null = null;
  for (const [t, k] of opciones) {
    const v = mejorManiobra(ctx, l, atk, true, bono, k, false, true).valor - (t ? costoTecnica(l, atk, t) : 0);
    if (v > 0 && (!mejor || v > mejor.valor)) mejor = { tecnica: t, valor: v };
  }
  return mejor ? { tecnica: mejor.tecnica } : null;
}

/**
 * Contraataque con un Transporte automático (Dominus p.59): aparece junto a quien lo atacó de lejos
 * y conserva el bono. La técnica que más rinde, si rinde algo.
 */
export function contraConTransporte(ctx: Contexto, l: Luchador, atk: Luchador, bono: number): Tecnica | null {
  if (!l.ki || perfil(l) === 'bestia' || l.presaExistencial) return null;
  const d = distancia(l, atk);
  const candidatas = tecnicasPara(l, 'ataque', true).filter((t) => efectosDe(t).accion.transporte + ALCANCE + 1e-6 >= d);
  if (!candidatas.length || visionEntre(ctx.luchadores, l, atk) === 'bloqueada') return null;
  nuevaDecision(ctx);
  let mejor: Tecnica | null = null;
  let mejorValor = 0;
  for (const t of candidatas) {
    const v = mejorManiobra(ctx, l, atk, true, bono, vistaPrevia(l, t), false).valor - costoTecnica(l, atk, t);
    if (v > mejorValor) {
      mejor = t;
      mejorValor = v;
    }
  }
  return mejor;
}

/**
 * Lo que gana saliendo del cuerpo a cuerpo con un transporte de `metros` (Dominus p.59), como el
 * Transporte Rápido: lo que le pegarían este asalto y el siguiente, si lo suyo es la distancia
 * (magia, armas o técnicas a distancia). 0 si no le conviene.
 */
export function valorRetirada(ctx: Contexto, l: Luchador, metros: number): number {
  if (!trabadoConAlguien(l) || !peleaDeLejos(l)) return 0;
  let v = 0;
  for (const x of enemigos(ctx, l)) if (enAlcance(l, x)) v += amenaza(x, l) * (metrosTotales(x) < metros ? 1.5 : 0.25);
  return v;
}

/** Lo suyo es pelear de lejos: lanza conjuros, tiene armas a distancia o técnicas de Ki a distancia. */
function peleaDeLejos(l: Luchador): boolean {
  return !!l.magia || !!l.ficha.armasDistancia?.length || repertorio(l.ficha).some((t) => efectosDe(t).accion.distancia > 0);
}

/**
 * Choque físico (Dominus p.65): la técnica con la que intercepta una descarga, si su ataque llega a 50
 * de la habilidad del atacante con chance de 1 en 2 y su daño base puede competir con el de la
 * descarga (como al interceptar con un conjuro).
 */
export function choqueFisicoCon(_ctx: Contexto, l: Luchador, atk: Luchador, resultado: number, totalAtk: number): Tecnica | null {
  if (!l.ki || perfil(l) === 'bestia') return null;
  let mejor: Tecnica | null = null;
  let mejorDano = -1;
  for (const t of tecnicasPara(l, 'ataque')) {
    const k = vistaPrevia(l, t);
    if (!k.choqueFisico) continue;
    const pLlega = tabla(l.cap.umbralAtaque, 0, true).pImpacto(ataqueFinal(l, atk, { ki: k }) - (resultado - 50) + 1);
    const dano = danoBase(l, atk, false, undefined, k);
    if (pLlega >= 0.5 && dano >= totalAtk - 50 && dano - costoTecnica(l, atk, t) / 10 > mejorDano) {
      mejor = t;
      mejorDano = dano;
    }
  }
  return mejor;
}

/**
 * Reflectar con Elección del blanco (Dominus p.71): el enemigo a la vista contra el que más rinde el
 * ataque devuelto (con su habilidad final, sin dados).
 */
export function blancoDelReflejo(ctx: Contexto, l: Luchador, atk: Luchador, total: number, g: { tipo?: TipoAtaque; ki?: ModKi }): Luchador {
  nuevaDecision(ctx);
  let mejor = atk;
  let mejorValor = -Infinity;
  for (const e of enemigos(ctx, l)) {
    if (e !== atk && visionEntre(ctx.luchadores, l, e) === 'bloqueada') continue;
    const v = valorGolpe(l, e, pronostico(l, e, sinDado(total), defensaFinal(e, l), { tipo: g.tipo, ki: g.ki, esContra: true }), 0);
    if (v > mejorValor) {
      mejor = e;
      mejorValor = v;
    }
  }
  return mejor;
}

/**
 * Sacrificio vital del Aumento de daño (Dominus p.54): cuántos PV sacrificar por `factor` de daño base
 * cada uno. Prueba de a un 5% de lo que le queda, hasta la mitad, y se queda con lo que más rinde: el
 * golpe con el daño de más, menos los PV que pierde (por λ). Una criatura con acumulación no lo usa.
 */
export function sacrificioDeDano(ctx: Contexto, atk: Luchador, def: Luchador, ki: ModKi, g: { maniobra: Maniobra; tipo?: TipoAtaque; esContra: boolean }): number {
  if (!ki.sacrificioVital || atk.ficha.acumulacion || atk.pv <= 10) return 0;
  nuevaDecision(ctx);
  const hab = ataqueFinal(atk, def, { ki, maniobra: g.maniobra, esContra: g.esContra });
  const habDef = defensaFinal(def, atk, { kiAtk: ki });
  const valor = (s: number) => valorGolpe(atk, def, pronostico(atk, def, hab, habDef, { ...g, ki: { ...ki, dano: ki.dano + ki.sacrificioVital * s } }), 0) - lambda(atk) * s;
  const paso = Math.max(1, Math.floor(atk.pv / 20));
  let mejor = 0;
  let mejorValor = valor(0);
  for (let s = paso; s <= atk.pv / 2; s += paso) {
    const v = valor(s);
    if (v > mejorValor) {
      mejor = s;
      mejorValor = v;
    }
  }
  return mejor;
}

/**
 * Intangibilidad con Afectar a otros (Dominus p.69): a qué aliados vuelve intangibles, hasta `presencia`
 * en total, de los que más golpes recibirían de quienes no dañan energía a los que menos.
 */
export function aliadosIntangibles(ctx: Contexto, l: Luchador, presencia: number): Luchador[] {
  const amenazados = ctx.luchadores
    .filter((a) => a !== l && a.equipo === l.equipo && activo(a))
    .map((a) => ({ a, v: amenazaFisica(ctx, a) }))
    .filter((x) => x.v > 0)
    .sort((x, y) => y.v - x.v);
  const elegidos: Luchador[] = [];
  let queda = presencia;
  for (const { a } of amenazados) {
    const p = presenciaBase(a.ficha);
    if (p > queda) continue;
    elegidos.push(a);
    queda -= p;
  }
  return elegidos;
}

/** Lo que le pegarían este asalto quienes no dañan energía (lo que la Intangibilidad le ahorra). */
function amenazaFisica(ctx: Contexto, l: Luchador): number {
  let v = 0;
  for (const e of enemigos(ctx, l)) if (!e.cap.danaEnergia && e.ficha.tipoAtaque !== 'ENE' && alcanzable(e, l)) v += lambda(l) * amenaza(e, l);
  return v;
}

/** Fusión (Dominus p.70): se materializa dentro del rival si su Presencia + 20 le da ventaja. */
export function quiereFusion(atk: Luchador, def: Luchador): boolean {
  return presenciaBase(atk.ficha) + 20 - presenciaBase(def.ficha) >= 20;
}

/**
 * Ataque a distancia con Ki (Dominus p.57): al enemigo fuera del cuerpo a cuerpo que más rinda con
 * una técnica que lo alcance (o con una a distancia ya activa), si rinde más que acercarse a pegarle.
 * Sin la dificultad de la Tabla 48 en la cuenta: a estas habilidades casi nunca falla.
 */
export function ataqueADistancia(ctx: Contexto, l: Luchador): { objetivo: Luchador; tecnica: Tecnica | null } | null {
  if (!l.ki || perfil(l) === 'bestia' || l.apresadoPor || l.apresando) return null;
  const activo0 = modDeAccion(l, 'ataque', false);
  const opciones: [Tecnica | null, ModKi][] = [];
  if (activo0?.distancia) opciones.push([null, activo0]);
  for (const t of tecnicasPara(l, 'ataque')) {
    const k = vistaPrevia(l, t);
    if (k.distancia || k.transporte) opciones.push([t, k]);
  }
  if (!opciones.length) return null;
  nuevaDecision(ctx);
  let mejor: { objetivo: Luchador; tecnica: Tecnica | null; valor: number } | null = null;
  for (const e of enemigos(ctx, l)) {
    if (enAlcance(l, e)) continue;
    const d = distancia(l, e);
    // Hace falta verlo; la cobertura resta 40.
    const vision = visionEntre(ctx.luchadores, l, e);
    if (vision === 'bloqueada') continue;
    const bono = vision === 'cobertura' ? -PEN_COBERTURA : 0;
    const cuerpo = alcanzable(l, e) ? valorAtaque(l, e, {}) : 0;
    for (const [t, k] of opciones) {
      // Con un Transporte automático aparece junto a él y le pega cuerpo a cuerpo (Dominus p.59).
      const salta = k.transporte + ALCANCE + 1e-6 >= d;
      if (!salta && k.distancia + 1e-6 < d) continue;
      let v = mejorManiobra(ctx, l, e, false, salta ? 0 : bono, k, false, !salta).valor - (t ? costoTecnica(l, e, t) : 0);
      // Estela de destrucción: también a los de la línea, aliados en contra (Dominus p.58).
      if (!salta && k.estela) {
        for (const x of enLaLinea(ctx.luchadores, l, e)) v += (x.equipo === l.equipo ? -1 : 1) * Math.max(0, mejorManiobra(ctx, l, x, false, 0, k, false, true).valor);
      }
      if (v > cuerpo && (!mejor || v > mejor.valor)) mejor = { objetivo: e, tecnica: t, valor: v };
    }
  }
  return mejor && mejor.valor > 0 ? { objetivo: mejor.objetivo, tecnica: mejor.tecnica } : null;
}

/**
 * Técnica de Estados de condición automática (Dominus p.67-68) a usar en lugar de un ataque: sobre el
 * enemigo que más rinda a su distancia o, si alcanza a varios, sobre todos los que estén a esa
 * distancia (aliados incluidos, que cuentan en contra). Conviene si supera su mejor ataque.
 */
export function estadosAutomaticos(ctx: Contexto, l: Luchador): { tecnica: Tecnica; blancos: Luchador[] } | null {
  if (!l.ki || perfil(l) === 'bestia') return null;
  const candidatas = tecnicasPara(l, 'ataque', false, true);
  if (!candidatas.length) return null;
  nuevaDecision(ctx);
  let mejor: { tecnica: Tecnica; blancos: Luchador[]; valor: number } | null = null;
  for (const t of candidatas) {
    const autos = vistaPrevia(l, t).estados.filter((x) => x.condicion === 'automatico');
    const alcance = Math.max(ALCANCE, ...autos.map((x) => x.distancia));
    const valorDe = (b: Luchador) => autos.reduce((s, est) => s + valorEstado(l, b, est, 1), 0);
    const enRango = ctx.luchadores.filter((x) => x !== l && activo(x) && distancia(l, x) <= alcance + 1e-6);
    let blancos: Luchador[] = [];
    let valor = 0;
    if (autos.some((x) => x.varios)) {
      blancos = enRango;
      for (const b of enRango) valor += b.equipo === l.equipo ? -lambda(l) * valorDe(b) : valorDe(b);
    } else
      for (const b of enRango) {
        if (b.equipo === l.equipo) continue;
        const vb = valorDe(b);
        if (vb > valor) {
          valor = vb;
          blancos = [b];
        }
      }
    if (!blancos.length) continue;
    const neto = valor - costoTecnica(l, blancos[0], t);
    if (!mejor || neto > mejor.valor) mejor = { tecnica: t, blancos, valor: neto };
  }
  if (!mejor || mejor.valor <= 0) return null;
  return mejor.valor > mejorAtaque(ctx, l) ? { tecnica: mejor.tecnica, blancos: mejor.blancos } : null;
}

/**
 * Técnica de defensa a ejecutar contra este golpe, o null. Se compara lo que le cuesta el golpe
 * (daño, baja, crítico, menos la contra que pueda devolver) con y sin ella. Sus efectos de Asalto
 * (Armadura, parada completa) protegen también de los demás golpes del asalto.
 */
export function elegirTecnicaDefensa(
  ctx: Contexto, def: Luchador, atk: Luchador, habAtk: number,
  g: { maniobra: Maniobra; tipo?: TipoAtaque; ki?: ModKi; esContra: boolean; costeTecnica?: number; aDistancia?: boolean },
): Tecnica | null {
  if (!def.ki || perfil(def) === 'bestia') return null;
  const candidatas = tecnicasPara(def, 'defensa');
  if (!candidatas.length) return null;
  nuevaDecision(ctx);
  const costo = (mod: ModKi | undefined) => {
    // Defensa Predeterminada: una defensa final fija, como habilidad que tira (lo que suma el d100 medio).
    const hab = mod?.defensaFija ? sinDado(mod.defensaFija) : defensaFinal(def, atk, { ki: mod, kiAtk: g.ki, proyectil: g.aDistancia });
    const p = pronostico(atk, def, habAtk, hab, { maniobra: g.maniobra, tipo: g.tipo, ki: g.ki, kiDef: mod, esContra: g.esContra });
    // Reflectar: si lo detiene, el golpe vuelve contra el atacante con su habilidad (más lo que suma la tirada)
    // más el bono de contraataque, con su daño y sin efectos; ocupa el lugar de la contra (Dominus p.71).
    const contra = !mod?.reflectar && !mod?.sinContra && !g.ki?.indirecto && puedeContraatacar(def) ? p.pContra * golpeDeContra(def, atk, p.bonoContra) : 0;
    let extra = 0;
    if (mod?.reflectar) {
      const ki = { ...SIN_KI, danoFijo: danoBase(atk, def, g.esContra, undefined, g.ki) };
      const vuelta = pronostico(def, atk, habAtk + MEDIA_TIRADA + p.bonoContra, defensaFinal(atk, def), { tipo: g.tipo, ki, esContra: true });
      extra += (1 - p.pImpacto) * valorGolpe(def, atk, vuelta, 0);
    }
    // Absorción de Ki: con una defensa que deja contraatacar se queda con Ki de la técnica.
    if (mod?.absorcionKi && g.costeTecnica) extra += p.pContra * Math.min(mod.absorcionKi, g.costeTecnica) * precioKi(def);
    // Acumulación: la pantalla se come el daño antes que sus PV.
    if (mod?.pantalla) extra += Math.min(mod.pantalla, p.dano);
    // Transporte automático: si se defiende, puede retirarse del combate (Dominus p.59).
    if (mod?.transporte) extra += (1 - p.pImpacto) * valorRetirada(ctx, def, mod.transporte);
    return valorGolpe(atk, def, p, 0) - contra - extra;
  };
  const sinTecnica = costo(modDeAccion(def, 'defensa', false));
  // Ataques que probablemente reciba después en el asalto (para los efectos de Asalto).
  let otros = 0;
  for (const e of enemigos(ctx, def)) if (e !== atk && !e.haActuado && puedeActuar(e) && alcanzable(e, def)) otros += 0.5;
  let mejor: Tecnica | null = null;
  let mejorNeto = 0;
  for (const t of candidatas) {
    const ef = efectosDe(t);
    if (!defensaSirve(ef.desventajas.defensaContra, g)) continue;
    const ganancia = sinTecnica - costo(vistaPrevia(def, t));
    const deAsalto = ef.asalto.ta || ef.asalto.parada || ef.asalto.esquiva || ef.asalto.escudo || ef.asalto.pantalla ? otros : 0;
    const neto = ganancia * (1 + deAsalto) - costoTecnica(def, atk, t);
    if (neto > mejorNeto) {
      mejor = t;
      mejorNeto = neto;
    }
  }
  if (mejor && convieneGuardar(ctx, def, atk, mejor, mejorNeto)) return null;
  return mejor;
}

/**
 * Parada en área (Dominus p.58): contra un ataque que alcanza a varios, un blanco que para puede
 * cubrir con una sola Parada a los aliados de su radio. Contra un área mágica o sobrenatural hace
 * falta parar energía. Elige a quien más daño ahorra (el suyo y el de los cubiertos) por su Ki.
 */
export function elegirParadaArea(
  ctx: Contexto, atk: Luchador, blancos: Luchador[], habAtk: number,
  g: { maniobra: Maniobra; tipo?: TipoAtaque; ki?: ModKi; esContra: boolean; area?: number },
): ParadaArea | null {
  if (blancos.length < 2) return null;
  const sobrenatural = !!g.ki?.sobrenatural || !!g.ki?.conjuro || (g.area ?? 0) > 0 || (g.ki?.area ?? 0) > 0 || g.tipo === 'ENE';
  const candidatos: { b: Luchador; t: Tecnica; radio: number }[] = [];
  for (const b of blancos) {
    if (!b.ki || perfil(b) === 'bestia' || !activo(b) || b.ficha.acumulacion || (b.ficha.tipoDefensa ?? 'parada') !== 'parada') continue;
    if (sobrenatural && !b.cap.est.paraEnergia) continue;
    for (const t of tecnicasPara(b, 'defensa')) {
      const radio = efectosDe(t).accion.paradaArea;
      if (radio && defensaSirve(efectosDe(t).desventajas.defensaContra, { ...g, aDistancia: false })) candidatos.push({ b, t, radio });
    }
  }
  if (!candidatos.length) return null;
  nuevaDecision(ctx);
  const opciones = { maniobra: g.maniobra, tipo: g.tipo, ki: g.ki, esContra: g.esContra };
  // Lo que le cuesta a cada uno defenderse por su cuenta.
  const propio = new Map<Luchador, number>();
  const solo = (c: Luchador) => {
    let v = propio.get(c);
    if (v === undefined) {
      v = c.ficha.acumulacion ? valorGolpe(atk, c, pronostico(atk, c, habAtk, 0, opciones), 0) :
        valorGolpe(atk, c, pronostico(atk, c, habAtk, defensaFinal(c, atk, { kiAtk: g.ki, area: g.area }), opciones), 0);
      propio.set(c, v);
    }
    return v;
  };
  let mejor: ParadaArea | null = null;
  let mejorNeto = 0;
  for (const { b, t, radio } of candidatos) {
    const cubiertos = blancos.filter((c) => c !== b && c.equipo === b.equipo && activo(c) && distancia(b, c) <= radio);
    if (!cubiertos.length) continue;
    const hab = defensaFinal(b, atk, { ki: vistaPrevia(b, t), kiAtk: g.ki, area: g.area });
    let ahorro = solo(b) - valorGolpe(atk, b, pronostico(atk, b, habAtk, hab, opciones), 0);
    for (const c of cubiertos) ahorro += solo(c) - valorGolpe(atk, c, pronostico(atk, c, habAtk, hab, opciones), 0);
    const neto = ahorro - costoTecnica(b, atk, t);
    if (neto > mejorNeto) {
      mejor = { quien: b, tecnica: t, radio };
      mejorNeto = neto;
    }
  }
  return mejor;
}

/**
 * Técnica de asalto variable a ejecutar antes de la iniciativa (Core p.105), o null: subir el turno
 * (actuar antes y sorprender), Intangibilidad, Acción adicional (sin el −25 si tiene que moverse o
 * levantarse) y Previsión (menos Sorpresa del rival que más chance tiene de sorprenderlo).
 */
export function tecnicaDeTurno(ctx: Contexto, l: Luchador): Tecnica | null {
  if (!l.ki || perfil(l) === 'bestia') return null;
  nuevaDecision(ctx);
  let mejor: Tecnica | null = null;
  let mejorNeto = 0;
  for (const t of repertorio(l.ficha)) {
    const ef = efectosDe(t);
    const bono = ef.asalto.turno;
    const sube = ef.asalto;
    const generico = cambiaElAsalto(sube);
    if ((!bono && !sube.intangible && !sube.accionesAdicionales && !sube.prevision && !generico && !sube.espejismos) || ef.clase !== 'variable' || enUso(l.ki, t) || !puedeEjecutar(l, t)) continue;
    // Intangibilidad (Dominus p.69): le ahorra lo que le pegarían este asalto quienes no dañan energía.
    let intangible = 0;
    if (ef.asalto.intangible) {
      intangible = amenazaFisica(ctx, l);
      // Afectar a otros: también lo que se ahorran los aliados que vuelve intangibles.
      if (ef.asalto.intangibleOtros) for (const a of aliadosIntangibles(ctx, l, ef.asalto.intangibleOtros * presenciaBase(l.ficha))) intangible += amenazaFisica(ctx, a);
    }
    const neto = (bono ? valorTurno(ctx, l, bono) : 0) + intangible + valorAccionAdicional(ctx, l, sube.accionesAdicionales) +
      valorPrevision(ctx, l, sube.prevision) + (generico ? valorEfectosDeAsalto(ctx, l, sube) : 0) + valorEspejismo(ctx, l, sube) - costoTecnica(l, rivalPrincipal(ctx, l), t);
    if (neto > mejorNeto) {
      mejor = t;
      mejorNeto = neto;
    }
  }
  return mejor;
}

/**
 * Efectos de Asalto que cambian cómo le va este asalto sin otra cuenta propia (Incremento de
 * movimiento, Habilidades perceptivas, resistencias…): el intercambio con ellos menos sin ellos, y si
 * el movimiento le deja llegar a pegarle a quien antes no alcanzaba, ese golpe.
 */
function valorEfectosDeAsalto(ctx: Contexto, l: Luchador, asalto: ModKi): number {
  const e = l.ki;
  if (!e) return 0;
  const antes = intercambio(ctx, l);
  const llegaba = new Set(enemigos(ctx, l).filter((x) => alcanzable(l, x)));
  // Armas físicas de Ki: con el arma de la técnica en la mano (Dominus p.63).
  const armada = asalto.armaKi >= 0 && !l.sinArmaKi ? fichaConArmaKi(l, asalto.armaKi) : null;
  return conCambio(() => {
    const previo = e.activo;
    const ficha = l.ficha, cap = l.cap, desarmado = l.desarmado;
    e.activo = combinar(previo, asalto);
    if (armada) {
      l.ficha = armada;
      l.cap = capacidades(armada);
      l.desarmado = false;
    }
    return () => {
      e.activo = previo;
      l.ficha = ficha;
      l.cap = cap;
      l.desarmado = desarmado;
    };
  }, () => {
    const d = intercambio(ctx, l);
    let v = d.hace - antes.hace + lambda(l) * (antes.recibe - d.recibe);
    if (!llegaba.size) for (const x of enemigos(ctx, l)) if (alcanzable(l, x)) v = Math.max(v, valorAtaque(l, x, {}));
    return v;
  });
}

/**
 * Los efectos de Asalto de una técnica Variable que valora `valorEfectosDeAsalto`: todos los que no
 * tienen una cuenta propia en `tecnicaDeTurno`. Sale de los campos de `ModKi`, así un efecto nuevo se
 * valora sin agregarlo a ninguna lista.
 */
const CON_CUENTA_PROPIA: ReadonlySet<keyof ModKi> = new Set(['turno', 'intangible', 'intangibleOtros', 'fusion', 'accionesAdicionales', 'prevision', 'espejismos', 'espejismoIndeteccion', 'espejismoFantasmal']);

function cambiaElAsalto(m: ModKi): boolean {
  for (const k of Object.keys(m) as (keyof ModKi)[]) {
    if (CON_CUENTA_PROPIA.has(k)) continue;
    const v = m[k], base = SIN_KI[k];
    if (Array.isArray(v) ? v.length > 0 : v !== base) return true;
  }
  return false;
}

/**
 * Espejismo (Dominus p.65-66): de cada golpe que le tiren quienes no las descubren, n de cada n+1
 * van a una ilusión; y si son fantasmales, cada una le pega a su blanco y le hace daño si falla la RP.
 */
function valorEspejismo(ctx: Contexto, l: Luchador, m: ModKi): number {
  if (!m.espejismos) return 0;
  const n = m.espejismos;
  let v = 0;
  for (const e of enemigos(ctx, l)) {
    const ve = e.cap.est.veEnergia || !!e.ki?.activo.veEnergia || (e.cap.est.deteccionKi && !m.espejismoIndeteccion);
    if (!ve && alcanzable(e, l)) v += lambda(l) * amenaza(e, l) * n / (n + 1);
  }
  const rival = rivalPrincipal(ctx, l);
  if (m.espejismoFantasmal && rival && alcanzable(l, rival)) {
    v += n * 0.5 * fallaResistencia(rpDe(rival), m.espejismoFantasmal).p * amenaza(l, rival) / Math.max(1, l.ataquesDeclarados || 1);
  }
  return v;
}

/** Acción adicional (Dominus p.56-57): el −25 que se ahorra en sus ataques si tiene que levantarse o moverse con acción activa. */
function valorAccionAdicional(ctx: Contexto, l: Luchador, libres: number): number {
  if (!libres) return 0;
  let mejor = 0;
  for (const e of enemigos(ctx, l)) {
    if (!alcanzable(l, e)) continue;
    const activas = (l.derribado ? 1 : 0) + (necesitaMovimientoActivo(l, e) ? 1 : 0);
    if (!activas) continue;
    mejor = Math.max(mejor, valorAtaque(l, e, { bono: PEN_ACCION_ACTIVA * Math.min(libres, activas) }) - valorAtaque(l, e, {}));
  }
  return mejor * Math.max(1, l.ataquesDeclarados || 1);
}

/** Previsión (Dominus p.57): contra el rival con más chance de sorprenderlo, lo que se ahorra de su golpe. */
function valorPrevision(ctx: Contexto, l: Luchador, anula: number): number {
  if (!anula) return 0;
  let mejor = 0;
  for (const e of enemigos(ctx, l)) {
    if (e.haActuado || !alcanzable(e, l)) continue;
    const p = pIniciativa(e, l, turnoFinal(e) - turnoFinal(l), e.cap.est.diferenciaSorpresa);
    const b = base(e, l);
    const ahorro = danoCon(b.prep, b.hab - b.def - MOD_SORPRESA_DEFENSA) - danoCon(b.prep, b.hab - b.def - MOD_SORPRESA_DEFENSA - anula);
    mejor = Math.max(mejor, lambda(l) * p * ahorro);
  }
  return mejor;
}

/**
 * Lo que vale subir el turno en `bono` este asalto: actuar antes que cada rival (lo deja sin asalto si
 * lo impacta) y la chance de sorprenderlo. Se mide sobre el turno sin las técnicas que ya lo suben.
 */
export function valorTurno(ctx: Contexto, l: Luchador, bono: number): number {
  const propio = turnoFinal(l) - (l.ki?.activo.turno ?? 0);
  let valor = 0;
  for (const e of enemigos(ctx, l)) {
    if (!alcanzable(l, e) && !alcanzable(e, l)) continue;
    const dif = propio - turnoFinal(e);
    const p = (d: number, umbral: number) => pIniciativa(l, e, d, umbral);
    const b = base(l, e);
    const conSorpresa = danoCon(b.prep, b.hab - b.def + 90) - b.golpe;
    const sorpresa = l.cap.est.diferenciaSorpresa;
    valor += (p(dif + bono, 1) - p(dif, 1)) * amenaza(e, l) * 0.5 +
      (p(dif + bono, sorpresa) - p(dif, sorpresa)) * conSorpresa;
  }
  return valor;
}

/**
 * Recuperar acción (Dominus p.57): a la defensiva, la técnica que le devuelve las acciones activas, si
 * lo que rinden los ataques que le quedan supera lo que cuesta ejecutarla.
 */
export function recuperarAccion(ctx: Contexto, l: Luchador): Tecnica | null {
  if (!l.ki || perfil(l) === 'bestia') return null;
  nuevaDecision(ctx);
  const rival = rivalPrincipal(ctx, l);
  const atacar = mejorAtaque(ctx, l) * l.ataquesRestantes;
  let mejor: Tecnica | null = null;
  let mejorNeto = 0;
  for (const t of repertorio(l.ficha)) {
    if (!efectosDe(t).accion.recuperaAccion || !puedeEjecutar(l, t)) continue;
    const neto = atacar - costoTecnica(l, rival, t);
    if (neto > mejorNeto) {
      mejor = t;
      mejorNeto = neto;
    }
  }
  return mejor;
}

/** El mejor rival para valorar una técnica de ataque: al que más le pega hoy. */
function rivalPrincipal(ctx: Contexto, l: Luchador): Luchador | null {
  let mejor: Luchador | null = null;
  for (const e of enemigos(ctx, l)) if (!mejor || golpeDe(l, e) > golpeDe(l, mejor)) mejor = e;
  return mejor;
}

/** Lo que gana un ataque contra `rival` con estos efectos de Ki, frente a uno sin técnica. */
function gananciaAtaque(ctx: Contexto, l: Luchador, rival: Luchador, ki: ModKi): number {
  return mejorManiobra(ctx, l, rival, false, 0, ki, false).valor - valorSinTecnica(ctx, l, rival);
}

/**
 * Lo que rinde un asalto más de una técnica mantenida: el turno, un ataque con sus efectos, o lo que
 * le ahorra a su defensa contra quienes pueden atacarlo.
 */
function valorMantener(ctx: Contexto, l: Luchador, t: Tecnica): number {
  const ef = efectosDe(t);
  let v = ef.asalto.turno ? valorTurno(ctx, l, ef.asalto.turno) : 0;
  const rival = rivalPrincipal(ctx, l);
  if (rival && ef.clase === 'ataque') v += gananciaAtaque(ctx, l, rival, combinar(ef.asalto, ef.accion));
  if (ef.clase === 'defensa') {
    const sube = combinar(ef.asalto, ef.accion);
    for (const e of enemigos(ctx, l)) {
      if (!alcanzable(e, l)) continue;
      const hab = ataqueFinal(e, l);
      const ataques = Math.max(1, e.ataquesDeclarados || 1);
      v += ataques * (danoEsperado(e, l, hab, defensaFinal(l, e, { ki: SIN_KI })) -
        danoEsperado(e, l, hab, defensaFinal(l, e, { ki: sube }), { kiDef: sube }));
    }
  }
  return v;
}

/**
 * Decisiones de Ki al empezar el asalto:
 * - Deja de mantener una técnica si un asalto más rinde menos que su mantenimiento (soltarla es
 *   gratis, Dominus p.48).
 * - Deja ir una técnica que lleva más de 3 asaltos en espera sin usarse.
 * - Si empieza a acumular de cero, declara la técnica de ataque que más rinde por asalto de
 *   acumulación entre las que tardan más de un asalto en juntarse, para poder dejarla en espera
 *   cuando la junte (Core p.105).
 */
export function decisionKi(ctx: Contexto, l: Luchador, acumula: boolean): DecisionKi {
  const e = l.ki;
  if (!e || perfil(l) === 'bestia') return { acumula, soltar: [], liberar: [], objetivo: null };
  nuevaDecision(ctx);
  const h = habilidadesKi(l.ficha);
  const armadura = h.armaduraMayor && hayAtaquesDeEnergia(ctx, l);
  const recuperar = convieneRecuperar(l);
  // Aura de combate: activarla es gratis salvo 1 de Ki cada 5 asaltos; vale si algún rival es sensible
  // y no alcanza a ningún aliado sensible (afecta a todos los del radio, Dominus p.21).
  const aura = h.aura && enemigos(ctx, l).some((x) => sensibleAlAura(l, x)) &&
    !ctx.luchadores.some((x) => x !== l && x.equipo === l.equipo && activo(x) && sensibleAlAura(l, x) && distancia(l, x) <= radioAura(l) + 5);
  const aumentar = h.aumento && !e.aumento ? elegirAumento(ctx, l) : undefined;
  const soltar = [...e.mantenidas.keys()].filter((t) => valorMantener(ctx, l, t) < precioKi(l) * t.mantenimiento);
  const liberar = [...e.enEspera].filter(([, desde]) => ctx.asalto - desde > 3).map(([t]) => t);
  let objetivo: Tecnica | null = null;
  const rival = rivalPrincipal(ctx, l);
  if (acumula && rival && !CARACTERISTICAS_KI.some((c) => e.acumulado[c])) {
    let mejorRitmo = 0;
    // Sólo vale declarar las que tardan más de un asalto en juntarse: las demás se usan en el asalto.
    // Las predeterminadas se declaran siempre, aunque se junten en un asalto: se usan al siguiente.
    const predeterminada = (t: Tecnica) => efectosDe(t).desventajas.predeterminada;
    const candidatas = repertorio(l.ficha).filter(
      (t) => efectosDe(t).clase === 'ataque' && !e.enEspera.has(t) && costeKi(t) <= e.reserva && (predeterminada(t) || asaltosParaJuntar(l, t, penAccion(l), true) >= 2),
    );
    for (const t of candidatas) {
      const ritmo = netoTecnica(ctx, l, rival, t) / Math.max(predeterminada(t) ? 2 : 1, asaltosParaJuntar(l, t, penAccion(l), true));
      if (ritmo > mejorRitmo) {
        mejorRitmo = ritmo;
        objetivo = t;
      }
    }
  }
  return { acumula, soltar, liberar, objetivo, armadura, recuperar, aura, aumentar };
}

/**
 * Técnica a dejar en espera al final del asalto: la declarada al empezar a acumular, si le alcanza y
 * no la usó. En espera su Ki queda apartado: no se pierde al terminar el asalto, puede seguir
 * acumulando y ejecutar otras sin perderla (Core p.105).
 */
export function tecnicaParaEspera(_ctx: Contexto, l: Luchador): Tecnica | null {
  const t = l.ki?.objetivo;
  // Una predeterminada no espera: se usa en cuanto se puede (Dominus p.74).
  if (!t || !puedePonerEnEspera(l, t) || efectosDe(t).desventajas.predeterminada) return null;
  return t;
}
