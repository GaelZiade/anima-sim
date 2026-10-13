// Página base: cargar planillas, armar dos equipos, correr el Monte Carlo en workers y narrar un
// combate. Todo en el navegador; lo cargado se recuerda en localStorage.

import { armasCuerpoACuerpo, jsonAFicha, leerHoja } from '../src/hoja/ficha';
import type { HojaJson } from '../src/hoja/hojaAJson';
import { simularCombate } from '../src/motor/combate';
import type { Ficha, OpcionesEscenario, Perfil } from '../src/motor/modelo';
import type { ResultadoMonteCarlo } from '../src/motor/montecarlo';
import { correrEnParalelo, type Corrida } from './paralelo';

type Entrada =
  | { clave: string; nombre: string; tipo: 'hoja'; json: HojaJson }
  | { clave: string; nombre: string; tipo: 'ficha'; ficha: Ficha };

interface Integrante {
  clave: string;
  /** Nombre del arma; vacío: la mejor cuerpo a cuerpo. */
  arma: string;
  /** Vacío: el de la ficha. */
  perfil: Perfil | '';
}

interface Estado {
  biblioteca: Entrada[];
  equipoA: Integrante[];
  equipoB: Integrante[];
}

/** Lo que trae un escenario .json (el mismo formato que usa el CLI). */
interface EscenarioJson {
  distanciaInicial?: number;
  opciones?: OpcionesEscenario;
  equipoA: (Ficha | { hoja: string; arma?: string; perfil?: Perfil; nombre?: string })[];
  equipoB: EscenarioJson['equipoA'];
}

const PERFILES: [Perfil | '', string][] = [
  ['', 'Perfil de la ficha'], ['agresivo', 'Agresivo'], ['equilibrado', 'Equilibrado'], ['cauto', 'Cauto'], ['bestia', 'Bestia'],
];
const GUARDADO = 'anima-sim:estado';

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

function guardar() {
  try {
    localStorage.setItem(GUARDADO, JSON.stringify(estado));
  } catch { /* lleno o bloqueado: sólo se pierde al recargar */ }
}

function buscar(clave: string) {
  return estado.biblioteca.find((e) => e.clave === clave);
}

function fichaBase(e: Entrada, arma = '', perfil: Perfil | '' = ''): Ficha {
  const f = e.tipo === 'hoja' ? jsonAFicha(e.json, { arma: arma || undefined }) : e.ficha;
  return perfil ? { ...f, perfil } : f;
}

/** Fichas de un equipo. Si una ficha se repite, las copias se numeran para distinguirlas. */
function fichasDe(equipo: Integrante[], vistos: Map<string, number>): Ficha[] {
  return equipo.flatMap((i) => {
    const e = buscar(i.clave);
    if (!e) return [];
    const f = fichaBase(e, i.arma, i.perfil);
    const n = (vistos.get(f.id) ?? 0) + 1;
    vistos.set(f.id, n);
    return [n === 1 ? f : { ...f, id: `${f.id}-${n}`, nombre: `${f.nombre} (${n})` }];
  });
}

function escenarioActual() {
  const vistos = new Map<string, number>();
  const fase = ($('faseLunar') as HTMLSelectElement).value as OpcionesEscenario['faseLunar'] | '';
  const opciones: OpcionesEscenario = {
    rotura: marcado('rotura'),
    huida: marcado('huida'),
    espacioReducido: marcado('espacioReducido'),
    armasEnfundadas: marcado('armasEnfundadas'),
    ...(fase ? { faseLunar: fase } : {}),
  };
  return {
    equipoA: fichasDe(estado.equipoA, vistos),
    equipoB: fichasDe(estado.equipoB, vistos),
    distanciaInicial: numeroDe('distancia'),
    escenario: opciones,
  };
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
        escenarios.push(JSON.parse(await archivo.text()) as EscenarioJson);
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
  guardar();
  dibujar();
}

