// Lo que muestra el compendio de cada personaje: una línea de combate y, si tiene, una de Ki y una de
// magia, con el detalle (técnicas, vías) al pasar el mouse.

import type { Ficha } from '../src/motor/modelo';

export interface Resumen {
  lineas: string[];
  detalle: string;
}

export function resumenFicha(f: Ficha): Resumen {
  const lineas = [`PV ${f.pv} · Turno ${f.turno} · HA ${f.ataque} · HD ${f.defensa} · Daño ${f.danoBase}`];
  const detalle: string[] = [];
  if (f.ki) {
    const tecnicas = f.ki.tecnicas;
    lineas.push(`Ki ${f.ki.reserva}${tecnicas.length ? ` · ${tecnicas.length} técnica${tecnicas.length > 1 ? 's' : ''}` : ''}`);
    if (tecnicas.length) detalle.push(`Técnicas: ${tecnicas.map((t) => t.nombre).join(', ')}`);
  }
  if (f.magia) {
    const m = f.magia;
    const vias = Object.entries(m.vias).map(([via, nivel]) => `${via} ${nivel}`);
    lineas.push(`Zeon ${m.zeon} · ACT ${m.act} · Proyección ${m.proyeccion}`);
    if (vias.length) detalle.push(`Vías: ${vias.join(', ')}`);
    if (m.libres?.length) detalle.push(`Conjuros libres: ${m.libres.join(', ')}`);
  }
  return { lineas, detalle: detalle.join('\n') };
}
