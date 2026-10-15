// Convierte una planilla de personaje de Ánima al JSON de la macro `ExportJson.bas`.
// Port 1:1 de `sheet_to_json.dart` de animaMasterToolkit: mismas celdas, mismo resultado.

import { Libro, normalizar, quitarAcentos } from './libro';

const PRINCIPAL = 'Principal';
const COMBATE = 'Combate';
const KI = 'Ki';
const MISTICOS = 'Místicos';
const PSIQUICOS = 'Psíquicos';

export type Tabla = Record<string, string>;

export type ArmaJson = Tabla;

export interface HojaJson {
  Atributos: Tabla;
  Habilidades: Tabla;
  datosElementales: Tabla;
  Resistencias: Tabla;
  PoderesDeCriatura: Tabla;
  HabilidadesElementales: Tabla;
  Combate: {
    TablasDeArmas: Tabla;
    EstilosDeCombate: Tabla;
    ArsMagnus: Tabla;
    ArtesMarciales: Tabla;
    armas: ArmaJson[];
    armadura: {
      restriccionMov: string;
      penNatural: string;
      requisito: string;
      penAccionFisica: string;
      penNaturalFinal: string;
      armaduraTotal: Tabla;
      armaduras: Tabla[];
    };
    ambidestria: boolean;
    ventajas: string[];
    desventajas: string[];
    habilidadesKi: string[];
  };
  Ki: {
    Acumulaciones: Tabla; Habilidades: Tabla; Maximos: Tabla; acumulacionMax: string; acumulacionGenerica: string;
    /** "Si" si la planilla usa la Unificación de puntos de Ki (una sola reserva). */
    unificacion: string;
    tecnicas: TecnicaJson[];
    /** Límites elegidos ("Caelum: Límite del Peligro"), debajo del título "Límite". */
    limites: string[];
  };
  Elan: Tabla;
  Misticos: Record<string, string | Tabla>;
  Psiquicos: Record<string, string | Tabla>;
}

export function hojaAJson(libro: Libro): HojaJson {
  return {
    Atributos: rangoATabla(libro, PRINCIPAL, 'D11:H18', 1, 4),
    Habilidades: rangoATabla(libro, PRINCIPAL, 'M22:Q77', 1, 5),
    datosElementales: datosBasicos(libro),
    Resistencias: rangoATabla(libro, PRINCIPAL, 'D57:J62', 1, 7),
    PoderesDeCriatura: rangoATabla(libro, PRINCIPAL, 'AB12:AH23', 1, 5),
    HabilidadesElementales: rangoATabla(libro, PRINCIPAL, 'AD12:AH69', 1, 4),
    Combate: datosCombate(libro),
    Ki: datosKi(libro),
    Elan: rangoATabla(libro, 'Elan', 'C29:G49', 4, 5),
    Misticos: datosMisticos(libro),
    Psiquicos: datosPsiquicos(libro),
  };
}

/** `RangeToJson` de la macro: una columna es la clave y otra el valor, sin repetir claves. */
function rangoATabla(libro: Libro, hoja: string, rango: string, colClave: number, colValor: number): Tabla {
  const out: Tabla = {};
  for (const [clave, valor] of libro.filas(hoja, rango, [colClave, colValor])) {
    const k = quitarAcentos(clave ?? '').trim();
    if (!k || k in out) continue;
    out[k] = quitarAcentos(valor ?? '').trim();
  }
  return out;
}

function texto(libro: Libro, hoja: string, ref: string): string {
  return quitarAcentos(libro.celda(hoja, ref) ?? '').trim();
}

function bloque(libro: Libro, hoja: string, b: string, relativa: string): string {
  return quitarAcentos(libro.celdaDeBloque(hoja, b, relativa) ?? '').trim();
}

