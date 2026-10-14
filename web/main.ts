// Página: compendio de personajes (planillas propias y genéricos), dos equipos ubicados en un mapa
// de celdas de 1 m, Monte Carlo en workers y un combate para ver en vivo sobre el mapa. Todo en el
// navegador; lo cargado se recuerda en localStorage.

import { armasCuerpoACuerpo, jsonAFicha, leerHoja } from '../src/hoja/ficha';
import type { HojaJson } from '../src/hoja/hojaAJson';
import { simularCombate, type ResultadoCombate } from '../src/motor/combate';
import { estilos } from '../src/motor/estilos';
import type { Celda } from '../src/motor/mapa';
import type { Evento, Ficha, OpcionesEscenario, Perfil } from '../src/motor/modelo';
import type { ResultadoMonteCarlo } from '../src/motor/montecarlo';
import abel from '../ejemplos/arquetipos-abel.json';
import duelo from '../ejemplos/duelo.json';
import ejemploEstilos from '../ejemplos/estilos.json';
import grupo from '../ejemplos/grupo.json';
import { correrEnParalelo, type Corrida } from './paralelo';
import { Tablero, type FichaTablero } from './tablero';

type Entrada =
  | { clave: string; nombre: string; tipo: 'hoja'; json: HojaJson }
  | { clave: string; nombre: string; tipo: 'ficha'; ficha: Ficha };

interface Integrante {
  clave: string;
  /** Nombre del arma; vacío: la mejor cuerpo a cuerpo. */
  arma: string;
  /** Vacío: el de la ficha. */
  perfil: Perfil | '';
  /** Estado con el que empieza (ver ESTADOS); vacío: normal. Falta en lo guardado antes. */
  estado?: string;
  /** Celda en el mapa. */
  pos?: Celda;
}

interface MapaGuardado {
  ancho: number;
  alto: number;
  bloqueadas: Celda[];
}

interface Estado {
  biblioteca: Entrada[];
  equipoA: Integrante[];
  equipoB: Integrante[];
  mapa?: MapaGuardado;
  pestana?: 'propios' | 'genericos';
  /** Los últimos valores del diálogo de opciones. */
  opciones?: OpcionesGuardadas;
}

/** Lo que se elige en el diálogo de "Simular muchos" (también vale para ver en vivo). */
interface OpcionesGuardadas {
  combates: number;
  hilos: number;
  semilla: number;
  oscuridad: string;
  faseLunar: string;
  casillas: Record<string, boolean>;
}

const CASILLAS = ['rotura', 'huida', 'espacioReducido', 'armasEnfundadas', 'desequilibrio'] as const;

/** Lo que trae un escenario .json (el mismo formato que usa el CLI). */
interface EscenarioJson {
  distanciaInicial?: number;
  opciones?: OpcionesEscenario;
  equipoA: (Ficha | { hoja: string; arma?: string; perfil?: Perfil; nombre?: string; estado?: string })[];
  equipoB: EscenarioJson['equipoA'];
}

/**
 * Genéricos: los arquetipos de Abel y las fichas de los ejemplos. Las copias de una misma ficha en
 * los ejemplos ("Guardia 1", "Guardia 2"…) quedan una sola, sin el número.
 */
const GENERICOS: Entrada[] = (() => {
  const todas = [
    ...(abel.fichas as unknown as Ficha[]),
    ...[duelo, ejemploEstilos, grupo].flatMap((e) => [...e.equipoA, ...e.equipoB] as unknown as Ficha[]),
  ];
  const vistas = new Set<string>();
  const res: Entrada[] = [];
  for (const f of todas) {
    const { id: _id, nombre: _nombre, ...datos } = f;
    const huella = JSON.stringify(datos);
    if (vistas.has(huella)) continue;
    vistas.add(huella);
    const repetida = todas.filter((x) => JSON.stringify({ ...x, id: 0, nombre: 0 }) === JSON.stringify({ ...f, id: 0, nombre: 0 })).length > 1;
    const nombre = repetida ? f.nombre.replace(/\s+\d+$/, '') : f.nombre;
    res.push({ clave: `gen:${f.id}`, nombre, tipo: 'ficha', ficha: { ...f, nombre } });
  }
  return res;
})();

/** Estados de la Tabla 43 y del capítulo 14 del Core con que puede empezar un luchador. */
const ESTADOS: [string, string, (f: Ficha) => Ficha][] = [
  ['', 'Sin estados', (f) => f],
  ['cegueraParcial', 'Ceguera parcial', (f) => ({ ...f, estados: { ...f.estados, ceguera: 'parcial' } })],
  ['cegueraAbsoluta', 'Ceguera absoluta', (f) => ({ ...f, estados: { ...f.estados, ceguera: 'absoluta' } })],
  ['miedo', 'Miedo (−60)', (f) => ({ ...f, estados: { ...f.estados, miedo: true } })],
  ['dolor', 'Dolor (−40)', (f) => ({ ...f, estados: { ...f.estados, dolor: 'normal' } })],
  ['dolorExtremo', 'Dolor extremo (−80)', (f) => ({ ...f, estados: { ...f.estados, dolor: 'extremo' } })],
  ['levitando', 'Levitando', (f) => ({ ...f, estados: { ...f.estados, levitando: true } })],
  ['vuelo7', 'Vuelo 7 a 14', (f) => ({ ...f, tipoVuelo: 7 })],
  ['vuelo15', 'Vuelo 15 o más', (f) => ({ ...f, tipoVuelo: 15 })],
];

