# Changelog

Todo lo que cambió desde que el proyecto pasó a GitHub (13/10/2026) y se trabaja desde la nube.
El estado inicial es el commit `e937774` ("Estado actual de anima-sim"): cuerpo a cuerpo completo,
maniobras, estilos, rotura opcional, CLI y 111 tests.

## Infraestructura

- **Repositorio en GitHub** (`GaelZiade/anima-sim`), público. `fichas/` con las planillas reales
  de la mesa (`48bce09`).
- **Tests con las planillas del repo**: `test/hoja.test.ts` y `ejemplos/mesa.json` usan `fichas/`
  en vez de `C:/Users/Pire/Downloads/Fichasanima`. Los 8 tests de planillas, que antes se salteaban,
  ahora corren (`a4fd820`).
- **GitHub Pages**: `.github/workflows/pages.yml` construye y publica la página en cada push a
  `main` (chequeo de tipos + build). Acciones con Node 24 (`198f4e3`, `4b3e411`).
  → https://gaelziade.github.io/anima-sim/
- **`npm run bench`**: combates por segundo con un hilo, empaquetado igual que la página.
  `npm run bench -- huella` agrega una huella de los resultados que tiene que quedar idéntica
  después de una optimización; `npm run bench -- grupo` filtra escenarios; `BENCH_X=n` multiplica
  los combates (`e095d23`).

## Página web (nueva)

Versión base al estilo BattleCast (`a4fd820`). Todo corre en el navegador de quien la usa: las
planillas no se suben a ningún lado.

- **Fichas**: se arrastran planillas `.xlsx`/`.xlsm` (mismo lector que el CLI), un escenario
  `.json` (las planillas del escenario se buscan por nombre de archivo) o una lista de fichas
  `{ "fichas": [...] }` (`4d39909`). Se recuerdan en el navegador.
- **Combate**: dos equipos, arma y perfil por luchador, fichas repetidas numeradas. Opciones:
  combates, hilos, distancia, semilla, rotura, huida, espacio reducido, armas enfundadas y fase
  lunar. La fase lunar sólo se habilita si alguien tiene el Legado de la Luna (`198f4e3`).
- **Simular**: un worker por núcleo, resultados parciales en vivo, cancelar. Tabla por luchador:
  supervivencia, huida, daño hecho y recibido, críticos, asalto de caída, ataques, contras,
  cansancio, defensa total y maniobras por combate.
- **Narrar un combate** con la semilla elegida.
- Corregido: al cargar varias planillas juntas sólo entraba la primera.

## Narración

- **Los dados de cada tirada** (`8535fe6`): `170+159 (abierta: 93+66)`, `abierta ×2: 95+99+26`,
  `150−72 (pifia: 2, nivel 74)`, `¡pifia! (sacó 2, nivel 26)`, iniciativa `[125+87]`, críticos
  `Crítico 206 [112+100=212, reducido] contra RF 136 [70+66]` y la RF de los puntos de presión.
  En la página, abiertas en verde y pifias en rojo. Los dados de una abierta sólo se guardan si
  abre, para no costar en Monte Carlo.

## Reglas

- **Pifia en la iniciativa** (`6236d1d`, `8325caf`): antes, quien pifiaba actuaba siempre último y
  la sorpresa usaba un penalizador fijo por dado (−125/−100/−75) que venía de `roll.dart` del
  toolkit, no del manual. Ahora tira nivel como cualquier tirada: vale natural − nivel, y se ordena
  con ese valor (igual para la sorpresa y la IA).
- **Umbral de pifia** (`7e7f015`): 1-3; con maestría (más de 200 en la habilidad o característica
  que se tira) 1-2; Buena suerte (o Afortunado) uno menos: 1-2, o sólo el 1 con maestría. Vale para
  ataque, defensa, iniciativa y Acrobacias.
- **Pifia siempre natural − nivel** (`7e7f015`): corregido en las tiradas de la retirada
  (Acrobacias y ataques de respuesta), que sumaban el natural.

## Contenido

- **Arquetipos genéricos de Abel** (`4d39909`) en `ejemplos/arquetipos-abel.json`: marinero,
  burgués, soldado imperial, soldado de élite, oficial imperial y noble. Turno con el arma; TA de
  cuero tachonado, peto y piezas aproximadas (a confirmar con la tabla).

