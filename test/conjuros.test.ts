// Magia en combate, parte 2: los conjuros de Stéphan (Luz, Fuego, Guerra y libres), caso por caso.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Ficha } from '../src/motor/modelo';
import { crearLuchador, simularCombate } from '../src/motor/combate';
import { absorcionContra, ataqueFinal, cegueraContra, defensaFinal, inmuneAlGolpe, penAccion, reduccionFuego, turnoFinal } from '../src/motor/calculos';
import { bonoFrialdad } from '../src/motor/reglas';
import { CATALOGO, conjurosDe, conocidos, gradosPosibles, sinSimular } from '../src/motor/conjuros';
import { GRIMORIO } from '../src/motor/grimorio';
import { bendecir, costeConjuro, danoLlamas, empezarAsaltoMagia, estadoLlamas, lanzar, puedeLanzar, quitarBendicion, rmDe } from '../src/motor/magia';
import { blancosConjuro } from '../src/motor/efectos';
import { golpeDeConjuro } from '../src/motor/magia';
import { imponer } from '../src/motor/condiciones';

const conjuro = (n: string) => CATALOGO.find((c) => c.nombre === n)!;
const abel: Ficha[] = JSON.parse(readFileSync(new URL('../ejemplos/arquetipos-abel.json', import.meta.url), 'utf8')).fichas;
const soldado = abel.find((f) => f.id === 'soldado')!;

const mago = (magia: Partial<NonNullable<Ficha['magia']>>, extra: Partial<Ficha> = {}): Ficha => ({
  id: 'mago', nombre: 'Mago', pv: 300, turno: 70, ataque: 20, defensa: 30, danoBase: 30, tipoAtaque: 'CON',
  ta: {}, rf: 40, constitucion: 6, tipoMovimiento: 6, inteligencia: 11, resistirDolor: 60, rm: 80,
  magia: { zeon: 3000, act: 150, proyeccion: 150, vias: {}, ...magia } as NonNullable<Ficha['magia']>,
  ...extra,
});

describe('el grimorio (generado de la planilla)', () => {
  it('todas las vías, sub-vías y libre acceso, con zeon e Inteligencia en los cuatro grados', () => {
    expect(GRIMORIO.length).toBeGreaterThan(600);
    for (const v of ['luz', 'oscuridad', 'fuego', 'agua', 'aire', 'tierra', 'creacion', 'destruccion', 'esencia', 'ilusion', 'nigromancia', 'guerra', 'libre acceso'])
      expect(GRIMORIO.some((e) => e.via === v)).toBe(true);
    for (const e of GRIMORIO) expect(e.grados.every((g) => g.zeon > 0 && g.int > 0)).toBe(true);
  });

  it('el catálogo toma sus números del grimorio y corrige donde manda el manual', () => {
    const bola = conjuro('Bola de Fuego');
    expect(bola.grados.map((g) => [g.zeon, g.int, g.dano, g.area])).toEqual([[50, 6, 50, 5], [100, 9, 100, 25], [160, 12, 140, 80], [250, 15, 160, 150]]);
    expect(conjuro('Incinerar').grados[2].int).toBe(14);
    expect(conjuro('Incinerar').grados[0].mantenimiento).toBeUndefined();
  });

  it('Stéphan conoce todo su grimorio; el simulador usa los de combate', () => {
    const m = { zeon: 1, act: 1, proyeccion: 1, vias: { Fuego: 80, Luz: 40 }, subvias: { Fuego: 'Guerra', Luz: 'Conocimiento' }, libres: ['Curar heridas', 'Invisibilidad'] };
    const sabe = conocidos(m).map((e) => e.nombre);
    expect(sabe).toEqual(expect.arrayContaining(['Bola de fuego', 'Tormenta de fuego', 'Campeón', 'Saber debilidad', 'Descarga de luz', 'Curar heridas', 'Invisibilidad']));
    expect(sabe).not.toContain('Maestro de la guerra');
    expect(sinSimular(m).map((e) => e.nombre)).toEqual(expect.arrayContaining(['Espía de luz', 'Saber debilidad']));
    expect(sinSimular(m).map((e) => e.nombre)).not.toContain('Invisibilidad');
    expect(conjurosDe(m).length + sinSimular(m).length).toBe(sabe.length);
  });
});

