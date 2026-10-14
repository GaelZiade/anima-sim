// Habilidades del Ki en combate (Core p.103-105, Dominus p.19-22).

import { describe, expect, it } from 'vitest';
import type { Ficha } from '../src/motor/modelo';
import { crearLuchador, simularCombate } from '../src/motor/combate';
import { absorcionContra } from '../src/motor/calculos';
import { empezarAsalto, type DecisionKi } from '../src/motor/ki';
import { absorcion } from '../src/motor/reglas';

const decision = (extra: Partial<DecisionKi> = {}): DecisionKi =>
  ({ acumula: false, soltar: [], liberar: [], objetivo: null, ...extra });

function maestro(habilidadesKi: string[], extra: Partial<Ficha> = {}): Ficha {
  return {
    id: 'kiran', nombre: 'Kiran', pv: 200, turno: 80, ataque: 150, defensa: 150, danoBase: 60, tipoAtaque: 'CON',
    ta: { FIL: 2, CON: 2, PEN: 2, ENE: 4 }, rf: 50, constitucion: 8, tipoMovimiento: 7, presencia: 60, cansancio: 8,
    rasgos: { habilidadesKi },
    ki: { reserva: 30, acumulacion: { CON: 2, DES: 2 }, tecnicas: [] },
    ...extra,
  };
}

const rival = (tipoAtaque: Ficha['tipoAtaque']): Ficha => ({
  id: 'rival', nombre: 'Rival', pv: 150, turno: 50, ataque: 140, defensa: 120, danoBase: 60, tipoAtaque,
  ta: { FIL: 2 }, rf: 40, constitucion: 7, tipoMovimiento: 6,
});

describe('Armadura de energía mayor y arcana (Dominus p.19)', () => {
  it('la mayor apagada vuelve a TA 2 contra energía; encendida cuesta 1 de Ki cada 5 asaltos', () => {
    const l = crearLuchador(maestro(['Armadura de energia', 'Armadura mayor']), 'A', 0, 0);
    const e = crearLuchador(rival('ENE'), 'B', 1, 0);
    expect(absorcionContra(l, e, 'normal', 'ENE')).toBe(absorcion(2));
    for (let asalto = 1; asalto <= 6; asalto++) empezarAsalto(l, decision({ armadura: true }), 0, asalto);
    expect(absorcionContra(l, e, 'normal', 'ENE')).toBe(absorcion(4));
    // Pagó al encenderla (asalto 1) y al cumplir cinco más (asalto 6).
    expect(l.ki!.reserva).toBe(28);
    // Contra otros tipos no cambia nada.
    expect(absorcionContra(l, e, 'normal', 'FIL')).toBe(absorcion(2));
  });

  it('la arcana es TA 4 gratis y sube a TA 6 pagando', () => {
    const l = crearLuchador(maestro(['Armadura de energia', 'Armadura mayor', 'Arm. arcana']), 'A', 0, 0);
    const e = crearLuchador(rival('ENE'), 'B', 1, 0);
    expect(absorcionContra(l, e, 'normal', 'ENE')).toBe(absorcion(4));
    empezarAsalto(l, decision({ armadura: true }), 0, 1);
    expect(absorcionContra(l, e, 'normal', 'ENE')).toBe(absorcion(6));
    expect(l.ki!.reserva).toBe(29);
  });

  it('la IA la enciende sólo si algún enemigo ataca con energía', () => {
    const conEnergia = simularCombate([maestro(['Armadura mayor'])], [rival('ENE')], { semilla: 1, registrar: true });
    expect(conEnergia.registro!.some((x) => x.texto.includes('enciende su Armadura de energía (TA 4'))).toBe(true);
    const sinEnergia = simularCombate([maestro(['Armadura mayor'])], [rival('FIL')], { semilla: 1, registrar: true });
    expect(sinEnergia.registro!.some((x) => x.texto.includes('Armadura de energía'))).toBe(false);
  });
});

describe('Recuperación (Core p.105)', () => {
  it('5 de Ki por un punto de cansancio, uno por asalto y sin pasar el máximo', () => {
    const l = crearLuchador(maestro(['Recuperacion']), 'A', 0, 0);
    l.cansancio = 5;
    empezarAsalto(l, decision({ recuperar: true }), 0, 1);
    expect(l.cansancio).toBe(6);
    expect(l.ki!.reserva).toBe(25);
    l.cansancio = 8;
    empezarAsalto(l, decision({ recuperar: true }), 0, 2);
    expect(l.cansancio).toBe(8);
    expect(l.ki!.reserva).toBe(25);
  });

  it('sin técnicas, la IA la usa en cuanto gastó cansancio', () => {
    const r = simularCombate([maestro(['Recuperacion'])], [rival('FIL')], { semilla: 3, registrar: true });
    const gasto = r.registro!.findIndex((x) => /gastando \d de cansancio/.test(x.texto) && x.texto.startsWith('Kiran'));
    if (gasto >= 0) expect(r.registro!.slice(gasto).some((x) => x.texto.includes('usa Recuperación'))).toBe(true);
  });
});

describe('Dominio físico (Dominus p.22)', () => {
  it('+10 a la RF contra críticos', () => {
    const l = crearLuchador(maestro(['Dominio fisico']), 'A', 0, 0);
    expect(l.cap.est.bonoRfDano).toBe(10);
    expect(crearLuchador(maestro([]), 'A', 0, 0).cap.est.bonoRfDano).toBe(0);
  });
});

describe('estado de Ki', () => {
  it('se crea para quien gasta Ki en habilidades aunque no tenga técnicas, y no acumula', () => {
    expect(crearLuchador(maestro(['Recuperacion']), 'A', 0, 0).ki).not.toBeNull();
    expect(crearLuchador(maestro(['Inhumanidad']), 'A', 0, 0).ki).toBeNull();
    const r = simularCombate([maestro(['Recuperacion'])], [rival('FIL')], { semilla: 2, registrar: true });
    expect(r.registro!.some((x) => x.texto.includes('acumula Ki'))).toBe(false);
  });
});
