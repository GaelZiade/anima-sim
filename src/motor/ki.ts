// Dominios del Ki en combate: acumulación, gasto y efectos de las técnicas (Core p.102-106,
// Dominus cap. 5). Las Habilidades del Ki con bonos fijos (Velocidad y Daño incrementado, Extensión
// del aura, Armadura de energía) ya vienen sumadas en los valores de la planilla.

import { CARACTERISTICAS_KI, type Atributo, type CaracteristicaKi, type EfectoTecnica, type Ficha, type Luchador, type Tecnica } from './modelo';
import type { TipoAtaque } from './reglas';
import { capacidades, normalizarRasgo, tamanoArmaDe, tiene } from './rasgos';
import { bonoCaracteristica } from './maniobras';

/** Lo que las técnicas le suman a una acción o a todo el asalto. Los efectos iguales no se suman. */
export interface ModKi {
  ataque: number;
  /** Sólo en un contraataque (Habilidad de contraataque). */
  contraataque: number;
  parada: number;
  esquiva: number;
  /** Habilidad de parada o esquiva limitada: no permite contraatacar. */
  sinContra: boolean;
  /** Ataque o Defensa Predeterminada: valor final fijo, sin dados (0 si no hay). */
  ataqueFijo: number;
  defensaFija: number;
  dano: number;
  /**
   * Aumento de daño, ventajas (Dominus p.54): Sacrificio de PV (al daño, una o dos veces lo sacrificado)
   * y Daño límite (+ los PV que ya perdió).
   */
  sacrificioVital: number;
  danoLimite: boolean;
  /** Multiplicador al Daño: se aplica antes de sumar cualquier otro bono (Dominus p.55). */
  multDano: number;
  /** Sustitución de Daño: daño base del ataque (0 si no hay). */
  danoFijo: number;
  reduccionTA: number;
  sinArmadura: boolean;
  /** Maniobras de combate y apuntar: cuánto reduce el penalizador de la maniobra. */
  precision: number;
  /** Ataque a distancia: alcance en metros (0 si no hay, Dominus p.57). */
  distancia: number;
  /** Proyección: el atacante viaja con su ataque hasta el blanco (Dominus p.58). */
  proyeccion: boolean;
  /** Estela de destrucción: alcanza también a quien esté en la línea hasta el blanco (Dominus p.58). */
  estela: boolean;
  /** Ataque con área: radio en metros (0 si no hay) y si elige a quién alcanza. */
  area: number;
  eleccionBlanco: boolean;
  ataquesAdicionales: number;
  /** Ataque continuo: no se le puede contraatacar hasta el último golpe (Dominus p.56). */
  continuo: boolean;
  /** Combo (desventaja): cada golpe adicional tiene que impactar para seguir la cadena (Dominus p.56). */
  combo: boolean;
  /** Bono de cansancio añadido: el cansancio vale en todos los golpes, no sólo en el primero (Dominus p.56). */
  cansancioAnadido: boolean;
  /** Ataque adicional limitado: golpes extra sin penalizador y sin los demás efectos (Dominus p.56). */
  adicionalesLimitados: number;
  /** Camuflar ataque: dificultad de Advertir para no defenderse con Sorpresa (Dominus p.52). */
  camuflar: number;
  /** Acción adicional: acciones activas del asalto que no suman el −25 (Dominus p.56-57). */
  accionesAdicionales: number;
  /** Recuperar acción: a la defensiva, vuelve a poder hacer acciones activas (Dominus p.57). */
  recuperaAccion: boolean;
  /** Previsión: cuánto del −90 de la Sorpresa por turno anula contra un rival, 45 o 90 (Dominus p.57). */
  prevision: number;
  defensasAdicionales: number;
  /**
   * Parada en área: radio en metros (0 si no hay). Una sola Parada cubre a los aliados del radio; contra
   * un área sobrenatural hace falta parar energía (Dominus p.58).
   */
  paradaArea: number;
  /**
   * Transporte automático: hasta cuántos metros (0 si no hay). En un ataque o contraataque lo lleva
   * junto al blanco; en una defensa con éxito, fuera del combate (Dominus p.59).
   */
  transporte: number;
  turno: number;
  /** Armadura: TA contra todo, como capa adicional (Dominus p.60). */
  ta: number;
  /** Armadura Inmodificable: nada le resta esa TA; Sin armadura la deja a la mitad (Dominus p.61). */
  taInmodificable: boolean;
  /** Armadura física: esa TA no vale contra la energía (Dominus p.61). */
  taFisica: boolean;
  /** Lentitud: −1 al Tipo de movimiento y −5 al turno por punto de TA de la técnica (Dominus p.61). */
  lentitud: number;
  /** Aumentar rotura y Aumentar entereza: a la del arma, y a la de la armadura (Dominus p.60). */
  rotura: number;
  entereza: number;
  /** Incremento de movimiento: al Tipo de movimiento, la mitad por encima de 13, sin tope (Dominus p.61). */
  movimiento: number;
  /** Incremento de habilidad: las secundarias que importan en combate (Dominus p.61). */
  acrobacias: number;
  frialdad: number;
  resistirDolor: number;
  /** Capacidad incrementada: a una Característica, sólo en los controles enfrentados (Dominus p.61). */
  capacidad: readonly { atributo: Atributo; bono: number }[];
  rf: number;
  rm: number;
  rp: number;
  /** Habilidades perceptivas (Dominus p.62): Visión nocturna, y ver la energía (Ver lo sobrenatural). */
  visionNocturna: boolean;
  veEnergia: boolean;
  danaEnergia: boolean;
  /** Potenciar Crítico: bono a la tirada del crítico; con Crítico automático, critica si daña (Dominus p.70). */
  critico: number;
  criticoAuto: boolean;
  /** Ataque sobrenatural: ataca en ENE y sólo lo para quien para energía (Dominus p.64). */
  sobrenatural: boolean;
  /** Ataque elemental: TA en la que ataca ('' si no la cambia, Dominus p.63). */
  elemento: TipoAtaque | '';
  /** De qué está hecho el ataque ("luz", "oscuridad"…): el Escudo de Luz recibe doble de la oscuridad. */
  naturaleza: string;
  /** Marca: bono a todo ataque contra quien dañe (Dominus p.70). */
  marca: number;
  /** Impacto: Fuerza del control que lanza lejos al blanco, o lo atrae (Dominus p.68). */
  impacto: number;
  atraer: boolean;
  /** Apresamiento: Presa sin penalizador con este valor de característica (Dominus p.64). */
  /**
   * Espejismo (Dominus p.65): cuántas ilusiones de sí mismo, la dificultad de Indetección (0: quien
   * detecta el Ki las descubre) y la RP de las Ilusiones fantasmales (0: no dañan).
   */
  espejismos: number;
  espejismoIndeteccion: number;
  espejismoFantasmal: number;
  /** Armas físicas de Ki: calidad del arma que crea (−1 si no crea ninguna, Dominus p.63). */
  armaKi: number;
  /** Choque físico: la técnica puede interceptar una descarga como una a distancia (Dominus p.65). */
  choqueFisico: boolean;
  apresamiento: number;
  /** Presa existencial: el apresado controla con su Poder y no se libra con transportes (Dominus p.64). */
  presaExistencial: boolean;
  /** Estados sobrenaturales (Dominus p.66): cada uno con su RF. */
  estados: readonly EstadoSobrenatural[];
  /** Interrupción del Ki: RF contra el daño más este valor (Dominus p.69). */
  interrumpe: boolean;
  /** Tipos de interrupción: Ki (lo acumulado y las técnicas activas) y Magia (los conjuros mantenidos). */
  interrumpeKi: boolean;
  interrumpeMagia: boolean;
  interrupcion: number;
  /** Escudo de energía: resistencia del escudo (Dominus p.66). */
  escudo: number;
  /** Regeneración del Escudo o la Acumulación mantenidos: lo que recuperan cada asalto (Dominus p.65-66). */
  regeneraEscudo: number;
  /** Acumulación: PV de pantalla y TA natural 4 (Dominus p.65). */
  pantalla: number;
  regeneraPantalla: number;
  /** Intangibilidad: los ataques que no son de energía lo atraviesan (Dominus p.69). */
  intangible: boolean;
  /** Intangibilidad, ventajas (Dominus p.69-70): Afectar a otros (cuánta Presencia, en veces la suya) y Fusión. */
  intangibleOtros: number;
  fusion: boolean;
  /** Reflectar el ataque: una defensa con éxito lo devuelve (Dominus p.71). */
  reflectar: boolean;
  /** Reflectar, ventajas (Dominus p.71): Elección del blanco y Reflectar habilidades esotéricas. */
  reflectarEligeBlanco: boolean;
  reflectarEsoterico: boolean;
  /** Absorción de Ki: Ki de la técnica rival que absorbe al defenderse con contra (Dominus p.64). */
  absorcionKi: number;
  /** Ataque indirecto: no se puede contraatacar (Dominus p.52). */
  indirecto: boolean;
  /** Daño reducido (desventaja, Dominus p.73): 0.5 mitad de daño, 1 ningún daño. */
  danoReducido: number;
  /** Ataque especializado (desventaja, Dominus p.72): sólo funciona contra esa defensa. */
  soloContra: '' | 'parada' | 'esquiva';
  /** Es un conjuro: no suma los bonos al daño de las armas ni los de la vía de Guerra. */
  conjuro?: boolean;
  /** Invisible para quien no ve la magia: se defiende cegado (conjuros anímicos, Core p.122). */
  invisible?: boolean;
}

/** Estados de la ventaja Estado añadido (Dominus p.67). */
export type NombreEstado =
  | 'ceguera' | 'coma' | 'control' | 'dano' | 'dobleDano' | 'dolor' | 'dolorExtremo' | 'drenajeVida'
  | 'drenajeKi' | 'fascinacion' | 'inconsciencia' | 'miedo' | 'terror' | 'muerte' | 'paralisisParcial'
  | 'paralisisTotal' | 'penalizacionMenor' | 'penalizacionMayor' | 'reduccionCaracteristicas'
  | 'reduccionCaracteristica' | 'reduccionRf' | 'ilusion' | 'debilidad';

/**
 * Condición predeterminada (Dominus p.67-68): Ataque (por defecto) y Contacto físico exigen
 * alcanzarlo; Beso, además, −120 al ataque. Las demás son automáticas, sin tirada de ataque, hasta la
 * Distancia del Efecto; las de varios blancos (o por el aire o la superficie) alcanzan a todos.
 */
export interface EstadoSobrenatural {
  estado: NombreEstado;
  rf: number;
  condicion: 'ataque' | 'contacto' | 'beso' | 'automatico';
  distancia: number;
  varios: boolean;
  /** Reducción de una Característica: cuál. */
  atributo?: Atributo;
}

export const SIN_KI: Readonly<ModKi> = Object.freeze({
  ataque: 0, contraataque: 0, parada: 0, esquiva: 0, sinContra: false, ataqueFijo: 0, defensaFija: 0,
  dano: 0, multDano: 1, sacrificioVital: 0, danoLimite: false, danoFijo: 0, reduccionTA: 0, sinArmadura: false, precision: 0, distancia: 0, proyeccion: false, estela: false, area: 0,
  eleccionBlanco: false, ataquesAdicionales: 0, continuo: false, combo: false, cansancioAnadido: false, adicionalesLimitados: 0, camuflar: 0,
  accionesAdicionales: 0, recuperaAccion: false, prevision: 0, defensasAdicionales: 0, paradaArea: 0, transporte: 0, turno: 0, ta: 0, taInmodificable: false, taFisica: false, lentitud: 0, rotura: 0, entereza: 0, movimiento: 0, acrobacias: 0,
  frialdad: 0, resistirDolor: 0, capacidad: Object.freeze([]) as readonly { atributo: Atributo; bono: number }[], rf: 0, rm: 0, rp: 0,
  visionNocturna: false, veEnergia: false,
  danaEnergia: false, critico: 0, criticoAuto: false, sobrenatural: false, elemento: '', naturaleza: '', marca: 0, impacto: 0,
  atraer: false, apresamiento: 0, presaExistencial: false, choqueFisico: false, espejismos: 0, espejismoIndeteccion: 0, espejismoFantasmal: 0, armaKi: -1, estados: Object.freeze([]) as readonly EstadoSobrenatural[], interrumpe: false, interrumpeKi: false, interrumpeMagia: false,
  interrupcion: 0, escudo: 0, regeneraEscudo: 0, pantalla: 0, regeneraPantalla: 0, intangible: false, intangibleOtros: 0, fusion: false, reflectar: false, reflectarEligeBlanco: false, reflectarEsoterico: false, absorcionKi: 0, indirecto: false,
  danoReducido: 0, soloContra: '',
});