describe('qué conjuros conoce', () => {
  it('la sub-vía de Guerra sólo si la eligió para Fuego (Arcana p.32)', () => {
    const sin = conjurosDe({ zeon: 1, act: 1, proyeccion: 1, vias: { Fuego: 80 } }).map((c) => c.nombre);
    const con = conjurosDe({ zeon: 1, act: 1, proyeccion: 1, vias: { Fuego: 80 }, subvias: { Fuego: 'Guerra' } }).map((c) => c.nombre);
    expect(sin).not.toContain('Campeón');
    expect(con).toEqual(expect.arrayContaining(['Ira Ancestral', 'Velocidad en la Batalla', 'Destrucción Desencadenada', 'Protección Final', 'Campeón']));
  });

  it('Conjuro Especialista: +1 a la Inteligencia para ese conjuro (Arcana p.30)', () => {
    const m = { zeon: 1, act: 1, proyeccion: 1, vias: { Fuego: 80 }, especialista: ['Incinerar'] };
    expect(gradosPosibles(conjuro('Incinerar'), 11)).toEqual([0]);
    expect(gradosPosibles(conjuro('Incinerar'), 11, m)).toEqual([0, 1]);
    expect(gradosPosibles(conjuro('Crítico Directo'), 11, m)).toEqual([0, 1]);
  });

  it('RM: la de la planilla, o la Presencia más el bono de Poder', () => {
    expect(rmDe(crearLuchador(mago({}), 'A', 0, 0))).toBe(80);
    const s = crearLuchador(soldado, 'B', 0, 0);
    expect(rmDe(s)).toBe(s.ficha.presencia ?? s.ficha.rf);
  });
});

describe('Control del Espacio (Arcana p.28)', () => {
  it('cuesta 10 de zeon más y deja afuera a los suyos', () => {
    const c = conjuro('Bola de Fuego');
    expect(costeConjuro(c.grados[1], true)).toBe(110);
    const l = crearLuchador(mago({ controlDelEspacio: true }), 'A', 0, 0);
    const aliado = crearLuchador(soldado, 'A', 20, 0);
    const e1 = crearLuchador(soldado, 'B', 21, 0);
    const e2 = crearLuchador(soldado, 'B', 22, 0);
    const ctx = { luchadores: [l, aliado, e1, e2] } as never;
    expect(blancosConjuro(ctx, l, e1, c, c.grados[0], false)).toEqual([aliado, e1, e2]);
    expect(blancosConjuro(ctx, l, e1, c, c.grados[0], true)).toEqual([e1, e2]);
  });
});

