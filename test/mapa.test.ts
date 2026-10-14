// Mapa en grilla: caminos, alcance por celdas vecinas y colocación inicial.

import { describe, expect, it } from 'vitest';
import type { Ficha } from '../src/motor/modelo';
import { simularCombate } from '../src/motor/combate';
import { adyacentes, campoHacia, indice, prepararMapa, type Celda, type Mapa } from '../src/motor/mapa';

function ficha(nombre: string, extra: Partial<Ficha> = {}): Ficha {
  return {
    id: nombre, nombre, pv: 150, turno: 80, ataque: 150, defensa: 150, danoBase: 50, tipoAtaque: 'FIL',
    ta: {}, rf: 50, constitucion: 7, tipoMovimiento: 6, arma: { nombre: 'Espada larga' }, rasgos: {}, ...extra,
  };
}

/** Pared vertical en x = 5 de y = 0 a y = 7, con paso abajo (y = 8 y 9 libres). */
const conPared: Mapa = { ancho: 11, alto: 10, bloqueadas: Array.from({ length: 8 }, (_, y): Celda => ({ x: 5, y })) };

describe('mapa en grilla', () => {
  it('el camino rodea la pared', () => {
    const m = prepararMapa(conPared);
    // Del (2,0) a quedar al lado del (8,0): sin pared serían 5 m; rodeando por abajo, bastante más.
    const metros = campoHacia(m, { x: 8, y: 0 })[indice(m, { x: 2, y: 0 })];
    expect(metros).toBeGreaterThan(12);
    expect(metros).toBeLessThan(20);
  });

  it('se traba en diagonal salvo que un muro tape la esquina', () => {
    const m = prepararMapa({ ancho: 3, alto: 3, bloqueadas: [{ x: 1, y: 0 }] });
    expect(adyacentes(m, { x: 0, y: 1 }, { x: 1, y: 2 })).toBe(true);
    expect(adyacentes(m, { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(false);
  });

  it('una pared que cierra el paso deja el combate en empate', () => {
    const cerrado: Mapa = { ancho: 9, alto: 5, bloqueadas: Array.from({ length: 5 }, (_, y): Celda => ({ x: 4, y })) };
    const r = simularCombate([ficha('A')], [ficha('B')], { semilla: 1, escenario: { mapa: cerrado } });
    expect(r.ganador).toBe('empate');
  });

  it('respeta las posiciones pedidas y reubica las que caen en un muro', () => {
    const r = simularCombate([ficha('A')], [ficha('B')], {
      semilla: 1, maxAsaltos: 0,
      escenario: { mapa: conPared, posiciones: { A: [{ x: 1, y: 1 }], B: [{ x: 5, y: 3 }] } },
    });
    expect(r.luchadores[0].pos).toEqual({ x: 1, y: 1 });
    const b = r.luchadores[1].pos;
    expect(b.x === 5 && b.y < 8).toBe(false);
  });

  it('rodeando la pared, igual llegan y pelean', () => {
    const r = simularCombate([ficha('A')], [ficha('B')], {
      semilla: 2, registrar: true,
      escenario: { mapa: conPared, posiciones: { A: [{ x: 2, y: 0 }], B: [{ x: 8, y: 0 }] } },
    });
    expect(r.registro!.some((e) => / ataca a /.test(e.texto))).toBe(true);
    // Nadie pisó nunca la pared.
    for (const e of r.registro!) for (const f of e.foto ?? []) expect(f.x === 5 && f.y < 8).toBe(false);
  });
});