/**
 * Dos conjuntos de efectos sobre una misma acción: de cada efecto vale el mayor (Core p.106). Va por
 * tipo de valor, así un efecto nuevo no hay que agregarlo acá: número, el mayor; sí/no, cualquiera de
 * los dos; texto, el primero que tenga; lista (los Estados añadidos), todos, que se tiran por separado
 * (Dominus p.66).
 */
export function combinar(a: Readonly<ModKi>, b: Readonly<ModKi>): ModKi {
  const r = { ...a } as Record<string, unknown>;
  const x = a as unknown as Record<string, unknown>;
  const y = b as unknown as Record<string, unknown>;
  for (const k of CLAVES.numeros) if ((y[k] as number) > (x[k] as number)) r[k] = y[k];
  for (const k of CLAVES.sino) if (y[k]) r[k] = true;
  for (const k of CLAVES.textos) if (!x[k] && y[k]) r[k] = y[k];
  for (const k of CLAVES.listas) {
    const vb = y[k] as unknown[];
    if (vb.length) r[k] = (x[k] as unknown[]).length ? [...(x[k] as unknown[]), ...vb] : vb;
  }
  // Los campos que no tienen valor por defecto (conjuro, invisible): el que los tenga.
  for (const k of CLAVES.opcionales) if (x[k] === undefined && y[k] !== undefined) r[k] = y[k];
  return r as unknown as ModKi;
}

/** Los campos opcionales de `ModKi` (no están en `SIN_KI`). */
type Opcionales<T> = { [K in keyof T]-?: undefined extends T[K] ? K : never }[keyof T];
/** Todos, uno por uno: un opcional nuevo no compila hasta agregarlo acá (y así se combina). */
const OPCIONALES: Record<Opcionales<ModKi>, true> = { conjuro: true, invisible: true };

/** Las claves de `ModKi` por tipo de valor, sacadas de `SIN_KI` una sola vez (para `combinar`). */
const CLAVES = (() => {
  const c = { numeros: [] as string[], sino: [] as string[], textos: [] as string[], listas: [] as string[], opcionales: Object.keys(OPCIONALES) };
  for (const [k, v] of Object.entries(SIN_KI)) {
    if (typeof v === 'number') c.numeros.push(k);
    else if (typeof v === 'boolean') c.sino.push(k);
    else if (typeof v === 'string') c.textos.push(k);
    else if (Array.isArray(v)) c.listas.push(k);
  }
  return c;
})();

// --------------------------------------------------------------------------- catálogo de efectos

/**
 * Tipo y clase de cada efecto del Dominus (cap. 5) que importa en el cuerpo a cuerpo. Acción: vale
 * para la acción en la que se usa la técnica; Asalto: para todo el asalto. La clase dice a qué acción
 * va atada la técnica: un ataque, un contraataque, una defensa, o cualquiera (Variable).
 */
type Clase = 'ataque' | 'contra' | 'defensa' | 'variable';
interface DefEfecto {
  tipo: 'accion' | 'asalto';
  clase: Clase;
  aplicar: (m: ModKi, valor: number, opciones: string[]) => void;
}

const SUMAR = (campo: keyof ModKi) => (m: ModKi, v: number) => { (m[campo] as number) = Math.max(m[campo] as number, v); };

const CATALOGO: Record<string, DefEfecto> = {
  'habilidad de ataque': { tipo: 'accion', clase: 'ataque', aplicar: SUMAR('ataque') },
  'habilidad de ataque completa': { tipo: 'asalto', clase: 'ataque', aplicar: SUMAR('ataque') },
  'ataque predeterminado': { tipo: 'accion', clase: 'ataque', aplicar: (m, v, o) => { m.ataqueFijo = Math.max(m.ataqueFijo, v || dificultadDeTexto(o)); } },
  'habilidad de contraataque': { tipo: 'accion', clase: 'contra', aplicar: SUMAR('contraataque') },
  'maniobras de combate y apuntar': { tipo: 'accion', clase: 'ataque', aplicar: SUMAR('precision') },
  'maniobras de combate y apuntar reales': { tipo: 'asalto', clase: 'ataque', aplicar: SUMAR('precision') },
  'habilidad de parada': { tipo: 'accion', clase: 'defensa', aplicar: SUMAR('parada') },
  'habilidad de parada completa': { tipo: 'asalto', clase: 'defensa', aplicar: SUMAR('parada') },
  'habilidad de parada limitada': { tipo: 'accion', clase: 'defensa', aplicar: (m, v) => { m.parada = Math.max(m.parada, v); m.sinContra = true; } },
  'habilidad de esquiva': { tipo: 'accion', clase: 'defensa', aplicar: SUMAR('esquiva') },
  'habilidad de esquiva completa': { tipo: 'asalto', clase: 'defensa', aplicar: SUMAR('esquiva') },
  'habilidad de esquiva limitada': { tipo: 'accion', clase: 'defensa', aplicar: (m, v) => { m.esquiva = Math.max(m.esquiva, v); m.sinContra = true; } },
  'defensa predeterminada': { tipo: 'accion', clase: 'defensa', aplicar: (m, v, o) => { m.defensaFija = Math.max(m.defensaFija, v || dificultadDeTexto(o)); } },
  'aumento de dano': { tipo: 'accion', clase: 'ataque', aplicar: aumentoDeDano },
  'aumento de dano real': { tipo: 'asalto', clase: 'ataque', aplicar: SUMAR('dano') },
  'multiplicador al dano': { tipo: 'accion', clase: 'ataque', aplicar: SUMAR('multDano') },
  'multiplicador al dano real': { tipo: 'asalto', clase: 'ataque', aplicar: SUMAR('multDano') },
  'sustitucion de dano': { tipo: 'accion', clase: 'ataque', aplicar: SUMAR('danoFijo') },
  'sustitucion de dano real': { tipo: 'asalto', clase: 'ataque', aplicar: SUMAR('danoFijo') },
  'ataque adicional': { tipo: 'accion', clase: 'ataque', aplicar: (m, v, o) => { SUMAR('ataquesAdicionales')(m, v); opcionesDeAdicionales(m, o); } },
  'ataque adicional limitado': { tipo: 'accion', clase: 'ataque', aplicar: (m, v, o) => { SUMAR('adicionalesLimitados')(m, v); opcionesDeAdicionales(m, o); } },
  'accion adicional': { tipo: 'asalto', clase: 'variable', aplicar: SUMAR('accionesAdicionales') },
  'recuperar accion': { tipo: 'accion', clase: 'variable', aplicar: (m) => { m.recuperaAccion = true; } },
  // A mitad: −45 en vez de −90; Completo: anula la Sorpresa.
  'prevision': { tipo: 'asalto', clase: 'variable', aplicar: (m, _v, o) => { m.prevision = Math.max(m.prevision, hay(o, /complet/) ? 90 : 45); } },
  'camuflar ataque': { tipo: 'accion', clase: 'ataque', aplicar: (m, v, o) => { m.camuflar = Math.max(m.camuflar, v || dificultadDeTexto(o)); } },
  'defensa adicional': { tipo: 'accion', clase: 'defensa', aplicar: SUMAR('defensasAdicionales') },
  'transporte automatico': { tipo: 'accion', clase: 'variable', aplicar: (m, _v, o) => { m.transporte = Math.max(m.transporte, metrosDe(o)); } },
  'parada en area': { tipo: 'accion', clase: 'defensa', aplicar: (m, _v, o) => { m.paradaArea = Math.max(m.paradaArea, metrosDe(o)); } },
  'incrementar turno': { tipo: 'asalto', clase: 'variable', aplicar: SUMAR('turno') },
  'incremento de turno': { tipo: 'asalto', clase: 'variable', aplicar: SUMAR('turno') },
  'aumentar rotura': { tipo: 'asalto', clase: 'ataque', aplicar: SUMAR('rotura') },
  'aumentar entereza': { tipo: 'asalto', clase: 'defensa', aplicar: SUMAR('entereza') },
  'incremento de movimiento': { tipo: 'asalto', clase: 'variable', aplicar: SUMAR('movimiento') },
  'incremento de habilidad': { tipo: 'asalto', clase: 'variable', aplicar: incrementoDeHabilidad },
  'capacidad incrementada': { tipo: 'accion', clase: 'variable', aplicar: capacidadIncrementada },
  'incremento de resistencia magica': { tipo: 'asalto', clase: 'variable', aplicar: SUMAR('rm') },
  'incremento de resistencia psiquica': { tipo: 'asalto', clase: 'variable', aplicar: SUMAR('rp') },
  'habilidades perceptivas': { tipo: 'asalto', clase: 'variable', aplicar: (m, _v, o) => perceptivas(m, o) },
  ...Object.fromEntries(['vision nocturna', 'vision radial', 'vision espiritual', 'vision de magia', 'vision de matrices', 'ver lo sobrenatural', 'ver realmente']
    .map((n): [string, DefEfecto] => [n, { tipo: 'asalto', clase: 'variable', aplicar: (m) => perceptivas(m, [n]) }])),
  'ataque con area': { tipo: 'accion', clase: 'ataque', aplicar: (m, _v, o) => { m.area = Math.max(m.area, metrosDe(o)); if (o.some((x) => /eleccion/.test(normalizarRasgo(x)))) m.eleccionBlanco = true; } },
  'ataque con area real': { tipo: 'asalto', clase: 'ataque', aplicar: (m, v, o) => { m.area = Math.max(m.area, v); if (o.some((x) => /eleccion/.test(normalizarRasgo(x)))) m.eleccionBlanco = true; } },
  'destruir armadura': { tipo: 'accion', clase: 'ataque', aplicar: (m, v, o) => { if (o.some((x) => /sin armadura/.test(normalizarRasgo(x)))) m.sinArmadura = true; else m.reduccionTA = Math.max(m.reduccionTA, v); } },
  'armadura': { tipo: 'asalto', clase: 'defensa', aplicar: armadura },
  'incremento de resistencia fisica': { tipo: 'asalto', clase: 'variable', aplicar: SUMAR('rf') },
  'ataque capaz de danar energia': { tipo: 'accion', clase: 'ataque', aplicar: (m) => { m.danaEnergia = true; } },
  'danar energia': { tipo: 'accion', clase: 'ataque', aplicar: (m) => { m.danaEnergia = true; } },
  'potenciar critico': { tipo: 'accion', clase: 'ataque', aplicar: (m, v, o) => { m.critico = Math.max(m.critico, v); if (hay(o, /automatico/)) m.criticoAuto = true; } },
  'potenciar critico real': { tipo: 'asalto', clase: 'ataque', aplicar: (m, v, o) => { m.critico = Math.max(m.critico, v); if (hay(o, /automatico/)) m.criticoAuto = true; } },
  'ataque sobrenatural': { tipo: 'accion', clase: 'ataque', aplicar: (m) => { m.sobrenatural = true; m.elemento = 'ENE'; } },
  'ataque elemental': { tipo: 'accion', clase: 'ataque', aplicar: (m, _v, o) => { m.elemento = elementoDe(o) || m.elemento; if (hay(o, /oscuridad/)) m.naturaleza = 'oscuridad'; else if (hay(o, /luz/)) m.naturaleza = 'luz'; } },
  'marca': { tipo: 'accion', clase: 'ataque', aplicar: (m, v, o) => { m.marca = Math.max(m.marca, v || (hay(o, /mayor/) ? 50 : 20)); } },
  'marca menor': { tipo: 'accion', clase: 'ataque', aplicar: (m) => { m.marca = Math.max(m.marca, 20); } },
  'marca mayor': { tipo: 'accion', clase: 'ataque', aplicar: (m) => { m.marca = Math.max(m.marca, 50); } },
  'impacto': { tipo: 'accion', clase: 'ataque', aplicar: (m, v, o) => { m.impacto = Math.max(m.impacto, v); if (hay(o, /atraer/)) m.atraer = true; } },
  'espejismo': { tipo: 'asalto', clase: 'variable', aplicar: espejismo },
  'armas fisicas de ki': { tipo: 'asalto', clase: 'variable', aplicar: (m, v) => { m.armaKi = Math.max(m.armaKi, v); } },
  'choque fisico': { tipo: 'accion', clase: 'ataque', aplicar: (m) => { m.choqueFisico = true; } },
  'apresamiento': { tipo: 'accion', clase: 'ataque', aplicar: (m, v, o) => { m.apresamiento = Math.max(m.apresamiento, v); if (hay(o, /existencial/)) m.presaExistencial = true; } },
  'estados sobrenaturales': { tipo: 'accion', clase: 'ataque', aplicar: (m, _v, o) => { m.estados = [...m.estados, ...leerEstados(o)]; } },
  'interrupcion': { tipo: 'accion', clase: 'ataque', aplicar: interrupcion },
  'escudo de energia': { tipo: 'asalto', clase: 'defensa', aplicar: (m, v, o) => { m.escudo = Math.max(m.escudo, v); m.regeneraEscudo = Math.max(m.regeneraEscudo, valorEn(o, /regeneracion/)); } },
  'acumulacion': { tipo: 'asalto', clase: 'defensa', aplicar: (m, v, o) => { m.pantalla = Math.max(m.pantalla, v); m.ta = Math.max(m.ta, 4); m.regeneraPantalla = Math.max(m.regeneraPantalla, valorEn(o, /regeneracion/)); } },
  'intangibilidad': { tipo: 'asalto', clase: 'variable', aplicar: intangibilidad },
  'reflectar el ataque': { tipo: 'accion', clase: 'defensa', aplicar: (m, _v, o) => { m.reflectar = true; if (hay(o, /eleccion/)) m.reflectarEligeBlanco = true; if (hay(o, /esoteric/)) m.reflectarEsoterico = true; } },
  'absorcion de ki': { tipo: 'accion', clase: 'defensa', aplicar: (m, v) => { m.absorcionKi = Math.max(m.absorcionKi, v || Infinity); } },
  'ataque indirecto': { tipo: 'accion', clase: 'ataque', aplicar: (m) => { m.indirecto = true; } },
  // Desventajas que cambian el efecto (Dominus p.72-73).
  'dano reducido': { tipo: 'accion', clase: 'ataque', aplicar: (m, _v, o) => { m.danoReducido = Math.max(m.danoReducido, hay(o, /ningun/) ? 1 : 0.5); } },
  'ningun dano': { tipo: 'accion', clase: 'ataque', aplicar: (m) => { m.danoReducido = 1; } },
  'mitad de dano': { tipo: 'accion', clase: 'ataque', aplicar: (m) => { m.danoReducido = Math.max(m.danoReducido, 0.5); } },
  'ataque especializado': { tipo: 'accion', clase: 'ataque', aplicar: (m, _v, o) => { m.soloContra = hay(o, /esquiva/) ? 'esquiva' : 'parada'; } },
  'ataque a distancia': { tipo: 'accion', clase: 'ataque', aplicar: (m, _v, o) => aDistancia(m, o) },
  'ataque a distancia real': { tipo: 'asalto', clase: 'ataque', aplicar: (m, _v, o) => aDistancia(m, o) },
};

