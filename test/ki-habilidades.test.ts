// Habilidades del Ki en combate (Core p.103-105, Dominus p.19-22).

import { describe, expect, it } from 'vitest';
import type { Ficha, Tecnica } from '../src/motor/modelo';
import { crearLuchador, simularCombate } from '../src/motor/combate';
import { absorcionContra } from '../src/motor/calculos';
import { curable, dificultadDestruccion, efectosDe, ejecutar, empezarAsalto, fichaConAumento, repertorio, tecnicasPara, type DecisionKi } from '../src/motor/ki';
import { curacionKi } from '../src/motor/ia';
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

describe('Curación por Ki (Core p.104, Dominus p.20)', () => {
  const sanadora = () => maestro(['Curacion por Ki', 'Curacion superior']);

  it('5 PV por punto de Ki con la superior, nunca más de la mitad del daño sufrido', () => {
    const l = crearLuchador(sanadora(), 'A', 0, 0);
    l.pv = 80;
    l.stats.danoRecibido = 120;
    expect(curable(l)).toBe(60);
    l.curado = 50;
    expect(curable(l)).toBe(10);
  });

  it('sin enemigos al alcance, la IA se cura en lugar de quedarse quieta', () => {
    const ctx = { luchadores: [] as ReturnType<typeof crearLuchador>[] };
    const l = crearLuchador(sanadora(), 'A', 0, 0);
    const lejos = crearLuchador(rival('FIL'), 'B', 60, 0);
    ctx.luchadores.push(l, lejos);
    l.pv = 80;
    l.stats.danoRecibido = 120;
    const cura = curacionKi(ctx as unknown as Parameters<typeof curacionKi>[0], l);
    expect(cura?.quien).toBe(l);
    // 60 PV curables a 5 por punto: 12 de Ki.
    expect(cura?.ki).toBe(12);
  });
});

describe('Aumento de características (Core p.105, Dominus p.21)', () => {
  const fuerte = (extra: Partial<Ficha> = {}) => maestro(['Aumento de caracteristicas'], {
    atributos: { AGI: 8, CON: 8, DES: 9, FUE: 9 }, ki: { reserva: 60, acumulacion: { DES: 2 }, tecnicas: [] }, ...extra,
  });

  it('recalcula los bonos: DES 9 → 12 suma +10 al ataque, a la parada y al turno (Tabla 3)', () => {
    const f = fuerte();
    const g = fichaConAumento(f, 'DES', 9, 12);
    expect(g.ataque - f.ataque).toBe(10);
    expect(g.defensa - f.defensa).toBe(10);
    expect(g.turno - f.turno).toBe(10);
    // FUE 9 → 12: +10 al daño, redondeado en grupos de 10 hacia arriba.
    expect(fichaConAumento(f, 'FUE', 9, 12).danoBase).toBe(70);
    // Volver deja la ficha como estaba.
    const h = fichaConAumento(g, 'DES', 12, 9);
    expect([h.ataque, h.defensa, h.turno]).toEqual([f.ataque, f.defensa, f.turno]);
  });

  it('activarlo cuesta el valor alcanzado y después 1 de Ki por asalto; la IA lo usa si le sobra Ki', () => {
    const r = simularCombate([fuerte()], [rival('FIL')], { semilla: 5, registrar: true });
    const linea = r.registro!.find((x) => x.texto.includes('usa Aumento de características'));
    expect(linea?.texto).toMatch(/: (DES|AGI|FUE|CON) \d+ → \d+ \[reserva \d+\]/);
  });
});

describe('Destrucción por Ki (Core p.104)', () => {
  it('dificultad: Presencia base +5 por punto extra, hasta el doble', () => {
    const l = crearLuchador(maestro(['Destruccion por Ki']), 'A', 0, 0);
    expect(dificultadDestruccion(l, 0)).toBe(60);
    expect(dificultadDestruccion(l, 5)).toBe(85);
    expect(dificultadDestruccion(l, 40)).toBe(120);
  });

  it('la IA la usa contra un rival de RF baja y el fracaso le quita PV sin contar la armadura', () => {
    const blindado: Ficha = { ...rival('FIL'), ta: { FIL: 8, CON: 8, PEN: 8 }, rf: 20, pv: 400 };
    const r = simularCombate([maestro(['Destruccion por Ki'], { ki: { reserva: 60, acumulacion: {}, tecnicas: [] } })], [blindado], { semilla: 2, registrar: true });
    const usos = r.registro!.filter((x) => x.texto.includes('usa Destrucción por Ki contra'));
    expect(usos.length).toBeGreaterThan(0);
    const falla = r.registro!.findIndex((x) => x.texto.includes('falla la RF contra la Destrucción por Ki'));
    if (falla >= 0) expect(r.registro![falla + 1].texto).toMatch(/Rival pierde \d+ PV/);
  });
});

