// Efectos de la vía de la Luz y de la Esencia (Core p.126-128): Flash Cegador, Imbuir Calma y Destruir
// Sentimientos Negativos, Lazos de Luz, Holograma, los Detectar y Sentir el Calor, Destrucción de
// Sombras y Dominio Lumínico.

import { activo, distancia } from '../calculos';
import type { Grado } from '../conjuros';
import { golpeDeConjuro, mantenidoCon, RANURA_MAGIA, ZEON_CONTROL_DEL_ESPACIO } from '../magia';
import { atributo, pGanaControl } from '../maniobras';
import type { Contexto, Luchador } from '../modelo';
import { tabla } from '../probabilidades';
import { umbralPifia } from '../reglas';
import { amenaza, enemigos, lambda, valorNegativo } from '../ia';
import { ataqueMagico, pronostico } from '../calculos';
import type { ManejadorEfecto, Motor } from './tipos';
import { aLaVista, ASALTOS_EFECTO, defensaContraConjuro, fallaResistencia, precioZeon, resistencias } from './valorar';

/**
 * Flash Cegador (Core p.126): todos los del radio salvo el lanzador (con Control del Espacio, sólo los
 * enemigos) hacen una RF; quedan ciegos tantos asaltos como decenas por las que fallen.
 */
export const flash: ManejadorEfecto = {
  resolver(m, { ctx, l, x, g }) {
    const control = !!x.control;
    for (const b of ctx.luchadores) {
      if (b === l || !activo(b) || distancia(l, b) > (g.radio ?? 0) || (control && b.equipo === l.equipo)) continue;
      const asaltos = Math.floor(m.tirarRf(ctx, b, g.rf ?? 0, 'el Flash Cegador').fracaso / 10);
      if (asaltos > 0) {
        b.cegado = Math.max(b.cegado, asaltos);
        m.log(ctx, () => `  ${b.ficha.nombre} queda ciego ${asaltos} asalto${asaltos > 1 ? 's' : ''}.`);
      }
    }
  },
  valorar({ ctx, l, c, i, g, probar, signo }) {
    // Ciego, cada asalto vale lo que un −90 a sus acciones durante medio intercambio (aproximación).
    const control = !!l.ficha.magia?.controlDelEspacio && ctx.luchadores.some((x) => x !== l && x.equipo === l.equipo && activo(x) && distancia(l, x) <= (g.radio ?? 0));
    let v = 0;
    for (const b of ctx.luchadores) {
      if (b === l || !activo(b) || distancia(l, b) > (g.radio ?? 0) || (control && b.equipo === l.equipo) || b.cegado > 1) continue;
      const f = fallaResistencia(resistencias(b).rf, g.rf ?? 0);
      const asaltos = Math.min(3, Math.floor(f.fracaso / 10));
      const rival = b.equipo === l.equipo ? enemigos(ctx, b)[0] : l;
      if (!rival || !asaltos) continue;
      v += signo(b) * f.p * asaltos * valorNegativo(rival, b, 90, 1, 0) / 2;
    }
    probar({ conjuro: c, grado: i, objetivo: null, control }, v, control ? precioZeon(l) * ZEON_CONTROL_DEL_ESPACIO : 0);
  },
};

/**
 * Imbuir Calma, Destruir Sentimientos Negativos (Core p.126, p.128): quita el Miedo a los del radio que
 * no se resistan (los aliados no se resisten; con Control del Espacio, sólo a los suyos).
 */