/** Otros nombres con que el libro escribe algunos efectos ("Turno +50", "Apuntar -50", "Estado sobrenatural"). */
const ALIAS: Record<string, string> = {
  'estado sobrenatural': 'estados sobrenaturales', 'estados sobrenatural': 'estados sobrenaturales',
  'apuntar': 'maniobras de combate y apuntar', 'maniobras de combate': 'maniobras de combate y apuntar',
  'turno': 'incrementar turno', 'bono al turno': 'incrementar turno',
  'bono a la esquiva': 'habilidad de esquiva', 'bono a la parada': 'habilidad de parada', 'bono al ataque': 'habilidad de ataque',
  'critico': 'potenciar critico', 'ataque en area': 'ataque con area', 'interrupcion rf dano': 'interrupcion',
  'apresamiento presa': 'apresamiento', 'ataque': 'habilidad de ataque', 'multiplicacion de dano': 'multiplicador al dano', 'ataque camuflado': 'camuflar ataque',
  'ataques adicionales': 'ataque adicional', 'ataques adicionales limitados': 'ataque adicional limitado',
};
for (const [a, b] of Object.entries(ALIAS)) CATALOGO[a] = CATALOGO[b];
Object.assign(CATALOGO, {
  // Ventajas sueltas de otro efecto de la misma técnica.
  'ataque continuo': { tipo: 'accion', clase: 'ataque', aplicar: (m: ModKi) => { m.continuo = true; } },
  'sin armadura': { tipo: 'accion', clase: 'ataque', aplicar: (m: ModKi) => { m.sinArmadura = true; } },
  // "Daño x3" multiplica; "Daño +50" suma.
  'dano': { tipo: 'accion', clase: 'ataque', aplicar: (m: ModKi, v: number, o: string[]) => { if (o.some((x) => /^x/i.test(x.trim()))) m.multDano = Math.max(m.multDano, v); else m.dano = Math.max(m.dano, v); } },
  'eleccion de blanco': { tipo: 'accion', clase: 'ataque', aplicar: (m: ModKi) => { m.eleccionBlanco = true; } },
  'prevision completa': { tipo: 'asalto', clase: 'variable', aplicar: (m: ModKi) => { m.prevision = 90; } },
  'ilusion fantasmal': { tipo: 'asalto', clase: 'variable', aplicar: (m: ModKi, v: number) => { m.espejismoFantasmal = Math.max(m.espejismoFantasmal, v); } },
  'ilusiones fantasmales': { tipo: 'asalto', clase: 'variable', aplicar: (m: ModKi, v: number) => { m.espejismoFantasmal = Math.max(m.espejismoFantasmal, v); } },
} satisfies Record<string, DefEfecto>);

/**
 * Lo que la planilla o el libro anotan junto a los efectos y no es uno: cómo se mantiene o combina, y
 * las ventajas que sólo bajan el coste (el coste ya viene en la planilla).
 */
const PROPIEDADES = /^(mantenida|mantenido|combinable|sostenimiento( menor| mayor)?|reduccion de ki|ninguna|afinidad elemental|requerimiento)/;

/** Ventajas y desventajas de Ataque adicional (Dominus p.56). */
function opcionesDeAdicionales(m: ModKi, o: string[]) {
  if (hay(o, /continuo/)) m.continuo = true;
  if (hay(o, /combo/)) m.combo = true;
  if (hay(o, /cansancio/)) m.cansancioAnadido = true;
}

/** Niveles de dificultad (Core p.48), del más fácil al más difícil. */
export const DIFICULTADES: readonly [nombre: RegExp, valor: number][] = [
  [/rutinari/, 20], [/facil/, 40], [/media/, 80], [/muy dificil/, 140], [/dificil/, 120], [/absurd/, 180],
  [/casi imposible/, 240], [/imposible/, 280], [/inhuman/, 320], [/zen/, 440],
];

function dificultadDeTexto(o: string[]): number {
  for (const x of o) {
    const n = normalizarRasgo(x);
    for (const [re, v] of DIFICULTADES) if (re.test(n)) return v;
  }
  return 0;
}

/** La dificultad un nivel por debajo (Media → Fácil…); para quien ya conoce el truco (Dominus p.52). */
export function nivelMenos(dificultad: number): number {
  const valores = [...new Set(DIFICULTADES.map(([, v]) => v))].sort((a, b) => a - b);
  let previo = 0;
  for (const v of valores) {
    if (v >= dificultad) return previo;
    previo = v;
  }
  return previo;
}

function hay(opciones: string[], re: RegExp): boolean {
  return opciones.some((x) => re.test(normalizarRasgo(x)));
}

/** Armadura con sus ventajas: Inmodificable, Armadura física y Lentitud (Dominus p.60-61). */
function armadura(m: ModKi, v: number, o: string[]) {
  m.ta = Math.max(m.ta, v);
  if (hay(o, /inmodificable/)) m.taInmodificable = true;
  if (hay(o, /armadura fisica|fisica/)) m.taFisica = true;
  if (hay(o, /lentitud/)) m.lentitud = Math.max(m.lentitud, v);
}

/** Incremento de habilidad: sólo las secundarias que usa el combate; las demás no hacen nada acá. */
function incrementoDeHabilidad(m: ModKi, v: number, o: string[]) {
  if (hay(o, /acrobacia/)) m.acrobacias = Math.max(m.acrobacias, v);
  else if (hay(o, /frialdad/)) m.frialdad = Math.max(m.frialdad, v);
  else if (hay(o, /resistir (el )?dolor/)) m.resistirDolor = Math.max(m.resistirDolor, v);
}

const NOMBRE_ATRIBUTO: [RegExp, Atributo][] = [
  [/fuerza/, 'FUE'], [/destreza/, 'DES'], [/agilidad/, 'AGI'], [/constitucion/, 'CON'], [/poder/, 'POD'],
  [/voluntad/, 'VOL'], [/inteligencia/, 'INT'], [/percepcion/, 'PER'],
];

/** Capacidad incrementada: "Destreza +6" (Dominus p.61). */
function capacidadIncrementada(m: ModKi, v: number, o: string[]) {
  const a = NOMBRE_ATRIBUTO.find(([re]) => hay(o, re))?.[1];
  if (a && v) m.capacidad = [...m.capacidad, { atributo: a, bono: v }];
}

/** Habilidades perceptivas: las que cambian algo en combate (Dominus p.62). */
function perceptivas(m: ModKi, o: string[]) {
  if (hay(o, /vision nocturna/)) m.visionNocturna = true;
  if (hay(o, /ver lo sobrenatural|ver realmente/)) m.veEnergia = true;
}

/** Incremento de habilidad: por encima de 200, el resto del bono va a la mitad (Dominus p.61). */
export function conIncremento(base: number, bono: number): number {
  if (!bono) return base;
  const total = base + bono;
  return total <= 200 ? total : Math.max(base, 200) + Math.floor((total - Math.max(base, 200)) / 2);
}

/**
 * Aumento de daño con sus ventajas (Dominus p.54): Sacrificio vital (1 por PV), vital doble o de
 * salud (2 por PV), y Daño límite. El de Características no se simula: la planilla trae los valores
 * finales y no se recalculan al perder atributos.
 */
function aumentoDeDano(m: ModKi, _v: number, o: string[]) {
  const sinVentajas = o.filter((x) => !/sacrificio|limite/.test(normalizarRasgo(x)));
  m.dano = Math.max(m.dano, valorDe(sinVentajas));
  if (hay(o, /sacrificio (vital doble|de salud)/)) m.sacrificioVital = 2;
  else if (hay(o, /sacrificio vital/)) m.sacrificioVital = Math.max(m.sacrificioVital, 1);
  if (hay(o, /dano limite/)) m.danoLimite = true;
}