function datosBasicos(libro: Libro): Tabla {
  return {
    cansancio: texto(libro, PRINCIPAL, 'N16'),
    puntosDeVida: texto(libro, PRINCIPAL, 'N11'),
    regeneracion: texto(libro, PRINCIPAL, 'J11'),
    nombre: texto(libro, PRINCIPAL, 'K4'),
    categoria: texto(libro, PRINCIPAL, 'K5'),
    nivel: texto(libro, PRINCIPAL, 'O6'),
    clase: texto(libro, PRINCIPAL, 'K7'),
    acumDanio: texto(libro, PRINCIPAL, 'Y13'),
    creadoConMagia: texto(libro, PRINCIPAL, 'Y14'),
    gnosis: texto(libro, PRINCIPAL, 'AB13'),
    natura: texto(libro, PRINCIPAL, 'AB14'),
    movimiento: texto(libro, PRINCIPAL, 'J16'),
  };
}

function datosKi(libro: Libro): HojaJson['Ki'] {
  return {
    Acumulaciones: rangoATabla(libro, KI, 'C12:D23', 1, 2),
    Habilidades: rangoATabla(libro, KI, 'C35:F36', 1, 4),
    Maximos: rangoATabla(libro, KI, 'C12:F23', 1, 6),
    acumulacionMax: texto(libro, KI, 'F24'),
    acumulacionGenerica: texto(libro, KI, 'D24'),
    unificacion: texto(libro, KI, 'I10'),
    tecnicas: tecnicas(libro),
    limites: limites(libro),
  };
}

/** Límites de la hoja Ki: las filas debajo del título "Límite" que nombran uno (Dominus p.28). */
function limites(libro: Libro): string[] {
  if (!libro.tieneHoja(KI)) return [];
  const titulo = libro.buscarFila(KI, 'C', 'Limite', 25, 80);
  if (titulo === null) return [];
  const out: string[] = [];
  for (let fila = titulo + 1; fila <= titulo + 3; fila++) {
    const v = texto(libro, KI, `C${fila}`);
    if (/limite/i.test(v)) out.push(v);
  }
  return out;
}

export interface TecnicaJson {
  nombre: string;
  /** "CON 6, DES 5, FUE 5"; con mantenimiento, el Ki por asalto entre paréntesis: "CON 6, DES 6 (3)". */
  coste: string;
  nivel: string;
  cm: string;
  /** "Habilidad de Ataque (+50), Aumento de Daño (+50), Ataque con Área (5 metros de radio, …)". */
  efectos: string;
  /** "Si" / "No", de la hoja de creación (sólo las técnicas propias la tienen). */
  combinable: string;
}

/**
 * Técnicas de la hoja Ki: bloques de 8 filas desde el título "Técnicas de Dominio", dos por fila
 * (columnas V y AD). Cada uno trae nombre, coste, nivel, CM y el resumen de efectos, tanto de las
 * técnicas propias como de las de los árboles ya armados. Si es Combinable sólo figura en "Creación
 * de Técnicas", en la cabecera de cada técnica, y se busca por nombre.
 */
function tecnicas(libro: Libro): TecnicaJson[] {
  if (!libro.tieneHoja(KI)) return [];
  const combinable = new Map<string, string>();
  const CREACION = 'Creación de Técnicas';
  // Las cabeceras de cada técnica ("Técnica N | nombre | Nivel: …") no están a distancia fija.
  if (libro.tieneHoja(CREACION))
    for (let fila = 1; fila <= 2000; fila++) {
      if (texto(libro, CREACION, `O${fila}`) !== 'Nivel:') continue;
      const nombre = texto(libro, CREACION, `D${fila}`);
      if (nombre && !combinable.has(normalizar(nombre))) combinable.set(normalizar(nombre), texto(libro, CREACION, `S${fila}`));
    }
  const out: TecnicaJson[] = [];
  // Los bloques empiezan dos filas después del título "Técnicas de Dominio" (fila 24, o 38 en la
  // variante Akuma Exxet, que tiene más sellos antes).
  const desde = (libro.buscarFila(KI, 'V', 'Tecnicas de Dominio', 10, 120) ?? 24) + 2;
  for (let fila = desde; fila <= desde + 8 * 40; fila += 8)
    for (const [c, nivel, cm] of [['V', 'AA', 'AB'], ['AD', 'AI', 'AJ']]) {
      const nombre = texto(libro, KI, `${c}${fila}`);
      // Sólo bloques de técnica de verdad (nivel 1 a 3): los vacíos muestran "Nivel: 0".
      if (!nombre || nombre === '-' || !/^[123]$/.test(texto(libro, KI, `${nivel}${fila + 1}`))) continue;
      out.push({
        nombre,
        coste: texto(libro, KI, `${c}${fila + 1}`),
        nivel: texto(libro, KI, `${nivel}${fila + 1}`),
        cm: texto(libro, KI, `${cm}${fila + 1}`),
        efectos: texto(libro, KI, `${c}${fila + 2}`),
        combinable: combinable.get(normalizar(nombre)) ?? '',
      });
    }
  return out;
}

