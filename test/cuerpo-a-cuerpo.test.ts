// Lo que completa el combate cuerpo a cuerpo: Inutilizar, Inconsciencia, Engatillar, Mushin, Enuth,
// retirarse, Apartar, Haima, rotura (opcional), espacio reducido, desenfundar, Tsukiyomi y
// Hakyoukuken contra armaduras blandas.

import { describe, expect, it } from 'vitest';
import type { Contexto, Ficha, OpcionesEscenario, Rasgos } from '../src/motor/modelo';
import { crearLuchador, simularCombate } from '../src/motor/combate';
import { absorcionContra, ataqueFinal, defensaFinal, penAccion } from '../src/motor/calculos';
import { dificultadPuntosPresion, penManiobra } from '../src/motor/maniobras';
import { protectorPara, sacrificioHaima } from '../src/motor/ia';
import { claseArmadura } from '../src/hoja/ficha';

function ficha(arma: string, rasgos: Rasgos = {}, extra: Partial<Ficha> = {}): Ficha {
  return {
    id: arma, nombre: arma, pv: 150, turno: 80, ataque: 150, defensa: 150, danoBase: 50, tipoAtaque: 'FIL',
    ta: {}, rf: 50, constitucion: 7, tipoMovimiento: 6, arma: { nombre: arma }, rasgos, ...extra,
  };
}
const luchador = (f: Ficha, equipo: 'A' | 'B' = 'A', entorno: OpcionesEscenario = {}) => {
  const l = crearLuchador(f, equipo, 0, 0);
  l.entorno = entorno;
  return l;
};
const arte = (...artesMarciales: string[]) => ({ artesMarciales });

describe('maniobras que faltaban (Core p.91-92)', () => {
  const pen = (f: Ficha, m: Parameters<typeof penManiobra>[1]) => penManiobra(luchador(f), m, false);

  it('Inutilizar: apuntado a la pantorrilla −10 (Tabla 45); con un arma Precisa, la mitad', () => {
    expect(pen(ficha('Espada'), 'inutilizar')).toBe(10);
    expect(pen(ficha('Estoque', {}, { arma: { nombre: 'Estoque', precisa: true } }), 'inutilizar')).toBe(5);
  });

  it('Inconsciencia: cabeza −60; sin crítico Contundente, −40 más', () => {
    expect(pen(ficha('Maza', {}, { tipoAtaque: 'CON' }), 'inconsciencia')).toBe(60);
    expect(pen(ficha('Espada', {}, { tipoAtaque: 'FIL' }), 'inconsciencia')).toBe(100);
  });

  it('Engatillar −100; con la Tabla de Precisión −50 (Core p.65)', () => {
    expect(pen(ficha('Espada'), 'engatillar')).toBe(100);
    expect(pen(ficha('Espada', { tablas: ['Tabla de Precision'] }), 'engatillar')).toBe(50);
  });

  it('amenazado (Tabla 43): −120 a defenderse y −20 al atacar a quien lo amenaza; Hanja arcano no sufre el de defensa', () => {
    const amenaza = luchador(ficha('Amenaza'), 'B');
    const otro = luchador(ficha('Otro'), 'B');
    const l = luchador(ficha('Espada'));
    const [def, atk] = [defensaFinal(l, amenaza), ataqueFinal(l, amenaza)];
    l.amenazadoPor = amenaza;
    expect([defensaFinal(l, amenaza) - def, ataqueFinal(l, amenaza) - atk, defensaFinal(l, otro) - def]).toEqual([-120, -20, 0]);
    const hanja = luchador(ficha('Desarmado', arte('Hanja (Arcano)')));
    const base = defensaFinal(hanja, amenaza);
    hanja.amenazadoPor = amenaza;
    expect(defensaFinal(hanja, amenaza) - base).toBe(0);
  });
});

describe('Mushin (Dominus p.42)', () => {
  it('sólo con Mushin; RF contra daño + 20 (máx. 220), arcano + 40 (máx. 240)', () => {
    expect(penManiobra(luchador(ficha('Desarmado')), 'puntosPresion', false)).toBe(Infinity);
    expect(penManiobra(luchador(ficha('Desarmado', arte('Mushin (Base)'))), 'puntosPresion', false)).toBe(0);
    expect([dificultadPuntosPresion(100, false), dificultadPuntosPresion(250, false)]).toEqual([120, 220]);
    expect([dificultadPuntosPresion(100, true), dificultadPuntosPresion(250, true)]).toEqual([140, 240]);
  });

  it('el estado elegido del arcano penaliza el ataque: coma −60 (tabla del Mushin)', () => {
    const atk = luchador(ficha('Desarmado', arte('Mushin (Arcano)')));
    const def = luchador(ficha('Rival'), 'B');
    expect(ataqueFinal(atk, def, { maniobra: 'puntosPresion', estadoMushin: 'coma' }) - ataqueFinal(atk, def)).toBe(-60);
  });
});

