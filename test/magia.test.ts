// Magia en combate, parte 1: el núcleo (Core cap. 11, p.117-123).

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import type { Ficha } from '../src/motor/modelo';
import { crearLuchador, simularCombate } from '../src/motor/combate';
import { absorcionContra, ataqueMagico, defensaEscudoMagico, defensaFinal } from '../src/motor/calculos';
import { CATALOGO, conjurosDe, gradosPosibles } from '../src/motor/conjuros';
import { alcanceMagico, danoAlAcumular, empezarAsaltoMagia, lanzar, puedeLanzar, terminarAsaltoMagia } from '../src/motor/magia';
import { golpeDeConjuro } from '../src/motor/ia';
import { absorcion } from '../src/motor/reglas';
import { hojaAFicha } from '../src/hoja/ficha';

const conjuro = (n: string) => CATALOGO.find((c) => c.nombre === n)!;
const abel: Ficha[] = JSON.parse(readFileSync(new URL('../ejemplos/arquetipos-abel.json', import.meta.url), 'utf8')).fichas;
const soldado = abel.find((f) => f.id === 'soldado')!;

const mago = (extra: Partial<Ficha> = {}): Ficha => ({
  id: 'mago', nombre: 'Mago', pv: 120, turno: 70, ataque: 20, defensa: 30, danoBase: 30, tipoAtaque: 'CON',
  ta: {}, rf: 40, constitucion: 6, tipoMovimiento: 6, inteligencia: 9, resistirDolor: 60, rm: 80,
  magia: { zeon: 600, act: 50, proyeccion: 130, vias: { Luz: 40 } },
  ...extra,
});

describe('la planilla y los conjuros que conoce', () => {
  it('Stéphan: zeon, ACT, Proyección y las vías; conoce los de Fuego y Luz del catálogo', () => {
    const dir = new URL('../fichas/', import.meta.url);
    const f = hojaAFicha(readFileSync(new URL(readdirSync(dir).find((x) => x.startsWith('St'))!, dir)));
    expect(f.magia).toMatchObject({ zeon: 1235, act: 110, proyeccion: 140, vias: { Fuego: 80, Luz: 40 } });
    expect(conjurosDe(f.magia!).map((c) => c.nombre)).toEqual(['Escudo de Luz', 'Armadura de Luz', 'Descarga de Luz', 'Bola de Fuego', 'Descarga de Calor']);
    expect([f.rm, f.resistirDolor]).toEqual([90, 100]);
  });

  it('la vía tiene que llegar al nivel del conjuro, y la Inteligencia limita el grado (Core p.120-121)', () => {
    expect(conjurosDe({ zeon: 100, act: 10, proyeccion: 50, vias: { Luz: 20 } }).map((c) => c.nombre)).toEqual(['Escudo de Luz', 'Armadura de Luz']);
    expect(gradosPosibles(conjuro('Descarga de Luz'), 9)).toEqual([0, 1]);
    expect(gradosPosibles(conjuro('Escudo de Luz'), 10)).toEqual([0, 1, 2]);
  });

  it('alcance por la Proyección (Recuadro X)', () => {
    expect([alcanceMagico(60), alcanceMagico(100), alcanceMagico(130), alcanceMagico(150)]).toEqual([5, 25, 100, 250]);
  });
});

