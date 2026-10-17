// La defensa en etapas (Core p.86-89, p.100): lo que evita el golpe sin defensa (EVITAN_EL_GOLPE),
// la tirada, los escudos sobrenaturales (escudoRecibe), defensaGana y golpeQueEntra. Recibe el
// motor (MotorCombate).

import type { Contexto, Luchador } from './modelo';
import { DADO_FIJO, type TiradaD100, textoTirada, tirarD100Cerrada, valorTirada } from './dados';
import { type TipoAtaque, absorcion, bonoContraataque, danoFinal, porcentajeDano, umbralPifia } from './reglas';
import { absorcionContra, activo, areaDoblaDano, barreraFrena, danoAEscudo, danoBase, defensaEscudoMagico, defensaFinal, distancia, inmuneAlGolpe, modControl, nro, perfilDe, reduccionFuego, zonaDe } from './calculos';
import { caracteristicasControl, controlEnfrentado, esManiobraDeControl } from './maniobras';
import type { Golpe, ParadaArea, ResultadoDefensa } from './golpe';
import * as ia from './ia';
import * as iaMagia from './ia-magia';
import { efectoAnimico } from './combate-magia';
import { destruccionPorKi, efectosAlImpactar, fusion, puntosDePresion, reflectar, repetirFascinacion, trasLaTecnica, usarTecnica } from './combate-ki';
import { roturaDeArmadura, roturaEnParada } from './rotura';
import { prender, quemarAlTocar } from './llamas';
import { GRADOS } from './conjuros';
import { dejarDeMantener, escudoDetiene, golpeSobrenatural, hacerOtraAccion, lanzar, mantenidoDe, pagarDeterminada, proyeccionDeterminada, romperEscudo, rpDe } from './magia';
import { PEN_ESQUIVA_TRAS_ATRAPAR, puedeAtrapar } from './proyectiles';
import { type ModKi, defensaSirve, efectosDe, modDeAccion, recuperarKi } from './ki';
import type { MotorCombate } from './combate';
import { atrapar } from './combate-distancia';
import { retirarseConTransporte } from './combate-movimiento';

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
function escudoRecibe(motor: MotorCombate, ctx: Contexto, golpe: number, ataqueTotal: number, esc: EscudoSobrenatural): number {
  if (golpe < esc.resistencia) {
    const quedan = esc.resistencia - golpe;
    esc.quedan(quedan);
    motor.log(ctx, () => `  ${esc.nombre[0].toUpperCase()}${esc.nombre.slice(1)} aguanta (le quedan ${quedan}).`);
    return -1;
  }
  const pasa = golpe - esc.resistencia;
  esc.romper();
  motor.log(ctx, () => `  ¡El golpe rompe ${esc.nombre}! Pasa con daño ${pasa} → ${ataqueTotal}.`);
  return pasa;
}

/** Algo que hace que un golpe no llegue al defensor antes de que se defienda (y lo narra). */
type EvitaElGolpe = (motor: MotorCombate, ctx: Contexto, atk: Luchador, def: Luchador, o: Golpe, tipo: TipoAtaque, etiqueta: string) => boolean;

/** Intangibilidad (Ki): lo atraviesa todo ataque que no sea de energía (Dominus p.69). */
const intangible: EvitaElGolpe = (motor, ctx, atk, def, o, tipo, etiqueta) => {
  if (!esIntangible(def) || tipo === 'ENE' || atk.cap.danaEnergia || o.ki?.danaEnergia) return false;
  motor.log(ctx, () => `${etiqueta}: el golpe atraviesa a ${def.ficha.nombre}, intangible.`);
  return true;
};

/**
 * Holograma: quien no lo descubrió puede pegarle a la imagen (la mitad de las veces, interpretación); un
 * golpe de energía la deshace (Core p.127).
 */
