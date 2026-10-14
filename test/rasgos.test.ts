// Casos de additional_attack_rules_test, armour_reduction_rules_test, damage_barrier_rules_test y
// combat_traits_test de animaMasterToolkit, sobre las capacidades del simulador.

import { describe, expect, it } from 'vitest';
import type { Ficha, Rasgos } from '../src/motor/modelo';
import { capacidades, planDeAtaques, tamanoPorNombre } from '../src/motor/rasgos';
import { crearLuchador } from '../src/motor/combate';
import { absorcionContra, ataqueFinal, barreraFrena, defensaFinal } from '../src/motor/calculos';

function ficha(arma: string, ataque: number, rasgos: Rasgos = {}, extra: Partial<Ficha> = {}): Ficha {
  return {
    id: arma, nombre: arma, pv: 100, turno: 0, ataque, defensa: 100, danoBase: 50, tipoAtaque: 'FIL',
    ta: {}, rf: 50, constitucion: 6, tipoMovimiento: 6, arma: { nombre: arma }, rasgos, ...extra,
  };
}

/** Habilidad de cada ataque del asalto declarando `n`, como los arma el combate. */
function habilidades(f: Ficha, n: number): number[] {
  const l = crearLuchador(f, 'A', 0, 0);
  const otro = crearLuchador(ficha('Blanco', 100), 'B', 1, 0);
  l.ataquesDeclarados = n;
  l.planAtaques = planDeAtaques(l.cap, n);
  l.ataquesRestantes = l.planAtaques.length;
  const out: number[] = [];
  while (l.ataquesRestantes > 0) {
    out.push(ataqueFinal(l, otro));
    l.ataquesRestantes--;
  }
  return out;
}

describe('ataques adicionales (Core p.91)', () => {
  it('HA 220 con arma media: tres ataques con 160; con mandoble, 140', () => {
    expect(capacidades(ficha('Espada larga', 220)).maxAtaques).toBe(3);
    expect(habilidades(ficha('Espada larga', 220), 3)).toEqual([160, 160, 160]);
    expect(habilidades(ficha('Mandoble', 220), 3)).toEqual([140, 140, 140]);
  });

  it('HA 60: un solo ataque', () => expect(capacidades(ficha('Espada larga', 60)).maxAtaques).toBe(1));

  it('Lemures: dos espadas cortas, ambidiestro: 140 y 130; con un adicional 120, 120 y 110', () => {
    const lemures = ficha('Espada corta y Espada corta', 140, { ventajas: ['Ambidestria'] });
    expect(habilidades(lemures, 1)).toEqual([140, 130]);
    expect(habilidades(lemures, 2)).toEqual([120, 120, 110]);
  });

  it('segunda arma sin ambidestría: −40', () => expect(habilidades(ficha('Espada y Daga', 140), 1)).toEqual([140, 100]));

  it('Kempo supremo con HA 200: cuatro ataques con 170', () => {
    const f = ficha('Desarmado', 200, { artesMarciales: ['Kempo (Supremo)'] });
    expect(capacidades(f).maxAtaques).toBe(4);
    expect(habilidades(f, 4)).toEqual([170, 170, 170, 170]);
  });

  it('Kempo base −15 sin armas y no afecta a un arma; desarmado sin arte −20', () => {
    expect(capacidades(ficha('Desarmado', 200, { artesMarciales: ['Kempo (Base)'] })).penPorAtaque).toBe(15);
    expect(capacidades(ficha('Espada larga', 200, { artesMarciales: ['Kempo (Base)'] })).penPorAtaque).toBe(30);
    expect(capacidades(ficha('Desarmado', 200)).penPorAtaque).toBe(20);
  });

  it('Ataque Encadenado: grande −30, media −20, pequeña igual', () => {
    const t = { tablas: ['Tabla de Ataque encadenado'] };
    expect(capacidades(ficha('Mandoble', 200, t)).penPorAtaque).toBe(30);
    expect(capacidades(ficha('Espada larga', 200, t)).penPorAtaque).toBe(20);
    expect(capacidades(ficha('Daga', 200, t)).penPorAtaque).toBe(20);
  });

  it('el tamaño elegido a mano manda sobre el nombre', () =>
    expect(capacidades(ficha('Espada corta', 200, {}, { tamanoArma: 'G' })).penPorAtaque).toBe(40));

  it('deduce el tamaño del nombre', () => {
    expect(tamanoPorNombre('Espada corta')).toBe('P');
    expect(tamanoPorNombre('Espada Kaitos y Espada Kaitos')).toBe('M');
    expect(tamanoPorNombre('Martillo de guerra y Escudo medio')).toBe('M');
    expect(tamanoPorNombre('Daga y Mandoble')).toBe('G');
    expect(tamanoPorNombre('Gran martillo de guerra')).toBe('M');
    expect(tamanoPorNombre('Espada bastarda')).toBe('G');
    expect(tamanoPorNombre('Escudo medio')).toBeNull();
    expect(tamanoPorNombre('Tópico épico')).toBeNull();
  });

  it('Kaito: HA 210, espadas medias, Encadenado, Ataque Adicional, ambidiestro y Tae Kwon Do base', () => {
    const kaito = ficha('Espada Kaitos y Espada Kaitos', 210, {
      ventajas: ['Ambidestria'], tablas: ['Tabla de Ataque encadenado', 'Tabla de Ataque adicional'],
      artesMarciales: ['Tae Kwon Do (Base)'],
    });
    expect(capacidades(kaito).maxAtaques).toBe(4);
    // 4 declarados con 150, segunda arma con 140 y patada con 120.
    expect(habilidades(kaito, 4)).toEqual([150, 150, 150, 150, 140, 120]);
  });

  it('Tae Kwon Do: patada −30 base, −20 avanzado, sin penalizador en supremo', () => {
    const patada = (g: string) => capacidades(ficha('Mandoble', 210, { artesMarciales: [`Tae Kwon Do (${g})`] })).extras[0].pen;
    expect([patada('Base'), patada('Avanzado'), patada('Supremo')]).toEqual([30, 20, 0]);
  });
});