function conEstado(f: Ficha, estado = ''): Ficha {
  return (ESTADOS.find(([v]) => v === estado)?.[2] ?? ((x: Ficha) => x))(f);
}

const PERFILES: [Perfil | '', string][] = [
  ['', 'Perfil de la ficha'], ['agresivo', 'Agresivo'], ['equilibrado', 'Equilibrado'], ['cauto', 'Cauto'], ['bestia', 'Bestia'],
];
const GUARDADO = 'anima-sim:estado';
const MAPA_INICIAL: MapaGuardado = { ancho: 20, alto: 12, bloqueadas: [] };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const numeroDe = (id: string) => Number(($(id) as HTMLInputElement).value);
const marcado = (id: string) => ($(id) as HTMLInputElement).checked;

/** Elemento con propiedades (`className`, `onclick`, `style` como texto…) e hijos. */
function crear<K extends keyof HTMLElementTagNameMap>(etiqueta: K, props: Record<string, unknown> = {}, ...hijos: (Node | string)[]) {
  const el: HTMLElementTagNameMap[K] = Object.assign(document.createElement(etiqueta), props);
  el.append(...hijos);
  return el;
}

// ---------- Estado ----------

function cargarEstado(): Estado {
  try {
    const crudo = localStorage.getItem(GUARDADO);
    if (crudo) return JSON.parse(crudo) as Estado;
  } catch { /* sin almacenamiento: se empieza vacío */ }
  return { biblioteca: [], equipoA: [], equipoB: [] };
}

const estado = cargarEstado();
estado.mapa ??= { ...MAPA_INICIAL };

function guardar() {
  try {
    localStorage.setItem(GUARDADO, JSON.stringify(estado));
  } catch { /* lleno o bloqueado: sólo se pierde al recargar */ }
}

function buscar(clave: string) {
  return estado.biblioteca.find((e) => e.clave === clave) ?? GENERICOS.find((e) => e.clave === clave);
}

function fichaBase(e: Entrada, arma = '', perfil: Perfil | '' = ''): Ficha {
  const f = e.tipo === 'hoja' ? jsonAFicha(e.json, { arma: arma || undefined }) : e.ficha;
  return perfil ? { ...f, perfil } : f;
}

/**
 * Fichas y celdas de un equipo, en el mismo orden. Si una ficha se repite, las copias se numeran
 * para distinguirlas.
 */
function equipoDe(equipo: Integrante[], vistos: Map<string, number>): { fichas: Ficha[]; celdas: (Celda | null)[] } {
  const fichas: Ficha[] = [];
  const celdas: (Celda | null)[] = [];
  for (const i of equipo) {
    const e = buscar(i.clave);
    if (!e) continue;
    const f = conEstado(fichaBase(e, i.arma, i.perfil), i.estado);
    const n = (vistos.get(f.id) ?? 0) + 1;
    vistos.set(f.id, n);
    fichas.push(n === 1 ? f : { ...f, id: `${f.id}-${n}`, nombre: `${f.nombre} (${n})` });
    celdas.push(i.pos ?? null);
  }
  return { fichas, celdas };
}

function escenarioActual() {
  const vistos = new Map<string, number>();
  const selectorLuna = $<HTMLSelectElement>('faseLunar');
  const fase = (selectorLuna.disabled ? '' : selectorLuna.value) as OpcionesEscenario['faseLunar'] | '';
  const oscuridad = $<HTMLSelectElement>('oscuridad').value as OpcionesEscenario['oscuridad'] | '';
  const a = equipoDe(estado.equipoA, vistos);
  const b = equipoDe(estado.equipoB, vistos);
  const opciones: OpcionesEscenario = {
    rotura: marcado('rotura'),
    huida: marcado('huida'),
    espacioReducido: marcado('espacioReducido'),
    armasEnfundadas: marcado('armasEnfundadas'),
    desequilibrio: marcado('desequilibrio'),
    ...(fase ? { faseLunar: fase } : {}),
    ...(oscuridad ? { oscuridad } : {}),
    // Una copia: el mapa del estado se edita en el lugar y el motor guarda lo que preparó con él.
    mapa: { ...estado.mapa!, bloqueadas: [...estado.mapa!.bloqueadas] },
    posiciones: { A: a.celdas, B: b.celdas },
  };
  return { equipoA: a.fichas, equipoB: b.fichas, escenario: opciones };
}

// ---------- Mapa ----------

const tablero = new Tablero($<HTMLCanvasElement>('mapa'));
const claveCelda = (c: Celda) => `${c.x},${c.y}`;

function paredes(): Set<string> {
  return new Set(estado.mapa!.bloqueadas.map(claveCelda));
}

/** Celdas ocupadas por paredes o por otros luchadores. */
function ocupadas(salvo?: Integrante): Set<string> {
  const s = paredes();
  for (const i of [...estado.equipoA, ...estado.equipoB]) if (i !== salvo && i.pos) s.add(claveCelda(i.pos));
  return s;
}

/**
 * Celda libre para alguien que se suma: el equipo A desde la izquierda y el B desde la derecha,
 * por columnas, empezando por el centro de cada una.
 */
function celdaParaNuevo(equipo: 'A' | 'B'): Celda | undefined {
  const { ancho, alto } = estado.mapa!;
  const usadas = ocupadas();
  const filas = Array.from({ length: alto }, (_, k) => Math.floor(alto / 2) + (k % 2 ? -1 : 1) * Math.ceil(k / 2))
    .filter((y) => y >= 0 && y < alto);
  for (let n = 1; n < ancho; n++) {
    const x = equipo === 'A' ? n : ancho - 1 - n;
    // De a una fila por medio, para que no queden pegados.
    for (const y of [...filas.filter((y) => (y - Math.floor(alto / 2)) % 2 === 0), ...filas]) {
      if (!usadas.has(`${x},${y}`)) return { x, y };
    }
  }
  return undefined;
}