describe('beneficios de Guerra y de Fuego', () => {
  it('suman al ataque, al turno, al daño y a la TA; el mismo conjuro de dos fuentes no se acumula', () => {
    const l = crearLuchador(soldado, 'A', 0, 0);
    const rival = crearLuchador(soldado, 'B', 1, 0);
    const m1 = crearLuchador(mago({}), 'A', 5, 0);
    const m2 = crearLuchador(mago({}), 'A', 6, 0);
    const [at, tu, abs] = [ataqueFinal(l, rival), turnoFinal(l), absorcionContra(l, rival)];
    bendecir(l, m1, conjuro('Ira Ancestral'), { ataque: 10, ira: true });
    bendecir(l, m1, conjuro('Campeón'), { toda: 10, dano: 10, turno: 10, ta: 2 });
    bendecir(l, m2, conjuro('Campeón'), { toda: 10, dano: 10, turno: 10, ta: 2 });
    expect(ataqueFinal(l, rival)).toBe(at + 20);
    expect(turnoFinal(l)).toBe(tu + 10);
    expect(absorcionContra(l, rival)).toBe(abs + 20);
    quitarBendicion(l, m1, conjuro('Campeón'));
    quitarBendicion(l, m2, conjuro('Campeón'));
    quitarBendicion(l, m1, conjuro('Ira Ancestral'));
    expect([ataqueFinal(l, rival), turnoFinal(l), l.bono]).toEqual([at, tu, null]);
  });

  it('Interrupción de Magia (Ki, Dominus p.69): si falla la RF pierde los conjuros mantenidos', async () => {
    const { interrupcion } = await import('../src/motor/combate-ki');
    const m = crearLuchador(mago({ libres: ['Arma Ígnea'] }), 'A', 0, 0);
    const k = crearLuchador(soldado, 'A', 1, 0);
    m.magia!.acumulado = 1000;
    lanzar(m, conjuro('Arma Ígnea'), 0, { blancos: [k] });
    const motor = { tirarRf: () => ({ falla: true, fracaso: 50 }), log: () => {} } as never;
    interrupcion(motor, {} as never, m, 100, { interrumpeKi: true, interrumpeMagia: false });
    expect(m.magia!.mantenidos.length).toBe(1);
    interrupcion(motor, {} as never, m, 100, { interrumpeKi: false, interrumpeMagia: true });
    expect([m.magia!.mantenidos.length, k.bono]).toEqual([0, null]);
  });

  it('un ejemplar por blanco: Arma Ígnea a dos aliados; muerto el blanco, no se paga más', () => {
    const m = crearLuchador(mago({ libres: ['Arma Ígnea', 'Campeón'] }), 'A', 0, 0);
    const [k1, k2] = [crearLuchador(soldado, 'A', 1, 0), crearLuchador(soldado, 'A', 2, 0)];
    m.magia!.acumulado = 1000;
    const arma = conjuro('Arma Ígnea');
    expect(puedeLanzar(m, arma, 0)).toBe(true);
    lanzar(m, arma, 0, { blancos: [k1] });
    expect(puedeLanzar(m, arma, 0)).toBe(true);
    lanzar(m, arma, 0, { blancos: [k2] });
    expect([k1.bono?.tipoArma, k2.bono?.tipoArma, m.magia!.mantenidos.length]).toEqual(['CAL', 'CAL', 2]);
    k1.estado = 'muerto';
    empezarAsaltoMagia(m, false);
    expect(m.magia!.mantenidos.map((x) => x.blancos![0])).toEqual([k2]);
  });

  it('Cuerpo a Fuego: inmune a lo que no es energía, frío o agua; un conjuro de calor no lo daña', () => {
    const l = crearLuchador(soldado, 'A', 0, 0);
    const s = crearLuchador(soldado, 'B', 1, 0);
    const m = crearLuchador(mago({}), 'B', 3, 0);
    bendecir(l, m, conjuro('Cuerpo a Fuego'), { cuerpoFuego: true });
    expect(inmuneAlGolpe(l, s, 'FIL')).toBe(true);
    expect(inmuneAlGolpe(l, s, 'ENE')).toBe(false);
    expect(inmuneAlGolpe(l, s, 'FRI')).toBe(false);
    const bola = conjuro('Bola de Fuego');
    expect(inmuneAlGolpe(l, m, 'CAL', golpeDeConjuro(bola, bola.grados[0]))).toBe(true);
  });
});

