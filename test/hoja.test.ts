// Planillas reales de la mesa: los mismos casos que `sheet_import_test.dart` de animaMasterToolkit,
// más la conversión a Ficha del simulador. Están en `fichas/` (o en la carpeta de ANIMA_FICHAS).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { elegirArma, jsonAFicha, leerHoja, tieneRasgo } from '../src/hoja/ficha';
import type { HojaJson } from '../src/hoja/hojaAJson';
import { monteCarlo } from '../src/motor/montecarlo';
import { capacidades } from '../src/motor/rasgos';

const CARPETA = process.env.ANIMA_FICHAS ?? fileURLToPath(new URL('../fichas', import.meta.url));

/** Archivo de la carpeta que empieza con `prefijo` (las copias se renombran: "(1)", "(2)"). */
function buscar(prefijo: string): string | null {
  if (!existsSync(CARPETA)) return null;
  const encontrado = readdirSync(CARPETA).find((f) => f.normalize().startsWith(prefijo.normalize()) && /.xls[xm]$/.test(f));
  return encontrado ? `${CARPETA}/${encontrado}` : null;
}

function hoja(prefijo: string): HojaJson | null {
  const ruta = buscar(prefijo);
  return ruta ? leerHoja(readFileSync(ruta)) : null;
}

const KAITO = 'Kaito Lvl 7 Ultimo';
const TESEO = 'Teseo Anima Gaia Reborn Nivel 7 Boxeito Ataque final Guardian';
const KIRAN = 'Ficha Anima v8.7.0 but peak (1) kiran';
const KAEL = 'Kael Avelar BOX';
const STEPHAN = 'Stéphan Durand Deville Lvl7';

const falta = (prefijo: string) => buscar(prefijo) === null;
const arma = (j: HojaJson, nombre: string) => j.Combate.armas.find((a) => a.nombre === nombre)!;
const tablasDeEstilo = (j: HojaJson) => [...Object.keys(j.Combate.TablasDeArmas), ...Object.keys(j.Combate.EstilosDeCombate)];

describe('planillas reales (port de sheet_import_test.dart)', () => {
  it.skipIf(falta(KAITO))('Kaito: dos espadas medianas, ambidiestro, Encadenado, Ataque Adicional y Tae Kwon Do', () => {
    const j = hoja(KAITO)!;
    expect(j.Combate.ambidestria).toBe(true);
    expect(tieneRasgo(tablasDeEstilo(j), 'Ataque Encadenado')).toBe(true);
    expect(tieneRasgo(tablasDeEstilo(j), 'Ataque Adicional')).toBe(true);
    expect(tieneRasgo(Object.keys(j.Combate.ArtesMarciales), 'Tae Kwon Do')).toBe(true);
    expect(tieneRasgo(Object.keys(j.Combate.ArtesMarciales), 'Kempo')).toBe(false);
    expect(j.Combate.desventajas).toEqual(['Arma exclusiva', 'Desafortunado', 'Endeble']);
    expect(tieneRasgo(j.Combate.habilidadesKi, 'Eliminación de penalizadores')).toBe(true);
    expect(tieneRasgo(j.Combate.habilidadesKi, 'Uso de la energía necesaria')).toBe(true);
    expect(tieneRasgo(j.Combate.habilidadesKi, 'Control del Ki')).toBe(false);
    const par = arma(j, 'Espada Kaitos y Espada Kaitos');
    expect(par.ataque).toBe('210');
    expect(par.tamanoAtaque).toBe('M');
  });

  it.skipIf(falta(TESEO))('Teseo: sin ambidestría ni tablas de ataque, armas de distinto tamaño', () => {
    const j = hoja(TESEO)!;
    expect(j.Combate.ambidestria).toBe(false);
    expect(tieneRasgo(tablasDeEstilo(j), 'Ataque Encadenado')).toBe(false);
    expect(tieneRasgo(tablasDeEstilo(j), 'Ataque Adicional')).toBe(false);
    expect(j.Combate.ventajas).toContain('Dificil de matar (2)');
    expect(j.Combate.desventajas).toEqual(['Fobia grave']);
    expect(Object.keys(j.Combate.ArsMagnus)).toEqual(expect.arrayContaining(['Guardian', 'Ataque Final']));
    expect(tieneRasgo(j.Combate.habilidadesKi, 'Inhumanidad')).toBe(true);
    expect(arma(j, 'Leviatan').tamanoAtaque).toBe('M');
    expect(arma(j, 'Ojiplato').tamanoAtaque).toBe('G');
    expect(arma(j, 'Hacha de mano').tamanoAtaque).toBe('M');
  });

  it.skipIf(falta(KIRAN))('Kiran: artes marciales que no tocan los ataques adicionales', () => {
    const j = hoja(KIRAN)!;
    expect(j.Combate.ambidestria).toBe(false);
    expect(tieneRasgo(tablasDeEstilo(j), 'Ataque Encadenado')).toBe(false);
    expect(j.Combate.desventajas).toEqual(['Mudo', 'Fobia grave', 'Vulnerable a frio o calor']);
    expect(tieneRasgo(j.Combate.habilidadesKi, 'Control del Ki')).toBe(true);
    expect(tieneRasgo(j.Combate.habilidadesKi, 'Escudo físico')).toBe(true);
    expect(tieneRasgo(j.Combate.habilidadesKi, 'Eliminación de penalizadores')).toBe(false);
    // El test del toolkit también pide 'Tabla de Desvio', pero la copia local ("kiran (1).xlsm")
    // es otra versión de la planilla y no tiene esa tabla en ninguna hoja.
  });

  it.skipIf(falta(KAEL))('Kael: Ataque Encadenado, Arma distinta y un Ars Magnus', () => {
    const j = hoja(KAEL)!;
    expect(tieneRasgo(tablasDeEstilo(j), 'Ataque Encadenado')).toBe(true);
    expect(tieneRasgo(tablasDeEstilo(j), 'Ataque Adicional')).toBe(false);
    expect(tablasDeEstilo(j)).toContain('Arma distinta / Desarmado');
    expect(Object.keys(j.Combate.ArsMagnus)).toEqual(['Leo: Armas-pistola']);
    expect(j.Combate.desventajas).toEqual(['Fobia grave', 'Secreto inconfesable', 'Maldito (2)']);
    expect(tieneRasgo(j.Combate.ventajas, 'Acumulación plena')).toBe(true);
    expect(tieneRasgo(j.Combate.habilidadesKi, 'Ataque elemental')).toBe(true);
    expect(Object.keys(j.Combate.ArtesMarciales)).toEqual([]);
  });

  it.skipIf(falta(STEPHAN))('Stéphan: mago con dos armas pequeñas sueltas y casi sin Ki', () => {
    const j = hoja(STEPHAN)!;
    expect(arma(j, 'Espada corta').tamanoAtaque).toBe('P');
    expect(arma(j, 'Daga').tamanoAtaque).toBe('P');
    expect(j.Combate.habilidadesKi).toHaveLength(2);
    expect(tieneRasgo(j.Combate.habilidadesKi, 'Inhumanidad')).toBe(true);
    expect(tieneRasgo(j.Combate.ventajas, 'Versatilidad metamágica')).toBe(true);
    expect(j.Combate.desventajas).toHaveLength(3);
    expect(tieneRasgo(j.Combate.desventajas, 'Miopía')).toBe(true);
    expect(tablasDeEstilo(j)).toEqual([]);
    expect(j.Combate.ambidestria).toBe(false);
  });
});

