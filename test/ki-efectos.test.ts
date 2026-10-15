// Efectos sobrenaturales y desventajas de las técnicas de Ki (Dominus cap. 5, p.51-74).

import { describe, expect, it } from 'vitest';
import type { Contexto, Ficha, Tecnica } from '../src/motor/modelo';
import { atacar, crearLuchador, simularCombate } from '../src/motor/combate';
import { crearRng } from '../src/motor/rng';
import { ataqueFinal, defensaFinal, sorpresaDefensa } from '../src/motor/calculos';
import { recuperarAccion } from '../src/motor/ia';
import { efectosDe, ejecutar, empezarAsalto, puedeEjecutar, repertorio, type DecisionKi } from '../src/motor/ki';
import { leerEfectosTecnica } from '../src/hoja/ficha';

const tecnica = (nombre: string, efectos: string, coste: Tecnica['coste'] = { DES: 2 }, extra: Partial<Tecnica> = {}): Tecnica => ({
  nombre, nivel: 2, cm: 20, coste, mantenimiento: 0, combinable: false, efectos: leerEfectosTecnica(efectos), ...extra,
});

function maestro(tecnicas: Tecnica[], extra: Partial<Ficha> = {}): Ficha {
  return {
    id: 'm', nombre: 'Maestro', pv: 200, turno: 90, ataque: 180, defensa: 170, danoBase: 60, tipoAtaque: 'CON',
    ta: { FIL: 2, CON: 2, PEN: 2 }, rf: 60, constitucion: 9, tipoMovimiento: 8, presencia: 60, cansancio: 9,
    atributos: { AGI: 9, CON: 9, DES: 10, FUE: 9, POD: 9, VOL: 8 },
    ki: { reserva: 120, acumulacion: { DES: 6, FUE: 6, AGI: 6, POD: 6, CON: 6 }, tecnicas },
    ...extra,
  };
}

const rival = (extra: Partial<Ficha> = {}): Ficha => ({
  id: 'r', nombre: 'Rival', pv: 220, turno: 60, ataque: 140, defensa: 130, danoBase: 60, tipoAtaque: 'FIL',
  ta: { FIL: 2, CON: 2 }, rf: 40, constitucion: 8, tipoMovimiento: 6, atributos: { FUE: 7, AGI: 7, DES: 7 }, ...extra,
});

const decision = (extra: Partial<DecisionKi> = {}): DecisionKi => ({ acumula: true, soltar: [], liberar: [], objetivo: null, ...extra });
const textos = (f: Ficha[], g: Ficha[], semilla = 1) =>
  simularCombate(f, g, { semilla, registrar: true }).registro!.map((x) => x.texto);

describe('lectura de los efectos', () => {
  it('Estados: Resistencia, estados, condición y distancia', () => {
    const t = tecnica('Mirada', 'Estados Sobrenaturales (RF 120, Paralizacion parcial, Miedo, Contacto visual varios blancos, 25 metros)');
    const [a, b] = efectosDe(t).accion.estados;
    expect(a).toMatchObject({ estado: 'paralisisParcial', rf: 120, condicion: 'automatico', distancia: 25, varios: true });
    expect(b.estado).toBe('miedo');
    expect(efectosDe(t).automatico).toBe(true);
    expect(efectosDe(tecnica('Toque', 'Estados Sobrenaturales (RF 100, Dolor extremo, Contacto fisico)')).accion.estados[0])
      .toMatchObject({ estado: 'dolorExtremo', condicion: 'contacto' });
  });

  it('escudo de 1.000, impacto que atrae, crítico automático, ataque elemental y desventajas', () => {
    const ef = efectosDe(tecnica('X', 'Escudo de Energia (1.000), Impacto (Fuerza 12, Atraer), Potenciar Critico (+50, Critico automatico), Ataque Elemental (Fuego), Agotamiento (2), Exceso de energia'));
    expect(ef.asalto.escudo).toBe(1000);
    expect([ef.accion.impacto, ef.accion.atraer, ef.accion.critico, ef.accion.criticoAuto, ef.accion.elemento]).toEqual([12, true, 50, true, 'CAL']);
    expect(ef.desventajas).toMatchObject({ agotamiento: 2, exceso: true });
    expect(ef.desconocidos).toEqual([]);
  });

  it('forzada: la Resistencia de los Estados sube 40 (Dominus p.21)', () => {
    const t = tecnica('Toque', 'Estados Sobrenaturales (RF 100, Dolor)');
    const f = maestro([t], { rasgos: { habilidadesKi: ['Forzar Tecnicas'] } });
    const forz = repertorio(f).find((x) => x.nombre.endsWith('(forzada)'))!;
    expect(efectosDe(forz).accion.estados[0].rf).toBe(140);
  });
});

