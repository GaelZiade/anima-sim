import { describe, expect, it } from 'vitest';
import {
  absorcion, bonoContraataque, danoFinal, esCritico, haySorpresa, maxAtaques, negativoCansancio, nivelCritico,
  PEN_ATAQUE_ADICIONAL, penDefensaAdicional, porcentajeDano,
} from '../src/motor/reglas';
import { textoTirada, tirarD100 } from '../src/motor/dados';
import { crearLuchador } from '../src/motor/combate';
import { penAccion } from '../src/motor/calculos';
import type { Ficha, Rasgos } from '../src/motor/modelo';

/** Rng que devuelve dados fijos (1-100) en orden. */
function dadosFijos(...valores: number[]) {
  let i = 0;
  return { next: () => (valores[i++] - 1) / 100 + 0.001 };
}

describe('ejemplos del Core Exxet', () => {
  it('Celia vs guardia (p.88-89): 206 − 104 = 102, TA 2 → 60% de 50 = 30', () => {
    const resultado = 120 + 86 - (60 + 44);
    expect(resultado).toBe(102);
    expect(porcentajeDano(resultado, absorcion(2))).toBe(60);
    expect(danoFinal(50, 60)).toBe(30);
  });

  it('daño % en grupos de 10 (p.88): 27 → 20%, 185 → 180%, menos de 10 no daña', () => {
    expect(porcentajeDano(27 + 20, 20)).toBe(20);
    expect(porcentajeDano(185 + 20, 20)).toBe(180);
    expect(porcentajeDano(29, 20)).toBe(0);
  });

  it('Tabla 42 redondea hacia abajo: 30% de 55 = 16', () => {
    expect(danoFinal(55, 30)).toBe(16);
    expect(danoFinal(55, 10)).toBe(5);
  });

  it('bono de contraataque (p.89): −30 → +15, −100 → +50, −76 → +35, −36 → +15, tope 150', () => {
    expect(bonoContraataque(-30)).toBe(15);
    expect(bonoContraataque(-100)).toBe(50);
    expect(bonoContraataque(-76)).toBe(35);
    expect(bonoContraataque(-36)).toBe(15);
    expect(bonoContraataque(-500)).toBe(150);
  });

  it('ataques adicionales (p.90): 220 con arma M declarando 3 → 160; con G → 140', () => {
    expect(maxAtaques(220)).toBe(3);
    expect(maxAtaques(60)).toBe(1);
    expect(220 - 2 * PEN_ATAQUE_ADICIONAL.M).toBe(160);
    expect(220 - 2 * PEN_ATAQUE_ADICIONAL.G).toBe(140);
  });

  it('defensas adicionales (Tabla 44)', () => {
    expect([0, 1, 2, 3, 4, 7].map(penDefensaAdicional)).toEqual([0, 30, 50, 70, 90, 90]);
  });

  it('nivel de crítico (p.97): 260 → 230, 310 → 255; acumulación a la mitad', () => {
    expect(nivelCritico(200, 60, false)).toBe(230);
    expect(nivelCritico(250, 60, false)).toBe(255);
    expect(nivelCritico(100, 40, true)).toBe(70);
  });

  it('crítico con la mitad de los PV actuales o más (p.97): 180 PV, 90 de daño → crítico', () => {
    expect(esCritico(90, 180)).toBe(true);
    expect(esCritico(89, 180)).toBe(false);
    expect(esCritico(45, 90)).toBe(true); // "con su vida reducida a 90, sólo necesita sufrir 45 o más"
  });

  it('sorpresa con 150 o más de diferencia (p.86)', () => {
    expect(haySorpresa(150)).toBe(true);
    expect(haySorpresa(149)).toBe(false);
  });

  it('agotamiento (Tabla 27): Celia con base 5 que baja a 2 → −40', () => {
    expect(negativoCansancio(2, 5)).toBe(40);
    expect(negativoCansancio(5, 5)).toBe(0);
    expect(negativoCansancio(3, 3)).toBe(0); // CON baja: sin penalizador hasta gastar
    expect(negativoCansancio(2, 3)).toBe(40);
  });
});