describe('acumular y lanzar (Core p.117)', () => {
  it('acumula su ACT; si hace otra cosa, la mitad; al lanzar, lo que sobra vuelve menos 10', () => {
    const l = crearLuchador(mago(), 'A', 0, 0);
    empezarAsaltoMagia(l, true);
    terminarAsaltoMagia(l);
    expect(l.magia!.acumulado).toBe(50);
    empezarAsaltoMagia(l, true);
    l.magia!.otraAccion = true;
    terminarAsaltoMagia(l);
    expect(l.magia!.acumulado).toBe(75);
    expect(puedeLanzar(l, conjuro('Descarga de Luz'), 1)).toBe(false);
    expect(puedeLanzar(l, conjuro('Descarga de Luz'), 0)).toBe(true);
    lanzar(l, conjuro('Descarga de Luz'), 0);
    terminarAsaltoMagia(l);
    expect([l.magia!.acumulado, l.magia!.reserva]).toEqual([0, 600 - 50 - 10]);
  });

  it('dejar de acumular devuelve lo acumulado menos 10; los mantenidos se pagan de la reserva', () => {
    const l = crearLuchador(mago(), 'A', 0, 0);
    empezarAsaltoMagia(l, true);
    empezarAsaltoMagia(l, true);
    lanzar(l, conjuro('Armadura de Luz'), 0);
    terminarAsaltoMagia(l);
    expect(l.magia!.reserva).toBe(600 - 60 - 10);
    empezarAsaltoMagia(l, false);
    expect(l.magia!.reserva).toBe(530 - 5);
    expect(l.magia!.armadura).toEqual({ energia: 2, resto: 1 });
  });

  it('recibir daño mientras acumula: Resistir el dolor contra el doble (Core p.118)', () => {
    const l = crearLuchador(mago({ resistirDolor: 300 }), 'A', 0, 0);
    empezarAsaltoMagia(l, true);
    const siempre50 = { next: () => 0.495 } as unknown as Parameters<typeof danoAlAcumular>[2];
    expect(danoAlAcumular(l, 100, siempre50)?.resultado).toBe('conserva');
    const flojo = crearLuchador(mago({ resistirDolor: 0 }), 'A', 0, 0);
    empezarAsaltoMagia(flojo, true);
    expect(danoAlAcumular(flojo, 100, siempre50)?.resultado).toBe('pierde');
    expect(flojo.magia!.reserva).toBe(550);
  });
});

describe('ataque, escudo y armadura', () => {
  it('Proyección sin penalizadores de combate, +40 en contacto; el conjuro no se para sin parar energía', () => {
    const l = crearLuchador(mago(), 'A', 0, 0);
    const lejos = crearLuchador(soldado, 'B', 20, 0);
    const cerca = crearLuchador(soldado, 'B', 1, 0);
    expect(ataqueMagico(l, lejos)).toBe(130);
    expect(ataqueMagico(l, cerca)).toBe(170);
    expect(defensaFinal(lejos, l, { kiAtk: golpeDeConjuro(conjuro('Descarga de Luz'), conjuro('Descarga de Luz').grados[0]), proyectil: 'disparo' })).toBeLessThanOrEqual(0);
  });

  it('Armadura de Luz: una capa más (TA 5 en energía en intermedio)', () => {
    const l = crearLuchador(mago(), 'A', 0, 0);
    const s = crearLuchador(soldado, 'B', 1, 0);
    l.magia!.armadura = { energia: 5, resto: 2 };
    expect(absorcionContra(l, s, 'normal', 'ENE')).toBe(absorcion(5));
    expect(absorcionContra(l, s, 'normal', 'FIL')).toBe(absorcion(2));
  });

  it('el escudo defiende con la Proyección sin penalizador por defensas ni proyectiles', () => {
    const l = crearLuchador(mago(), 'A', 0, 0);
    const s = crearLuchador(soldado, 'B', 1, 0);
    l.magia!.escudo = { conjuro: conjuro('Escudo de Luz'), grado: 1, resistencia: 1000 };
    l.defensasHechas = 3;
    expect(defensaEscudoMagico(l, s)).toBe(130);
  });

  it('en combate: dispara descargas y levanta el Escudo de Luz; los golpes físicos no lo dañan', () => {
    const r = simularCombate([mago({ magia: { zeon: 2000, act: 130, proyeccion: 150, vias: { Luz: 40 } }, pv: 300 })], [{ ...soldado, pv: 600 }], { semilla: 3, registrar: true, distanciaInicial: 15 });
    const t = r.registro!.map((x) => x.texto);
    expect(t.some((x) => x.startsWith('Mago lanza Descarga de Luz'))).toBe(true);
    const escudo = t.findIndex((x) => x.startsWith('Mago levanta Escudo de Luz'));
    if (escudo >= 0) expect(t.slice(escudo).some((x) => x.includes('rompe Escudo de Luz') || x.includes('Escudo de Luz de Mago aguanta'))).toBe(false);
  });
});