function aplicarEscenario(esc: EscenarioJson): string[] {
  const errores: string[] = [];
  const integrantes = (lista: EscenarioJson['equipoA']): Integrante[] => lista.flatMap((x) => {
    if ('hoja' in x) {
      const clave = nombreDeArchivo(x.hoja);
      if (!buscar(clave)) {
        errores.push(`Falta cargar la planilla "${clave}"`);
        return [];
      }
      return [{ clave, arma: x.arma ?? '', perfil: x.perfil ?? '' }];
    }
    const clave = `ficha:${x.id}`;
    agregarALaBiblioteca({ clave, nombre: x.nombre, tipo: 'ficha', ficha: x });
    return [{ clave, arma: '', perfil: '' }];
  });
  estado.equipoA = integrantes(esc.equipoA ?? []);
  estado.equipoB = integrantes(esc.equipoB ?? []);
  if (esc.distanciaInicial !== undefined) ($('distancia') as HTMLInputElement).value = String(esc.distanciaInicial);
  const o = esc.opciones ?? {};
  for (const id of ['rotura', 'huida', 'espacioReducido', 'armasEnfundadas'] as const) ($(id) as HTMLInputElement).checked = !!o[id];
  ($('faseLunar') as HTMLSelectElement).value = o.faseLunar ?? '';
  return errores;
}

// ---------- Dibujo ----------

