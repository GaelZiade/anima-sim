// Conjuros de apoyo: beneficios sobre aliados (Guerra, Fuego, Luz), Curar Heridas, Transporte Rápido,
// Reparación, Atar, y los que dan zeon, ACT o Poder (Sacrificio de Poder, Consumir Vida por Magia,
// Sacrificio Vital, Magia por Capacidades).

import { activo, distancia } from '../calculos';
import { DADO_FIJO } from '../dados';
import type { Golpe } from '../golpe';
import { golpeDeConjuro, RANURA_MAGIA, zeonLibre } from '../magia';
import { atributo, pGanaControl } from '../maniobras';
import { celdaLibreCerca, indice } from '../mapa';
import type { Contexto, Luchador } from '../modelo';
import { tabla } from '../probabilidades';
import { defensaFinal, enAlcance, metrosTotales } from '../calculos';
import { amenaza, enemigos, lambda, trabadoConAlguien, valorNegativo } from '../ia';
import type { ManejadorEfecto, Motor } from './tipos';
import {
  aLaVista, aliadosEnRadio, ASALTOS_EFECTO, cupoAgotado, intercambio, precioZeon, valorBendicion,
} from './valorar';

/** Un beneficio sobre los aliados: lo que da queda en su `bono` mientras se mantenga (magia.ts). */
export const bendicion: ManejadorEfecto = {
  sobre: 'blancos',
  mantieneBlancos: true,
  resolver() {},
  valorar({ ctx, l, c, i, g, alcance, ya, probar }) {
    if (c.blanco === 'aliados') {
      const blancos = aliadosEnRadio(ctx, l, c, g.radio ?? 0);
      let v = 0;
      for (const a of blancos) v += valorBendicion(ctx, l, a, c, g);
      if (blancos.length) probar({ conjuro: c, grado: i, objetivo: null, blancos }, v);
    } else {
      if (cupoAgotado(ctx, l, c, ya)) return;
      for (const a of aliadosEnRadio(ctx, l, c, alcance, ya)) probar({ conjuro: c, grado: i, objetivo: null, blancos: [a] }, valorBendicion(ctx, l, a, c, g));
    }
  },
};

/** Curar Heridas: recupera PV sin pasar de los suyos (Core p.187). */
export const curar: ManejadorEfecto = {
  sobre: 'objetivo',
  resolver(m, { ctx, g, obj }) {
    if (!obj) return;
    const cura = Math.max(0, Math.min(g.curar ?? 0, obj.ficha.pv - obj.pv));
    obj.pv += cura;
    m.log(ctx, () => `  ${obj.ficha.nombre} recupera ${cura} PV (${obj.pv}/${obj.ficha.pv}).`);
  },
  valorar({ ctx, l, c, i, g, alcance, probar }) {
    for (const a of aliadosEnRadio(ctx, l, c, alcance)) {
      if (a.pv > 0.7 * a.ficha.pv) continue;
      probar({ conjuro: c, grado: i, objetivo: a }, lambda(l) * Math.min(g.curar ?? 0, a.ficha.pv - a.pv));
    }
  },
};

/**
 * Transporte Rápido (Core p.187): lleva a alguien hasta esa distancia, lejos de quienes lo tienen
 * trabado (interpretación: al punto libre más alejado de ellos en esa dirección).
 */