function datosMisticos(libro: Libro): HojaJson['Misticos'] {
  return {
    regen: texto(libro, MISTICOS, 'J12'),
    act: texto(libro, MISTICOS, 'L12'),
    zeon: texto(libro, MISTICOS, 'K18'),
    Vias: rangoATabla(libro, MISTICOS, 'C15:H25', 1, 6),
    SubVias: rangoATabla(libro, MISTICOS, 'C15:H25', 1, 3),
    Metamagia: rangoATabla(libro, MISTICOS, 'W53:AB73', 1, 6),
    Conjuros: rangoATabla(libro, MISTICOS, 'Y12:AC50', 5, 1),
    Libres: rangoATabla(libro, MISTICOS, 'AG12:AK50', 5, 1),
  };
}

function datosPsiquicos(libro: Libro): HojaJson['Psiquicos'] {
  return {
    cvsLibres: texto(libro, PSIQUICOS, 'M10'),
    Disciplinas: rangoATabla(libro, PSIQUICOS, 'C25:Q36', 1, 4),
    Patrones: rangoATabla(libro, PSIQUICOS, 'C39:Q50', 1, 4),
    Poderes: rangoATabla(libro, PSIQUICOS, 'V11:AB64', 1, 7),
    Innatos: rangoATabla(libro, PSIQUICOS, 'AD17:AK62', 1, 8),
  };
}

function datosCombate(libro: Libro): HojaJson['Combate'] {
  return {
    TablasDeArmas: rangoATabla(libro, COMBATE, 'AH11:AL16', 1, 5),
    EstilosDeCombate: rangoATabla(libro, COMBATE, 'AB19:AQ28', 1, 7),
    ArsMagnus: rangoATabla(libro, COMBATE, 'AB55:AQ64', 1, 7),
    ArtesMarciales: rangoATabla(libro, COMBATE, 'AB31:AQ49', 1, 5),
    armas: armas(libro),
    armadura: datosArmadura(libro),
    ambidestria: tieneVentaja(libro, 'ambidestr'),
    ventajas: ventajas(libro),
    desventajas: desventajas(libro),
    habilidadesKi: habilidadesKi(libro),
  };
}

const BLOQUES_ARMAS = ['C27:L32', 'C34:L39', 'C41:L46', 'N27:W32', 'N34:W39', 'N41:W46'];
const BLOQUES_DISTANCIA = ['C49:L55', 'C58:L64', 'N49:W55', 'N58:W64'];

function armas(libro: Libro): ArmaJson[] {
  const out: ArmaJson[] = [desarmado(libro)];
  if (invirtioEn(libro, 'Proyeccion Magica')) {
    const p = proyeccion(libro, MISTICOS, 'Proyeccion Magica', 'Mistico');
    if (p) out.push(p);
  }
  if (invirtioEn(libro, 'Proyeccion psiquica')) {
    const p = proyeccion(libro, PSIQUICOS, 'Proyeccion Psiquica', 'Psiquica');
    if (p) out.push(p);
  }
  for (const b of BLOQUES_ARMAS) {
    const a = armaBase(libro, b);
    if (a) out.push(a);
  }
  for (const b of BLOQUES_DISTANCIA) {
    const a = armaDistancia(libro, b);
    if (a) out.push(a);
  }
  return out;
}

/** Sin PDs invertidos la planilla igual muestra una proyección; no se agrega como arma. */
function invirtioEn(libro: Libro, etiqueta: string): boolean {
  const fila = libro.buscarFila('PDs', 'K', etiqueta, 80, 140);
  if (fila === null) return false;
  const invertido = Number.parseFloat(libro.celda('PDs', `M${fila}`) ?? '');
  return Number.isFinite(invertido) && invertido > 0;
}

