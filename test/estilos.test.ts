// Maniobras (Core p.91-92), controles de características (Core p.9) y ventajas de Artes Marciales,
// Tablas, Ars Magnus y Legados (Dominus Exxet), con los números de los manuales.

import { aplicaXingQuan } from '../src/motor/calculos';
import { describe, expect, it } from 'vitest';
import type { Ficha, Rasgos } from '../src/motor/modelo';
import { crearLuchador } from '../src/motor/combate';
import { ataqueFinal, defensaFinal, penAccion, turnoFinal } from '../src/motor/calculos';
import { controlEnfrentado, gradoPresa, modEstados, penManiobra, pGanaControl } from '../src/motor/maniobras';
import { estilos } from '../src/motor/estilos';

function ficha(arma: string, rasgos: Rasgos = {}, extra: Partial<Ficha> = {}): Ficha {
  return {
    id: arma, nombre: arma, pv: 150, turno: 80, ataque: 150, defensa: 150, danoBase: 50, tipoAtaque: 'CON',
    ta: {}, rf: 50, constitucion: 7, tipoMovimiento: 6, arma: { nombre: arma }, rasgos, ...extra,
  };
}
const luchador = (f: Ficha, equipo: 'A' | 'B' = 'A') => crearLuchador(f, equipo, 0, 0);
const arte = (...artesMarciales: string[]) => ({ artesMarciales });

/** Rng con d10 fijos. */
function d10s(...valores: number[]) {
  let i = 0;
  return { next: () => (valores[i++] - 1) / 10 + 0.001 };
}

describe('controles de características (Core p.9)', () => {
  it('Celia 9 + 8 = 17 contra Lemures 10 + 5 = 15: gana por 2', () => {
    expect(controlEnfrentado(d10s(8, 5), 9, 10)).toBe(2);
  });

  it('regla del 10: un 10 suma 12 (Destreza 9 → 21)', () => {
    expect(controlEnfrentado(d10s(10, 1), 9, 9)).toBe(9 + 12 - (9 + 1));
  });

  it('diferencia mayor de 4: Fuerza 5 contra 11, Serenade cuenta como 13', () => {
    // Mismo dado para los dos: la diferencia es 13 − 5.
    expect(controlEnfrentado(d10s(5, 5), 5, 11)).toBe(5 - 13);
  });

  it('probabilidad de ganar un control simétrico < 50% (los empates no ganan)', () => {
    expect(pGanaControl(8, 8)).toBeLessThan(0.5);
    expect(pGanaControl(10, 6)).toBeCloseTo(0.77, 2);
  });
});

