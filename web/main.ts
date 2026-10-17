// Página: compendio de personajes (planillas propias y genéricos), dos equipos ubicados en un mapa
// de celdas de 1 m, Monte Carlo en workers y un combate para ver en vivo sobre el mapa. Todo en el
// navegador; lo cargado se recuerda en localStorage.

import { armasCuerpoACuerpo, jsonAFicha, leerHoja } from '../src/hoja/ficha';
import type { HojaJson } from '../src/hoja/hojaAJson';
import { disposicionAbierta, simularCombate, type ResultadoCombate } from '../src/motor/combate';
import { estilos } from '../src/motor/estilos';
import type { Celda } from '../src/motor/mapa';
import type { Evento, Ficha, OpcionesEscenario, Perfil } from '../src/motor/modelo';
import type { ResultadoMonteCarlo } from '../src/motor/montecarlo';
import abel from '../ejemplos/arquetipos-abel.json';
import tiradores from '../ejemplos/tiradores.json';
import duelo from '../ejemplos/duelo.json';
import ejemploEstilos from '../ejemplos/estilos.json';
import grupo from '../ejemplos/grupo.json';
import { correrEnParalelo, type Corrida } from './paralelo';
import { Tablero, type FichaTablero, type Pincel } from './tablero';
import { $, crear, numeroDe } from './dom';
import { armarCasillas, CASILLAS, casillasMarcadas, leerOpciones, mostrarOpciones, type OpcionesGuardadas } from './opciones';
import { celdasDe, duracionDe, resaltarTiradas, textoEstado } from './narracion';
import { resumenFicha, type Resumen } from './compendio';
import { conEstado, ESTADOS_INICIALES, fichaDesdeHoja, numerarCopias, type EscenarioJson } from '../src/escenario';

type Entrada =
  | { clave: string; nombre: string; tipo: 'hoja'; json: HojaJson }
  | { clave: string; nombre: string; tipo: 'ficha'; ficha: Ficha };

interface Integrante {
  clave: string;
  /** Nombre del arma; vacío: la mejor cuerpo a cuerpo. */
  arma: string;
  /** Vacío: el de la ficha. */
  perfil: Perfil | '';
  /** Estado con el que empieza (ESTADOS_INICIALES); vacío: normal. Falta en lo guardado antes. */
  estado?: string;
  /** Nombre que le puso el escenario (para distinguir copias de una planilla). */
  nombre?: string;
  /** Celda en el mapa. */
  pos?: Celda;
}