/** Ventajas de la hoja Principal: bajo "Puntos de Creación" hasta "Desventajas"; algunas en D55. */
function tieneVentaja(libro: Libro, nombre: string): boolean {
  const aguja = nombre.toLowerCase();
  for (let fila = 33; fila <= 55; fila++) {
    const v = texto(libro, PRINCIPAL, `C${fila}`).toLowerCase();
    if (v.startsWith('desventajas')) break;
    if (v.includes(aguja)) return true;
  }
  return texto(libro, PRINCIPAL, 'D55').toLowerCase().includes(aguja);
}

function ventajas(libro: Libro): string[] {
  const out: string[] = [];
  for (let fila = 33; fila <= 55; fila++) {
    const v = texto(libro, PRINCIPAL, `C${fila}`);
    const min = v.toLowerCase();
    if (min.startsWith('desventajas')) break;
    if (!v || min.startsWith('puntos de creacion')) continue;
    out.push(v);
  }
  return out;
}

/** Bajo "Desventajas" hasta la primera fila vacía (debajo va un resumen). */
function desventajas(libro: Libro): string[] {
  const titulo = libro.buscarFila(PRINCIPAL, 'C', 'Desventajas', 33, 60);
  if (titulo === null) return [];
  const out: string[] = [];
  for (let fila = titulo + 1; fila <= titulo + 8; fila++) {
    const v = texto(libro, PRINCIPAL, `C${fila}`);
    if (!v || v.toLowerCase().startsWith('resistencias')) break;
    out.push(v);
  }
  return out;
}

/**
 * Habilidades del Ki y del Némesis compradas. Los Dominios forman un árbol en K a N; la columna R
 * marca con 1 las compradas (las que no llevan marca, como Inhumanidad, muestran "-" en P). Las
 * del Némesis se marcan con 1 en B, con el nombre en C a E.
 */
function habilidadesKi(libro: Libro): string[] {
  if (!libro.tieneHoja(KI)) return [];
  const nombreEn = (fila: number, columnas: string[]) => {
    for (const col of [...columnas].reverse()) {
      const n = texto(libro, KI, `${col}${fila}`).replace(/[├│└─]/g, '').trim();
      if (n) return n;
    }
    return '';
  };
  // La variante Akuma Exxet agrega habilidades (el árbol llega a la columna O y a la fila 66): el
  // final se busca por etiqueta, como hace el toolkit con las filas corridas.
  const fin = libro.buscarFila(KI, 'K', 'Ventajas innatas', 10, 120) ?? 66;
  const out: string[] = [];
  for (let fila = 10; fila < fin; fila++) {
    const marca = texto(libro, KI, `R${fila}`);
    const comprada = marca === '1' || (marca === '' && texto(libro, KI, `P${fila}`) === '-');
    const nombre = nombreEn(fila, ['K', 'L', 'M', 'N', 'O']);
    if (comprada && nombre) out.push(nombre);
  }
  const nemesis = libro.buscarFila(KI, 'C', 'Uso del Nemesis', 30, 80) ?? 43;
  for (let fila = nemesis + 2; fila <= nemesis + 40; fila++) {
    const nombre = nombreEn(fila, ['C', 'D', 'E']);
    if (texto(libro, KI, `B${fila}`) === '1' && nombre) out.push(nombre);
  }
  return out;
}

/**
 * Tamaño del arma de un bloque para los ataques adicionales. Si el bloque es la mano hábil de un
 * combate con dos armas (Combate!R22 y U22), manda la más grande (Core p.91).
 */
function tamanoArma(libro: Libro, b: string): 'P' | 'M' | 'G' | null {
  const tamanos = [tamanoArmaBase(libro, bloque(libro, COMBATE, b, 'C2'))];
  const ranura = bloque(libro, COMBATE, b, 'A1');
  const manoHabil = texto(libro, COMBATE, 'R22');
  const otraMano = texto(libro, COMBATE, 'U22');
  if (ranura && otraMano && manoHabil.startsWith(`${ranura} `)) {
    const otraRanura = otraMano.split(' ')[0];
    for (const otro of BLOQUES_ARMAS)
      if (bloque(libro, COMBATE, otro, 'A1') === otraRanura)
        tamanos.push(tamanoArmaBase(libro, bloque(libro, COMBATE, otro, 'C2')));
  }
  const conocidos = tamanos.filter((t): t is number => t !== null);
  return conocidos.length === 0 ? null : (['P', 'M', 'G'] as const)[Math.max(...conocidos)];
}

