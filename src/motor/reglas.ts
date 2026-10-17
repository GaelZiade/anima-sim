// Reglas puras del combate físico (Core Exxet, cap. 9). Sin estado ni azar.

export type TipoAtaque = 'FIL' | 'CON' | 'PEN' | 'CAL' | 'ELE' | 'FRI' | 'ENE';
export type TamanoArma = 'P' | 'M' | 'G';

/** Penalizador a todos los ataques por cada ataque adicional declarado (Core p.90). */
export const PEN_ATAQUE_ADICIONAL: Record<TamanoArma, number> = { P: 20, M: 30, G: 40 };

/** Un ataque adicional por cada 100 puntos de ataque. */
export function maxAtaques(ataque: number): number {
  return 1 + Math.max(0, Math.floor(ataque / 100));
}

/** Penalizador a la defensa según cuántas defensas ya hizo en el asalto (Tabla 44). */
export function penDefensaAdicional(defensasPrevias: number): number {
  return [0, 30, 50, 70][defensasPrevias] ?? 90;
}

export function absorcion(ta: number): number {
  return 20 + 10 * ta;
}

/** % de daño: lo que supera la absorción, en grupos de 10. Menos de 10 no daña. */
export function porcentajeDano(resultado: number, abs: number): number {
  const x = resultado - abs;
  return x < 10 ? 0 : Math.floor(x / 10) * 10;
}

export function danoFinal(base: number, porcentaje: number): number {
  return Math.floor((base * porcentaje) / 100);
}

/** Bono de la Acción Respuesta: mitad del resultado, redondeada a 5 hacia abajo, máximo +150. */
export function bonoContraataque(resultado: number): number {
  return Math.min(150, Math.floor(-resultado / 10) * 5);
}

/** Nivel de crítico: daño + d100; el exceso sobre 200 se reduce a la mitad. Acumulación: a la mitad. */
export function nivelCritico(dano: number, d100: number, acumulacion: boolean): number {
  let n = dano + d100;
  if (n > 200) n = 200 + Math.floor((n - 200) / 2);
  return acumulacion ? Math.floor(n / 2) : n;
}

export type Localizacion = 'torso' | 'corazon' | 'extremidad' | 'cabeza';

/** Tabla 51 simplificada a lo que cambia el resultado del combate. */
export function localizar(d100: number): Localizacion {
  if (d100 <= 48) return 'torso';
  if (d100 <= 50) return 'corazon';
  if (d100 <= 90) return 'extremidad';
  return 'cabeza';
}

/**
 * Qué extremidad, por la misma tirada de la Tabla 51: 51-60 el brazo derecho (el del arma), 61-70 el
 * izquierdo, 71-90 una pierna.
 */
export function extremidadDe(d100: number): 'brazoArma' | 'brazo' | 'pierna' {
  return d100 <= 60 ? 'brazoArma' : d100 <= 70 ? 'brazo' : 'pierna';
}

/**
 * Tabla 48 (Core p.96): dificultad que el ataque final de un disparo debe superar para llegar al
 * blanco, por distancia (Media 80, Difícil 120, Muy difícil 140, Absurdo 180, Casi imposible 240,
 * Imposible 280; Tabla 7). A bocajarro (menos de 1 m), Fácil 40.
 */
export function dificultadDisparo(metros: number): number {
  return metros < 1 ? 40 : metros <= 10 ? 80 : metros <= 50 ? 120 : metros <= 150 ? 140 : metros <= 500 ? 180 : metros <= 1000 ? 240 : 280;
}

/**
 * Tabla 49 (Core p.96): penalizador a la defensa contra un proyectil. Disparado: parada −80 (con
 * maestría −20), esquiva −30 (con maestría, nada). Lanzado: parada −50 (con maestría, nada), esquiva
 * nada.
 */
export function penDefensaProyectil(campo: 'parada' | 'esquiva', maestro: boolean, clase: 'disparo' | 'lanzamiento' = 'disparo', escudo = false): number {
  // Con escudo: −30 contra disparos (nada si es maestro) y nada contra lanzamientos (Core p.79).
  if (campo === 'parada' && escudo) return clase === 'disparo' && !maestro ? 30 : 0;
  if (clase === 'lanzamiento') return campo === 'parada' && !maestro ? 50 : 0;
  return campo === 'parada' ? (maestro ? 20 : 80) : maestro ? 0 : 30;
}

