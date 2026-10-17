# Anima Sim

Simulador de combate para **Anima: Beyond Fantasy**, al estilo de [BattleCast](https://battlecast.gg)
(D&D 5e): corre miles de combates con una IA por heurística (sin LLM) y da estadísticas, y deja ver
un combate en vivo sobre un mapa.

- **Página:** https://gaelziade.github.io/anima-sim/ (se publica sola en cada push a `main`).
- **Manuales en Markdown:** repo **privado** [`GaelZiade/anima-manuales`](https://github.com/GaelZiade/anima-manuales).
  Tienen copyright: no se copian a este repo, que es público.
- **Documentos:** [DISENO.md](DISENO.md) (reglas modeladas, IA, interpretaciones confirmadas),
  [AUDITORIA.md](AUDITORIA.md) (revisión contra los manuales), [CHANGELOG.md](CHANGELOG.md).

## Retomar el trabajo (por ejemplo, desde una sesión en la nube)

```bash
git clone https://github.com/GaelZiade/anima-sim.git
git clone https://github.com/GaelZiade/anima-manuales.git   # privado: hace falta acceso
cd anima-sim
npm install
npm test
```

1. Leé este README entero, después **DISENO.md** (qué reglas hay y cómo se decidieron) y la
   sección "Estado y próximos pasos" de abajo.
2. Las reglas se consultan en `../anima-manuales/*.md` (ver "Cómo leer los manuales").
3. Las planillas reales de la mesa están en `fichas/`; los genéricos, en `ejemplos/`.

## Cómo correrlo

```bash
npm test                                     # 365 tests: reglas, flujo del combate, mapa, Ki, magia, planillas
npm run dev                                  # la página en http://localhost:5173
npm run sim -- ejemplos/duelo.json           # Monte Carlo por consola, todos los núcleos
npm run sim -- ejemplos/mesa.json 20000 --hilos=4 --semilla=7
npm run bench                                # combates por segundo (un hilo)
npm run bench -- huella                      # huella de resultados y del registro: no cambia con una optimización
scripts/huella.sh > antes.txt                # la huella sin velocidades, para comparar con diff
npm run medir                                # % de victorias en los enfrentamientos de referencia
npm run typecheck && npm run build
```

## Principios (no negociables)

1. **Manda el manual.** "Si el Core dice algo, hacelo como dice el Core." Se sigue el texto de los
   libros lo más literal posible. Si el toolkit del usuario
   ([animaMasterToolkit](https://github.com/GaelZiade/animaMasterToolkit), de donde salió el lector
   de planillas) o una costumbre de mesa difieren del libro, gana el libro y la diferencia se trata
   como error.
2. **Si una regla específica no dice nada, vale la general.** No inventar restricciones (un Guardián
   que cubre a un aliado igual puede contraatacar, porque nada lo prohíbe).
3. **Si el libro no cubre el caso, se propone una interpretación y se pregunta.** Las respondidas
   quedan en DISENO.md ("Interpretaciones (confirmadas)") y en AUDITORIA.md ("Decisiones").
4. **Citar la página** en el código, junto a la regla: `// … (Core p.86)`, `(Dominus p.11, Tabla 1)`.
   Es la página del PDF (ver abajo).
5. **La IA no tiene reglas propias:** sólo elige entre acciones legales. Si algo "no se ve bien" en un
   combate, primero se revisa la regla en el manual, después la IA.

## Metodología

- **Antes de codificar una regla**, buscarla en el manual y leer el párrafo entero, no sólo la tabla
  (las tablas convertidas a veces quedaron desordenadas). Revisar si otra regla la modifica
  (Dominus sobre Core, ventajas, artes marciales).
- **Probar en el flujo real**, no sólo la fórmula. Los errores difíciles fueron de *cuándo* se aplica
  algo: la sorpresa se borraba antes de que el sorprendido se defendiera y el −90 nunca llegaba.
  `test/flujo.test.ts` corre `atacar` y lee los números que salen en el registro.
- **Probabilidades contra dados:** las tablas exactas de la IA (abiertas, pifias, críticos, área) se
  prueban contra tiradas reales en los tests.
- **Cambios de IA o de reglas se miden antes y después** con Monte Carlo, misma semilla y mismos
  cruces. Para comparar con una versión anterior: `git worktree add ../anima-sim-antes <commit>`,
  enlazar `node_modules` y correr el mismo script en las dos (ver CHANGELOG, "Kael antes y después").
- **Optimizaciones exactas:** `npm run bench -- huella` tiene que dar la misma huella antes y después.
- **Narración:** cada línea del registro lleva además una foto de todos (posición, PV, estado), el
  turno, el ataque (quién a quién, resultado), el recorrido y el daño; la página la reproduce en vivo.
  El registro sólo se arma en el combate que se mira, nunca en Monte Carlo.
- **Al terminar:** `npm test`, `npm run typecheck`, `npm run build`, actualizar DISENO.md (y
  AUDITORIA.md si es una corrección de regla) y el CHANGELOG.

### Flujo de trabajo con el usuario

- Responde en español rioplatense, directo y por pasos (ve la conversación con formato para TDAH:
  primero la acción, listas cortas, estado explícito).
- **Los arreglos se commitean y pushean a `main` sin preguntar**, apenas pasan los tests: el usuario
  prueba la página publicada desde Edge. Las funciones nuevas se muestran antes, salvo que pida
  pushear.
- Después de pushear, confirmar que terminó el deploy: `gh run list --limit 1` / `gh run watch <id>`.
- Commits en español, con el detalle de qué regla cambió y su página.

### BattleCast como referencia

Las ideas de interfaz y de IA vienen de BattleCast (grilla, terreno, reproducción por eventos, IA
greedy de un paso con esperanzas analíticas). Su código es propietario ("Unauthorized copying,
modification… prohibited"): se usa sólo como referencia de diseño, nunca se copia.

## Cómo leer los manuales

`anima-manuales` tiene los 7 libros convertidos de PDF con marker. Cada página empieza con una
marca `{p.N}`: **N es la página del PDF**, la que se cita en el código (la impresa es 2 menos).

```bash
F="../anima-manuales/1. ABF - Core Exxet (Edición Revisada) [limpio].md"
grep -n "Tabla 43" "$F"
awk -v N=6047 'NR<=N && /\{p\.[0-9]+\}/{p=$0} NR==N{print p}' "$F"   # página de la línea 6047
```

Lo más consultado: Core cap. 9 (combate, p.85-99: Tabla 43 situaciones, Tabla 44 defensas
adicionales, maniobras p.91-92, críticos p.97), cap. 10 (Ki, p.100-107), cap. 14 (estados, p.232-234);
Dominus cap. 1 (reglas avanzadas, Tabla 1 p.11), cap. 2 (artes marciales y Ars Magnus), cap. 5
(creación de técnicas).

## Estructura

```
src/motor/      el motor (sin DOM)
  reglas.ts       tablas y fórmulas puras del Core (absorción, críticos, Tabla 25, 44, 52…)
  calculos.ts     habilidades finales con todos los modificadores (Tabla 43, Dominus Tabla 1, ceguera, Ki)
  combate.ts      el combate: iniciativa, sorpresa, turnos, atacar/defender, daño, críticos, registro
  golpe.ts        tipos del golpe que se resuelve contra una defensa (físico, Ki, conjuro)
  ia.ts           decisiones de la IA (declarar, objetivo, maniobra, cansancio, resistir, distancia)
  ia-ki.ts        IA del Ki: técnicas, acumular, defensas; cache-decision.ts: memoria por decisión
  ia-magia.ts     IA de la magia: qué lanzar, acumular o preparar, escudos
  magia.ts        zeon, ACT, lanzar y mantener, beneficios (bendecir), Tabla 76
  conjuros.ts, grimorio.ts   catálogo de conjuros (datos) y grimorio generado de la planilla
  efectos/        registro de efectos de conjuro (resolver + valorar), estados, valoración compartida
  combate-defensa.ts, combate-distancia.ts, combate-movimiento.ts   la defensa, las armas a distancia, moverse
  combate-magia.ts, combate-ki.ts, llamas.ts, rotura.ts   partes del motor por dominio (reciben el Motor)
  condiciones.ts  condiciones con duración (ceguera, parálisis inducida)
  ki.ts           acumulación, técnicas, mantener, en espera, Límites
  maniobras.ts    maniobras, controles de características, estados (parálisis, vuelo, carga)
  estilos.ts      artes marciales, tablas de combate, ventajas → capacidades
  rasgos.ts       capacidades derivadas de la ficha (pifia, ataques, armadura por zona)
  mapa.ts         grilla de 1 m, muros, caminos (Dijkstra), alcance por celdas vecinas
  probabilidades.ts, valoracion.ts   tablas exactas para la IA (d100 abierta, críticos)
  montecarlo.ts, tandas.ts           Monte Carlo y corte en tandas con semilla propia
src/hoja/       lector de planillas .xlsx/.xlsm (Anima v8.x y Akuma Exxet) → Ficha
src/cli.ts      consola; src/paralelo-node.ts: hilos en Node
web/            la página (Vite): main.ts, tablero.ts (canvas), workers de Monte Carlo
test/           vitest
ejemplos/       escenarios .json y genéricos (arquetipos de Abel)
fichas/         planillas reales de la mesa
```

## Estado y próximos pasos

**Hecho:** combate cuerpo a cuerpo completo (maniobras, estilos, Ars Magnus, ventajas de combate,
Tabla 43 entera con la Tabla 1 del Dominus), combate con proyectiles (arcos, ballestas, armas de
fuego, arrojadizas) y línea de visión, Ki completo (todos los efectos del Dominus cap. 5 con sus
ventajas y desventajas, Combinables, Forzar, habilidades activas del Ki y su Detección, Límites, Leo),
auditoría contra los manuales (cuatro tandas, la última de todo el sistema: reglas, estructura, y la IA valorando con las mismas reglas que el motor), mapa en grilla con paredes y terreno infranqueable, página con compendio, editor de mapa,
Monte Carlo en paralelo y combate en vivo animado.

**Personajes de la mesa** (`fichas/`): Kaito, Teseo, Kiran, Kael, Isana (tao), Stéphan, Rita (planilla
Akuma Exxet, mentalista). Kael está simulado completo (Ki, Leo, Límites); Kiran e Isana, con sus
habilidades del Ki (Absorción, Armadura mayor, Aura, Curación).

**Próximos pasos, en orden:**

1. **Psíquica** (CV, potencial; Rita), sobre la arquitectura de DISENO.md ("Arquitectura: cómo se
   extiende sin romper"). La magia está completa para Stéphan (DISENO.md, "Magia", interpretaciones
   confirmadas); otros magos: catalogar sus conjuros sobre el grimorio
   (`sinSimular` dice qué falta).
2. **IA:** moverse con acción activa sólo cuando conviene (la Tabla 41 ya la mira). (La amenaza ya cuenta magia y Ki; la escala
   unificada del puntaje se probó y se descartó: DISENO.md, "La moneda del puntaje".)
3. Confirmar las interpretaciones propias del Ki (DISENO.md, "Interpretaciones propias"): frenar la
   retirada por Transporte, el arma que crea un Arma física de Ki, cómo reparte los ataques el
   Espejismo y las desventajas de ambientación dadas por cumplidas.
4. Decidir lo que dejó abierto la auditoría del 17/10 (AUDITORIA.md, sección 10): blancos dentro de
   un área, la Bola de Fuego sobre el mago, zafarse fallido, el costo del Sacrificio de
   Características.
5. Detalles abiertos: lo poco que no se simula del Ki y de los proyectiles (DISENO.md, "Pendiente del
   Ki"). Las reglas que faltaban de AUDITORIA.md sección 3 están todas.

**Decisiones del usuario que conviene no reabrir:** la Tabla 25 se corre a tope desde parado; el combate desarmado es Precisa y apunta a la
cabeza con −30 (Core p.76-77); Defensa adicional de Ki = +N defensas libres; técnicas en espera se
pagan por asalto; el Ki sobrante vale en el mismo asalto y vuelve al terminarlo; un área de Ki no se
intercepta; la Detección del Ki se tira una vez por asalto; Parada en área sin el −120, con parar
energía contra lo sobrenatural y una sola tirada para todos; Transporte con Advertir 140 las dos
primeras veces; Estela sólo la línea. El resto, en DISENO.md y AUDITORIA.md.
