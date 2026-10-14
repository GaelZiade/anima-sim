// Ventajas condicionales de Artes Marciales, Tablas de Estilo, Ars Magnus y Legados de Sangre.
//
// Los bonos fijos ("Bono", "Bono Maestro", daño base) ya están en los valores finales de la planilla
// (Dominus p.30: se suman como bonos innatos al dominar el estilo). Acá sólo va lo que depende de la
// situación o de una decisión. Las ventajas de las Artes Marciales sólo valen peleando sin armas
// (Dominus p.45), salvo la patada del Tae Kwon Do (p.36).

import type { Ficha } from './modelo';
import { gradoArteMarcial, tiene } from './rasgos';
import { bonoCaracteristica } from './maniobras';

export interface Estilos {
  // ---------------------------------------------------------------- maniobras (Core p.91-92)
  /** Penalizador a Derribo (positivo). Core −30; Sambo y Grappling a la mitad; Grappling avanzado 0. */
  penDerribo: number;
  /** Penalizador a Presa. Core −40; Pankration/Grappling a la mitad; Grappling avanzado 0. */
  penPresa: number;
  /** Puede apresar: sin armas, o con la Tabla de Presa Inusual (−60, Dominus p.28). */
  puedePresar: boolean;
  penDesarmar: number;
  /** Penalizador a Ataque en área. Core −50; Tabla de Área −25; Sambo avanzado a la mitad; Capoeira supremo −10. */
  penArea: number;
  /** Blancos de un Ataque en área: P 3, M 4, G 5; Capoeira sin armas 3 (base) o 5 (avanzado). */
  blancosArea: number;
  /** Fracción del penalizador de un ataque apuntado: Precisa 1/2, Sambo supremo además 1/2. */
  factorApuntado: number;
  /** Aikido avanzado: Presa y Derribo sin penalizador al contraatacar (Dominus p.32). */
  presaDerriboLibreEnContra: boolean;
  /** Malla-yuddha supremo: Desarmar sin penalizador al contraatacar (Dominus p.35). */
  desarmarLibreEnContra: boolean;
  /** Daño completo (en vez de la mitad) en Presa y Derribo: Grappling supremo (Dominus p.37). */
  danoCompletoEnPresa: boolean;
  /** Engatillar: Core −100; Tabla de Precisión o arma Precisa a la mitad, las dos −25 (Core p.65, p.76). */
  penEngatillar: number;
  /** Mushin: 1 base, 3 arcano (puntos de presión, Dominus p.42). */
  mushin: 0 | 1 | 3;
  /** Enuth: +20 al crítico al dejar inconsciente; arcano +50 y todo ataque es un intento (p.43). */
  enuth: 0 | 1 | 3;
  /** Hakyoukuken: 1 resta 2 a la TA blanda, 3 la anula salvo su calidad (p.43). */
  hakyoukuken: 0 | 1 | 3;
  /** Apartar a otro: −30 a la defensa; Tabla de Guardaespaldas −10 (Core p.93, Dominus p.28). */
  penApartar: number;
  /** Retirarse sin el flanco a su defensa: Sangre de Uroboros (Dominus p.79). */
  retiradaSinFlanco: boolean;
  /** Espacio reducido: Tabla de Movimiento en Espacios Reducidos lo reduce a la mitad (Dominus p.28). */
  factorEspacioReducido: number;
  /** Hanja: sin penalizador a la defensa por espacio reducido (p.44). */
  defensaSinEspacioReducido: boolean;
  /** Batto jutsu / Iai jutsu: desenfunda sin penalizador (Core p.65). */
  battoJutsu: boolean;
  /** Legado de la Luna (Tsukiyomi): bono a toda acción según la fase lunar (Dominus p.79). */
  tsukiyomi: boolean;
  /** Haima (Ars Magnus, requiere Sangre Eterna): sombra de sangre al defenderse (p.88). */
  haima: boolean;
  /** Rotura extra sin armas: Dumah +10, arcano +25 (p.42). */
  roturaSinArmas: number;
  /** Rotura extra con cualquier arma: Ojos de la Muerte +5 (p.78). */
  roturaExtra: number;
  /** Entereza extra al parar sin armas: Malla-yuddha +10 (p.35). */
  enterezaSinArmas: number;
  /** No recibe daño al parar armas sin armas: Malla-yuddha avanzado (p.35). */
  paradaSinArmasSegura: boolean;