describe('maniobras (Core p.91-92)', () => {
  const pen = (f: Ficha, m: Parameters<typeof penManiobra>[1], contra = false) => penManiobra(luchador(f), m, contra);

  it('penalizadores base: derribo −30 (−60 con arma corta), presa −40 sin armas, desarmar −40, área −50', () => {
    expect(pen(ficha('Desarmado'), 'derribo')).toBe(30);
    expect(pen(ficha('Espada larga'), 'derribo')).toBe(30);
    expect(pen(ficha('Daga', {}, { tamanoArma: 'P' }), 'derribo')).toBe(60);
    expect(pen(ficha('Desarmado'), 'presa')).toBe(40);
    expect(pen(ficha('Espada larga'), 'presa')).toBe(Infinity); // sólo sin armas o con armas que lo permitan
    expect(pen(ficha('Espada larga'), 'desarmar')).toBe(40);
    expect(pen(ficha('Espada larga'), 'area')).toBe(50);
  });

  it('ataques apuntados: cabeza −60; Precisa a la mitad; Sambo supremo sin armas a la cuarta parte', () => {
    expect(pen(ficha('Espada larga'), 'cabeza')).toBe(60);
    expect(pen(ficha('Estoque', {}, { arma: { nombre: 'Estoque', precisa: true } }), 'cabeza')).toBe(30);
    expect(pen(ficha('Desarmado'), 'cabeza')).toBe(30); // el combate desarmado es Preciso
    expect(pen(ficha('Desarmado', arte('Sambo (Supremo)')), 'cabeza')).toBe(15);
  });

  it('Grappling: Presa −20 y Derribo −15; avanzado sin penalizador (Dominus p.37)', () => {
    expect(pen(ficha('Desarmado', arte('Grappling (Base)')), 'presa')).toBe(20);
    expect(pen(ficha('Desarmado', arte('Grappling (Base)')), 'derribo')).toBe(15);
    expect(pen(ficha('Desarmado', arte('Grappling (Avanzado)')), 'presa')).toBe(0);
  });

  it('Pankration: Presa −20 (p.33); Sambo: Derribo y Desarmar a la mitad, avanzado Presa y Área (p.35)', () => {
    expect(pen(ficha('Desarmado', arte('Pankration (Base)')), 'presa')).toBe(20);
    expect(pen(ficha('Desarmado', arte('Sambo (Base)')), 'derribo')).toBe(15);
    expect(pen(ficha('Desarmado', arte('Sambo (Base)')), 'desarmar')).toBe(20);
    expect(pen(ficha('Desarmado', arte('Sambo (Avanzado)')), 'presa')).toBe(20);
    expect(pen(ficha('Desarmado', arte('Sambo (Avanzado)')), 'area')).toBe(25);
  });

  it('Tablas: de Área −25 y de Desarme −20 (Core p.65); Presa Inusual −60 con armas (Dominus p.28)', () => {
    expect(pen(ficha('Mandoble', { tablas: ['Tabla de Area'] }), 'area')).toBe(25);
    expect(pen(ficha('Espada', { tablas: ['Tabla de Desarme'] }), 'desarmar')).toBe(20);
    expect(pen(ficha('Espada', { tablas: ['Tabla de Presa Inusual'] }), 'presa')).toBe(60);
  });

  it('Capoeira: área con tres blancos, cinco en avanzado; supremo −10 (Dominus p.34-35)', () => {
    expect(estilos(ficha('Desarmado', arte('Capoeira (Base)')), true).blancosArea).toBe(3);
    expect(estilos(ficha('Desarmado', arte('Capoeira (Avanzado)')), true).blancosArea).toBe(5);
    expect(pen(ficha('Desarmado', arte('Capoeira (Supremo)')), 'area')).toBe(10);
  });

  it('Aikido avanzado: Presa y Derribo sin penalizador en el contraataque (p.32); Emp: Desarmar sin penalizador (p.39)', () => {
    const aikido = ficha('Desarmado', arte('Aikido (Avanzado)'));
    expect(pen(aikido, 'presa', true)).toBe(0);
    expect(pen(aikido, 'presa', false)).toBe(40);
    expect(pen(ficha('Desarmado', arte('Emp (Base)')), 'desarmar')).toBe(0);
  });

  it('Presa: diferencia < 3 parálisis menor, ≥ 3 parcial, > 10 completa', () => {
    expect([1, 2, 3, 10, 11].map(gradoPresa)).toEqual([1, 1, 2, 2, 3]);
  });

  it('estados (Tabla 43): derribado −30 / −10 al turno; parálisis parcial −80', () => {
    const l = luchador(ficha('Espada'));
    l.derribado = true;
    expect(modEstados(l)).toEqual({ ataque: -30, parada: -30, esquiva: -30, turno: -10 });
    l.derribado = false;
    l.paralisisPresa = 2;
    expect(modEstados(l).ataque).toBe(-80);
  });

  it('atacar a un derribado suma la posición superior: +20 (Tabla 43; Dominus p.38)', () => {
    const atk = luchador(ficha('Espada'));
    const def = luchador(ficha('Rival'), 'B');
    const antes = ataqueFinal(atk, def);
    def.derribado = true;
    expect(ataqueFinal(atk, def) - antes).toBe(20);
  });

  it('quien apresa queda en parálisis menor, salvo Pankration avanzado (Dominus p.33)', () => {
    const otro = luchador(ficha('Rival'), 'B');
    const comun = luchador(ficha('Desarmado'));
    comun.apresando = otro;
    expect(modEstados(comun).ataque).toBe(-20);
    const pank = luchador(ficha('Desarmado', arte('Pankration (Avanzado)')));
    pank.apresando = otro;
    expect(modEstados(pank).ataque).toBe(0);
  });

  it('Hanja arcano: sin penalizador a la defensa por parálisis menor o parcial (p.44); Soo Bahk supremo sin penalizador derribado (p.38)', () => {
    const h = luchador(ficha('Desarmado', arte('Hanja (Arcano)')));
    h.paralisisPresa = 2;
    expect(modEstados(h)).toEqual({ ataque: -80, parada: 0, esquiva: 0, turno: -30 });
    const s = luchador(ficha('Desarmado', arte('Soo Bahk (Supremo)')));
    s.derribado = true;
    expect(modEstados(s).ataque).toBe(0);
  });
});