/** Ubica a quien no tenga celda, o tenga una que ya no vale (fuera del mapa, pared, repetida). */
function completarPosiciones() {
  const { ancho, alto } = estado.mapa!;
  const vistas = paredes();
  for (const [equipo, lista] of [['A', estado.equipoA], ['B', estado.equipoB]] as const)
    for (const i of lista) {
      if (i.pos && i.pos.x < ancho && i.pos.y < alto && !vistas.has(claveCelda(i.pos))) {
        vistas.add(claveCelda(i.pos));
        continue;
      }
      i.pos = undefined;
      i.pos = celdaParaNuevo(equipo);
      if (i.pos) vistas.add(claveCelda(i.pos));
    }
}

function fichasDelTablero(): FichaTablero[] {
  const vistos = new Map<string, number>();
  const res: FichaTablero[] = [];
  for (const [equipo, lista] of [['A', estado.equipoA], ['B', estado.equipoB]] as const)
    lista.forEach((i, n) => {
      const e = buscar(i.clave);
      if (!e || !i.pos) return;
      const veces = (vistos.get(e.clave) ?? 0) + 1;
      vistos.set(e.clave, veces);
      res.push({ id: `${equipo}${n}`, nombre: veces > 1 ? `${e.nombre} (${veces})` : e.nombre, equipo, x: i.pos.x, y: i.pos.y });
    });
  return res;
}

function dibujarMapa() {
  const m = estado.mapa!;
  ($('mapaAncho') as HTMLInputElement).value = String(m.ancho);
  ($('mapaAlto') as HTMLInputElement).value = String(m.alto);
  tablero.mapa = { ancho: m.ancho, alto: m.alto, paredes: paredes() };
  if (tablero.modo === 'editar') {
    tablero.fichas = fichasDelTablero();
    tablero.turno = tablero.sujeto = null;
    tablero.flecha = null;
    tablero.dano = null;
    tablero.estelas = [];
  }
  tablero.dibujar();
}

tablero.alCambiarPared = (c, pared) => {
  const m = estado.mapa!;
  m.bloqueadas = m.bloqueadas.filter((x) => x.x !== c.x || x.y !== c.y);
  if (pared) m.bloqueadas.push(c);
  guardar();
  dibujarMapa();
};

tablero.alMoverFicha = (id, c) => {
  const lista = id[0] === 'A' ? estado.equipoA : estado.equipoB;
  const i = lista[Number(id.slice(1))];
  if (!i) return;
  i.pos = c;
  guardar();
  dibujarMapa();
};

function cambiarTamano() {
  const m = estado.mapa!;
  m.ancho = Math.max(4, Math.min(80, Math.round(numeroDe('mapaAncho')) || m.ancho));
  m.alto = Math.max(4, Math.min(80, Math.round(numeroDe('mapaAlto')) || m.alto));
  m.bloqueadas = m.bloqueadas.filter((c) => c.x < m.ancho && c.y < m.alto);
  completarPosiciones();
  guardar();
  dibujarMapa();
}

// ---------- Carga de archivos ----------

function avisar(texto: string) {
  const aviso = $('aviso');
  aviso.textContent = texto;
  aviso.hidden = !texto;
}

function agregarALaBiblioteca(e: Entrada) {
  const i = estado.biblioteca.findIndex((x) => x.clave === e.clave);
  if (i >= 0) estado.biblioteca[i] = e;
  else estado.biblioteca.push(e);
}

const nombreDeArchivo = (ruta: string) => ruta.split(/[\\/]/).pop()!;

async function cargarArchivos(archivos: File[]) {
  const errores: string[] = [];
  const escenarios: EscenarioJson[] = [];
  for (const archivo of archivos) {
    try {
      if (archivo.name.toLowerCase().endsWith('.json')) {
        const json = JSON.parse(await archivo.text()) as EscenarioJson | { fichas: Ficha[] };
        // Una lista de fichas (p. ej. ejemplos/arquetipos-abel.json) sólo se suma a la biblioteca.
        if ('fichas' in json) for (const f of json.fichas) agregarALaBiblioteca({ clave: `ficha:${f.id}`, nombre: f.nombre, tipo: 'ficha', ficha: f });
        else escenarios.push(json);
        continue;
      }
      const json = leerHoja(new Uint8Array(await archivo.arrayBuffer()));
      const nombre = jsonAFicha(json).nombre;
      agregarALaBiblioteca({ clave: archivo.name, nombre, tipo: 'hoja', json });
    } catch (error) {
      errores.push(`${archivo.name}: ${error instanceof Error ? error.message : error}`);
    }
  }
  // Los escenarios van al final: sus planillas se buscan por nombre de archivo entre las cargadas.
  for (const esc of escenarios) errores.push(...aplicarEscenario(esc));
  avisar(errores.join(' · '));
  estado.pestana = 'propios';
  guardar();
  dibujar();
}

