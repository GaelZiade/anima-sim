// Efectos de la vía del Fuego (Core p.155-159): Incinerar, Tormenta de Fuego, Mitigar Fuego, Barrera de
// Fuego, Mina de Fuego, Crear Fuego y Control sobre el Fuego.

import { activo, distancia, resistenciaCalor } from '../calculos';
import { DADO_FIJO, tirarD100Cerrada } from '../dados';
import type { Golpe } from '../golpe';
import { dejarDeMantener, estadoLlamas, golpeDeConjuro, mantenidoCon, RANURA_MAGIA, type Mantenido } from '../magia';
import type { Conjuro, Grado } from '../conjuros';
import type { Contexto, Luchador } from '../modelo';
import { amenaza, enemigos, lambda } from '../ia';
import { danoEsperado, enAlcance, faltaParaLlegar, metrosTotales } from '../calculos';
import { ZEON_CONTROL_DEL_ESPACIO } from '../magia';
import type { ManejadorEfecto, Motor } from './tipos';
import {
  aLaVista, ASALTOS_EFECTO, danoDeLlamas, defensaContraConjuro, fallaResistencia, precioZeon, resistencias, valorPrender,
} from './valorar';

/** Incinerar (Core p.158): RM o se prende, con una tirada con bono en la Tabla 76. */
function intentarIncinerar(m: Motor, ctx: Contexto, l: Luchador, b: Luchador, rm: number, bono: number) {
  if (!m.tirarResistencia(ctx, b, rm, 'Incinerar', 'RM', resistenciaCalor(b))) return;
  m.prender(ctx, l, b, tirarD100Cerrada(ctx.rng) + bono);
}

/**
 * Control sobre el Fuego (Core p.157): a un ser de fuego que no supere la RM lo domina (deja de pelear);
 * sobre alguien en llamas sube o baja su fuego 20 por intensidad en la Tabla 76 (interpretación).
 */
function controlarFuego(m: Motor, ctx: Contexto, l: Luchador, b: Luchador, g: Grado) {
  if (b.equipo !== l.equipo && b.ficha.naturaleza?.includes('fuego')) {
    if (m.tirarResistencia(ctx, b, g.rm ?? 0, 'Control sobre el Fuego', 'RM')) {
      m.log(ctx, () => `  ${b.ficha.nombre} queda bajo el control de ${l.ficha.nombre}: deja de pelear.`);
      m.huir(ctx, b);
    }
    return;
  }
  if (b.equipo === l.equipo) return m.mitigarFuego(ctx, b, g.intensidades ?? 0);
  if (!b.llamas) return;
  b.llamas += 20 * (g.intensidades ?? 0);
  m.log(ctx, () => `  Las llamas de ${b.ficha.nombre} crecen: ${estadoLlamas(b.llamas)} (${b.llamas}).`);
}

/**
 * Barrera de Fuego (Core p.157): un muro de fuego entre el mago y `hacia`, a un par de metros de él y
 * perpendicular a esa línea (interpretación); quien lo cruza sufre un ataque automático de calor. Si no
 * tiene otro escudo, lo usa además como escudo mágico contra calor y frío.
 */
function levantarBarrera(m: Motor, ctx: Contexto, l: Luchador, hacia: Luchador, c: Conjuro, g: Grado) {
  const x = mantenidoCon(l, c);
  if (!x) return;
  const d = Math.max(1e-6, distancia(l, hacia));
  const ux = (hacia.pos.x - l.pos.x) / d, uy = (hacia.pos.y - l.pos.y) / d;
  const cx = l.pos.x + ux * Math.min(2, d / 2), cy = l.pos.y + uy * Math.min(2, d / 2);
  const medio = (g.metros ?? 2) / 2;
  x.muro = { x1: cx - uy * medio, y1: cy + ux * medio, x2: cx + uy * medio, y2: cy - ux * medio };
  m.log(ctx, () => `  Se levanta un muro de fuego de ${g.metros} m entre ${l.ficha.nombre} y ${hacia.ficha.nombre}.`);
}

