import { describe, expect, it } from 'vitest';
import type { Ficha } from '../src/motor/modelo';
import { resumenFicha } from '../web/compendio';

const base: Ficha = {
  id: 'x', nombre: 'X', pv: 100, turno: 50, ataque: 100, defensa: 100, danoBase: 40,
  tipoAtaque: 'FIL', tamanoArma: 'M', ta: {}, rf: 40, constitucion: 6, tipoMovimiento: 6,
};

describe('compendio', () => {
  it('una línea de combate; Ki y magia sólo si los tiene, con el detalle aparte', () => {
    expect(resumenFicha(base).lineas).toHaveLength(1);
    const f = {
      ...base,
      ki: { reserva: 120, acumulacion: {}, tecnicas: [{ nombre: 'Golpe del dragón' }] },
      magia: { zeon: 900, act: 60, proyeccion: 150, vias: { Luz: 80 }, libres: ['Escudo'] },
    } as unknown as Ficha;
    const r = resumenFicha(f);
    expect(r.lineas).toEqual([
      'PV 100 · Turno 50 · HA 100 · HD 100 · Daño 40',
      'Ki 120 · 1 técnica',
      'Zeon 900 · ACT 60 · Proyección 150',
    ]);
    expect(r.detalle).toBe('Técnicas: Golpe del dragón\nVías: Luz 80\nConjuros libres: Escudo');
  });
});