function aplicarEscenario(esc: EscenarioJson): string[] {
  const errores: string[] = [];
  const integrantes = (lista: EscenarioJson['equipoA']): Integrante[] => lista.flatMap((x): Integrante[] => {
    if ('hoja' in x) {
      const clave = nombreDeArchivo(x.hoja);
      if (!buscar(clave)) {
        errores.push(`Falta cargar la planilla "${clave}"`);
        return [];
      }
      return [{ clave, arma: x.arma ?? '', perfil: x.perfil ?? '', estado: x.estado ?? '' }];
    }
    const generico = GENERICOS.find((g) => g.tipo === 'ficha' && g.ficha.id === x.id);
    const clave = generico?.clave ?? `ficha:${x.id}`;
    if (!generico) agregarALaBiblioteca({ clave, nombre: x.nombre, tipo: 'ficha', ficha: x });
    return [{ clave, arma: '', perfil: '' }];
  });
  estado.equipoA = integrantes(esc.equipoA ?? []);
  estado.equipoB = integrantes(esc.equipoB ?? []);
  const o = esc.opciones ?? {};
  if (o.mapa) {
    estado.mapa = { ancho: o.mapa.ancho, alto: o.mapa.alto, bloqueadas: [...(o.mapa.bloqueadas ?? [])] };
    estado.equipoA.forEach((i, n) => (i.pos = o.posiciones?.A?.[n] ?? undefined));
    estado.equipoB.forEach((i, n) => (i.pos = o.posiciones?.B?.[n] ?? undefined));
  } else {
    // Sin mapa: uno abierto con los bandos a la distancia inicial, como hace el motor.
    const d = Math.max(1, Math.round(esc.distanciaInicial ?? 10));
    const n = Math.max(estado.equipoA.length, estado.equipoB.length);
    estado.mapa = { ancho: Math.max(MAPA_INICIAL.ancho, d + 5), alto: Math.max(MAPA_INICIAL.alto, 2 * n + 3), bloqueadas: [] };
    const centro = Math.floor(estado.mapa.alto / 2);
    const columna = (lista: Integrante[], x: number) => lista.forEach((i, k) => (i.pos = { x, y: centro - (lista.length - 1) + 2 * k }));
    columna(estado.equipoA, 2);
    columna(estado.equipoB, 2 + d);
  }
  completarPosiciones();
  for (const id of CASILLAS) ($(id) as HTMLInputElement).checked = !!o[id];
  ($('faseLunar') as HTMLSelectElement).value = o.faseLunar ?? '';
  ($('oscuridad') as HTMLSelectElement).value = o.oscuridad ?? '';
  estado.opciones = leerOpciones();
  return errores;
}

// ---------- Compendio y equipos ----------

function datosDe(e: Entrada): string {
  try {
    const f = fichaBase(e);
    return `PV ${f.pv} · Turno ${f.turno} · HA ${f.ataque} · HD ${f.defensa} · Daño ${f.danoBase}`;
  } catch (error) {
    return `No se pudo leer: ${error instanceof Error ? error.message : error}`;
  }
}

function sumar(e: Entrada, equipo: 'equipoA' | 'equipoB') {
  const i: Integrante = { clave: e.clave, arma: '', perfil: '' };
  estado[equipo].push(i);
  i.pos = celdaParaNuevo(equipo === 'equipoA' ? 'A' : 'B');
  if (!i.pos) avisar('No queda lugar libre en el mapa: agrandalo o sacá paredes.');
  guardar();
  dibujarEquipos();
}

function dibujarCompendio() {
  const pestana = estado.pestana ?? (estado.biblioteca.length ? 'propios' : 'genericos');
  for (const p of ['propios', 'genericos'] as const) {
    const b = $(`pestana-${p}`);
    b.classList.toggle('activa', p === pestana);
    b.setAttribute('aria-selected', String(p === pestana));
  }
  $('zona').hidden = pestana !== 'propios';
  const entradas = pestana === 'propios' ? estado.biblioteca : GENERICOS;
  const lista = $('biblioteca');
  if (!entradas.length) {
    lista.replaceChildren(crear('li', { className: 'vacio' }, 'Todavía no cargaste planillas: arrastralas arriba.'));
    return;
  }
  lista.replaceChildren(...entradas.map((e) => {
    const quitar = () => {
      estado.biblioteca = estado.biblioteca.filter((x) => x !== e);
      estado.equipoA = estado.equipoA.filter((i) => i.clave !== e.clave);
      estado.equipoB = estado.equipoB.filter((i) => i.clave !== e.clave);
      guardar();
      dibujar();
    };
    return crear('li', {},
      crear('span', { className: 'nombre', title: e.clave }, e.nombre),
      crear('span', { className: 'datos' }, datosDe(e)),
      crear('div', { className: 'botones' },
        crear('button', { type: 'button', className: 'chico a', onclick: () => sumar(e, 'equipoA') }, '+ A'),
        crear('button', { type: 'button', className: 'chico b', onclick: () => sumar(e, 'equipoB') }, '+ B'),
        ...(pestana === 'propios'
          ? [crear('button', { type: 'button', className: 'chico', onclick: quitar, title: 'Quitar de la lista' }, 'Quitar')]
          : [])));
  }));
}

function selector(opciones: [string, string][], valor: string, alCambiar: (v: string) => void) {
  const s = crear('select', { onchange: () => alCambiar(s.value) },
    ...opciones.map(([v, texto]) => crear('option', { value: v, selected: v === valor }, texto)));
  return s;
}