describe('Estados sobrenaturales (Dominus p.66-68)', () => {
  it('si el golpe daña, el rival hace la RF y sufre el estado', () => {
    const t = tecnica('Golpe paralizante', 'Habilidad de Ataque (+30), Estados Sobrenaturales (RF 280, Paralizacion total)');
    const r = textos([maestro([t])], [rival()]);
    const falla = r.findIndex((x) => x.includes('falla la RF contra la Paralización total'));
    expect(falla).toBeGreaterThan(0);
    expect(r[falla + 1]).toMatch(/queda en parálisis completa \d+ asaltos/);
  });

  it('los automáticos se usan sin tirada de ataque y alcanzan a varios', () => {
    const t = tecnica('Grito', 'Estados Sobrenaturales (RF 200, Miedo, Por sonido varios blancos, 25 metros)', { POD: 4 });
    const r = textos([maestro([t])], [rival(), { ...rival(), id: 'r2', nombre: 'Otro' }]);
    const uso = r.find((x) => x.startsWith('Maestro usa Grito'));
    expect(uso).toMatch(/sobre Rival, Otro/);
    expect(r.some((x) => x.includes('queda con Miedo'))).toBe(true);
  });
});

describe('Escudo de energía (Dominus p.66, Core p.100)', () => {
  it('detiene el golpe y pierde su daño base; sin penalizador por defensas adicionales', () => {
    const escudo = tecnica('Muro', 'Escudo de Energia (300)', { POD: 2 });
    const l = crearLuchador(maestro([escudo]), 'A', 0, 0);
    const e = crearLuchador(rival(), 'B', 1, 0);
    empezarAsalto(l, decision(), 0, 1);
    ejecutar(l, escudo);
    expect(l.escudoKi).toBe(300);
    l.defensasHechas = 3;
    expect(defensaFinal(l, e)).toBe(defensaFinal({ ...l, defensasHechas: 0 }, e));
    // Sin mantenerse, al asalto siguiente desaparece.
    empezarAsalto(l, decision(), 0, 2);
    expect(l.escudoKi).toBe(0);
  });
});

describe('Ataque sobrenatural (Dominus p.64)', () => {
  it('quien para sin poder parar energía no se defiende; quien esquiva, sí', () => {
    const t = tecnica('Rayo', 'Ataque Sobrenatural');
    const l = crearLuchador(maestro([t]), 'A', 0, 0);
    const para = crearLuchador(rival(), 'B', 1, 0);
    const esquiva = crearLuchador({ ...rival(), tipoDefensa: 'esquiva' }, 'B', 1, 0);
    const ki = efectosDe(t).accion;
    expect(defensaFinal(para, l, { kiAtk: ki })).toBeLessThanOrEqual(0);
    expect(defensaFinal(esquiva, l, { kiAtk: ki })).toBe(defensaFinal(esquiva, l));
  });
});

describe('Impacto, Marca y Reflectar', () => {
  it('Impacto: si pierde el control de Fuerza sale despedido', () => {
    const t = tecnica('Puño', 'Habilidad de Ataque (+40), Impacto (Fuerza 16)');
    const r = textos([maestro([t])], [rival()], 3);
    expect(r.some((x) => x.includes('El Impacto lanza a Rival'))).toBe(true);
  });

  it('Marca: el rival dañado queda marcado', () => {
    const t = tecnica('Sello', 'Habilidad de Ataque (+20), Marca (Marca mayor)');
    const r = textos([maestro([t])], [rival({ pv: 400 })], 2);
    expect(r.some((x) => x.includes('queda marcado por Maestro (+50'))).toBe(true);
  });

  it('Reflectar: una defensa con éxito devuelve el ataque', () => {
    const t = tecnica('Espejo', 'Habilidad de Parada (+60), Reflectar el ataque', { DES: 2 });
    const r = textos([maestro([t], { defensa: 220 })], [rival({ ataque: 170, pv: 400 })], 1);
    expect(r.some((x) => x.startsWith('Maestro refleja el ataque contra Rival'))).toBe(true);
  });
});