/** Interrupción y sus tipos (Dominus p.69): Ki, Magia (las Habilidades psíquicas no se simulan). Sin tipo, Ki. */
function interrupcion(m: ModKi, v: number, o: string[]) {
  m.interrumpe = true;
  m.interrupcion = Math.max(m.interrupcion, v);
  const magia = hay(o, /magia/), psiquica = hay(o, /psiquic/);
  if (hay(o, /\bki\b/) || (!magia && !psiquica)) m.interrumpeKi = true;
  if (magia) m.interrumpeMagia = true;
}

/** Intangibilidad y sus ventajas (Dominus p.69-70). */
function intangibilidad(m: ModKi, _v: number, o: string[]) {
  m.intangible = true;
  if (hay(o, /presencia extendida/)) m.intangibleOtros = 5;
  else if (hay(o, /afectar a otros|presencia simple/)) m.intangibleOtros = Math.max(m.intangibleOtros, 1);
  if (hay(o, /fusion/)) m.fusion = true;
}

/** Espejismo: cuántos, con Indetección (su dificultad) e Ilusiones fantasmales (la RP) (Dominus p.65-66). */
function espejismo(m: ModKi, _v: number, o: string[]) {
  const ventaja = /deteccion|indeteccion|fantasmal|rp|aspecto/;
  m.espejismos = Math.max(m.espejismos, valorDe(o.filter((x) => !ventaja.test(normalizarRasgo(x)))) || 1);
  const ind = o.filter((x) => /deteccion|indeteccion/.test(normalizarRasgo(x)));
  if (ind.length) m.espejismoIndeteccion = Math.max(m.espejismoIndeteccion, dificultadDeTexto(ind));
  m.espejismoFantasmal = Math.max(m.espejismoFantasmal, valorEn(o, /fantasmal|\brp\b/));
}

/** El número de la opción que dice `re` ("Regeneración 100" → 100), o 0. */
function valorEn(opciones: string[], re: RegExp): number {
  const o = opciones.find((x) => re.test(normalizarRasgo(x)));
  return o ? valorDe([o]) : 0;
}

/**
 * Técnica de Apresamiento Mantenida: mientras la mantiene, sostiene la presa con el valor de la técnica
 * (Dominus p.65). 0 si no mantiene ninguna.
 */
export function apresamientoMantenido(l: Luchador): number {
  let v = 0;
  if (l.ki) for (const t of l.ki.mantenidas.keys()) v = Math.max(v, efectosDe(t).accion.apresamiento);
  return v;
}

/** Ataque a distancia: el alcance y las ventajas Proyección y Estela de destrucción (Dominus p.57-58). */
function aDistancia(m: ModKi, o: string[]) {
  m.distancia = Math.max(m.distancia, metrosDe(o));
  if (hay(o, /proyeccion/)) m.proyeccion = true;
  if (hay(o, /estela/)) m.estela = true;
}

/** Ataque elemental (Dominus p.63): Fuego CAL, Aire ELE, Agua FRI; Tierra elige FIL, CON o PEN; Luz y Oscuridad, ENE. */
function elementoDe(opciones: string[]): TipoAtaque | '' {
  for (const x of opciones) {
    const n = normalizarRasgo(x);
    const tipo = /\b(fil|con|pen|cal|ele|fri|ene)\b/.exec(n);
    if (tipo) return tipo[1].toUpperCase() as TipoAtaque;
    if (/fuego/.test(n)) return 'CAL';
    if (/aire/.test(n)) return 'ELE';
    if (/agua/.test(n)) return 'FRI';
    if (/tierra/.test(n)) return 'CON';
    if (/luz|oscuridad/.test(n)) return 'ENE';
  }
  return '';
}

/** Nombres de los Estados añadidos, de más largo a más corto para que "dolor extremo" no sea "dolor". */
const NOMBRES_ESTADO: [RegExp, NombreEstado][] = [
  [/doble dano/, 'dobleDano'], [/drenaje de vida/, 'drenajeVida'], [/drenaje de ki/, 'drenajeKi'],
  [/dolor extremo/, 'dolorExtremo'], [/dolor/, 'dolor'], [/paraliza\w* (total|completa)/, 'paralisisTotal'],
  [/paraliza\w* parcial/, 'paralisisParcial'], [/penaliza\w* .*mayor/, 'penalizacionMayor'],
  [/penaliza\w*/, 'penalizacionMenor'], [/reduccion de caracteristicas/, 'reduccionCaracteristicas'],
  [/reduccion de (una )?caracteristica/, 'reduccionCaracteristica'], [/reduccion de rf/, 'reduccionRf'],
  [/ceguera/, 'ceguera'], [/coma/, 'coma'], [/control/, 'control'], [/fascinacion/, 'fascinacion'],
  [/ilusion/, 'ilusion'], [/inconsciencia/, 'inconsciencia'], [/terror/, 'terror'], [/miedo/, 'miedo'],
  [/muerte/, 'muerte'], [/^dano\b/, 'dano'],
];

/**
 * Estados sobrenaturales (Dominus p.66-68) a partir de sus opciones: la Resistencia ("RF 120" o un
 * número), los Estados añadidos, la Condición predeterminada y la Distancia del Efecto ("25 metros").
 */
function leerEstados(opciones: string[]): EstadoSobrenatural[] {
  let rf = 0;
  let condicion: EstadoSobrenatural['condicion'] = 'ataque';
  let distancia = 0;
  let varios = false;
  const estados: { estado: NombreEstado; atributo?: Atributo }[] = [];
  for (const x of opciones) {
    const n = normalizarRasgo(x);
    const metros = /(\d+)\s*(m\b|metro)/.exec(n);
    if (metros) {
      distancia = Number(metros[1]);
      continue;
    }
    if (/contacto fisico/.test(n)) condicion = 'contacto';
    else if (/beso/.test(n)) condicion = 'beso';
    else if (/visual|sonido|aire|superficie/.test(n)) {
      condicion = 'automatico';
      if (/varios|aire|superficie/.test(n)) varios = true;
    } else if (/^(condicion: )?ataque$/.test(n)) condicion = 'ataque';
    else {
      const nombre = NOMBRES_ESTADO.find(([re]) => re.test(n))?.[1];
      const num = /(\d+)/.exec(n);
      if (nombre) {
        const atributo = /\b(agi|con|des|fue|int|per|pod|vol)\b/.exec(n)?.[1].toUpperCase() as Atributo | undefined;
        estados.push({ estado: nombre, atributo });
      } else if (num && (/^rf\b|resistencia/.test(n) || /^\d+$/.test(n))) rf = Number(num[1]);
    }
  }
  return estados.map((e) => ({ ...e, rf, condicion, distancia, varios }));
}

/** "+50" → 50, "x3" → 3, "-4 TA" → 4, "TA 4" → 4, "5 metros de radio" → 5, "Absurdo (180)" → 180. */
function valorDe(opciones: string[]): number {
  for (const crudo of opciones) {
    // "1.000" es mil.
    const o = crudo.replace(/(\d)\.(\d{3})/g, '$1$2');
    const entre = /\((\d+)\)/.exec(o);
    if (entre) return Number(entre[1]);
    const n = /(\d+)/.exec(o);
    if (n) return Number(n[1]);
  }
  return 0;
}

/** Un radio o una distancia en metros: "25 metros" → 25, "1 kilómetro" → 1000. */
function metrosDe(opciones: string[]): number {
  return valorDe(opciones) * (opciones.some((o) => /kil[oó]metro|\bkm\b/i.test(o)) ? 1000 : 1);
}

export interface EfectosTecnica {
  /** Efectos de tipo Acción: valen para la acción en la que se ejecuta. */
  accion: ModKi;
  /** Efectos de tipo Asalto: valen para todo el asalto en que se ejecuta. */
  asalto: ModKi;
  /** A qué acción va atada: un ataque, un contraataque, una defensa o ninguna en particular. */
  clase: Clase;
  /** Efectos que el simulador no conoce (se registran y se ignoran). */
  desconocidos: string[];
  /** Tiene Estados de condición automática: se usa como acción propia, sin tirada de ataque. */
  automatico: boolean;
  desventajas: Desventajas;
}

/** Desventajas que importan en combate (Dominus p.71-74); las demás son de ambientación. */
export interface Desventajas {
  /** Agotamiento: cansancio que gasta al ejecutarla, sin bono. */
  agotamiento: number;
  /** Exceso de energía: pierde otra vez su coste al ejecutarla. */
  exceso: boolean;
  /** Penalizador a toda Acción al terminarla: baja 10 por asalto. */
  penalizador: number;
  /** Circunstancia límite: sólo con la mitad de PV, un cuarto, PV negativos o tras recibir daño. */
  circunstancia: '' | 'mitad' | 'cuarto' | 'negativos' | 'dano';
  /** Circunstancia de combate: el blanco tiene que estar así (todas las elegidas), o la técnica no hace nada. */
  circunstanciasCombate: readonly CircunstanciaCombate[];
  /** Atada a un arma: sin ella empuñada no la puede usar. */
  atadaArma: boolean;
  /** Compleja: +2 al índice de pifia de la acción. */
  compleja: boolean;
  /** Condiciones que el simulador puede ver: Desenvainar (el arma envainada) y En carga. */
  desenvainar: boolean;
  enCarga: boolean;
  /** Defensa especializada: sólo da sus efectos contra esa clase de ataque. */
  defensaContra: '' | 'fisico' | 'proyectil' | 'ki' | 'conjuro' | 'psiquico';
  /** Pérdida del arma: al ejecutarla se destroza el arma. */
  perdidaArma: boolean;
  /** Predeterminación: hay que declararla al empezar a acumular, un asalto antes, y usarla en cuanto se pueda. */
  predeterminada: boolean;
  /** Sacrificio: PV que pierde al ejecutarla (Infinity: Completo, hasta 0). */
  sacrificioPv: number;
  /** Sacrificio de Características: pierde un punto de esa característica cada vez. */
  sacrificioAtributo: Atributo | '';
  /** Sin defensa: no puede defenderse en el asalto en que la ejecuta (ni ejecutarla si ya se defendió). */
  sinDefensa: boolean;
  /** Sobrecarga: asaltos que tiene que esperar para ejecutar otras técnicas. */
  sobrecarga: number;
  /** Técnica final: muere al terminar de usarla. */
  final: boolean;
  /** Técnica mantenida: necesita tener mantenida la técnica de ese nombre. */
  requiereMantenida: string;
  /** Usos limitados: cuántas veces se puede usar (en el combate, el simulador no sabe las de antes). */
  usos: number;
}

export type CircunstanciaCombate = 'derribado' | 'apresado' | 'espalda' | 'sorprendido' | 'cegado';

const SIN_DESVENTAJAS: Desventajas = Object.freeze({
  agotamiento: 0, exceso: false, penalizador: 0, circunstancia: '', circunstanciasCombate: Object.freeze([]) as readonly CircunstanciaCombate[],
  atadaArma: false, compleja: false, desenvainar: false, enCarga: false, defensaContra: '', perdidaArma: false, predeterminada: false,
  sacrificioPv: 0, sacrificioAtributo: '', sinDefensa: false, sobrecarga: 0, final: false, requiereMantenida: '', usos: 0,
} as Desventajas);

/**
 * Desventajas que no cambian nada en el simulador: de creación (Atadura elemental) o de lo que no
 * modela (el día y la noche, el terreno, volar, ir montado, prepararse antes, las Intensidades
 * cercanas, contra qué clase de ser). Se dan por cumplidas.
 */
const DESVENTAJAS_SIN_EFECTO = /^(atadura elemental|hacia (un elemento|dos afines)|exterminador|contra (seres humanoides|una clase|un ser)|preparacion previa|requerimientos? elementales?|intensidad (simple|mayor)|condiciones|en vuelo|montado|diurno|nocturno|terreno determinado|en un momento concreto)/;

