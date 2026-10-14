import { describe, expect, it } from 'vitest';
import { tabla } from '../src/motor/probabilidades';
import { tirarD100 } from '../src/motor/dados';
import { crearRng } from '../src/motor/rng';
import { bonoContraataque, porcentajeDano } from '../src/motor/reglas';

/** Lo mismo que calcula la tabla, pero tirando dados de verdad. */
function empirico(s: number, abs: number, n: number, umbralAtk = 3, umbralDef = 3) {
  const rng = crearRng(12345);
  let impactos = 0, contras = 0, pct = 0, bono = 0;
  for (let i = 0; i < n; i++) {
    const a = tirarD100(rng, umbralAtk);
    if (a.pifia) {
      contras++;
      bono += a.nivelPifia;
      continue;
    }
    const d = tirarD100(rng, umbralDef);
    const r = s + a.valor - (d.pifia ? d.natural - d.nivelPifia : d.valor);
    if (r > 0) {
      impactos++;
      pct += porcentajeDano(r, abs);
    } else if (r < 0) {
      contras++;
      bono += bonoContraataque(r);
    }
  }
  return { pImpacto: impactos / n, pContra: contras / n, pct: pct / n, bono: bono / n };
}

describe('tabla precalculada contra dados reales', () => {
  for (const s of [-60, 0, 40, 120]) {
    it(`ventaja ${s}`, () => {
      const t = tabla(3, 3, false);
      const e = empirico(s, 40, 300_000);
      expect(t.pImpacto(s)).toBeCloseTo(e.pImpacto, 2);
      expect(t.pContra(s)).toBeCloseTo(e.pContra, 2);
      expect(t.porcentajeEsperado(s, 40)).toBeCloseTo(e.pct, 0);
      expect(t.bonoContraEsperado(s)).toBeCloseTo(e.bono, 0);
    });
  }

  it('con otros umbrales de pifia (maestría, Buena suerte)', () => {
    for (const [ua, ud] of [[2, 3], [1, 2], [3, 1]]) {
      const t = tabla(ua, ud, false);
      const e = empirico(30, 40, 300_000, ua, ud);
      expect(t.pImpacto(30)).toBeCloseTo(e.pImpacto, 2);
      expect(t.pContra(30)).toBeCloseTo(e.pContra, 2);
      expect(t.bonoContraEsperado(30)).toBeCloseTo(e.bono, 0);
    }
  });

  it('la masa total suma 1', () => {
    const t = tabla(3, 3, false);
    const imp = t.pImpacto(0), con = t.pContra(0);
    expect(imp + con).toBeLessThanOrEqual(1);
    expect(imp + con).toBeGreaterThan(0.99);
  });

  it('sin defensa (acumulación): ventaja 0 siempre impacta salvo pifia', () => {
    expect(tabla(3, 3, true).pImpacto(0)).toBeCloseTo(0.97, 5);
  });
});