describe('Hakyoukuken contra armaduras blandas (Dominus p.43)', () => {
  const def = luchador(ficha('Acorazado', {}, {
    ta: { CON: 4 },
    capasArmadura: [
      { nombre: 'Mallas', clase: 'blanda', ta: { CON: 2 }, calidad: 5, entereza: 15 },
      { nombre: 'Peto', clase: 'dura', ta: { CON: 2 }, calidad: 0, entereza: 16 },
    ],
  }), 'B');
  const golpe = (grado: string) => absorcionContra(def, luchador(ficha('Desarmado', arte(`Hakyoukuken (${grado})`), { tipoAtaque: 'CON' })));

  it('base: −2 a la TA blanda; arcano: la blanda vale sólo su calidad', () => {
    expect(absorcionContra(def, luchador(ficha('Desarmado', {}, { tipoAtaque: 'CON' })))).toBe(60);
    expect(golpe('Base')).toBe(40);
    expect(golpe('Arcano')).toBe(50); // mallas TA 2 → 1 por su +5
  });

  it('clase por nombre (Tabla 38): cuero endurecido es dura, completa de cuero blanda', () => {
    expect(['Completa cuero', 'Cuero endurecido', 'Mallas', 'Placas', 'Anillas'].map(claseArmadura))
      .toEqual(['blanda', 'dura', 'blanda', 'dura', 'blanda']);
  });
});

describe('condiciones del escenario', () => {
  it('espacio reducido (Tabla 43): −40 al ataque y la parada sólo con armas grandes, −40 a esquivar; la tabla lo reduce a la mitad; Hanja defiende sin penalizador', () => {
    const r = { espacioReducido: true };
    const rival = luchador(ficha('Rival'), 'B');
    const delta = (f: Ficha) => {
      const sin = luchador(f), con = luchador(f, 'A', r);
      return [ataqueFinal(con, rival) - ataqueFinal(sin, rival), defensaFinal(con, rival) - defensaFinal(sin, rival)];
    };
    expect(delta(ficha('Mandoble', {}, { tamanoArma: 'G' }))).toEqual([-40, -40]);
    expect(delta(ficha('Espada', {}, { tamanoArma: 'M' }))).toEqual([0, 0]);
    expect(delta(ficha('Espada', {}, { tamanoArma: 'M', tipoDefensa: 'esquiva' }))).toEqual([0, -40]);
    expect(delta(ficha('Mandoble', { tablas: ['Tabla de Movimiento en Espacios Reducidos'] }, { tamanoArma: 'G' }))).toEqual([-20, -20]);
    expect(delta(ficha('Desarmado', arte('Hanja (Base)'), { tipoDefensa: 'esquiva' }))).toEqual([0, 0]);
  });

  it('desenfundar: −25 al ataque y la parada, no a la esquiva; Batto jutsu sin penalizador (Core p.65)', () => {
    const rival = luchador(ficha('Rival'), 'B');
    const enfundado = (f: Ficha) => {
      const l = luchador(f);
      const [a, d] = [ataqueFinal(l, rival), defensaFinal(l, rival)];
      l.enfundada = true;
      return [ataqueFinal(l, rival) - a, defensaFinal(l, rival) - d];
    };
    expect(enfundado(ficha('Espada', {}, { tamanoArma: 'M' }))).toEqual([-25, -25]);
    expect(enfundado(ficha('Espada', {}, { tamanoArma: 'M', tipoDefensa: 'esquiva' }))).toEqual([-25, 0]);
    expect(enfundado(ficha('Katana', { tablas: ['Batto jutsu / Iai jutsu'] }, { tamanoArma: 'M' }))).toEqual([0, 0]);
  });

  it('Legado de Tsukiyomi: +20 a toda acción en luna nueva, nada de día (Dominus p.79)', () => {
    const f = ficha('Sacerdotisa', { ventajas: ['Legado de la Luna (Tsukiyomi)'] });
    expect(penAccion(luchador(f, 'A', { faseLunar: 'nueva' }))).toBe(-20);
    expect(penAccion(luchador(f, 'A', {}))).toBe(0);
  });

  it('Sangre Eterna: con PV negativos, negativo a toda acción igual a esos PV (Dominus p.80)', () => {
    const l = luchador(ficha('Eterno', { ventajas: ['Sangre Eterna'] }));
    l.pv = -30;
    expect(penAccion(l)).toBe(30);
  });
});

