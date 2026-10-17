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

describe('Parada en área (Dominus p.58)', () => {
  const area = tecnica('Onda', 'Ataque con area (5 metros), Habilidad de ataque (+10)', { DES: 1 });
  const escudo = tecnica('Muralla', 'Parada en area (25 metros), Habilidad de parada limitada (+90)', { DES: 1 });
  const ronda = (defensa: number, paraEnergia: boolean, semilla = 1) => {
    const atk = crearLuchador(maestro([area], { ataque: 200 }), 'A', 0, 0);
    const p = crearLuchador(maestro([escudo], { id: 'p', nombre: 'Protector', defensa, rasgos: paraEnergia ? { habilidadesKi: ['Extrusion de Presencia'] } : {} }), 'B', 1, 0);
    const q = crearLuchador(rival({ id: 'q', nombre: 'Aliado', defensa: 20 }), 'B', 3, 0);
    for (const l of [atk, p, q]) {
      l.ataquesDeclarados = 1;
      l.planAtaques = [{ pen: 0, sinArmas: false }];
      l.ataquesRestantes = 0;
    }
    atk.ataquesRestantes = 1;
    atk.ki!.acumulado = { DES: 5 };
    p.ki!.acumulado = { DES: 5 };
    const ctx: Contexto = {
      opciones: {}, rng: crearRng(semilla), luchadores: [atk, p, q], asalto: 1, registro: [],
      ataquesEnAsalto: 0, ataquesAsaltoAnterior: 0, movimientosEnAsalto: 0, ventaja: { A: 1, B: 1 },
    };
    atacar(ctx, atk, p, { esContra: false, bono: 0, tecnica: area });
    return { q, textos: ctx.registro!.map((e) => e.texto) };
  };

  it('lectura: el radio en metros, y en kilómetros', () => {
    expect(efectosDe(escudo).accion.paradaArea).toBe(25);
    expect(efectosDe(tecnica('X', 'Parada en area (1 kilometro)')).accion.paradaArea).toBe(1000);
    expect(efectosDe(escudo).desconocidos).toEqual([]);
  });

  it('si la Parada gana, el aliado del radio no recibe nada', () => {
    const { q, textos } = ronda(400, true);
    expect(textos.some((x) => x.includes('con Muralla'))).toBe(true);
    expect(textos.some((x) => x.includes('cubierto por la Parada en área de Protector'))).toBe(true);
    expect(q.pv).toBe(q.ficha.pv);
  });

  it('si pierde, el aliado recibe el daño de esa diferencia', () => {
    let cubiertos = 0;
    for (let s = 1; s <= 5; s++) {
      const { q, textos } = ronda(-200, true, s);
      const linea = textos.find((x) => x.includes('cubierto por la Parada en área'));
      if (!linea) continue;
      cubiertos++;
      expect(Number(/→ (-?\d+)/.exec(linea)![1])).toBeGreaterThan(0);
      expect(q.pv).toBeLessThan(q.ficha.pv);
    }
    expect(cubiertos).toBeGreaterThan(0);
  });

  it('contra un área sobrenatural, sin parar energía no puede cubrir', () => {
    const { textos } = ronda(400, false);
    expect(textos.some((x) => x.includes('cubierto por la Parada en área'))).toBe(false);
  });
});