export const calmar: ManejadorEfecto = {
  resolver(m, { ctx, l, x, g }) {
    const radio = g.radio ?? 0, control = !!x.control;
    for (const b of ctx.luchadores) {
      if (!activo(b) || distancia(l, b) > radio || (control && b.equipo !== l.equipo)) continue;
      const conMiedo = b.ficha.estados?.miedo || b.aura?.estado === 'miedo';
      if (!conMiedo) continue;
      if (b.ficha.estados?.miedo) m.cambiarFicha(b, { ...b.ficha, estados: { ...b.ficha.estados, miedo: false } });
      if (b.aura?.estado === 'miedo') b.aura = { ...b.aura, estado: 'resistio' };
      m.log(ctx, () => `  ${b.ficha.nombre} se calma: deja de tener Miedo.`);
    }
  },
  valorar({ ctx, l, c, i, g, probar }) {
    // Quitarle el Miedo (−60) a los suyos del radio.
    let v = 0;
    for (const a of ctx.luchadores) {
      if (a.equipo !== l.equipo || !activo(a) || distancia(l, a) > (g.radio ?? 0) || !(a.ficha.estados?.miedo || a.aura?.estado === 'miedo')) continue;
      const rival = enemigos(ctx, a).sort((x, y) => distancia(a, x) - distancia(a, y))[0];
      if (rival) v += valorNegativo(rival, a, 60, 1, 0);
    }
    probar({ conjuro: c, grado: i, objetivo: null, control: !!l.ficha.magia?.controlDelEspacio && v > 0 }, v, l.ficha.magia?.controlDelEspacio ? precioZeon(l) * ZEON_CONTROL_DEL_ESPACIO : 0);
  },
};

/**
 * Lazos de Luz (Core p.127): ataca con la Proyección usando las reglas de Presa, sin penalizador; los
 * lazos ponen su Fuerza. Sujeto, el mago queda libre y el apresado no puede romperlos.
 */
export const lazos: ManejadorEfecto = {
  golpe: ({ g }, golpe) => ({ ...golpe, maniobra: 'presa', ki: { ...golpe.ki!, apresamiento: g.fuerza ?? 0 } }),
  trasGolpe(m, { ctx, l }, b, afectados) {
    if (b.apresadoPor === l && !b.lazos) {
      b.lazos = l;
      l.apresando = null;
      afectados.push(b);
      m.log(ctx, () => `  Los Lazos de Luz sujetan a ${b.ficha.nombre}.`);
    }
  },
  alTerminar(m, l, a) {
    if (a.lazos !== l) return;
    a.lazos = null;
    if (a.apresadoPor === l) m.soltar(a);
  },
  valorar({ ctx, l, c, i, g, alcance, probar }) {
    // Presa sin penalizador con la Fuerza de los lazos; sujeto, con parálisis y sin poder romperlos.
    const ki = { ...golpeDeConjuro(c, g), apresamiento: g.fuerza ?? 0 };
    for (const obj of enemigos(ctx, l)) {
      if (!aLaVista(ctx, l, obj, alcance) || obj.apresadoPor || obj.ficha.acumulacion) continue;
      const p = pronostico(l, obj, ataqueMagico(l, obj), defensaContraConjuro(obj, l, ki), { maniobra: 'presa', ki, tipo: 'ENE', ranura: RANURA_MAGIA });
      const control = pGanaControl(g.fuerza ?? 0, Math.max(atributo(obj, 'FUE'), atributo(obj, 'AGI')));
      probar({ conjuro: c, grado: i, objetivo: obj }, p.pManiobra * control * 2 * valorNegativo(l, obj, 80, 1, 0));
    }
  },
};

/** Holograma (Core p.127): una imagen idéntica del mago a su lado, hasta que se descubra. */
export const holograma: ManejadorEfecto = {
  resolver(m, { ctx, l, c }) {
    l.holograma = true;
    const x = mantenidoCon(l, c);
    if (x) x.alTerminar = () => { l.holograma = false; };
    m.log(ctx, () => `  Aparece una imagen idéntica de ${l.ficha.nombre} a su lado.`);
  },
  valorar({ ctx, l, c, i, probar }) {
    // Cada enemigo que no lo descubra le erra la mitad de las veces a la imagen (por λ, unos asaltos).
    if (l.holograma) return;
    let v = 0;
    for (const x of enemigos(ctx, l)) {
      if (l.descubre.has(x)) continue;
      const pAdv = tabla(umbralPifia(x.ficha.advertir ?? 0), 0, true).pImpacto((x.ficha.advertir ?? 0) - 240 + 1);
      const pBus = tabla(umbralPifia(x.ficha.buscar ?? 0), 0, true).pImpacto((x.ficha.buscar ?? 0) - 140 + 1);
      v += 0.5 * (1 - Math.max(pAdv, pBus)) * amenaza(x, l);
    }
    probar({ conjuro: c, grado: i, objetivo: null }, lambda(l) * 2 * v);
  },
};

