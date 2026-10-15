// Conjuros anímicos (Core p.122): si alcanzan con un resultado de daño, en vez de dañar piden una
// Resistencia contra su dificultad, y el fracaso decide el efecto. Secar, Consumir Esencia, Crítico
// Directo (Fuego), Éxtasis (Esencia) y Fundir (Fuego, contra el arma).

import { activo, distancia, penAccion } from '../calculos';
import { tirarD100Cerrada } from '../dados';
import { ZEON_CONTROL_DEL_ESPACIO } from '../magia';
import type { Luchador } from '../modelo';
import { amenaza, enemigos, lambda, valorNegativo } from '../ia';
import { frialdadDe } from '../calculos';
import { blancosConjuro } from './comun';
import type { ManejadorEfecto, Valoracion } from './tipos';
import {
  aLaVista, fallaResistencia, pAlcanzaAnimico, precioZeon, quiereControl, resistencias, valorCriticoFijo,
} from './valorar';

/**
 * Secar, Consumir Esencia y Crítico Directo: daño (o un crítico) por el fracaso de la RM. Consumir
 * Esencia es un área alrededor del lanzador; los otros, a un blanco a la vista (o un área).
 */
function valorarPorFracaso(v: Valoracion, como: 'secar' | 'consumir' | 'critico') {
  const { ctx, l, c, i, g, alcance, probar, signo } = v;
  for (const obj of enemigos(ctx, l)) {
    if (como === 'consumir' ? distancia(l, obj) > (g.radio ?? 0) : !aLaVista(ctx, l, obj, alcance)) continue;
    const control = quiereControl(ctx, l, obj, c, g);
    let val = 0;
    for (const b of blancosConjuro(ctx, l, obj, c, g, control)) {
      const r = resistencias(b);
      const p = pAlcanzaAnimico(l, b, c, g);
      if (como === 'critico') {
        val += signo(b) * p * fallaResistencia(r.rm, g.rm ?? 0).p * valorCriticoFijo(l, b, g.critico ?? 0);
        continue;
      }
      const f = fallaResistencia(como === 'secar' ? Math.max(r.rm, r.rf) : r.rm, g.rm ?? 0);
      const pv = Math.min(Math.max(0, b.pv), como === 'secar' ? f.fracaso / 2 : f.fracaso);
      val += signo(b) * p * f.p * pv;
    }
    probar({ conjuro: c, grado: i, objetivo: obj, control }, val, control ? precioZeon(l) * ZEON_CONTROL_DEL_ESPACIO : 0);
    if (como === 'consumir') break;
  }
}

/** Secar (Core p.158): a un ser vivo, la mitad del fracaso; a un elemental de agua, el doble. */
export const secar: ManejadorEfecto = {
  alAlcanzar(m, { ctx, atk, def, rm, que }) {
    // A un ser vivo le hace la mitad del fracaso; resiste con la mejor de RM y RF (interpretación).
    const fracaso = m.tirarResistencia(ctx, def, rm, que, 'RM o RF');
    // A un elemental de agua le hace el doble del fracaso (Core p.158).
    const pv = def.ficha.naturaleza?.includes('agua') ? 2 * fracaso : Math.floor(fracaso / 2);
    if (pv > 0) m.perderPv(ctx, atk, def, pv);
  },
  valorar: (v) => valorarPorFracaso(v, 'secar'),
};

/** Consumir Esencia (Core p.158): el fracaso en PV y en zeon. */
export const consumirEsencia: ManejadorEfecto = {
  alAlcanzar(m, { ctx, atk, def, rm, que }) {
    const fracaso = m.tirarResistencia(ctx, def, rm, que, 'RM');
    if (!fracaso) return;
    const e = def.magia;
    if (e) {
      const pierde = Math.min(fracaso, e.reserva);
      e.reserva -= pierde;
      e.acumulado = Math.min(e.acumulado, e.reserva);
      m.log(ctx, () => `  ${def.ficha.nombre} pierde ${pierde} de zeon (reserva ${e.reserva}).`);
    }
    m.perderPv(ctx, atk, def, fracaso);
  },
  valorar: (v) => valorarPorFracaso(v, 'consumir'),
};

/** Crítico Directo (Core p.159): si falla la RM, un crítico del nivel del grado. */
export const criticoDirecto: ManejadorEfecto = {
  alAlcanzar(m, { ctx, atk, def, g, rm, que }) {
    if (m.tirarResistencia(ctx, def, rm, que, 'RM')) m.critico(ctx, atk, def, 0, false, 'normal', 0, g.critico);
  },
  valorar: (v) => valorarPorFracaso(v, 'critico'),
};

/**
 * Éxtasis (Core p.128): −20 a toda acción en lugar de los demás negativos. Los aliados elegidos lo
 * aceptan sin resistirse (interpretación); a los enemigos los alcanza como anímico.
 */