function dibujarEquipo(clave: 'equipoA' | 'equipoB') {
  const lista = $(clave);
  const integrantes = estado[clave];
  if (!integrantes.length) {
    lista.replaceChildren(crear('li', { className: 'vacio' }, 'Sumá personajes desde el compendio.'));
    return;
  }
  lista.replaceChildren(...integrantes.map((i, n) => {
    const e = buscar(i.clave);
    if (!e) return crear('li', { className: 'vacio' }, `Falta "${i.clave}"`);
    const cambiar = (campo: 'arma' | 'perfil' | 'estado') => (v: string) => {
      (i as unknown as Record<string, string>)[campo] = v;
      guardar();
    };
    const armas: [string, string][] = e.tipo === 'hoja'
      ? [['', 'Mejor arma'], ...armasCuerpoACuerpo(e.json).map((a): [string, string] => [a.nombre, a.nombre])]
      : [['', e.ficha.arma?.nombre ?? 'Arma de la ficha']];
    const quitar = () => {
      integrantes.splice(n, 1);
      guardar();
      dibujarEquipos();
    };
    return crear('li', {},
      crear('strong', {}, e.nombre),
      crear('button', { type: 'button', className: 'chico', onclick: quitar, title: 'Sacar del equipo' }, '×'),
      crear('div', { className: 'campos' },
        selector(armas, i.arma, cambiar('arma')),
        selector(PERFILES, i.perfil, cambiar('perfil')),
        selector(ESTADOS.map(([v, texto]): [string, string] => [v, texto]), i.estado ?? '', cambiar('estado'))));
  }));
}

/** La fase lunar sólo importa si alguien tiene el Legado de la Luna (Tsukiyomi, Dominus p.79). */
function habilitarFaseLunar() {
  const fichas = [...estado.equipoA, ...estado.equipoB].flatMap((i) => {
    const e = buscar(i.clave);
    try {
      return e ? [fichaBase(e, i.arma)] : [];
    } catch {
      return [];
    }
  });
  const alguno = fichas.some((f) => estilos(f, false).tsukiyomi);
  $<HTMLSelectElement>('faseLunar').disabled = !alguno;
  $('notaLuna').hidden = alguno;
}

function dibujarEquipos() {
  dibujarEquipo('equipoA');
  dibujarEquipo('equipoB');
  habilitarFaseLunar();
  dibujarMapa();
}

function dibujar() {
  dibujarCompendio();
  dibujarEquipos();
}

// ---------- Resultados ----------

const pct = (x: number, total: number) => `${((100 * x) / total).toFixed(1)}%`;

function mostrarResultado(r: ResultadoMonteCarlo, final: boolean) {
  $('resultados').hidden = false;
  const barra = $('victorias');
  const tramos: [string, number, string][] = [['a', r.victoriasA, 'A'], ['e', r.empates, 'Empate'], ['b', r.victoriasB, 'B']];
  // Resumen en la barra fija de arriba; lleva a la tabla.
  const corto = $('resumenCorto');
  corto.hidden = false;
  corto.replaceChildren(...tramos.filter(([, n]) => n > 0).flatMap(([c, n, texto], i) => [
    ...(i ? [' · '] : []), crear('span', { className: c }, `${texto} ${pct(n, r.combates)}`)]), final ? '' : ' …');
  barra.replaceChildren(...tramos.filter(([, n]) => n > 0).map(([c, n, texto]) =>
    crear('div', { className: c, style: `flex: ${n}`, title: `${texto}: ${pct(n, r.combates)}` },
      `${texto} ${pct(n, r.combates)}`)));
  const velocidad = Math.round(r.combates / (r.milisegundos / 1000));
  $('resumen').textContent = `${r.combates.toLocaleString('es')} combates${final ? ` en ${(r.milisegundos / 1000).toFixed(2)} s (${velocidad.toLocaleString('es')}/s)` : '…'}`
    + ` · asaltos promedio ${r.asaltosMedio.toFixed(2)}`;

  const huida = r.luchadores.some((l) => l.huida > 0);
  const columnas = ['Luchador', 'Sobrevive', ...(huida ? ['Huye'] : []), 'Daño hecho', 'Daño recibido', 'Críticos',
    'Cae en asalto', 'Ataques', 'Contras', 'Cansancio', 'Def. total', 'Maniobras', 'Técnicas de Ki'];
  const filas = r.luchadores.map((l) => [
    crear('span', {}, crear('span', { className: `marca ${l.equipo.toLowerCase()}` }), ` ${l.nombre}`),
    `${(l.supervivencia * 100).toFixed(1)}%`,
    ...(huida ? [`${(l.huida * 100).toFixed(1)}%`] : []),
    l.danoCausado.toFixed(1), l.danoRecibido.toFixed(1), l.criticos.toFixed(2),
    l.asaltoCaidaMedio?.toFixed(2) ?? '-', l.ataquesPorCombate.toFixed(2), l.contrasPorCombate.toFixed(2),
    l.cansancioPorCombate.toFixed(2), l.defensaTotalPorCombate.toFixed(2),
    // Veces por combate; las que casi no se usan no se muestran.
    Object.entries(l.maniobras).filter(([, n]) => n >= 0.005).map(([m, n]) => `${m} ${n.toFixed(2)}`).join(', ') || '-',
    Object.entries(l.tecnicas).filter(([, n]) => n >= 0.005).map(([m, n]) => `${m} ${n.toFixed(2)}`).join(', ') || '-',
  ]);
  $('tabla').replaceChildren(
    crear('thead', {}, crear('tr', {}, ...columnas.map((c) => crear('th', {}, c)))),
    crear('tbody', {}, ...filas.map((f) => crear('tr', {}, ...f.map((c) => crear('td', {}, c))))));
}

// ---------- Acciones ----------

let corrida: Corrida | null = null;