describe('ventajas de Artes Marciales (Dominus cap.4)', () => {
  it('sólo valen sin armas: Shephon con espada no cambia la Defensa total (p.45)', () => {
    expect(estilos(ficha('Desarmado', arte('Shephon (Base)')), true).bonoDefensaTotal).toBe(60);
    expect(estilos(ficha('Espada', arte('Shephon (Base)')), false).bonoDefensaTotal).toBe(30);
  });

  it('Shephon: Defensa total +60, arcano +100 (p.43)', () => {
    const atk = luchador(ficha('Espada'), 'B');
    const def = luchador(ficha('Desarmado', arte('Shephon (Arcano)')));
    expect(defensaFinal(def, atk, { defensaTotal: true }) - defensaFinal(def, atk, { defensaTotal: false })).toBe(100);
  });

  it('Soo Bahk: flanco a la mitad (base) o sin penalizador (avanzado); Hanja sin penalizador de espalda (p.38, p.44)', () => {
    const conFlanco = (rasgos: Rasgos, posicion: number) => {
      const def = luchador(ficha('Desarmado', rasgos));
      const atk = luchador(ficha('Espada'), 'B');
      def.trabados = [...Array.from({ length: posicion }, (_, i) => luchador(ficha(`E${i}`), 'B')), atk];
      return defensaFinal(def, atk) - 150 + 0; // + 0 convierte −0 en 0
    };
    expect(conFlanco({}, 3)).toBe(-30);
    expect(conFlanco(arte('Soo Bahk (Base)'), 3)).toBe(-15);
    expect(conFlanco(arte('Soo Bahk (Avanzado)'), 3)).toBe(0);
    expect(conFlanco({}, 5)).toBe(-80);
    expect(conFlanco(arte('Hanja (Base)'), 5)).toBe(0);
  });

  it('Seraphite: +20 / −30, arcano +30 / −50 (p.40); Berserker +10 / −20 y sin dolor ni cansancio (p.84)', () => {
    const def = luchador(ficha('Rival'), 'B');
    const s = luchador(ficha('Desarmado', arte('Seraphite (Arcano)')));
    s.modo = { seraphite: 1, berserker: false, ataqueFinal: false };
    expect([ataqueFinal(s, def) - 150, defensaFinal(s, def) - 150]).toEqual([20, -30]);
    s.modo = { seraphite: 3, berserker: false, ataqueFinal: false };
    expect([ataqueFinal(s, def) - 150, defensaFinal(s, def) - 150]).toEqual([30, -50]);
    const b = luchador(ficha('Hacha', { arsMagnus: ['Berserker'] }));
    b.cansancio = 2;
    b.penDolor = 40;
    expect(penAccion(b)).toBe(80);
    b.modo = { seraphite: 0, berserker: true, ataqueFinal: false };
    expect(penAccion(b)).toBe(0);
    expect([ataqueFinal(b, def) - 150, defensaFinal(b, def) - 150]).toEqual([10, -20]);
  });

  it('Kung Fu: +10 (supremo +20, Asakusen arcano +40) a una sola cosa por asalto (p.33, p.41)', () => {
    const def = luchador(ficha('Rival'), 'B');
    const k = luchador(ficha('Desarmado', arte('Kung Fu (Supremo)')));
    k.bonoVariableEn = 'turno';
    expect([turnoFinal(k), ataqueFinal(k, def)]).toEqual([100, 150]);
    k.bonoVariableEn = 'ataque';
    expect(ataqueFinal(k, def)).toBe(170);
    expect(estilos(ficha('Desarmado', arte('Kung Fu (Supremo)', 'Asakusen (Arcano)')), true).bonoVariable).toBe(40);
  });

  it('Boxeo avanzado: +10 al contraatacar (p.34); Selene dobla el bono de contra y en arcano no gasta ataques (p.39)', () => {
    const def = luchador(ficha('Rival'), 'B');
    const box = luchador(ficha('Desarmado', arte('Boxeo (Avanzado)')));
    expect(ataqueFinal(box, def, { esContra: true }) - ataqueFinal(box, def)).toBe(10);
    expect(estilos(ficha('Desarmado', arte('Selene (Base)')), true).doblaBonoContra).toBe(true);
    expect(estilos(ficha('Desarmado', arte('Selene (Arcano)')), true).contrasIlimitadas).toBe(true);
  });

  it('la patada del Tae Kwon Do va después de los demás ataques, aunque penalice menos (p.36)', async () => {
    const { capacidades, planDeAtaques } = await import('../src/motor/rasgos');
    // Supremo: la patada sin penalizador (0) y la segunda arma con Ambidestría (−10).
    const cap = capacidades(ficha('Espada y daga', { ...arte('Tae Kwon Do (Supremo)'), ventajas: ['Ambidestría'] }));
    expect(planDeAtaques(cap, 1).map((r) => [r.pen, r.sinArmas])).toEqual([[0, false], [10, false], [0, true]]);
  });

  it('Sangre de Aeon: la TA de su elemento, +20 a resistir el fuego y +10 al daño de sus técnicas en él (Dominus p.63, p.76)', async () => {
    const { danoBase, resistenciaCalor } = await import('../src/motor/calculos');
    const { SIN_KI } = await import('../src/motor/ki');
    expect(estilos(ficha('Espada', { ventajas: ['Sangre de Boreas'] }), false).elementoAfin).toBe('ELE');
    expect(estilos(ficha('Espada', { ventajas: ['Sangre de Ran'] }), false).elementoAfin).toBe('FRI');
    expect(estilos(ficha('Espada', { ventajas: ['Sangre de Shephirah'] }), false).elementoAfin).toBe(null);
    const k = luchador(ficha('Espada', { ventajas: ['Sangre de Kagutsuchi'] }));
    const otro = luchador(ficha('Espada'));
    const rival = luchador(ficha('Rival'), 'B');
    expect(resistenciaCalor(k) - resistenciaCalor(otro)).toBe(20);
    const fuego = { ...SIN_KI, elemento: 'CAL' as const };
    expect(danoBase(k, rival, false, undefined, fuego) - danoBase(otro, rival, false, undefined, fuego)).toBe(10);
  });

  it('los Legados se leen por su nombre completo: el Límite de la Muerte no es los Ojos de la Muerte', () => {
    const ojos = estilos(ficha('Espada', { ventajas: ['Los Ojos de la Muerte'] }), false);
    const mors = estilos(ficha('Espada', { ventajas: ['Límite de la Muerte'] }), false);
    expect([ojos.roturaExtra, ojos.criticoAutomatico]).toEqual([5, true]);
    expect([mors.roturaExtra, mors.criticoAutomatico]).toEqual([0, false]);
  });

  it('Xing Quan: +10/+20/+30 en su turno contra un único rival; no en contras ni después de defenderse (p.38)', () => {
    const def = luchador(ficha('Rival'), 'B');
    const otro = luchador(ficha('Otro'), 'B');
    const x = luchador(ficha('Desarmado', arte('Xing Quan (Supremo)')));
    expect(ataqueFinal(x, def) - 150).toBe(30);
    expect(ataqueFinal(x, def, { esContra: true }) - 150).toBe(0);
    x.objetivoUnico = otro;
    expect(ataqueFinal(x, def) - 150).toBe(0);
    x.objetivoUnico = null;
    x.defensasHechas = 1;
    expect(ataqueFinal(x, def) - 150).toBe(0);
    // Sólo queda atado a un rival si aplicó el bono (no tras defenderse ni con un Derribo).
    expect(aplicaXingQuan(x, def, {})).toBe(false);
    x.defensasHechas = 0;
    expect(aplicaXingQuan(x, def, { maniobra: 'derribo' })).toBe(false);
    expect(aplicaXingQuan(x, def, {})).toBe(true);
    // Sin la Iniciativa sobre ese rival, no (Dominus p.38).
    def.puestoIniciativa = 0;
    x.puestoIniciativa = 1;
    expect(aplicaXingQuan(x, def, {})).toBe(false);
  });

  it('críticos: Tabla de Crítico Incrementado +10, Moai Thai supremo +20, Hakyoukuken +20 / arcano +40', () => {
    expect(estilos(ficha('Espada', { tablas: ['Tabla de Critico Incrementado'] }), false).bonoCriticoEstilos).toBe(10);
    expect(estilos(ficha('Desarmado', arte('Moai Thai (Supremo)')), true).bonoCriticoEstilos).toBe(20);
    expect(estilos(ficha('Desarmado', arte('Hakyoukuken (Arcano)')), true).bonoCriticoOrganico).toBe(40);
  });

  it('Hakyoukuken y Mushin sólo contra seres orgánicos; Aikido sólo contra humanoides y con su propio daño (Dominus p.31-32, p.42)', async () => {
    const { bonoCriticoDe, danoBase } = await import('../src/motor/calculos');
    const hak = luchador(ficha('Desarmado', arte('Hakyoukuken (Arcano)')));
    const vivo = luchador(ficha('Rival'), 'B');
    const golem = luchador({ ...ficha('Golem'), organico: false }, 'B');
    expect(bonoCriticoDe(hak, vivo, 'normal') - bonoCriticoDe(hak, golem, 'normal')).toBe(40);
    // Aikido como única arte: ×2 la Fuerza del rival (mín. +5); contra un no humanoide, nada.
    const fuerte = luchador({ ...ficha('Fuerte'), atributos: { FUE: 9 } }, 'B');
    const bestia = luchador({ ...ficha('Bestia'), atributos: { FUE: 9 }, humanoide: false }, 'B');
    const aiki = luchador(ficha('Desarmado', arte('Aikido (Base)')));
    expect(danoBase(aiki, fuerte, true) - danoBase(aiki, fuerte, false)).toBe(20);
    expect(danoBase(aiki, bestia, true) - danoBase(aiki, bestia, false)).toBe(0);
    // Con el daño de otro arte: en base nada; en supremo, la Fuerza una vez.
    const mixto = luchador(ficha('Desarmado', arte('Aikido (Avanzado)', 'Shotokan (Base)')));
    expect(danoBase(mixto, fuerte, true) - danoBase(mixto, fuerte, false)).toBe(0);
    const supremo = luchador(ficha('Desarmado', arte('Aikido (Supremo)', 'Shotokan (Base)')));
    expect(danoBase(supremo, fuerte, true) - danoBase(supremo, fuerte, false)).toBe(10);
    const elegido = luchador({ ...ficha('Desarmado', arte('Aikido (Avanzado)', 'Shotokan (Base)')), danoSinArmasDe: 'Aikido' });
    expect(danoBase(elegido, fuerte, true) - danoBase(elegido, fuerte, false)).toBe(20);
  });

  it('Godhand: +30 / +50 (arcano +60 / +100) al ataque potenciado (p.43)', () => {
    expect(estilos(ficha('Desarmado', arte('Godhand (Base)')), true).godhand).toEqual({ ataque: 30, dano: 50 });
    expect(estilos(ficha('Desarmado', arte('Godhand (Arcano)')), true).godhand).toEqual({ ataque: 60, dano: 100 });
  });

  it('Velez arcano: la parada no detiene sus ataques sin poder parar energía, y sin detectarlos hay ceguera (p.40)', () => {
    const velez = luchador(ficha('Desarmado', arte('Velez (Arcano)')), 'B');
    const parador = luchador(ficha('Espada', {}, { tipoDefensa: 'parada' }));
    const esquivador = luchador(ficha('Espada', {}, { tipoDefensa: 'esquiva' }));
    const conKi = luchador(ficha('Espada', { habilidadesKi: ['Extension del aura al arma', 'Deteccion del Ki'] }, { tipoDefensa: 'parada' }));
    expect(defensaFinal(parador, velez)).toBe(0);
    expect(defensaFinal(esquivador, velez)).toBe(150 - 80);
    expect(defensaFinal(conKi, velez)).toBe(150);
  });
});