describe('defender a otros y Haima', () => {
  function ctx(...luchadores: ReturnType<typeof luchador>[]): Contexto {
    return {
      opciones: {}, rng: { next: () => 0.5 }, luchadores, asalto: 1, registro: null,
      ataquesEnAsalto: 0, ataquesAsaltoAnterior: 0, movimientosEnAsalto: 0, ventaja: { A: 1, B: 1 },
    };
  }

  it('Apartar: un aliado que esquiva, ganó el turno y reservó un ataque defiende con −30 (Core p.93)', () => {
    const protegido = luchador(ficha('Débil', {}, { defensa: 60 }));
    const aliado = luchador(ficha('Ágil', {}, { defensa: 180, tipoDefensa: 'esquiva' }));
    const atk = luchador(ficha('Atacante'), 'B');
    aliado.iniciativa = 150;
    atk.iniciativa = 100;
    aliado.ataquesRestantes = 1;
    const p = protectorPara(ctx(protegido, aliado, atk), protegido, atk);
    expect(p).toMatchObject({ quien: aliado, pen: 30, apartar: true });
    aliado.ataquesRestantes = 0; // ya usó todo: no reservó nada
    expect(protectorPara(ctx(protegido, aliado, atk), protegido, atk)).toBeNull();
  });

  it('con la Tabla de Guardaespaldas apartar cuesta −10 (Dominus p.28)', () => {
    const protegido = luchador(ficha('Débil', {}, { defensa: 60 }));
    const aliado = luchador(ficha('Escolta', { tablas: ['Tabla de Guardaespaldas'] }, { defensa: 180, tipoDefensa: 'esquiva' }));
    const atk = luchador(ficha('Atacante'), 'B');
    aliado.iniciativa = 150;
    aliado.ataquesRestantes = 1;
    expect(protectorPara(ctx(protegido, aliado, atk), protegido, atk)?.pen).toBe(10);
  });

  it('Haima (con Sangre Eterna): sacrifica algo más de la mitad del daño que espera recibir', () => {
    const def = luchador(ficha('Eterno', { ventajas: ['Sangre Eterna'], arsMagnus: ['Haima'] }, { defensa: 60 }));
    const atk = luchador(ficha('Atacante', {}, { ataque: 220, danoBase: 100 }), 'B');
    expect(def.cap.est.haima).toBe(true);
    expect(sacrificioHaima(def, atk, ataqueFinal(atk, def))).toBeGreaterThan(0);
    const sinLegado = luchador(ficha('Común', { arsMagnus: ['Haima'] }));
    expect(sinLegado.cap.est.haima).toBe(false);
  });
});

describe('en combate', () => {
  const muchos = (a: Ficha[], b: Ficha[], escenario: OpcionesEscenario, n = 60) =>
    Array.from({ length: n }, (_, s) => simularCombate(a, b, { semilla: s + 1, registrar: true, escenario }).registro!.map((e) => e.texto).join('\n')).join('\n');

  it('con la rotura activada, las armas sin calidad se rompen y las de calidad se mellan', () => {
    const golpeador = ficha('Golpeador', {}, { ataque: 160, atributos: { FUE: 13 }, arma: { nombre: 'Maza pesada', rotura: 12, entereza: 20 } });
    const fragil = ficha('Frágil', {}, { arma: { nombre: 'Espada vieja', rotura: 2, entereza: 8, calidad: 0 }, sinArmas: { turno: 100, ataque: 60, defensa: 60, danoBase: 20, tipoAtaque: 'CON' } });
    const buena = ficha('Buena', {}, { arma: { nombre: 'Espada +10', rotura: 6, entereza: 12, calidad: 10 } });
    expect(muchos([golpeador], [fragil], { rotura: true })).toMatch(/Se rompe el arma de Frágil/);
    expect(muchos([golpeador], [buena], { rotura: true })).toMatch(/se mella: baja a calidad \+5/);
    expect(muchos([golpeador], [fragil], {})).not.toMatch(/Se rompe/);
  });

  it('con huida, quien pierde claramente puede retirarse; sin ella pelea hasta el final', () => {
    const fuerte = ficha('Fuerte', {}, { ataque: 220, defensa: 200, danoBase: 80 });
    const debil = ficha('Débil', {}, { ataque: 100, defensa: 110, perfil: 'cauto' });
    expect(muchos([fuerte], [debil], { huida: true })).toMatch(/intenta retirarse|huye del combate/);
    expect(muchos([fuerte], [debil], {})).not.toMatch(/retirarse|huye/);
  });
});