describe('reducción de TA', () => {
  const red = (f: Ficha) => capacidades(f).reduccionTA;

  it('calidad: cada +5 resta un tipo', () => {
    expect([4, 5, 10, 15, -5].map((q) => red(ficha('Arma', 100, {}, { arma: { nombre: 'Arma', calidad: q } })))).toEqual([0, 1, 2, 3, 0]);
  });

  it('Tabla de Reducción de Armadura, una o varias veces', () => {
    expect(red(ficha('Arma', 100, { tablas: ['Tabla de Reduccion de armadura'] }))).toBe(1);
    expect(red(ficha('Arma', 100, { tablas: ['Tabla de Reducción de Armadura (2)'] }))).toBe(2);
  });

  it('Dumah sólo sin armas: −2, o −6 en Arcano', () => {
    expect(red(ficha('Desarmado', 100, { artesMarciales: ['Dumah (Base)'] }))).toBe(2);
    expect(red(ficha('Desarmado', 100, { artesMarciales: ['Dumah (Arcano)'] }))).toBe(6);
    expect(red(ficha('Espada', 100, { artesMarciales: ['Dumah (Arcano)'] }))).toBe(0);
  });

  it('todo se acumula, y la TA no baja de 0', () => {
    const atk = crearLuchador(
      ficha('Arma', 100, { tablas: ['Tabla de Reducción de Armadura'] }, { arma: { nombre: 'Arma', calidad: 10, reduccionTA: 4 } }),
      'A', 0, 0,
    );
    expect(atk.cap.reduccionTA).toBe(7);
    const def = crearLuchador(ficha('Def', 100, {}, { ta: { FIL: 4 } }), 'B', 0, 0);
    expect(absorcionContra(def, atk)).toBe(20);
  });
});

