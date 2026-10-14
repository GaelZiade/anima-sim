// Tablas, artes marciales, ventajas, desventajas y habilidades del Ki que cambian el combate.
// Port de las reglas de animaMasterToolkit (`additional_attack_rules.dart`,
// `armour_reduction_rules.dart`, `damage_barrier_rules.dart`, `combat_traits.dart`,
// `penalty_rules.dart`), que citan Core Exxet y Dominus Exxet.

import type { Ficha } from './modelo';
import { umbralPifia, type TamanoArma } from './reglas';
import { estilos, type Estilos } from './estilos';

/** Minúsculas, sin acentos ni espacios repetidos (`CombatData.normalizeTrait`). */
export function normalizarRasgo(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Algún nombre de la lista contiene `texto` (`CombatData.hasTrait`). */
export function tiene(lista: string[] | undefined, texto: string): boolean {
  const buscado = normalizarRasgo(texto);
  return (lista ?? []).some((x) => normalizarRasgo(x).includes(buscado));
}

/** "Sambo (Avanzado)" → 2. Base o sin grado 1, Avanzado 2, Supremo o Arcano 3. */
export function gradoDe(entrada: string): number {
  const t = normalizarRasgo(entrada);
  if (t.includes('suprem') || t.includes('arcan')) return 3;
  if (t.includes('avanzad')) return 2;
  return 1;
}

/** Grado en un arte marcial por nombre exacto: "Lama" no confunde a "Lama Tsu". */
export function gradoArteMarcial(artes: string[] | undefined, nombre: string): number {
  const buscado = normalizarRasgo(nombre);
  let grado = 0;
  for (const arte of artes ?? [])
    if (normalizarRasgo(arte.split('(')[0]) === buscado) grado = Math.max(grado, gradoDe(arte));
  return grado;
}

// --------------------------------------------------------------------------- armas

/** La planilla nombra juntas las armas de las dos manos: "Espada y Daga". */
export function usaDosArmas(nombre: string): boolean {
  return /\S\s+y\s+\S/.test(nombre);
}

export function esDesarmado(nombre: string, tipo?: string): boolean {
  const n = normalizarRasgo(nombre);
  return normalizarRasgo(tipo ?? '') === 'desarmado' || n.includes('desarmado') || n.includes('sin armas');
}

/** Tablas 29, 30 y 32 del Core con el tamaño que da el tipo de arma (p.76). */
const TAMANO_POR_NOMBRE: Record<string, TamanoArma> = {
  alabarda: 'G', arpon: 'G', cadena: 'M', cestus: 'P', cimitarra: 'M', 'daga de parada': 'P', daga: 'P',
  'espada ancha': 'M', 'espada bastarda': 'G', 'espada corta': 'P', 'espada larga': 'M', estilete: 'P',
  estoque: 'M', florete: 'M', garfio: 'P', garrote: 'M', 'gran martillo de guerra': 'M', guadana: 'G',
  'hacha a dos manos': 'G', 'hacha de guerra': 'M', 'hacha de mano': 'M', jabalina: 'G',
  'lanza de caballeria': 'G', lanza: 'G', latigo: 'M', lazo: 'M', mandoble: 'G', mangual: 'G',
  'martillo de guerra': 'M', mayal: 'M', 'maza pesada de combate': 'G', maza: 'M', 'red de gladiador': 'M',
  sable: 'M', tridente: 'G', vara: 'G',
  'katana de doble hoja': 'M', katana: 'M', katar: 'P', garras: 'P', nunchaku: 'M', bumeran: 'P',
  quebradora: 'G', shuriken: 'P', cuervo: 'P', 'anciano de primavera': 'G', nodachi: 'G', tanto: 'P',
  tonfa: 'P', 'abanico de combate': 'P', sai: 'P', 'kusari-gama': 'M', shuko: 'P',
  'botella rota': 'P', silla: 'G', 'palo de madera': 'M', 'barra metalica': 'M', jarron: 'M',
  'cuchillo de cocina': 'P', martillo: 'M', 'hacha de lenador': 'M', azada: 'M', hoz: 'P', pico: 'P',
  antorcha: 'M',
  // Categorías, para nombres propios como "Espada de Kaito"
  'arma corta': 'P', espada: 'M', hacha: 'M', cuerda: 'M', asta: 'G',
};
const ORDEN_TAMANO: TamanoArma[] = ['P', 'M', 'G'];

/** Tamaño deducido del nombre. Con dos armas manda la más grande; lo desconocido no cuenta. */
export function tamanoPorNombre(nombre: string): TamanoArma | null {
  let resultado: TamanoArma | null = null;
  for (const parte of normalizarRasgo(nombre).split(/\s+y\s+|\s*[+/,&]\s*/)) {
    let mejorLargo = 0;
    let mejor: TamanoArma | null = null;
    for (const [clave, tamano] of Object.entries(TAMANO_POR_NOMBRE)) {
      const escapada = clave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!new RegExp(`(^|[^a-z0-9])${escapada}(e?s)?(?=[^a-z0-9]|$)`).test(parte)) continue;
      const masLarga = clave.length > mejorLargo;
      const empateMasGrande = clave.length === mejorLargo && mejor !== null && ORDEN_TAMANO.indexOf(tamano) > ORDEN_TAMANO.indexOf(mejor);
      if (masLarga || empateMasGrande) {
        mejorLargo = clave.length;
        mejor = tamano;
      }
    }
    if (mejor && (!resultado || ORDEN_TAMANO.indexOf(mejor) > ORDEN_TAMANO.indexOf(resultado))) resultado = mejor;
  }
  return resultado;
}