describe('Tabla 76: En llamas (Core p.236)', () => {
  it('estados y PV por asalto; la armadura contra calor resta 2 por TA salvo calcinado', () => {
    expect([estadoLlamas(99), estadoLlamas(100), estadoLlamas(180), estadoLlamas(240), estadoLlamas(300)]).toEqual(['', 'prendido', 'ardiendo', 'en llamas', 'calcinado']);
    const l = crearLuchador({ ...soldado, ta: { CAL: 2 } }, 'A', 0, 0);
    l.llamas = 150;
    expect(danoLlamas(l)).toBe(0);
    l.llamas = 200;
    expect(danoLlamas(l)).toBe(6);
    l.llamas = 250;
    expect(danoLlamas(l)).toBe(21);
    l.llamas = 320;
    expect(danoLlamas(l)).toBe(50);
  });

  it('en combate, el fuego prende y quema cada asalto', () => {
    const textos: string[] = [];
    for (let semilla = 1; semilla <= 30 && !textos.some((x) => / se quema /.test(x)); semilla++) {
      const r = simularCombate([mago({ vias: { Fuego: 30 } })], [{ ...soldado, pv: 2000 }], { semilla, registrar: true, distanciaInicial: 20, maxAsaltos: 8 });
      textos.push(...r.registro!.map((x) => x.texto));
    }
    expect(textos.some((x) => /queda (prendido|ardiendo|en llamas|calcinado) \(Tabla 76/.test(x))).toBe(true);
    expect(textos.some((x) => / se quema \(/.test(x))).toBe(true);
  });
});

describe('anímicos y automáticos', () => {
  it('un anímico es invisible: sin ver la magia se defiende cegado (Core p.122)', () => {
    const l = crearLuchador(mago({}), 'A', 0, 0);
    // Esquivando, para que no cuente que la energía no se para (Core p.100).
    const s = crearLuchador({ ...soldado, tipoDefensa: 'esquiva' }, 'B', 10, 0);
    const c = conjuro('Crítico Directo');
    const normal = defensaFinal(s, l, { kiAtk: golpeDeConjuro(conjuro('Descarga de Luz'), conjuro('Descarga de Luz').grados[0]) });
    const ciego = defensaFinal(s, l, { kiAtk: golpeDeConjuro(c, c.grados[0]) });
    expect(ciego).toBeLessThan(normal);
  });

  it('Flash Cegador: ceguera por tantos asaltos como decenas de fracaso', () => {
    let visto = false;
    for (let semilla = 1; semilla <= 20 && !visto; semilla++) {
      const r = simularCombate([mago({ libres: ['Flash Cegador'] })], [0, 1, 2].map((i) => ({ ...soldado, id: `s${i}`, nombre: `S${i}` })), { semilla, registrar: true, distanciaInicial: 4, maxAsaltos: 4 });
      const t = r.registro!.map((x) => x.texto);
      visto = t.some((x) => /queda ciego \d+ asalto/.test(x)) && t.some((x) => /falla la RF contra el Flash Cegador/.test(x));
    }
    expect(visto).toBe(true);
    const l = crearLuchador(soldado, 'A', 0, 0);
    imponer(l, 'ceguera', { nivel: 2, asaltos: 2, destello: true });
    expect(cegueraContra(l, crearLuchador(soldado, 'B', 1, 0)).nivel).toBe(2);
  });

  it('Tormenta de Fuego: ataca desde el asalto siguiente a quienes están en la zona', () => {
    let visto = false;
    for (let semilla = 1; semilla <= 20 && !visto; semilla++) {
      const r = simularCombate([mago({ libres: ['Tormenta de Fuego'] })], [0, 1, 2].map((i) => ({ ...soldado, id: `s${i}`, nombre: `S${i}` })), { semilla, registrar: true, distanciaInicial: 30, maxAsaltos: 5 });
      const t = r.registro!.map((x) => x.texto);
      const lanza = t.findIndex((x) => /lanza Tormenta de Fuego/.test(x));
      visto = lanza >= 0 && t.slice(lanza).some((x) => /Tormenta de Fuego de Mago ataca a S\d/.test(x));
    }
    expect(visto).toBe(true);
  });

  it('Crítico Directo y Consumir Esencia: RM y después su efecto', () => {
    const textos: string[] = [];
    for (let semilla = 1; semilla <= 40; semilla++) {
      const r = simularCombate([mago({ libres: ['Crítico Directo', 'Consumir Esencia'] }, { inteligencia: 12 })], [{ ...soldado, pv: 400 }], { semilla, registrar: true, distanciaInicial: 3, maxAsaltos: 5 });
      textos.push(...r.registro!.map((x) => x.texto));
    }
    expect(textos.some((x) => /falla la RM contra (Crítico Directo|Consumir Esencia)/.test(x))).toBe(true);
  });
});

describe('parte 3: el resto de los conjuros de Stéphan', () => {
  const soldados = (n: number) => Array.from({ length: n }, (_, i) => ({ ...soldado, id: `s${i}`, nombre: `S${i}` }));
  const buscar = (re: RegExp, f: (semilla: number) => string[], hasta = 40) => {
    for (let semilla = 1; semilla <= hasta; semilla++) if (f(semilla).some((x) => re.test(x))) return true;
    return false;
  };

  it('Frialdad (Tabla 13) y Moral: el bono por tramos; Moral suma Frialdad a los aliados', () => {
    expect([bonoFrialdad(30), bonoFrialdad(40), bonoFrialdad(130), bonoFrialdad(320)]).toEqual([0, 5, 15, 40]);
    const l = crearLuchador(soldado, 'A', 0, 0);
    bendecir(l, crearLuchador(mago({}), 'A', 1, 0), conjuro('Moral'), { frialdad: 40 });
    expect(l.bono?.frialdad).toBe(40);
  });

  it('Éxtasis: −20 a toda acción en lugar de los demás negativos, salvo los físicos', () => {
    const l = crearLuchador(soldado, 'A', 0, 0);
    l.penDolor = 90;
    l.penFisico = 10;
    expect(penAccion(l)).toBe(100);
    l.extasis = true;
    expect(penAccion(l)).toBe(30);
  });

  it('Modificar el Tamaño: achicarse hace que los grandes le peguen con −10 o −20 (Tabla 43)', () => {
    const chico = crearLuchador({ ...soldado, atributos: { FUE: 5, CON: 5 } }, 'A', 0, 0);
    const grande = crearLuchador({ ...soldado, atributos: { FUE: 8, CON: 8 } }, 'B', 1, 0);
    const antes = ataqueFinal(grande, chico);
    bendecir(chico, chico, conjuro('Modificar el Tamaño'), { tamano: -2 });
    expect(ataqueFinal(grande, chico)).toBe(antes - 10);
  });

  it('Invisibilidad: sin superar Advertir, ceguera absoluta; si lo supera, parcial', () => {
    const inv = crearLuchador(soldado, 'A', 0, 0);
    const obs = crearLuchador(soldado, 'B', 1, 0);
    bendecir(inv, inv, conjuro('Invisibilidad'), { invisible: 280 });
    expect(cegueraContra(obs, inv).nivel).toBe(2);
    obs.percibe.add(inv);
    expect(cegueraContra(obs, inv).nivel).toBe(1);
  });

  it('Inmunidad contra el Fuego: −5 al daño base de calor por intensidad', () => {
    const l = crearLuchador(soldado, 'A', 0, 0);
    bendecir(l, l, conjuro('Inmunidad contra el Fuego'), { inmuneFuego: 5 });
    expect([reduccionFuego(l, 'CAL'), reduccionFuego(l, 'FIL')]).toEqual([25, 0]);
  });

  it('Lazos de Luz: Presa con la Fuerza de los lazos; el apresado no puede romperlos', () => {
    expect(buscar(/Los Lazos de Luz sujetan/, (semilla) =>
      simularCombate([mago({ libres: ['Lazos de Luz'] })], [{ ...soldado, pv: 800 }], { semilla, registrar: true, distanciaInicial: 15, maxAsaltos: 6 }).registro!.map((x) => x.texto))).toBe(true);
  });

  it('Fundir: el arma que no resiste se suelta', () => {
    expect(buscar(/empieza a fundirse/, (semilla) =>
      simularCombate([mago({ libres: ['Fundir'] }, { inteligencia: 10 })], soldados(3), { semilla, registrar: true, distanciaInicial: 3, maxAsaltos: 4 }).registro!.map((x) => x.texto))).toBe(true);
  });

  it('Transporte Rápido: trabado, se aleja', () => {
    expect(buscar(/aparece a \d+ m/, (semilla) =>
      simularCombate([mago({ libres: ['Transporte Rápido'] }, { pv: 60 })], soldados(3), { semilla, registrar: true, distanciaInicial: 1, maxAsaltos: 4 }).registro!.map((x) => x.texto))).toBe(true);
  });

  it('Barrera de Fuego: quien la cruza recibe un ataque automático de calor', () => {
    expect(buscar(/atraviesa la Barrera de Fuego/, (semilla) =>
      simularCombate([mago({ libres: ['Barrera de Fuego'] })], soldados(2), { semilla, registrar: true, distanciaInicial: 20, maxAsaltos: 5 }).registro!.map((x) => x.texto))).toBe(true);
  });

  it('Mina de Fuego: se pone y después estalla', () => {
    expect(buscar(/hace estallar la Mina de Fuego/, (semilla) =>
      simularCombate([mago({ libres: ['Mina de Fuego'], controlDelEspacio: true })], soldados(4), { semilla, registrar: true, distanciaInicial: 12, maxAsaltos: 6 }).registro!.map((x) => x.texto))).toBe(true);
  });

  it('Imbuir Calma: le saca el Miedo a los suyos', () => {
    expect(buscar(/se calma: deja de tener Miedo/, (semilla) =>
      simularCombate([mago({ libres: ['Imbuir Calma'] }), { ...soldado, id: 'asustado', nombre: 'Asustado', estados: { miedo: true } }], soldados(2), { semilla, registrar: true, distanciaInicial: 10, maxAsaltos: 3 }).registro!.map((x) => x.texto))).toBe(true);
  });

  it('Holograma: quien no lo descubre le pega a la imagen', () => {
    expect(buscar(/¡ataca a la imagen!/, (semilla) =>
      simularCombate([mago({ libres: ['Holograma'] })], soldados(2), { semilla, registrar: true, distanciaInicial: 10, maxAsaltos: 5 }).registro!.map((x) => x.texto))).toBe(true);
  });

  it('Atar: sólo con sogas o cadenas en la escena', () => {
    const textos = (cuerdas?: 'soga' | 'cadena') => (semilla: number) =>
      simularCombate([mago({ libres: ['Atar'] })], [{ ...soldado, pv: 800 }], { semilla, registrar: true, distanciaInicial: 10, maxAsaltos: 5, escenario: { cuerdas } }).registro!.map((x) => x.texto);
    expect(buscar(/queda atado \(Fuerza 12\)/, textos('cadena'))).toBe(true);
    expect(buscar(/lanza Atar/, textos(undefined), 10)).toBe(false);
  });

  it('contra seres de su naturaleza: Destrucción de Sombras daña a los de oscuridad; Control sobre el Fuego domina a los de fuego', () => {
    const sombra = { ...soldado, id: 'sombra', nombre: 'Sombra', naturaleza: ['oscuridad'], rm: 20 };
    expect(buscar(/Sombra falla la RM contra el poder de Mago/, (semilla) =>
      simularCombate([mago({ vias: { Luz: 20 } })], [sombra], { semilla, registrar: true, distanciaInicial: 5, maxAsaltos: 4 }).registro!.map((x) => x.texto))).toBe(true);
    const ifrit = { ...soldado, id: 'ifrit', nombre: 'Ifrit', naturaleza: ['fuego'], rm: 20 };
    expect(buscar(/Ifrit queda bajo el control de Mago/, (semilla) =>
      simularCombate([mago({ libres: ['Control sobre el Fuego'] })], [ifrit], { semilla, registrar: true, distanciaInicial: 5, maxAsaltos: 4 }).registro!.map((x) => x.texto))).toBe(true);
  });

  it('Detectar Vida localiza a un enemigo invisible', () => {
    const invisible = mago({ act: 200, libres: ['Invisibilidad'] }, { id: 'inv', nombre: 'Oculto', rm: 20 });
    expect(buscar(/Mago localiza a Oculto/, (semilla) =>
      simularCombate([mago({ libres: ['Detectar Vida'] }), { ...soldado, pv: 500 }], [invisible], { semilla, registrar: true, distanciaInicial: 15, maxAsaltos: 8 }).registro!.map((x) => x.texto))).toBe(true);
  });

  it('pasarle zeon a un mago aliado (con Transmisión de Magia, a distancia)', () => {
    const rico = mago({ transmision: true, vias: { Luz: 40 } }, { id: 'rico', nombre: 'Rico' });
    const pobre = mago({ zeon: 60, act: 50, vias: { Luz: 40 } }, { id: 'pobre', nombre: 'Pobre' });
    expect(buscar(/Rico le pasa 150 de zeon a Pobre/, (semilla) =>
      simularCombate([rico, pobre], soldados(2), { semilla, registrar: true, distanciaInicial: 20, maxAsaltos: 3 }).registro!.map((x) => x.texto), 10)).toBe(true);
  });

  it('Marcha Implacable da Uso de la Energía Necesaria', () => {
    const l = crearLuchador(soldado, 'A', 0, 0);
    bendecir(l, l, conjuro('Marcha Implacable'), { energiaNecesaria: true });
    expect(l.bono?.energiaNecesaria).toBe(true);
  });
});


describe('registro de efectos', () => {
  it('cada conjuro del catálogo tiene su manejador, y los que la IA lanza sola se pueden valorar', async () => {
    const { CATALOGO } = await import('../src/motor/conjuros');
    const { EFECTOS } = await import('../src/motor/efectos');
    for (const c of CATALOGO) {
      const h = EFECTOS[c.efecto];
      expect(h, c.nombre).toBeDefined();
      // Activo y sin forma de valorarlo: la IA nunca lo lanzaría (salvo escudo y Aumentar el Crítico, que son pasivos).
      if (c.accion === 'activa' && c.efecto !== 'escudo' && c.efecto !== 'aumentarCritico') expect(h.valorar, c.nombre).toBeDefined();
      if (c.efecto === 'ataque') expect(c.tipos, c.nombre).toContain('ataque');
      if (c.efecto === 'armadura') expect(c.grados[0].taEnergia, c.nombre).toBeDefined();
      if (c.efecto === 'escudo') expect(c.grados[0].resistencia, c.nombre).toBeDefined();
    }
  });
});

describe('auditoría de magia (16/10/2026)', () => {
  it('sólo los conjuros en Energía dañan energía (Core p.122); la oscuridad lleva su naturaleza', () => {
    const fuego = conjuro('Bola de Fuego');
    const luz = conjuro('Descarga de Luz');
    expect(golpeDeConjuro(fuego, fuego.grados[0]).danaEnergia).toBe(false);
    expect(golpeDeConjuro(luz, luz.grados[0]).danaEnergia).toBe(true);
    expect(golpeDeConjuro(luz, luz.grados[0]).naturaleza).toBe('luz');
  });

  it('apresado acumula la mitad del ACT (Core p.117)', async () => {
    const { actDe } = await import('../src/motor/magia');
    const m = crearLuchador(mago({ libres: ['Arma Ígnea'] }), 'A', 0, 0);
    const k = crearLuchador(soldado, 'B', 1, 0);
    const act = actDe(m);
    m.apresadoPor = k;
    expect(actDe(m)).toBe(Math.floor(act / 2));
  });

  it('la parálisis parcial inducida quita los gestos como la de una presa (Core p.117)', async () => {
    const { actDe } = await import('../src/motor/magia');
    const presa = crearLuchador(mago({ libres: ['Arma Ígnea'] }), 'A', 0, 0);
    const inducida = crearLuchador(mago({ libres: ['Arma Ígnea'] }), 'A', 0, 0);
    presa.paralisisPresa = 2;
    imponer(inducida, 'paralisis', { nivel: 2, asaltos: 3 });
    expect(actDe(inducida)).toBe(actDe(presa));
    expect(actDe(inducida)).toBeLessThan(actDe(crearLuchador(mago({ libres: ['Arma Ígnea'] }), 'A', 0, 0)) / 2 + 1);
  });
});

describe('Conjuro Especialista (Arcana p.30)', () => {
  it('cada esfera en el mismo conjuro suma +10 al ACT y +1 a la Inteligencia', async () => {
    const { actPara, actDe } = await import('../src/motor/magia');
    const m = crearLuchador(mago({ libres: ['Arma Ígnea'], especialista: ['Arma Ígnea', 'Arma Ígnea'] }), 'A', 0, 0);
    expect(actPara(m, conjuro('Arma Ígnea')) - actDe(m)).toBe(20);
  });
});