/** Cruzar un muro de fuego: ataque automático de calor de quien lo levantó (Core p.157). */
export function cruzarMuros(m: Motor, ctx: Contexto, l: Luchador, desde: { x: number; y: number }) {
  for (const dueno of ctx.luchadores) {
    for (const x of dueno.magia?.mantenidos ?? []) {
      const w = x.muro;
      if (!w || !activo(l) || !seCruzan(desde, l.pos, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 })) continue;
      const g = x.conjuro.grados[x.grado];
      const golpe: Golpe = { maniobra: 'normal', esContra: false, tipo: 'CAL', ranura: RANURA_MAGIA, ki: golpeDeConjuro(x.conjuro, g), aDistancia: true };
      m.resolverDefensa(ctx, dueno, l, g.habilidad ?? 240, DADO_FIJO, golpe, `${l.ficha.nombre} atraviesa la Barrera de Fuego de ${dueno.ficha.nombre}`);
    }
  }
}

/** Los segmentos ab y cd se cruzan. */
function seCruzan(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }): boolean {
  const lado = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return lado(a, b, c) * lado(a, b, d) < 0 && lado(c, d, a) * lado(c, d, b) < 0;
}

/** Habilidad del ataque automático de la Mina de Fuego a esa distancia del centro (Core p.157). */
export function habilidadMina(d: number, radio: number): number {
  return d < 1 ? 320 : d < radio / 2 ? 280 : 240;
}

/**
 * Mina de Fuego (Core p.157): al estallar, ataque automático de calor a todos los del radio (con Control
 * del Espacio, sólo a los enemigos): 240 a más de la mitad del radio, 280 a menos, 320 a menos de un
 * metro del centro. Estallarla es una acción activa.
 */
export function detonarMina(m: Motor, ctx: Contexto, l: Luchador, x: Mantenido, control: boolean) {
  const z = x.zona!;
  const g = x.conjuro.grados[x.grado];
  dejarDeMantener(l, x);
  if (control) l.magia!.reserva -= 10;
  m.log(ctx, () => `${l.ficha.nombre} hace estallar la Mina de Fuego${control ? ' (Control del Espacio, 10 de zeon)' : ''}.`);
  for (const b of ctx.luchadores) {
    const d = Math.hypot(b.pos.x - z.x, b.pos.y - z.y);
    if (!activo(b) || d > z.radio || (control && b.equipo === l.equipo)) continue;
    const golpe: Golpe = { maniobra: 'normal', esContra: false, tipo: 'CAL', ranura: RANURA_MAGIA, ki: golpeDeConjuro(x.conjuro, g), aDistancia: true, area: z.radio, centroArea: { x: z.x, y: z.y } };
    m.resolverDefensa(ctx, l, b, habilidadMina(d, z.radio), DADO_FIJO, golpe, `La mina alcanza a ${b.ficha.nombre} (a ${d.toFixed(0)} m)`);
    if (m.terminado(ctx)) return;
  }
}

export const incinerar: ManejadorEfecto = {
  resolver(m, { ctx, l, x, g }) {
    for (const b of x.blancos ?? []) if (activo(b)) intentarIncinerar(m, ctx, l, b, g.rm ?? 0, g.llamas ?? 0);
  },
  valorar({ ctx, l, c, i, g, probar }) {
    const blancos: Luchador[] = [];
    let v = 0;
    for (const b of enemigos(ctx, l)) {
      if (!aLaVista(ctx, l, b, g.radio ?? 0)) continue;
      const valor = fallaResistencia(resistencias(b).rm + resistenciaCalor(b), g.rm ?? 0).p * valorPrender(b, g.llamas ?? 0);
      if (valor > 0) {
        blancos.push(b);
        v += valor;
      }
    }
    if (blancos.length) probar({ conjuro: c, grado: i, objetivo: null, blancos }, v);
  },
};

/**
 * Tormenta de Fuego (Core p.159): cada asalto desde el siguiente al lanzamiento, los de la zona sufren un
 * ataque automático (el motor lo resuelve con la zona del mantenido).
 */