// --------------------------------------------------------------------------- armaduras

export type LocalizacionArmadura = 'peto' | 'camisola' | 'completa' | 'cabeza';

/** Qué cubre una armadura según su nombre (Tablas 37 y 39); lo desconocido se toma como completa. */
export function localizacionArmadura(nombre: string): LocalizacionArmadura {
  const n = normalizarRasgo(nombre);
  if (/yelmo|casco|capucha|fronton|coronilla|completo (abierto|cerrado)|^anilla$/.test(n)) return 'cabeza';
  if (/endurecid|tachonad|peto/.test(n)) return 'peto';
  if (/acolchad|cota de cuero|^cuero$|^piel|anillas/.test(n)) return 'camisola';
  return 'completa';
}

/** Lee la localización tal como la escribe la planilla ("Camisola", "Cabeza"…). */
export function leerLocalizacion(texto: string | undefined, nombre: string): LocalizacionArmadura {
  const t = normalizarRasgo(texto ?? '');
  if (t.startsWith('cabeza')) return 'cabeza';
  if (t.startsWith('peto')) return 'peto';
  if (t.startsWith('camisola')) return 'camisola';
  if (t.startsWith('completa')) return 'completa';
  return localizacionArmadura(nombre);
}

// --------------------------------------------------------------------------- capacidades

export interface AtaqueExtra {
  nombre: string;
  /** Penalizador propio, además del compartido por los ataques adicionales. */
  pen: number;
  /** Se hace sin armas (la patada del Tae Kwon Do): usa el perfil sin armas de la ficha. */
  sinArmas?: boolean;
}

/** Un ataque del asalto: su penalizador propio y con qué se hace. */
export interface Ranura {
  pen: number;
  sinArmas: boolean;
}

/**
 * Ataques del asalto en el orden en que se usan: los n declarados (comparten el penalizador) y
 * después los extra. Con Estilo Defensivo la segunda arma defiende en vez de atacar (Dominus p.28).
 */
// Los planes no se modifican: se guardan por capacidades (que tampoco cambian, ver `capacidades`).
const planes = new WeakMap<Capacidades, Map<number, readonly Ranura[]>>();

export function planDeAtaques(cap: Capacidades, n: number, estiloDefensivo = false): readonly Ranura[] {
  let porCap = planes.get(cap);
  if (!porCap) planes.set(cap, (porCap = new Map()));
  const clave = n * 2 + Number(estiloDefensivo);
  let plan = porCap.get(clave);
  if (!plan) porCap.set(clave, (plan = armarPlan(cap, n, estiloDefensivo)));
  return plan;
}

function armarPlan(cap: Capacidades, n: number, estiloDefensivo: boolean): Ranura[] {
  const extras = cap.extras
    .filter((e) => !(estiloDefensivo && e.nombre.startsWith('Segunda arma')))
    .sort((a, b) => a.pen - b.pen)
    .map((e) => ({ pen: e.pen, sinArmas: !!e.sinArmas }));
  return [...Array.from({ length: n }, () => ({ pen: 0, sinArmas: false })), ...extras];
}

