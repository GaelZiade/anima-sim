// Combate con proyectiles (Core p.80-81, p.94-96) y línea de visión en el mapa.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ArmaDistancia, Ficha } from '../src/motor/modelo';
import { crearLuchador, simularCombate } from '../src/motor/combate';
import { defensaFinal, modProyectil } from '../src/motor/calculos';
import { completarArma, disparosConRecarga, lanzamientosPosibles, umbralEstallido } from '../src/motor/proyectiles';
import { penDefensaProyectil } from '../src/motor/reglas';

const tiradores: Ficha[] = JSON.parse(readFileSync(new URL('../ejemplos/tiradores.json', import.meta.url), 'utf8')).fichas;
const abel: Ficha[] = JSON.parse(readFileSync(new URL('../ejemplos/arquetipos-abel.json', import.meta.url), 'utf8')).fichas;
const soldado = abel.find((f) => f.id === 'soldado')!;
const arquero = tiradores.find((f) => f.id === 'arquero')!;
const textos = (a: Ficha[], b: Ficha[], o: Parameters<typeof simularCombate>[2] = {}) =>
  simularCombate(a, b, { semilla: 1, registrar: true, ...o }).registro!.map((x) => x.texto);

describe('reglas de proyectiles', () => {
  it('recarga: −30 por cada asalto que baja; por debajo de 1 dispara de más (Core p.96)', () => {
    expect(disparosConRecarga(1, 0)).toEqual({ disparos: 1, pen: 0, recargaFalta: 0 });
    expect(disparosConRecarga(1, 1)).toEqual({ disparos: 2, pen: 30, recargaFalta: 0 });
    expect(disparosConRecarga(2, 0)).toEqual({ disparos: 1, pen: 0, recargaFalta: 1 });
    expect(disparosConRecarga(2, 1)).toEqual({ disparos: 1, pen: 30, recargaFalta: 0 });
    expect(disparosConRecarga(4, 1)).toEqual({ disparos: 1, pen: 30, recargaFalta: 2 });
  });

  it('cadencia: uno por cada CF de habilidad, como mínimo uno; Tabla 34 por el nombre', () => {
    expect(lanzamientosPosibles(120, 40)).toBe(3);
    expect(lanzamientosPosibles(20, 80)).toBe(1);
    const daga = completarArma({ nombre: 'Daga', clase: 'lanzamiento', ataque: 100, danoBase: 30, tipoAtaque: 'PEN', alcance: 20 });
    expect(daga.cadencia).toBe(50);
    const arcabuz = completarArma({ nombre: 'Arcabuz', clase: 'disparo', ataque: 100, danoBase: 80, tipoAtaque: 'PEN', alcance: 80 });
    expect([arcabuz.recarga, arcabuz.fuego]).toEqual([4, true]);
  });

  it('Tabla 49: disparos y lanzamientos', () => {
    expect(penDefensaProyectil('parada', false, 'lanzamiento')).toBe(50);
    expect(penDefensaProyectil('parada', true, 'lanzamiento')).toBe(0);
    expect(penDefensaProyectil('esquiva', false, 'lanzamiento')).toBe(0);
    const l = crearLuchador(arquero, 'A', 0, 0);
    const e = crearLuchador(soldado, 'B', 20, 0);
    expect(defensaFinal(e, l) - defensaFinal(e, l, { proyectil: 'lanzamiento' })).toBe(50);
  });

  it('arma de fuego: con calidad +5 estalla recién desde 95', () => {
    expect(umbralEstallido(0)).toBe(80);
    expect(umbralEstallido(5)).toBe(95);
  });

  it('Tabla 47: fuera del alcance efectivo −30 y la mitad de daño, cobertura −40, apuntar, bocajarro +30', () => {
    const arco = arquero.armasDistancia![0];
    const l = crearLuchador(arquero, 'A', 0, 0);
    const lejos = crearLuchador(soldado, 'B', 100, 0);
    expect(modProyectil(l, lejos, arco, 'libre')).toEqual({ bono: -30, lejos: true });
    expect(modProyectil(l, lejos, arco, 'cobertura').bono).toBe(-70);
    l.apuntando = { blanco: lejos, arma: 0, asaltos: 2 };
    expect(modProyectil(l, lejos, arco, 'libre').bono).toBe(-10);
    const cerca = crearLuchador(soldado, 'B', 1, 0);
    l.apuntando = null;
    expect(modProyectil(l, cerca, arco, 'libre')).toEqual({ bono: 30, lejos: false });
  });
});