/** Columna Tamaño de la "Tabla de Armas y Escudos" de la hoja Tablas: 0 P, 1 M, 2 G. */
function tamanoArmaBase(libro: Libro, nombre: string): number | null {
  if (!nombre) return null;
  return tablaDeTamanos(libro).get(nombre.toLowerCase()) ?? null;
}

// La tabla se lee una vez por planilla (cada arma la consultaba entera).
const tamanosPorLibro = new WeakMap<Libro, Map<string, number | null>>();

function tablaDeTamanos(libro: Libro): Map<string, number | null> {
  let tabla = tamanosPorLibro.get(libro);
  if (tabla) return tabla;
  tabla = new Map();
  tamanosPorLibro.set(libro, tabla);
  if (!libro.tieneHoja('Tablas')) return tabla;
  const titulo = libro.buscarFila('Tablas', 'X', 'Tama', 600, 700);
  if (titulo === null) return tabla;
  for (let fila = titulo + 1; fila <= titulo + 500; fila++) {
    const arma = libro.celda('Tablas', `D${fila}`);
    if (arma === undefined) continue;
    const clave = quitarAcentos(arma).trim().toLowerCase();
    // La primera fila con ese nombre es la que vale.
    if (tabla.has(clave)) continue;
    const t = quitarAcentos(libro.celda('Tablas', `X${fila}`) ?? '').toLowerCase();
    tabla.set(clave, t.startsWith('peque') ? 0 : t.startsWith('median') ? 1 : t.startsWith('grande') ? 2 : null);
  }
  return tabla;
}

function desarmado(libro: Libro): ArmaJson {
  const b = 'C20:L25';
  return {
    nombre: bloque(libro, COMBATE, b, 'A1'),
    tipo: 'desarmado',
    conocimiento: bloque(libro, COMBATE, b, 'A2'),
    tamanio: 'Normal',
    critPrincipal: bloque(libro, COMBATE, b, 'A4'),
    critSecundario: bloque(libro, COMBATE, b, 'B4'),
    entereza: bloque(libro, COMBATE, b, 'C4'),
    rotura: bloque(libro, COMBATE, b, 'D4'),
    presencia: bloque(libro, COMBATE, b, 'E4'),
    turno: bloque(libro, COMBATE, b, 'F2'),
    ataque: bloque(libro, COMBATE, b, 'G2'),
    defensa: bloque(libro, COMBATE, b, 'H2'),
    defensaTipo: bloque(libro, COMBATE, b, 'I2'),
    danio: bloque(libro, COMBATE, b, 'J2'),
    calidad: '-', caracteristica: '-', advertencia: '-', municion: '-', especial: '-',
  };
}

/** La proyección mágica y la psíquica se exponen como un arma más. */
function proyeccion(libro: Libro, hoja: string, nombre: string, tipo: string): ArmaJson | null {
  const b = 'O12:Q13';
  const ataque = bloque(libro, hoja, b, 'B1');
  if (!ataque || ataque === '0') return null;
  return {
    nombre, tipo, conocimiento: 'Conocida', tamanio: 'Normal',
    critPrincipal: 'Ene', critSecundario: 'Pen', entereza: '999', rotura: '0', presencia: '0',
    turno: bloque(libro, hoja, b, 'A1'),
    ataque,
    defensa: bloque(libro, hoja, b, 'C1'),
    defensaTipo: 'Par', danio: '100',
    calidad: '-', caracteristica: '-', advertencia: '-', municion: '-', especial: '-',
  };
}