/** Lo que la ficha permite en combate, calculado una vez por luchador (y otra vez si lo desarman). */
export interface Capacidades {
  /** Pelea sin armas: sólo así valen las ventajas de las Artes Marciales. */
  desarmado: boolean;
  /** Ventajas condicionales de estilos, Ars Magnus y Legados. */
  est: Estilos;
  /** Tope de ataques declarables: 1 + uno cada 100 de HA, + Tabla de Ataque Adicional, + Kempo supremo. */
  maxAtaques: number;
  /** Penalizador por cada ataque adicional declarado (positivo). */
  penPorAtaque: number;
  /** Ataques fuera del tope: segunda arma, patada de Tae Kwon Do. */
  extras: AtaqueExtra[];
  /** Tipos de armadura que le resta al defensor. */
  reduccionTA: number;
  /** La parte que viene del arma (calidad y extra): no vale para la patada sin armas. */
  reduccionTAArma: number;
  /** Barrera de daño propia (la más alta). */
  barrera: number;
  /** Sus ataques dañan energía e ignoran barreras de daño. */
  danaEnergia: boolean;
  /** Defensas por asalto sin penalizador por defensa adicional. Infinity = todas. */
  defensasLibres: number;
  /** Tiene la Tabla de 2ª Arma: Estilo Defensivo y dos armas: puede cambiar el ataque extra por una defensa. */
  estiloDefensivo: boolean;
  bonoCritico: number;
  // Negativos (Core p.21, p.25, p.104; Dominus Esencia de vacío)
  mitadCansancio: boolean;
  dobleCansancio: boolean;
  mitadDolorCritico: boolean;
  sinDolorNiCansancio: boolean;
  /** Ventaja Buena suerte: pifia con un número menos (Core p.10). */
  buenaSuerte: boolean;
  /** Ajuste al umbral de pifia por ventajas: Buena suerte −1, Mala suerte +2 (Core p.21, p.25). */
  ajustePifia: number;
  /** Umbral de pifia al atacar y al defenderse (maestría, suerte y arma Compleja, ver `umbralPifia`). */
  umbralAtaque: number;
  umbralDefensa: number;
}

// Las capacidades dependen sólo de la ficha y nunca se modifican: si algo cambia en combate (un arma
// mellada, un desarme) el motor arma una ficha nueva. Se calculan una vez por ficha.
const calculadas = new WeakMap<Ficha, Capacidades>();

export function capacidades(f: Ficha): Capacidades {
  let c = calculadas.get(f);
  if (!c) calculadas.set(f, (c = calcularCapacidades(f)));
  return c;
}

