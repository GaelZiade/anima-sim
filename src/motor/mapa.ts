// Mapa en grilla de celdas de 1 m, al estilo BattleCast. Una celda puede ser pared (no se pasa ni se
// ve a través: muro, columna) o terreno infranqueable (no se pasa pero se ve: abismo, agua profunda,
// lava). Un luchador ocupa una celda; está trabado con los que tiene en las 8 de alrededor. Se mueve
// en 8 direcciones (la diagonal mide √2 m) sin atravesar paredes, terreno infranqueable ni cuerpos,
// y no corta esquinas de paredes en diagonal.

export interface Celda {
  x: number;
  y: number;
}

/** Lo que se guarda en un escenario: tamaño, paredes y terreno infranqueable. */
export interface Mapa {
  ancho: number;
  alto: number;
  /** Paredes: no se pasa ni se ve a través. */
  bloqueadas?: Celda[];
  /** Terreno infranqueable: no se pasa, pero se ve (y se dispara) por encima. */
  infranqueables?: Celda[];
}

/** Mapa listo para consultar: muros en un arreglo y campos de distancia ya calculados. */
export interface MapaListo {
  ancho: number;
  alto: number;
  /** Celdas que no se pueden pisar: paredes y terreno infranqueable. */
  muro: Uint8Array;
  /** Paredes: tapan la vista y no dejan cortar la esquina en diagonal. */
  pared: Uint8Array;
  /** Campo de distancias hacia cada celda (ver `campoHacia`), por índice de celda. */
  campos: Map<number, Float32Array>;
  /** Búfer de : metros hasta cada celda en la última búsqueda. */
  costos: Float32Array;
  /** Búfer para marcar celdas ocupadas. */
  ocupadas: Uint8Array;
}

const listos = new WeakMap<Mapa, { firma: string; listo: MapaListo }>();
const abiertos = new Map<string, MapaListo>();

/** Tamaño y paredes: si cambian, el mapa preparado ya no sirve. */
function firma(m: Mapa): string {
  const lista = (cs?: Celda[]) => (cs ?? []).map((c) => `${c.x},${c.y}`).join(';');
  return `${m.ancho}x${m.alto}:${lista(m.bloqueadas)}|${lista(m.infranqueables)}`;
}

/**
 * Prepara un mapa una vez; las consultas se guardan con él y valen para todos los combates. Si el
 * mismo objeto cambió (otro tamaño u otras paredes), se vuelve a preparar.
 */
export function prepararMapa(m: Mapa): MapaListo {
  const f = firma(m);
  const guardado = listos.get(m);
  if (guardado && guardado.firma === f) return guardado.listo;
  const muro = new Uint8Array(m.ancho * m.alto);
  const pared = new Uint8Array(m.ancho * m.alto);
  for (const c of m.bloqueadas ?? []) if (dentro(m, c)) muro[c.y * m.ancho + c.x] = pared[c.y * m.ancho + c.x] = 1;
  for (const c of m.infranqueables ?? []) if (dentro(m, c)) muro[c.y * m.ancho + c.x] = 1;
  const p: MapaListo = { ancho: m.ancho, alto: m.alto, muro, pared, campos: new Map(), costos: new Float32Array(muro.length), ocupadas: new Uint8Array(muro.length) };
  listos.set(m, { firma: f, listo: p });
  return p;
}

/** Mapa sin obstáculos de ese tamaño (compartido entre combates). */
export function mapaAbierto(ancho: number, alto: number): MapaListo {
  const clave = `${ancho}x${alto}`;
  let p = abiertos.get(clave);
  if (!p) {
    const n = ancho * alto;
    p = { ancho, alto, muro: new Uint8Array(n), pared: new Uint8Array(n), campos: new Map(), costos: new Float32Array(n), ocupadas: new Uint8Array(n) };
    abiertos.set(clave, p);
  }
  return p;
}

export function dentro(m: { ancho: number; alto: number }, c: Celda): boolean {
  return c.x >= 0 && c.y >= 0 && c.x < m.ancho && c.y < m.alto;
}

export function transitable(m: MapaListo, c: Celda): boolean {
  return dentro(m, c) && !m.muro[c.y * m.ancho + c.x];
}

export const indice = (m: MapaListo, c: Celda) => c.y * m.ancho + c.x;
export const celdaDe = (m: MapaListo, i: number): Celda => ({ x: i % m.ancho, y: Math.floor(i / m.ancho) });

const PASOS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];
// Los mismos pasos en arreglos planos, para el bucle de Dijkstra.
const PASO_X = Int8Array.from(PASOS, (p) => p[0]);
const PASO_Y = Int8Array.from(PASOS, (p) => p[1]);
const PASO_M = Float64Array.from(PASOS, (p) => p[2]);

/** Cola de prioridad (montículo binario) sobre arreglos tipados, reutilizable. */
class Monticulo {
  private claves = new Float64Array(64);
  private celdas = new Int32Array(64);
  largo = 0;

