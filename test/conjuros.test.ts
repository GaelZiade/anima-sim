// Magia en combate, parte 2: los conjuros de Stéphan (Luz, Fuego, Guerra y libres), caso por caso.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Ficha } from '../src/motor/modelo';
import { crearLuchador, simularCombate } from '../src/motor/combate';
import { absorcionContra, ataqueFinal, cegueraContra, defensaFinal, inmuneAlGolpe, turnoFinal } from '../src/motor/calculos';
import { CATALOGO, conjurosDe, conocidos, gradosPosibles, sinSimular } from '../src/motor/conjuros';
import { GRIMORIO } from '../src/motor/grimorio';
import { bendecir, costeConjuro, danoLlamas, empezarAsaltoMagia, estadoLlamas, lanzar, puedeLanzar, quitarBendicion, rmDe } from '../src/motor/magia';
import { blancosConjuro, golpeDeConjuro } from '../src/motor/ia';

const conjuro = (n: string) => CATALOGO.find((c) => c.nombre === n)!;
const abel: Ficha[] = JSON.parse(readFileSync(new URL('../ejemplos/arquetipos-abel.json', import.meta.url), 'utf8')).fichas;
const soldado = abel.find((f) => f.id === 'soldado')!;

const mago = (magia: Partial<NonNullable<Ficha['magia']>>, extra: Partial<Ficha> = {}): Ficha => ({
  id: 'mago', nombre: 'Mago', pv: 300, turno: 70, ataque: 20, defensa: 30, danoBase: 30, tipoAtaque: 'CON',
  ta: {}, rf: 40, constitucion: 6, tipoMovimiento: 6, inteligencia: 11, resistirDolor: 60, rm: 80,
  magia: { zeon: 3000, act: 150, proyeccion: 150, vias: {}, ...magia },
  ...extra,
});

describe('el grimorio (generado de la planilla)', () => {
  it('todas las vías, sub-vías y libre acceso, con zeon e Inteligencia en los cuatro grados', () => {
    expect(GRIMORIO.length).toBeGreaterThan(600);
    for (const v of ['luz', 'oscuridad', 'fuego', 'agua', 'aire', 'tierra', 'creacion', 'destruccion', 'esencia', 'ilusion', 'nigromancia', 'guerra', 'libre acceso'])
      expect(GRIMORIO.some((e) => e.via === v)).toBe(true);
    for (const e of GRIMORIO) expect(e.grados.every((g) => g.zeon > 0 && g.int > 0)).toBe(true);
  });

  it('el catálogo toma sus números del grimorio y corrige donde manda el manual', () => {
    const bola = conjuro('Bola de Fuego');
    expect(bola.grados.map((g) => [g.zeon, g.int, g.dano, g.area])).toEqual([[50, 6, 50, 5], [100, 9, 100, 25], [160, 12, 140, 80], [250, 15, 160, 150]]);
    expect(conjuro('Incinerar').grados[2].int).toBe(14);
    expect(conjuro('Incinerar').grados[0].mantenimiento).toBeUndefined();
  });

  it('Stéphan conoce todo su grimorio; el simulador usa los de combate', () => {
    const m = { zeon: 1, act: 1, proyeccion: 1, vias: { Fuego: 80, Luz: 40 }, subvias: { Fuego: 'Guerra', Luz: 'Conocimiento' }, libres: ['Curar heridas', 'Invisibilidad'] };
    const sabe = conocidos(m).map((e) => e.nombre);
    expect(sabe).toEqual(expect.arrayContaining(['Bola de fuego', 'Tormenta de fuego', 'Campeón', 'Saber debilidad', 'Descarga de luz', 'Curar heridas', 'Invisibilidad']));
    expect(sabe).not.toContain('Maestro de la guerra');
    expect(sinSimular(m).map((e) => e.nombre)).toEqual(expect.arrayContaining(['Invisibilidad', 'Barrera de fuego', 'Saber debilidad']));
    expect(conjurosDe(m).length + sinSimular(m).length).toBe(sabe.length);
  });
});

describe('qué conjuros conoce', () => {
  it('la sub-vía de Guerra sólo si la eligió para Fuego (Arcana p.32)', () => {
    const sin = conjurosDe({ zeon: 1, act: 1, proyeccion: 1, vias: { Fuego: 80 } }).map((c) => c.nombre);
    const con = conjurosDe({ zeon: 1, act: 1, proyeccion: 1, vias: { Fuego: 80 }, subvias: { Fuego: 'Guerra' } }).map((c) => c.nombre);
    expect(sin).not.toContain('Campeón');
    expect(con).toEqual(expect.arrayContaining(['Ira Ancestral', 'Velocidad en la Batalla', 'Destrucción Desencadenada', 'Protección Final', 'Campeón']));
  });

  it('Conjuro Especialista: +1 a la Inteligencia para ese conjuro (Arcana p.30)', () => {
    const m = { zeon: 1, act: 1, proyeccion: 1, vias: { Fuego: 80 }, especialista: ['Incinerar'] };
    expect(gradosPosibles(conjuro('Incinerar'), 11)).toEqual([0]);
    expect(gradosPosibles(conjuro('Incinerar'), 11, m)).toEqual([0, 1]);
    expect(gradosPosibles(conjuro('Crítico Directo'), 11, m)).toEqual([0, 1]);
  });

  it('RM: la de la planilla, o la Presencia más el bono de Poder', () => {
    expect(rmDe(crearLuchador(mago({}), 'A', 0, 0))).toBe(80);
    const s = crearLuchador(soldado, 'B', 0, 0);
    expect(rmDe(s)).toBe(s.ficha.presencia ?? s.ficha.rf);
  });
});