/** Lee una desventaja de combate, o false si el nombre no es una. */
function leerDesventaja(d: Desventajas, nombre: string, opciones: string[]): boolean {
  const todo = [nombre, ...opciones.map(normalizarRasgo)].join(' ');
  if (nombre.startsWith('agotamiento')) d.agotamiento = valorDe(opciones) || valorDe([nombre]) || 1;
  else if (nombre.startsWith('exceso de energia')) d.exceso = true;
  else if (nombre.startsWith('penalizador a toda accion')) d.penalizador = valorDe(opciones) || valorDe([nombre]);
  else if (/circunstancia limite|mitad de pv|cuarta parte de pv|pv negativos|recibir dano/.test(nombre)) {
    d.circunstancia = /cuarta/.test(todo) ? 'cuarto' : /negativos/.test(todo) ? 'negativos' : /recibir/.test(todo) ? 'dano' : 'mitad';
  } else if (nombre.startsWith('circunstancia de combate')) {
    const c = (['derribado', 'apresado', 'espalda', 'sorprendido', 'cegado'] as const).filter((x) => todo.includes(x === 'sorprendido' ? 'sorpre' : x === 'espalda' ? 'espalda' : x));
    d.circunstanciasCombate = [...d.circunstanciasCombate, ...c];
  } else if (nombre.startsWith('atada a un arma')) d.atadaArma = true;
  else if (nombre.startsWith('compleja')) d.compleja = true;
  else if (/^(condiciones.*)?desenvainar/.test(todo)) d.desenvainar = true;
  else if (/^(condiciones.*)?en carga/.test(todo)) d.enCarga = true;
  else if (nombre.startsWith('defensa especializada') || nombre.startsWith('solo contra ataques fisicos') || nombre.startsWith('solo contra proyectiles') ||
    nombre.startsWith('solo contra tecnicas') || nombre.startsWith('solo contra conjuros') || nombre.startsWith('solo contra disciplinas')) {
    d.defensaContra = /fisico/.test(todo) ? 'fisico' : /proyectil/.test(todo) ? 'proyectil' : /tecnica|ki\b/.test(todo) ? 'ki' : /conjuro/.test(todo) ? 'conjuro' : 'psiquico';
  } else if (nombre.startsWith('perdida del arma')) d.perdidaArma = true;
  else if (/^predetermina(cion|da|do)/.test(nombre)) d.predeterminada = true;
  else if (nombre.startsWith('sacrificio de caracteristica')) d.sacrificioAtributo = NOMBRE_ATRIBUTO.find(([re]) => re.test(todo))?.[1] ?? '';
  else if (nombre.startsWith('sacrificio')) d.sacrificioPv = /completo/.test(todo) ? Infinity : valorDe(opciones) || valorDe([nombre]);
  else if (nombre.startsWith('sin defensa')) d.sinDefensa = true;
  else if (nombre.startsWith('sobrecarga')) d.sobrecarga = valorDe(opciones) || valorDe([nombre]) || 1;
  else if (nombre.startsWith('tecnica final')) d.final = true;
  else if (nombre.startsWith('tecnica mantenida')) d.requiereMantenida = normalizarRasgo(opciones.find((o) => !/^\d|nivel/.test(normalizarRasgo(o))) ?? '');
  else if (nombre.startsWith('usos limitados')) d.usos = valorDe(opciones) || valorDe([nombre]) || 1;
  else if (DESVENTAJAS_SIN_EFECTO.test(nombre)) return true;
  else return false;
  return true;
}

const efectosCache = new WeakMap<Tecnica, EfectosTecnica>();

/**
 * Un efecto escrito como en el libro, con el valor en el nombre ("Armadura 4", "1 Espejismo",
 * "Ataque a distancia 100 metros", "Armas físicas de Ki calidad +10"): el valor pasa a las opciones.
 */
function conValorAparte(e0: EfectoTecnica): EfectoTecnica {
  if (CATALOGO[normalizarRasgo(e0.nombre)]) return e0;
  // El nivel de la técnica ("Nv 3", "Nº 2") no es parte del efecto.
  const e = { ...e0, nombre: e0.nombre.replace(/\s+n(v|º)\s*º?\s*\d+$/i, '') };
  if (CATALOGO[normalizarRasgo(e.nombre)]) return e;
  // Una dificultad al final ("Camuflar ataque Inhumano", "Ataque Predeterminado Zen").
  const dif = /^(.+?)\s+(rutinari[oa]|f[aá]cil|media|dif[ií]cil|muy dif[ií]cil|absurdo|casi imposible|imposible|inhumano|zen)$/i.exec(e.nombre);
  if (dif && CATALOGO[normalizarRasgo(dif[1])]) return { ...e, nombre: dif[1], opciones: [dif[2], ...e.opciones] };
  const delante = /^([+\-]?\d+)\s+(.+)$/.exec(e.nombre);
  const detras = /^(.+?)\s+((?:calidad\s+|rf\s+|presa\s+)?[+\-x]?\s?\d[\d.]*(?:\s*(?:metros?|kil[oó]metros?|km|pv|rf|ta))?)$/i.exec(e.nombre);
  const [nombre, valor] = delante ? [delante[2], delante[1]] : detras ? [detras[1], detras[2]] : [e.nombre, ''];
  return valor && CATALOGO[normalizarRasgo(nombre)] ? { ...e, nombre, opciones: [valor, ...e.opciones] } : e;
}

/** Efectos de una técnica, ya interpretados. */
export function efectosDe(t: Tecnica): EfectosTecnica {
  let r = efectosCache.get(t);
  if (r) return r;
  const accion: ModKi = { ...SIN_KI };
  const asalto: ModKi = { ...SIN_KI };
  const clases = new Set<Clase>();
  const desconocidos: string[] = [];
  let desventajas = SIN_DESVENTAJAS;
  for (const e0 of t.efectos) {
    const e = conValorAparte(e0);
    const nombre = normalizarRasgo(e.nombre);
    const def = CATALOGO[nombre];
    if (!def) {
      if (PROPIEDADES.test(nombre)) continue;
      const d = { ...desventajas };
      if (leerDesventaja(d, nombre, e.opciones)) desventajas = d;
      else desconocidos.push(e.nombre);
      continue;
    }
    def.aplicar(def.tipo === 'accion' ? accion : asalto, valorDe(e.opciones), e.opciones);
    clases.add(def.clase);
  }
  // Una técnica con efectos de Ataque es ofensiva aunque tenga otros (Dominus p.48: Variable se ata
  // a la acción de los demás efectos).
  const clase: Clase = clases.has('ataque') ? 'ataque' : clases.has('contra') ? 'contra' : clases.has('defensa') ? 'defensa' : 'variable';
  const automatico = accion.estados.some((x) => x.condicion === 'automatico');
  r = { accion, asalto, clase, desconocidos, automatico, desventajas };
  efectosCache.set(t, r);
  return r;
}

// --------------------------------------------------------------------------- combinadas y forzadas

/** Técnicas reales que forman una combinada o forzada (la propia, si es una técnica de la ficha). */
const partes = new WeakMap<Tecnica, Tecnica[]>();

export function partesDe(t: Tecnica): Tecnica[] {
  return partes.get(t) ?? [t];
}

/** Alguna de sus partes ya está mantenida: no se vuelve a ejecutar. */
export function enUso(e: EstadoKi, t: Tecnica): boolean {
  for (const p of partesDe(t)) if (e.mantenidas.has(p)) return true;
  return false;
}

/**
 * Técnicas Combinables usadas a la vez en una sola acción (Dominus p.49): suman sus costes y reúnen
 * sus efectos, pero los efectos iguales no se suman; vale el más alto (`efectosDe` ya toma el mayor).
 */
function combinada(ts: Tecnica[]): Tecnica {
  const coste: Partial<Record<CaracteristicaKi, number>> = {};
  for (const t of ts) for (const c of CARACTERISTICAS_KI) if (t.coste[c]) coste[c] = (coste[c] ?? 0) + t.coste[c]!;
  const v: Tecnica = {
    nombre: ts.map((t) => t.nombre).join(' + '),
    nivel: Math.max(...ts.map((t) => t.nivel)) as Tecnica['nivel'],
    cm: ts.reduce((s, t) => s + t.cm, 0),
    coste,
    mantenimiento: ts.reduce((s, t) => s + t.mantenimiento, 0),
    combinable: true,
    efectos: ts.flatMap((t) => t.efectos),
  };
  partes.set(v, ts);
  return v;
}

/**
 * Forzar Técnicas (Dominus p.21): sube cada efecto la mitad de su valor hacia abajo (+100 → +150,
 * 5 ataques adicionales → 7) y un punto el multiplicador al daño. Las dificultades de RF, +40.
 */
/** Números de `ModKi` que no son la potencia de un efecto: no suben al forzar. */
const NO_ESCALAN: ReadonlySet<keyof ModKi> = new Set(['danoReducido', 'interrupcion', 'sacrificioVital', 'intangibleOtros']);

function escalar(m: ModKi): ModKi {
  const r: ModKi = { ...m };
  for (const k of Object.keys(r) as (keyof ModKi)[]) {
    const v = r[k];
    if (typeof v !== 'number' || v <= 0 || NO_ESCALAN.has(k) || v === Infinity) continue;
    (r[k] as number) = k === 'multDano' ? (v > 1 ? v + 1 : v) : v + Math.floor(v / 2);
  }
  // Las dificultades de Resistencia suben 40 (la de Interrupción también, aunque no tenga valor fijo).
  if (r.interrumpe) r.interrupcion += 40;
  if (r.estados.length) r.estados = r.estados.map((x) => ({ ...x, rf: x.rf + 40 }));
  return r;
}

/**
 * Técnica forzada: acumula el doble de cada coste. Una mantenida se fuerza sólo en el asalto en que
 * se ejecuta; en los siguientes se mantiene la técnica normal (`ejecutar` mantiene las partes).
 */
function forzada(t: Tecnica): Tecnica {
  const coste: Partial<Record<CaracteristicaKi, number>> = {};
  for (const c of CARACTERISTICAS_KI) if (t.coste[c]) coste[c] = 2 * t.coste[c]!;
  const v: Tecnica = { ...t, nombre: `${t.nombre} (forzada)`, coste };
  partes.set(v, partesDe(t));
  const ef = efectosDe(t);
  efectosCache.set(v, { ...ef, accion: escalar(ef.accion), asalto: escalar(ef.asalto) });
  return v;
}

/** Subconjuntos de 2 o más (hasta 3) de las combinables. */
function combinaciones(ts: Tecnica[]): Tecnica[][] {
  const r: Tecnica[][] = [];
  for (let i = 0; i < ts.length; i++)
    for (let j = i + 1; j < ts.length; j++) {
      r.push([ts[i], ts[j]]);
      for (let k = j + 1; k < ts.length; k++) r.push([ts[i], ts[j], ts[k]]);
    }
  return r;
}

const repertorios = new WeakMap<Ficha, Tecnica[]>();

/** Todo lo que puede ejecutar: sus técnicas, las combinaciones de las combinables y, si sabe, forzadas. */
export function repertorio(f: Ficha): Tecnica[] {
  let r = repertorios.get(f);
  if (r) return r;
  const base = f.ki?.tecnicas ?? [];
  r = [...base, ...combinaciones(base.filter((t) => t.combinable)).map(combinada)];
  if (habilidadesKi(f).forzar) r = [...r, ...r.map(forzada)];
  repertorios.set(f, r);
  return r;
}

// --------------------------------------------------------------------------- habilidades del Ki

/**
 * Habilidades del Ki que se usan en combate (Core p.103-105, Dominus p.19-22). Las de bono fijo
 * (Armadura de energía TA 2, Daño y Velocidad incrementados, Extensión del aura) ya vienen sumadas en
 * la planilla, igual que la Armadura de energía mayor y la arcana a TA 4 (ver `ajusteTaEnergia`).
 */