function calcularCapacidades(f: Ficha): Capacidades {
  // Sólo Buena suerte baja la pifia; Afortunado es otra ventaja (evita trampas y ataques al azar, p.21).
  const buenaSuerte = tiene(f.rasgos?.ventajas, 'buena suerte');
  const ajustePifia = (buenaSuerte ? -1 : 0) + (tiene(f.rasgos?.desventajas, 'mala suerte') ? 2 : 0);
  const r = f.rasgos ?? {};
  const arma = f.arma ?? {};
  const nombreArma = arma.nombre ?? '';
  const desarmado = arma.desarmado ?? esDesarmado(nombreArma);
  // Arma Compleja (látigo, mangual, mayal, katar…): la regla especial figura en su descripción.
  const compleja = !desarmado && normalizarRasgo(arma.descripcion ?? '').includes('compleja');
  const artes = r.artesMarciales;
  const kempo = desarmado ? gradoArteMarcial(artes, 'Kempo') : 0;
  const encadenado = tiene(r.tablas, 'ataque encadenado');
  const tablaAdicional = tiene(r.tablas, 'ataque adicional');

  // Ataques adicionales (Core p.91; Dominus para Kempo).
  const maxAtaques = Math.max(1, 1 + Math.floor(f.ataque / 100)) + (kempo >= 3 ? 1 : 0) + (tablaAdicional ? 1 : 0);
  let penPorAtaque: number;
  if (desarmado) penPorAtaque = kempo >= 2 ? 10 : kempo === 1 ? 15 : 20;
  else {
    const tamano = f.tamanoArma ?? tamanoPorNombre(nombreArma) ?? 'M';
    penPorAtaque = tamano === 'P' ? 20 : tamano === 'M' ? (encadenado ? 20 : 30) : encadenado ? 30 : 40;
  }

  // Ataques extra fuera del tope.
  const extras: AtaqueExtra[] = [];
  if (!desarmado && usaDosArmas(nombreArma)) {
    const ambidiestro = tiene(r.ventajas, 'ambidestr');
    extras.push({ nombre: ambidiestro ? 'Segunda arma con Ambidestría' : 'Segunda arma', pen: ambidiestro ? 10 : 40 });
  }
  const tkd = Math.max(gradoArteMarcial(artes, 'Tae Kwon Do'), gradoArteMarcial(artes, 'Taekwondo'));
  // La patada es un ataque sin armas, posible aun peleando con armas (Dominus p.36).
  if (tkd > 0) extras.push({ nombre: 'Patada de Tae Kwon Do', pen: [0, 30, 20, 0][tkd], sinArmas: !desarmado });

  // Reducción de TA: cada +5 de calidad resta 1 (Core p.76); Tabla de Reducción de Armadura;
  // Dumah sin armas −2 (Arcano −6); lo extra del arma. Se acumulan.
  const calidad = Math.max(0, arma.calidad ?? 0);
  const reduccionTAArma = Math.floor(calidad / 5) + (arma.reduccionTA ?? 0);
  let reduccionTA = reduccionTAArma;
  for (const t of r.tablas ?? [])
    if (normalizarRasgo(t).includes('reduccion de armadura')) reduccionTA += Math.max(1, Number(/\((\d+)\)/.exec(t)?.[1] ?? 1));
  const dumah = desarmado ? gradoArteMarcial(artes, 'Dumah') : 0;
  if (dumah > 0) reduccionTA += dumah >= 3 ? 6 : 2;

  // Barrera de daño: a mano, Rex Frame sin armas (60, Arcano 200; Dominus p.44), Escudo físico
  // (= Presencia base). Vale la más alta. El toolkit se la atribuye por error al Hanja.
  const rexFrame = desarmado ? gradoArteMarcial(artes, 'Rex Frame') : 0;
  const barrera = Math.max(
    f.barreraDanio ?? 0,
    rexFrame > 0 ? (rexFrame >= 3 ? 200 : 60) : 0,
    tiene(r.habilidadesKi, 'escudo fisico') ? (f.presencia ?? 0) : 0,
  );

  // Dañar energía: arma mágica, Extensión del aura al arma, Extrusión de presencia sin armas.
  const descripcion = normalizarRasgo(arma.descripcion ?? '');
  const danaEnergia =
    !!arma.danaEnergia ||
    ['dana energia', 'mistic', 'magic', 'sobrenatural', 'encantad'].some((k) => descripcion.includes(k)) ||
    tiene(r.habilidadesKi, 'extension del aura') ||
    (desarmado && tiene(r.habilidadesKi, 'extrusion de presencia'));

  // Defensas sin penalizador: Lama (Avanzado 1, Supremo 2), Lama Tsu (+2, Arcano todas), sólo sin
  // armas; Tabla de 2ª Arma: Estilo Defensivo, 1 con un arma en cada mano.
  let defensasLibres = 0;
  if (desarmado) {
    if (gradoArteMarcial(artes, 'Lama Tsu') >= 3) defensasLibres = Infinity;
    else {
      const lama = gradoArteMarcial(artes, 'Lama');
      defensasLibres += lama >= 3 ? 2 : lama === 2 ? 1 : 0;
      if (gradoArteMarcial(artes, 'Lama Tsu') >= 1) defensasLibres += 2;
    }
  }
  const estiloDefensivo = !desarmado && usaDosArmas(nombreArma) && tiene(r.tablas, 'estilo defensivo');

  const inmunidad = tiene(r.ventajas, 'inmunidad al dolor');
  const eliminacion = tiene(r.habilidadesKi, 'eliminacion de penalizadores');
  return {
    desarmado, est: estilos(f, desarmado),
    maxAtaques, penPorAtaque, extras, reduccionTA, reduccionTAArma, barrera, danaEnergia, defensasLibres, estiloDefensivo,
    bonoCritico: arma.bonoCritico ?? 0,
    mitadCansancio: inmunidad || eliminacion,
    dobleCansancio: tiene(r.desventajas, 'exhausto'),
    // El Core dice "dolor" para Inmunidad: incluye la parte de dolor de un crítico. El toolkit
    // sólo la reduce con Eliminación de penalizadores.
    mitadDolorCritico: inmunidad || eliminacion,
    sinDolorNiCansancio: tiene(r.habilidadesKi, 'esencia de vacio'),
    buenaSuerte,
    ajustePifia,
    umbralAtaque: umbralPifia(f.ataque, ajustePifia, compleja),
    // La esquiva no usa el arma: lo Complejo sólo cuenta al parar con ella.
    umbralDefensa: umbralPifia(f.defensa, ajustePifia, compleja && (f.tipoDefensa ?? 'parada') === 'parada'),
  };
}