/** Tabla 27. Sólo aplica si gastó cansancio y le quedan 4 o menos. */
export function negativoCansancio(actual: number, maximo: number): number {
  if (actual >= maximo || actual > 4) return 0;
  return [120, 80, 40, 20, 10][Math.max(0, actual)];
}

/** Tabla 25: metros por asalto según el tipo de movimiento. */
const METROS_TM = [0, 0.5, 4, 8, 15, 20, 22, 25, 28, 32, 35, 40, 50, 80, 150, 250, 500, 1000, 5000, 25000];
export function metrosPorAsalto(tipoMovimiento: number): number {
  return METROS_TM[Math.max(0, Math.min(19, Math.round(tipoMovimiento)))];
}

export type Posicion = 'frente' | 'flanco' | 'espalda';

/** Core p.90: hasta 3 enemigos al frente, el 4º y 5º de flanco, el 6º en adelante a la espalda. */
export function posicionPorOrden(indice: number): Posicion {
  return indice < 3 ? 'frente' : indice < 5 ? 'flanco' : 'espalda';
}

/** Tabla 43 (parcial). */
export const MOD_POSICION: Record<Posicion, { ataque: number; defensa: number }> = {
  frente: { ataque: 0, defensa: 0 },
  flanco: { ataque: -10, defensa: -30 },
  espalda: { ataque: -30, defensa: -80 },
};

export const MOD_SORPRESA_DEFENSA = -90;
export const PEN_RESISTIR_GOLPE = 80;
export const PEN_ACCION_ACTIVA = 25;
export const BONO_CANSANCIO = 15;
export const MAX_CANSANCIO_ASALTO = 2;
export const DIFERENCIA_SORPRESA = 150;

/** Core p.97: un único golpe que quita la mitad de los PV actuales (o más) es crítico. */
export function esCritico(dano: number, pvActuales: number): boolean {
  return pvActuales > 0 && dano > 0 && dano * 2 >= pvActuales;
}

/** Core p.86: sorpresa con una diferencia final de iniciativa de 150 o más. */
export function haySorpresa(diferencia: number, umbral = DIFERENCIA_SORPRESA): boolean {
  return diferencia >= umbral;
}

/** Maestría: "cuando un personaje llega a tener una habilidad final de 200" (Core p.17). */
export function esMaestro(habilidad: number): boolean {
  return habilidad >= 200;
}

/**
 * Mayor natural con que se pifia (Core p.10): 1-3; con maestría (200 o más, Core p.17) 1-2. `ajuste` es el de
 * las ventajas: Buena suerte −1, Mala suerte +2 (Core p.21, p.25). Un arma Compleja pifia con dos
 * más salvo con maestría (Core p.76).
 */
export function umbralPifia(habilidad: number, ajuste = 0, compleja = false): number {
  const maestria = esMaestro(habilidad);
  return Math.max(0, (maestria ? 2 : 3) + ajuste + (compleja && !maestria ? 2 : 0));
}

/**
 * Tabla 52: penalizador al turno de quien pifia la iniciativa, sólo para calcular la sorpresa. La
 * tabla llega a 3; con Mala suerte (pifia con 4 o 5) se toma −75 (interpretación).
 */
export function penPifiaTurno(natural: number): number {
  return natural <= 1 ? -125 : natural === 2 ? -100 : -75;
}

/** Tabla 13 (Core p.54): bono de la Frialdad a las Resistencias contra efectos sobre el ánimo. */
export function bonoFrialdad(frialdad: number): number {
  const tramos: [number, number][] = [[320, 40], [280, 35], [240, 30], [180, 25], [140, 20], [120, 15], [80, 10], [40, 5]];
  return tramos.find(([n]) => frialdad >= n)?.[1] ?? 0;
}

/** Resultado de un control de Resistencia: si falla y por cuánto (0 si resiste o falla por un empate). */
export interface Resistencia {
  falla: boolean;
  fracaso: number;
}

/**
 * Control de Resistencia (Core p.13): 1d100 sin tirada abierta más la Resistencia; la pasa si supera la
 * dificultad (un empate no la supera), y un 100 natural siempre la pasa.
 */
export function resultadoResistencia(base: number, dado: number, dificultad: number): Resistencia {
  const falla = dado !== 100 && base + dado <= dificultad;
  return { falla, fracaso: falla ? dificultad - (base + dado) : 0 };
}

