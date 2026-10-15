// Modificadores comprobados en el flujo real del combate (atacar → resolverDefensa), leyendo los
// números que salen en el registro, no sólo en las funciones de cálculo.

import { describe, expect, it } from 'vitest';
import type { Contexto, Ficha, Luchador } from '../src/motor/modelo';
import { radioDeteccion } from '../src/motor/combate-ki';
import { atacar, crearLuchador, simularCombate } from '../src/motor/combate';
import { absorcionContra, ataqueFinal, defensaFinal, turnoFinal } from '../src/motor/calculos';
import { modEstados } from '../src/motor/maniobras';
import { crearRng } from '../src/motor/rng';
import { imponer } from '../src/motor/condiciones';

function ficha(nombre: string, extra: Partial<Ficha> = {}): Ficha {
  return {
    id: nombre, nombre, pv: 150, turno: 80, ataque: 150, defensa: 150, danoBase: 50, tipoAtaque: 'FIL',
    ta: {}, rf: 50, constitucion: 7, tipoMovimiento: 6, arma: { nombre: 'Espada larga' }, rasgos: {}, ...extra,
  };
}

function duelo(semilla: number, fa: Ficha = ficha('Atacante'), fd: Ficha = ficha('Defensor')) {
  const atk = crearLuchador(fa, 'A', 0, 0);
  const def = crearLuchador(fd, 'B', 1, 0);
  atk.trabados.push(def);
  def.trabados.push(atk);
  for (const l of [atk, def]) {
    l.ataquesDeclarados = 1;
    l.planAtaques = [{ pen: 0, sinArmas: false }];
    l.ataquesRestantes = 1;
  }
  const ctx: Contexto = {
    opciones: {}, rng: crearRng(semilla), luchadores: [atk, def], asalto: 1, registro: [],
    ataquesEnAsalto: 0, ataquesAsaltoAnterior: 0, movimientosEnAsalto: 0, ventaja: { A: 1, B: 1 },
  };
  return { ctx, atk, def };
}

/** Habilidad de defensa (sin el dado) del primer ataque de `quien` en el registro; null si pifió. */
function defensaRegistrada(ctx: Contexto, quien: string): { hab: number; resiste: boolean } | null {
  const linea = ctx.registro!.map((e) => e.texto).find((t) => t.startsWith(`${quien} `) && / contra \d+/.test(t));
  if (!linea) return null;
  return { hab: Number(/ contra (\d+)/.exec(linea)![1]), resiste: linea.includes('(resiste el golpe)') };
}

describe('sorpresa en el flujo del combate (Core p.86)', () => {
  it('el sorprendido se defiende con −90 del primer ataque de quien lo sorprendió', () => {
    for (let s = 1; s <= 30; s++) {
      const { ctx, atk, def } = duelo(s);
      atk.sorprendeA.add(def);
      atacar(ctx, atk, def, { esContra: false, bono: 0 });
      const r = defensaRegistrada(ctx, 'Atacante');
      if (!r) continue; // pifió: no hubo defensa
      const { hab, resiste } = r;
      // 150 − 90, más a lo sumo 2 de cansancio (+30); si resiste, −80 más (mínimo 0).
      expect(hab).toBeLessThanOrEqual(Math.max(0, 150 - 90 + 30 - (resiste ? 80 : 0)));
    }
  });

  it('la sorpresa se gasta con esa primera acción', () => {
    const { ctx, atk, def } = duelo(7);
    atk.sorprendeA.add(def);
    atacar(ctx, atk, def, { esContra: false, bono: 0 });
    expect(atk.sorprendeA.size).toBe(0);
  });

  it('el registro narra la iniciativa antes que la sorpresa que sale de ella', () => {
    const rapido = ficha('Rápido', { turno: 200 });
    const lento = ficha('Lento', { turno: 80 });
    // El lento puede prever la sorpresa: se busca una tanda en la que no lo haga.
    let textos: string[] = [];
    let sorpresa = -1;
    for (let s = 1; s <= 300 && sorpresa < 0; s++) {
      textos = simularCombate([rapido], [lento], { semilla: s, registrar: true, maxAsaltos: 1 }).registro!.map((e) => e.texto);
      sorpresa = textos.findIndex((t) => t.includes('sorprende a'));
    }
    expect(sorpresa).toBeGreaterThan(-1);
    expect(textos.findIndex((t) => t.startsWith('Iniciativa:'))).toBeLessThan(sorpresa);
    expect(textos[sorpresa]).toMatch(/de diferencia/);
  });
});

describe('acciones activas acumulables (Core p.87)', () => {
  it('levantarse y además moverse más de un cuarto restan −25 cada una al ataque', () => {
    const { atk, def } = duelo(1);
    const base = ataqueFinal(atk, def);
    atk.accionesActivas = 1;
    expect(ataqueFinal(atk, def)).toBe(base - 25);
    atk.accionesActivas = 2;
    expect(ataqueFinal(atk, def)).toBe(base - 50);
  });
});

