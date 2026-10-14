// Distribución exacta de "d100 abierta del atacante − d100 abierta del defensor", precalculada una
// vez. La IA la consulta en vez de tirar dados: cada pregunta cuesta unas decenas de operaciones.

/** Tiradas abiertas encadenadas que se modelan. La 9ª abierta seguida tiene probabilidad < 1e-8. */
const PROFUNDIDAD = 8;
const MAXV = 100 * (PROFUNDIDAD + 1);

/** Distribución del total de una cadena que empieza con una tirada de umbral `umbral`. */
function cadena(umbral: number, nivel: number): Float64Array {
  const out = new Float64Array(MAXV + 1);
  const sub = nivel < PROFUNDIDAD ? cadena(umbral + 1, nivel + 1) : null;
  for (let r = 1; r <= 100; r++) {
    if (sub && (r >= umbral || r === 100)) {
      for (let v = 0; v + r <= MAXV; v++) if (sub[v] !== 0) out[v + r] += 0.01 * sub[v];
    } else {
      out[r] += 0.01;
    }
  }
  return out;
}

let cadenaDesde91: Float64Array | null = null;

/** Tirada completa sin las pifias (masa total = 1 − P(pifia)). Índice = valor. */
function tiradaSinPifia(umbralPifia: number): { pmf: Float64Array; pPifia: number } {
  cadenaDesde91 ??= cadena(91, 1);
  const pmf = new Float64Array(MAXV + 1);
  for (let r = umbralPifia + 1; r <= 100; r++) {
    if (r >= 90) {
      for (let v = 0; v + r <= MAXV; v++) pmf[v + r] += 0.01 * cadenaDesde91[v];
    } else {
      pmf[r] += 0.01;
    }
  }
  return { pmf, pPifia: umbralPifia / 100 };
}

const OFF_DEF = 100;

/** Tirada de defensa con pifias incluidas: una pifia vale natural − nivel. Índice = valor + 100. */
function tiradaDefensa(umbralPifia: number): Float64Array {
  const { pmf } = tiradaSinPifia(umbralPifia);
  const out = new Float64Array(MAXV + OFF_DEF + 1);
  for (let v = 0; v <= MAXV; v++) out[v + OFF_DEF] = pmf[v];
  for (let r = 1; r <= umbralPifia; r++)
    for (let nivel = 1; nivel <= 100; nivel++) out[r - nivel + OFF_DEF] += 0.0001;
  return out;
}

export class TablaEnfrentamiento {
  /** P(D = d) para ataques no pifiados, índice d + OFF. */
  private readonly pmf: Float64Array;
  /** P(D >= d), índice d + OFF. */
  private readonly ge: Float64Array;
  private readonly OFF = MAXV;
  readonly pPifiaAtaque: number;
  private readonly masa: number;

  constructor(umbralAtaque: number, umbralDefensa: number, sinDefensa: boolean) {
    const ataque = tiradaSinPifia(umbralAtaque);
    this.pPifiaAtaque = ataque.pPifia;
    this.masa = 1 - ataque.pPifia;
    const largo = 2 * MAXV + OFF_DEF + 1;
    this.pmf = new Float64Array(largo);
    if (sinDefensa) {
      for (let a = 0; a <= MAXV; a++) this.pmf[a + this.OFF] = ataque.pmf[a];
    } else {
      const def = tiradaDefensa(umbralDefensa);
      for (let a = 0; a <= MAXV; a++) {
        const pa = ataque.pmf[a];
        if (pa === 0) continue;
        for (let j = 0; j < def.length; j++) {
          const pd = def[j];
          if (pd === 0) continue;
          const d = a - (j - OFF_DEF);
          this.pmf[d + this.OFF] += pa * pd;
        }
      }
    }
    this.ge = new Float64Array(largo + 1);
    for (let i = largo - 1; i >= 0; i--) this.ge[i] = this.ge[i + 1] + this.pmf[i];

    // pct[i] = Σ_{j>=1} P(D >= k + 10j) con k = i − OFF, así porcentajeEsperado es una lectura.
    this.pct = new Float64Array(largo + 1);
    for (let i = largo; i >= 0; i--) {
      const sig = i + 10;
      this.pct[i] = sig <= largo ? this.ge[sig] + this.pct[sig] : 0;
    }

    // bono[s + OFF_S] = E[bono de contra · 1{contra}] para cada ventaja s en [−OFF_S, OFF_S].
    this.bono = new Float64Array(2 * OFF_S + 1);
    for (let s = -OFF_S; s <= OFF_S; s++) {
      let suma = this.pPifiaAtaque * 50.5;
      for (let r = -299; r <= -1; r++) {
        const i = r - s + this.OFF;
        if (i >= 0 && i < this.pmf.length) suma += this.pmf[i] * Math.floor(-r / 10) * 5;
      }
      suma += 150 * (this.masa - this.alMenos(-299 - s));
      this.bono[s + OFF_S] = suma;
    }
  }

