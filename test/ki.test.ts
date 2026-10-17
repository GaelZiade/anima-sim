// Ki en combate: acumulación, gasto y efectos de las técnicas (Core p.102-106, Dominus cap. 5).

import { describe, expect, it } from 'vitest';
import type { Ficha, Tecnica } from '../src/motor/modelo';
import { crearLuchador, simularCombate } from '../src/motor/combate';
import { absorcionContra, ataqueFinal, danoBase, defensaFinal, turnoFinal } from '../src/motor/calculos';
import {
  alPerderPv, combinar, efectosDe, ejecutar, empezarAsalto, ponerEnEspera, recuperarKi, puedeEjecutar, puedePonerEnEspera, SIN_KI, terminarAsalto,
  vistaPrevia, type DecisionKi,
} from '../src/motor/ki';
import { leerEfectosTecnica } from '../src/hoja/ficha';

const tecnica = (nombre: string, efectos: string, coste: Tecnica['coste'], extra: Partial<Tecnica> = {}): Tecnica => ({
  nombre, nivel: 1, cm: 30, coste, mantenimiento: 0, combinable: false, efectos: leerEfectosTecnica(efectos), ...extra,
});

let asalto = 0;
const decision = (acumula: boolean, extra: Partial<DecisionKi> = {}): DecisionKi =>
  ({ acumula, soltar: [], liberar: [], objetivo: null, ...extra });

const CORTE = tecnica('Corte', 'Habilidad de Ataque (+50), Destruir Armadura (-4 TA)', { CON: 4, DES: 5, FUE: 4 });
const PROTECCION = tecnica('Proteccion', 'Habilidad de Parada (+50), Armadura (TA 4)', { CON: 6, DES: 5, FUE: 5 });
const VELOCIDAD = tecnica('Velocidad', 'Incrementar Turno (+100, Mantenido)', { CON: 6, DES: 6 }, { mantenimiento: 3 });
const DISPARO = tecnica('Disparo', 'Multiplicador al Dano (x3), Aumento de Dano (+50)', { FUE: 6 });

function tecnicista(tecnicas: Tecnica[], extra: Partial<Ficha> = {}): Ficha {
  return {
    id: 'kael', nombre: 'Kael', pv: 150, turno: 80, ataque: 150, defensa: 150, danoBase: 60, tipoAtaque: 'CON',
    ta: {}, rf: 50, constitucion: 7, tipoMovimiento: 6, presencia: 60,
    ki: { reserva: 100, acumulacion: { CON: 6, DES: 7, FUE: 6, POD: 6 }, tecnicas },
    ...extra,
  };
}

describe('acumulación y gasto (Core p.102-105)', () => {
  it('cada asalto suma su acumulación; si además hace otra cosa, lo ganado queda en la mitad hacia arriba', () => {
    const l = crearLuchador(tecnicista([CORTE]), 'A', 0, 0);
    empezarAsalto(l, decision(true), 0, ++asalto);
    expect(l.ki!.acumulado).toEqual({ CON: 6, DES: 7, FUE: 6, POD: 6 });
    terminarAsalto(l, true);
    // DES 7 → 4, el resto 6 → 3 (como el ejemplo de Lemures).
    expect(l.ki!.acumulado).toEqual({ CON: 3, DES: 4, FUE: 3, POD: 3 });
    empezarAsalto(l, decision(true), 0, ++asalto);
    terminarAsalto(l, false);
    expect(l.ki!.acumulado).toEqual({ CON: 9, DES: 11, FUE: 9, POD: 9 });
  });

  it('cada −20 a toda acción baja 1 cada acumulación (Core p.232); si deja de acumular, vuelve a la reserva', () => {
    const l = crearLuchador(tecnicista([CORTE]), 'A', 0, 0);
    empezarAsalto(l, decision(true), 45, ++asalto);
    expect(l.ki!.acumulado).toEqual({ CON: 4, DES: 5, FUE: 4, POD: 4 });
    empezarAsalto(l, decision(false), 0, ++asalto);
    expect(l.ki!.acumulado).toEqual({});
    expect(l.ki!.reserva).toBe(100);
  });

  it('ejecutar gasta el coste de la reserva; lo sobrante vuelve al final del asalto', () => {
    const l = crearLuchador(tecnicista([CORTE]), 'A', 0, 0);
    empezarAsalto(l, decision(true), 0, ++asalto);
    expect(puedeEjecutar(l, CORTE)).toBe(true);
    ejecutar(l, CORTE);
    expect(l.ki!.reserva).toBe(87);
    expect(l.ki!.acumulado).toEqual({ CON: 2, DES: 2, FUE: 2, POD: 6 });
    terminarAsalto(l, true);
    expect(l.ki!.acumulado).toEqual({});
  });

  it('una mantenida paga su mantenimiento cada asalto sin acumular, y sigue activa (Dominus p.48)', () => {
    const l = crearLuchador(tecnicista([VELOCIDAD]), 'A', 0, 0);
    const turno = turnoFinal(l);
    empezarAsalto(l, decision(true), 0, ++asalto);
    ejecutar(l, VELOCIDAD);
    expect(turnoFinal(l)).toBe(turno + 100);
    expect(l.ki!.reserva).toBe(88);
    terminarAsalto(l, true);
    empezarAsalto(l, decision(false), 0, ++asalto);
    expect(l.ki!.reserva).toBe(85);
    expect(turnoFinal(l)).toBe(turno + 100);
  });
});