function armaBase(libro: Libro, b: string): ArmaJson | null {
  const nombre = bloque(libro, COMBATE, b, 'B1');
  if (!nombre) return null;
  const tamano = tamanoArma(libro, b);
  return {
    nombre,
    tipo: bloque(libro, COMBATE, b, 'A2'),
    conocimiento: bloque(libro, COMBATE, b, 'A3'),
    tamanio: bloque(libro, COMBATE, b, 'D3'),
    critPrincipal: bloque(libro, COMBATE, b, 'A5'),
    critSecundario: bloque(libro, COMBATE, b, 'B5'),
    entereza: bloque(libro, COMBATE, b, 'C5'),
    rotura: bloque(libro, COMBATE, b, 'D5'),
    presencia: bloque(libro, COMBATE, b, 'E5'),
    turno: bloque(libro, COMBATE, b, 'F3'),
    ataque: bloque(libro, COMBATE, b, 'G3'),
    defensa: bloque(libro, COMBATE, b, 'H3'),
    defensaTipo: bloque(libro, COMBATE, b, 'I3'),
    danio: bloque(libro, COMBATE, b, 'J3'),
    calidad: bloque(libro, COMBATE, b, 'H5'),
    caracteristica: bloque(libro, COMBATE, b, 'A6'),
    advertencia: bloque(libro, COMBATE, b, 'I6'),
    municion: '-',
    especial: bloque(libro, COMBATE, b, 'H6'),
    ...(tamano ? { tamanoAtaque: tamano } : {}),
  };
}

function armaDistancia(libro: Libro, b: string): ArmaJson | null {
  const nombre = bloque(libro, COMBATE, b, 'C1');
  if (!nombre) return null;
  return {
    nombre,
    tipo: bloque(libro, COMBATE, b, 'A1'),
    conocimiento: bloque(libro, COMBATE, b, 'A3'),
    tamanio: bloque(libro, COMBATE, b, 'D3'),
    critPrincipal: bloque(libro, COMBATE, b, 'A5'),
    critSecundario: bloque(libro, COMBATE, b, 'B5'),
    entereza: bloque(libro, COMBATE, b, 'C5'),
    rotura: bloque(libro, COMBATE, b, 'D5'),
    presencia: bloque(libro, COMBATE, b, 'E5'),
    turno: bloque(libro, COMBATE, b, 'F2'),
    ataque: bloque(libro, COMBATE, b, 'G2'),
    defensa: bloque(libro, COMBATE, b, 'H2'),
    defensaTipo: bloque(libro, COMBATE, b, 'I2'),
    danio: bloque(libro, COMBATE, b, 'J2'),
    calidad: bloque(libro, COMBATE, b, 'H5'),
    caracteristica: bloque(libro, COMBATE, b, 'A6'),
    advertencia: bloque(libro, COMBATE, b, 'I6'),
    municion: bloque(libro, COMBATE, b, 'C2'),
    especial: bloque(libro, COMBATE, b, 'H6'),
  };
}

function datosArmadura(libro: Libro): HojaJson['Combate']['armadura'] {
  return {
    restriccionMov: texto(libro, COMBATE, 'E16'),
    penNatural: texto(libro, COMBATE, 'H17'),
    requisito: texto(libro, COMBATE, 'H16'),
    penAccionFisica: texto(libro, COMBATE, 'S16'),
    penNaturalFinal: texto(libro, COMBATE, 'S17'),
    armaduraTotal: {
      FIL: texto(libro, COMBATE, 'I16'),
      CON: texto(libro, COMBATE, 'J16'),
      PEN: texto(libro, COMBATE, 'K16'),
      CAL: texto(libro, COMBATE, 'L16'),
      ELE: texto(libro, COMBATE, 'M16'),
      FRI: texto(libro, COMBATE, 'N16'),
      ENE: texto(libro, COMBATE, 'O16'),
    },
    armaduras: armaduras(libro),
  };
}

function armaduras(libro: Libro): Tabla[] {
  const columnas = [1, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
  const claves = ['nombre', 'Localizacion', 'calidad', 'FIL', 'CON', 'PEN', 'CAL', 'ELE', 'FRI', 'ENE', 'Entereza', 'Presencia', 'RestMov', 'Enc'];
  const out: Tabla[] = [];
  for (const fila of libro.filas(COMBATE, 'C12:S15', columnas)) {
    if (!(fila[0] ?? '').trim()) continue;
    const a: Tabla = {};
    claves.forEach((k, i) => (a[k] = quitarAcentos(fila[i] ?? '').trim()));
    out.push(a);
  }
  return out;
}
