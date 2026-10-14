// De la planilla (JSON de la macro) a la Ficha del simulador.

import type { Atributo, Ficha, Perfil } from '../motor/modelo';
import type { TamanoArma, TipoAtaque } from '../motor/reglas';
import { Libro, normalizar } from './libro';
import { esDesarmado, leerLocalizacion, localizacionArmadura, tamanoPorNombre } from '../motor/rasgos';
import { hojaAJson, type ArmaJson, type HojaJson } from './hojaAJson';

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
    acrobacias: json.Habilidades.Acrobacias !== undefined ? numero(json.Habilidades.Acrobacias, 0) : undefined,
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
