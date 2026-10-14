// Tablero en canvas, al estilo BattleCast: grilla de celdas de 1 m con paredes, y las fichas de los
// luchadores. Sirve para editar (arrastrar fichas, pintar paredes) y para ver un combate en vivo.

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
}

export interface MapaTablero {
  ancho: number;
  alto: number;
  /** Celdas no transitables, como "x,y". */
  paredes: Set<string>;
}

interface Arrastre {
  id: string;
  x: number;
  y: number;
}

const clave = (c: Celda) => `${c.x},${c.y}`;

export class Tablero {
  readonly canvas: HTMLCanvasElement;
  mapa: MapaTablero = { ancho: 20, alto: 12, paredes: new Set() };
  fichas: FichaTablero[] = [];
  /** En "ver" no se puede editar. */
  modo: 'editar' | 'ver' = 'editar';
  /** Al ver: quién actúa y a quién, para resaltarlos. */
  actor: string | null = null;
  objetivo: string | null = null;
  /** Al pintar o borrar una pared. */
  alCambiarPared: (c: Celda, pared: boolean) => void = () => {};
  /** Al soltar una ficha en otra celda. */
  alMoverFicha: (id: string, c: Celda) => void = () => {};

  private celda = 28;
  private arrastre: Arrastre | null = null;
  private pintando: boolean | null = null;
  private ultimaPintada: Celda | null = null;
  private desde: Map<string, { x: number; y: number }> | null = null;
  private progreso = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.addEventListener('pointerdown', (e) => this.apretar(e));
    canvas.addEventListener('pointermove', (e) => this.mover(e));
    canvas.addEventListener('pointerup', (e) => this.soltar(e));
    canvas.addEventListener('pointercancel', () => this.cancelar());
    new ResizeObserver(() => this.dibujar()).observe(canvas.parentElement!);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.dibujar());
  }

  /**
   * Mueve las fichas desde donde estaban hasta las posiciones nuevas en `ms` milisegundos. Las que
   * aparecen o no se movieron quedan quietas.
   */
  animar(nuevas: FichaTablero[], ms: number) {
    const antes = new Map(this.fichas.map((f) => [f.id, { x: f.x, y: f.y }]));
    this.fichas = nuevas;
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
    const inicio = performance.now();
    const paso = (t: number) => {
      this.progreso = Math.min(1, (t - inicio) / ms);
      this.dibujar();
      if (this.progreso < 1 && this.desde === antes) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }

  // ---------- Dibujo ----------

  dibujar() {
    const { ancho, alto } = this.mapa;
    const disponible = this.canvas.parentElement!.clientWidth;
    this.celda = Math.max(12, Math.min(40, Math.floor(disponible / ancho)));
    const c = this.celda;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.width = `${ancho * c}px`;
    this.canvas.style.height = `${alto * c}px`;
    this.canvas.width = Math.round(ancho * c * dpr);
    this.canvas.height = Math.round(alto * c * dpr);
    const g = this.canvas.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const css = getComputedStyle(document.documentElement);
    const color = (v: string) => css.getPropertyValue(v).trim();

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

    // Los caídos abajo, así no tapan a los que siguen en pie.
    const orden = [...this.fichas].sort((a, b) => Number(!!b.caido) - Number(!!a.caido));
    for (const f of orden) this.dibujarFicha(g, f, color);
  }

  private dibujarFicha(g: CanvasRenderingContext2D, f: FichaTablero, color: (v: string) => string) {
    const c = this.celda;
    let x = f.x, y = f.y;
    if (this.arrastre?.id === f.id) ({ x, y } = this.arrastre);
    else if (this.desde && this.progreso < 1) {
      const a = this.desde.get(f.id);
      if (a) {
        const t = 1 - (1 - this.progreso) ** 2;
        x = a.x + (f.x - a.x) * t;
        y = a.y + (f.y - a.y) * t;
      }
    }
    const cx = x * c + c / 2, cy = y * c + c / 2, r = c * 0.4;
    const equipo = color(f.equipo === 'A' ? '--equipo-a' : '--equipo-b');
    g.globalAlpha = f.caido ? 0.35 : 1;
    if (f.id === this.actor || f.id === this.objetivo) {
      g.beginPath();
      g.arc(cx, cy, r + 4, 0, Math.PI * 2);
      g.fillStyle = f.id === this.actor ? color('--resalte-actor') : color('--resalte-objetivo');
      g.fill();
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
    if (f.pv !== undefined && f.pvMax) {
      const w = c * 0.84, h = Math.max(3, c * 0.1);
      const bx = cx - w / 2, by = y * c + c - h - 1;
      g.fillStyle = color('--barra-fondo');
      g.fillRect(bx, by, w, h);
      const parte = Math.max(0, Math.min(1, f.pv / f.pvMax));
      g.fillStyle = parte > 0.5 ? color('--vida-alta') : parte > 0.25 ? color('--vida-media') : color('--vida-baja');
      g.fillRect(bx, by, w * parte, h);
    }
    g.globalAlpha = 1;
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
    if (f) {
      this.arrastre = { id: f.id, x: c.x, y: c.y };
      return;
    }
    // Sobre una celda vacía: si era pared se borra, si no se pinta; arrastrando sigue igual.
    this.pintando = !this.mapa.paredes.has(clave(c));
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
    if (!this.mapa.paredes.has(clave(c)) && (!ocupante || ocupante.id === a.id)) this.alMoverFicha(a.id, c);
    this.dibujar();
  }

  private cancelar() {
    this.arrastre = null;
    this.pintando = null;
    this.ultimaPintada = null;
  }

  private pintar(c: Celda) {
    if (this.fichaEn(c)) return; // no se levanta una pared encima de alguien
    const tiene = this.mapa.paredes.has(clave(c));
    if (tiene === this.pintando) return;
    this.alCambiarPared(c, this.pintando!);
  }
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