describe('Transporte automático (Dominus p.59)', () => {
  const salto = tecnica('Salto', 'Transporte automatico (20 metros), Habilidad de ataque (+10)', { DES: 1 });
  const huida = tecnica('Huida', 'Transporte automatico (50 metros), Habilidad de parada (+10)', { DES: 1 });
  const rayo = tecnica('Rayo', 'Ataque a distancia (50 metros)', { DES: 1 });
  const contexto = (luchadores: ReturnType<typeof crearLuchador>[], semilla = 1): Contexto => {
    for (const l of luchadores) {
      l.ataquesDeclarados = 1;
      l.planAtaques = [{ pen: 0, sinArmas: false }];
      l.ataquesRestantes = 1;
      if (l.ki) l.ki.acumulado = { DES: 5 };
    }
    return {
      opciones: {}, rng: crearRng(semilla), luchadores, asalto: 1, registro: [],
      ataquesEnAsalto: 0, ataquesAsaltoAnterior: 0, movimientosEnAsalto: 0, ventaja: { A: 1, B: 1 },
    };
  };

  it('lectura', () => {
    expect(efectosDe(salto).accion.transporte).toBe(20);
    expect(efectosDe(tecnica('X', 'Transporte automatico (1 kilometro)')).accion.transporte).toBe(1000);
    expect(efectosDe(salto).desconocidos).toEqual([]);
  });

  it('atado a un ataque: aparece junto al blanco; Advertir Muy Difícil las dos primeras veces', () => {
    const atk = crearLuchador(maestro([salto]), 'A', 0, 0);
    const def = crearLuchador(rival({ advertir: 0 }), 'B', 15, 0);
    const ctx = contexto([atk, def]);
    atacar(ctx, atk, def, { esContra: false, bono: 0, tecnica: salto });
    const t = ctx.registro!.map((e) => e.texto);
    expect(t.some((x) => x.includes('se transporta 15 m hasta Rival'))).toBe(true);
    expect(t.some((x) => x.includes('no advierte el transporte') && x.includes('contra 140'))).toBe(true);
    expect(t.some((x) => x.includes('con Salto') && !x.includes('desde'))).toBe(true);
    for (let i = 0; i < 2; i++) {
      atk.pos = { x: 0, y: 0 };
      def.pos = { x: 15, y: 0 };
      atk.ataquesRestantes = 1;
      atk.ki!.acumulado = { DES: 5 };
      atacar(ctx, atk, def, { esContra: false, bono: 0, tecnica: salto });
    }
    expect(ctx.registro!.filter((e) => e.texto.includes('el transporte')).length).toBe(2);
  });

  it('atado a la defensa: con éxito se retira, si lo suyo es la distancia', () => {
    const def = crearLuchador(maestro([huida, rayo], { defensa: 400 }), 'B', 1, 0);
    const atk = crearLuchador(rival({ ataque: 100 }), 'A', 0, 0);
    def.trabados.push(atk);
    atk.trabados.push(def);
    const ctx = contexto([atk, def]);
    atacar(ctx, atk, def, { esContra: false, bono: 0 });
    const t = ctx.registro!.map((e) => e.texto);
    expect(t.some((x) => x.includes('con Huida'))).toBe(true);
    expect(t.some((x) => x.includes('aparece a 50 m'))).toBe(true);
    expect(def.trabados).toEqual([]);
  });

  it('atado a la contra: aparece junto a quien lo atacó de lejos, con el bono', () => {
    let saltos = 0;
    for (let s = 1; s <= 6; s++) {
      const atk = crearLuchador(maestro([rayo], { id: 'a', nombre: 'Tirador', ataque: 120 }), 'A', 0, 0);
      const def = crearLuchador(maestro([salto], { id: 'd', nombre: 'Saltador', defensa: 300 }), 'B', 18, 0);
      const ctx = contexto([atk, def], s);
      atacar(ctx, atk, def, { esContra: false, bono: 0, tecnica: rayo });
      const t = ctx.registro!.map((e) => e.texto);
      if (t.some((x) => x.includes('Saltador se transporta'))) {
        saltos++;
        expect(t.some((x) => /Saltador contraataca \(\+\d+\)/.test(x))).toBe(true);
      }
    }
    expect(saltos).toBeGreaterThan(0);
  });
});

describe('Proyección y Estela de destrucción (Dominus p.58)', () => {
  const rayo = tecnica('Rayo', 'Ataque a distancia (100 metros, Proyeccion, Estela de destruccion)', { DES: 1 });

  it('lectura', () => {
    expect(efectosDe(rayo).accion).toMatchObject({ distancia: 100, proyeccion: true, estela: true });
    expect(efectosDe(tecnica('X', 'Ataque a distancia (1 kilometro)')).accion).toMatchObject({ distancia: 1000, proyeccion: false, estela: false });
    expect(efectosDe(rayo).desconocidos).toEqual([]);
  });

  it('la estela alcanza a los de la línea (aliados incluidos) y no a los de al lado; con Proyección llega al blanco', () => {
    const atk = crearLuchador(maestro([rayo]), 'A', 0, 0);
    const def = crearLuchador(rival({ id: 'b', nombre: 'Blanco' }), 'B', 10, 0);
    const enLinea = crearLuchador(rival({ id: 'c', nombre: 'Medio' }), 'B', 5, 0);
    const aliado = crearLuchador(rival({ id: 'd', nombre: 'Amigo' }), 'A', 3, 0);
    const costado = crearLuchador(rival({ id: 'e', nombre: 'Costado' }), 'B', 5, 2);
    const todos = [atk, def, enLinea, aliado, costado];
    for (const l of todos) {
      l.ataquesDeclarados = 1;
      l.planAtaques = [{ pen: 0, sinArmas: false }];
      l.ataquesRestantes = 0;
    }
    atk.ataquesRestantes = 1;
    atk.ki!.acumulado = { DES: 5 };
    const ctx: Contexto = {
      opciones: {}, rng: crearRng(1), luchadores: todos, asalto: 1, registro: [],
      ataquesEnAsalto: 0, ataquesAsaltoAnterior: 0, movimientosEnAsalto: 0, ventaja: { A: 1, B: 1 },
    };
    atacar(ctx, atk, def, { esContra: false, bono: 0, tecnica: rayo });
    const t = ctx.registro!.map((e) => e.texto);
    for (const n of ['Blanco', 'Medio', 'Amigo']) expect(t.some((x) => x.startsWith(`Maestro ataca a ${n} con Rayo`))).toBe(true);
    expect(t.some((x) => x.includes('a Costado'))).toBe(false);
    expect(t.some((x) => x.includes('viaja con su ataque 10 m hasta Blanco'))).toBe(true);
    expect(t.some((x) => x.includes('desde 10 m'))).toBe(true);
    expect(Math.hypot(atk.pos.x - def.pos.x, atk.pos.y - def.pos.y)).toBeLessThanOrEqual(2);
  });
});