describe('parálisis (Tabla 43)', () => {
  it('no se suman: vale la peor entre la de una presa y la inducida', () => {
    const l: Luchador = crearLuchador(ficha('Preso'), 'A', 0, 0);
    l.paralisis = 1;
    imponer(l, 'paralisis', { nivel: 2, asaltos: 3 });
    expect(modEstados(l).ataque).toBe(-80);
  });
});

describe('seres con acumulación (Core p.99)', () => {
  it('sorprendidos reciben el golpe con la Absorción a la mitad', () => {
    const { atk, def } = duelo(1, ficha('Atacante'), ficha('Golem', { acumulacion: true, ta: { FIL: 4 } }));
    const normal = absorcionContra(def, atk);
    atk.sorprendeA.add(def);
    expect(absorcionContra(def, atk)).toBe(Math.floor(normal / 2));
  });
});

describe('situaciones de la Tabla 43 que faltaban', () => {
  const par = (fa: Partial<Ficha> = {}, fd: Partial<Ficha> = {}, entorno = {}) => {
    const { atk, def } = duelo(1, ficha('Atacante', fa), ficha('Defensor', fd));
    atk.entorno = entorno;
    def.entorno = entorno;
    return { atk, def };
  };
  const base = par();
  const atk0 = ataqueFinal(base.atk, base.def);
  const def0 = defensaFinal(base.def, base.atk);

  it('ceguera parcial −30/−30/−15 y absoluta −100/−80', () => {
    const p = par({ estados: { ceguera: 'parcial' } }, { estados: { ceguera: 'parcial' } });
    expect(ataqueFinal(p.atk, p.def)).toBe(atk0 - 30);
    expect(defensaFinal(p.def, p.atk)).toBe(def0 - 30);
    const e = par({}, { estados: { ceguera: 'parcial' }, tipoDefensa: 'esquiva' });
    expect(defensaFinal(e.def, e.atk)).toBe(def0 - 15);
    const a = par({ estados: { ceguera: 'absoluta' } }, { estados: { ceguera: 'absoluta' } });
    expect(ataqueFinal(a.atk, a.def)).toBe(atk0 - 100);
    expect(defensaFinal(a.def, a.atk)).toBe(def0 - 80);
  });

  it('espalda + ceguera absoluta queda en −120 a la defensa, no −160 (Dominus p.11)', () => {
    const { atk, def } = par({}, { estados: { ceguera: 'absoluta' } });
    def.trabados = [atk, ...[1, 2, 3, 4, 5].map((i) => crearLuchador(ficha(`E${i}`), 'A', 1, 0))];
    // atk es el primero (frente): se lo mueve a la sexta posición, la espalda.
    def.trabados.push(def.trabados.shift()!);
    expect(defensaFinal(def, atk)).toBe(def0 - 120);
  });

  it('la oscuridad: penumbra parcial; total absoluta; Visión nocturna la ignora o la reduce', () => {
    expect(ataqueFinal(par({}, {}, { oscuridad: 'penumbra' }).atk, base.def)).toBe(atk0 - 30);
    const t = par({}, {}, { oscuridad: 'total' });
    expect(ataqueFinal(t.atk, t.def)).toBe(atk0 - 100);
    const vn = par({ rasgos: { ventajas: ['Visión nocturna'] } }, {}, { oscuridad: 'total' });
    expect(ataqueFinal(vn.atk, vn.def)).toBe(atk0 - 50);
    const vp = par({ rasgos: { ventajas: ['Visión nocturna'] } }, {}, { oscuridad: 'penumbra' });
    expect(ataqueFinal(vp.atk, vp.def)).toBe(atk0);
  });

  it('Detección del Ki: ceguera parcial en vez de absoluta si este asalto lo localiza (Dominus p.11, Core p.104)', () => {
    const { atk, def } = par({ estados: { ceguera: 'absoluta' }, rasgos: { habilidadesKi: ['Detección del Ki'] } });
    const ciego = ataqueFinal(atk, def);
    atk.radioDeteccionKi = 5;
    expect(ataqueFinal(atk, def)).toBe(atk0 - 30);
    atk.radioDeteccionKi = 0;
    expect(ataqueFinal(atk, def)).toBe(ciego);
    expect(ciego).toBeLessThan(atk0 - 30);
  });

  it('Detección del Ki: radio según la dificultad lograda (Recuadro VIII, Core p.104)', () => {
    expect(radioDeteccion(79, 10)).toBe(1.5);
    expect(radioDeteccion(80, 10)).toBe(5);
    expect(radioDeteccion(150, 10)).toBe(20);
    expect(radioDeteccion(330, 10)).toBe(250);
    expect(radioDeteccion(330, 13)).toBe(1000);
    expect(radioDeteccion(10, 10)).toBe(0);
  });

  it('levitando −20/−20/−40; vuelo 7 +10 y 15 +15 al ataque y +10 al turno', () => {
    const l = par({ estados: { levitando: true } }, { estados: { levitando: true } });
    expect(ataqueFinal(l.atk, l.def)).toBe(atk0 - 20);
    expect(defensaFinal(l.def, l.atk)).toBe(def0 - 20);
    const v = par({ tipoVuelo: 15 });
    expect(ataqueFinal(v.atk, v.def)).toBe(atk0 + 15);
    expect(turnoFinal(v.atk)).toBe(turnoFinal(base.atk) + 10);
    // Sin espacio para maniobrar, el vuelo no da bono.
    const r = par({ tipoVuelo: 15 }, {}, { espacioReducido: true });
    expect(ataqueFinal(r.atk, r.def)).toBe(ataqueFinal(par({}, {}, { espacioReducido: true }).atk, base.def));
  });

  it('carga: +10 al ataque, −10 a la parada y sin −25 por correr', () => {
    const { atk, def } = par();
    atk.cargando = true;
    expect(ataqueFinal(atk, def, { conMovimientoActivo: true })).toBe(atk0 + 10);
    def.cargando = true;
    expect(defensaFinal(def, atk)).toBe(def0 - 10);
  });

  it('enemigo pequeño −10 y diminuto −20 al ataque (−10 a pararlo); no en área', () => {
    const p = par({ tamano: 20 }, { tamano: 10 });
    expect(ataqueFinal(p.atk, p.def)).toBe(atk0 - 10);
    expect(ataqueFinal(p.atk, p.def, { maniobra: 'area' })).toBe(ataqueFinal(base.atk, base.def, { maniobra: 'area' }));
    const d = par({ tamano: 2 }, { tamano: 20 });
    expect(ataqueFinal(d.def, d.atk)).toBe(atk0 - 20);
    expect(defensaFinal(d.def, d.atk)).toBe(def0 - 10);
  });

  it('miedo −60 y dolor −40 a toda acción (Core p.232-233)', () => {
    const m = par({ estados: { miedo: true } });
    expect(ataqueFinal(m.atk, m.def)).toBe(atk0 - 60);
    const d = par({ estados: { dolor: 'normal' } });
    expect(ataqueFinal(d.atk, d.def)).toBe(atk0 - 40);
  });
});