export const tormenta: ManejadorEfecto = {
  resolver(m, { ctx, l, x, c, g, obj }) {
    if (!obj) return;
    mantenidoCon(l, c)!.zona = { x: obj.pos.x, y: obj.pos.y, radio: g.area ?? 0, desde: ctx.asalto + 1, excluye: x.control ? 'aliados' : 'nadie' };
    m.log(ctx, () => `  La tormenta cubre ${g.area} m alrededor de donde está ${obj.ficha.nombre}: ataca desde el asalto siguiente.`);
  },
  valorar({ ctx, l, c, i, g, alcance, probar, signo }) {
    const ki = golpeDeConjuro(c, g);
    for (const obj of enemigos(ctx, l)) {
      if (!aLaVista(ctx, l, obj, alcance)) continue;
      const control = !!l.ficha.magia?.controlDelEspacio && ctx.luchadores.some((x) => x.equipo === l.equipo && activo(x) && distancia(x, obj) <= g.area!);
      let v = 0;
      for (const b of ctx.luchadores) {
        if (!activo(b) || distancia(b, obj) > g.area! || (control && b.equipo === l.equipo)) continue;
        // El ataque automático no tira: su habilidad es la final (aproximación: la media de una tirada menos).
        const dano = danoEsperado(l, b, (g.habilidad ?? 0) - 55, defensaContraConjuro(b, l, ki, g.area), { ki, tipo: c.ta, ranura: RANURA_MAGIA, area: g.area });
        v += signo(b) * Math.min(Math.max(0, b.pv), (ASALTOS_EFECTO - 1) * dano);
      }
      probar({ conjuro: c, grado: i, objetivo: obj, control }, v, (control ? ZEON_CONTROL_DEL_ESPACIO : 0) * precioZeon(l));
    }
  },
};

/** Mitigar Fuego (Core p.155): le baja el fuego a un aliado; a un ser de fuego, 5 de daño por intensidad (25 con acumulación) si no supera la RM. */
export const mitigar: ManejadorEfecto = {
  sobre: 'objetivo',
  resolver(m, { ctx, l, c, g, obj }) {
    if (!obj) return;
    if (obj.equipo !== l.equipo && obj.ficha.naturaleza?.includes('fuego')) {
      if (m.tirarResistencia(ctx, obj, g.rm ?? 0, c.nombre, 'RM')) m.perderPv(ctx, l, obj, (obj.ficha.acumulacion ? 25 : 5) * (g.intensidades ?? 0));
    } else m.mitigarFuego(ctx, obj, g.intensidades ?? 0);
  },
  valorar({ ctx, l, c, i, g, alcance, probar }) {
    for (const a of ctx.luchadores) {
      if (!activo(a) || distancia(l, a) > alcance) continue;
      // Un ser de fuego enemigo: 5 de daño por intensidad si no supera la RM.
      if (a.equipo !== l.equipo && a.ficha.naturaleza?.includes('fuego')) {
        const p = fallaResistencia(resistencias(a).rm, g.rm ?? 0).p;
        probar({ conjuro: c, grado: i, objetivo: a }, p * (a.ficha.acumulacion ? 25 : 5) * (g.intensidades ?? 0));
        continue;
      }
      if (a.equipo !== l.equipo || !a.llamas) continue;
      const queda = Math.max(0, a.llamas - 20 * (g.intensidades ?? 0));
      probar({ conjuro: c, grado: i, objetivo: a }, lambda(l) * (danoDeLlamas(a, a.llamas) - danoDeLlamas(a, queda < 100 ? 0 : queda)));
    }
  },
};

