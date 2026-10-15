// Los estados de la Tabla de estados (Core p.232-233, Dominus p.67): qué le pasa a quien falla la
// Resistencia, según el fracaso. Un solo lugar para todo lo que los provoque (técnicas de Ki, conjuros,
// poderes psíquicos), sea cual sea la Resistencia que se tiró.

import type { Atributo, Contexto, Luchador } from '../modelo';
import { fichaConAumento, recuperarKi, type NombreEstado } from '../ki';
import { activo } from '../calculos';
import { condicion, imponer } from '../condiciones';
import type { Motor } from './tipos';

/** Cómo se nombra cada estado en el registro. */
export const NOMBRE_ESTADO: Record<NombreEstado, string> = {
  ceguera: 'la Ceguera', coma: 'el Coma', control: 'el Control', dano: 'el Daño', dobleDano: 'el Doble daño',
  dolor: 'el Dolor', dolorExtremo: 'el Dolor extremo', drenajeVida: 'el Drenaje de vida', drenajeKi: 'el Drenaje de Ki',
  fascinacion: 'la Fascinación', inconsciencia: 'la Inconsciencia', miedo: 'el Miedo', terror: 'el Terror',
  muerte: 'la Muerte', paralisisParcial: 'la Paralización parcial', paralisisTotal: 'la Paralización total',
  penalizacionMenor: 'la Penalización a toda acción', penalizacionMayor: 'la Penalización a toda acción mayor',
  reduccionCaracteristicas: 'la Reducción de características', reduccionCaracteristica: 'la Reducción de una característica',
  reduccionRf: 'la Reducción de RF', ilusion: 'la Ilusión', debilidad: 'la Debilidad',
};

/** Estados que afectan el ánimo: se resisten sumando la Frialdad (Core p.54). */
export const ESTADOS_DE_ANIMO: ReadonlySet<NombreEstado> = new Set(['miedo', 'terror', 'fascinacion']);

/**
 * Le aplica a `def` un estado por haber fallado la Resistencia por `fracaso`. Los que duran minutos u
 * horas duran todo el combate. Ilusión no se simula; Control lo deja fuera del combate y Terror lo hace
 * huir (interpretaciones).
 */