describe('la narración aclara las acciones perdidas (Core p.89, p.98)', () => {
  it('Kaito vs Teseo, semilla 74523: defensiva, pifia y contra que no se puede tomar', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { hojaAFicha } = await import('../src/hoja/ficha');
    const hoja = (p: string) => hojaAFicha(readFileSync(`fichas/${readdirSync('fichas').find((f) => f.startsWith(p))!}`));
    const r = simularCombate([hoja('Kaito')], [hoja('Teseo')], { semilla: 74523, registrar: true, distanciaInicial: 10 });
    const asalto1 = r.registro!.filter((e) => e.asalto === 1).map((e) => e.texto.trim());
    expect(asalto1).toContain('Teseo Heracles queda a la defensiva.');
    expect(asalto1).toContain('Kaito Oma pierde el resto de sus acciones activas del asalto por la pifia.');
    expect(asalto1).toContain('Teseo Heracles no puede aprovechar la contra (+80): está a la defensiva.');
    expect(asalto1).toContain('Teseo Heracles está a la defensiva: no puede actuar este asalto.');
  });
});

describe('tipo de movimiento (Tabla 25)', () => {
  it('sin Inhumanidad no pasa de 10; con Inhumanidad hasta 13 (Core p.62)', async () => {
    const { metrosTotales } = await import('../src/motor/calculos');
    const comun = crearLuchador(ficha('Rápido', { tipoMovimiento: 12 }), 'A', 0, 0);
    expect(metrosTotales(comun)).toBe(35);
    const inhumano = crearLuchador(ficha('Inhumano', { tipoMovimiento: 12, rasgos: { habilidadesKi: ['Inhumanidad'] } }), 'A', 0, 0);
    expect(metrosTotales(inhumano)).toBe(50);
  });

  it('cada −20 a toda acción le resta 1 al tipo de movimiento (Core p.232)', async () => {
    const { metrosTotales } = await import('../src/motor/calculos');
    const l = crearLuchador(ficha('Herido', { tipoMovimiento: 8 }), 'A', 0, 0);
    expect(metrosTotales(l)).toBe(28);
    l.penDolor = 45;
    expect(metrosTotales(l)).toBe(22);
  });
});
