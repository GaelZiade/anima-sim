// Lector mínimo de libros de Excel (.xlsx / .xlsm). Port de `xlsx_workbook.dart` de
// animaMasterToolkit: sólo abre las hojas que se piden y toma el valor cacheado que Excel guarda
// junto a cada fórmula (que es lo que tiene la ficha).

import { unzipSync } from 'fflate';

const ACENTOS = 'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç';
const PLANOS = 'AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc';

/** Reproduce `stripAccent` de la macro: el JSON usa claves sin acentos. */
export function quitarAcentos(texto: string): string {
  let out = '';
  for (const c of texto) {
    const i = ACENTOS.indexOf(c);
    out += i === -1 ? c : PLANOS[i];
  }
  return out;
}

/** Los nombres de hoja se comparan sin acentos ni mayúsculas. */
export function normalizar(nombre: string): string {
  return quitarAcentos(nombre).toLowerCase().trim();
}

interface Rango {
  col1: number;
  fila1: number;
  col2: number;
  fila2: number;
}

function parsearReferencia(ref: string): { col: number; fila: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref.toUpperCase());
  if (!m) return { col: 1, fila: 1 };
  let col = 0;
  for (const c of m[1]) col = col * 26 + (c.charCodeAt(0) - 64);
  return { col, fila: Number(m[2]) };
}

function parsearRango(rango: string): Rango {
  const [a, b] = rango.toUpperCase().split(':');
  const ini = parsearReferencia(a);
  const fin = parsearReferencia(b ?? a);
  return { col1: ini.col, fila1: ini.fila, col2: fin.col, fila2: fin.fila };
}

function referencia(col: number, fila: number): string {
  let letras = '';
  let resto = col;
  while (resto > 0) {
    letras = String.fromCharCode(65 + ((resto - 1) % 26)) + letras;
    resto = Math.floor((resto - 1) / 26);
  }
  return `${letras}${fila}`;
}

function decodificarXml(texto: string): string {
  if (!texto.includes('&')) return texto;
  return texto
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Atributo de una etiqueta XML, ignorando el prefijo de espacio de nombres. */
const patronesAtributo = new Map<string, RegExp>();

function atributo(attrs: string, nombre: string): string | undefined {
  let re = patronesAtributo.get(nombre);
  if (!re) patronesAtributo.set(nombre, (re = new RegExp(`(?:^|\\s)(?:\\w+:)?${nombre}="([^"]*)"`)));
  const m = re.exec(attrs);
  return m ? decodificarXml(m[1]) : undefined;
}

const utf8 = new TextDecoder('utf-8');

export class Libro {
  private readonly cache = new Map<string, Map<string, string>>();

  private constructor(
    private readonly leerTexto: (ruta: string) => string | null,
    private readonly rutasHojas: Map<string, string>,
    private readonly compartidas: string[],
  ) {}

  static leer(bytes: Uint8Array): Libro {
    const leerTexto = (ruta: string) => {
      const archivos = unzipSync(bytes, { filter: (f) => f.name === ruta });
      const datos = archivos[ruta];
      return datos ? utf8.decode(datos) : null;
    };

    const relaciones = new Map<string, string>();
    for (const m of (leerTexto('xl/_rels/workbook.xml.rels') ?? '').matchAll(/<Relationship\b([^>]*)\/?>/g)) {
      const id = atributo(m[1], 'Id');
      const destino = atributo(m[1], 'Target');
      if (id && destino) relaciones.set(id, destino.startsWith('/') ? destino.slice(1) : `xl/${destino}`);
    }

    const rutasHojas = new Map<string, string>();
    for (const m of (leerTexto('xl/workbook.xml') ?? '').matchAll(/<sheet\b([^>]*)\/?>/g)) {
      const nombre = atributo(m[1], 'name');
      const id = atributo(m[1], 'id');
      const ruta = id ? relaciones.get(id) : undefined;
      if (nombre && ruta) rutasHojas.set(normalizar(nombre), ruta);
    }

    const compartidas: string[] = [];
    for (const m of (leerTexto('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      let texto = '';
      for (const t of m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) texto += decodificarXml(t[1]);
      compartidas.push(texto);
    }

    return new Libro(leerTexto, rutasHojas, compartidas);
  }

  tieneHoja(hoja: string): boolean {
    return this.rutasHojas.has(normalizar(hoja));
  }

  /** Valor mostrado de una celda, o undefined si está vacía. */
  celda(hoja: string, ref: string): string | undefined {
    return this.hoja(hoja).get(ref.toUpperCase());
  }

  /** Por fila del rango, el valor de las columnas pedidas (1 = primera columna del rango). */
  filas(hoja: string, rango: string, columnas: number[]): (string | undefined)[][] {
    const valores = this.hoja(hoja);
    const r = parsearRango(rango);
    const out: (string | undefined)[][] = [];
    for (let fila = r.fila1; fila <= r.fila2; fila++)
      out.push(columnas.map((c) => valores.get(referencia(r.col1 + c - 1, fila))));
    return out;
  }

  /**
   * Celda relativa a un bloque, como la direcciona la macro: `G3` sobre un bloque es tercera
   * fila, séptima columna contando desde su esquina.
   */
  celdaDeBloque(hoja: string, bloque: string, relativa: string): string | undefined {
    const r = parsearRango(bloque);
    const o = parsearReferencia(relativa);
    return this.celda(hoja, referencia(r.col1 + o.col - 1, r.fila1 + o.fila - 1));
  }

  /** Fila cuya celda en `columna` contiene `texto` (sin acentos ni mayúsculas). */
  buscarFila(hoja: string, columna: string, texto: string, desde = 1, hasta = 200): number | null {
    const aguja = normalizar(texto);
    for (let fila = desde; fila <= hasta; fila++) {
      const v = this.celda(hoja, `${columna}${fila}`);
      if (v !== undefined && normalizar(v).includes(aguja)) return fila;
    }
    return null;
  }

  private hoja(hoja: string): Map<string, string> {
    const clave = normalizar(hoja);
    let valores = this.cache.get(clave);
    if (!valores) {
      const ruta = this.rutasHojas.get(clave);
      const xml = ruta ? this.leerTexto(ruta) : null;
      valores = xml ? this.parsearHoja(xml) : new Map();
      this.cache.set(clave, valores);
    }
    return valores;
  }

  private parsearHoja(xml: string): Map<string, string> {
    const valores = new Map<string, string>();
    for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = atributo(m[1], 'r');
      const contenido = m[2];
      if (!ref || !contenido) continue;
      const tipo = atributo(m[1], 't');
      const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(contenido);
      if (v) {
        const crudo = decodificarXml(v[1]);
        valores.set(ref, tipo === 's' ? this.compartidas[Number(crudo)] ?? crudo : crudo);
      } else if (tipo === 'inlineStr') {
        let texto = '';
        for (const t of contenido.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) texto += decodificarXml(t[1]);
        valores.set(ref, texto);
      }
    }

    // Excel guarda el valor de un bloque combinado sólo en su celda ancla; la macro lo ve desde
    // cualquier celda del bloque, así que se replica.
    for (const m of xml.matchAll(/<mergeCell ref="([^"]+)"/g)) {
      const r = parsearRango(m[1]);
      const ancla = valores.get(referencia(r.col1, r.fila1));
      if (ancla === undefined) continue;
      for (let fila = r.fila1; fila <= r.fila2; fila++)
        for (let col = r.col1; col <= r.col2; col++) {
          const ref = referencia(col, fila);
          if (!valores.has(ref)) valores.set(ref, ancla);
        }
    }
    return valores;
  }
}