describe('Prever Sorpresa (Dominus p.14)', () => {
  it('−40 a la primera acción enfrentada contra el adversario elegido, atacando o defendiendo', () => {
    const yo = luchador(ficha('Espada'));
    const rival = luchador(ficha('Rival'), 'B');
    const [atk, def] = [ataqueFinal(yo, rival), defensaFinal(yo, rival)];
    yo.previenePendiente.add(rival);
    expect([ataqueFinal(yo, rival) - atk, defensaFinal(yo, rival) - def]).toEqual([-40, -40]);
  });

  it('la IA lo declara si la sorpresa es probable, no contra un rival apenas más rápido', async () => {
    const { declarar } = await import('../src/motor/ia');
    const ctxPara = (rapido: Ficha) => {
      const lento = luchador(ficha('Lento', {}, { turno: 40 }));
      const r = luchador(rapido, 'B');
      lento.trabados = [r];
      r.trabados = [lento];
      const ctx = {
        opciones: {}, rng: { next: () => 0.5 }, luchadores: [lento, r], asalto: 1, registro: null,
        ataquesEnAsalto: 0, ataquesAsaltoAnterior: 0, movimientosEnAsalto: 0, ventaja: { A: 1, B: 1 },
      };
      return declarar(ctx, lento).preverSorpresa.length;
    };
    expect(ctxPara(ficha('Algo más rápido', {}, { turno: 80 }))).toBe(0);
    expect(ctxPara(ficha('Muy rápido', {}, { turno: 220 }))).toBe(1);
    expect(ctxPara(ficha('Uroboros', { ventajas: ['Sangre de Uroboros'] }, { turno: 140 }))).toBe(1);
  });
});