  vaciar() {
    this.largo = 0;
  }

  empujar(d: number, i: number) {
    if (this.largo === this.claves.length) {
      const c = new Float64Array(this.largo * 2);
      c.set(this.claves);
      this.claves = c;
      const v = new Int32Array(this.largo * 2);
      v.set(this.celdas);
      this.celdas = v;
    }
    let k = this.largo++;
    const claves = this.claves, celdas = this.celdas;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (claves[p] <= d) break;
      claves[k] = claves[p];
      celdas[k] = celdas[p];
      k = p;
    }
    claves[k] = d;
    celdas[k] = i;
  }

  /** Saca la celda de menor distancia; la distancia queda en `ultimaClave`. */
  ultimaClave = 0;
  sacar(): number {
    const claves = this.claves, celdas = this.celdas;
    const celda = celdas[0];
    this.ultimaClave = claves[0];
    const n = --this.largo;
    if (n > 0) {
      const d = claves[n], i = celdas[n];
      let k = 0;
      for (;;) {
        const a = 2 * k + 1;
        if (a >= n) break;
        const b = a + 1;
        const menor = b < n && claves[b] < claves[a] ? b : a;
        if (claves[menor] >= d) break;
        claves[k] = claves[menor];
        celdas[k] = celdas[menor];
        k = menor;
      }
      claves[k] = d;
      celdas[k] = i;
    }
    return celda;
  }
}

const cola = new Monticulo();

/**
 * Dijkstra desde varias celdas de origen (con distancia 0) sobre `dist` (se sobrescribe). `bloqueada`
 * marca celdas que no se pueden pisar además de los muros; nunca se corta en diagonal la esquina de
 * un muro. No pasa de `tope` metros, y si `parar(i)` da true al sacar una celda, termina ahí y la
 * devuelve (es la más cercana que cumple); si no, devuelve −1.
 */
function dijkstra(
  m: MapaListo, dist: Float32Array, origenes: number[], bloqueada: Uint8Array | null, tope = Infinity,
  parar?: (i: number) => boolean,
): number {
  // Sólo se limpian las celdas que tocó la búsqueda anterior con este arreglo (suele ser una parte
  // chica del mapa); la primera vez, todo.
  let tocadas = tocadasPor.get(dist);
  if (tocadas) for (const i of tocadas) dist[i] = Infinity;
  else {
    dist.fill(Infinity);
    tocadasPor.set(dist, (tocadas = []));
  }
  tocadas.length = 0;
  cola.vaciar();
  for (const o of origenes) {
    if (dist[o] === Infinity) tocadas.push(o);
    dist[o] = 0;
    cola.empujar(0, o);
  }
  const { ancho, alto, muro, pared } = m;
  while (cola.largo) {
    const i = cola.sacar();
    const d = cola.ultimaClave;
    if (d > dist[i]) continue;
    if (parar && parar(i)) return i;
    const x = i % ancho, y = (i - x) / ancho;
    for (let k = 0; k < 8; k++) {
      const dx = PASO_X[k], dy = PASO_Y[k];
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= ancho || ny >= alto) continue;
      const j = ny * ancho + nx;
      if (muro[j] || (bloqueada && bloqueada[j])) continue;
      // Sin cortar esquinas de paredes en diagonal (el borde de un abismo sí se puede rodear).
      if (dx && dy && (pared[y * ancho + nx] || pared[ny * ancho + x])) continue;
      const nd = d + PASO_M[k];
      if (nd < dist[j] && nd <= tope) {
        if (dist[j] === Infinity) tocadas.push(j);
        dist[j] = nd;
        // Se encola el valor ya guardado en 32 bits: si no, al sacarlo parecería mayor y se descartaría.
        cola.empujar(dist[j], j);
      }
    }
  }
  return -1;
}

/**
 * Metros que hay que caminar desde cada celda hasta quedar al lado de `c` (0 si ya está al lado;
 * Infinity si no se llega), sólo con el terreno: los cuerpos se mueven, así que no cuentan. Se
 * calcula una vez por celda de destino y queda guardado con el mapa.
 */
export function campoHacia(m: MapaListo, c: Celda): Float32Array {
  const destino = indice(m, c);
  let campo = m.campos.get(destino);
  if (campo) return campo;
  const lados: number[] = [];
  for (const [dx, dy] of PASOS) {
    const v = { x: c.x + dx, y: c.y + dy };
    if (!transitable(m, v)) continue;
    if (dx && dy && (m.pared[c.y * m.ancho + v.x] || m.pared[v.y * m.ancho + c.x])) continue;
    lados.push(indice(m, v));
  }
  campo = new Float32Array(m.ancho * m.alto);
  dijkstra(m, campo, lados, null);
  m.campos.set(destino, campo);
  return campo;
}