export interface HabilidadesKi {
  /** Armadura de energía mayor: TA 4 contra energía pagando 1 de Ki cada 5 asaltos (Dominus p.19). */
  armaduraMayor: boolean;
  /** Armadura de energía arcana: TA 4 gratis; TA 6 pagando 1 de Ki cada 5 asaltos (Dominus p.19). */
  armaduraArcana: boolean;
  /** Recuperación: 1 de cansancio por cada 5 de Ki, uno por asalto (Core p.105). */
  recuperacion: boolean;
  /** Aura de combate (Dominus p.21). */
  aura: boolean;
  /** Absorción de energía: 1 de Ki por cada 5 de daño plenamente energético (Dominus p.20). */
  absorcion: boolean;
  /** PV que cura cada punto de Ki: 2 con Curación por Ki (Core p.104), 5 con la superior (Dominus p.20). */
  curacion: number;
  /**
   * Aumento de características: cuántos puntos puede subir (3; 4 con Incremento superior) y cada
   * cuántos asaltos paga 1 de Ki para mantenerlo (1; 10 con Incremento superior). Core p.105,
   * Dominus p.21. 0 si no la tiene.
   */
  aumento: number;
  asaltosPorPagoAumento: number;
  /** Destrucción por Ki (Core p.104). */
  destruccion: boolean;
  /** Forzar Técnicas: el doble de Ki por la mitad más de efecto (Dominus p.21). */
  forzar: boolean;
}

const habilidades = new WeakMap<Ficha, HabilidadesKi>();

export function habilidadesKi(f: Ficha): HabilidadesKi {
  let h = habilidades.get(f);
  if (!h) {
    const hk = f.rasgos?.habilidadesKi;
    // La planilla las abrevia: "Armadura mayor", "Arm. arcana".
    const arcana = tiene(hk, 'armadura de energia arcana') || tiene(hk, 'arm. arcana') || tiene(hk, 'armadura arcana');
    h = {
      armaduraMayor: arcana || tiene(hk, 'armadura de energia mayor') || tiene(hk, 'armadura mayor'),
      armaduraArcana: arcana,
      recuperacion: tiene(hk, 'recuperacion'),
      aura: tiene(hk, 'aura de combate'),
      absorcion: tiene(hk, 'absorcion de energia'),
      curacion: tiene(hk, 'curacion superior') ? 5 : tiene(hk, 'curacion por ki') ? 2 : 0,
      aumento: tiene(hk, 'incremento superior') ? 4 : tiene(hk, 'aumento de caracteristicas') ? 3 : 0,
      asaltosPorPagoAumento: tiene(hk, 'incremento superior') ? 10 : 1,
      destruccion: tiene(hk, 'destruccion por ki'),
      forzar: tiene(hk, 'forzar tecnicas'),
    };
    habilidades.set(f, h);
  }
  return h;
}

/** PV que todavía se le pueden curar con Ki: nunca más de la mitad del daño sufrido (Core p.104). */
export function curable(l: Luchador): number {
  return Math.max(0, Math.min(Math.floor(l.stats.danoRecibido / 2) - l.curado, l.ficha.pv - l.pv));
}

/** Características que sube Aumento de características y que cambian el combate. */
export type AtributoAumento = 'AGI' | 'CON' | 'DES' | 'FUE';

/**
 * La ficha con una característica subida o bajada de `desde` a `hasta` (Aumento de características,
 * Core p.105): se recalculan los bonos que dependen de ella (Core p.13, Tabla 3). DES: ataque y
 * parada; AGI: esquiva y Tipo de movimiento; AGI y DES: turno; FUE: daño (el doble a dos manos,
 * redondeado en grupos de 10 hacia arriba, Core p.73); CON: RF y Constitución. Sobre la ficha actual,
 * así no se pierde lo que haya cambiado mientras tanto (un arma mellada).
 */
export function fichaConAumento(f: Ficha, a: AtributoAumento, desde: number, hasta: number): Ficha {
  const d = bonoCaracteristica(hasta) - bonoCaracteristica(desde);
  const atributos = { ...f.atributos, [a]: hasta };
  const esquiva = f.tipoDefensa === 'esquiva';
  const dos = tamanoArmaDe(f) === 'G' ? 2 : 1;
  const dano = (x: number) => (a === 'FUE' ? Math.max(0, Math.ceil((x + d * dos) / 10) * 10) : x);
  const ataque = a === 'DES' ? d : 0;
  const defensa = (a === 'DES' && !esquiva) || (a === 'AGI' && esquiva) ? d : 0;
  const turno = a === 'DES' || a === 'AGI' ? d : 0;
  const s = f.sinArmas;
  return {
    ...f, atributos,
    ataque: f.ataque + ataque, defensa: f.defensa + defensa, turno: f.turno + turno, danoBase: dano(f.danoBase),
    rf: f.rf + (a === 'CON' ? d : 0),
    constitucion: a === 'CON' ? hasta : f.constitucion,
    tipoMovimiento: a === 'AGI' ? f.tipoMovimiento + (hasta - desde) : f.tipoMovimiento,
    sinArmas: s && {
      ...s, ataque: s.ataque + ataque, danoBase: dano(s.danoBase), turno: s.turno + turno,
      defensa: s.defensa + ((a === 'DES' && s.tipoDefensa !== 'esquiva') || (a === 'AGI' && s.tipoDefensa === 'esquiva') ? d : 0),
    },
  };
}

/**
 * Dificultad de la RF contra Destrucción por Ki con `extra` puntos de Ki además del primero: la
 * Presencia base, +5 por punto, hasta el doble de la Presencia (Core p.104).
 */
export function dificultadDestruccion(l: Luchador, extra: number): number {
  const p = presenciaBase(l.ficha);
  return Math.min(2 * p, p + 5 * extra);
}

/** Usa alguna habilidad que gaste Ki durante el combate. */
function gastaKiEnCombate(h: HabilidadesKi): boolean {
  return h.armaduraMayor || h.recuperacion || h.aura || h.absorcion || h.curacion > 0 || h.aumento > 0 || h.destruccion;
}

/**
 * Presencia base (Core p.25, Tabla 5): la de la planilla; si falta, la RF menos el bono de
 * Constitución, que es como se calcula la RF.
 */
export function presenciaBase(f: Ficha): number {
  return f.presencia ?? f.rf - bonoCaracteristica(f.atributos?.CON ?? f.constitucion);
}

/** Tabla 8 (Dominus p.21): bono a la dificultad del Aura según la suma de las acumulaciones. */
export function bonoAura(sumaAcumulaciones: number): number {
  const s = sumaAcumulaciones;
  return s >= 28 ? 60 : s >= 23 ? 50 : s >= 17 ? 40 : s >= 14 ? 30 : s >= 11 ? 20 : s >= 9 ? 10 : 0;
}

/** Dificultad del Aura: Presencia base + Tabla 8, menos los negativos a la acción (Dominus p.21). */
export function dificultadAura(l: Luchador, negativo: number): number {
  const acum = l.ficha.ki?.acumulacion ?? {};
  let suma = 0;
  for (const c of CARACTERISTICAS_KI) suma += acum[c] ?? 0;
  return presenciaBase(l.ficha) + bonoAura(suma) - negativo;
}

/** El Aura no afecta a quien tiene una Presencia a 10 o menos de la suya (Dominus p.21). */
export function sensibleAlAura(fuente: Luchador, x: Luchador): boolean {
  return presenciaBase(x.ficha) < presenciaBase(fuente.ficha) - 10;
}

/** Radio del Aura en metros: la Presencia entre 5 (Dominus p.21). */
export function radioAura(l: Luchador): number {
  return presenciaBase(l.ficha) / 5;
}

/**
 * Lo que hay que sumar a la TA contra energía de la planilla, que trae la Armadura mayor o la arcana
 * a TA 4. La mayor apagada vuelve a TA 2; la arcana encendida sube a TA 6 (Dominus p.19).
 */
export function ajusteTaEnergia(l: Luchador): number {
  const h = habilidadesKi(l.ficha);
  const activa = !!l.ki?.armaduraActiva;
  if (h.armaduraArcana) return activa ? 2 : 0;
  if (h.armaduraMayor) return activa ? 0 : -2;
  return 0;
}

// --------------------------------------------------------------------------- estado y acumulación

export interface EstadoKi {
  reserva: number;
  /** Ki concentrado en cada característica (sin contar el de las técnicas en espera). */
  acumulado: Partial<Record<CaracteristicaKi, number>>;
  /** Lo que sumó este asalto (si hace otra cosa, al final queda la mitad hacia arriba). */
  ganado: Partial<Record<CaracteristicaKi, number>>;
  acumulando: boolean;
  /** Ejecutó alguna técnica este asalto: al final lo sobrante vuelve a la reserva. */
  ejecuto: boolean;
  /** Efectos de tipo Asalto activos (de técnicas ejecutadas o mantenidas este asalto). */
  activo: ModKi;
  /** Técnicas mantenidas y si ya usaron este asalto sus efectos de Acción. */
  mantenidas: Map<Tecnica, boolean>;
  /**
   * Técnicas en espera (Core p.105, segundo método): su Ki ya está concentrado y apartado; se
   * ejecutan cuando convenga. El número es el asalto en que quedaron listas.
   */
  enEspera: Map<Tecnica, number>;
  /** Defensas de este asalto sin penalizador por Defensa adicional (Dominus p.56). */
  defensasLibres: number;
  /** Asalto en curso (para saber desde cuándo espera una técnica). */
  asalto: number;
  /**
   * Técnica declarada al empezar a acumular: sólo esa puede quedar en espera cuando junte su coste
   * (Core p.105: "si antes de comenzar a acumular declara que quiere usar una Técnica en concreto").
   */
  objetivo: Tecnica | null;
  /** Reserva inicial: los Límites recuperan Ki perdido, sin pasarla (Dominus p.28). */
  reservaMax: number;
  /** Límites que ya se activaron (Caelum y Terminus, una vez) y lo recuperado con Cenobus. */
  limitesUsados: Set<string>;
  danoCenobus: number;
  recuperadoCenobus: number;
  matadosAsalto: number;
  /** Armadura de energía mayor (o arcana a TA 6) encendida, y asaltos desde el último pago. */
  armaduraActiva: boolean;
  asaltosArmadura: number;
  /** Aura de combate encendida, y asaltos desde el último pago (1 de Ki cada 5, Dominus p.21). */
  auraActiva: boolean;
  asaltosAura: number;
  /** La Acumulación (Ki) lo convirtió en un ser con acumulación de daño este asalto. */
  pantallaConvirtio: boolean;
  /** Daño recibido este asalto y el anterior (Circunstancia límite: Recibir daño, Dominus p.72). */
  danoAsalto: number;
  danoPrevio: number;
  /** Aumento de características activo: qué característica, desde y hasta qué valor, y asaltos sin pagar. */
  aumento: { atributo: AtributoAumento; desde: number; hasta: number; asaltos: number } | null;
  /** Asalto en que declaró el objetivo (Predeterminación: un asalto antes, Dominus p.74). */
  objetivoDesde: number;
  /** Usos limitados: veces que usó cada técnica en el combate (Dominus p.75). */
  usos: Map<Tecnica, number>;
  /** Sobrecarga: hasta qué asalto no puede ejecutar técnicas (Dominus p.75). */
  sobrecargaHasta: number;
  /** Sin defensa: asalto en que ejecutó una técnica que lo deja sin defenderse (Dominus p.75). */
  sinDefensa: number;
  /** Lo que la técnica le hace al terminar la acción: Técnica final, Pérdida del arma (Dominus p.74-75). */
  pendiente: { final: boolean; arma: boolean };
}