describe('entereza, armadura e incrementos (Dominus p.60-62)', () => {
  it('lectura', () => {
    const ef = efectosDe(tecnica('Coraza', 'Armadura (5, Inmodificable, Armadura fisica, Lentitud), Aumentar entereza (+10), Aumentar rotura (+20)'));
    expect(ef.asalto).toMatchObject({ ta: 5, taInmodificable: true, taFisica: true, lentitud: 5, entereza: 10, rotura: 20 });
    const inc = efectosDe(tecnica('Cuerpo', 'Incremento de movimiento (+4), Incremento de habilidad (Acrobacias +100), Incremento de resistencia magica (+40), Habilidades perceptivas (Vision nocturna, Ver lo sobrenatural), Incremento de turno (+20)'));
    expect(inc.asalto).toMatchObject({ movimiento: 4, acrobacias: 100, rm: 40, visionNocturna: true, veEnergia: true, turno: 20 });
    expect(efectosDe(tecnica('Agarre', 'Capacidad incrementada (Destreza +6)')).accion.capacidad).toEqual([{ atributo: 'DES', bono: 6 }]);
    for (const t of ['Coraza', 'Cuerpo']) expect(efectosDe(tecnica(t, t === 'Coraza' ? 'Armadura (5, Inmodificable)' : 'Vision Radial')).desconocidos).toEqual([]);
  });

  it('Incremento de movimiento: de a medio por encima de 13, sin tope de Inhumanidad; Lentitud resta TM y turno', async () => {
    const { metrosTotales, turnoFinal } = await import('../src/motor/calculos');
    const { metrosPorAsalto } = await import('../src/motor/reglas');
    const l = crearLuchador(maestro([tecnica('X', 'Habilidad de ataque (+10)')], { tipoMovimiento: 9 }), 'A', 0, 0);
    const antes = turnoFinal(l);
    l.ki!.activo = { ...l.ki!.activo, movimiento: 6 };
    expect(metrosTotales(l)).toBe(metrosPorAsalto(14));
    l.ki!.activo = { ...l.ki!.activo, movimiento: 0, lentitud: 8 };
    expect(metrosTotales(l)).toBe(metrosPorAsalto(4));
    expect(turnoFinal(l)).toBe(antes - 40);
  });

  it('Armadura: física no vale contra energía; Inmodificable no baja con la reducción y queda a la mitad contra Sin armadura', async () => {
    const { absorcionContra } = await import('../src/motor/calculos');
    const { absorcion } = await import('../src/motor/reglas');
    const { SIN_KI } = await import('../src/motor/ki');
    const def = crearLuchador(rival({ ta: {} }), 'B', 1, 0);
    const atk = crearLuchador(rival(), 'A', 0, 0);
    const r = { pen: 0, sinArmas: false };
    const capa = { ...SIN_KI, ta: 6 };
    expect(absorcionContra(def, atk, 'normal', 'ENE', r, SIN_KI, { ...capa, taFisica: true })).toBe(absorcion(0));
    expect(absorcionContra(def, atk, 'normal', 'CON', r, { ...SIN_KI, reduccionTA: 4 }, capa)).toBe(absorcion(2));
    expect(absorcionContra(def, atk, 'normal', 'CON', r, { ...SIN_KI, reduccionTA: 4 }, { ...capa, taInmodificable: true })).toBe(absorcion(6));
    expect(absorcionContra(def, atk, 'normal', 'CON', r, { ...SIN_KI, sinArmadura: true }, { ...capa, taInmodificable: true })).toBe(absorcion(3));
  });

  it('Capacidad incrementada: suma a la característica sólo en los controles', async () => {
    const { caracteristicasControl } = await import('../src/motor/maniobras');
    const { SIN_KI } = await import('../src/motor/ki');
    const atk = crearLuchador(maestro([]), 'A', 0, 0);
    const def = crearLuchador(rival(), 'B', 1, 0);
    const sin = caracteristicasControl('desarmar', atk, def).atk;
    expect(caracteristicasControl('desarmar', atk, def, 0, { ...SIN_KI, capacidad: [{ atributo: 'DES', bono: 6 }] }).atk).toBe(Math.max(sin, 10 + 6));
  });

  it('Incremento de habilidad: por encima de 200 el bono va a la mitad', async () => {
    const { conIncremento } = await import('../src/motor/ki');
    expect(conIncremento(180, 100)).toBe(240);
    expect(conIncremento(250, 100)).toBe(300);
    expect(conIncremento(50, 100)).toBe(150);
  });
});

