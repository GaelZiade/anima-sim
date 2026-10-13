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
export const BONO_DEFENSA_TOTAL = 30;
export const PEN_RESISTIR_GOLPE = 80;
export const PEN_ACCION_ACTIVA = 25;
export const BONO_CANSANCIO = 15;
export const MAX_CANSANCIO_ASALTO = 2;
export const DIFERENCIA_SORPRESA = 150;
/** Tabla 52 */
export const PEN_PIFIA_TURNO: Record<number, number> = { 1: -125, 2: -100, 3: -75 };

/** Core p.97: un único golpe que quita la mitad de los PV actuales (o más) es crítico. */
export function esCritico(dano: number, pvActuales: number): boolean {
  return pvActuales > 0 && dano > 0 && dano * 2 >= pvActuales;
}

/** Core p.86: sorpresa con una diferencia final de iniciativa de 150 o más. */
export function haySorpresa(diferencia: number, umbral = DIFERENCIA_SORPRESA): boolean {
  return diferencia >= umbral;
}

export function esMaestro(habilidad: number): boolean {
  return habilidad > 200;
}