describe('tirada abierta y pifia', () => {
  it('95 abre, 90 ya no abre la segunda (necesita 91): total 185 (p.10)', () => {
    const t = tirarD100(dadosFijos(95, 90));
    expect(t.valor).toBe(185);
    expect(t.abiertas).toBe(1);
  });

  it('100 siempre abre', () => {
    const t = tirarD100(dadosFijos(90, 91, 92, 100, 5));
    expect(t.valor).toBe(90 + 91 + 92 + 100 + 5);
  });

  it('pifia con 1-3; con maestría el 3 no es pifia', () => {
    expect(tirarD100(dadosFijos(3, 40)).pifia).toBe(true);
    expect(tirarD100(dadosFijos(3, 40), true).pifia).toBe(false);
  });
});

/** Mismos casos que penalty_rules_test.dart de animaMasterToolkit (Cansancio base 8). */
describe('rasgos que cambian los negativos', () => {
  function con(rasgos: Rasgos, cansancio: number, dolor = 0, fisico = 0): number {
    const f: Ficha = {
      id: 'x', nombre: 'x', pv: 100, turno: 50, ataque: 100, defensa: 100, danoBase: 50, tipoAtaque: 'FIL',
      tamanoArma: 'M', ta: {}, rf: 50, constitucion: 8, tipoMovimiento: 6, cansancio: 8, rasgos,
    };
    const l = crearLuchador(f, 'A', 0, 0);
    l.cansancio = cansancio;
    l.penDolor = dolor;
    l.penFisico = fisico;
    return -penAccion(l);
  }

  const eliminacion = { habilidadesKi: ['Eliminacion de penalizadores'] };
  const inmunidad = { ventajas: ['Inmunidad al dolor y al cansancio'] };
  const exhausto = { desventajas: ['Exhausto'] };

  it('sin rasgos: cansancio 2 → −40', () => expect(con({}, 2)).toBe(-40));
  it('Eliminación de penalizadores: cansancio a la mitad, y la parte de dolor de un crítico 80', () => {
    expect(con(eliminacion, 2)).toBe(-20);
    expect(con(eliminacion, 8, 40, 40)).toBe(-60);
  });
  it('Inmunidad al dolor y al cansancio: a la mitad, también el dolor de un crítico (Core: "dolor")', () => {
    expect(con(inmunidad, 2)).toBe(-20);
    expect(con(inmunidad, 8, 40, 40)).toBe(-60);
  });
  it('Exhausto dobla el cansancio', () => expect(con(exhausto, 2)).toBe(-80));
  it('Exhausto con Inmunidad se compensan', () => expect(con({ ...exhausto, ...inmunidad }, 2)).toBe(-40));
  it('dos fuentes de mitad no se aplican dos veces', () => expect(con({ ...inmunidad, ...eliminacion }, 1)).toBe(-40));
  it('Esencia de vacío anula cansancio y dolor de críticos, no el deterioro físico', () =>
    expect(con({ habilidadesKi: ['Esencia de Vacio'] }, 0, 40, 40)).toBe(-40));
});

describe('texto de las tiradas (narración)', () => {
  it('muestra los dados de una abierta y el detalle de una pifia', () => {
    expect(textoTirada(170, tirarD100(dadosFijos(47)))).toBe('170+47');
    expect(textoTirada(170, tirarD100(dadosFijos(95, 12)))).toBe('170+107 (abierta: 95+12)');
    expect(textoTirada(170, tirarD100(dadosFijos(95, 93, 12)))).toBe('170+200 (abierta ×2: 95+93+12)');
    const pifia = tirarD100(dadosFijos(2, 37));
    expect(textoTirada(150, pifia, pifia.natural - pifia.nivelPifia)).toBe('150−35 (pifia: 2, nivel 37)');
    expect(tirarD100(dadosFijos(47)).dados).toBeUndefined();
  });
});