function transportar(m: Motor, ctx: Contexto, l: Luchador, metros: number) {
  const cerca = ctx.luchadores.filter((e) => e.equipo !== l.equipo && activo(e) && distancia(l, e) <= 10);
  let dx = 0, dy = 0;
  for (const e of cerca) {
    const d = Math.max(1e-6, distancia(l, e));
    dx += (l.pos.x - e.pos.x) / d;
    dy += (l.pos.y - e.pos.y) / d;
  }
  const n = Math.hypot(dx, dy) || 1;
  if (!cerca.length) dx = 1;
  let destino = { x: l.pos.x + (dx / n) * metros, y: l.pos.y + (dy / n) * metros };
  const mapa = l.mapa;
  if (mapa) {
    destino = { x: Math.max(0, Math.min(mapa.ancho - 1, Math.round(destino.x))), y: Math.max(0, Math.min(mapa.alto - 1, Math.round(destino.y))) };
    const ocupadas = new Set(ctx.luchadores.filter((x) => x !== l && activo(x)).map((x) => indice(mapa, x.pos)));
    destino = celdaLibreCerca(mapa, destino, ocupadas) ?? l.pos;
  }
  l.pos = destino;
  m.soltar(l);
  for (const x of ctx.luchadores) x.trabados = x.trabados.filter((e) => e !== l);
  l.trabados = [];
  m.log(ctx, () => `  ${l.ficha.nombre} aparece a ${metros} m, lejos de sus rivales.`);
}

export const transporte: ManejadorEfecto = {
  sobre: 'objetivo',
  resolver(m, { ctx, g, obj }) {
    if (obj) transportar(m, ctx, obj, g.metros ?? 0);
  },
  valorar({ ctx, l, c, i, g, probar }) {
    // Salir de un cuerpo a cuerpo: se ahorra lo que le pegarían este asalto y el siguiente.
    if (!trabadoConAlguien(l)) return;
    // Si lo alcanzan de nuevo enseguida (corren más que lo que se aleja), apenas gana un respiro.
    let v = 0;
    for (const x of enemigos(ctx, l)) if (enAlcance(l, x)) v += amenaza(x, l) * (metrosTotales(x) < (g.metros ?? 0) ? 1.5 : 0.25);
    probar({ conjuro: c, grado: i, objetivo: l }, lambda(l) * v);
  },
};

/** Reparación (Core p.181): le devuelve el arma rota (los pedazos quedan a mano). */
export const reparar: ManejadorEfecto = {
  sobre: 'objetivo',
  resolver(m, { ctx, obj }) {
    const f = obj?.armaRota;
    if (!obj || !f) return;
    obj.armaRota = null;
    obj.desarmado = false;
    m.cambiarFicha(obj, { ...obj.ficha, turno: f.turno, ataque: f.ataque, defensa: f.defensa, danoBase: f.danoBase, tipoAtaque: f.tipoAtaque, tipoDefensa: f.tipoDefensa, tamanoArma: f.tamanoArma, arma: f.arma });
    m.log(ctx, () => `  El arma de ${obj.ficha.nombre} queda como nueva.`);
  },
  valorar({ ctx, l, c, i, alcance, probar }) {
    for (const a of aliadosEnRadio(ctx, l, c, alcance)) {
      if (!a.armaRota) continue;
      // Recupera más o menos el doble de lo que hace desarmado (aproximación).
      probar({ conjuro: c, grado: i, objetivo: a }, ASALTOS_EFECTO * intercambio(ctx, a).hace);
    }
  },
};

/** Fuerza de lo que hay en la escena para Atar: soga 10, cadena 12 (Core p.180). */
function fuerzaCuerdas(ctx: Contexto): number {
  return ctx.opciones.cuerdas === 'cadena' ? 12 : 10;
}

/**
 * Atar (Core p.180): las sogas o cadenas de la escena atacan con la habilidad del grado (Trucos de
 * manos, ataque automático); si alcanza, Presa con la Fuerza del material. Se zafa contra esa Fuerza;
 * atado no depende del mago (interpretación).
 */