function validar() {
  const esc = escenarioActual();
  if (!esc.equipoA.length || !esc.equipoB.length) {
    avisar('Cada equipo necesita al menos un luchador.');
    return null;
  }
  avisar('');
  return esc;
}

async function simular() {
  const esc = validar();
  if (!esc) return;
  const combates = Math.max(1, Math.round(numeroDe('combates')));
  const botonSimular = $<HTMLButtonElement>('simular');
  const botonCancelar = $('cancelar');
  const progreso = $('progreso');
  const barra = $('barraProgreso');
  botonSimular.disabled = true;
  botonCancelar.hidden = false;
  progreso.hidden = false;
  barra.style.width = '0';
  corrida = correrEnParalelo(esc, combates, {
    hilos: Math.max(1, Math.round(numeroDe('hilos'))),
    semilla: Math.max(1, Math.round(numeroDe('semilla'))),
    alAvanzar: (hechos, parcial) => {
      barra.style.width = `${(100 * hechos) / combates}%`;
      mostrarResultado(parcial, false);
    },
  });
  try {
    mostrarResultado(await corrida.resultado, true);
  } catch (error) {
    if (!(error instanceof Error && error.message === 'cancelado')) avisar(`Falló la simulación: ${error instanceof Error ? error.message : error}`);
  } finally {
    corrida = null;
    botonSimular.disabled = false;
    botonCancelar.hidden = true;
    progreso.hidden = true;
  }
}

/** Marca las tiradas abiertas y las pifias del registro para verlas de un vistazo. */
function resaltarTiradas(texto: string): (Node | string)[] {
  return texto.split(/(\((?:abierta|pifia)[^)]*\)|¡pifia!)/).map((parte, i) => {
    if (i % 2 === 0) return parte;
    return crear('span', { className: parte.includes('abierta') ? 'abierta' : 'pifia' }, parte);
  });
}

// ---------- En vivo ----------

/** Un combate para ver sobre el mapa, línea por línea. */
interface Funcion {
  r: ResultadoCombate;
  semilla: number;
  /** Nombre e id de ficha del tablero de cada luchador, más largos primero (para buscarlos en el texto). */
  nombres: { nombre: string; id: string }[];
  /** Id de ficha del tablero de cada luchador, en el orden de `r.luchadores`. */
  ids: string[];
  lineas: HTMLElement[];
  indice: number;
  reproduciendo: boolean;
  temporizador: number;
}

let funcion: Funcion | null = null;