describe('mantener, soltar y técnicas en espera (Core p.105, Dominus p.48)', () => {
  it('soltar una mantenida es gratis: deja de pagar y pierde el efecto', () => {
    const l = crearLuchador(tecnicista([VELOCIDAD]), 'A', 0, 0);
    const turno = turnoFinal(l);
    empezarAsalto(l, decision(true), 0, ++asalto);
    ejecutar(l, VELOCIDAD);
    terminarAsalto(l, true);
    empezarAsalto(l, decision(true, { soltar: [VELOCIDAD] }), 0, ++asalto);
    expect(l.ki!.reserva).toBe(88);
    expect(turnoFinal(l)).toBe(turno);
  });

  it('sólo la técnica declarada al empezar a acumular puede quedar en espera', () => {
    const l = crearLuchador(tecnicista([CORTE, DISPARO]), 'A', 0, 0);
    empezarAsalto(l, decision(true, { objetivo: CORTE }), 0, ++asalto);
    expect(puedePonerEnEspera(l, DISPARO)).toBe(false);
    expect(puedePonerEnEspera(l, CORTE)).toBe(true);
  });

  it('en espera su Ki queda apartado: sigue acumulando, ejecuta otras y la usa después pagando 1/2/3 por asalto', () => {
    const l = crearLuchador(tecnicista([CORTE, DISPARO]), 'A', 0, 0);
    empezarAsalto(l, decision(true, { objetivo: CORTE }), 0, ++asalto);
    ponerEnEspera(l, CORTE);
    expect(l.ki!.acumulado).toEqual({ CON: 2, DES: 2, FUE: 2, POD: 6 });
    terminarAsalto(l, true);
    // Siguiente asalto: paga 1 (nivel 1) por tenerla lista y sigue acumulando.
    empezarAsalto(l, decision(true), 0, ++asalto);
    expect(l.ki!.reserva).toBe(99);
    expect(l.ki!.acumulado.FUE).toBe(6);
    ejecutar(l, DISPARO);
    expect(puedeEjecutar(l, CORTE)).toBe(true);
    ejecutar(l, CORTE);
    expect(l.ki!.reserva).toBe(99 - 6 - 13);
    expect(l.ki!.enEspera.size).toBe(0);
  });

  it('Defensa adicional deja sin penalizador las defensas siguientes del asalto (Dominus p.56)', () => {
    const DEFENSAS = tecnica('Defensas', 'Defensa adicional (+2)', { AGI: 2 });
    const def = crearLuchador(tecnicista([DEFENSAS], { ki: { reserva: 50, acumulacion: { AGI: 3 }, tecnicas: [DEFENSAS] } }), 'A', 0, 0);
    const atk = crearLuchador(tecnicista([]), 'B', 1, 0);
    empezarAsalto(def, decision(true), 0, ++asalto);
    const plena = defensaFinal(def, atk);
    ejecutar(def, DEFENSAS);
    def.defensasHechas = 2;
    expect(defensaFinal(def, atk)).toBe(plena);
    def.defensasHechas = 3;
    expect(defensaFinal(def, atk)).toBe(plena - 30);
  });
});

describe('efectos de las técnicas (Dominus cap. 5)', () => {
  it('tipo y clase de cada efecto', () => {
    expect(efectosDe(CORTE)).toMatchObject({ clase: 'ataque', accion: { ataque: 50, reduccionTA: 4 } });
    expect(efectosDe(PROTECCION)).toMatchObject({ clase: 'defensa', accion: { parada: 50 }, asalto: { ta: 4 } });
    expect(efectosDe(VELOCIDAD)).toMatchObject({ clase: 'variable', asalto: { turno: 100 } });
  });

  it('el multiplicador al daño va antes de sumar el aumento (Dominus p.55)', () => {
    const atk = crearLuchador(tecnicista([DISPARO]), 'A', 0, 0);
    const def = crearLuchador(tecnicista([]), 'B', 1, 0);
    expect(danoBase(atk, def, false, undefined, vistaPrevia(atk, DISPARO))).toBe(60 * 3 + 50);
  });

  it('Habilidad de Ataque y Destruir Armadura en el ataque', () => {
    const atk = crearLuchador(tecnicista([CORTE]), 'A', 0, 0);
    const def = crearLuchador(tecnicista([], { ta: { CON: 5 } }), 'B', 1, 0);
    const ki = vistaPrevia(atk, CORTE);
    expect(ataqueFinal(atk, def, { ki }) - ataqueFinal(atk, def)).toBe(50);
    expect(absorcionContra(def, atk, 'normal', 'CON', undefined, ki)).toBe(30);
  });

  it('Armadura se combina con la del personaje como una capa más: TA 6 + TA 4 = TA 8 (Dominus p.60)', () => {
    const atk = crearLuchador(tecnicista([]), 'A', 0, 0);
    const def = crearLuchador(tecnicista([PROTECCION], { ta: { CON: 6 } }), 'B', 1, 0);
    empezarAsalto(def, decision(true), 0, ++asalto);
    const ki = ejecutar(def, PROTECCION);
    expect(absorcionContra(def, atk, 'normal', 'CON')).toBe(100);
    expect(defensaFinal(def, atk, { ki }) - defensaFinal(def, atk)).toBe(50);
  });

  it('los efectos iguales de dos técnicas no se suman: vale el mayor (Core p.106)', () => {
    const m = combinar({ ...SIN_KI, ataque: 50 }, { ...SIN_KI, ataque: 75 });
    expect(m.ataque).toBe(75);
  });
});