export const atar: ManejadorEfecto = {
  resolver(m, { ctx, l, c, g, obj }) {
    if (!obj) return;
    const fuerza = fuerzaCuerdas(ctx);
    const golpe: Golpe = { maniobra: 'presa', esContra: false, tipo: 'CON', ranura: RANURA_MAGIA, ki: { ...golpeDeConjuro(c, { zeon: 0, int: 0 }), apresamiento: fuerza, danoFijo: 0 } };
    m.resolverDefensa(ctx, l, obj, g.habilidad ?? 0, DADO_FIJO, golpe, `Las ${ctx.opciones.cuerdas === 'cadena' ? 'cadenas' : 'sogas'} se lanzan sobre ${obj.ficha.nombre}`);
    if (obj.apresadoPor === l && !obj.lazos && !obj.atadura) {
      obj.atadura = fuerza;
      l.apresando = null;
      m.log(ctx, () => `  ${obj.ficha.nombre} queda atado (Fuerza ${fuerza}).`);
    }
  },
  valorar({ ctx, l, c, i, g, alcance, probar }) {
    // Con sogas o cadenas en la escena: como Lazos, pero se pueden romper.
    if (!ctx.opciones.cuerdas) return;
    const fuerza = fuerzaCuerdas(ctx);
    for (const obj of enemigos(ctx, l)) {
      if (!aLaVista(ctx, l, obj, alcance) || obj.apresadoPor || obj.ficha.acumulacion) continue;
      const p = tabla(0, obj.cap.umbralDefensa, false).pImpacto((g.habilidad ?? 0) - 55 - defensaFinal(obj, l));
      const control = pGanaControl(fuerza, Math.max(atributo(obj, 'FUE'), atributo(obj, 'AGI')));
      probar({ conjuro: c, grado: i, objetivo: obj }, p * control * valorNegativo(l, obj, 80, 1, 0));
    }
  },
};

/** Sacrificio Vital (Core p.158): queda activo; en cada ataque decide cuántos PV pone en la Proyección. */
export const sacrificioVital: ManejadorEfecto = {
  resolver() {},
  valorar({ l, c, i, probar }) {
    // Se lanza una vez y queda: rinde en los ataques que vienen (aproximación: 5% de sus PV por asalto).
    probar({ conjuro: c, grado: i, objetivo: null }, ASALTOS_EFECTO * 0.05 * l.ficha.pv);
  },
};

/** Sacrificio de Poder (Core p.159): queda activo; cada asalto convierte zeon en ACT (+5 cada 10). */
export const sacrificioPoder: ManejadorEfecto = {
  noEsMeta: true,
  resolver() {},
  valorar({ l, c, i, g, probar, meta }) {
    // Más ACT por asalto (5 cada 10 de zeon): lo que adelanta de su mejor conjuro, menos el zeon que pierde.
    const objetivo = meta();
    if (!objetivo) return;
    const act = (g.maximo ?? 0) / 2;
    probar({ conjuro: c, grado: i, objetivo: null }, ASALTOS_EFECTO * ((act / l.ficha.magia!.act) * objetivo.porAsalto - precioZeon(l) * act));
  },
};

/** Consumir Vida por Magia (Core p.159): queda activo; cada asalto puede convertir PV en zeon (100 cada 5). */
export const consumirVida: ManejadorEfecto = {
  noEsMeta: true,
  resolver() {},
  valorar({ l, e, c, i, g, probar }) {
    // Lo vale cuando la reserva no alcanza para el resto del combate: el zeon que daría en dos
    // asaltos, a su precio, menos los PV (por λ).
    if (zeonLibre(e) >= 3 * l.ficha.magia!.act || l.pv <= l.ficha.pv * 0.6) return;
    const pv = Math.min(g.maximo ?? 0, Math.floor((l.pv - l.ficha.pv / 2) / 5) * 5);
    probar({ conjuro: c, grado: i, objetivo: null }, 2 * (precioZeon(l) * 20 * pv - lambda(l) * pv));
  },
};

/** Magia por Capacidades (Core p.159): queda activo; da Poder por zeon en un choque de descargas. */
export const capacidades: ManejadorEfecto = {
  resolver() {},
  valorar({ ctx, l, c, i, probar }) {
    // Sólo cambia algo en un choque de descargas (el bono de Poder): si hay con quién chocar.
    if (!ctx.opciones.disparosParalelos || !enemigos(ctx, l).some((x) => x.magia || x.ficha.ki?.tecnicas.length)) return;
    probar({ conjuro: c, grado: i, objetivo: null }, ASALTOS_EFECTO * 2);
  },
};