  private readonly pct: Float64Array;
  private readonly bono: Float64Array;

  /** P(D >= k) sin contar pifias de ataque. */
  private alMenos(k: number): number {
    // La IA pasa ventajas no enteras (bonos medios): sin redondear, el índice da undefined.
    const i = Math.round(k) + this.OFF;
    if (i <= 0) return this.masa;
    if (i >= this.ge.length) return 0;
    return this.ge[i];
  }

  /** `s` = habilidad final de ataque − habilidad final de defensa (sin dados). */
  pImpacto(s: number): number {
    return this.alMenos(1 - s);
  }

  /** P(el defensor gana la contra): resultado negativo o pifia del atacante. */
  pContra(s: number): number {
    return this.pPifiaAtaque + (this.masa - this.alMenos(-s));
  }

  /** P(% de daño >= pct), con pct múltiplo de 10 y >= 10. */
  pPorcentajeAlMenos(s: number, abs: number, pct: number): number {
    return this.alMenos(pct + abs - s);
  }

  /** % de daño esperado (0 a cientos). */
  porcentajeEsperado(s: number, abs: number): number {
    const i = Math.round(abs - s) + this.OFF;
    if (i < 0) {
      // Ventaja enorme: todo impacta; cada 10 de ventaja extra suma 10% seguro.
      return 10 * (this.pct[0] + (Math.ceil(-i / 10) * this.masa));
    }
    return i >= this.pct.length ? 0 : 10 * this.pct[i];
  }

  /** E[bono de contra · 1{hay contra}]. Dividir por pContra para el bono medio condicionado. */
  bonoContraEsperado(s: number): number {
    const i = Math.max(-OFF_S, Math.min(OFF_S, Math.round(s))) + OFF_S;
    return this.bono[i];
  }
}

/** Rango de ventajas precalculado para el bono de contra. Fuera de él el valor ya no cambia. */
const OFF_S = 1000;

// Índice directo: umbral de ataque (1-3) × umbral de defensa (1-3, o 0 sin defensa).
const cache: (TablaEnfrentamiento | undefined)[] = [];

/** Tabla para un umbral de pifia del atacante y otro del defensor (1-3, ver `umbralPifia`). */
export function tabla(umbralAtaque: number, umbralDefensa: number, sinDefensa: boolean): TablaEnfrentamiento {
  // Sin defensa, el umbral del defensor no importa: comparten tabla.
  const clave = umbralAtaque * 4 + (sinDefensa ? 0 : umbralDefensa);
  return (cache[clave] ??= new TablaEnfrentamiento(umbralAtaque, umbralDefensa, sinDefensa));
}

// Ataque en área: una sola tirada de ataque contra varios defensores (Core p.92).
const cdfDefensa: (Float64Array | undefined)[] = [];
const ataqueSinPifia: ({ pmf: Float64Array; pPifia: number } | undefined)[] = [];

/** P(tirada de defensa ≤ x), con pifias (natural − nivel). */
function cdf(umbral: number): Float64Array {
  let c = cdfDefensa[umbral];
  if (!c) {
    const d = tiradaDefensa(umbral);
    c = new Float64Array(d.length);
    let acum = 0;
    for (let i = 0; i < d.length; i++) c[i] = acum += d[i];
    cdfDefensa[umbral] = c;
  }
  return c;
}

/**
 * Probabilidad de que un ataque en área llegue a cada blanco, en orden: un blanco que para y le
 * queda contra (resultado negativo) lo intercepta, y los siguientes no se defienden. La tirada de
 * ataque es la misma para todos, así que no son independientes: se suma sobre cada valor de la
 * tirada. `s` = ataque final − defensa final de cada uno. Condicionado a que el ataque no se pifie.
 */
export function pLlegaArea(umbralAtaque: number, blancos: { s: number; umbralDefensa: number; para: boolean }[]): number[] {
  const atk = (ataqueSinPifia[umbralAtaque] ??= tiradaSinPifia(umbralAtaque));
  const masa = 1 - atk.pPifia;
  const cdfs = blancos.map((b) => cdf(b.umbralDefensa));
  const llega = new Array<number>(blancos.length).fill(0);
  for (let a = 0; a <= MAXV; a++) {
    const pa = atk.pmf[a];
    if (pa < 1e-12) continue;
    let sigue = pa / masa;
    for (let k = 0; k < blancos.length; k++) {
      llega[k] += sigue;
      if (!blancos[k].para) continue;
      // No hay contra si la defensa no supera ataque + ventaja: D ≤ a + s.
      const i = Math.floor(a + blancos[k].s) + OFF_DEF;
      const c = cdfs[k];
      sigue *= i < 0 ? 0 : i >= c.length ? 1 : c[i];
    }
  }
  return llega;
}