describe('Ars Magnus y Legados', () => {
  it('Ataque Final: +20 y el cansancio da +20 por punto en vez de +15 (Dominus p.86)', () => {
    const def = luchador(ficha('Rival'), 'B');
    const l = luchador(ficha('Espada', { arsMagnus: ['Ataque Final'] }));
    l.modo = { seraphite: 0, berserker: false, ataqueFinal: true };
    expect(ataqueFinal(l, def, { cansancio: 2 }) - 150).toBe(60);
  });

  it('Maniobra Especial: +20 si el rival no la supera por 60 de habilidad base (p.86)', () => {
    const atk = luchador(ficha('Espada', { arsMagnus: ['Maniobra Especial'] }));
    const comun = luchador(ficha('Rival'), 'B');
    const experto = luchador(ficha('Experto', {}, { defensa: 210 }), 'B');
    expect(ataqueFinal(atk, comun, { especial: true }) - ataqueFinal(atk, comun)).toBe(20);
    expect(ataqueFinal(atk, experto, { especial: true }) - ataqueFinal(atk, experto)).toBe(0);
  });

  it('Uroboros: sorpresa con 100 (p.79); Ojos de la Muerte: crítico automático (p.78); Toa: +10 RF a críticos', () => {
    expect(estilos(ficha('X', { ventajas: ['Sangre de Uroboros'] }), false).diferenciaSorpresa).toBe(100);
    expect(estilos(ficha('X', {}), false).diferenciaSorpresa).toBe(150);
    expect(estilos(ficha('X', { ventajas: ['Ojos de la Muerte'] }), false).criticoAutomatico).toBe(true);
    expect(estilos(ficha('X', { ventajas: ['Sangre de Toa'] }), false).bonoRfCritico).toBe(10);
    expect(estilos(ficha('X', { ventajas: ['Tocado por el Destino'] }), false).bonoRfCritico).toBe(0);
  });

  it('Sangre de Orochi: +20 al combate y al turno, recién desde el asalto siguiente (p.81)', () => {
    const def = luchador(ficha('Rival'), 'B');
    const o = luchador(ficha('Espada', { ventajas: ['Sangre de Orochi'] }));
    o.orochi = 1;
    expect(ataqueFinal(o, def) - 150).toBe(0);
    o.orochiAsaltos = 1;
    expect([ataqueFinal(o, def) - 150, defensaFinal(o, def) - 150, turnoFinal(o) - 80]).toEqual([20, 20, 20]);
  });
});