  // ---------------------------------------------------------------- controles de características
  /** Bono al ejecutar Presa o Derribo: Melkaiah +3 (p.41); Aikido supremo +2 en contras (p.32). */
  controlPresaDerribo: number;
  controlPresaDerriboEnContra: number;
  /** Bono al ejecutar Desarmar: Emp +3, +4 en contras con Malla-yuddha supremo (p.39). */
  controlDesarmar: number;
  controlDesarmarEnContra: number;
  /** Bono al resistir Presa/Derribo o zafarse: Kardad +1 / +3 (p.37). */
  resistePresaDerribo: number;
  /** Kardad supremo: repite una vez por asalto un control fallado al defenderse (p.37). */
  repiteControlDefensivo: boolean;
  /** Tabla de Sujeción: +3 para no ser desarmado (Dominus p.28). */
  resisteDesarme: number;
  /** Penalizador para zafarse de una Presa suya: −3; Pankration supremo −5 (p.33). */
  penZafarse: number;
  /** Pankration avanzado: ataca y defiende sin penalizador mientras apresa (p.33). */
  sinPenalizadorApresando: boolean;

  // ---------------------------------------------------------------- ataque y contraataque
  /** Boxeo avanzado: +10 al contraatacar (p.34). */
  bonoContraataque: number;
  /** Selene: dobla el bono de contraataque con Artes Marciales (p.39). */
  doblaBonoContra: boolean;
  /** Selene arcano: contraataca siempre, sin gastar ataques (p.39). */
  contrasIlimitadas: boolean;
  /** Aikido: al contraatacar suma 2× el bono de FUE del rival (mín. +5); supremo 4× (p.31-32). */
  aikidoMultiplicadorFue: number;
  /** Xing Quan: bono contra un único adversario si lleva la iniciativa: +10/+20/+30 (p.37). */
  xingQuan: number;
  /** Bono al nivel de crítico: Tabla de Crítico Incrementado +10, Moai Thai supremo +20, Hakyoukuken +20/+40. */
  bonoCriticoEstilos: number;
  /** Asakusen arcano: +20 al crítico de ataques apuntados a puntos vitales (p.41). */
  bonoCriticoVital: number;
  /** Tabla de Ataque Inusual: crítico secundario sin el −10 (Dominus p.28). */
  criticoSecundarioLibre: boolean;
  /** Emp arcano: cada defensa con éxito contra un arma permite un control para desarmar (p.39). */
  desarmaAlDefender: boolean;
  /** Godhand: sacrificar un ataque da +30 HA y +50 daño al primero del siguiente asalto (arcano +60/+100). */
  godhand: { ataque: number; dano: number } | null;
  /** Velez arcano: ataques intangibles, sólo se paran si se puede parar energía (p.40). */
  intangible: boolean;

  // ---------------------------------------------------------------- defensa
  /** Shephon: la Defensa total da +60 / +100 en vez de +30 (p.43). */
  bonoDefensaTotal: number;
  /** Soo Bahk: fracción del penalizador de flanco a la defensa (1, 1/2 base, 0 avanzado). Hanja: espalda 0. */
  factorFlanco: number;
  factorEspalda: number;
  /** Soo Bahk supremo: derribado sin penalizador a ataque ni defensa (p.37). */
  derribadoSinPenalizador: boolean;
  /** Hanja arcano: sin penalizador a la defensa por parálisis menor o parcial ni por estar amenazado (p.44). */
  defensaSinParalisis: boolean;
  /** Puede parar energía: Extrusión de presencia o Extensión del aura (Core p.101). */
  paraEnergia: boolean;
  /** Ve los ataques de energía invisibles: Detección del Ki o Ver lo sobrenatural. */
  veEnergia: boolean;
  /** Tipo de movimiento máximo: 10, 13 con Inhumanidad, 20 con Zen (Core p.62). */
  topeMovimiento: number;
  /** Detección del Ki: localiza a quien no ve, con ceguera parcial en vez de absoluta (Dominus p.11). */
  deteccionKi: boolean;
  /** Visión nocturna: 1 la ventaja (Core p.20), 2 completa (Core p.318). */
  visionNocturna: 0 | 1 | 2;