describe('Forzar Técnicas (Dominus p.21) y Técnicas Combinables (Dominus p.49)', () => {
  const tecnica = (nombre: string, efectos: [string, string][], coste: Record<string, number>, extra: Partial<Tecnica> = {}): Tecnica => ({
    nombre, nivel: 1, cm: 10, coste, mantenimiento: 0, combinable: false,
    efectos: efectos.map(([n, o]) => ({ nombre: n, opciones: [o], mantenido: false })), ...extra,
  });
  const golpe = tecnica('Golpe', [['Habilidad de Ataque', '+50'], ['Multiplicador al Dano', 'x3'], ['Ataque adicional', '5']], { DES: 4, FUE: 5 });

  it('forzada: doble de Ki, +la mitad de cada efecto y +1 al multiplicador', () => {
    const f = maestro(['Forzar Tecnicas'], { ki: { reserva: 60, acumulacion: {}, tecnicas: [golpe] } });
    const forz = repertorio(f).find((t) => t.nombre === 'Golpe (forzada)')!;
    expect(forz.coste).toEqual({ DES: 8, FUE: 10 });
    const ef = efectosDe(forz).accion;
    expect([ef.ataque, ef.multDano, ef.ataquesAdicionales]).toEqual([75, 4, 7]);
    // Sin la habilidad no hay forzadas.
    expect(repertorio(maestro([], { ki: { reserva: 60, acumulacion: {}, tecnicas: [golpe] } }))).toEqual([golpe]);
  });

  it('una mantenida forzada sólo rinde de más en el asalto en que se ejecuta', () => {
    const veloz = tecnica('Veloz', [['Incrementar Turno', '+100']], { AGI: 4 }, { mantenimiento: 2 });
    const l = crearLuchador(maestro(['Forzar Tecnicas'], { ki: { reserva: 60, acumulacion: { AGI: 8 }, tecnicas: [veloz] } }), 'A', 0, 0);
    empezarAsalto(l, decision({ acumula: true }), 0, 1);
    const forz = repertorio(l.ficha).find((t) => t.nombre === 'Veloz (forzada)')!;
    expect(ejecutar(l, forz).turno).toBe(150);
    expect(l.ki!.mantenidas.has(veloz)).toBe(true);
    // Mantenida, ninguna de sus variantes se puede volver a ejecutar.
    expect(tecnicasPara(l, 'variable')).toEqual([]);
    empezarAsalto(l, decision(), 0, 2);
    expect(l.ki!.activo.turno).toBe(100);
  });

  it('combinadas: suman los costes, reúnen los efectos y de los iguales vale el mayor', () => {
    const a = tecnica('A', [['Habilidad de Ataque', '+75'], ['Ataque a distancia', '250 metros']], { DES: 5 }, { combinable: true });
    const b = tecnica('B', [['Multiplicador al Dano', 'x2'], ['Habilidad de Ataque', '+100']], { FUE: 6, DES: 2 }, { combinable: true });
    const c = tecnica('C', [['Habilidad de Parada', '+50']], { AGI: 3 });
    const r = repertorio(maestro([], { ki: { reserva: 60, acumulacion: {}, tecnicas: [a, b, c] } }));
    expect(r.map((t) => t.nombre)).toEqual(['A', 'B', 'C', 'A + B']);
    const ab = r[3];
    expect(ab.coste).toEqual({ DES: 7, FUE: 6 });
    const ef = efectosDe(ab).accion;
    expect([ef.ataque, ef.multDano]).toEqual([100, 2]);
  });

  it('la IA fuerza o combina cuando le rinde', () => {
    const a = tecnica('Tajo', [['Habilidad de Ataque', '+50']], { DES: 3 }, { combinable: true });
    const b = tecnica('Fuerza', [['Aumento de Dano', '+50']], { FUE: 3 }, { combinable: true });
    const r = simularCombate([maestro(['Forzar Tecnicas'], { ki: { reserva: 80, acumulacion: { DES: 3, FUE: 3 }, tecnicas: [a, b] } })],
      [{ ...rival('FIL'), pv: 400 }], { semilla: 4, registrar: true });
    expect(r.registro!.some((x) => /Tajo \+ Fuerza|\(forzada\)/.test(x.texto))).toBe(true);
  });
});

describe('Aura de combate (Dominus p.21)', () => {
  it('alcanza también a los aliados sensibles del radio, así que la IA no la enciende con uno cerca', () => {
    const isana = maestro(['Aura de combate'], { presencia: 80, ki: { reserva: 60, acumulacion: { POD: 4, VOL: 4 }, tecnicas: [] } });
    const aliado: Ficha = { ...rival('FIL'), id: 'aliado', nombre: 'Aliado', presencia: 20 };
    const sola = simularCombate([isana], [{ ...rival('FIL'), presencia: 20 }], { semilla: 1, registrar: true });
    expect(sola.registro!.some((x) => x.texto.includes('siente el Aura de combate de Kiran'))).toBe(true);
    const conAliado = simularCombate([isana, aliado], [{ ...rival('FIL'), presencia: 20 }], { semilla: 1, registrar: true });
    expect(conAliado.registro!.some((x) => x.texto.includes('desencadena'))).toBe(false);
  });
});