describe('Control del Espacio (Arcana p.28)', () => {
  it('cuesta 10 de zeon más y deja afuera a los suyos', () => {
    const c = conjuro('Bola de Fuego');
    expect(costeConjuro(c, c.grados[1], true)).toBe(110);
    const l = crearLuchador(mago({ controlDelEspacio: true }), 'A', 0, 0);
    const aliado = crearLuchador(soldado, 'A', 20, 0);
    const e1 = crearLuchador(soldado, 'B', 21, 0);
    const e2 = crearLuchador(soldado, 'B', 22, 0);
    const ctx = { luchadores: [l, aliado, e1, e2] } as never;
    expect(blancosConjuro(ctx, l, e1, c, c.grados[0], false)).toEqual([aliado, e1, e2]);
    expect(blancosConjuro(ctx, l, e1, c, c.grados[0], true)).toEqual([e1, e2]);
  });
});

describe('beneficios de Guerra y de Fuego', () => {
  it('suman al ataque, al turno, al daño y a la TA; el mismo conjuro de dos fuentes no se acumula', () => {
    const l = crearLuchador(soldado, 'A', 0, 0);
    const rival = crearLuchador(soldado, 'B', 1, 0);
    const m1 = crearLuchador(mago({}), 'A', 5, 0);
    const m2 = crearLuchador(mago({}), 'A', 6, 0);
    const [at, tu, abs] = [ataqueFinal(l, rival), turnoFinal(l), absorcionContra(l, rival)];
    bendecir(l, m1, conjuro('Ira Ancestral'), { ataque: 10, ira: true });
    bendecir(l, m1, conjuro('Campeón'), { toda: 10, dano: 10, turno: 10, ta: 2 });
    bendecir(l, m2, conjuro('Campeón'), { toda: 10, dano: 10, turno: 10, ta: 2 });
    expect(ataqueFinal(l, rival)).toBe(at + 20);
    expect(turnoFinal(l)).toBe(tu + 10);
    expect(absorcionContra(l, rival)).toBe(abs + 20);
    quitarBendicion(l, m1, conjuro('Campeón'));
    quitarBendicion(l, m2, conjuro('Campeón'));
    quitarBendicion(l, m1, conjuro('Ira Ancestral'));
    expect([ataqueFinal(l, rival), turnoFinal(l), l.bono]).toEqual([at, tu, null]);
  });

  it('un ejemplar por blanco: Arma Ígnea a dos aliados; muerto el blanco, no se paga más', () => {
    const m = crearLuchador(mago({ libres: ['Arma Ígnea', 'Campeón'] }), 'A', 0, 0);
    const [k1, k2] = [crearLuchador(soldado, 'A', 1, 0), crearLuchador(soldado, 'A', 2, 0)];
    m.magia!.acumulado = 1000;
    const arma = conjuro('Arma Ígnea');
    expect(puedeLanzar(m, arma, 0)).toBe(true);
    lanzar(m, arma, 0, { blancos: [k1] });
    expect(puedeLanzar(m, arma, 0)).toBe(true);
    lanzar(m, arma, 0, { blancos: [k2] });
    expect([k1.bono?.tipoArma, k2.bono?.tipoArma, m.magia!.mantenidos.length]).toEqual(['CAL', 'CAL', 2]);
    k1.estado = 'muerto';
    empezarAsaltoMagia(m, false);
    expect(m.magia!.mantenidos.map((x) => x.blancos![0])).toEqual([k2]);
  });

  it('Cuerpo a Fuego: inmune a lo que no es energía, frío o agua; un conjuro de calor no lo daña', () => {
    const l = crearLuchador(soldado, 'A', 0, 0);
    const s = crearLuchador(soldado, 'B', 1, 0);
    const m = crearLuchador(mago({}), 'B', 3, 0);
    bendecir(l, m, conjuro('Cuerpo a Fuego'), { cuerpoFuego: true });
    expect(inmuneAlGolpe(l, s, 'FIL')).toBe(true);
    expect(inmuneAlGolpe(l, s, 'ENE')).toBe(false);
    expect(inmuneAlGolpe(l, s, 'FRI')).toBe(false);
    const bola = conjuro('Bola de Fuego');
    expect(inmuneAlGolpe(l, m, 'CAL', golpeDeConjuro(bola, bola.grados[0]))).toBe(true);
  });
});