describe('combate a distancia', () => {
  it('el arquero dispara desde lejos y el soldado no puede contraatacarlo', () => {
    const t = textos([arquero], [soldado], { distanciaInicial: 30 });
    expect(t.some((x) => x.startsWith('Arquero imperial dispara a Soldado imperial con Arco largo desde'))).toBe(true);
    expect(t.some((x) => x.includes('no tiene a Arquero imperial a su alcance'))).toBe(t.some((x) => /^Arquero.*desde \d+ m: .*→ -/.test(x)));
  });

  it('una pared entre los dos corta la línea de visión: sin poder moverse, nadie dispara', () => {
    const quietos = (f: Ficha): Ficha => ({ ...f, tipoMovimiento: 0 });
    const muro = Array.from({ length: 12 }, (_, y) => ({ x: 6, y }));
    const escenario = (bloqueadas: { x: number; y: number }[]) =>
      ({ mapa: { ancho: 13, alto: 12, bloqueadas }, posiciones: { A: [{ x: 2, y: 4 }], B: [{ x: 10, y: 4 }] } });
    const conPared = textos([quietos(arquero)], [quietos(soldado)], { escenario: escenario(muro), maxAsaltos: 3 });
    expect(conPared.some((x) => x.includes('dispara a'))).toBe(false);
    const sinPared = textos([quietos(arquero)], [quietos(soldado)], { escenario: escenario([]), maxAsaltos: 3 });
    expect(sinPared.some((x) => x.includes('dispara a'))).toBe(true);
  });

  it('el terreno infranqueable no tapa la vista: dispara por encima del abismo', () => {
    const abismo = Array.from({ length: 12 }, (_, y) => ({ x: 6, y }));
    const t = textos([arquero], [soldado], {
      escenario: { mapa: { ancho: 13, alto: 12, infranqueables: abismo }, posiciones: { A: [{ x: 2, y: 4 }], B: [{ x: 10, y: 4 }] } },
    });
    expect(t.some((x) => x.startsWith('Arquero imperial dispara a Soldado imperial'))).toBe(true);
    // El soldado no puede cruzar: nunca llega al cuerpo a cuerpo.
    expect(t.some((x) => x.startsWith('Soldado imperial ataca'))).toBe(false);
  });

  it('la ballesta recarga un asalto entre disparo y disparo', () => {
    const ballestero = tiradores.find((f) => f.id === 'ballestero')!;
    const t = textos([ballestero], [{ ...soldado, tipoMovimiento: 2 }], { distanciaInicial: 40 });
    const i = t.findIndex((x) => x.startsWith('Ballestero imperial dispara'));
    expect(i).toBeGreaterThan(-1);
    expect(t.slice(i + 1).find((x) => x.startsWith('Ballestero imperial'))).toMatch(/recarga Ballesta/);
  });

  it('se queda sin munición y las arrojadizas se pierden al lanzarlas', () => {
    const lanzador: Ficha = {
      ...soldado, id: 'lanzador', nombre: 'Lanzador',
      armasDistancia: [{ nombre: 'Daga', clase: 'lanzamiento', ataque: 100, danoBase: 30, tipoAtaque: 'PEN', alcance: 20, municion: 2 } as ArmaDistancia],
    };
    const r = simularCombate([lanzador], [{ ...soldado, pv: 400, tipoMovimiento: 2 }], { semilla: 2, registrar: true, distanciaInicial: 15 });
    const lanzadas = r.registro!.filter((x) => /^Lanzador lanza a/.test(x.texto)).length;
    expect(lanzadas).toBeLessThanOrEqual(2);
    expect(lanzadas).toBeGreaterThan(0);
  });

  it('las armas de la planilla: el hacha arrojadiza de Teseo y la pistola de Leo de Kael', async () => {
    const { hojaAFicha } = await import('../src/hoja/ficha');
    const { readdirSync } = await import('node:fs');
    const hoja = (p: string) => hojaAFicha(readFileSync(new URL(`../fichas/${readdirSync(new URL('../fichas', import.meta.url)).find((f) => f.startsWith(p))!}`, import.meta.url)));
    expect(hoja('Teseo').armasDistancia).toEqual([expect.objectContaining({ nombre: 'Hacha de mano', clase: 'lanzamiento', cadencia: 80, alcance: 60 })]);
    expect(hoja('Kael').armasDistancia).toEqual([expect.objectContaining({ clase: 'disparo', alcance: 50, leo: true, recarga: 1 })]);
  });
});
