// Generador con semilla (sfc32), para poder repetir un combate exacto.

export interface Rng {
  /** Número en [0, 1) */
  next(): number;
}

export function crearRng(semilla: number): Rng {
  // splitmix32 para sembrar los cuatro estados de sfc32
  let s = semilla >>> 0;
  const mezclar = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  let a = mezclar(), b = mezclar(), c = mezclar(), d = mezclar();
  return {
    next() {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    },
  };
}

/** Dado de n caras: 1..n */
export function dado(rng: Rng, caras: number): number {
  return 1 + Math.floor(rng.next() * caras);
}