describe('Desventajas (Dominus p.71-74)', () => {
  it('Circunstancia límite: sólo con la mitad de los PV', () => {
    const t = tecnica('Desesperado', 'Habilidad de Ataque (+100), Circunstancia limite (Mitad de PV)');
    const l = crearLuchador(maestro([t]), 'A', 0, 0);
    empezarAsalto(l, decision(), 0, 1);
    expect(puedeEjecutar(l, t)).toBe(false);
    l.pv = 90;
    expect(puedeEjecutar(l, t)).toBe(true);
  });

  it('Exceso de energía paga dos veces; Penalizador y Agotamiento al ejecutarla', () => {
    const t = tecnica('Brutal', 'Habilidad de Ataque (+100), Exceso de energia, Penalizador a toda Accion (-40), Agotamiento (2)', { DES: 4 });
    const l = crearLuchador(maestro([t]), 'A', 0, 0);
    empezarAsalto(l, decision(), 0, 1);
    ejecutar(l, t);
    expect(l.ki!.reserva).toBe(112);
    expect(l.penTecnica).toBe(40);
    expect(l.cansancio).toBe(7);
  });
});

describe('Técnicas a distancia (Dominus p.57, Core p.96)', () => {
  it('Tabla 48 y Tabla 49', async () => {
    const { dificultadDisparo, penDefensaProyectil } = await import('../src/motor/reglas');
    expect([dificultadDisparo(0.5), dificultadDisparo(8), dificultadDisparo(30), dificultadDisparo(100), dificultadDisparo(300)]).toEqual([40, 80, 120, 140, 180]);
    expect([penDefensaProyectil('parada', false), penDefensaProyectil('parada', true), penDefensaProyectil('esquiva', false), penDefensaProyectil('esquiva', true)]).toEqual([80, 20, 30, 0]);
  });

  it('el defensor sufre la Tabla 49, salvo con un escudo de energía', () => {
    const l = crearLuchador(maestro([tecnica('X', 'Habilidad de ataque (+10)')]), 'A', 0, 0);
    const e = crearLuchador(rival(), 'B', 20, 0);
    expect(defensaFinal(e, l) - defensaFinal(e, l, { proyectil: true })).toBe(80);
    e.escudoKi = 100;
    expect(defensaFinal(e, l) - defensaFinal(e, l, { proyectil: true })).toBe(0);
  });

  it('la IA ataca de lejos en vez de acercarse, y no le pueden contraatacar', () => {
    const rayo = tecnica('Rayo de luz', 'Habilidad de Ataque (+40), Ataque a distancia (50 metros)', { POD: 3 });
    const r = simularCombate([maestro([rayo], { tipoMovimiento: 4 })], [rival({ tipoMovimiento: 4 })], { semilla: 2, registrar: true, distanciaInicial: 30 });
    const t = r.registro!.map((x) => x.texto);
    expect(t.some((x) => x.startsWith('Maestro ataca a Rival con Rayo de luz'))).toBe(true);
    expect(t.some((x) => x.includes('no tiene a Maestro a su alcance'))).toBe(t.some((x) => /Maestro ataca a Rival con Rayo.*→ -/.test(x)));
  });
});

