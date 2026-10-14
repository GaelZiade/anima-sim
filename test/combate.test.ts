import { describe, expect, it } from 'vitest';
import type { Ficha } from '../src/motor/modelo';
import { simularCombate } from '../src/motor/combate';
import { combinar, monteCarlo } from '../src/motor/montecarlo';

function ficha(nombre: string, cambios: Partial<Ficha> = {}): Ficha {
  return {
    id: nombre, nombre, pv: 120, turno: 60, ataque: 120, defensa: 120, danoBase: 50,
    tipoAtaque: 'FIL', tamanoArma: 'M', ta: { FIL: 2 }, rf: 50, constitucion: 7, tipoMovimiento: 7,
    ...cambios,
  };
}

describe('combate', () => {
  it('termina y es reproducible con la misma semilla', () => {
    const a = simularCombate([ficha('A')], [ficha('B')], { semilla: 42 });
    const b = simularCombate([ficha('A')], [ficha('B')], { semilla: 42 });
    expect(a.ganador).toBe(b.ganador);
    expect(a.asaltos).toBe(b.asaltos);
    expect(a.luchadores.map((l) => l.pv)).toEqual(b.luchadores.map((l) => l.pv));
  });

  it('espejo: cerca de 50%', () => {
    const r = monteCarlo([ficha('A')], [ficha('B')], 6000, { semilla: 3 });
    expect(r.victoriasA / r.combates).toBeGreaterThan(0.44);
    expect(r.victoriasA / r.combates).toBeLessThan(0.56);
  });

  it('más habilidad gana casi siempre', () => {
    const r = monteCarlo([ficha('Maestro', { ataque: 200, defensa: 200 })], [ficha('Novato', { ataque: 80, defensa: 80 })], 2000);
    expect(r.victoriasA / r.combates).toBeGreaterThan(0.95);
  });

  it('el número pesa: el héroe gana menos contra tres guardias que contra uno', () => {
    const heroe = ficha('Héroe', { ataque: 150, defensa: 150 });
    const guardia = (n: string) => ficha(n, { ataque: 100, defensa: 90 });
    const uno = monteCarlo([heroe], [guardia('G1')], 1000);
    const tres = monteCarlo([heroe], [guardia('G1'), guardia('G2'), guardia('G3')], 1000);
    expect(uno.victoriasA / uno.combates).toBeGreaterThan(0.95);
    expect(tres.victoriasA / tres.combates).toBeLessThan(uno.victoriasA / uno.combates - 0.05);
  });

  it('narra el combate cuando se pide', () => {
    const r = simularCombate([ficha('A')], [ficha('B')], { semilla: 1, registrar: true });
    expect(r.registro!.length).toBeGreaterThan(3);
  });
});

describe('combinar tandas', () => {
  it('junta tandas de Monte Carlo como si fuera una sola corrida', () => {
    const [a, b] = [ficha('A'), ficha('B', { ataque: 140 })];
    const partes = [monteCarlo([a], [b], 300, { semilla: 1 }), monteCarlo([a], [b], 100, { semilla: 2 })];
    const r = combinar(partes);
    expect(r.combates).toBe(400);
    expect(r.victoriasA + r.victoriasB + r.empates).toBe(400);
    expect(r.asaltosMedio).toBeCloseTo((partes[0].asaltosMedio * 300 + partes[1].asaltosMedio * 100) / 400);
    const l = r.luchadores[0];
    expect(l.supervivencia).toBeCloseTo((partes[0].luchadores[0].supervivencia * 300 + partes[1].luchadores[0].supervivencia * 100) / 400);
    const caidos = partes.map((p) => p.luchadores[1].caidas * p.combates);
    const sumaAsaltos = partes.reduce((s, p, i) => s + (p.luchadores[1].asaltoCaidaMedio ?? 0) * caidos[i], 0);
    expect(r.luchadores[1].asaltoCaidaMedio).toBeCloseTo(sumaAsaltos / (caidos[0] + caidos[1]));
  });
});

describe('pifia en la iniciativa', () => {
  it('actúa automáticamente último, sin nivel de pifia (Core p.98)', () => {
    const rapido = ficha('Rápido', { turno: 300 });
    const lento = ficha('Lento', { turno: 20 });
    let pifiasVistas = 0;
    for (let semilla = 1; semilla <= 400; semilla++) {
      const r = simularCombate([rapido], [lento], { semilla, registrar: true });
      for (const e of r.registro!) {
        if (!e.texto.startsWith('Iniciativa:')) continue;
        const pifia = /Rápido (-?\d+) \[300\+(\d) \(pifia: actúa último, (-\d+) para la sorpresa\)\]/.exec(e.texto);
        if (!pifia) continue;
        pifiasVistas++;
        // Sin nivel: vale el natural, y la Tabla 52 da −125, −100 o −75 según saque 1, 2 o 3.
        expect(Number(pifia[1])).toBe(300 + Number(pifia[2]));
        expect(Number(pifia[3])).toBe({ 1: -125, 2: -100, 3: -75 }[Number(pifia[2])]);
        // Aunque su turno sea muy superior, actúa después del lento (salvo que el lento también pifie).
        if (!/Lento -?\d+ \[[^\]]*pifia/.test(e.texto)) expect(e.texto.indexOf('Lento')).toBeLessThan(e.texto.indexOf('Rápido'));
      }
    }
    expect(pifiasVistas).toBeGreaterThan(0);
  });
});