function verEnVivo() {
  const esc = validar();
  if (!esc) return;
  const semilla = Math.max(1, Math.round(numeroDe('semilla')));
  const r = simularCombate(esc.equipoA, esc.equipoB, { semilla, registrar: true, escenario: esc.escenario });
  pararFuncion();
  const ids = r.luchadores.map((_, k) => (k < esc.equipoA.length ? `A${k}` : `B${k - esc.equipoA.length}`));
  const nombres = r.luchadores.map((l, k) => ({ nombre: l.ficha.nombre, id: ids[k] })).sort((a, b) => b.nombre.length - a.nombre.length);

  // El registro completo, con un encabezado por asalto; cada línea lleva a ese momento.
  const nodos: HTMLElement[] = [];
  const lineas: HTMLElement[] = [];
  let asalto = -1;
  (r.registro ?? []).forEach((e, k) => {
    if (e.asalto !== asalto) {
      asalto = e.asalto;
      nodos.push(crear('h3', {}, asalto === 0 ? 'Inicio' : `Asalto ${asalto}`));
    }
    const p = crear('p', { className: e.texto.startsWith('  ') ? 'detalle' : '', onclick: () => irA(k) }, ...resaltarTiradas(e.texto.trim()));
    lineas.push(p);
    nodos.push(p);
  });
  const ganador = r.ganador === 'empate' ? 'Empate' : `Gana el equipo ${r.ganador}`;
  nodos.push(crear('h3', {}, `${ganador} en ${r.asaltos} asaltos (semilla ${semilla})`));
  $('registro').replaceChildren(...nodos);

  funcion = { r, semilla, nombres, ids, lineas, indice: -1, reproduciendo: false, temporizador: 0 };
  tablero.modo = 'ver';
  tablero.mapa = { ancho: r.mapa.ancho, alto: r.mapa.alto, paredes: paredesDe(r) };
  $('editor').hidden = true;
  $('controles').hidden = false;
  $('narracion').hidden = false;
  irA(0);
  reproducir(true);
  $('panelMapa').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function paredesDe(r: ResultadoCombate): Set<string> {
  const s = new Set<string>();
  r.mapa.muro.forEach((v, i) => v && s.add(`${i % r.mapa.ancho},${Math.floor(i / r.mapa.ancho)}`));
  return s;
}

/** Metros de un recorrido. */
function metros(celdas: Celda[]): number {
  let m = 0;
  for (let i = 1; i < celdas.length; i++) m += Math.hypot(celdas[i].x - celdas[i - 1].x, celdas[i].y - celdas[i - 1].y);
  return m;
}

/** Cuánto dura cada línea, según lo que pasa en ella. Un recorrido tarda según su largo. */
function duracion(e: Evento): number {
  const vel = Number(($('velocidad') as HTMLSelectElement).value) || 1;
  const base = e.camino ? 500 + 140 * metros(e.camino.celdas)
    : e.texto.startsWith('Iniciativa') ? 1600 : e.ataque ? 1500 : e.texto.startsWith('  ') ? 900 : 1100;
  return Math.min(4000, base) / vel;
}

function irA(k: number) {
  const f = funcion;
  if (!f || !f.r.registro) return;
  const registro = f.r.registro;
  k = Math.max(0, Math.min(registro.length - 1, k));
  const anterior = f.indice;
  f.indice = k;
  const e = registro[k];
  const foto = e.foto ?? [];
  const fichas: FichaTablero[] = f.r.luchadores.map((l, j) => {
    const s = foto[j] ?? { x: l.pos.x, y: l.pos.y, pv: l.pv, estado: l.estado, aLaDefensiva: false };
    return {
      id: f.ids[j], nombre: l.ficha.nombre, equipo: l.equipo, x: s.x, y: s.y, pv: s.pv, pvMax: l.ficha.pv,
      caido: s.estado !== 'activo', aLaDefensiva: s.aLaDefensiva,
    };
  });

  // Turno, ataque y daño de esta línea.
  tablero.turno = e.turno !== undefined ? f.ids[e.turno] : null;
  tablero.flecha = e.ataque
    ? {
      de: f.ids[e.ataque.de], a: f.ids[e.ataque.a], contra: e.ataque.contra,
      tipo: e.ataque.resultado === null ? 'pifia' : e.ataque.resultado > 0 ? 'impacto' : 'falla',
    }
    : null;
  tablero.dano = e.dano ? { id: f.ids[e.dano.quien], cantidad: e.dano.cantidad } : null;
  // De quién habla una línea que no es un ataque: el primer nombre que aparece (los más largos
  // primero: "Soldado (2)" tapa al "Soldado" que lleva adentro).
  const texto = e.texto.trim();
  const tapado = new Array<boolean>(texto.length).fill(false);
  let primero: { id: string; pos: number } | null = null;
  for (const n of f.nombres) {
    for (let pos = texto.indexOf(n.nombre); pos >= 0; pos = texto.indexOf(n.nombre, pos + 1)) {
      if (tapado[pos] || tapado[pos + n.nombre.length - 1]) continue;
      tapado.fill(true, pos, pos + n.nombre.length);
      if (!primero || pos < primero.pos) primero = { id: n.id, pos };
    }
  }
  tablero.sujeto = primero?.id ?? null;

  // Estelas: los recorridos del asalto hasta esta línea; el de esta línea se dibuja mientras avanza.
  let inicioAsalto = k;
  while (inicioAsalto > 0 && !registro[inicioAsalto].orden) inicioAsalto--;
  tablero.estelas = [];
  for (let j = inicioAsalto; j <= k; j++) {
    const c = registro[j].camino;
    if (c) tablero.estelas.push({ id: f.ids[c.quien], equipo: f.r.luchadores[c.quien].equipo, celdas: c.celdas, actual: j === k });
  }
  const caminos = new Map<string, Celda[]>();
  if (e.camino) caminos.set(f.ids[e.camino.quien], e.camino.celdas);
  const seguida = k === anterior + 1;
  tablero.animar(fichas, seguida ? (e.camino ? duracion(e) * 0.85 : Math.min(500, duracion(e) * 0.5)) : 0, caminos);

  // Orden de iniciativa del asalto, con quien tiene el turno destacado.
  const orden = registro[inicioAsalto].orden ?? [];
  $('ordenTurno').replaceChildren(...orden.map((j) => {
    const l = f.r.luchadores[j];
    const s = foto[j];
    const clases = ['ficha-turno', l.equipo === 'A' ? 'a' : 'b'];
    if (e.turno === j) clases.push('activo');
    if (s && s.estado !== 'activo') clases.push('caido');
    else if (s?.aLaDefensiva) clases.push('defensiva');
    return crear('span', { className: clases.join(' '), title: `${l.ficha.nombre}: ${s?.pv ?? l.pv}/${l.ficha.pv} PV` },
      crear('span', { className: `marca ${l.equipo.toLowerCase()}` }), ` ${l.ficha.nombre}`,
      crear('small', {}, ` ${Math.max(0, s?.pv ?? l.pv)}`));
  }));

  f.lineas[anterior]?.classList.remove('actual');
  const linea = f.lineas[k];
  linea.classList.add('actual');
  const contenedor = $('registro');
  contenedor.scrollTop = linea.offsetTop - contenedor.offsetTop - contenedor.clientHeight / 2;
  const quien = e.turno !== undefined ? f.r.luchadores[e.turno] : null;
  $('cartel').replaceChildren(
    crear('span', { className: 'cartel-turno' },
      crear('strong', {}, e.asalto === 0 ? 'Inicio' : `Asalto ${e.asalto}`),
      ...(quien ? [' · Turno de ', crear('span', { className: `marca ${quien.equipo.toLowerCase()}` }), ` ${quien.ficha.nombre}`] : [])),
    crear('span', { className: 'cartel-linea' }, ...resaltarTiradas(texto)));
  $('posicion').textContent = `${k + 1} / ${registro.length}`;
}

function reproducir(si: boolean) {
  const f = funcion;
  if (!f) return;
  f.reproduciendo = si;
  clearTimeout(f.temporizador);
  $('play').textContent = si ? '⏸' : '▶';
  $('play').title = si ? 'Pausa (espacio)' : 'Reproducir (espacio)';
  if (!si) return;
  const seguir = () => {
    if (!f.reproduciendo || funcion !== f) return;
    if (f.indice >= f.r.registro!.length - 1) {
      reproducir(false);
      return;
    }
    irA(f.indice + 1);
    f.temporizador = window.setTimeout(seguir, duracion(f.r.registro![f.indice]));
  };
  f.temporizador = window.setTimeout(seguir, duracion(f.r.registro![f.indice]));
}

function pararFuncion() {
  if (funcion) clearTimeout(funcion.temporizador);
  funcion = null;
}

function volverAEditar() {
  pararFuncion();
  tablero.modo = 'editar';
  $('editor').hidden = false;
  $('controles').hidden = true;
  $('cartel').replaceChildren();
  $('ordenTurno').replaceChildren();
  tablero.turno = tablero.sujeto = null;
  tablero.flecha = null;
  tablero.dano = null;
  tablero.estelas = [];
  dibujarMapa();
}

// ---------- Eventos ----------

const zona = $('zona');
const entrada = $<HTMLInputElement>('archivos');
entrada.addEventListener('change', () => {
  // Copiar antes de vaciar el input: la FileList se vacía con él.
  const archivos = [...(entrada.files ?? [])];
  entrada.value = '';
  if (archivos.length) void cargarArchivos(archivos);
});
zona.addEventListener('dragover', (e) => {
  e.preventDefault();
  zona.classList.add('encima');
});
zona.addEventListener('dragleave', () => zona.classList.remove('encima'));
zona.addEventListener('drop', (e) => {
  e.preventDefault();
  zona.classList.remove('encima');
  if (e.dataTransfer?.files.length) void cargarArchivos([...e.dataTransfer.files]);
});
for (const p of ['propios', 'genericos'] as const)
  $(`pestana-${p}`).addEventListener('click', () => {
    estado.pestana = p;
    guardar();
    dibujarCompendio();
  });
$('mapaAncho').addEventListener('change', cambiarTamano);
$('mapaAlto').addEventListener('change', cambiarTamano);
$('limpiarParedes').addEventListener('click', () => {
  estado.mapa!.bloqueadas = [];
  guardar();
  dibujarMapa();
});
$('reubicar').addEventListener('click', () => {
  for (const i of [...estado.equipoA, ...estado.equipoB]) i.pos = undefined;
  completarPosiciones();
  guardar();
  dibujarMapa();
});

$('cancelar').addEventListener('click', () => corrida?.cancelar());
$('enVivo').addEventListener('click', verEnVivo);
$('play').addEventListener('click', () => reproducir(!funcion?.reproduciendo));
$('anterior').addEventListener('click', () => {
  reproducir(false);
  irA((funcion?.indice ?? 0) - 1);
});
$('siguiente').addEventListener('click', () => {
  reproducir(false);
  irA((funcion?.indice ?? 0) + 1);
});
$('reiniciar').addEventListener('click', () => {
  irA(0);
  reproducir(true);
});
$('editarMapa').addEventListener('click', volverAEditar);
document.addEventListener('keydown', (e) => {
  if (!funcion || (e.target instanceof HTMLElement && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))) return;
  if (e.key === ' ') {
    e.preventDefault();
    reproducir(!funcion.reproduciendo);
  } else if (e.key === 'ArrowRight') {
    reproducir(false);
    irA(funcion.indice + 1);
  } else if (e.key === 'ArrowLeft') {
    reproducir(false);
    irA(funcion.indice - 1);
  }
});