export function aplicarEstado(
  m: Motor, ctx: Contexto, atk: Luchador, def: Luchador, estado: NombreEstado, fracaso: number,
  o: { dificultad: number; atributo?: Atributo },
) {
  const f = def.ficha;
  switch (estado) {
    case 'dano':
    case 'dobleDano':
    case 'drenajeVida': {
      const pv = estado === 'dobleDano' ? 2 * fracaso : fracaso;
      m.perderPv(ctx, atk, def, pv);
      if (estado === 'drenajeVida' && activo(atk)) {
        const cura = Math.min(pv, atk.ficha.pv - atk.pv);
        if (cura > 0) {
          atk.pv += cura;
          m.log(ctx, () => `  ${atk.ficha.nombre} absorbe ${cura} PV (${atk.pv}/${atk.ficha.pv}).`);
        }
      }
      return;
    }
    case 'drenajeKi': {
      const quita = Math.min(fracaso, def.ki?.reserva ?? 0);
      if (def.ki) def.ki.reserva -= quita;
      const gana = recuperarKi(atk, quita);
      m.log(ctx, () => `  ${def.ficha.nombre} pierde ${quita} de Ki${gana ? ` y ${atk.ficha.nombre} recupera ${gana}` : ''}.`);
      return;
    }
    case 'dolor':
    case 'dolorExtremo': {
      const dolor = estado === 'dolor' ? 'normal' : 'extremo';
      if (f.estados?.dolor !== 'extremo') m.cambiarFicha(def, { ...f, estados: { ...f.estados, dolor } });
      m.log(ctx, () => `  ${def.ficha.nombre} sufre ${dolor === 'normal' ? 'Dolor (−40' : 'Dolor extremo (−80'} a toda acción).`);
      return;
    }
    case 'miedo':
      if (!f.estados?.miedo) m.cambiarFicha(def, { ...f, estados: { ...f.estados, miedo: true } });
      m.log(ctx, () => `  ${def.ficha.nombre} queda con Miedo (−60 a toda acción).`);
      return;
    case 'ceguera':
      imponer(def, 'ceguera', { nivel: 2, asaltos: Infinity });
      m.log(ctx, () => `  ${def.ficha.nombre} queda ciego.`);
      return;
    case 'paralisisParcial':
    case 'paralisisTotal': {
      const grado = estado === 'paralisisParcial' ? 2 : 3;
      // Una parálisis más fuerte que todavía dura no se pisa.
      const previa = condicion(def, 'paralisis');
      if (!previa || previa.nivel <= grado) imponer(def, 'paralisis', { nivel: grado, asaltos: Math.max(previa?.asaltos ?? 0, fracaso) });
      m.log(ctx, () => `  ${def.ficha.nombre} queda en ${grado === 2 ? 'parálisis parcial' : 'parálisis completa'} ${fracaso} asaltos.`);
      return;
    }
    case 'penalizacionMenor':
      def.penDolor += fracaso;
      m.log(ctx, () => `  ${def.ficha.nombre} sufre −${fracaso} a toda acción (baja 5 por asalto).`);
      return;
    case 'penalizacionMayor':
      def.penFisico += fracaso;
      m.log(ctx, () => `  ${def.ficha.nombre} sufre −${fracaso} a toda acción.`);
      return;
    case 'reduccionRf':
      m.cambiarFicha(def, { ...f, rf: f.rf - fracaso });
      m.log(ctx, () => `  ${def.ficha.nombre} pierde ${fracaso} de RF.`);
      return;
    // Debilidad: −1 a Fuerza, Destreza, Agilidad y Constitución por cada 10 de fracaso; se recupera
    // por horas, o sea que dura el combate (Core p.233).
    case 'debilidad':
    case 'reduccionCaracteristica':
    case 'reduccionCaracteristicas': {
      const puntos = Math.floor(fracaso / 10);
      if (!puntos) return;
      const cuales: Atributo[] = estado === 'reduccionCaracteristicas' ? ['AGI', 'CON', 'DES', 'FUE', 'INT', 'PER', 'POD', 'VOL']
        : estado === 'debilidad' ? ['FUE', 'DES', 'AGI', 'CON'] : [o.atributo ?? 'FUE'];
      let g = f;
      for (const a of cuales) {
        const v = g.atributos?.[a] ?? 5;
        g = a === 'AGI' || a === 'CON' || a === 'DES' || a === 'FUE'
          ? fichaConAumento(g, a, v, Math.max(1, v - puntos))
          : { ...g, atributos: { ...g.atributos, [a]: Math.max(1, v - puntos) } };
      }
      m.cambiarFicha(def, g);
      m.log(ctx, () => `  ${def.ficha.nombre} pierde ${puntos} en ${cuales.join(', ')}.`);
      return;
    }
    case 'fascinacion':
      def.fascinado = o.dificultad;
      m.log(ctx, () => `  ${def.ficha.nombre} queda fascinado: no puede hacer acciones activas.`);
      return;
    case 'inconsciencia':
    case 'coma':
      m.log(ctx, () => `  ${def.ficha.nombre} queda inconsciente.`);
      m.caer(ctx, atk, def, 'inconsciente');
      return;
    case 'muerte':
      m.log(ctx, () => `  ${def.ficha.nombre} muere.`);
      m.caer(ctx, atk, def, 'muerto');
      return;
    case 'control':
      m.log(ctx, () => `  ${def.ficha.nombre} queda bajo el control de ${atk.ficha.nombre}: deja de pelear.`);
      m.huir(ctx, def);
      return;
    case 'terror':
      m.log(ctx, () => `  ${def.ficha.nombre} queda aterrorizado.`);
      m.huir(ctx, def);
      return;
    case 'ilusion':
      // No se simula: engaña los sentidos, no cambia el combate.
      return;
    default: {
      const sinTratar: never = estado;
      throw new Error(`Estado sin tratar: ${sinTratar}`);
    }
  }
}