describe('Kael en combate', () => {
  it('ejecuta técnicas y gasta reserva; con Ki rinde mucho más que sin él', () => {
    const elite = {
      id: 'elite', nombre: 'Elite', pv: 140, turno: 35, ataque: 100, defensa: 100, danoBase: 60, tipoAtaque: 'FIL' as const,
      ta: { FIL: 4, CON: 5, PEN: 4 }, rf: 45, constitucion: 7, tipoMovimiento: 6,
    };
    const grupo = [0, 1, 2].map((i) => ({ ...elite, id: `e${i}`, nombre: `Elite ${i}` }));
    let conKi = 0;
    let sinKi = 0;
    let tecnicas = 0;
    const kael = tecnicista([CORTE, PROTECCION, DISPARO], { pv: 160, ataque: 160, defensa: 160, turno: 90 });
    for (let s = 1; s <= 60; s++) {
      const r = simularCombate([kael], grupo, { semilla: s });
      if (r.ganador === 'A') conKi++;
      for (const n of Object.values(r.luchadores[0].stats.tecnicas)) tecnicas += n ?? 0;
      if (simularCombate([{ ...kael, ki: undefined }], grupo, { semilla: s }).ganador === 'A') sinKi++;
    }
    expect(tecnicas).toBeGreaterThan(60);
    expect(conKi).toBeGreaterThan(sinKi);
  });
});

describe('Límites (Dominus p.28-29)', () => {
  it('Custodium: 30 de Ki cuando un aliado queda gravemente herido y 40 si muere, una vez por aliado', async () => {
    const { custodium } = await import('../src/motor/ki');
    const f = tecnicista([CORTE]);
    const g = crearLuchador({ ...f, ki: { ...f.ki!, limites: ['custodium'] } }, 'A', 0, 0);
    const aliado = crearLuchador({ ...f, id: 'aliado', nombre: 'Aliado', pv: 100 }, 'A', 1, 0);
    const rival = crearLuchador({ ...f, id: 'rival', nombre: 'Rival', pv: 100 }, 'B', 2, 0);
    g.ki!.reserva = 20;
    aliado.pv = 50;
    expect(custodium(g, aliado, false)).toBe(0);
    aliado.pv = 20;
    expect(custodium(g, aliado, false)).toBe(30);
    expect(custodium(g, aliado, false)).toBe(0);
    rival.pv = 10;
    expect(custodium(g, rival, false)).toBe(0);
    g.ki!.reserva = 10;
    expect(custodium(g, aliado, true)).toBe(40);
  });

  it('Caelum: recupera 30 de Ki una sola vez al bajar de un cuarto de sus PV, sin pasar la reserva inicial', () => {
    const f = tecnicista([CORTE]);
    const l = crearLuchador({ ...f, ki: { ...f.ki!, limites: ['caelum'] } }, 'A', 0, 0);
    l.ki!.reserva = 50;
    l.pv = 50;
    expect(alPerderPv(l, 10)).toBe(null);
    l.pv = 30;
    expect(alPerderPv(l, 20)).toBe('Caelum');
    expect(l.ki!.reserva).toBe(80);
    l.pv = 10;
    expect(alPerderPv(l, 20)).toBe(null);
    l.ki!.reserva = 90;
    expect(recuperarKi(l, 30)).toBe(10);
  });

  it('Cenobus: 1 de Ki cada 5 de daño', () => {
    const f = tecnicista([CORTE]);
    const l = crearLuchador({ ...f, ki: { ...f.ki!, limites: ['cenobus'] } }, 'A', 0, 0);
    l.ki!.reserva = 50;
    alPerderPv(l, 12);
    alPerderPv(l, 3);
    expect(l.ki!.reserva).toBe(53);
  });
});