export const barrera: ManejadorEfecto = {
  resolver(m, { ctx, l, c, g, obj }) {
    if (obj) levantarBarrera(m, ctx, l, obj, c, g);
  },
  valorar({ ctx, l, e, c, i, g, probar }) {
    // Un muro entre él y quien viene hacia él: cada uno que lo cruce recibe un ataque automático.
    if (e.mantenidos.some((x) => x.muro)) return;
    const ki = golpeDeConjuro(c, g);
    const vienen = enemigos(ctx, l).filter((x) => !enAlcance(l, x) && faltaParaLlegar(x, l) <= 2 * metrosTotales(x) && !x.ficha.armasDistancia?.length);
    if (!vienen.length) return;
    const obj = vienen.sort((a, b) => distancia(l, a) - distancia(l, b))[0];
    let v = 0;
    for (const x of vienen) v += danoEsperado(l, x, (g.habilidad ?? 240) - 55, defensaContraConjuro(x, l, ki), { ki, tipo: 'CAL', ranura: RANURA_MAGIA });
    probar({ conjuro: c, grado: i, objetivo: obj }, v);
  },
};

export const mina: ManejadorEfecto = {
  resolver(m, { ctx, l, c, g, obj }) {
    if (!obj) return;
    const x = mantenidoCon(l, c)!;
    x.zona = { x: obj.pos.x, y: obj.pos.y, radio: g.area ?? 0, desde: Infinity, excluye: 'nadie' };
    m.log(ctx, () => `  La mina queda donde está ${obj.ficha.nombre} (${g.area} m de radio); estalla cuando ${l.ficha.nombre} quiera.`);
  },
  valorar({ ctx, l, e, c, i, g, alcance, probar }) {
    // Donde más enemigos haya en el radio; se descuenta que se muevan antes de que estalle.
    if (e.mantenidos.some((x) => x.conjuro === c)) return;
    const ki = golpeDeConjuro(c, g);
    for (const obj of enemigos(ctx, l)) {
      if (!aLaVista(ctx, l, obj, alcance)) continue;
      let v = 0;
      for (const b of ctx.luchadores) {
        if (!activo(b) || distancia(b, obj) > (g.area ?? 0)) continue;
        const dano = danoEsperado(l, b, 280 - 55, defensaContraConjuro(b, l, ki, g.area), { ki, tipo: 'CAL', ranura: RANURA_MAGIA, area: g.area });
        v += (b.equipo === l.equipo ? (l.ficha.magia?.controlDelEspacio ? 0 : -lambda(l)) : 1) * dano;
      }
      probar({ conjuro: c, grado: i, objetivo: obj }, 0.6 * v);
    }
  },
};

export const crearFuego: ManejadorEfecto = {
  resolver(m, { ctx, l, g, obj }) {
    if (obj) m.prender(ctx, l, obj, tirarD100Cerrada(ctx.rng) + 20 * (g.intensidades ?? 0));
  },
  valorar({ ctx, l, c, i, g, alcance, probar }) {
    for (const obj of enemigos(ctx, l)) {
      if (!aLaVista(ctx, l, obj, alcance) || obj.llamas) continue;
      probar({ conjuro: c, grado: i, objetivo: obj }, valorPrender(obj, 20 * (g.intensidades ?? 0)));
    }
  },
};

export const controlFuego: ManejadorEfecto = {
  resolver(m, { ctx, l, g, obj }) {
    if (obj) controlarFuego(m, ctx, l, obj, g);
  },
  valorar({ ctx, l, c, i, g, alcance, probar }) {
    for (const obj of ctx.luchadores) {
      if (!activo(obj) || !aLaVista(ctx, l, obj, alcance)) continue;
      if (obj.equipo !== l.equipo && obj.ficha.naturaleza?.includes('fuego')) {
        const p = fallaResistencia(resistencias(obj).rm, g.rm ?? 0).p;
        probar({ conjuro: c, grado: i, objetivo: obj }, p * (Math.max(0, obj.pv) + 2 * amenaza(obj, l)));
      } else if (obj.llamas) {
        const n = 20 * (g.intensidades ?? 0);
        const cambio = obj.equipo === l.equipo
          ? lambda(l) * (danoDeLlamas(obj, obj.llamas) - danoDeLlamas(obj, obj.llamas - n < 100 ? 0 : obj.llamas - n))
          : danoDeLlamas(obj, obj.llamas + n) - danoDeLlamas(obj, obj.llamas);
        probar({ conjuro: c, grado: i, objetivo: obj }, cambio);
      }
    }
  },
};