describe('efectos variados (Dominus p.63-66)', () => {
  it('Dañar energía y Ataque elemental: +10 al daño base si ya lo hacía por sí mismo', async () => {
    const { danoBase } = await import('../src/motor/calculos');
    const { SIN_KI } = await import('../src/motor/ki');
    const def = crearLuchador(rival(), 'B', 1, 0);
    const comun = crearLuchador(rival(), 'A', 0, 0);
    const fuego = crearLuchador(rival({ tipoAtaque: 'CAL' }), 'A', 0, 0);
    const base = danoBase(comun, def, false, undefined, SIN_KI);
    expect(danoBase(comun, def, false, undefined, { ...SIN_KI, elemento: 'CAL' })).toBe(base);
    expect(danoBase(fuego, def, false, undefined, { ...SIN_KI, elemento: 'CAL' })).toBe(base + 10);
    expect(danoBase(comun, def, false, undefined, { ...SIN_KI, danaEnergia: true })).toBe(base);
  });

  it('Regeneración: el escudo mantenido recupera al empezar el asalto, sin pasar su resistencia', () => {
    const t = tecnica('Muro', 'Escudo de energia (300, Regeneracion 100)', { DES: 1 }, { mantenimiento: 1 });
    expect(efectosDe(t).asalto).toMatchObject({ escudo: 300, regeneraEscudo: 100 });
    expect(efectosDe(tecnica('P', 'Acumulacion (200, Regeneracion 50)')).asalto).toMatchObject({ pantalla: 200, regeneraPantalla: 50 });
    const l = crearLuchador(maestro([t]), 'A', 0, 0);
    l.ki!.acumulado = { DES: 5 };
    ejecutar(l, t);
    l.escudoKi = 120;
    empezarAsalto(l, decision(), 0, 2);
    expect(l.escudoKi).toBe(220);
    empezarAsalto(l, decision(), 0, 3);
    expect(l.escudoKi).toBe(300);
  });

  it('Presa existencial: el apresado controla con su Poder; la técnica mantenida sostiene la presa', async () => {
    const { caracteristicasControl } = await import('../src/motor/maniobras');
    const { SIN_KI, apresamientoMantenido } = await import('../src/motor/ki');
    const atk = crearLuchador(maestro([tecnica('X', 'Habilidad de ataque (+10)')]), 'A', 0, 0);
    const def = crearLuchador(rival({ atributos: { FUE: 12, AGI: 12, POD: 3 } }), 'B', 1, 0);
    const ki = { ...SIN_KI, apresamiento: 12 };
    expect(caracteristicasControl('presa', atk, def, 12, ki).def).toBe(12);
    expect(caracteristicasControl('presa', atk, def, 12, { ...ki, presaExistencial: true }).def).toBe(3);
    expect(efectosDe(tecnica('Lazo', 'Apresamiento (12, Presa existencial)')).accion).toMatchObject({ apresamiento: 12, presaExistencial: true });
    const lazo = tecnica('Lazo', 'Apresamiento (14)', { DES: 1 }, { mantenimiento: 1 });
    const captor = crearLuchador(maestro([lazo]), 'A', 0, 0);
    captor.ki!.acumulado = { DES: 5 };
    ejecutar(captor, lazo);
    expect(apresamientoMantenido(captor)).toBe(14);
  });

  it('Choque físico: con disparos paralelos, la técnica intercepta una descarga de Ki', () => {
    const rayo = tecnica('Rayo', 'Ataque a distancia (50 metros)', { DES: 1 });
    const choque = tecnica('Puño', 'Choque fisico, Aumento de dano (+100)', { DES: 1 });
    let chocan = 0;
    for (let semilla = 1; semilla <= 10; semilla++) {
      const r = simularCombate(
        [maestro([rayo], { id: 'a', nombre: 'Tirador', turno: 100, ataque: 150 })],
        [maestro([choque], { id: 'b', nombre: 'Puño', turno: 100, ataque: 200 })],
        { semilla, registrar: true, distanciaInicial: 20, escenario: { disparosParalelos: true }, maxAsaltos: 3 },
      );
      if (r.registro!.some((e) => e.texto.includes('intercepta con Puño'))) chocan++;
    }
    expect(chocan).toBeGreaterThan(0);
  });
});