export function crearEstadoKi(l: Luchador): EstadoKi | null {
  const ki = l.ficha.ki;
  if (!ki || (!ki.tecnicas.length && !gastaKiEnCombate(habilidadesKi(l.ficha))) || ki.reserva <= 0) return null;
  return {
    reserva: ki.reserva, acumulado: {}, ganado: {}, acumulando: false, ejecuto: false,
    activo: { ...SIN_KI }, mantenidas: new Map(), enEspera: new Map(), defensasLibres: 0, asalto: 0, objetivo: null,
    reservaMax: ki.reserva, limitesUsados: new Set(), danoCenobus: 0, recuperadoCenobus: 0, matadosAsalto: 0,
    armaduraActiva: false, asaltosArmadura: 0, auraActiva: false, asaltosAura: 0, aumento: null,
    danoAsalto: 0, danoPrevio: 0, pantallaConvirtio: false, objetivoDesde: 0, usos: new Map(), sobrecargaHasta: 0, sinDefensa: -1,
    pendiente: { final: false, arma: false },
  };
}

/** Acumulación Plena (Dominus p.18): no se reduce por hacer otras acciones. */
function acumulacionPlena(l: Luchador): boolean {
  return tiene(l.ficha.rasgos?.ventajas, 'acumulacion plena');
}

/** Ki concentrado en total: lo acumulado más lo apartado en técnicas en espera. */
function totalConcentrado(e: EstadoKi): number {
  let s = 0;
  for (const c of CARACTERISTICAS_KI) s += e.acumulado[c] ?? 0;
  for (const t of e.enEspera.keys()) s += costeKi(t);
  return s;
}

/** Ki genérico por asalto para tener una técnica en espera: 1, 2 o 3 según su nivel (Core p.105). */
export function costeEspera(t: Tecnica): number {
  return t.nivel;
}

export interface DecisionKi {
  /** Acumula este asalto. */
  acumula: boolean;
  /** Mantenidas que deja de mantener (soltarlas no cuesta nada, Dominus p.48). */
  soltar: Tecnica[];
  /** Técnicas en espera que deja ir (su Ki vuelve a la reserva). */
  liberar: Tecnica[];
  /** Técnica que declara al empezar a acumular desde cero (null si no declara ninguna). */
  objetivo: Tecnica | null;
  /** Enciende (o mantiene) la Armadura de energía mayor o la arcana a TA 6. */
  armadura?: boolean;
  /** Recupera un punto de cansancio con 5 de Ki (Recuperación). */
  recuperar?: boolean;
  /** Desencadena (o mantiene) el Aura de combate. */
  aura?: boolean;
  /** Activa Aumento de características hasta ese valor (si no tiene uno activo). */
  aumentar?: { atributo: AtributoAumento; hasta: number };
}

/**
 * Comienzo del asalto: suelta lo que decidió soltar, paga las mantenidas (de la reserva, sin
 * acumular, Dominus p.48) y las técnicas que siguen en espera (1/2/3 de Ki según su nivel, Core
 * p.105) y, si acumula, suma su acumulación de cada característica. Cada −20 a toda acción baja 1
 * cada acumulación (Core p.232). Lo concentrado nunca supera la reserva.
 */
export function empezarAsalto(l: Luchador, d: DecisionKi, negativo: number, asalto: number) {
  const e = l.ki;
  if (!e) return;
  e.asalto = asalto;
  e.matadosAsalto = 0;
  e.danoPrevio = e.danoAsalto;
  e.danoAsalto = 0;
  // Agon: recupera un punto de Ki por asalto de combate (Dominus p.29).
  if (tieneLimite(l, 'agon')) recuperarKi(l, 1);
  e.ejecuto = false;
  e.ganado = {};
  e.activo = { ...SIN_KI };
  e.defensasLibres = 0;
  // Armadura de energía mayor: 1 de Ki al encenderla y cada 5 asaltos que siga (Dominus p.19).
  if (d.armadura && e.reserva >= 1) {
    if (!e.armaduraActiva || e.asaltosArmadura >= 5) {
      e.reserva--;
      e.asaltosArmadura = 0;
    }
    e.armaduraActiva = true;
    e.asaltosArmadura++;
  } else e.armaduraActiva = false;
  // Aura de combate: activarla es pasivo y gratis, pero cada 5 asaltos cuesta 1 de Ki (Dominus p.21).
  if (d.aura && e.reserva >= 1) {
    if (!e.auraActiva || e.asaltosAura >= 5) {
      e.reserva--;
      e.asaltosAura = 0;
    }
    e.auraActiva = true;
    e.asaltosAura++;
  } else e.auraActiva = false;
  // Recuperación: un punto de cansancio por 5 de Ki genérico, uno por asalto (Core p.105).
  const maxCansancio = l.ficha.cansancio ?? l.ficha.constitucion;
  if (d.recuperar && e.reserva >= 5 && l.cansancio < maxCansancio) {
    e.reserva -= 5;
    l.cansancio++;
  }
  for (const t of d.soltar) e.mantenidas.delete(t);
  for (const t of d.liberar) e.enEspera.delete(t);
  for (const t of [...e.mantenidas.keys()]) {
    if (e.reserva >= t.mantenimiento) {
      e.reserva -= t.mantenimiento;
      e.mantenidas.set(t, false);
      e.activo = combinar(e.activo, efectosDe(t).asalto);
    } else e.mantenidas.delete(t);
  }
  // Escudo y Acumulación duran el asalto; si se mantienen, conservan el daño sufrido, salvo lo que
  // recuperen por Regeneración al empezar el asalto (Dominus p.65-66).
  if (!e.activo.escudo) l.escudoKi = 0;
  else if (l.escudoKi > 0 && e.activo.regeneraEscudo) l.escudoKi = Math.min(e.activo.escudo, l.escudoKi + e.activo.regeneraEscudo);
  if (e.activo.pantalla && l.pantallaKi > 0 && e.activo.regeneraPantalla) l.pantallaKi = Math.min(e.activo.pantalla, l.pantallaKi + e.activo.regeneraPantalla);
  if (!e.activo.pantalla && e.pantallaConvirtio) {
    l.pantallaKi = 0;
    acumulacionKi(l, e, false);
  }
  for (const [t, desde] of [...e.enEspera]) {
    if (desde >= asalto) continue;
    // Si no puede pagar la espera, la técnica se pierde y su Ki vuelve a la reserva.
    if (e.reserva - costeKi(t) >= costeEspera(t)) e.reserva -= costeEspera(t);
    else e.enEspera.delete(t);
  }
  e.acumulando = d.acumula;
  if (!d.acumula) {
    // Si deja de acumular, lo concentrado vuelve a la reserva (Core p.102); lo que está en espera no.
    e.acumulado = {};
    e.objetivo = null;
    return;
  }
  // Empieza a acumular de cero: es cuando puede declarar la técnica que piensa dejar en espera.
  if (!CARACTERISTICAS_KI.some((c) => e.acumulado[c]) && e.objetivo !== d.objetivo) {
    e.objetivo = d.objetivo;
    e.objetivoDesde = asalto;
  }
  const baja = Math.max(0, Math.floor(negativo / 20));
  let libre = e.reserva - totalConcentrado(e);
  for (const c of CARACTERISTICAS_KI) {
    const suma = Math.min(libre, Math.max(0, (l.ficha.ki!.acumulacion[c] ?? 0) - baja));
    if (suma <= 0) continue;
    e.acumulado[c] = (e.acumulado[c] ?? 0) + suma;
    e.ganado[c] = suma;
    libre -= suma;
  }
}

/**
 * Fin del asalto. Si ejecutó una técnica, lo sobrante vuelve a la reserva. Si no, y además de
 * acumular hizo cualquier otra cosa (atacar, defenderse, moverse), lo que ganó este asalto queda en
 * la mitad hacia arriba (Core p.102; el ejemplo de Lemures reduce lo ganado, no lo ya juntado). Las
 * técnicas en espera no se tocan.
 */
export function terminarAsalto(l: Luchador, hizoOtraCosa: boolean) {
  const e = l.ki;
  if (!e) return;
  // Predeterminación: si pudiendo usarla no la usó, pierde todo lo acumulado (Dominus p.74).
  const t = e.objetivo;
  if (t && !e.ejecuto && efectosDe(t).desventajas.predeterminada && e.objetivoDesde < e.asalto && alcanzaLoAcumulado(e, t)) {
    e.acumulado = {};
    e.objetivo = null;
    return;
  }
  if (e.ejecuto) {
    e.acumulado = {};
    return;
  }
  if (!hizoOtraCosa || acumulacionPlena(l)) return;
  for (const c of CARACTERISTICAS_KI) {
    const g = e.ganado[c] ?? 0;
    // Lo apartado en espera no se pierde: lo que se reduce no baja de 0.
    if (g) e.acumulado[c] = Math.max(0, (e.acumulado[c] ?? 0) - Math.floor(g / 2));
  }
}

/** Le alcanza lo concentrado para ejecutarla (o la tiene en espera). */
export function puedeEjecutar(l: Luchador, t: Tecnica): boolean {
  const e = l.ki;
  if (!e) return false;
  // Sobrecarga: no puede ejecutar ninguna técnica hasta que pase (Dominus p.75).
  if (e.sobrecargaHasta >= e.asalto && e.sobrecargaHasta > 0) return false;
  if (!cumpleDesventajas(l, t)) return false;
  if (e.enEspera.has(t)) return costeKi(t) <= e.reserva;
  return alcanzaLoAcumulado(e, t) && costeKi(t) <= e.reserva;
}

/**
 * Acumulación (Dominus p.65): durante el asalto actúa como un ser con Acumulación de daño, con una
 * ficha nueva (las capacidades se derivan de la ficha).
 */
function acumulacionKi(l: Luchador, e: EstadoKi, activar: boolean) {
  if (activar === e.pantallaConvirtio || (activar && l.ficha.acumulacion)) return;
  e.pantallaConvirtio = activar;
  l.ficha = { ...l.ficha, acumulacion: activar || undefined };
  l.cap = capacidades(l.ficha);
}

/** Circunstancia límite, Agotamiento y Exceso de energía se pueden cumplir y pagar (Dominus p.71-74). */
function cumpleDesventajas(l: Luchador, t: Tecnica): boolean {
  const d = efectosDe(t).desventajas;
  if (d === SIN_DESVENTAJAS) return true;
  const pvMax = l.ficha.pv;
  switch (d.circunstancia) {
    case 'mitad': if (l.pv > pvMax / 2) return false; break;
    case 'cuarto': if (l.pv >= pvMax / 4) return false; break;
    case 'negativos': if (l.pv >= 0) return false; break;
    case 'dano': if ((l.ki?.danoPrevio ?? 0) <= 10) return false; break;
  }
  if (d.agotamiento && l.cansancio < d.agotamiento) return false;
  if (d.exceso && (l.ki?.reserva ?? 0) < 2 * costeKi(t)) return false;
  const e = l.ki!;
  if (d.atadaArma && (l.cap.desarmado || l.desarmado)) return false;
  if (d.desenvainar && !l.enfundada) return false;
  if (d.enCarga && (!l.cargando || l.trabados.length > 0)) return false;
  if (d.sinDefensa && (l.defensasHechas > 0 || l.ficha.acumulacion)) return false;
  if (d.sacrificioPv === Infinity && l.pv <= 0) return false;
  if (d.usos && (e.usos.get(t) ?? 0) >= d.usos) return false;
  if (d.predeterminada && !(e.objetivo === t && e.objetivoDesde < e.asalto)) return false;
  if (d.requiereMantenida && ![...e.mantenidas.keys()].some((m) => normalizarRasgo(m.nombre) === d.requiereMantenida)) return false;
  return true;
}

/** Circunstancia de combate: el blanco está en todas las que pide la técnica (Dominus p.72). */
export function cumpleCircunstancias(cs: readonly CircunstanciaCombate[], atk: Luchador, def: Luchador, espalda: boolean, cegado: boolean): boolean {
  for (const c of cs) {
    const ok = c === 'derribado' ? def.derribado : c === 'apresado' ? def.apresadoPor === atk : c === 'espalda' ? espalda :
      c === 'sorprendido' ? atk.sorprendeA.has(def) : cegado;
    if (!ok) return false;
  }
  return true;
}