  // ---------------------------------------------------------------- modalidades declaradas
  /** Kung Fu avanzado +10 / supremo +20 / Asakusen arcano +40, a elegir antes de la iniciativa. */
  bonoVariable: number;
  /** Seraphite: +20 HA / −30 defensa (base) o +30 / −50 y sigue actuando (arcano). */
  seraphite: 0 | 1 | 3;
  /** Ars Magnus Berserker: +10 HA, −20 defensa, ignora dolor y cansancio (Dominus p.84). */
  berserker: boolean;
  /** Ars Magnus Ataque Final: +20 HA y +20 por cansancio, una vez, por debajo de la mitad de PV. */
  ataqueFinal: boolean;
  /** Ars Magnus Maniobra Especial: +20 la primera vez que la presencian (p.86). */
  maniobraEspecial: boolean;
  /** Ars Magnus Guardián: defiende a un aliado próximo con −10, sin necesitar el turno (p.86). */
  guardian: boolean;
  /** Ars Magnus Samiel: acumula el daño recibido de cada enemigo como bono contra él (p.92). */
  samiel: boolean;

  // ---------------------------------------------------------------- Legados de Sangre (Dominus cap.6)
  /** Uroboros: sorpresa con 100 de diferencia (p.79). */
  diferenciaSorpresa: number;
  /** Ojos de la Muerte: todo ataque que dañe produce crítico (p.78). */
  criticoAutomatico: boolean;
  /** Sangre de Toa: +10 a la RF contra críticos (p.78). */
  bonoRfCritico: number;
  /** Dominio físico: +10 a la RF contra cualquier tipo de daño (Dominus p.22). */
  bonoRfDano: number;
  /** Sangre Eterna: sin puntos vulnerables; consciente hasta −20×CON (p.80). */
  sangreEterna: boolean;
  /** Sangre de Orochi: puede despertar la sangre (+20 combate y turno, −2 PV por asalto) (p.81). */
  orochi: boolean;
  /** Sangre de Aeon: daño a la mitad de su elemento. */
  elementoAfin: string | null;
  /**
   * Leo, Armas-pistola (Ars Magnus, Dominus p.101): daño y crítico del disparo. La bala no suma la
   * Fuerza del usuario sino la del arma (pistola 10, rifle 11, cañón 12, +1 por cada +5 de calidad);
   * Daño incrementado también vale con proyectiles (Dominus p.19). null si no lo tiene.
   */
  leo: { dano: number; tipo: 'PEN' | 'CON' } | null;
}

/** Perfil del disparo de un arma Leo: espada-pistola (50, Fuerza 10), lanza-rifle (50, 11), maza-cañón (120, 12). */
function armaLeo(f: Ficha, desarmado: boolean): Estilos['leo'] {
  if (desarmado || !tiene(f.rasgos?.arsMagnus, 'leo')) return null;
  const n = (f.arma?.nombre ?? '').toLowerCase();
  const [base, fuerza, tipo]: [number, number, 'PEN' | 'CON'] =
    /rifle|lanza/.test(n) ? [50, 11, 'PEN'] : /ca[nñ]on|maza/.test(n) ? [120, 12, 'CON'] : [50, 10, 'PEN'];
  const calidad = Math.floor(Math.max(0, f.arma?.calidad ?? 0) / 5);
  const incrementado = tiene(f.rasgos?.habilidadesKi, 'dano incrementado') ? 10 : 0;
  return { dano: base + bonoCaracteristica(fuerza + calidad) + incrementado, tipo };
}

/** Tamaño de un ataque en área por tamaño de arma (Core p.92). */
const BLANCOS_AREA = { P: 3, M: 4, G: 5 } as const;