describe('barrera de daño', () => {
  it('Escudo físico = Presencia base; Rex Frame sin armas 60 o 200 (Dominus p.44); vale la más alta', () => {
    const conTodo = ficha('Desarmado', 100, { habilidadesKi: ['Escudo fisico'], artesMarciales: ['Rex Frame (Base)'] }, { presencia: 70, barreraDanio: 80 });
    expect(capacidades(conTodo).barrera).toBe(80);
    expect(capacidades(ficha('Desarmado', 100, { artesMarciales: ['Rex Frame (Arcano)'] })).barrera).toBe(200);
    expect(capacidades(ficha('Desarmado', 100, { artesMarciales: ['Rex Frame (Base)'] })).barrera).toBe(60);
    // Hanja no da barrera (el toolkit lo confunde con Rex Frame), y Rex Frame sólo vale sin armas.
    expect(capacidades(ficha('Desarmado', 100, { artesMarciales: ['Hanja (Arcano)'] })).barrera).toBe(0);
    expect(capacidades(ficha('Espada', 100, { artesMarciales: ['Rex Frame (Base)'] })).barrera).toBe(0);
    expect(capacidades(ficha('X', 100, {}, { presencia: 70 })).barrera).toBe(0);
  });

  it('un daño base menor no pasa; igual o mayor, sí; dañar energía la ignora', () => {
    const def = crearLuchador(ficha('Def', 100, {}, { barreraDanio: 100 }), 'B', 0, 0);
    const golpe = (danoBase: number, rasgos: Rasgos = {}, arma = 'Espada') =>
      barreraFrena(def, crearLuchador(ficha(arma, 100, rasgos, { danoBase }), 'A', 0, 0));
    expect(golpe(40)).toBe(true);
    expect(golpe(100)).toBe(false);
    expect(golpe(40, { habilidadesKi: ['Extension del aura al arma'] })).toBe(false);
    expect(golpe(40, { habilidadesKi: ['Extrusion de presencia'] })).toBe(true);
    expect(golpe(40, { habilidadesKi: ['Extrusion de presencia'] }, 'Desarmado')).toBe(false);
  });

  it('la planilla marca un arma mágica en su descripción; la calidad sola no', () => {
    const dana = (descripcion: string) =>
      capacidades(ficha('Ojiplato', 100, {}, { arma: { nombre: 'Ojiplato', calidad: 5, descripcion } })).danaEnergia;
    expect(dana('TA defensor: -1')).toBe(false);
    expect(dana('TA defensor: -1, Mágica')).toBe(true);
    expect(dana('Arma sobrenatural')).toBe(true);
  });
});

describe('defensas sin penalizador', () => {
  it('Lama y Lama Tsu sin armas; 2ª Arma: Estilo Defensivo con dos armas', () => {
    const libres = (arma: string, r: Rasgos) => capacidades(ficha(arma, 100, r)).defensasLibres;
    expect(libres('Desarmado', { artesMarciales: ['Lama (Avanzado)'] })).toBe(1);
    expect(libres('Desarmado', { artesMarciales: ['Lama (Supremo)', 'Lama Tsu (Base)'] })).toBe(4);
    expect(libres('Desarmado', { artesMarciales: ['Lama Tsu (Arcano)'] })).toBe(Infinity);
    expect(libres('Espada larga', { artesMarciales: ['Lama (Supremo)'] })).toBe(0);
    expect(libres('Desarmado', { artesMarciales: ['Lama Tsu (Base)'] })).toBe(2);
    // Estilo Defensivo se elige cada asalto: cambia el ataque de la segunda arma por una defensa libre.
    expect(libres('Espada y Daga', { tablas: ['Tabla de 2ª Arma: Estilo Defensivo'] })).toBe(0);
    expect(capacidades(ficha('Espada y Daga', 100, { tablas: ['Tabla de 2ª Arma: Estilo Defensivo'] })).estiloDefensivo).toBe(true);
  });

  it('con una defensa libre, la segunda no penaliza y la tercera aplica −30', () => {
    const def = crearLuchador(ficha('Desarmado', 100, { artesMarciales: ['Lama (Avanzado)'] }), 'B', 0, 0);
    const atk = crearLuchador(ficha('Espada', 100), 'A', 0, 0);
    expect([0, 1, 2].map((previas) => defensaFinal(def, atk, { defensasPrevias: previas }))).toEqual([100, 100, 70]);
  });
});

describe('Buena suerte', () => {
  it('se lee de las ventajas', () => {
    expect(capacidades(ficha('Espada', 150, { ventajas: ['Buena suerte'] })).buenaSuerte).toBe(true);
    expect(capacidades(ficha('Espada', 150, { ventajas: ['Ambidestria'] })).buenaSuerte).toBe(false);
  });
});