## IA

- **Valoración coherente** (`3c5eb11`). Todas las opciones se miden con las mismas piezas:
  - `valorGolpe`: daño + chance de dejarlo fuera por PV + crítico. La misma cuenta para lo que uno
    pega y lo que recibe.
  - `valorCritico` exacto (`valoracion.ts`): nivel (daño + d100, reducido sobre 200) contra RF +
    d100, con los tramos de la Tabla 51 según dónde pega. Probado contra dados.
  - `valorNegativo`: lo que deja de pegar el rival y lo que pegan de más los golpes siguientes, sin
    pasar nunca de los PV que le quedan.
- **Maniobras** (`3c5eb11`): Inutilizar e Inconsciencia valoran la mitad del daño (antes el pleno),
  y ningún efecto cuenta daño sobre un rival que ya iba a caer. Kaito dejó de usar Inutilizar 11
  veces por combate contra soldados y Engatillar 11 contra élites: contra 5 élites pasó de ganar
  84,7% a 97,6%.
- **Resistir el golpe** (`3c5eb11`): el tempo de su asalto sólo cuenta contra quien actúa después
  (antes contaba al que lo estaba atacando) y cuenta la chance de caer resistiendo. Kaito resistía
  a −80 contra los 4 ataques de Isana y perdía 4 de cada 5.
- **Seraphite arcano** (`56c3369`): su valor extra se calculaba con el modo ya desactivado.
- **Ataque en área** (`f9cbbde`): un blanco que para y contraataca intercepta el área. La IA no lo
  tenía en cuenta; ahora calcula exacta la probabilidad de llegar a cada blanco con una sola tirada
  para todos (`pLlegaArea`, probada contra dados).
- **Amenaza en grupo** (`f9cbbde`): cuando a un blanco pueden llegarle varios, se cuentan las
  defensas adicionales y la posición por orden de llegada (frente, flanco, espalda).
- **Auditoría**: opción `sinManiobras` (`3c5eb11`), que acepta `'A'` o `'B'` para quitárselas a un
  solo equipo (`f9cbbde`). `test/decisiones.test.ts` fija comportamientos verificados.

## Velocidad

- **Optimización exacta** (`e095d23`): con la misma semilla, resultados idénticos. Memoria por
  decisión del golpe normal y la amenaza de cada par, crítico memorizado por clave exacta,
  capacidades por ficha, planes de ataque por capacidades, `danoEsperado`, `declarar` sin
  recalcular lo que no cambia, tablas por índice.

  | Escenario (un hilo) | Antes | Después |
  |---|---|---|
  | Duelo simple | 405/s | ~1.000/s |
  | Kaito contra Teseo | 275/s | ~750/s |
  | Kiran contra 8 soldados | 171/s | ~400/s |
  | Grupo (5) contra 22 | 30/s | ~80/s |

  (Medido en el contenedor, que varía ±15% entre corridas.)
- **Monte Carlo en paralelo también en el CLI** (`952f67a`): `npm run sim` usa todos los núcleos
  (`--hilos=N`, `--semilla=N`). El corte en tandas (`motor/tandas.ts`) es el mismo que en la página:
  con la misma semilla, el resultado es idéntico con 1 o N hilos, en el CLI y en la página.

## Tests

De 111 (8 salteados) a 128, todos corriendo: planillas reales, texto de las tiradas, pifia en la
iniciativa, umbrales de pifia, Buena suerte, tabla de la IA con cada umbral contra dados, efecto
del crítico contra dados, área contra dados, combinar tandas y decisiones de la IA.

## Pendiente

- **La moneda del puntaje**: dejar a alguien fuera de combate vale sus PV; frenarlo, el daño que
  iba a hacer. Contra 12 élites Kiran gana 41,8% con la IA y 54,5% forzando el área. Propuesta:
  medir todo por el cambio en el intercambio de daño del resto del combate.
- Mover con acción activa (−25) cuando conviene esperar.
- Valores reales de TA de los arquetipos de Abel.
- Ki, psíquicos y magia (Kael y los que dependen de eso no se pueden evaluar todavía).
