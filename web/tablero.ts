// Tablero en canvas, al estilo BattleCast: grilla de celdas de 1 m con paredes, y las fichas de los
// luchadores. Sirve para editar (arrastrar fichas, pintar paredes) y para ver un combate en vivo:
// recorridos con estela, de quién es el turno, flechas de ataque y daño.

import type { Celda } from '../src/motor/mapa';

export interface FichaTablero {
  id: string;
  nombre: string;
  equipo: 'A' | 'B';
  x: number;
  y: number;
  /** Sólo al ver un combate. */
  pv?: number;
  pvMax?: number;
  caido?: boolean;
  aLaDefensiva?: boolean;
  /** Estados a la vista (derribado, en llamas, ceguera…): un punto sobre la ficha. */
  marcas?: string[];
}

export interface MapaTablero {
  ancho: number;
  alto: number;
  /** Paredes (no se pasa ni se ve), como "x,y". */
  paredes: Set<string>;
  /** Terreno infranqueable (no se pasa, pero se ve): abismo, agua, lava. */
  terreno: Set<string>;
}

/** Qué pinta el clic izquierdo al editar. */
export type Pincel = 'pared' | 'terreno';

/** Un ataque para dibujar: flecha de quien ataca a quien defiende. */
export interface FlechaAtaque {
  de: string;
  a: string;
  /** impacto: resultado positivo; falla: se defendió; pifia: el ataque pifió. */
  tipo: 'impacto' | 'falla' | 'pifia';
  contra: boolean;
}

/** Recorrido ya hecho en el asalto; el de la línea actual se dibuja a medida que avanza. */
export interface Estela {
  id: string;
  equipo: 'A' | 'B';
  celdas: Celda[];
  actual: boolean;
}

interface Arrastre {
  id: string;
  x: number;
  y: number;
}

const clave = (c: Celda) => `${c.x},${c.y}`;

export class Tablero {
  readonly canvas: HTMLCanvasElement;
  mapa: MapaTablero = { ancho: 20, alto: 12, paredes: new Set(), terreno: new Set() };
  /** Qué pone el clic izquierdo. */
  pincel: Pincel = 'pared';
  fichas: FichaTablero[] = [];
  /** En "ver" no se puede editar. */
  modo: 'editar' | 'ver' = 'editar';
  /** Al ver: de quién es el turno. */
  turno: string | null = null;
  /** Al ver: de quién habla la línea, cuando no es un ataque. */
  sujeto: string | null = null;
  flecha: FlechaAtaque | null = null;
  dano: { id: string; cantidad: number } | null = null;
  estelas: Estela[] = [];
  /** Al pintar una pared o terreno (null: al borrar). */
  alCambiarCelda: (c: Celda, tipo: Pincel | null) => void = () => {};
  /** Al soltar una ficha en otra celda. */
  alMoverFicha: (id: string, c: Celda) => void = () => {};