/** Defensa especializada: el golpe es de la clase contra la que sirve la técnica (Dominus p.73). */
export function defensaSirve(contra: Desventajas['defensaContra'], g: { aDistancia?: boolean; ki?: ModKi; costeTecnica?: number }): boolean {
  switch (contra) {
    case '': return true;
    case 'fisico': return !g.aDistancia && !g.ki?.conjuro;
    case 'proyectil': return !!g.aDistancia;
    case 'ki': return !!g.costeTecnica;
    case 'conjuro': return !!g.ki?.conjuro;
    default: return false;
  }
}

function alcanzaLoAcumulado(e: EstadoKi, t: Tecnica): boolean {
  for (const c of CARACTERISTICAS_KI) if ((e.acumulado[c] ?? 0) < (t.coste[c] ?? 0)) return false;
  return true;
}

/**
 * Deja una técnica en espera (Core p.105): aparta de lo acumulado su coste y la tiene lista para
 * cuando convenga, aunque después ejecute otras o deje de acumular.
 */
export function ponerEnEspera(l: Luchador, t: Tecnica) {
  const e = l.ki!;
  if (e.objetivo === t) e.objetivo = null;
  for (const c of CARACTERISTICAS_KI) {
    const k = t.coste[c] ?? 0;
    if (k) e.acumulado[c] = (e.acumulado[c] ?? 0) - k;
  }
  e.enEspera.set(t, e.asalto);
}

/**
 * Se puede poner en espera: es la que declaró al empezar a acumular, le alcanza lo acumulado y no la
 * tiene ya lista ni mantenida.
 */
export function puedePonerEnEspera(l: Luchador, t: Tecnica): boolean {
  const e = l.ki;
  return !!e && e.objetivo === t && !e.enEspera.has(t) && !enUso(e, t) && alcanzaLoAcumulado(e, t) &&
    totalConcentrado(e) <= e.reserva;
}

/**
 * Ejecuta una técnica: gasta su coste de la reserva (de lo concentrado o de lo que tenía en espera),
 * activa sus efectos de Asalto y, si se mantiene, la deja activa para los asaltos siguientes.
 * Defensa adicional deja sin penalizador las defensas siguientes del asalto. Devuelve los efectos
 * que valen para esta acción (los de Acción más los de Asalto activos).
 */
export function ejecutar(l: Luchador, t: Tecnica): ModKi {
  const e = l.ki!;
  if (e.enEspera.has(t)) e.enEspera.delete(t);
  else {
    for (const c of CARACTERISTICAS_KI) {
      const k = t.coste[c] ?? 0;
      if (k) e.acumulado[c] = (e.acumulado[c] ?? 0) - k;
    }
    e.ejecuto = true;
  }
  e.reserva -= costeKi(t);
  const ef = efectosDe(t);
  const d = ef.desventajas;
  if (d.exceso) e.reserva = Math.max(0, e.reserva - costeKi(t));
  if (d.agotamiento) l.cansancio = Math.max(0, l.cansancio - d.agotamiento);
  if (d.penalizador) l.penTecnica += d.penalizador;
  if (d !== SIN_DESVENTAJAS) {
    // Sacrificio, de Características, Sin defensa, Sobrecarga, Usos limitados, y lo que pasa al
    // terminar la acción (Técnica final, Pérdida del arma) (Dominus p.74-75).
    if (d.sacrificioPv) l.pv = d.sacrificioPv === Infinity ? 0 : l.pv - d.sacrificioPv;
    if (d.sacrificioAtributo) {
      const a = d.sacrificioAtributo;
      l.ficha = { ...l.ficha, atributos: { ...l.ficha.atributos, [a]: (l.ficha.atributos?.[a] ?? 5) - 1 } };
      l.cap = capacidades(l.ficha);
    }
    if (d.sinDefensa) e.sinDefensa = e.asalto;
    if (d.sobrecarga) e.sobrecargaHasta = e.asalto + d.sobrecarga;
    if (d.usos) e.usos.set(t, (e.usos.get(t) ?? 0) + 1);
    if (d.final) e.pendiente.final = true;
    if (d.perdidaArma && !l.cap.desarmado) e.pendiente.arma = true;
  }
  // Escudo de energía y Acumulación: se levantan al ejecutarla (Dominus p.65-66).
  if (ef.asalto.escudo && !l.escudoKi) l.escudoKi = ef.asalto.escudo;
  if (ef.asalto.pantalla && !l.pantallaKi) {
    l.pantallaKi = ef.asalto.pantalla;
    acumulacionKi(l, e, true);
  }
  e.activo = combinar(e.activo, ef.asalto);
  e.defensasLibres = Math.max(e.defensasLibres, ef.accion.defensasAdicionales);
  for (const p of partesDe(t)) if (p.mantenimiento > 0) e.mantenidas.set(p, true);
  return combinar(e.activo, ef.accion);
}

/**
 * Efectos para una acción sin ejecutar ninguna técnica nueva: los de Asalto activos y, una vez por
 * asalto, los de Acción de una técnica mantenida de esa clase (Dominus p.48).
 */
export function modDeAccion(l: Luchador, clase: 'ataque' | 'defensa', consumir: boolean): ModKi | undefined {
  const e = l.ki;
  if (!e) return undefined;
  let m: ModKi = e.activo;
  for (const [t, usada] of e.mantenidas) {
    const ef = efectosDe(t);
    if (usada || (ef.clase !== clase && !(clase === 'ataque' && ef.clase === 'contra'))) continue;
    m = combinar(m, ef.accion);
    if (consumir) e.mantenidas.set(t, true);
  }
  return m;
}

/** Técnicas que se pueden ejecutar ahora atadas a esta clase de acción. */
export function tecnicasPara(l: Luchador, clase: Clase, esContra = false, automaticas = false): Tecnica[] {
  if (!l.ki) return [];
  return repertorio(l.ficha).filter((t) => {
    const ef = efectosDe(t);
    const c = ef.clase;
    // Un Transporte automático solo (Variable) se ata a cualquier acción (Dominus p.59).
    const encaja = c === clase || (clase === 'ataque' && esContra && c === 'contra') || (c === 'variable' && ef.accion.transporte > 0);
    // Las de Estados automáticos no van atadas a un golpe: son una acción aparte.
    return encaja && ef.automatico === automaticas && !enUso(l.ki!, t) && puedeEjecutar(l, t);
  });
}

// --------------------------------------------------------------------------- Límites (Dominus p.28-29)

function tieneLimite(l: Luchador, nombre: string): boolean {
  return !!l.ficha.ki?.limites?.includes(nombre);
}

/** Recupera Ki perdido, sin pasar la reserva inicial. Devuelve cuánto recuperó. */
export function recuperarKi(l: Luchador, n: number): number {
  const e = l.ki;
  if (!e || n <= 0) return 0;
  const antes = e.reserva;
  e.reserva = Math.min(e.reservaMax, e.reserva + n);
  return e.reserva - antes;
}

/**
 * Pierde PV: Cenobus recupera 1 de Ki cada 5 de daño (máx. 60); Caelum, 30 una vez al bajar de un
 * cuarto de sus PV; Terminus, 30 una vez al quedar con PV negativos. Devuelve qué Límite se activó.
 */
export function alPerderPv(l: Luchador, dano: number): string | null {
  const e = l.ki;
  if (!e || dano <= 0) return null;
  e.danoAsalto += dano;
  let activado: string | null = null;
  if (tieneLimite(l, 'cenobus') && e.recuperadoCenobus < 60) {
    e.danoCenobus += dano;
    const puntos = Math.min(60 - e.recuperadoCenobus, Math.floor(e.danoCenobus / 5));
    e.danoCenobus -= puntos * 5;
    e.recuperadoCenobus += recuperarKi(l, puntos);
  }
  if (tieneLimite(l, 'caelum') && !e.limitesUsados.has('caelum') && l.pv < l.ficha.pv / 4) {
    e.limitesUsados.add('caelum');
    recuperarKi(l, 30);
    activado = 'Caelum';
  }
  if (tieneLimite(l, 'terminus') && !e.limitesUsados.has('terminus') && l.pv < 0) {
    e.limitesUsados.add('terminus');
    recuperarKi(l, 30);
    activado = 'Terminus';
  }
  return activado;
}

/** Cruor: cada crítico que sufre, tenga o no efectos, recupera 10 de Ki. */
export function alRecibirCritico(l: Luchador): boolean {
  return tieneLimite(l, 'cruor') && recuperarKi(l, 10) > 0;
}

/** Mors: un punto de Ki por cada rival que mata, hasta 10 por asalto. */
export function alMatar(l: Luchador): boolean {
  const e = l.ki;
  if (!e || !tieneLimite(l, 'mors') || e.matadosAsalto >= 10) return false;
  e.matadosAsalto++;
  return recuperarKi(l, 1) > 0;
}

/** Resumen para el registro: "DES 7/14, FUE 6/12 (reserva 93)". */
export function textoKi(l: Luchador): string {
  const e = l.ki;
  if (!e) return '';
  const partes = CARACTERISTICAS_KI.filter((c) => e.acumulado[c]).map((c) => `${c} ${e.acumulado[c]}`);
  const espera = [...e.enEspera.keys()].map((x) => x.nombre);
  return `${partes.join(', ') || 'nada'}${espera.length ? `; en espera: ${espera.join(', ')}` : ''} (reserva ${e.reserva})`;
}


/** Efectos que tendría la acción si ejecutara esta técnica (sin ejecutarla). */
export function vistaPrevia(l: Luchador, t: Tecnica): ModKi {
  // Se repite mucho en la IA: se guarda por los efectos activos (que nunca se cambian en el lugar,
  // siempre se reemplazan) y la técnica.
  const activo = l.ki?.activo ?? SIN_KI;
  let porTecnica = vistas.get(activo);
  if (!porTecnica) vistas.set(activo, (porTecnica = new Map()));
  let v = porTecnica.get(t);
  if (!v) {
    const ef = efectosDe(t);
    porTecnica.set(t, (v = Object.freeze(combinar(combinar(activo, ef.asalto), ef.accion))));
  }
  return v;
}
const vistas = new WeakMap<ModKi, Map<Tecnica, ModKi>>();

/** Ki total que cuesta ejecutarla. */
export function costeKi(t: Tecnica): number {
  let s = 0;
  for (const c of CARACTERISTICAS_KI) s += t.coste[c] ?? 0;
  return s;
}

/**
 * Asaltos, contando éste, que tarda en juntar el Ki de `t` acumulando mientras pelea, como
 * `empezarAsalto` y el fin del asalto: cada asalto suma la acumulación entera (−1 cada 20 de negativo)
 * y, si no la ejecuta, lo ganado queda en la mitad (Core p.102). Desde lo que ya tiene concentrado o,
 * con `desdeCero`, sin nada. 0 si ya lo tiene; Infinity si nunca junta alguna característica o el
 * coste pasa de su reserva.
 */
export function asaltosParaJuntar(l: Luchador, t: Tecnica, negativo = 0, desdeCero = false): number {
  const e = l.ki;
  const ki = l.ficha.ki;
  if (!e || !ki || costeKi(t) > e.reserva) return Infinity;
  const baja = Math.max(0, Math.floor(negativo / 20));
  let n = 0;
  for (const c of CARACTERISTICAS_KI) {
    const resto = (t.coste[c] ?? 0) - (desdeCero ? 0 : e.acumulado[c] ?? 0);
    if (resto <= 0) continue;
    const acu = Math.max(0, (ki.acumulacion[c] ?? 0) - baja);
    if (!acu) return Infinity;
    n = Math.max(n, resto <= acu ? 1 : 1 + Math.ceil((resto - acu) / Math.ceil(acu / 2)));
  }
  return n;
}

export type { EfectoTecnica };