export function estilos(f: Ficha, desarmado: boolean): Estilos {
  const r = f.rasgos ?? {};
  const artes = r.artesMarciales;
  const tablas = r.tablas;
  const ars = r.arsMagnus;
  const v = r.ventajas;
  // Las ventajas de las Artes Marciales sólo valen sin armas.
  const g = (nombre: string) => (desarmado ? gradoArteMarcial(artes, nombre) : 0);
  const precisa = desarmado || !!f.arma?.precisa;

  // Penalizadores de maniobras: se toma el menor de los que permiten sus estilos.
  const sambo = g('Sambo');
  const grappling = g('Grappling');
  const pankration = g('Pankration');
  let penDerribo = desarmado ? 30 : f.tamanoArma === 'P' ? 60 : 30;
  if (sambo >= 1 || grappling === 1) penDerribo = Math.min(penDerribo, 15);
  if (grappling >= 2) penDerribo = 0;
  let penPresa = 40;
  if (pankration >= 1 || grappling === 1 || sambo >= 2) penPresa = 20;
  if (grappling >= 2) penPresa = 0;
  const presaInusual = !desarmado && tiene(tablas, 'presa inusual');
  if (presaInusual) penPresa = 60;
  let penDesarmar = 40;
  if (tiene(tablas, 'tabla de desarme') || sambo >= 1) penDesarmar = 20;
  if (g('Emp') >= 1) penDesarmar = 0;
  let penArea = 50;
  if (tiene(tablas, 'tabla de area') || sambo >= 2) penArea = 25;
  const capoeira = g('Capoeira');
  if (capoeira >= 3) penArea = Math.min(penArea, 10);
  let blancosArea: number = BLANCOS_AREA[f.tamanoArma ?? 'M'];
  if (desarmado) blancosArea = capoeira >= 2 ? 5 : capoeira === 1 ? 3 : 3;

  const aikido = g('Aikido');
  const malla = g('Malla-yuddha');
  const emp = g('Emp');
  const melkaiah = g('Melkaiah');
  const kardad = g('Kardad');
  const sooBahk = g('Soo Bahk');
  const hanja = g('Hanja');
  const kungFu = g('Kung Fu');
  const asakusen = g('Asakusen');
  const hakyou = g('Hakyoukuken');
  const godhand = g('Godhand');
  const seraphite = g('Seraphite');
  const shephon = g('Shephon');

  let bonoCriticoEstilos = tiene(tablas, 'critico incrementado') ? 10 : 0;
  if (g('Moai Thai') >= 3) bonoCriticoEstilos += 20;
  // El crítico de Hakyoukuken sólo vale contra seres orgánicos: se asume que el rival lo es.
  if (hakyou >= 1) bonoCriticoEstilos += hakyou >= 3 ? 40 : 20;

  let bonoVariable = kungFu >= 3 ? 20 : kungFu === 2 ? 10 : 0;
  if (asakusen >= 3) bonoVariable = 40;
  else if (asakusen >= 1) bonoVariable = Math.max(bonoVariable, 10);

  // Los Legados figuran entre las ventajas; se buscan por palabra entera ("Toa" no es "Tocado").
  const legado = (nombre: string) => (v ?? []).some((x) => new RegExp(`\\b${nombre}\\b`, 'i').test(x));
  const aeon = ['Kagutsuchi', 'Boreas', 'Niflheim', 'Rudraksha', 'Toa', 'Phandemonium', 'Shephirah'].find(legado);
  const ELEMENTO: Record<string, string> = { Kagutsuchi: 'CAL', Niflheim: 'FRI', Rudraksha: 'ELE' };

  return {
    penDerribo, penPresa, puedePresar: desarmado || presaInusual, penDesarmar, penArea, blancosArea,
    factorApuntado: (precisa ? 0.5 : 1) * (sambo >= 3 ? 0.5 : 1),
    presaDerriboLibreEnContra: aikido >= 2,
    desarmarLibreEnContra: malla >= 3,
    danoCompletoEnPresa: grappling >= 3,
    // Precisa (y los ataques desarmados lo son) también lo reduce a la mitad (Core p.76); con la
    // Tabla de Precisión se acumulan, como Sambo supremo con Precisa en los apuntados.
    penEngatillar: (tiene(tablas, 'tabla de precision') ? 50 : 100) * (precisa ? 0.5 : 1),
    mushin: g('Mushin') >= 3 ? 3 : g('Mushin') >= 1 ? 1 : 0,
    enuth: g('Enuth') >= 3 ? 3 : g('Enuth') >= 1 ? 1 : 0,
    hakyoukuken: hakyou >= 3 ? 3 : hakyou >= 1 ? 1 : 0,
    penApartar: tiene(tablas, 'guardaespaldas') ? 10 : 30,
    retiradaSinFlanco: legado('Uroboros'),
    factorEspacioReducido: tiene(tablas, 'espacios reducidos') ? 0.5 : 1,
    defensaSinEspacioReducido: hanja >= 1,
    battoJutsu: tiene(tablas, 'batto') || tiene(tablas, 'iai'),
    tsukiyomi: legado('Tsukiyomi') || tiene(v, 'legado de la luna'),
    haima: tiene(ars, 'haima') && legado('Eterna'),
    roturaSinArmas: g('Dumah') >= 3 ? 25 : g('Dumah') >= 1 ? 10 : 0,
    roturaExtra: legado('Muerte') ? 5 : 0,
    enterezaSinArmas: malla >= 1 ? 10 : 0,
    paradaSinArmasSegura: malla >= 2,
    controlPresaDerribo: melkaiah >= 1 ? 3 : 0,
    controlPresaDerriboEnContra: (melkaiah >= 1 ? 3 : 0) + (aikido >= 3 ? 2 : 0),
    controlDesarmar: emp >= 1 ? 3 : 0,
    controlDesarmarEnContra: emp >= 1 ? (malla >= 3 ? 4 : 3) : 0,
    resistePresaDerribo: kardad >= 2 ? 3 : kardad === 1 ? 1 : 0,
    repiteControlDefensivo: kardad >= 3,
    resisteDesarme: tiene(tablas, 'sujecion') ? 3 : 0,
    penZafarse: pankration >= 3 ? 5 : 3,
    sinPenalizadorApresando: pankration >= 2,
    bonoContraataque: g('Boxeo') >= 2 ? 10 : 0,
    doblaBonoContra: g('Selene') >= 1,
    contrasIlimitadas: g('Selene') >= 3,
    aikidoMultiplicadorFue: aikido >= 3 ? 4 : aikido >= 1 ? 2 : 0,
    xingQuan: [0, 10, 20, 30][g('Xing Quan')],
    bonoCriticoEstilos,
    bonoCriticoVital: asakusen >= 3 ? 20 : 0,
    criticoSecundarioLibre: tiene(tablas, 'ataque inusual'),
    desarmaAlDefender: emp >= 3,
    godhand: godhand >= 3 ? { ataque: 60, dano: 100 } : godhand >= 1 ? { ataque: 30, dano: 50 } : null,
    intangible: g('Velez') >= 3,
    bonoDefensaTotal: shephon >= 3 ? 100 : shephon >= 1 ? 60 : 30,
    factorFlanco: sooBahk >= 2 || hanja >= 1 ? 0 : sooBahk === 1 ? 0.5 : 1,
    factorEspalda: hanja >= 1 ? 0 : 1,
    derribadoSinPenalizador: sooBahk >= 3,
    defensaSinParalisis: hanja >= 3,
    paraEnergia: tiene(r.habilidadesKi, 'extrusion de presencia') || tiene(r.habilidadesKi, 'extension del aura'),
    veEnergia: tiene(r.habilidadesKi, 'deteccion del ki') || tiene(v, 'ver lo sobrenatural'),
    deteccionKi: tiene(r.habilidadesKi, 'deteccion del ki'),
    topeMovimiento: tiene(r.habilidadesKi, 'zen') || tiene(v, 'zen') ? 20
      : tiene(r.habilidadesKi, 'inhumanidad') || tiene(v, 'inhumanidad') ? 13 : 10,
    visionNocturna: tiene(v, 'vision nocturna completa') ? 2 : tiene(v, 'vision nocturna') ? 1 : 0,
    bonoVariable,
    seraphite: seraphite >= 3 ? 3 : seraphite >= 1 ? 1 : 0,
    berserker: tiene(ars, 'berserker'),
    ataqueFinal: tiene(ars, 'ataque final'),
    maniobraEspecial: tiene(ars, 'maniobra especial'),
    guardian: tiene(ars, 'guardian'),
    samiel: tiene(ars, 'samiel'),
    diferenciaSorpresa: legado('Uroboros') ? 100 : 150,
    criticoAutomatico: tiene(v, 'ojos de la muerte'),
    bonoRfCritico: legado('Toa') ? 10 : 0,
    bonoRfDano: tiene(r.habilidadesKi, 'dominio fisico') ? 10 : 0,
    sangreEterna: tiene(v, 'sangre eterna'),
    orochi: tiene(v, 'orochi'),
    elementoAfin: aeon ? (ELEMENTO[aeon] ?? null) : null,
    leo: armaLeo(f, desarmado),
  };
}