interface MapaGuardado {
  ancho: number;
  alto: number;
  /** Paredes. */
  bloqueadas: Celda[];
  /** Terreno infranqueable (los mapas guardados antes no lo tienen). */
  infranqueables?: Celda[];
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

/**
 * Genéricos: los arquetipos de Abel y las fichas de los ejemplos. Las copias de una misma ficha en
 * los ejemplos ("Guardia 1", "Guardia 2"…) quedan una sola, sin el número.
 */
const GENERICOS: Entrada[] = (() => {
  const todas = [
    ...(abel.fichas as unknown as Ficha[]),
    ...(tiradores.fichas as unknown as Ficha[]),
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


const PERFILES: [Perfil | '', string][] = [
  ['', 'Perfil de la ficha'], ['agresivo', 'Agresivo'], ['equilibrado', 'Equilibrado'], ['cauto', 'Cauto'], ['bestia', 'Bestia'],
];
const GUARDADO = 'anima-sim:estado';
const MAPA_INICIAL: MapaGuardado = { ancho: 20, alto: 12, bloqueadas: [] };

armarCasillas();

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

let guardadoPendiente = 0;

/**
 * Guarda el estado (biblioteca, equipos, mapa) un momento después del último cambio: pintar paredes
 * arrastrando cambia muchas celdas seguidas y serializar todo en cada una traba la página.
 */
function guardar() {
  clearTimeout(guardadoPendiente);
  guardadoPendiente = window.setTimeout(guardarYa, 400);
}

function guardarYa() {
  clearTimeout(guardadoPendiente);
  try {
    localStorage.setItem(GUARDADO, JSON.stringify(estado));
  } catch { /* lleno o bloqueado: sólo se pierde al recargar */ }
}

// Si se cierra o se oculta la página con un guardado pendiente, se guarda ya.
addEventListener('pagehide', guardarYa);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') guardarYa(); });

function buscar(clave: string) {
  return estado.biblioteca.find((e) => e.clave === clave) ?? GENERICOS.find((e) => e.clave === clave);
}

function fichaBase(e: Entrada, arma = '', perfil: Perfil | '' = '', nombre = ''): Ficha {
  const f = e.tipo === 'hoja' ? fichaDesdeHoja(e.json, { arma: arma || undefined, nombre: nombre || undefined }) : e.ficha;
  return perfil ? { ...f, perfil } : f;
}

/** Fichas y celdas de un equipo, en el mismo orden. */
function equipoDe(equipo: Integrante[]): { fichas: Ficha[]; celdas: (Celda | null)[] } {
  const fichas: Ficha[] = [];
  const celdas: (Celda | null)[] = [];
  for (const i of equipo) {
    const e = buscar(i.clave);
    if (!e) continue;
    fichas.push(conEstado(fichaBase(e, i.arma, i.perfil, i.nombre), i.estado));
    celdas.push(i.pos ?? null);
  }
  return { fichas, celdas };
}

function escenarioActual() {
  const selectorLuna = $<HTMLSelectElement>('faseLunar');
  const fase = (selectorLuna.disabled ? '' : selectorLuna.value) as OpcionesEscenario['faseLunar'] | '';
  const oscuridad = $<HTMLSelectElement>('oscuridad').value as OpcionesEscenario['oscuridad'] | '';
  const cuerdas = $<HTMLSelectElement>('cuerdas').value as OpcionesEscenario['cuerdas'] | '';
  const maniobras = $<HTMLSelectElement>('sinManiobras').value as '' | 'todos' | 'A' | 'B';
  const a = equipoDe(estado.equipoA);
  const b = equipoDe(estado.equipoB);
  // Si una ficha se repite, las copias se numeran (lo mismo que la consola).
  [a.fichas, b.fichas] = numerarCopias(a.fichas, b.fichas);
  const opciones: OpcionesEscenario = {
    ...casillasMarcadas(),
    ...(maniobras ? { sinManiobras: maniobras === 'todos' ? true : maniobras } : {}),
    ...(fase ? { faseLunar: fase } : {}),
    ...(oscuridad ? { oscuridad } : {}),
    ...(cuerdas ? { cuerdas } : {}),
    // Una copia: el mapa del estado se edita en el lugar y el motor guarda lo que preparó con él.
    mapa: { ...estado.mapa!, bloqueadas: [...estado.mapa!.bloqueadas], infranqueables: [...(estado.mapa!.infranqueables ?? [])] },
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

function terreno(): Set<string> {
  return new Set((estado.mapa!.infranqueables ?? []).map(claveCelda));
}

/** Celdas que no se pueden pisar: paredes y terreno infranqueable. */
function noTransitables(): Set<string> {
  return new Set([...paredes(), ...terreno()]);
}

/** Celdas ocupadas por paredes, terreno infranqueable o por otros luchadores. */
function ocupadas(salvo?: Integrante): Set<string> {
  const s = noTransitables();
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
  const vistas = noTransitables();
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
  tablero.mapa = { ancho: m.ancho, alto: m.alto, paredes: paredes(), terreno: terreno() };
  if (tablero.modo === 'editar') {
    tablero.fichas = fichasDelTablero();
    tablero.turno = tablero.sujeto = null;
    tablero.flecha = null;
    tablero.dano = null;
    tablero.estelas = [];
    tablero.areas = [];
  }
  tablero.dibujar();
}

tablero.alCambiarCelda = (c, tipo) => {
  const m = estado.mapa!;
  const otra = (x: Celda) => x.x !== c.x || x.y !== c.y;
  m.bloqueadas = m.bloqueadas.filter(otra);
  m.infranqueables = (m.infranqueables ?? []).filter(otra);
  if (tipo === 'pared') m.bloqueadas.push(c);
  if (tipo === 'terreno') m.infranqueables.push(c);
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
  m.infranqueables = (m.infranqueables ?? []).filter((c) => c.x < m.ancho && c.y < m.alto);
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
      return [{ clave, arma: x.arma ?? '', perfil: x.perfil ?? '', estado: x.estado ?? '', ...(x.nombre ? { nombre: x.nombre } : {}) }];
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
    estado.mapa = { ancho: o.mapa.ancho, alto: o.mapa.alto, bloqueadas: [...(o.mapa.bloqueadas ?? [])], infranqueables: [...(o.mapa.infranqueables ?? [])] };
    estado.equipoA.forEach((i, n) => (i.pos = o.posiciones?.A?.[n] ?? undefined));
    estado.equipoB.forEach((i, n) => (i.pos = o.posiciones?.B?.[n] ?? undefined));
  } else {
    // Sin mapa: el mismo mapa abierto y las mismas celdas que arma el motor (y la consola).
    const d = disposicionAbierta(estado.equipoA.length, estado.equipoB.length, esc.distanciaInicial ?? 10);
    estado.mapa = { ancho: d.ancho, alto: d.alto, bloqueadas: [] };
    estado.equipoA.forEach((i, k) => (i.pos = d.A[k]));
    estado.equipoB.forEach((i, k) => (i.pos = d.B[k]));
  }
  completarPosiciones();
  for (const { id } of CASILLAS) ($(id) as HTMLInputElement).checked = !!o[id];
  ($('sinManiobras') as HTMLSelectElement).value = o.sinManiobras === true ? 'todos' : o.sinManiobras || '';
  ($('faseLunar') as HTMLSelectElement).value = o.faseLunar ?? '';
  ($('oscuridad') as HTMLSelectElement).value = o.oscuridad ?? '';
  ($('cuerdas') as HTMLSelectElement).value = o.cuerdas ?? '';
  estado.opciones = leerOpciones();
  return errores;
}

// ---------- Compendio y equipos ----------

/** Resumen de cada entrada: leer una planilla es caro y el compendio se redibuja seguido. */
const resumenes = new WeakMap<Entrada, Resumen>();

function datosDe(e: Entrada): Resumen {
  let r = resumenes.get(e);
  if (!r) {
    try {
      r = resumenFicha(fichaBase(e));
    } catch (error) {
      r = { lineas: [`No se pudo leer: ${error instanceof Error ? error.message : error}`], detalle: '' };
    }
    resumenes.set(e, r);
  }
  return r;
}

function sumar(e: Entrada, equipo: 'equipoA' | 'equipoB') {
  const i: Integrante = { clave: e.clave, arma: '', perfil: '' };
  estado[equipo].push(i);
  i.pos = celdaParaNuevo(equipo === 'equipoA' ? 'A' : 'B');
  if (!i.pos) avisar('No queda lugar libre en el mapa: agrandalo o sacá paredes o terreno.');
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
      ...datosDe(e).lineas.map((linea) => crear('span', { className: 'datos', title: datosDe(e).detalle }, linea)),
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
        selector(ESTADOS_INICIALES.map(([v, texto]): [string, string] => [v, texto]), i.estado ?? '', cambiar('estado'))));
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
    'Cae en asalto', 'Ataques', 'Contras', 'Cansancio', 'Def. total', 'Maniobras', 'Técnicas y conjuros'];
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
  let mostrado: ResultadoMonteCarlo | null = null;
  corrida = correrEnParalelo(esc, combates, {
    hilos: Math.max(1, Math.round(numeroDe('hilos'))),
    semilla: Math.max(1, Math.round(numeroDe('semilla'))),
    alAvanzar: (hechos, parcial) => {
      barra.style.width = `${(100 * hechos) / combates}%`;
      // La tabla sólo cambia cuando termina una tanda; el resto de los avisos mueven la barra.
      if (parcial && parcial !== mostrado) mostrarResultado((mostrado = parcial), false);
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

// ---------- En vivo ----------

/** Cuánto dura cada línea con la velocidad elegida. */
function duracion(e: Evento): number {
  return duracionDe(e, Number(($('velocidad') as HTMLSelectElement).value) || 1);
}

/** Un combate para ver sobre el mapa, línea por línea. */
interface Funcion {
  r: ResultadoCombate;
  semilla: number;
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

  funcion = { r, semilla, ids, lineas, indice: -1, reproduciendo: false, temporizador: 0 };
  tablero.modo = 'ver';
  tablero.mapa = { ancho: r.mapa.ancho, alto: r.mapa.alto, ...celdasDe(r) };
  $('editor').hidden = true;
  $('controles').hidden = false;
  $('narracion').hidden = false;
  irA(0);
  reproducir(true);
  $('panelMapa').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  // Quien huyó dejó el campo: no se dibuja (los caídos sí, tachados).
  const fichas: FichaTablero[] = [];
  f.r.luchadores.forEach((l, j) => {
    const s = foto[j] ?? { x: l.pos.x, y: l.pos.y, pv: l.pv, estado: l.estado, aLaDefensiva: false };
    if (s.estado === 'huido') return;
    fichas.push({
      id: f.ids[j], nombre: l.ficha.nombre, equipo: l.equipo, x: s.x, y: s.y, pv: s.pv, pvMax: l.ficha.pv,
      caido: s.estado !== 'activo', aLaDefensiva: s.aLaDefensiva, marcas: s.marcas,
    });
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
  // Áreas: las zonas activas (punteadas) y la del conjuro o técnica de esta línea.
  tablero.areas = [...(e.zonas ?? []).map((z) => ({ ...z, zona: true })), ...(e.area ? [{ ...e.area, zona: false }] : [])];
  tablero.sujeto = e.sujeto !== undefined ? f.ids[e.sujeto] : null;

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
    if (s?.estado === 'huido') clases.push('huido');
    else if (s && s.estado !== 'activo') clases.push('caido');
    else if (s?.aLaDefensiva) clases.push('defensiva');
    return crear('span', { className: clases.join(' '), title: textoEstado(l.ficha.nombre, l.ficha.pv, s, l.pv) },
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
    crear('span', { className: 'cartel-linea' }, ...resaltarTiradas(e.texto.trim())));
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
  tablero.areas = [];
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
for (const r of document.querySelectorAll<HTMLInputElement>('input[name="pincel"]'))
  r.addEventListener('change', () => { if (r.checked) tablero.pincel = r.value as Pincel; });
$('limpiarParedes').addEventListener('click', () => {
  estado.mapa!.bloqueadas = [];
  estado.mapa!.infranqueables = [];
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
