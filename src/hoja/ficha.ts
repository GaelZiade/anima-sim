// De la planilla (JSON de la macro) a la Ficha del simulador.

import { CARACTERISTICAS_KI, type ArmaDistancia, type Atributo, type CaracteristicaKi, type EfectoTecnica, type Ficha, type KiFicha, type Perfil, type Tecnica } from '../motor/modelo';
import type { TamanoArma, TipoAtaque } from '../motor/reglas';
import { Libro, normalizar } from './libro';
import { esDesarmado, leerLocalizacion, localizacionArmadura, tamanoPorNombre } from '../motor/rasgos';
import { hojaAJson, type ArmaJson, type HojaJson } from './hojaAJson';
import { datosProyectil } from '../motor/proyectiles';

export interface OpcionesFicha {
  /** Nombre (o parte) del arma a usar. Por defecto, la mejor de cuerpo a cuerpo. */
  arma?: string;
  perfil?: Perfil;
}

/** Número de una celda. La planilla guarda valores cacheados como "139.99999999" o "X". */
function numero(texto: string | undefined, porDefecto: number): number {
  const n = Number.parseFloat((texto ?? '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : porDefecto;
}

/** Como `JsonUtils.boolean` del toolkit: la planilla escribe "Si" / "No". */
function booleano(texto: string | undefined): boolean {
  return ['true', 'si', 's', '1', 'yes'].includes(normalizar(texto ?? ''));
}

/**
 * Clase de una armadura por su nombre (Tabla 38). Blandas: acolchada, cota de cuero, gabardina, piel,
 * completa de cuero, mallas, anillas. El cuero endurecido y el tachonado son duros.
 */
export function claseArmadura(nombre: string): 'blanda' | 'dura' {
  const n = normalizar(nombre);
  if (n.includes('endurecid') || n.includes('tachonad')) return 'dura';
  // Yelmos (Tabla 39): sólo las capuchas son blandas.
  if (localizacionArmadura(nombre) === 'cabeza') return n.includes('capucha') ? 'blanda' : 'dura';
  return ['acolchad', 'cuero', 'gabardina', 'piel', 'malla', 'anilla'].some((x) => n.includes(x)) ? 'blanda' : 'dura';
}

/** "CON 6, DES 5, FUE 5" → { CON: 6, DES: 5, FUE: 5 }; el mantenimiento va aparte: "(3)". */
export function leerCosteKi(texto: string): { coste: Partial<Record<CaracteristicaKi, number>>; mantenimiento: number } {
  const coste: Partial<Record<CaracteristicaKi, number>> = {};
  for (const m of texto.matchAll(/\b(AGI|CON|DES|FUE|POD|VOL)\s+(\d+)/g)) coste[m[1] as CaracteristicaKi] = Number(m[2]);
  const mant = /\((\d+)\)/.exec(texto);
  return { coste, mantenimiento: mant ? Number(mant[1]) : 0 };
}

/**
 * "Habilidad de Ataque (+50), Ataque con Area (5 metros de radio, Eleccion de Blanco)" → efectos con
 * sus opciones. Las comas dentro de los paréntesis no separan efectos.
 */
export function leerEfectosTecnica(texto: string): EfectoTecnica[] {
  const partes: string[] = [];
  let nivel = 0;
  let actual = '';
  for (const c of texto) {
    if (c === '(') nivel++;
    if (c === ')') nivel--;
    if (c === ',' && nivel === 0) {
      partes.push(actual);
      actual = '';
    } else actual += c;
  }
  partes.push(actual);
  const out: EfectoTecnica[] = [];
  for (const p of partes) {
    const m = /^\s*([^(]+?)\s*(?:\((.*)\))?\s*$/.exec(p);
    if (!m || !m[1] || m[1] === '-') continue;
    const opciones = (m[2] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    out.push({
      nombre: m[1],
      opciones: opciones.filter((x) => normalizar(x) !== 'mantenido'),
      mantenido: opciones.some((x) => normalizar(x) === 'mantenido'),
    });
  }
  return out;
}

/** Reserva, acumulaciones y técnicas de la hoja Ki. Sin Ki (ni reserva ni técnicas), undefined. */
function leerKi(json: HojaJson): KiFicha | undefined {
  const acumulacion: Partial<Record<CaracteristicaKi, number>> = {};
  for (const c of CARACTERISTICAS_KI) {
    const v = numero(json.Ki.Acumulaciones[c], 0);
    if (v) acumulacion[c] = v;
  }
  const tecnicas: Tecnica[] = json.Ki.tecnicas.map((t) => ({
    nombre: t.nombre,
    nivel: numero(t.nivel, 1) as 1 | 2 | 3,
    cm: numero(t.cm, 0),
    ...leerCosteKi(t.coste),
    combinable: booleano(t.combinable),
    efectos: leerEfectosTecnica(t.efectos),
  }));
  const reserva = numero(json.Ki.acumulacionMax, 0);
  if (!reserva && !tecnicas.length) return undefined;
  // "Caelum: Límite del Peligro" → "caelum".
  const limites = json.Ki.limites.map((x) => normalizar(x.split(':')[0]));
  return { reserva, acumulacion, tecnicas, limites };
}

/** Como `CombatData.hasTrait`: contiene, sin acentos ni mayúsculas. */
export function tieneRasgo(lista: string[], rasgo: string): boolean {
  const aguja = normalizar(rasgo);
  return lista.some((x) => normalizar(x).includes(aguja));
}

const TIPOS: TipoAtaque[] = ['FIL', 'CON', 'PEN', 'CAL', 'ELE', 'FRI', 'ENE'];

function tipoAtaque(crit: string | undefined): TipoAtaque {
  const t = normalizar(crit ?? '').slice(0, 3).toUpperCase() as TipoAtaque;
  return TIPOS.includes(t) ? t : 'CON';
}

function esDistancia(a: ArmaJson): boolean {
  return (a.municion ?? '-') !== '-';
}

function esProyeccion(a: ArmaJson): boolean {
  return a.tipo === 'Mistico' || a.tipo === 'Psiquica';
}

/** Armas que el motor sabe usar hoy: cuerpo a cuerpo, con turno numérico. */
export function armasCuerpoACuerpo(json: HojaJson): ArmaJson[] {
  return json.Combate.armas.filter(
    (a) => !esDistancia(a) && !esProyeccion(a) && Number.isFinite(Number.parseFloat(a.turno ?? '')),
  );
}

/** "Lanzable (80/60m)": cadencia de fuego y alcance que calcula la planilla. */
function lanzable(a: ArmaJson): { cadencia: number; alcance: number } | null {
  const m = /lanzable\s*\((\d+)\s*\/\s*(\d+)\s*m/.exec(normalizar(`${a.caracteristica ?? ''} ${a.especial ?? ''}`));
  return m ? { cadencia: Number(m[1]), alcance: Number(m[2]) } : null;
}

/** Alcance de las armas Leo (Dominus p.101). */
const ALCANCE_LEO: [RegExp, number][] = [[/pistola/, 50], [/rifle/, 80], [/canon/, 250]];

/**
 * Armas a distancia de la planilla (Core p.94-96): las que usan munición y las arrojadizas
 * ("Lanzable (CF/alcance)"). Lo que la planilla no trae (recarga, alcance) sale de la Tabla 34.
 */
export function armasDistancia(json: HojaJson): ArmaDistancia[] {
  const res: ArmaDistancia[] = [];
  for (const a of json.Combate.armas) {
    if (esProyeccion(a)) continue;
    const l = lanzable(a);
    if (!l && !esDistancia(a)) continue;
    const n = normalizar(a.nombre);
    const leo = n.startsWith('leo');
    const tabla = datosProyectil(a.nombre);
    const alcance = l?.alcance ?? (leo ? ALCANCE_LEO.find(([re]) => re.test(n))?.[1] : undefined) ?? tabla?.alcance ?? 10;
    res.push({
      nombre: a.nombre,
      clase: l ? 'lanzamiento' : 'disparo',
      ataque: numero(a.ataque, 0),
      danoBase: numero(a.danio, 0),
      tipoAtaque: tipoAtaque(a.critPrincipal),
      alcance,
      ...(l ? { cadencia: l.cadencia } : {}),
      // El revólver de un arma Leo no se recarga en combate (Dominus p.101): dispara cada asalto.
      ...(leo ? { recarga: 1, leo: true, fuego: false } : {}),
      calidad: numero(a.calidad, 0),
      precisa: normalizar(a.caracteristica ?? '').includes('precisa'),
    });
  }
  return res;
}

export function elegirArma(json: HojaJson, nombre?: string): ArmaJson {
  const candidatas = armasCuerpoACuerpo(json);
  if (nombre) {
    const buscada = normalizar(nombre);
    const exacta = json.Combate.armas.find((a) => normalizar(a.nombre) === buscada);
    const parcial = json.Combate.armas.find((a) => normalizar(a.nombre).includes(buscada));
    const arma = exacta ?? parcial;
    if (!arma) {
      const nombres = json.Combate.armas.map((a) => a.nombre).join(', ');
      throw new Error(`No encuentro el arma "${nombre}". Armas de la ficha: ${nombres}`);
    }
    return arma;
  }
  if (candidatas.length === 0) throw new Error('La ficha no tiene armas cuerpo a cuerpo.');
  return candidatas.reduce((mejor, a) =>
    numero(a.ataque, 0) + numero(a.defensa, 0) > numero(mejor.ataque, 0) + numero(mejor.defensa, 0) ? a : mejor,
  );
}

export function jsonAFicha(json: HojaJson, o: OpcionesFicha = {}): Ficha {
  const datos = json.datosElementales;
  const arma = elegirArma(json, o.arma);
  const total = json.Combate.armadura.armaduraTotal;
  const ta: Partial<Record<TipoAtaque, number>> = {};
  for (const t of TIPOS) {
    const v = numero(total[t], 0);
    if (v) ta[t] = v;
  }
  const c = json.Combate;
  const desarmado = esDesarmado(arma.nombre, arma.tipo);
  const tamano = (arma.tamanoAtaque as TamanoArma | undefined) ?? tamanoPorNombre(arma.nombre) ?? undefined;
  const nombre = datos.nombre || 'Sin nombre';
  const atributos: Partial<Record<Atributo, number>> = {};
  for (const a of ['AGI', 'CON', 'DES', 'FUE', 'INT', 'PER', 'POD', 'VOL'] as const) atributos[a] = numero(json.Atributos[a], 5);
  const tipoDefensa = (t: string | undefined) => (normalizar(t ?? '').startsWith('esq') ? 'esquiva' as const : 'parada' as const);
  // El primer bloque de armas de la planilla es siempre el combate sin armas.
  const sinArmas = json.Combate.armas.find((a) => a.tipo === 'desarmado');
  const secundario = normalizar(arma.critSecundario ?? '').slice(0, 3).toUpperCase() as TipoAtaque;
  return {
    id: normalizar(nombre).replace(/\s+/g, '-'),
    nombre,
    pv: numero(datos.puntosDeVida, 60),
    turno: numero(arma.turno, 0),
    ataque: numero(arma.ataque, 0),
    defensa: numero(arma.defensa, 0),
    acumulacion: booleano(datos.acumDanio) || undefined,
    danoBase: numero(arma.danio, 0),
    tipoAtaque: tipoAtaque(arma.critPrincipal),
    tamanoArma: tamano,
    arma: {
      nombre: arma.nombre,
      desarmado,
      calidad: numero(arma.calidad, 0),
      descripcion: [arma.caracteristica, arma.advertencia, arma.especial].filter((x) => x && x !== '-').join(' '),
      precisa: normalizar(arma.caracteristica ?? '').includes('precisa'),
      rotura: numero(arma.rotura, 0),
      entereza: numero(arma.entereza, 10),
      critSecundario: TIPOS.includes(secundario) ? secundario : undefined,
    },
    tipoDefensa: tipoDefensa(arma.defensaTipo),
    atributos,
    sinArmas: sinArmas && sinArmas !== arma ? {
      turno: numero(sinArmas.turno, 0),
      ataque: numero(sinArmas.ataque, 0),
      defensa: numero(sinArmas.defensa, 0),
      danoBase: numero(sinArmas.danio, 10),
      tipoAtaque: tipoAtaque(sinArmas.critPrincipal),
      tipoDefensa: tipoDefensa(sinArmas.defensaTipo),
      rotura: numero(sinArmas.rotura, 0),
      entereza: numero(sinArmas.entereza, 10),
    } : undefined,
    capasArmadura: json.Combate.armadura.armaduras.map((c) => ({
      nombre: c.nombre,
      clase: claseArmadura(c.nombre),
      localizacion: leerLocalizacion(c.Localizacion, c.nombre),
      ta: Object.fromEntries(TIPOS.map((t) => [t, numero(c[t], 0)])) as Partial<Record<TipoAtaque, number>>,
      calidad: numero(c.calidad, 0),
      entereza: numero(c.Entereza, 10),
    })),
    ...(armasDistancia(json).length ? { armasDistancia: armasDistancia(json) } : {}),
    // Un escudo (rodela, medio o corporal) entre sus armas: para proyectiles con menos penalizador (Core p.79).
    ...(json.Combate.armas.some((a) => /\b(escudo|rodela)\b/.test(normalizar(a.nombre))) ? { escudo: true } : {}),
    ...(json.Habilidades['T. Manos'] !== undefined ? { trucosDeManos: numero(json.Habilidades['T. Manos'], 0) } : {}),
    acrobacias: json.Habilidades.Acrobacias !== undefined ? numero(json.Habilidades.Acrobacias, 0) : undefined,
    ki: leerKi(json),
    presencia: numero(json.Resistencias['Pres. Base'], 0),
    ta,
    rf: numero(json.Resistencias.RF, 0),
    constitucion: numero(json.Atributos.CON, 5),
    tipoMovimiento: numero(datos.movimiento, 6),
    cansancio: numero(datos.cansancio, numero(json.Atributos.CON, 5)),
    inteligencia: numero(json.Atributos.INT, 6),
    perfil: o.perfil,
    // Las tablas de armas y las de estilo van juntas, como en el toolkit.
    rasgos: {
      tablas: [...Object.keys(c.TablasDeArmas), ...Object.keys(c.EstilosDeCombate)],
      artesMarciales: Object.keys(c.ArtesMarciales),
      ventajas: [...c.ventajas, ...(c.ambidestria && !tieneRasgo(c.ventajas, 'ambidestr') ? ['Ambidestria'] : [])],
      desventajas: c.desventajas,
      habilidadesKi: c.habilidadesKi,
      arsMagnus: Object.keys(c.ArsMagnus),
    },
  };
}

/** Lee una planilla .xlsx/.xlsm ya cargada en memoria. */
export function leerHoja(bytes: Uint8Array): HojaJson {
  const libro = Libro.leer(bytes);
  if (!libro.tieneHoja('Principal') || !libro.tieneHoja('Combate'))
    throw new Error('La planilla no tiene las hojas "Principal" y "Combate". ¿Es una ficha de Ánima?');
  return hojaAJson(libro);
}

export function hojaAFicha(bytes: Uint8Array, o: OpcionesFicha = {}): Ficha {
  return jsonAFicha(leerHoja(bytes), o);
}
