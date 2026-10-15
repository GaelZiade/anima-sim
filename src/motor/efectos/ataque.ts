// Conjuros de ataque, escudos y armaduras (Core p.122): los que no hacen nada propio más allá de golpear
// con su daño, parar con su resistencia o sumar TA.

import { ZEON_CONTROL_DEL_ESPACIO } from '../magia';
import { enemigos } from '../ia';
import { blancosConjuro } from './comun';
import type { ManejadorEfecto } from './tipos';
import { aLaVista, precioZeon, quiereControl, valorArmaduraMagica, valorConjuroContra } from './valorar';

/** Una descarga: se resuelve contra la defensa de cada blanco (en área, todos los del radio). */
export const ataque: ManejadorEfecto = {
  valorar({ ctx, l, c, i, g, alcance, probar, signo }) {
    if (!c.tipos.includes('ataque')) return;
    for (const obj of enemigos(ctx, l)) {
      if (!aLaVista(ctx, l, obj, alcance)) continue;
      const control = quiereControl(ctx, l, obj, c, g);
      let v = 0;
      for (const b of blancosConjuro(ctx, l, obj, c, g, control)) v += signo(b) * valorConjuroContra(l, b, c, g);
      probar({ conjuro: c, grado: i, objetivo: obj, control }, v, control ? precioZeon(l) * ZEON_CONTROL_DEL_ESPACIO : 0);
    }
  },
};

/** Un escudo mágico: se levanta al recibir un ataque (pasivo, ia-magia.ts escudoMagicoAlDefender). */
export const escudo: ManejadorEfecto = {};

/** Una armadura mágica: TA contra energía y contra el resto mientras se mantenga (magia.ts). */
export const armadura: ManejadorEfecto = {
  valorar({ ctx, l, e, c, i, g, probar }) {
    if (g.taEnergia !== undefined && !e.armadura) probar({ conjuro: c, grado: i, objetivo: null }, valorArmaduraMagica(ctx, l, g));
  },
};

/** Aumentar el Crítico: pasivo, al tirar un crítico (ia-magia.ts aumentarCritico). */
export const aumentarCritico: ManejadorEfecto = {};
