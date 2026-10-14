// Correcciones de la auditoría contra los manuales (ver AUDITORIA.md).

import { describe, expect, it } from 'vitest';
import type { CapaArmadura, Ficha, Rasgos } from '../src/motor/modelo';
import { crearLuchador } from '../src/motor/combate';
import { absorcionContra, ataqueFinal, defensaFinal, desequilibrio, modControl, taZona, turnoFinal } from '../src/motor/calculos';
import { penManiobra } from '../src/motor/maniobras';
import { capacidades, localizacionArmadura } from '../src/motor/rasgos';

function ficha(nombre: string, rasgos: Rasgos = {}, extra: Partial<Ficha> = {}): Ficha {
  return {
    id: nombre, nombre, pv: 150, turno: 80, ataque: 150, defensa: 150, danoBase: 50, tipoAtaque: 'FIL',
    ta: {}, rf: 50, constitucion: 7, tipoMovimiento: 6, arma: { nombre: 'Espada larga' }, rasgos, ...extra,
  };
}

describe('auditoría contra los manuales', () => {
  it('Afortunado no baja la pifia: sólo Buena suerte (Core p.21)', () => {
    expect(capacidades(ficha('A', { ventajas: ['Afortunado'] })).buenaSuerte).toBe(false);
    expect(capacidades(ficha('B', { ventajas: ['Buena suerte'] })).buenaSuerte).toBe(true);
  });

  it('flanco: el −10 al atacar lo sufre quien ataca a alguien que tiene en su lateral (Core p.90)', () => {
    const rodeado = crearLuchador(ficha('Rodeado'), 'A', 0, 0);
    const enemigos = [1, 2, 3, 4].map((i) => crearLuchador(ficha(`E${i}`), 'B', 1, 0));
    rodeado.trabados.push(...enemigos);
    for (const e of enemigos) e.trabados.push(rodeado);
    const cuarto = enemigos[3]; // el 4º queda en su flanco
    expect(ataqueFinal(rodeado, cuarto) - ataqueFinal(rodeado, enemigos[0])).toBe(-10);
    // Quien está en el flanco ataca sin penalizador, y el rodeado se defiende de él con −30.
    expect(ataqueFinal(cuarto, rodeado)).toBe(ataqueFinal(enemigos[0], rodeado));
    expect(defensaFinal(rodeado, cuarto) - defensaFinal(rodeado, enemigos[0])).toBe(-30);
  });

  it('Precisa reduce a la mitad Engatillar; con la Tabla de Precisión, a −25 (Core p.65, p.76)', () => {
    const pen = (f: Ficha) => penManiobra(crearLuchador(f, 'A', 0, 0), 'engatillar', false);
    expect(pen(ficha('Espada'))).toBe(100);
    expect(pen(ficha('Estoque', {}, { arma: { nombre: 'Estoque', precisa: true } }))).toBe(50);
    expect(pen(ficha('Estoque', { tablas: ['Tabla de Precisión'] }, { arma: { nombre: 'Estoque', precisa: true } }))).toBe(25);
  });

  it('la iniciativa toma la mitad del negativo a toda acción (Core p.232)', () => {
    const l = crearLuchador(ficha('Herido'), 'A', 0, 0);
    const sano = turnoFinal(l);
    l.penDolor = 40;
    expect(turnoFinal(l)).toBe(sano - 20);
  });

  it('cada −20 a toda acción resta 1 a los controles enfrentados de características (Core p.232)', () => {
    const l = crearLuchador(ficha('Herido'), 'A', 0, 0);
    expect(modControl(l)).toBe(0);
    l.penDolor = 45;
    expect(modControl(l)).toBe(-2);
  });
});