describe('efectos de acción y camuflaje (Dominus p.52-56)', () => {
  it('lectura: Ataque adicional con Ataque continuo y Combo, limitado y Camuflar ataque', () => {
    const ef = efectosDe(tecnica('Ráfaga', 'Ataque adicional (+2, Ataque continuo, Combo, Bono de cansancio añadido), Ataque adicional limitado (+1), Camuflar ataque (Dificil (120))'));
    expect(ef.accion).toMatchObject({ ataquesAdicionales: 2, continuo: true, combo: true, cansancioAnadido: true, adicionalesLimitados: 1, camuflar: 120 });
    expect(ef.desconocidos).toEqual([]);
    expect(efectosDe(tecnica('C', 'Camuflar ataque (Absurdo)')).accion.camuflar).toBe(180);
  });

  it('Combo corta la cadena si el rival se defiende; sin Combo siguen todos los golpes', () => {
    const golpesCon = (efectos: string, semilla: number) => {
      const t = tecnica('Cadena', efectos, { DES: 1 });
      const atk = crearLuchador(maestro([t], { ataque: 60 }), 'A', 0, 0);
      const def = crearLuchador(rival({ defensa: 400 }), 'B', 1, 0);
      for (const l of [atk, def]) {
        l.ataquesDeclarados = 1;
        l.planAtaques = [{ pen: 0, sinArmas: false }];
        l.ataquesRestantes = 1;
      }
      def.ataquesRestantes = 0; // sin contras: que nada más corte la serie
      atk.ki!.acumulado = { DES: 5 };
      const ctx: Contexto = {
        opciones: {}, rng: crearRng(semilla), luchadores: [atk, def], asalto: 1, registro: [],
        ataquesEnAsalto: 0, ataquesAsaltoAnterior: 0, movimientosEnAsalto: 0, ventaja: { A: 1, B: 1 },
      };
      atacar(ctx, atk, def, { esContra: false, bono: 0, tecnica: t });
      return ctx.registro!.filter((e) => e.texto.includes('con Cadena') && !e.texto.includes('pifia')).length;
    };
    for (let s = 1; s <= 5; s++) {
      expect(golpesCon('Ataque adicional (+4, Combo)', s)).toBeLessThanOrEqual(1);
      expect(golpesCon('Ataque adicional (+4)', s)).toBeGreaterThanOrEqual(1);
    }
    expect([1, 2, 3, 4, 5].reduce((n, s) => n + golpesCon('Ataque adicional (+4)', s), 0)).toBeGreaterThan(10);
  });

  it('Camuflar ataque: quien no lo advierte se defiende con Sorpresa; quien lo superó, ya no', () => {
    const camuflado = maestro([tecnica('Sombra', 'Habilidad de ataque (+10), Camuflar ataque (Imposible (280))', { DES: 1 })]);
    const t = textos([camuflado], [rival({ advertir: 10 })], 3);
    expect(t.some((x) => x.includes('no advierte el ataque camuflado'))).toBe(true);
    const atento = textos([camuflado], [rival({ advertir: 400 })], 3);
    expect(atento.filter((x) => x.includes('advierte el ataque camuflado') && !x.includes('no advierte')).length).toBeLessThanOrEqual(1);
  });
});

describe('acción y reacción (Dominus p.56-57)', () => {
  it('lectura de Acción adicional, Recuperar acción y Previsión', () => {
    const ef = efectosDe(tecnica('Reflejos', 'Accion adicional (+2), Prevision (Completo)'));
    expect(ef.asalto).toMatchObject({ accionesAdicionales: 2, prevision: 90 });
    expect(efectosDe(tecnica('P', 'Prevision (A mitad)')).asalto.prevision).toBe(45);
    expect(efectosDe(tecnica('R', 'Recuperar accion')).accion.recuperaAccion).toBe(true);
    expect(ef.desconocidos).toEqual([]);
  });

  it('Acción adicional: esas acciones activas no restan −25', () => {
    const l = crearLuchador(maestro([tecnica('X', 'Habilidad de ataque (+10)')]), 'A', 0, 0);
    const r = crearLuchador(rival(), 'B', 1, 0);
    l.accionesActivas = 1;
    const con25 = ataqueFinal(l, r);
    l.ki!.activo = { ...l.ki!.activo, accionesAdicionales: 1 };
    expect(ataqueFinal(l, r)).toBe(con25 + 25);
  });

  it('Previsión: −45 o nada contra quien lo sorprende por turno; no contra un ataque camuflado', () => {
    const l = crearLuchador(maestro([tecnica('X', 'Habilidad de ataque (+10)')]), 'A', 0, 0);
    const r = crearLuchador(rival(), 'B', 1, 0);
    r.sorprendeA.add(l);
    expect(sorpresaDefensa(l, r)).toBe(-90);
    l.ki!.activo = { ...l.ki!.activo, prevision: 45 };
    l.previsionContra = r;
    expect(sorpresaDefensa(l, r)).toBe(-45);
    l.ki!.activo = { ...l.ki!.activo, prevision: 90 };
    expect(sorpresaDefensa(l, r)).toBe(0);
    r.camufladoA.add(l);
    expect(sorpresaDefensa(l, r)).toBe(-90);
  });

  it('Recuperar acción: la IA la usa a la defensiva si atacar rinde más que el Ki', () => {
    const t = tecnica('Volver', 'Recuperar accion', { DES: 1 });
    const l = crearLuchador(maestro([t]), 'A', 0, 0);
    const r = crearLuchador(rival(), 'B', 1, 0);
    l.ataquesRestantes = 1;
    l.aLaDefensiva = true;
    l.ki!.acumulado = { DES: 2 };
    const ctx: Contexto = {
      opciones: {}, rng: crearRng(1), luchadores: [l, r], asalto: 1, registro: [],
      ataquesEnAsalto: 0, ataquesAsaltoAnterior: 0, movimientosEnAsalto: 0, ventaja: { A: 1, B: 1 },
    };
    expect(recuperarAccion(ctx, l)).toBe(t);
  });
});