export const extasis: ManejadorEfecto = {
  blancos: ({ l, x }) => (x.blancos ?? []).filter((b) => b.equipo !== l.equipo),
  antesDelAtaque(m, { ctx, l, x, nombre, zeon }, afectados) {
    m.log(ctx, () => `${l.ficha.nombre} lanza ${nombre} ${zeon}.`);
    for (const b of x.blancos ?? []) if (b.equipo === l.equipo && activo(b)) {
      b.extasis = true;
      afectados.push(b);
      m.log(ctx, () => `  ${b.ficha.nombre} se deja llevar por el Éxtasis (−20 a toda acción, sin otros negativos).`);
    }
  },
  alAlcanzar(m, { ctx, def, rm, que, afectados }) {
    if (!m.tirarResistencia(ctx, def, rm, que, 'RM', frialdadDe(def))) return;
    def.extasis = true;
    afectados?.push(def);
    m.log(ctx, () => `  ${def.ficha.nombre} queda en Éxtasis: −20 a toda acción, sin otros negativos.`);
  },
  alTerminar(_m, _l, a) {
    a.extasis = false;
  },
  valorar({ ctx, l, c, i, g, probar }) {
    // −20 a toda acción en lugar de sus negativos: malo para quien tiene pocos, bueno para quien tiene muchos.
    const control = !!l.ficha.magia?.controlDelEspacio;
    const blancos: Luchador[] = [];
    let v = 0;
    for (const b of ctx.luchadores) {
      if (b === l || !activo(b) || distancia(l, b) > (g.radio ?? 0) || b.extasis) continue;
      const delta = 20 + b.penFisico + b.penTecnica - penAccion(b);
      let valor: number;
      if (b.equipo === l.equipo) {
        const rival = enemigos(ctx, b).sort((x, y) => distancia(b, x) - distancia(b, y))[0];
        valor = delta < 0 && rival ? 2 * valorNegativo(rival, b, -delta, 1, 0) : delta > 0 && rival ? -2 * lambda(l) * valorNegativo(rival, b, delta, 1, 0) : 0;
      } else {
        const p = pAlcanzaAnimico(l, b, c, g) * fallaResistencia(resistencias(b).rm, g.rm ?? 0).p;
        valor = 2 * p * (delta > 0 ? valorNegativo(l, b, delta, 1, 0) : -valorNegativo(b, l, -delta, 1, 0));
      }
      if (control && valor <= 0) continue;
      blancos.push(b);
      v += valor;
    }
    const obj = blancos.find((b) => b.equipo !== l.equipo) ?? blancos[0];
    if (obj) probar({ conjuro: c, grado: i, objetivo: obj, blancos, control }, v, control ? precioZeon(l) * ZEON_CONTROL_DEL_ESPACIO : 0);
  },
};

/**
 * Fundir (Core p.158): el arma de cada blanco resiste con su Presencia (unos 20; +5 por cada +5 de
 * calidad, interpretación) contra la RF del grado; si falla, arde: su portador la suelta.
 */
export const fundir: ManejadorEfecto = {
  blancos: ({ x }) => x.blancos ?? [],
  alAlcanzar(m, { ctx, atk, def, g }) {
    const presencia = 20 + (def.ficha.arma?.calidad ?? 0);
    const dado = tirarD100Cerrada(ctx.rng);
    if (presencia + dado >= (g.rf ?? 0)) {
      m.log(ctx, () => `  El arma de ${def.ficha.nombre} resiste el calor (${presencia + dado} [${presencia}+${dado}] contra ${g.rf}).`);
      return;
    }
    m.log(ctx, () => `  El arma de ${def.ficha.nombre} empieza a fundirse (${presencia + dado} contra ${g.rf}): la suelta para no quemarse.`);
    m.desarmar(ctx, def, atk);
  },
  valorar({ ctx, l, c, i, g, probar }) {
    // Los enemigos armados del radio sueltan el arma si fallan: valen lo que dejan de pegar.
    const blancos: Luchador[] = [];
    let v = 0;
    for (const b of enemigos(ctx, l)) {
      if (distancia(l, b) > (g.radio ?? 0) || b.desarmado || b.cap.desarmado || !b.ficha.arma || b.ficha.arma.desarmado) continue;
      const pObjeto = Math.max(0, Math.min(1, ((g.rf ?? 0) - 20 - (b.ficha.arma.calidad ?? 0)) / 100));
      const valor = pAlcanzaAnimico(l, b, c, g) * pObjeto * 1.5 * amenaza(b, l);
      if (valor <= 0) continue;
      blancos.push(b);
      v += valor;
    }
    if (blancos.length) probar({ conjuro: c, grado: i, objetivo: blancos[0], blancos }, v);
  },
};