function dibujarBiblioteca() {
  const lista = $('biblioteca');
  lista.replaceChildren(...estado.biblioteca.map((e) => {
    let datos: string;
    try {
      const f = fichaBase(e);
      datos = `PV ${f.pv} · Turno ${f.turno} · HA ${f.ataque} · HD ${f.defensa} · Daño ${f.danoBase}`;
    } catch (error) {
      datos = `No se pudo leer: ${error instanceof Error ? error.message : error}`;
    }
    const sumar = (equipo: 'equipoA' | 'equipoB') => () => {
      estado[equipo].push({ clave: e.clave, arma: '', perfil: '' });
      guardar();
      dibujarEquipos();
    };
    const quitar = () => {
      estado.biblioteca = estado.biblioteca.filter((x) => x !== e);
      estado.equipoA = estado.equipoA.filter((i) => i.clave !== e.clave);
      estado.equipoB = estado.equipoB.filter((i) => i.clave !== e.clave);
      guardar();
      dibujar();
    };
    return crear('li', {},
      crear('span', { className: 'nombre', title: e.clave }, e.nombre),
      crear('span', { className: 'datos' }, datos),
      crear('div', { className: 'botones' },
        crear('button', { type: 'button', className: 'chico', onclick: sumar('equipoA') }, '+ Equipo A'),
        crear('button', { type: 'button', className: 'chico', onclick: sumar('equipoB') }, '+ Equipo B'),
        crear('button', { type: 'button', className: 'chico', onclick: quitar, title: 'Quitar de la lista' }, 'Quitar')));
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
    lista.replaceChildren(crear('li', { className: 'vacio' }, 'Agregá fichas desde la lista de arriba.'));
    return;
  }
  lista.replaceChildren(...integrantes.map((i, n) => {
    const e = buscar(i.clave)!;
    const cambiar = (campo: 'arma' | 'perfil') => (v: string) => {
      (i as unknown as Record<string, string>)[campo] = v;
      guardar();
    };
    const armas: [string, string][] = e.tipo === 'hoja'
      ? [['', 'Mejor arma'], ...armasCuerpoACuerpo(e.json).map((a): [string, string] => [a.nombre, a.nombre])]
      : [['', e.ficha.arma?.nombre ?? 'Arma de la ficha']];
    const quitar = () => {
      integrantes.splice(n, 1);
      guardar();
      dibujarEquipo(clave);
    };
    return crear('li', {},
      crear('strong', {}, e.nombre),
      crear('button', { type: 'button', className: 'chico', onclick: quitar, title: 'Sacar del equipo' }, '×'),
      crear('div', { className: 'campos' },
        selector(armas, i.arma, cambiar('arma')),
        selector(PERFILES, i.perfil, cambiar('perfil'))));
  }));
}

function dibujarEquipos() {
  dibujarEquipo('equipoA');
  dibujarEquipo('equipoB');
}

function dibujar() {
  dibujarBiblioteca();
  dibujarEquipos();
}

const pct = (x: number, total: number) => `${((100 * x) / total).toFixed(1)}%`;

function mostrarResultado(r: ResultadoMonteCarlo, final: boolean) {
  $('resultados').hidden = false;
  const barra = $('victorias');
  const tramos: [string, number, string][] = [['a', r.victoriasA, 'A'], ['e', r.empates, 'Empate'], ['b', r.victoriasB, 'B']];
  barra.replaceChildren(...tramos.filter(([, n]) => n > 0).map(([c, n, texto]) =>
    crear('div', { className: c, style: `flex: ${n}`, title: `${texto}: ${pct(n, r.combates)}` },
      `${texto} ${pct(n, r.combates)}`)));
  const velocidad = Math.round(r.combates / (r.milisegundos / 1000));
  $('resumen').textContent = `${r.combates.toLocaleString('es')} combates${final ? ` en ${(r.milisegundos / 1000).toFixed(2)} s (${velocidad.toLocaleString('es')}/s)` : '…'}`
    + ` · asaltos promedio ${r.asaltosMedio.toFixed(2)}`;

  const huida = r.luchadores.some((l) => l.huida > 0);
  const columnas = ['Luchador', 'Sobrevive', ...(huida ? ['Huye'] : []), 'Daño hecho', 'Daño recibido', 'Críticos',
    'Cae en asalto', 'Ataques', 'Contras', 'Cansancio', 'Def. total', 'Maniobras'];
  const filas = r.luchadores.map((l) => [
    crear('span', {}, crear('span', { className: `marca ${l.equipo.toLowerCase()}` }), ` ${l.nombre}`),
    `${(l.supervivencia * 100).toFixed(1)}%`,
    ...(huida ? [`${(l.huida * 100).toFixed(1)}%`] : []),
    l.danoCausado.toFixed(1), l.danoRecibido.toFixed(1), l.criticos.toFixed(2),
    l.asaltoCaidaMedio?.toFixed(2) ?? '-', l.ataquesPorCombate.toFixed(2), l.contrasPorCombate.toFixed(2),
    l.cansancioPorCombate.toFixed(2), l.defensaTotalPorCombate.toFixed(2),
    // Veces por combate; las que casi no se usan no se muestran.
    Object.entries(l.maniobras).filter(([, n]) => n >= 0.005).map(([m, n]) => `${m} ${n.toFixed(2)}`).join(', ') || '-',
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

function narrar() {
  const esc = validar();
  if (!esc) return;
  const semilla = Math.max(1, Math.round(numeroDe('semilla')));
  const r = simularCombate(esc.equipoA, esc.equipoB, {
    semilla, registrar: true, distanciaInicial: esc.distanciaInicial, escenario: esc.escenario,
  });
  const nodos: HTMLElement[] = [];
  let asalto = -1;
  for (const e of r.registro ?? []) {
    if (e.asalto !== asalto) {
      asalto = e.asalto;
      nodos.push(crear('h3', {}, `Asalto ${asalto}`));
    }
    nodos.push(crear('p', {}, e.texto));
  }
  const ganador = r.ganador === 'empate' ? 'Empate' : `Gana el equipo ${r.ganador}`;
  nodos.push(crear('h3', {}, `${ganador} en ${r.asaltos} asaltos (semilla ${semilla})`));
  $('registro').replaceChildren(...nodos);
  $('narracion').hidden = false;
  $('narracion').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
$('simular').addEventListener('click', () => void simular());
$('cancelar').addEventListener('click', () => corrida?.cancelar());
$('narrar').addEventListener('click', narrar);
($('hilos') as HTMLInputElement).value = String(navigator.hardwareConcurrency || 4);

dibujar();