const holograma: EvitaElGolpe = (motor, ctx, atk, def, o, tipo, etiqueta) => {
  if (!def.holograma || atk.descubre.has(def) || ctx.rng.next() >= 0.5) return false;
  motor.log(ctx, () => `${etiqueta}: ¡ataca a la imagen! El golpe la atraviesa.`);
  if (tipo === 'ENE' || atk.cap.danaEnergia || o.ki?.danaEnergia) {
    const m = mantenidoDe(def, 'holograma');
    if (m) dejarDeMantener(def, m);
    motor.log(ctx, () => `  La imagen se deshace.`);
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
function defensaGana(motor: MotorCombate, 
  ctx: Contexto, atk: Luchador, quienDefiende: Luchador, o: Golpe, kiDef: ModKi | undefined, resultado: number, ataqueTotal: number,
): ResultadoDefensa {
  // Absorción de Ki: con una defensa que permita contraatacar absorbe Ki de la técnica (Dominus p.64).
  if (kiDef?.absorcionKi && resultado < 0 && o.costeTecnica && quienDefiende.ki) {
    const absorbe = recuperarKi(quienDefiende, Math.min(kiDef.absorcionKi, o.costeTecnica));
    if (absorbe) motor.log(ctx, () => `  ${quienDefiende.ficha.nombre} absorbe ${absorbe} de Ki de la técnica [reserva ${quienDefiende.ki!.reserva}].`);
  }
  // Reflectar el ataque (Ki): lo devuelve con la habilidad final del atacante, más el bono de
  // contraataque, sin sus efectos esotéricos y sin gastar acciones; cuenta como su contra (Dominus p.71).
  if (kiDef?.reflectar && !o.reflejado && activo(atk)) {
    reflectar(motor, ctx, quienDefiende, atk, ataqueTotal + (resultado < 0 ? bonoContraataque(resultado) : 0), o, kiDef);
    return { defensor: quienDefiende, contra: null, impacto: false };
  }
  // Emp arcano: cada defensa con éxito contra un arma permite desarmar (Dominus p.39).
  if (quienDefiende.cap.est.desarmaAlDefender && !atk.cap.desarmado && activo(atk)) {
    const c = caracteristicasControl('desarmar', quienDefiende, atk);
    // Control directo, sin los modificadores de Emp (Dominus p.39); los negativos sí cuentan.
    if (controlEnfrentado(ctx.rng, c.atk + modControl(quienDefiende), c.def + modControl(atk)) > 0) motor.desarmar(ctx, atk, quienDefiende);
  }
  // Transporte automático atado a la defensa: con éxito puede retirarse del combate (Dominus p.59).
  if (kiDef?.transporte && !quienDefiende.presaExistencial && ia.valorRetirada(ctx, quienDefiende, kiDef.transporte) > 0 && retirarseConTransporte(motor, ctx, quienDefiende, atk, kiDef.transporte)) {
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
function golpeQueEntra(motor: MotorCombate, 
  ctx: Contexto, atk: Luchador, def: Luchador, o: Golpe, resultado: number, baseTrasEscudo: number, tipoGolpe: TipoAtaque,
  resiste: boolean, avisar: () => void,
): ResultadoDefensa {
  const m = o.maniobra;
  const porcentaje = porcentajeDano(resultado, absorcionContra(def, atk, m, o.tipo, o.ranura, o.ki));

  if (esManiobraDeControl(m)) {
    if (porcentaje >= 10) motor.resolverControl(ctx, atk, def, m, porcentaje, o.esContra, o.ki?.apresamiento ?? 0, o.ki);
    else motor.log(ctx, () => `  No alcanza el 10% necesario para la maniobra.`);
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
    efectosAlImpactar(motor, ctx, atk, def, ki, habriaDanado, porcentajeContacto);
    if (!activo(def)) {
      avisar();
      return { defensor: def, contra: null, impacto: true };
    }
  }

  // Engatillar: si el ataque habría dañado, no daña y deja al rival amenazado (Core p.92).
  if (m === 'engatillar') {
    if (dano > 0) {
      def.amenazadoPor = atk;
      motor.log(ctx, () => `  ${def.ficha.nombre} queda amenazado por ${atk.ficha.nombre}.`);
    } else motor.log(ctx, () => `  No logra engatillarlo.`);
    avisar();
    return { defensor: def, contra: null, impacto: true };
  }
  // Destrucción por Ki: basta con alcanzarlo, aunque el golpe no dañe (Core p.104).
  if (m === 'destruccionKi') {
    destruccionPorKi(motor, ctx, atk, def, o.kiDestruccion ?? 0, resiste);
    avisar();
    return { defensor: def, contra: null, impacto: true };
  }
  // Puntos de presión (Mushin): en vez de daño, RF contra el daño + 20 (Dominus p.42).
  if (m === 'puntosPresion') {
    if (dano > 0) puntosDePresion(motor, ctx, atk, def, dano, o.estadoMushin ?? null);
    else motor.log(ctx, () => `  No alcanza los puntos de presión.`);
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
      motor.log(ctx, () => `  ${def.ficha.nombre} absorbe ${antes - dano} de daño con ${ki} de Ki (Absorción de energía) [reserva ${def.ki!.reserva}].`);
    }
  }
  if (dano > 0) {
    motor.aplicarDano(ctx, atk, def, dano, resiste, m, o.ki);
    // Daño por calor: 1d100 (cerrada) + el daño en la Tabla 76 (Core p.236).
    if (tipo === 'CAL' && activo(def)) prender(motor, ctx, atk, def, tirarD100Cerrada(ctx.rng) + dano);
  } else if (frena) motor.log(ctx, () => `  Impacta, pero la barrera de daño ${def.cap.barrera} frena el daño base ${base}.`);
  else if (!esManiobraDeControl(m) && !absorbido) {
    motor.log(ctx, () => `  Impacta sin daño (absorción ${abs}).`);
    // La armadura evitó el daño: puede romperse (Core p.93).
    if (ctx.opciones.rotura) roturaDeArmadura(motor, ctx, atk, def, o.ranura, zonaDe(m));
  }
  avisar();
  return { defensor: def, contra: null, impacto: true };
}

export function resolverDefensa(motor: MotorCombate, 
  ctx: Contexto, atk: Luchador, def: Luchador, habAtk: number, tA: TiradaD100, o: Golpe, etiqueta: string,
): ResultadoDefensa {
  const r = defenderse(motor, ctx, atk, def, habAtk, tA, o, etiqueta);
  trasLaTecnica(motor, ctx, r.defensor);
  return r;
}

export function defenderse(motor: MotorCombate, 
  ctx: Contexto, atk: Luchador, def: Luchador, habAtk: number, tA: TiradaD100, o: Golpe, etiqueta: string,
): ResultadoDefensa {
  // Parada en área (Ki): lo cubre la de un aliado, que ya se defendió (Dominus p.58).
  const pa = o.paradaArea;
  if (pa && pa.quien !== def && pa.resultado !== undefined && def.equipo === pa.quien.equipo && distancia(def, pa.quien) <= pa.radio) {
    return defensaCubierta(motor, ctx, atk, def, habAtk, tA, o, etiqueta, pa);
  }
  const cubre = pa?.quien === def ? pa : undefined;
  // Un aliado puede defender en su lugar: Guardián (−10, sin necesitar el turno, Dominus p.86) o
  // Apartar (esquiva −30, Guardaespaldas −10; acción activa reservada, Core p.93).
  const proteccion = cubre ? null : ia.protectorPara(ctx, def, atk);
  const quienDefiende = proteccion?.quien ?? def;
  // Fascinación: al verse en peligro repite la RF (Dominus p.67).
  if (def.fascinado) repetirFascinacion(motor, ctx, def);
  const tipoGolpe = o.tipo ?? perfilDe(atk, o.ranura).tipoAtaque;
  // Lo que hace que el golpe no llegue, antes de defenderse (intangible, holograma…).
  if (!proteccion && EVITAN_EL_GOLPE.some((evita) => evita(motor, ctx, atk, def, o, tipoGolpe, etiqueta))) return { defensor: def, contra: null, impacto: false };
  if (proteccion?.apartar) quienDefiende.ataquesRestantes--;
  const resiste = !proteccion && !cubre && !def.ficha.acumulacion && ia.resistir(ctx, def, atk);
  // Haima: sacrifica PV para crear una sombra de sangre que recibe el golpe (Dominus p.88).
  const sacrificio = !proteccion && !cubre && def.cap.est.haima ? ia.sacrificioHaima(def, atk, habAtk) : 0;
  if (sacrificio) {
    def.pv -= sacrificio;
    motor.log(ctx, () => `${def.ficha.nombre} sacrifica ${sacrificio} PV en una sombra de sangre (aguante ${2 * sacrificio}).`);
  }
  const cDef = ia.cansancioDefensa(ctx, quienDefiende, atk, habAtk, resiste);
  motor.gastarCansancio(quienDefiende, cDef);
  const samielDef = ia.gastoSamiel(quienDefiende, atk, 'defensa');
  if (samielDef) quienDefiende.samiel.set(atk, (quienDefiende.samiel.get(atk) ?? 0) - samielDef);
  // Trucos de manos: atrapar el proyectil en el aire, como defensa pasiva; si falla, se defiende igual
  // con −50 (Core p.94).
  let trasAtrapar = 0;
  if (!proteccion && o.aDistancia && !def.ficha.acumulacion && def.ficha.trucosDeManos !== undefined && puedeAtrapar(def.ficha.trucosDeManos, o.ranura.proyectil) && ia.intentaAtrapar(ctx, def, atk, habAtk, o)) {
    if (atrapar(motor, ctx, def, atk, habAtk + tA.valor, o)) return { defensor: def, contra: null, impacto: false };
    trasAtrapar = PEN_ESQUIVA_TRAS_ATRAPAR;
  }
  // Escudo mágico (Core p.100): lo levanta como conjuro pasivo si le conviene y, si lo tiene, se
  // defiende con él (no se combina con parar o esquivar).
  let escudoNuevo = false;
  if (!proteccion && !cubre && def.magia) {
    const nuevo = iaMagia.escudoMagicoAlDefender(ctx, def, atk, habAtk, o);
    if (nuevo) {
      escudoNuevo = true;
      const g = lanzar(def, nuevo.conjuro, nuevo.grado);
      def.stats.tecnicas[`${nuevo.conjuro.nombre} (${GRADOS[nuevo.grado]})`] = (def.stats.tecnicas[`${nuevo.conjuro.nombre} (${GRADOS[nuevo.grado]})`] ?? 0) + 1;
      motor.log(ctx, () => `${def.ficha.nombre} levanta ${nuevo.conjuro.nombre} (${GRADOS[nuevo.grado]}, ${g.resistencia} de resistencia) [zeon ${g.zeon}; reserva ${def.magia!.reserva}].`);
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
    kiDef = usarTecnica(motor, ctx, quienDefiende, tecnica);
  } else kiDef = modDeAccion(quienDefiende, 'defensa', true);
  const habDef = conEscudo ? defensaEscudoMagico(quienDefiende, atk, o.ki) - trasAtrapar : defensaFinal(quienDefiende, atk, { cansancio: cDef, resistir: resiste, samiel: samielDef, ki: kiDef, kiAtk: o.ki, proyectil: o.aDistancia ? o.ranura.proyectil?.clase ?? 'disparo' : undefined, area: o.area, centroArea: o.centroArea }) - (proteccion?.pen ?? 0) - trasAtrapar;
  quienDefiende.previenePendiente.delete(atk);
  const para = (quienDefiende.ficha.tipoDefensa ?? 'parada') === 'parada';
  // Parar con el arma la desenfunda (si no lo sorprendieron, que entonces se defiende sin ella).
  if (para && !atk.sorprendeA.has(quienDefiende)) quienDefiende.enfundada = false;

  let resultado: number;
  if (quienDefiende.ficha.acumulacion) {
    resultado = habAtk + tA.valor;
    motor.log(ctx, () => `${etiqueta}: ${textoTirada(habAtk, tA)} contra acumulación → ${resultado}.`,
      () => ({ ataque: { de: nro(ctx, atk), a: nro(ctx, quienDefiende), contra: o.esContra, resultado } }));
  } else if (quienDefiende.ki && quienDefiende.ki.sinDefensa === quienDefiende.ki.asalto) {
    // Sin defensa: ejecutó una técnica que le baja la guardia todo el asalto (Dominus p.75).
    resultado = habAtk + tA.valor;
    motor.log(ctx, () => `${etiqueta}: ${textoTirada(habAtk, tA)}; ${quienDefiende.ficha.nombre} no puede defenderse (Sin defensa) → ${resultado}.`,
      () => ({ ataque: { de: nro(ctx, atk), a: nro(ctx, quienDefiende), contra: o.esContra, resultado } }));
  } else {
    // Defensa Predeterminada (Ki): defensa final fija, sin dados (Dominus p.53). Con el escudo mágico,
    // la Proyección Mágica Determinada hace lo mismo pagando zeon (Arcana p.26).
    const det = conEscudo ? proyeccionDeterminada(quienDefiende, habDef) : null;
    if (det) {
      pagarDeterminada(quienDefiende, det);
      motor.log(ctx, () => `${quienDefiende.ficha.nombre} defiende con Proyección Mágica Determinada: ${det.valor} [zeon ${det.zeon}].`);
    }
    const fija = det?.valor ?? kiDef?.defensaFija ?? 0;
    // Con un escudo mágico tira su Proyección: la maestría es la de ella (Core p.10, p.17).
    const umbralDef = (conEscudo ? umbralPifia(quienDefiende.ficha.magia!.proyeccionDefensa ?? quienDefiende.ficha.magia!.proyeccion, quienDefiende.cap.ajustePifia) : quienDefiende.cap.umbralDefensa) +
      (tecnica && efectosDe(tecnica).desventajas.compleja ? 2 : 0);
    const tD = fija ? DADO_FIJO : motor.tirar(ctx, umbralDef);
    const valorDef = valorTirada(tD);
    quienDefiende.defensasHechas++;
    // Una pifia resta su nivel directamente de la defensa, sin mínimo (Core p.98), como en el pronóstico.
    // Pero un escudo que se lanza con pifia fracasa (el zeon se pierde) y queda sin defensa, salvo
    // con Seguridad Defensiva (Core p.118, Arcana p.27).
    const fracasa = conEscudo && escudoNuevo && tD.pifia && !def.ficha.magia?.seguridadDefensiva;
    const total = fracasa ? 0 : fija || habDef + valorDef;
    resultado = fracasa ? habAtk + tA.valor : habAtk + tA.valor - total;
    const nombreEscudo = conEscudo ? def.magia!.escudo!.conjuro.nombre : '';
    if (fracasa) {
      motor.log(ctx, () => `  ¡Pifia al lanzar ${nombreEscudo}! El escudo fracasa y ${def.ficha.nombre} queda sin defensa.`);
      romperEscudo(def);
    }
    if (cubre) cubre.resultado = resultado;
    // Con acumulación, si superan la defensa de su escudo mágico pierde la acción (Core p.99).
    if (conEscudo && def.ficha.acumulacion && resultado > 0) def.aLaDefensiva = true;
    const quien = proteccion ? `${proteccion.quien.ficha.nombre} (${proteccion.apartar ? 'aparta' : 'Guardián'}) ` : '';
    const conTecnica = tecnica ? ` con ${tecnica.nombre}` : conEscudo ? ` con ${nombreEscudo}` : '';
    motor.log(ctx, () => `${etiqueta}: ${textoTirada(habAtk, tA)} contra ${quien}${fija ? `${fija} (fija)` : textoTirada(habDef, tD)}${conTecnica}${resiste ? ' (resiste el golpe)' : ''} → ${resultado}.`,
      () => ({ ataque: { de: nro(ctx, atk), a: nro(ctx, quienDefiende), contra: o.esContra, resultado } }));
    if (para && !conEscudo && ctx.opciones.rotura) roturaEnParada(motor, ctx, atk, quienDefiende, o.ranura, resultado <= 0, o.ki?.conjuro ? o.ki.danoFijo : undefined);
  }

  // Escudo de energía (Ki): si detiene el golpe recibe su daño base (+10 por punto de TA que reste),
  // salvo que no pase su barrera de daño 40; si lo rompe, el resto alcanza al defensor sin defensa
  // (Core p.100, Dominus p.11, p.66).
  let baseTrasEscudo = -1;
  if (resultado <= 0 && quienDefiende.escudoKi > 0 && !quienDefiende.ficha.acumulacion) {
    const golpe = danoAEscudo(atk, quienDefiende, o.esContra, o.ranura, o.ki, o.tipo);
    if (golpe >= 40) {
      baseTrasEscudo = escudoRecibe(motor, ctx, golpe, habAtk + tA.valor, {
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
    if (!esc.conjuro.escudoSoloSobrenatural || golpeSobrenatural(atk, o.ki, tipoG)) {
      // Escudo de Luz: lo de oscuridad le hace el doble (Core p.126).
      const doble = !!esc.conjuro.escudoDobleContra && o.ki?.naturaleza === esc.conjuro.escudoDobleContra ? 2 : 1;
      baseTrasEscudo = escudoRecibe(motor, ctx, doble * danoAEscudo(atk, def, o.esContra, o.ranura, o.ki, o.tipo), habAtk + tA.valor, {
        nombre: `${esc.conjuro.nombre} de ${def.ficha.nombre}`, resistencia: esc.resistencia,
        quedan: (r) => { esc.resistencia = r; }, romper: () => romperEscudo(def),
      });
      if (baseTrasEscudo >= 0) resultado = habAtk + tA.valor;
    }
  }

  if (resultado <= 0) return defensaGana(motor, ctx, atk, quienDefiende, o, kiDef, resultado, habAtk + tA.valor);
  return golpeRecibido(motor, ctx, atk, def, o, resultado, baseTrasEscudo, tipoGolpe, resiste, sacrificio);
}

/**
 * Parada en área (Dominus p.58): cubierto por la de un aliado, no se defiende. Si la Parada ganó no
 * le pasa nada (ni contraataca); si perdió, recibe el daño por esa diferencia.
 */
function defensaCubierta(motor: MotorCombate, 
  ctx: Contexto, atk: Luchador, def: Luchador, habAtk: number, tA: TiradaD100, o: Golpe, etiqueta: string, pa: ParadaArea,
): ResultadoDefensa {
  const resultado = pa.resultado!;
  motor.log(ctx, () => `${etiqueta}: ${textoTirada(habAtk, tA)}, cubierto por la Parada en área de ${pa.quien.ficha.nombre} → ${resultado}.`,
    () => ({ ataque: { de: nro(ctx, atk), a: nro(ctx, def), contra: o.esContra, resultado } }));
  if (resultado <= 0) return { defensor: def, contra: null, impacto: false };
  return golpeRecibido(motor, ctx, atk, def, o, resultado, -1, o.tipo ?? perfilDe(atk, o.ranura).tipoAtaque, false, 0);
}

/** El ataque superó la defensa: anímico, Cuerpo a Fuego, Haima y, si entra, el golpe. */
function golpeRecibido(motor: MotorCombate, 
  ctx: Contexto, atk: Luchador, def: Luchador, o: Golpe, resultado: number, baseTrasEscudo: number, tipoGolpe: TipoAtaque,
  resiste: boolean, sacrificio: number,
): ResultadoDefensa {
  // El golpe de una ilusión no hace nada, salvo si es fantasmal y falla la RP (Dominus p.66).
  if (o.ilusion && (!o.ilusion.fantasmal || !motor.controlResistencia(ctx, def, 'RP', rpDe(def), o.ilusion.fantasmal, 'la ilusión fantasmal').falla)) {
    motor.log(ctx, () => `  El golpe es ilusorio: no le hace nada.`);
    return { defensor: def, contra: null, impacto: false };
  }

  // Conjuro anímico (Core p.122): alcanza si logra un resultado de daño contra la TA de energía; en
  // vez de dañar, el blanco hace la RM. No lo deja a la defensiva: no lo golpea (interpretación).
  if (o.animico) {
    const pct = porcentajeDano(resultado, absorcionContra(def, atk, 'normal', 'ENE', o.ranura, o.ki));
    if (pct <= 0) {
      motor.log(ctx, () => `  No alcanza un resultado de daño contra su TA de energía: el conjuro no lo afecta.`);
      return { defensor: def, contra: null, impacto: false };
    }
    efectoAnimico(motor, ctx, atk, def, o.animico, pct);
    return { defensor: def, contra: null, impacto: true };
  }

  // Cuerpo a Fuego: lo que no es energía, frío o agua lo atraviesa sin dañarlo; quien lo toca se
  // quema (Core p.158).
  const sinArmasCerca = o.ranura.sinArmas && !o.aDistancia && !o.ki?.conjuro;
  if (def.bono?.cuerpoFuego && inmuneAlGolpe(def, atk, tipoGolpe, o.ki)) {
    motor.log(ctx, () => `  El golpe atraviesa las llamas del cuerpo de ${def.ficha.nombre} sin dañarlo.`);
    if (sinArmasCerca && activo(atk)) quemarAlTocar(motor, ctx, def, atk);
    return { defensor: def, contra: null, impacto: false };
  }
  if (atk.bono?.cuerpoFuego && sinArmasCerca && activo(def)) quemarAlTocar(motor, ctx, atk, def);
  if (!activo(def)) return { defensor: def, contra: null, impacto: true };

  // Haima: si el daño no supera el aguante de la sombra, la sombra lo recibe y no pierde la acción;
  // si lo supera, recibe el daño pleno y queda a la defensiva.
  if (sacrificio) {
    const golpe = danoFinal(danoBase(atk, def, o.esContra, o.ranura, o.ki), porcentajeDano(resultado, absorcionContra(def, atk, esManiobraDeControl(o.maniobra) ? 'normal' : o.maniobra, o.tipo, o.ranura, o.ki)));
    if (golpe <= 2 * sacrificio) {
      motor.log(ctx, () => `  La sombra de sangre recibe el golpe (${golpe} de ${2 * sacrificio}).`);
      return { defensor: def, contra: null, impacto: true };
    }
    motor.log(ctx, () => `  El golpe (${golpe}) atraviesa la sombra de sangre.`);
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
      motor.log(ctx, () => `  ${def.ficha.nombre} queda a la defensiva${porCritico}.`);
    } else if (resiste) motor.log(ctx, () => `  ${def.ficha.nombre} resistió el golpe: sigue pudiendo actuar.`);
  };
  motor.liberarAmenazados(ctx, def);
  // Fusión: intangible, se materializa dentro de él en vez de golpearlo (Dominus p.70).
  if (atk.ki?.activo.fusion && atk.ki.activo.intangible && !o.esContra && ia.quiereFusion(atk, def)) {
    fusion(motor, ctx, atk, def);
    avisar();
    return { defensor: def, contra: null, impacto: true };
  }
  return golpeQueEntra(motor, ctx, atk, def, o, resultado, baseTrasEscudo, tipoGolpe, resiste, avisar);
}
