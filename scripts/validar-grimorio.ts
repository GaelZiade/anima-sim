// Compara el grimorio generado (zeon e Inteligencia de cada grado) con los manuales en Markdown
// (repo privado anima-manuales). No copia nada: sólo informa las diferencias.
//
// Uso: npx tsx scripts/validar-grimorio.ts [carpeta de los manuales]

import { readFileSync, readdirSync } from 'node:fs';
import { GRIMORIO } from '../src/motor/grimorio';
import { CATALOGO } from '../src/motor/conjuros';
import { quitarAcentos } from '../src/hoja/libro';

const dir = process.argv[2] ?? '../anima-manuales';
const libros = readdirSync(dir).filter((f) => /^[12]\..*\.md$/.test(f));
const plano = (s: string) => quitarAcentos(s).toLowerCase().replace(/[*#_]/g, '').replace(/\s+/g, ' ');
const textos = libros.map((f) => ({ libro: f.slice(0, 2), texto: plano(readFileSync(`${dir}/${f}`, 'utf8')) }));

const cuatro = (s: string | undefined) => (s ? s.replace(/(\d)\.(\d{3})/g, '$1$2').match(/\d+/g)?.slice(0, 4).map(Number) : undefined);

let encontrados = 0;
const distintos: string[] = [];
const faltan: string[] = [];
for (const e of GRIMORIO) {
  const nombre = plano(e.nombre);
  let hallado = false;
  for (const { libro, texto } of textos) {
    // El nombre seguido de su ficha: "nivel: N" cerca, y después zeon e int. r.
    for (let i = texto.indexOf(nombre); i >= 0 && !hallado; i = texto.indexOf(nombre, i + 1)) {
      // La ficha del conjuro: el nombre seguido de "nivel" (no una mención en otro texto), hasta el
      // "nivel" del conjuro siguiente.
      if (!/^.{0,12}nivel/.test(texto.slice(i + nombre.length, i + nombre.length + 30))) continue;
      let trozo = texto.slice(i, i + 2500);
      const siguiente = trozo.slice(nombre.length + 30).search(/nivel:? ?\d/);
      if (siguiente > 0) trozo = trozo.slice(0, nombre.length + 30 + siguiente);
      const zeon = cuatro(/zeo ?n:? ([\d. ]+)/.exec(trozo)?.[1]);
      const int = cuatro(/int\. ?r\.?:? ([\d ]+)/.exec(trozo)?.[1]);
      if (!zeon || zeon.length < 4 || !int || int.length < 4) continue;
      hallado = true;
      encontrados++;
      const z = e.grados.map((g) => g.zeon);
      const n = e.grados.map((g) => g.int);
      if (z.join() !== zeon.join() || n.join() !== int.join())
        distintos.push(`${e.nombre} (${e.via} ${e.nivel}, libro ${libro}): grimorio zeon ${z} int ${n} | manual zeon ${zeon} int ${int}`);
    }
  }
  if (!hallado) faltan.push(`${e.nombre} (${e.via})`);
}
// Los simulados: el catálogo ya corrige lo que manda el manual; acá se ve si queda algo distinto.
const simulados = new Set(CATALOGO.map((c) => plano(c.nombre)));
const enCatalogo = distintos.filter((d) => simulados.has(plano(d.split(' (')[0])));
for (const c of CATALOGO) {
  const e = GRIMORIO.find((x) => plano(x.nombre) === plano(c.nombre))!;
  const cambia = c.grados.map((g, i) => (g.int !== e.grados[i].int || g.zeon !== e.grados[i].zeon ? `${i}: int ${e.grados[i].int}→${g.int}` : '')).filter(Boolean);
  if (cambia.length) console.log(`Catálogo corrige ${c.nombre}: ${cambia.join(', ')}`);
}
console.log(`${encontrados} de ${GRIMORIO.length} encontrados en los manuales.`);
console.log(`\nDistintos entre los simulados (${enCatalogo.length}), revisar contra el catálogo:\n${enCatalogo.join('\n')}`);
console.log(`\nDistintos (${distintos.length}):\n${distintos.join('\n')}`);
console.log(`\nNo encontrados (${faltan.length}): ${faltan.join(', ')}`);