describe('de planilla a Ficha del simulador', () => {
  it.skipIf(falta(KAITO))('Kaito: la mejor arma cuerpo a cuerpo y sus datos', () => {
    const f = jsonAFicha(hoja(KAITO)!);
    expect(f).toMatchObject({
      nombre: 'Kaito Oma', pv: 190, turno: 125, ataque: 210, defensa: 175, danoBase: 90,
      tipoAtaque: 'FIL', tamanoArma: 'M', rf: 70, constitucion: 9, tipoMovimiento: 10, cansancio: 9,
    });
    expect(f.ta.FIL).toBe(2);
    expect(f.acumulacion).toBeUndefined();
    // Lo que sale de sus tablas, artes marciales, ventajas y habilidades del Ki.
    const cap = capacidades(f);
    expect(cap.maxAtaques).toBe(4);
    expect(cap.penPorAtaque).toBe(20);
    expect(cap.extras).toEqual([
      { nombre: 'Segunda arma con Ambidestría', pen: 10 },
      { nombre: 'Patada de Tae Kwon Do', pen: 30, sinArmas: true },
    ]);
    expect(cap.mitadCansancio).toBe(true);
    expect(cap.danaEnergia).toBe(true); // Extensión del aura al arma
  });

  it.skipIf(falta(KAITO))('elige el arma pedida por nombre y avisa si no existe', () => {
    const j = hoja(KAITO)!;
    expect(elegirArma(j, 'artes').nombre).toBe('Artes Marciales');
    expect(() => elegirArma(j, 'Arco largo')).toThrow(/No encuentro el arma/);
  });

  it.skipIf([KAITO, TESEO, KIRAN, KAEL, STEPHAN].some(falta))('las cinco fichas pelean entre sí sin romperse', () => {
    const fichas = [KAITO, TESEO, KIRAN, KAEL, STEPHAN].map((a) => jsonAFicha(hoja(a)!));
    for (const f of fichas) {
      expect(f.pv).toBeGreaterThan(0);
      expect(f.ataque).toBeGreaterThan(0);
      expect(f.danoBase).toBeGreaterThan(0);
    }
    const r = monteCarlo(fichas.slice(0, 2), fichas.slice(2), 200);
    expect(r.victoriasA + r.victoriasB + r.empates).toBe(200);
  });
});