  private celda = 28;
  private arrastre: Arrastre | null = null;
  private pintando: boolean | null = null;
  private ultimaPintada: Celda | null = null;
  /** Animación en curso: de dónde sale cada ficha y por qué celdas pasa. */
  private desde: Map<string, Celda> | null = null;
  private caminos = new Map<string, Celda[]>();
  private progreso = 1;
  private animacion = 0;
  /** Colores del tema, leídos del CSS una vez (se vacía al cambiar de tema). */
  private colores = new Map<string, string>();
  /** Suelo, grilla, paredes y terreno ya dibujados: sólo cambian con el mapa, el tamaño o el tema. */
  private fondo: { lienzo: HTMLCanvasElement; mapa: MapaTablero; celda: number; dpr: number } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.addEventListener('pointerdown', (e) => this.apretar(e));
    canvas.addEventListener('pointermove', (e) => this.mover(e));
    canvas.addEventListener('pointerup', (e) => this.soltar(e));
    canvas.addEventListener('pointercancel', () => this.cancelar());
    // El clic derecho borra paredes: sin menú contextual sobre el mapa.
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    new ResizeObserver(() => this.dibujar()).observe(canvas.parentElement!);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      this.colores.clear();
      this.fondo = null;
      this.dibujar();
    });
  }

  /**
   * Lleva las fichas a sus posiciones nuevas en `ms` milisegundos: por las celdas de `caminos` si
   * las hay, si no en línea recta. Las que no se mueven quedan quietas.
   */
  animar(nuevas: FichaTablero[], ms: number, caminos = new Map<string, Celda[]>()) {
    const antes = new Map(this.fichas.map((f) => [f.id, { x: f.x, y: f.y }]));
    this.fichas = nuevas;
    this.caminos = caminos;
    cancelAnimationFrame(this.animacion);
    const seMueve = nuevas.some((f) => {
      const a = antes.get(f.id);
      return a && (a.x !== f.x || a.y !== f.y);
    });
    if (!seMueve || ms <= 0) {
      this.desde = null;
      this.progreso = 1;
      this.dibujar();
      return;
    }
    this.desde = antes;
    this.progreso = 0;
    const inicio = performance.now();
    const paso = (t: number) => {
      this.progreso = Math.min(1, (t - inicio) / ms);
      this.dibujar();
      if (this.progreso < 1) this.animacion = requestAnimationFrame(paso);
    };
    this.animacion = requestAnimationFrame(paso);
  }

  // ---------- Dibujo ----------

  private color = (v: string): string => {
    let c = this.colores.get(v);
    if (c === undefined) this.colores.set(v, (c = getComputedStyle(document.documentElement).getPropertyValue(v).trim()));
    return c;
  };

  dibujar() {
    const { ancho, alto } = this.mapa;
    const disponible = this.canvas.parentElement!.clientWidth;
    this.celda = Math.max(12, Math.min(40, Math.floor(disponible / ancho)));
    const c = this.celda;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(ancho * c * dpr), h = Math.round(alto * c * dpr);
    // Reasignar el tamaño reinicia el lienzo: sólo si cambió.
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.style.width = `${ancho * c}px`;
      this.canvas.style.height = `${alto * c}px`;
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const g = this.canvas.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.lienzoFondo(dpr), 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const color = this.color;

    for (const e of this.estelas) this.dibujarEstela(g, e, color);
    // Los caídos abajo, así no tapan a los que siguen en pie.
    const orden = [...this.fichas].sort((a, b) => Number(!!b.caido) - Number(!!a.caido));
    for (const f of orden) this.dibujarFicha(g, f, color);
    if (this.flecha) this.dibujarFlecha(g, this.flecha, color);
    if (this.dano) this.dibujarDano(g, this.dano, color);
    const t = this.turno && this.fichas.find((f) => f.id === this.turno);
    if (t) this.dibujarTurno(g, t, color);
  }

  /** La capa de fondo: se rehace sólo si cambiaron el mapa (se reemplaza entero al editarlo), la celda o el tema. */
  private lienzoFondo(dpr: number): HTMLCanvasElement {
    const f = this.fondo;
    if (f && f.mapa === this.mapa && f.celda === this.celda && f.dpr === dpr) return f.lienzo;
    const { ancho, alto } = this.mapa;
    const c = this.celda;
    const lienzo = f?.lienzo ?? document.createElement('canvas');
    lienzo.width = this.canvas.width;
    lienzo.height = this.canvas.height;
    const g = lienzo.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const color = this.color;
    g.fillStyle = color('--suelo');
    g.fillRect(0, 0, ancho * c, alto * c);
    // Grilla: cada 5 m una línea más marcada, para medir a ojo.
    for (let x = 0; x <= ancho; x++) {
      g.strokeStyle = x % 5 === 0 ? color('--grilla-fuerte') : color('--grilla');
      g.beginPath();
      g.moveTo(x * c + 0.5, 0);
      g.lineTo(x * c + 0.5, alto * c);
      g.stroke();
    }
    for (let y = 0; y <= alto; y++) {
      g.strokeStyle = y % 5 === 0 ? color('--grilla-fuerte') : color('--grilla');
      g.beginPath();
      g.moveTo(0, y * c + 0.5);
      g.lineTo(ancho * c, y * c + 0.5);
      g.stroke();
    }
    g.fillStyle = color('--pared');
    for (const k of this.mapa.paredes) {
      const [x, y] = k.split(',').map(Number);
      if (x < ancho && y < alto) g.fillRect(x * c, y * c, c, c);
    }
    // El terreno infranqueable, con rayas: se ve a través, pero no se pisa.
    for (const k of this.mapa.terreno) {
      const [x, y] = k.split(',').map(Number);
      if (x >= ancho || y >= alto) continue;
      g.fillStyle = color('--terreno');
      g.fillRect(x * c, y * c, c, c);
      g.strokeStyle = color('--terreno-raya');
      g.beginPath();
      for (let k2 = 0.25; k2 < 1; k2 += 0.25) {
        g.moveTo(x * c + k2 * c, y * c);
        g.lineTo(x * c, y * c + k2 * c);
        g.moveTo(x * c + c, y * c + k2 * c);
        g.lineTo(x * c + k2 * c, y * c + c);
      }
      g.stroke();
    }
    this.fondo = { lienzo, mapa: this.mapa, celda: c, dpr };
    return lienzo;
  }

  /** Dónde se dibuja una ficha ahora (en celdas, con decimales si se está moviendo). */
  private dondeEsta(f: FichaTablero): { x: number; y: number } {
    if (this.arrastre?.id === f.id) return this.arrastre;
    if (!this.desde || this.progreso >= 1) return f;
    const t = suave(this.progreso);
    const camino = this.caminos.get(f.id);
    if (camino && camino.length > 1) return puntoEn(camino, t);
    const a = this.desde.get(f.id);
    if (!a) return f;
    return { x: a.x + (f.x - a.x) * t, y: a.y + (f.y - a.y) * t };
  }

  private centro(p: { x: number; y: number }) {
    return { x: p.x * this.celda + this.celda / 2, y: p.y * this.celda + this.celda / 2 };
  }

  private dibujarEstela(g: CanvasRenderingContext2D, e: Estela, color: (v: string) => string) {
    let puntos: { x: number; y: number }[] = e.celdas;
    // La del movimiento actual crece con la ficha.
    if (e.actual && this.desde && this.progreso < 1) {
      const f = this.fichas.find((x) => x.id === e.id);
      if (f) puntos = [...hastaProgreso(e.celdas, suave(this.progreso)), this.dondeEsta(f)];
    }
    if (puntos.length < 2) return;
    g.save();
    g.globalAlpha = e.actual ? 0.75 : 0.35;
    g.strokeStyle = color(e.equipo === 'A' ? '--equipo-a' : '--equipo-b');
    g.lineWidth = Math.max(2, this.celda * 0.14);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.setLineDash([this.celda * 0.25, this.celda * 0.2]);
    g.beginPath();
    puntos.forEach((p, i) => {
      const q = this.centro(p);
      if (i === 0) g.moveTo(q.x, q.y);
      else g.lineTo(q.x, q.y);
    });
    g.stroke();
    g.setLineDash([]);
    // Un punto en cada celda pisada.
    g.fillStyle = g.strokeStyle;
    for (const p of puntos.slice(0, -1)) {
      const q = this.centro(p);
      g.beginPath();
      g.arc(q.x, q.y, Math.max(1.5, this.celda * 0.07), 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  private dibujarFicha(g: CanvasRenderingContext2D, f: FichaTablero, color: (v: string) => string) {
    const c = this.celda;
    const p = this.dondeEsta(f);
    const { x: cx, y: cy } = this.centro(p);
    const r = c * 0.4;
    const equipo = color(f.equipo === 'A' ? '--equipo-a' : '--equipo-b');
    g.globalAlpha = f.caido ? 0.35 : 1;
    // A quien habla la línea (cuando no es un ataque) se lo marca suave.
    if (f.id === this.sujeto && !this.flecha) {
      g.beginPath();
      g.arc(cx, cy, r + 4, 0, Math.PI * 2);
      g.fillStyle = color('--resalte-actor');
      g.fill();
    }
    if (this.flecha && f.id === this.flecha.a) {
      // Quien recibe el ataque: aro grueso del color del resultado.
      g.beginPath();
      g.arc(cx, cy, r + Math.max(3, c * 0.13), 0, Math.PI * 2);
      g.lineWidth = Math.max(3, c * 0.13);
      g.strokeStyle = color(this.flecha.contra ? '--flecha-contra' : this.flecha.tipo === 'impacto' ? '--flecha-impacto' : '--flecha-falla');
      g.stroke();
    }
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fillStyle = equipo;
    g.fill();
    if (f.aLaDefensiva && !f.caido) {
      g.lineWidth = 2;
      g.strokeStyle = color('--defensiva');
      g.setLineDash([3, 2]);
      g.stroke();
      g.setLineDash([]);
    }
    g.fillStyle = '#fff';
    g.font = `600 ${Math.max(9, Math.round(c * 0.36))}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(iniciales(f.nombre), cx, cy + 0.5);
    if (f.caido) {
      g.strokeStyle = color('--texto');
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx - r * 0.7, cy - r * 0.7);
      g.lineTo(cx + r * 0.7, cy + r * 0.7);
      g.moveTo(cx + r * 0.7, cy - r * 0.7);
      g.lineTo(cx - r * 0.7, cy + r * 0.7);
      g.stroke();
    }
    // Con algún estado encima, un punto en la esquina (el detalle está en la lista de turno).
    if (f.marcas?.length && !f.caido) {
      g.beginPath();
      g.arc(cx + r * 0.75, cy - r * 0.75, Math.max(2.5, c * 0.1), 0, Math.PI * 2);
      g.fillStyle = color('--marca-estado');
      g.fill();
    }
    if (f.pv !== undefined && f.pvMax) {
      const w = c * 0.84, h = Math.max(3, c * 0.1);
      const bx = cx - w / 2, by = cy + c / 2 - h - 1;
      g.fillStyle = color('--barra-fondo');
      g.fillRect(bx, by, w, h);
      const parte = Math.max(0, Math.min(1, f.pv / f.pvMax));
      g.fillStyle = parte > 0.5 ? color('--vida-alta') : parte > 0.25 ? color('--vida-media') : color('--vida-baja');
      g.fillRect(bx, by, w * parte, h);
    }
    g.globalAlpha = 1;
  }

  /** Marca de turno: un aro y un triángulo sobre la ficha. */
  private dibujarTurno(g: CanvasRenderingContext2D, f: FichaTablero, color: (v: string) => string) {
    const c = this.celda;
    const { x: cx, y: cy } = this.centro(this.dondeEsta(f));
    const r = c * 0.4;
    g.save();
    g.strokeStyle = color('--turno');
    g.lineWidth = Math.max(2, c * 0.09);
    g.beginPath();
    g.arc(cx, cy, r + Math.max(3, c * 0.12), 0, Math.PI * 2);
    g.stroke();
    const t = Math.max(5, c * 0.22);
    const arriba = cy - r - Math.max(5, c * 0.18);
    g.fillStyle = color('--turno');
    g.beginPath();
    g.moveTo(cx - t, arriba - t);
    g.lineTo(cx + t, arriba - t);
    g.lineTo(cx, arriba);
    g.closePath();
    g.fill();
    g.restore();
  }

  /** Flecha de quien ataca a quien defiende: sale de su centro y llega al borde del otro, con contorno. */
  private dibujarFlecha(g: CanvasRenderingContext2D, fl: FlechaAtaque, color: (v: string) => string) {
    const de = this.fichas.find((f) => f.id === fl.de);
    const a = this.fichas.find((f) => f.id === fl.a);
    if (!de || !a) return;
    const p = this.centro(this.dondeEsta(de)), q = this.centro(this.dondeEsta(a));
    const dx = q.x - p.x, dy = q.y - p.y, largo = Math.hypot(dx, dy);
    if (largo < 1) return;
    const ux = dx / largo, uy = dy / largo;
    const r = this.celda * 0.48;
    const x1 = p.x + ux * r * 0.3, y1 = p.y + uy * r * 0.3;
    const x2 = q.x - ux * (r + 1), y2 = q.y - uy * (r + 1);
    const tono = color(fl.contra ? '--flecha-contra' : fl.tipo === 'impacto' ? '--flecha-impacto' : '--flecha-falla');
    const punta = Math.max(7, this.celda * 0.3);
    const ancho = Math.max(3, this.celda * 0.14);
    const trazar = () => {
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2 - ux * punta * 0.6, y2 - uy * punta * 0.6);
      g.stroke();
    };
    const cabeza = () => {
      g.beginPath();
      g.moveTo(x2, y2);
      g.lineTo(x2 - ux * punta - uy * punta * 0.6, y2 - uy * punta + ux * punta * 0.6);
      g.lineTo(x2 - ux * punta + uy * punta * 0.6, y2 - uy * punta - ux * punta * 0.6);
      g.closePath();
    };
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // Contorno oscuro debajo, para que se vea sobre las fichas y el suelo.
    g.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    g.lineWidth = ancho + 3;
    trazar();
    cabeza();
    g.stroke();
    g.strokeStyle = tono;
    g.fillStyle = tono;
    g.lineWidth = ancho;
    if (fl.tipo === 'pifia') g.setLineDash([5, 4]);
    trazar();
    g.setLineDash([]);
    cabeza();
    g.fill();
    g.restore();
  }

  /** Daño flotando sobre quien lo recibe. */
  private dibujarDano(g: CanvasRenderingContext2D, d: { id: string; cantidad: number }, color: (v: string) => string) {
    const f = this.fichas.find((x) => x.id === d.id);
    if (!f) return;
    const { x: cx, y: cy } = this.centro(this.dondeEsta(f));
    const texto = `−${d.cantidad}`;
    g.save();
    g.font = `800 ${Math.max(12, Math.round(this.celda * 0.55))}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    const y = cy - this.celda * 0.5;
    g.lineWidth = 4;
    g.strokeStyle = color('--suelo');
    g.strokeText(texto, cx, y);
    g.fillStyle = color('--vida-baja');
    g.fillText(texto, cx, y);
    g.restore();
  }

  // ---------- Edición ----------

  private celdaDe(e: PointerEvent): Celda | null {
    const r = this.canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / this.celda);
    const y = Math.floor((e.clientY - r.top) / this.celda);
    return x >= 0 && y >= 0 && x < this.mapa.ancho && y < this.mapa.alto ? { x, y } : null;
  }

  private fichaEn(c: Celda) {
    return this.fichas.find((f) => f.x === c.x && f.y === c.y);
  }

  private apretar(e: PointerEvent) {
    if (this.modo !== 'editar') return;
    const c = this.celdaDe(e);
    if (!c) return;
    this.canvas.setPointerCapture(e.pointerId);
    const f = this.fichaEn(c);
    if (f && e.button === 0) {
      this.arrastre = { id: f.id, x: c.x, y: c.y };
      return;
    }
    // Clic izquierdo pinta (pared o terreno, según el pincel) y clic derecho borra; arrastrando sigue igual.
    if (e.button !== 0 && e.button !== 2) return;
    this.pintando = e.button === 0;
    this.ultimaPintada = c;
    this.pintar(c);
  }

  private mover(e: PointerEvent) {
    if (this.modo !== 'editar') return;
    const c = this.celdaDe(e);
    this.canvas.style.cursor = c && this.fichaEn(c) ? 'grab' : 'crosshair';
    if (!c) return;
    if (this.arrastre) {
      this.canvas.style.cursor = 'grabbing';
      if (this.arrastre.x !== c.x || this.arrastre.y !== c.y) {
        this.arrastre = { ...this.arrastre, x: c.x, y: c.y };
        this.dibujar();
      }
    } else if (this.pintando !== null) {
      // Todas las celdas entre la última y ésta: un movimiento rápido no deja huecos.
      for (const x of linea(this.ultimaPintada ?? c, c)) this.pintar(x);
      this.ultimaPintada = c;
    }
  }

  private soltar(e: PointerEvent) {
    const a = this.arrastre;
    this.cancelar();
    if (!a) return;
    const c = this.celdaDe(e) ?? { x: a.x, y: a.y };
    const ocupante = this.fichaEn(c);
    const libre = !this.mapa.paredes.has(clave(c)) && !this.mapa.terreno.has(clave(c));
    if (libre && (!ocupante || ocupante.id === a.id)) this.alMoverFicha(a.id, c);
    this.dibujar();
  }

  private cancelar() {
    this.arrastre = null;
    this.pintando = null;
    this.ultimaPintada = null;
  }

  private pintar(c: Celda) {
    if (this.fichaEn(c)) return; // no se levanta una pared encima de alguien
    const actual = this.mapa.paredes.has(clave(c)) ? 'pared' : this.mapa.terreno.has(clave(c)) ? 'terreno' : null;
    const nuevo = this.pintando ? this.pincel : null;
    if (actual === nuevo) return;
    this.alCambiarCelda(c, nuevo);
  }
}

/** Arranca y frena suave. */
function suave(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** Largos acumulados de un recorrido. */
function largos(camino: Celda[]): number[] {
  const res = [0];
  for (let i = 1; i < camino.length; i++)
    res.push(res[i - 1] + Math.hypot(camino[i].x - camino[i - 1].x, camino[i].y - camino[i - 1].y));
  return res;
}

/** Punto del recorrido a la fracción `t` de su largo. */
function puntoEn(camino: Celda[], t: number): { x: number; y: number } {
  const l = largos(camino);
  const objetivo = t * l[l.length - 1];
  for (let i = 1; i < camino.length; i++) {
    if (l[i] >= objetivo) {
      const parte = l[i] === l[i - 1] ? 1 : (objetivo - l[i - 1]) / (l[i] - l[i - 1]);
      return { x: camino[i - 1].x + (camino[i].x - camino[i - 1].x) * parte, y: camino[i - 1].y + (camino[i].y - camino[i - 1].y) * parte };
    }
  }
  return camino[camino.length - 1];
}

/** Celdas del recorrido ya pasadas a la fracción `t` de su largo. */
function hastaProgreso(camino: Celda[], t: number): Celda[] {
  const l = largos(camino);
  const objetivo = t * l[l.length - 1];
  return camino.filter((_, i) => l[i] <= objetivo);
}

/** Celdas de la recta entre dos celdas (Bresenham), extremos incluidos. */
function linea(a: Celda, b: Celda): Celda[] {
  const res: Celda[] = [];
  const dx = Math.abs(b.x - a.x), dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1, sy = a.y < b.y ? 1 : -1;
  let err = dx + dy, x = a.x, y = a.y;
  for (;;) {
    res.push({ x, y });
    if (x === b.x && y === b.y) return res;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function iniciales(nombre: string): string {
  const palabras = nombre.replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean);
  const numero = /\((\d+)\)/.exec(nombre)?.[1] ?? /\s(\d+)$/.exec(nombre)?.[1];
  const base = palabras.length > 1 ? palabras[0][0] + palabras[1][0] : (palabras[0] ?? '?').slice(0, 2);
  return (base.toUpperCase() + (numero ?? '')).slice(0, 3);
}