describe('Tabla 76: En llamas (Core p.236)', () => {
  it('estados y PV por asalto; la armadura contra calor resta 2 por TA salvo calcinado', () => {
    expect([estadoLlamas(99), estadoLlamas(100), estadoLlamas(180), estadoLlamas(240), estadoLlamas(300)]).toEqual(['', 'prendido', 'ardiendo', 'en llamas', 'calcinado']);
    const l = crearLuchador({ ...soldado, ta: { CAL: 2 } }, 'A', 0, 0);
    l.llamas = 150;
    expect(danoLlamas(l)).toBe(0);
    l.llamas = 200;
    expect(danoLlamas(l)).toBe(6);
    l.llamas = 250;
    expect(danoLlamas(l)).toBe(21);
    l.llamas = 320;
    expect(danoLlamas(l)).toBe(50);
  });

  it('en combate, el fuego prende y quema cada asalto', () => {
    const textos: string[] = [];
    for (let semilla = 1; semilla <= 30 && !textos.some((x) => / se quema /.test(x)); semilla++) {
      const r = simularCombate([mago({ vias: { Fuego: 30 } })], [{ ...soldado, pv: 2000 }], { semilla, registrar: true, distanciaInicial: 20, maxAsaltos: 8 });
      textos.push(...r.registro!.map((x) => x.texto));
    }
    expect(textos.some((x) => /queda (prendido|ardiendo|en llamas|calcinado) \(Tabla 76/.test(x))).toBe(true);
    expect(textos.some((x) => / se quema \(/.test(x))).toBe(true);
  });
});

describe('anímicos y automáticos', () => {
  it('un anímico es invisible: sin ver la magia se defiende cegado (Core p.122)', () => {
    const l = crearLuchador(mago({}), 'A', 0, 0);
    const s = crearLuchador(soldado, 'B', 10, 0);
    const c = conjuro('Crítico Directo');
    const normal = defensaFinal(s, l, { kiAtk: golpeDeConjuro(conjuro('Descarga de Calor'), conjuro('Descarga de Calor').grados[0]) });
    const ciego = defensaFinal(s, l, { kiAtk: golpeDeConjuro(c, c.grados[0]) });
    expect(ciego).toBeLessThan(normal);
  });

  it('Flash Cegador: ceguera por tantos asaltos como decenas de fracaso', () => {
    let visto = false;
    for (let semilla = 1; semilla <= 20 && !visto; semilla++) {
      const r = simularCombate([mago({ libres: ['Flash Cegador'] })], [0, 1, 2].map((i) => ({ ...soldado, id: `s${i}`, nombre: `S${i}` })), { semilla, registrar: true, distanciaInicial: 4, maxAsaltos: 4 });
      const t = r.registro!.map((x) => x.texto);
      visto = t.some((x) => /queda ciego \d+ asalto/.test(x)) && t.some((x) => /falla la RF contra el Flash Cegador/.test(x));
    }
    expect(visto).toBe(true);
    const l = crearLuchador(soldado, 'A', 0, 0);
    l.cegado = 2;
    expect(cegueraContra(l, crearLuchador(soldado, 'B', 1, 0)).nivel).toBe(2);
  });

  it('Tormenta de Fuego: ataca desde el asalto siguiente a quienes están en la zona', () => {
    let visto = false;
    for (let semilla = 1; semilla <= 20 && !visto; semilla++) {
      const r = simularCombate([mago({ libres: ['Tormenta de Fuego'] })], [0, 1, 2].map((i) => ({ ...soldado, id: `s${i}`, nombre: `S${i}` })), { semilla, registrar: true, distanciaInicial: 30, maxAsaltos: 5 });
      const t = r.registro!.map((x) => x.texto);
      const lanza = t.findIndex((x) => /lanza Tormenta de Fuego/.test(x));
      visto = lanza >= 0 && t.slice(lanza).some((x) => /Tormenta de Fuego de Mago ataca a S\d/.test(x));
    }
    expect(visto).toBe(true);
  });

  it('Crítico Directo y Consumir Esencia: RM y después su efecto', () => {
    const textos: string[] = [];
    for (let semilla = 1; semilla <= 40; semilla++) {
      const r = simularCombate([mago({ libres: ['Crítico Directo', 'Consumir Esencia'] }, { inteligencia: 12 })], [{ ...soldado, pv: 400 }], { semilla, registrar: true, distanciaInicial: 3, maxAsaltos: 5 });
      textos.push(...r.registro!.map((x) => x.texto));
    }
    expect(textos.some((x) => /falla la RM contra (Crítico Directo|Consumir Esencia)/.test(x))).toBe(true);
  });
});