describe('armadura por zona en los ataques apuntados (Core p.83, p.92)', () => {
  const capa = (nombre: string, ta: Record<string, number>, localizacion?: CapaArmadura['localizacion']): CapaArmadura =>
    ({ nombre, clase: 'dura', ta, calidad: 0, entereza: 15, localizacion });

  it('sin yelmo, la cabeza no tiene armadura; un peto no cubre las piernas', () => {
    const f = ficha('Soldado', {}, { ta: { FIL: 4, CON: 5 }, capasArmadura: [capa('Peto', { FIL: 4, CON: 5 })] });
    expect(taZona(f, 'cuerpo', 'FIL')).toBe(4);
    expect(taZona(f, 'cabeza', 'FIL')).toBe(0);
    expect(taZona(f, 'extremidad', 'CON')).toBe(0);
    const atk = crearLuchador(ficha('Atacante'), 'B', 0, 0);
    const def = crearLuchador(f, 'A', 0, 0);
    expect(absorcionContra(def, atk, 'cabeza', 'FIL')).toBe(20);
    expect(absorcionContra(def, atk, 'corazon', 'FIL')).toBe(60);
  });

  it('el yelmo protege sólo la cabeza; una completa también las piernas', () => {
    const f = ficha('Caballero', {}, {
      ta: { FIL: 5 },
      capasArmadura: [capa('Completa', { FIL: 5 }), capa('Completo abierto', { FIL: 5 }, 'cabeza')],
    });
    expect(taZona(f, 'cabeza', 'FIL')).toBe(5);
    expect(taZona(f, 'extremidad', 'FIL')).toBe(5);
  });

  it('lo que la planilla suma fuera de las capas (armaduras especiales) cubre todo el cuerpo', () => {
    // Kiran: Completa de cuero 1/0/2 y TA total 4 en todo por la Armadura de Energía.
    const f = ficha('Kiran', {}, { ta: { FIL: 4, ENE: 4 }, capasArmadura: [capa('Completa cuero', { FIL: 1 }, 'completa')] });
    expect(taZona(f, 'cabeza', 'FIL')).toBe(3);
    expect(taZona(f, 'cabeza', 'ENE')).toBe(4);
    expect(taZona(f, 'extremidad', 'FIL')).toBe(4);
  });

  it('las capas se combinan: la más alta más la mitad de las otras', () => {
    const f = ficha('Doble', {}, { ta: { FIL: 6 }, capasArmadura: [capa('Placas', { FIL: 5 }), capa('Mallas', { FIL: 4 })] });
    // 5 + 4/2 = 7; la total de la planilla (6) no supera a las capas, así que no hay nada especial.
    expect(taZona(f, 'extremidad', 'FIL')).toBe(7);
  });

  it('se deduce del nombre si la planilla no la trae (Tabla 37)', () => {
    expect(localizacionArmadura('Cuero tachonado')).toBe('peto');
    expect(localizacionArmadura('Cota de cuero')).toBe('camisola');
    expect(localizacionArmadura('Piezas')).toBe('completa');
    expect(localizacionArmadura('Capucha de cuero')).toBe('cabeza');
    expect(localizacionArmadura('Anilla')).toBe('cabeza');
    expect(localizacionArmadura('Anillas')).toBe('camisola');
  });
});

describe('respuestas a la auditoría', () => {
  const trabar = (a: ReturnType<typeof crearLuchador>, rivales: ReturnType<typeof crearLuchador>[]) => {
    a.trabados.push(...rivales);
    for (const r of rivales) r.trabados.push(a);
  };

  it('Selene arcano contraataca sin el penalizador de ataques adicionales (Dominus p.39)', () => {
    const f = ficha('Selene', { artesMarciales: ['Aikido (Supremo)', 'Selene (Arcano)'] }, { arma: { nombre: 'Desarmado', desarmado: true } });
    const l = crearLuchador(f, 'A', 0, 0);
    const r = crearLuchador(ficha('Rival'), 'B', 1, 0);
    l.ataquesDeclarados = 2;
    expect(ataqueFinal(l, r, { esContra: true }) - ataqueFinal(l, r, { esContra: false })).toBe(l.cap.penPorAtaque);
  });

  it('desequilibrio de atributos: +10 por punto de DES+AGI por encima de 7, sólo con la opción (Dominus p.10)', () => {
    const rapido = ficha('Rápido', {}, { atributos: { DES: 15, AGI: 15 } });
    const lento = ficha('Lento', {}, { atributos: { DES: 9, AGI: 10 } });
    const a = crearLuchador(rapido, 'A', 0, 0);
    const b = crearLuchador(lento, 'B', 1, 0);
    const sin = ataqueFinal(a, b);
    a.entorno = { desequilibrio: true };
    b.entorno = { desequilibrio: true };
    // 30 − 19 = 11: cuatro puntos sobre 7, +40 (el ejemplo de Celia y Éxodo).
    expect(ataqueFinal(a, b) - sin).toBe(40);
    expect(desequilibrio(b, a)).toBe(0);
  });

  it('parálisis completa no suma flanco ni espalda; ceguera absoluta + espalda queda en −120 (Dominus p.11)', () => {
    const def = crearLuchador(ficha('Atrapado'), 'A', 0, 0);
    const rivales = [1, 2, 3, 4, 5, 6].map((i) => crearLuchador(ficha(`R${i}`), 'B', 1, 0));
    trabar(def, rivales);
    const espalda = rivales[5];
    const frente = rivales[0];
    def.paralisis = 3;
    expect(defensaFinal(def, espalda)).toBe(defensaFinal(def, frente));
    def.paralisis = 0;
    // Velez arcano ataca invisible (ceguera absoluta, −80). Quien esquiva no queda anulado como al parar.
    const esquiva = crearLuchador(ficha('Esquivador', {}, { tipoDefensa: 'esquiva' }), 'A', 0, 0);
    const velez = crearLuchador(ficha('Velez', { artesMarciales: ['Velez (Arcano)'] }, { arma: { nombre: 'Desarmado', desarmado: true } }), 'B', 1, 0);
    const otros = rivales.slice(0, 5);
    esquiva.trabados = [...otros, velez]; // sexto: espalda
    const ciegoEspalda = defensaFinal(esquiva, velez);
    esquiva.trabados = [...otros, rivales[5]];
    const espaldaSola = defensaFinal(esquiva, rivales[5]);
    expect(ciegoEspalda - espaldaSola).toBe(-40); // −120 en total, no −80 − 80
    esquiva.trabados = [velez];
    expect(defensaFinal(esquiva, velez) - defensaFinal(esquiva, rivales[0])).toBe(-80);
  });
});