describe('Resistir el golpe (Core p.93): todo o nada hasta actuar', () => {
  async function decidir(atacante: Ficha, ataques: number) {
    const { resistir } = await import('../src/motor/ia');
    // Lento y acorazado: el caso para el que el Core recomienda resistir.
    const tanque = luchador(ficha('Tanque', {}, { turno: 30, ataque: 200, ta: { FIL: 6 }, danoBase: 120 }));
    const rival = luchador(atacante, 'B');
    tanque.trabados = [rival];
    rival.trabados = [tanque];
    tanque.ataquesDeclarados = 1;
    tanque.planAtaques = [{ pen: 0, sinArmas: false }];
    tanque.ataquesRestantes = 1;
    tanque.iniciativa = 50;
    rival.iniciativa = 150;
    rival.ataquesDeclarados = ataques;
    rival.ataquesRestantes = ataques - 1; // el que lo ataca ahora ya gastó uno
    const ctx = {
      opciones: {}, rng: { next: () => 0.5 }, luchadores: [tanque, rival], asalto: 1, registro: null,
      ataquesEnAsalto: 0, ataquesAsaltoAnterior: 0, movimientosEnAsalto: 0, ventaja: { A: 1, B: 1 },
    };
    const primera = resistir(ctx, tanque, rival);
    return { primera, plan: tanque.planResistir, tanque, ctx, rival, resistir };
  }

  it('un solo golpe que casi no atraviesa la armadura: resiste', async () => {
    const r = await decidir(ficha('Espadachín', {}, { tipoAtaque: 'FIL', danoBase: 60 }), 1);
    expect(r.primera).toBe(true);
  });

  it('una ráfaga de ataques precisos (3 con 190): no resiste ninguno', async () => {
    const r = await decidir(ficha('Rápido', {}, { ataque: 250, tipoAtaque: 'FIL', danoBase: 60 }), 3);
    expect(r.primera).toBe(false);
  });

  it('lo decidido se mantiene el resto del asalto hasta que actúe', async () => {
    const r = await decidir(ficha('Espadachín', {}, { tipoAtaque: 'FIL', danoBase: 60 }), 1);
    r.rival.ataquesRestantes = 10; // aunque ahora parezca peor, ya pagó: sigue resistiendo
    expect(r.resistir(r.ctx, r.tanque, r.rival)).toBe(true);
    r.tanque.haActuado = true; // ya actuó: no hay acción que proteger
    expect(r.resistir(r.ctx, r.tanque, r.rival)).toBe(false);
  });
});

describe('opciones de estilo que la IA considera', () => {
  it('Dumah ataca en FIL o PEN sin el penalizador del crítico secundario (Dominus p.38)', () => {
    const d = luchador(ficha('Desarmado', arte('Dumah (Base)')));
    const def = luchador(ficha('Def'), 'B');
    expect(estilos(d.ficha, true).tablasLibres).toEqual(['FIL', 'PEN']);
    expect(ataqueFinal(d, def, { tipo: 'FIL' })).toBe(ataqueFinal(d, def));
    const sinEstilo = luchador(ficha('Desarmado'));
    expect(ataqueFinal(sinEstilo, def, { tipo: 'FIL' })).toBeLessThan(ataqueFinal(sinEstilo, def));
  });
});

