// Cachés que valen lo que dura una decisión de la IA. Está aparte (sin depender de nada) para que
// cualquier módulo de la IA pueda crear las suyas al cargarse, sin importar el orden de carga.

/**
 * Caché que vale lo que dura una decisión (el estado real no cambia en ella): se vacía con cada decisión
 * nueva y se aparta entera mientras dura una hipótesis (`conCambio`), sin copiar lo que tiene.
 */
export class CacheDecision<K, V> {
  private actual = new Map<K, V>();
  /** La de la hipótesis anterior, ya vacía: se reusa en vez de crear otra (menos basura). */
  private libre: Map<K, V> | null = null;
  get(k: K): V | undefined {
    return this.actual.get(k);
  }
  set(k: K, v: V): this {
    this.actual.set(k, v);
    return this;
  }
  clear() {
    // Vaciar un Map ya vacío igual reserva memoria nueva: se evita.
    if (this.actual.size) this.actual.clear();
  }
  /** Deja una vacía y devuelve la que tenía. */
  apartar(): Map<K, V> {
    const m = this.actual;
    this.actual = this.libre ?? new Map();
    this.libre = null;
    return m;
  }
  reponer(m: Map<K, V>) {
    const usada = this.actual;
    if (usada.size) usada.clear();
    this.libre = usada;
    this.actual = m;
  }
}

/** Cachés de otros módulos que valen lo que dura una decisión. */
const cachesDeDecision: CacheDecision<unknown, unknown>[] = [];

/** Una caché que se vacía con cada decisión nueva, como la de `base`. */
export function cacheDeDecision<K, V>(): CacheDecision<K, V> {
  const m = new CacheDecision<K, V>();
  cachesDeDecision.push(m as CacheDecision<unknown, unknown>);
  return m;
}


/** Vacía todas (una decisión nueva). */
export function vaciarCaches() {
  for (const c of cachesDeDecision) c.clear();
}

/** Aparta todas (empieza una hipótesis) y devuelve lo que tenían. */
export function apartarCaches(): Map<unknown, unknown>[] {
  return cachesDeDecision.map((c) => c.apartar());
}

/** Repone lo apartado (termina la hipótesis). */
export function reponerCaches(g: Map<unknown, unknown>[]) {
  cachesDeDecision.forEach((c, i) => c.reponer(g[i]));
}