// ---------- Opciones ----------

function leerOpciones(): OpcionesGuardadas {
  return {
    combates: Math.max(1, Math.round(numeroDe('combates')) || 10000),
    hilos: Math.max(1, Math.round(numeroDe('hilos')) || 1),
    semilla: Math.max(1, Math.round(numeroDe('semilla')) || 1),
    oscuridad: $<HTMLSelectElement>('oscuridad').value,
    faseLunar: $<HTMLSelectElement>('faseLunar').value,
    casillas: Object.fromEntries(CASILLAS.map((id) => [id, marcado(id)])),
  };
}

function mostrarOpciones(o: OpcionesGuardadas) {
  ($('combates') as HTMLInputElement).value = String(o.combates);
  ($('hilos') as HTMLInputElement).value = String(o.hilos);
  ($('semilla') as HTMLInputElement).value = String(o.semilla);
  $<HTMLSelectElement>('oscuridad').value = o.oscuridad;
  $<HTMLSelectElement>('faseLunar').value = o.faseLunar;
  for (const id of CASILLAS) ($(id) as HTMLInputElement).checked = !!o.casillas[id];
}

const dialogo = $<HTMLDialogElement>('dialogoSimular');
// "Simular muchos…" abre las opciones con los últimos valores; "Simular" las guarda y corre.
$('simular').addEventListener('click', () => {
  if (estado.opciones) mostrarOpciones(estado.opciones);
  dialogo.returnValue = '';
  dialogo.showModal();
  $('confirmarSimular').focus();
});
// Se atiende el envío del formulario (inmediato) y no el "close" del diálogo, que llega después.
$('formSimular').addEventListener('submit', (e) => {
  const boton = (e as SubmitEvent).submitter as HTMLButtonElement | null;
  if (boton?.value === 'simular') {
    estado.opciones = leerOpciones();
    guardar();
    void simular();
  } else if (estado.opciones) {
    // Cancelar deja todo como estaba.
    mostrarOpciones(estado.opciones);
  }
});
dialogo.addEventListener('cancel', () => {
  // Escape: lo mismo que Cancelar.
  if (estado.opciones) mostrarOpciones(estado.opciones);
});

if (estado.opciones) mostrarOpciones(estado.opciones);
else {
  ($('hilos') as HTMLInputElement).value = String(navigator.hardwareConcurrency || 4);
  estado.opciones = leerOpciones();
  guardar();
}

completarPosiciones();
dibujar();