/**
 * Camino más corto desde `desde` sin pisar las celdas `ocupadas` (marcadas con 1) ni pasar de `tope`
 * metros, hasta la primera celda en la que `listo(i)` da true. Devuelve esa celda (−1 si no hay) y
 * deja en `m.costos` los metros hasta cada celda explorada.
 */
/** Celdas de la última búsqueda con estos costos, en orden de índice (las demás quedaron en Infinity). */
const tocadasPor = new WeakMap<Float32Array, number[]>();

/** Las celdas a las que llegó la última `buscarCamino`, de menor a mayor índice. */
export function celdasAlcanzadas(m: MapaListo): number[] {
  return [...(tocadasPor.get(m.costos) ?? [])].sort((a, b) => a - b);
}

export function buscarCamino(m: MapaListo, desde: Celda, ocupadas: Uint8Array, tope: number, listo: (i: number) => boolean): number {
  return dijkstra(m, m.costos, [indice(m, desde)], ocupadas, tope, listo);
}

/**
 * Camino de `desde` a `hasta` según los costos de la última `buscarCamino` (que tiene que haber
 * llegado a `hasta`): se vuelve por las celdas vecinas cuyo costo más el paso da el de la actual.
 */
export function caminoHasta(m: MapaListo, desde: Celda, hasta: Celda): Celda[] {
  const costo = m.costos;
  const inicio = indice(m, desde);
  const res: Celda[] = [hasta];
  let i = indice(m, hasta);
  for (let vueltas = 0; i !== inicio && vueltas < costo.length; vueltas++) {
    const x = i % m.ancho, y = (i - x) / m.ancho;
    let previo = -1;
    for (const [dx, dy, paso] of PASOS) {
      const nx = x - dx, ny = y - dy;
      if (nx < 0 || ny < 0 || nx >= m.ancho || ny >= m.alto) continue;
      const j = ny * m.ancho + nx;
      if (costo[j] === Infinity || m.muro[j]) continue;
      if (dx && dy && (m.pared[ny * m.ancho + x] || m.pared[y * m.ancho + nx])) continue;
      if (Math.abs(costo[j] + paso - costo[i]) < 1e-3) {
        previo = j;
        break;
      }
    }
    if (previo < 0) break;
    i = previo;
    res.push(celdaDe(m, i));
  }
  if (res[res.length - 1].x !== desde.x || res[res.length - 1].y !== desde.y) res.push(desde);
  return res.reverse();
}

/** Dos celdas están trabadas si se tocan, también en diagonal, sin una pared en la esquina entre ellas. */
export function adyacentes(m: MapaListo | null, a: Celda, b: Celda): boolean {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return false;
  if (!m || !dx || !dy) return true;
  return !(m.pared[a.y * m.ancho + b.x] || m.pared[b.y * m.ancho + a.x]);
}

/** Lo que ve una línea de visión: nada en medio, algo que da cobertura, o una pared que la corta. */
export type Vision = 'libre' | 'cobertura' | 'bloqueada';

/**
 * Línea de visión entre los centros de dos celdas: recorre las celdas que cruza el segmento (sin las
 * de los extremos). Una pared la corta. Si pasa justo por la esquina entre dos celdas, la cortan dos
 * paredes y una sola deja al blanco con cobertura. `estorba(i)` marca celdas que dan cobertura (los
 * cuerpos que se interponen).
 */
export function lineaDeVision(m: MapaListo, a: Celda, b: Celda, estorba?: (i: number) => boolean): Vision {
  const dx = b.x - a.x, dy = b.y - a.y;
  const nx = Math.abs(dx), ny = Math.abs(dy);
  const sx = Math.sign(dx), sy = Math.sign(dy);
  let x = a.x, y = a.y, ix = 0, iy = 0;
  let res: Vision = 'libre';
  while (ix < nx || iy < ny) {
    // Qué borde cruza primero el segmento: comparación exacta en enteros.
    const cmp = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
    if (cmp === 0) {
      const p1 = m.pared[y * m.ancho + x + sx], p2 = m.pared[(y + sy) * m.ancho + x];
      if (p1 && p2) return 'bloqueada';
      if (p1 || p2) res = 'cobertura';
      x += sx; y += sy; ix++; iy++;
    } else if (cmp < 0) {
      x += sx; ix++;
    } else {
      y += sy; iy++;
    }
    if (x === b.x && y === b.y) break;
    const i = y * m.ancho + x;
    if (m.pared[i]) return 'bloqueada';
    if (estorba && estorba(i)) res = 'cobertura';
  }
  return res;
}

/** Celda transitable y libre más cercana a `c` (búsqueda en anillos), o null si no hay ninguna. */
export function celdaLibreCerca(m: MapaListo, c: Celda, ocupadas: Set<number>): Celda | null {
  const max = Math.max(m.ancho, m.alto);
  for (let r = 0; r <= max; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const v = { x: c.x + dx, y: c.y + dy };
        if (transitable(m, v) && !ocupadas.has(indice(m, v))) return v;
      }
  return null;
}
