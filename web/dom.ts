// Atajos para el DOM de la página.

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
export const numeroDe = (id: string) => Number(($(id) as HTMLInputElement).value);
export const marcado = (id: string) => ($(id) as HTMLInputElement).checked;

/** Elemento con propiedades (`className`, `onclick`, `style` como texto…) e hijos. */
export function crear<K extends keyof HTMLElementTagNameMap>(etiqueta: K, props: Record<string, unknown> = {}, ...hijos: (Node | string)[]) {
  const el: HTMLElementTagNameMap[K] = Object.assign(document.createElement(etiqueta), props);
  el.append(...hijos);
  return el;
}