describe('ventajas de Aumento de daño, Interrupción, Reflectar e Intangibilidad (Dominus p.54, p.69-71)', () => {
  it('lectura', () => {
    expect(efectosDe(tecnica('A', 'Aumento de dano (+50, Sacrificio vital doble, Dano limite)')).accion).toMatchObject({ dano: 50, sacrificioVital: 2, danoLimite: true });
    expect(efectosDe(tecnica('I', 'Interrupcion (+40, Ki, Magia)')).accion).toMatchObject({ interrumpe: true, interrupcion: 40, interrumpeKi: true, interrumpeMagia: true });
    expect(efectosDe(tecnica('I', 'Interrupcion (+40, Magia)')).accion).toMatchObject({ interrumpeKi: false, interrumpeMagia: true });
    expect(efectosDe(tecnica('I', 'Interrupcion (+40)')).accion.interrumpeKi).toBe(true);
    expect(efectosDe(tecnica('R', 'Reflectar el ataque (Eleccion del blanco, Reflectar habilidades esotericas)')).accion).toMatchObject({ reflectar: true, reflectarEligeBlanco: true, reflectarEsoterico: true });
    expect(efectosDe(tecnica('F', 'Intangibilidad (Presencia extendida, Fusion)')).asalto).toMatchObject({ intangible: true, intangibleOtros: 5, fusion: true });
  });

  it('Daño límite suma los PV perdidos', async () => {
    const { danoBase } = await import('../src/motor/calculos');
    const { SIN_KI } = await import('../src/motor/ki');
    const atk = crearLuchador(rival(), 'A', 0, 0);
    const def = crearLuchador(rival(), 'B', 1, 0);
    const base = danoBase(atk, def, false, undefined, { ...SIN_KI, danoLimite: true });
    atk.pv -= 80;
    expect(danoBase(atk, def, false, undefined, { ...SIN_KI, danoLimite: true })).toBe(base + 80);
  });

  it('Sacrificio vital: la IA sacrifica PV si el golpe lo vale, y suma al daño', () => {
    const t = tecnica('Sangre', 'Aumento de dano (+10, Sacrificio vital doble)', { DES: 1 });
    const atk = crearLuchador(maestro([t], { ataque: 300, pv: 400 }), 'A', 0, 0);
    const def = crearLuchador(rival({ defensa: 20, pv: 600 }), 'B', 1, 0);
    for (const l of [atk, def]) {
      l.ataquesDeclarados = 1;
      l.planAtaques = [{ pen: 0, sinArmas: false }];
      l.ataquesRestantes = 1;
    }
    def.ataquesRestantes = 0;
    atk.ki!.acumulado = { DES: 5 };
    const ctx: Contexto = {
      opciones: {}, rng: crearRng(1), luchadores: [atk, def], asalto: 1, registro: [],
      ataquesEnAsalto: 0, ataquesAsaltoAnterior: 0, movimientosEnAsalto: 0, ventaja: { A: 1, B: 1 },
    };
    atacar(ctx, atk, def, { esContra: false, bono: 0, tecnica: t });
    const linea = ctx.registro!.map((e) => e.texto).find((x) => x.includes('sacrifica'));
    expect(linea).toBeDefined();
    const [, pv, bono] = /sacrifica (\d+) PV \(\+(\d+)/.exec(linea!)!;
    expect(Number(bono)).toBe(2 * Number(pv));
    expect(atk.pv).toBe(400 - Number(pv));
  });
});

describe('Reflectar con Elección del blanco, Afectar a otros y Fusión (Dominus p.69-71)', () => {
  const ctxCon = (luchadores: ReturnType<typeof crearLuchador>[]): Contexto => ({
    opciones: {}, rng: crearRng(1), luchadores, asalto: 1, registro: [],
    ataquesEnAsalto: 0, ataquesAsaltoAnterior: 0, movimientosEnAsalto: 0, ventaja: { A: 1, B: 1 },
  });

  it('el reflejo va contra el enemigo contra el que más rinde', async () => {
    const { blancoDelReflejo } = await import('../src/motor/ia');
    const yo = crearLuchador(maestro([tecnica('X', 'Habilidad de ataque (+10)')]), 'A', 0, 0);
    const duro = crearLuchador(rival({ id: 'd', nombre: 'Duro', defensa: 400 }), 'B', 1, 0);
    const blando = crearLuchador(rival({ id: 'b', nombre: 'Blando', defensa: 0 }), 'B', 2, 0);
    expect(blancoDelReflejo(ctxCon([yo, duro, blando]), yo, duro, 250, {})).toBe(blando);
  });

  it('Afectar a otros: aliados amenazados, hasta la Presencia que alcanza', async () => {
    const { aliadosIntangibles } = await import('../src/motor/ia');
    const yo = crearLuchador(maestro([tecnica('X', 'Habilidad de ataque (+10)')], { presencia: 60 }), 'A', 0, 0);
    const a1 = crearLuchador(rival({ id: 'a1', nombre: 'A1', presencia: 30 }), 'A', 1, 0);
    const a2 = crearLuchador(rival({ id: 'a2', nombre: 'A2', presencia: 30 }), 'A', 1, 1);
    const a3 = crearLuchador(rival({ id: 'a3', nombre: 'A3', presencia: 30 }), 'A', 1, 2);
    const e = crearLuchador(rival({ id: 'e', nombre: 'E' }), 'B', 2, 1);
    const elegidos = aliadosIntangibles(ctxCon([yo, a1, a2, a3, e]), yo, 60);
    expect(elegidos.length).toBe(2);
  });

  it('Fusión: el que saca menos recibe la diferencia con crítico, y la intangibilidad termina', async () => {
    const { fusion } = await import('../src/motor/combate-ki');
    const t = tecnica('Fantasma', 'Intangibilidad (Fusion)', { DES: 1 }, { mantenimiento: 1 });
    const atk = crearLuchador(maestro([t], { presencia: 200 }), 'A', 0, 0);
    const def = crearLuchador(rival({ presencia: 10 }), 'B', 1, 0);
    atk.ki!.acumulado = { DES: 5 };
    ejecutar(atk, t);
    const golpes: [string, number][] = [];
    const motor = {
      log: () => {}, perderPv: (_c: unknown, _a: unknown, l: { ficha: { nombre: string } }, pv: number) => golpes.push([l.ficha.nombre, pv]),
      critico: (_c: unknown, _a: unknown, l: { ficha: { nombre: string } }) => golpes.push([l.ficha.nombre, -1]),
    } as never;
    fusion(motor, ctxCon([atk, def]), atk, def);
    expect(golpes[0][0]).toBe('Rival');
    expect(golpes[0][1]).toBeGreaterThan(100);
    expect(golpes[1]).toEqual(['Rival', -1]);
    expect(atk.ki!.activo.intangible).toBe(false);
    expect(atk.ki!.mantenidas.size).toBe(0);
  });
});

describe('desventajas que faltaban (Dominus p.71-75)', () => {
  it('lectura: todas se reconocen; las de ambientación no hacen nada', () => {
    const ef = efectosDe(tecnica('X', 'Habilidad de ataque (+50), Circunstancia de combate (Derribado, Espalda), Atada a un arma, Compleja, Perdida del arma, Sacrificio (-50 PV), Sin defensa, Sobrecarga (2), Usos limitados (3), Atadura elemental (Hacia un elemento), Exterminador (Contra seres humanoides), Condiciones (Nocturno)'));
    expect(ef.desconocidos).toEqual([]);
    expect(ef.desventajas).toMatchObject({ circunstanciasCombate: ['derribado', 'espalda'], atadaArma: true, compleja: true, perdidaArma: true, sacrificioPv: 50, sinDefensa: true, sobrecarga: 2, usos: 3 });
    const d = efectosDe(tecnica('D', 'Habilidad de parada (+50), Defensa especializada (Solo contra proyectiles), Predeterminacion, Tecnica final, Sacrificio de Caracteristicas (Fuerza), Tecnica mantenida (Coraza)')).desventajas;
    expect(d).toMatchObject({ defensaContra: 'proyectil', predeterminada: true, final: true, sacrificioAtributo: 'FUE', requiereMantenida: 'coraza' });
    expect(efectosDe(tecnica('S', 'Habilidad de ataque (+10), Sacrificio (Completo)')).desventajas.sacrificioPv).toBe(Infinity);
  });

  it('Usos limitados, Sobrecarga, Atada a un arma, Sin defensa y Técnica mantenida limitan cuándo se puede', () => {
    const usos = tecnica('U', 'Habilidad de ataque (+10), Usos limitados (1)', { DES: 1 });
    const l = crearLuchador(maestro([usos]), 'A', 0, 0);
    l.ki!.acumulado = { DES: 5 };
    expect(puedeEjecutar(l, usos)).toBe(true);
    ejecutar(l, usos);
    expect(puedeEjecutar(l, usos)).toBe(false);

    const carga = tecnica('C', 'Habilidad de ataque (+10), Sobrecarga (1)', { DES: 1 });
    const otra = tecnica('O', 'Habilidad de ataque (+10)', { DES: 1 });
    const s = crearLuchador(maestro([carga, otra]), 'A', 0, 0);
    s.ki!.acumulado = { DES: 5 };
    s.ki!.asalto = 1;
    ejecutar(s, carga);
    s.ki!.acumulado = { DES: 5 };
    expect(puedeEjecutar(s, otra)).toBe(false);
    s.ki!.asalto = 3;
    expect(puedeEjecutar(s, otra)).toBe(true);

    const arma = tecnica('A', 'Habilidad de ataque (+10), Atada a un arma', { DES: 1 });
    const a = crearLuchador(maestro([arma]), 'A', 0, 0);
    a.ki!.acumulado = { DES: 5 };
    expect(puedeEjecutar(a, arma)).toBe(true);
    a.desarmado = true;
    expect(puedeEjecutar(a, arma)).toBe(false);

    const guardia = tecnica('G', 'Habilidad de ataque (+10), Sin defensa', { DES: 1 });
    const g = crearLuchador(maestro([guardia]), 'A', 0, 0);
    g.ki!.acumulado = { DES: 5 };
    g.defensasHechas = 1;
    expect(puedeEjecutar(g, guardia)).toBe(false);

    const coraza = tecnica('Coraza', 'Armadura (4)', { CON: 1 }, { mantenimiento: 1 });
    const golpe = tecnica('G2', 'Habilidad de ataque (+10), Tecnica mantenida (Coraza)', { DES: 1 });
    const m = crearLuchador(maestro([coraza, golpe]), 'A', 0, 0);
    m.ki!.acumulado = { DES: 5, CON: 5 };
    expect(puedeEjecutar(m, golpe)).toBe(false);
    ejecutar(m, coraza);
    expect(puedeEjecutar(m, golpe)).toBe(true);
  });

  it('Sacrificio y Sacrificio de Características se pagan al ejecutarla', () => {
    const t = tecnica('S', 'Habilidad de ataque (+10), Sacrificio (-30 PV), Sacrificio de Caracteristicas (Fuerza)', { DES: 1 });
    const l = crearLuchador(maestro([t]), 'A', 0, 0);
    l.ki!.acumulado = { DES: 5 };
    ejecutar(l, t);
    expect(l.pv).toBe(170);
    expect(l.ficha.atributos!.FUE).toBe(8);
  });

  it('Técnica final: muere al terminar el ataque; Sin defensa: no se defiende ese asalto', () => {
    const fin = tecnica('Fin', 'Habilidad de ataque (+100), Tecnica final, Sin defensa', { DES: 1 });
    const atk = crearLuchador(maestro([fin]), 'A', 0, 0);
    const def = crearLuchador(rival(), 'B', 1, 0);
    for (const l of [atk, def]) {
      l.ataquesDeclarados = 1;
      l.planAtaques = [{ pen: 0, sinArmas: false }];
      l.ataquesRestantes = 1;
    }
    atk.ki!.acumulado = { DES: 5 };
    atk.ki!.asalto = 1;
    const ctx: Contexto = {
      opciones: {}, rng: crearRng(1), luchadores: [atk, def], asalto: 1, registro: [],
      ataquesEnAsalto: 0, ataquesAsaltoAnterior: 0, movimientosEnAsalto: 0, ventaja: { A: 1, B: 1 },
    };
    atacar(ctx, atk, def, { esContra: false, bono: 0, tecnica: fin });
    expect(atk.estado).toBe('muerto');
  });
});

describe('Espejismo y Armas físicas de Ki (Dominus p.63-66)', () => {
  it('lectura, también con el valor en el nombre como en el libro', () => {
    const e = efectosDe({ nombre: 'E', nivel: 2, cm: 0, coste: {}, mantenimiento: 0, combinable: false, efectos: leerEfectosTecnica('Espejismo 4 (Detección dificultad: Inhumano, Ilusión Fantasmal RP 180), Armas físicas de Ki calidad +10 (1 Arma adicional), Armadura 4 (Inmodificable)') });
    expect(e.desconocidos).toEqual([]);
    expect(e.asalto).toMatchObject({ espejismos: 4, espejismoIndeteccion: 320, espejismoFantasmal: 180, armaKi: 10, ta: 4, taInmodificable: true });
  });

  it('Espejismo: los ataques de quien no las descubre a veces van a una ilusión; quien ve la energía, no', () => {
    const t = tecnica('Sombras', 'Espejismo (4)', { DES: 1 });
    let ilusiones = 0;
    let conVision = 0;
    for (let s = 1; s <= 8; s++) {
      for (const vision of [false, true]) {
        const r = simularCombate(
          [maestro([t], { id: 'm', nombre: 'Mago' })],
          [rival({ id: 'r', nombre: 'Rival', rasgos: vision ? { ventajas: ['Ver lo sobrenatural'] } : {} })],
          { semilla: s, registrar: true, maxAsaltos: 3 },
        );
        const n = r.registro!.filter((x) => x.texto.includes('ataca a una ilusión de Mago')).length;
        if (vision) conVision += n;
        else ilusiones += n;
      }
    }
    expect(ilusiones).toBeGreaterThan(0);
    expect(conVision).toBe(0);
  });

  it('Armas físicas de Ki: desarmado, vuelve a empuñar su arma con la calidad de la técnica', async () => {
    const { fichaConArmaKi } = await import('../src/motor/rotura');
    const l = crearLuchador(maestro([tecnica('X', 'Habilidad de ataque (+10)')], { arma: { nombre: 'Espada', calidad: 0 } }), 'A', 0, 0);
    const armado = l.ficha;
    l.fichaArmada = armado;
    l.desarmado = true;
    const f = fichaConArmaKi(l, { armaKi: 10, armasAdicionales: 0, armaKiProyectiles: false })!;
    expect([f.ataque, f.danoBase, f.arma!.calidad]).toEqual([armado.ataque + 10, armado.danoBase + 20, 10]);
  });

  it('ventajas: Armas adicionales empuña dos iguales (segunda arma); Proyectiles, sus armas a distancia con munición ilimitada (Dominus p.63)', async () => {
    const { capacidades } = await import('../src/motor/rasgos');
    const { fichaConArmaKi } = await import('../src/motor/rotura');
    const l = crearLuchador(maestro([tecnica('X', 'Habilidad de ataque (+10)')], {
      arma: { nombre: 'Espada', calidad: 0 },
      armasDistancia: [{ nombre: 'Arco largo', clase: 'disparo', ataque: 100, danoBase: 40, tipoAtaque: 'PEN', alcance: 100, municion: 5 }],
    }), 'A', 0, 0);
    const dos = fichaConArmaKi(l, { armaKi: 5, armasAdicionales: 1, armaKiProyectiles: false })!;
    expect(dos.arma!.nombre).toBe('Espada y Espada');
    expect(capacidades(dos).extras.some((e) => e.nombre.startsWith('Segunda arma'))).toBe(true);
    const arco = fichaConArmaKi(l, { armaKi: 5, armasAdicionales: 0, armaKiProyectiles: true })!;
    expect(arco.armasDistancia![0]).toMatchObject({ calidad: 5, ataque: 105, danoBase: 50, municion: Infinity });
    const { efectosDe } = await import('../src/motor/ki');
    const m = efectosDe(tecnica('Y', 'Armas físicas de Ki (+10, Armas adicionales 2, Proyectiles)'));
    expect([m.asalto.armaKi, m.asalto.armasAdicionales, m.asalto.armaKiProyectiles]).toEqual([10, 2, true]);
  });
});

describe('efectos escritos como en el libro', () => {
  const leer = (s: string) => efectosDe({ nombre: 'x', nivel: 1, cm: 0, coste: {}, mantenimiento: 0, combinable: false, efectos: leerEfectosTecnica(s) });
  it('valor en el nombre, alias, dificultades, nivel y propiedades', () => {
    const a = leer('Habilidad de Ataque +50, Apuntar -50, Turno +50, Critico +75, Camuflar ataque Inhumano, Ataque indirecto Nv 3, Daño x3, Destruir armadura -3 TA, Mantenida, Combinable');
    expect(a.desconocidos).toEqual([]);
    expect(a.accion).toMatchObject({ ataque: 50, precision: 50, critico: 75, camuflar: 320, indirecto: true, multDano: 3, reduccionTA: 3 });
    expect(a.asalto.turno).toBe(50);
    const d = leer('Ataque Predeterminado Zen, Estado sobrenatural RF 160 (Terror), Escudo de energía 400 PV, Apresamiento Presa 12');
    expect(d.desconocidos).toEqual([]);
    expect([d.accion.ataqueFijo, d.accion.estados[0]?.rf, d.asalto.escudo, d.accion.apresamiento]).toEqual([440, 160, 400, 12]);
  });
});

describe('rotura en la IA (Core p.93)', () => {
  it('pRompe es la chance de d10 + rotura sobre la entereza', async () => {
    const { pRompe } = await import('../src/motor/rotura');
    expect([pRompe(5, 15), pRompe(5, 10), pRompe(20, 10), pRompe(0, 30)]).toEqual([0, 0.5, 1, 0]);
  });
});