/**
 * Detectar Vida, Detectar lo Negativo, Sentir el Calor (Core p.127, p.156): localiza a quien esté en el
 * radio y no supere la RM, aunque sea invisible (ceguera parcial en vez de absoluta). Sentir el Calor no
 * nota a los no vivos (interpretación: los que tienen acumulación de daño sin ser seres vivos no se
 * modelan; afecta a todos).
 */
export const detectar: ManejadorEfecto = {
  resolver(m, { ctx, l, x, c, g }) {
    const hallados: Luchador[] = [];
    for (const b of x.blancos ?? []) {
      if (!activo(b) || distancia(l, b) > (g.radio ?? 0)) continue;
      if (!m.tirarResistencia(ctx, b, g.rm ?? 0, c.nombre, 'RM').falla) continue;
      l.detecta.add(b);
      hallados.push(b);
      m.log(ctx, () => `  ${l.ficha.nombre} localiza a ${b.ficha.nombre}.`);
    }
    const mant = mantenidoCon(l, c);
    if (mant) mant.alTerminar = () => { for (const b of hallados) l.detecta.delete(b); };
  },
  valorar({ ctx, l, c, i, g, probar }) {
    // Ubicar a un enemigo invisible: de ceguera absoluta a parcial contra él.
    const blancos = enemigos(ctx, l).filter((x) => x.bono?.invisible && !l.detecta.has(x) && distancia(l, x) <= (g.radio ?? 0));
    let v = 0;
    for (const x of blancos) v += fallaResistencia(resistencias(x).rm, g.rm ?? 0).p * ASALTOS_EFECTO * 0.3 * amenaza(x, l);
    if (blancos.length) probar({ conjuro: c, grado: i, objetivo: null, blancos }, v);
  },
};

/**
 * Destrucción de Sombras, Dominio Lumínico (Core p.126-127): los seres de esa naturaleza del radio hacen
 * una RM cada asalto mientras se mantenga; si fallan, pierden el doble del fracaso en PV (por diez con
 * acumulación) o quedan dominados. Además iluminan a los suyos del radio (sin oscuridad natural).
 */
function contraNaturaleza(m: Motor, ctx: Contexto, l: Luchador, g: Grado) {
  for (const b of ctx.luchadores) {
    if (b.equipo === l.equipo || !activo(b) || distancia(l, b) > (g.radio ?? 0) || !b.ficha.naturaleza?.includes(g.naturaleza ?? '')) continue;
    const { falla, fracaso } = m.tirarResistencia(ctx, b, g.rm ?? 0, `el poder de ${l.ficha.nombre}`, 'RM');
    if (!falla) continue;
    if (g.contraNaturaleza === 'domina') {
      m.log(ctx, () => `  ${b.ficha.nombre} queda dominado por ${l.ficha.nombre}: deja de pelear.`);
      m.huir(ctx, b);
    } else m.perderPv(ctx, l, b, (b.ficha.acumulacion ? 10 : 1) * 2 * fracaso);
  }
}

export const naturaleza: ManejadorEfecto = {
  mantieneBlancos: true,
  resolver(m, { ctx, l, g }) {
    contraNaturaleza(m, ctx, l, g);
  },
  cadaAsalto(m, ctx, l, x) {
    if (activo(l)) contraNaturaleza(m, ctx, l, x.conjuro.grados[x.grado]);
  },
  valorar({ ctx, l, c, i, g, probar }) {
    // Sólo hay algo que hacer si enfrente hay seres de esa naturaleza en el radio.
    let v = 0;
    for (const x of enemigos(ctx, l)) {
      if (distancia(l, x) > (g.radio ?? 0) || !x.ficha.naturaleza?.includes(g.naturaleza ?? '')) continue;
      const f = fallaResistencia(resistencias(x).rm, g.rm ?? 0);
      v += f.p * (g.contraNaturaleza === 'domina' ? Math.max(0, x.pv) + 2 * amenaza(x, l) : Math.min(Math.max(0, x.pv), (x.ficha.acumulacion ? 20 : 2) * f.fracaso) * 2);
    }
    const suyos = ctx.luchadores.filter((x) => x.equipo === l.equipo && activo(x) && distancia(l, x) <= (g.radio ?? 0));
    if (v > 0) probar({ conjuro: c, grado: i, objetivo: null, blancos: suyos }, v);
  },
};

