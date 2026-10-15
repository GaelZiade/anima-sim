# Changelog

Todo lo que cambió desde que el proyecto pasó a GitHub (13/10/2026), lo más nuevo arriba. Para
retomar el trabajo, empezar por README.md.

## 15/10/2026: magia, parte 3 (Stéphan completo)

- **Reglas**: conjuro preparado (sostenerlo Poder asaltos, +40 a la concentración, Conjuro
  Especialista +10 al ACT), magia innata (Tabla 58), cansancio al ACT (Explotación de la Energía
  Física), choque de descargas (Tabla 57, también contra técnicas de Ki a distancia), Proyección Mágica
  Determinada, conjuros de mantenimiento diario.
- **Frialdad** (Core p.54): se suma a resistir el Aura de combate y el Miedo, Terror y Fascinación del
  Ki (corrección 16 de AUDITORIA.md).
- **Conjuros**: los 21 que faltaban de Stéphan con uso en combate (Lazos de Luz, Éxtasis, Invisibilidad,
  Barrera y Mina de Fuego, Fundir, Transporte Rápido, Sacrificios, Moral, Reparación…). Los 22 que no
  tienen uso en combate quedan listados con el motivo.
- **Medición** (misma semilla, % de victorias de Stéphan, 500 combates): Teseo 91,8 → 91,6; Kaito
  1,8 → 1,4; Kiran 0 → 0,6; cuatro soldados 100 → 100. Stéphan, Kael y Kaito contra Teseo, Kiran y
  cuatro soldados (100): 55 → 67.
- Huella del bench sin cambios.
- **Después**: Holograma, Atar (opción "sogas o cadenas a mano" en la página), Crear Fuego, Control
  sobre el Fuego, detecciones contra invisibles, Destrucción de Sombras y Dominio Lumínico (con la
  naturaleza de los seres en la ficha), Marcha Implacable, pasar zeon entre magos (Transmisión de
  Magia). Stéphan simula 50 conjuros; los 12 restantes no tienen efecto en un combate. Teseo 93,2;
  Kaito 1,4; Kiran 0; soldados 100; grupo 66.
- Las 28 interpretaciones de la parte 3, confirmadas.

## 15/10/2026: el grimorio completo

- **Grimorio** generado desde la hoja "Tablas Magia" de la planilla (`npm run grimorio`): los 640
  conjuros de todas las vías, sub-vías y libre acceso, con sus números por grado. Sólo nombres y
  números.
- El **catálogo** pasa a ser el comportamiento de cada conjuro sobre esos números (mismos valores que
  antes, verificado grado por grado).
- `conocidos` y `sinSimular`: qué conjuros conoce cada personaje y cuáles faltan simular (Stéphan: 62
  conocidos, 20 simulados).
- La planilla suma los conjuros seleccionados (columna "Conjuros") a los elegidos por nombre.
- `npm run validar-grimorio`: compara el grimorio con los manuales.
- Sin cambios en las mediciones ni en la huella del bench. La página pesa 20 KB más (comprimida).

## 14/10/2026 (noche): magia, parte 2 (los conjuros de Stéphan)

- **Catálogo** de combate de Stéphan: Flash Cegador, Arma Ígnea, Aumentar el Crítico, Secar, Cuerpo a
  Fuego, Incinerar, Consumir Esencia, Crítico Directo, Tormenta de Fuego; sub-vía de Guerra (Ira
  Ancestral, Velocidad en la Batalla, Destrucción Desencadenada, Protección Final, Campeón); Curar
  Heridas. Cada uno se resuelve a su manera.
- **Reglas nuevas**: conjuros anímicos (Proyección contra la TA de energía y RM) y automáticos (sin
  defensa); beneficios sobre aliados; ceguera por asaltos; **Tabla 76, En llamas** para todo ataque
  de calor; estado de Ira; RM derivada si la ficha no la trae.
- **Planilla**: se leen las sub-vías y la metamagia (Control del Espacio, Romper Resistencias,
  Conjuro Especialista).
- **IA**: valora cada conjuro a su manera contra su zeon y su mantenimiento; los demás saben que un
  Cuerpo a Fuego no recibe golpes que no sean de energía.
- **Medición** (500 combates, misma semilla, % de victorias de Stéphan): contra Teseo 7,4 → 91,8
  (Cuerpo a Fuego: Teseo no daña energía); Kaito 2,6 → 1,8; Kiran 0 → 0; cuatro soldados 100 → 100.
  Stéphan, Kael y Kaito contra Teseo, Kiran y cuatro soldados (100 combates): 51 → 58.
- Huella del bench sin cambios.
- **Interpretaciones confirmadas** (las 15 de DISENO.md). Nombres y mantenimientos, del grimorio de la
  planilla. Un ejemplar de cada beneficio por blanco (Campeón: uno cada 10 del grupo); el grupo de la
  medición queda en 55.

## 14/10/2026 (noche): magia, parte 1 (núcleo)

- **Magia** (Core cap. 11): zeon, ACT, acumular (la mitad si hace otra cosa), soltar con −10,
  grados por zeon e Inteligencia, mantener, perder la concentración al recibir daño, Proyección
  Mágica sin penalizadores de combate y +40 en contacto.
- **Conjuros** de Stéphan: Descarga de Luz, Bola de Fuego (área), Descarga de Calor, Escudo de Luz
  (escudo mágico, pasivo) y Armadura de Luz. Se leen zeon, ACT, Proyección, vías y libres de la
  planilla.
- **IA**: acumula, lanza lo que rinde más que su zeon, levanta el escudo al defenderse.
- **Medición** (500 combates, % de victorias de Stéphan): contra Teseo 0 → 7,4; Kaito 0 → 2,6;
  Kiran 0 → 0; cuatro soldados 0 → 100.
- La columna "Técnicas de Ki" de la página pasa a "Técnicas y conjuros".

## 14/10/2026 (noche): cierre de los proyectiles

- **Escudos** contra proyectiles (−30 a disparos, nada a lanzamientos, Core p.79); **blanco grande**
  (+30); **escasa visibilidad** (−20, opción del escenario).
- **Ballesta de repetición**: recámara de 4 virotes que se recarga entera.
- **Trucos de manos**: atrapar proyectiles en el aire (Core p.94); la IA lo intenta si le conviene.
- **Disparos paralelos** (opción del escenario, Core p.95).
- **Contra desde lejos** también con técnicas de Ki a distancia.
- **IA**: retrocede antes de disparar si así nadie la alcanza el asalto siguiente.
- Lluvia de proyectiles y "preparado para disparar" quedan explicadas en DISENO.md (no hacen falta).

## 14/10/2026 (noche): proyectiles y línea de visión

- **Mapa**: paredes (no se pasa ni se ve) y terreno infranqueable (no se pasa, pero se ve: abismo,
  agua, lava). El editor tiene pincel de pared o de terreno; el tablero dibuja el terreno rayado.
- **Línea de visión**: una pared la corta; un cuerpo en medio o la esquina de una pared dan
  cobertura (−40).
- **Armas a distancia** (Core p.80-81, p.94-96): arcos, ballestas, armas de fuego y arrojadizas, con
  recarga y cadencia, munición, alcance efectivo, tope de 280, Tablas 47, 48 y 49, contra sin bono y
  armas de fuego que se encasquillan o estallan. Se leen de la planilla (Teseo: hacha arrojadiza;
  Kael: revólver de Leo; Stéphan: daga) y hay tiradores genéricos.
- **IA**: dispara, recarga o apunta cuando rinde más que pelear cuerpo a cuerpo (con sus técnicas de
  Ki en la cuenta).
- **Medición** (1.000 combates, misma semilla, % de victorias): Kael vs Teseo a 10 m 9,9 → 12,4 y a
  30 m 8,2 → 38,9 (el revólver de Leo lo deja a la defensiva mientras se acerca); Kael vs Kiran a
  30 m 18,5 → 24,5; Kaito vs Teseo y Teseo vs Kiran sin cambios.

Interpretaciones confirmadas por el usuario (DISENO.md, "Proyectiles").

## 14/10/2026 (noche): Ki completo

### Habilidades del Ki (`0afccd1`, `e63782c`)

- **Armadura de energía mayor y arcana** (Dominus p.19): la IA la enciende si algún rival ataca
  con energía; 1 de Ki al encenderla y cada 5 asaltos.
- **Recuperación** (Core p.105), **Dominio físico** (+10 a la RF, Dominus p.22).
- **Aura de combate** (Dominus p.20-22): control de Presencia de los enemigos sensibles; afectado,
  miedo, parálisis o desvanecido. Los arquetipos de Abel tienen Presencia.
- **Absorción de energía**, **Curación por Ki** (y superior), **Aumento de características**
  (recalcula los bonos), **Destrucción por Ki**.

### Técnicas (`9c3fa7d`, `60046c4`, `9512f24`)

- **Combinables** usadas juntas y **Forzar Técnicas** (Dominus p.21, p.49).
- **Efectos sobrenaturales** (Dominus cap. 5): Estados (con sus RF y condiciones, también los
  automáticos sobre varios blancos), Escudo de energía, Acumulación, Intangibilidad, Reflectar,
  Absorción de Ki, Apresamiento, Impacto (Tablas 2 y 3 del Dominus), Marca, Interrupción,
  Potenciar Crítico, Ataque sobrenatural, elemental e indirecto.
- **Desventajas**: Agotamiento, Exceso de energía, Penalizador a toda Acción, Circunstancia
  límite, Daño reducido, Ataque especializado.
- **Técnicas a distancia**: el defensor sufre la Tabla 49 y el disparo, la Tabla 48 (Core p.96). La
  IA ataca de lejos cuando rinde más que acercarse.

### Velocidad (`03be72b`)

Optimizaciones exactas de la IA (huella idéntica): Kael con Ki pasa de ~1.150 a ~1.500 combates/s.

Interpretaciones confirmadas por el usuario (DISENO.md): el Aura de combate alcanza también a los
aliados sensibles del radio, y la IA no la enciende con uno cerca.

## 14/10/2026: auditoría, Ki, mapa y combate en vivo

### Auditoría contra los manuales (`ef267d6`)

Revisión línea por línea del motor contra Core, Dominus y Gaia I (detalle en AUDITORIA.md): 15
correcciones y 9 decisiones respondidas por el usuario. Entre otras:

- **Pifia en la iniciativa**: actúa último sin nivel; la Tabla 52 sólo cuenta para la sorpresa
  (Core p.98). Esto da vuelta lo que se había hecho el 13/10 (ver abajo).
- Afortunado no baja la pifia; Mala suerte y armas Complejas suman +2 al umbral.
- La RF no sufre los negativos a toda acción; la iniciativa, la mitad (Core p.232).
- Flanco y espalda al atacar los sufre quien ataca a alguien que tiene al costado (Core p.90).
- Armadura por zona en los ataques apuntados (cada capa y el yelmo con su localización).
- Arquetipos de Abel con TA y entereza exactas (Tablas 37 y 38).
- Decisiones: maestría con 200 o más; Tabla 1 del Dominus para combinar situaciones; desequilibrio
  de atributos como opción; Orochi desencadenada a 0 PV.

### Ki (`10e3946`, `f3ab5a1`)

- **Lectura** de la hoja Ki: reserva, acumulaciones y técnicas con efectos, coste, mantenimiento y
  Combinable. La planilla Akuma Exxet corre las filas: se busca por etiqueta.
- **Motor** (`motor/ki.ts`, Core p.102-106, Dominus cap. 5): acumulación (la mitad si hace otra
  cosa, −1 por cada −20), técnicas de ataque, defensa y turno, efectos de Acción y de Asalto,
  mantenidas que se pagan y se sueltan, técnicas en espera (1/2/3 por asalto), Defensa adicional
  como +N defensas libres, y los efectos de daño, área, armadura, RF y apuntar.
- **Límites** (Dominus p.28-29): Caelum, Terminus, Cenobus, Cruor, Agon, Mors.
- **Leo** (Dominus p.101): Ataque combinado −20 y disparo a bocajarro (+30) si la hoja impacta.
- **IA**: elige técnica junto con la maniobra, con un precio por punto de Ki; guarda Ki para una
  mejor; suelta mantenidas que no rinden.
- **Cansancio**: Uso de la energía necesaria permite gastar 5 por asalto; la defensa desesperada
  gasta lo mínimo que alcanza.

### Modificadores del combate (`3ab0911`, `6624ef9`)

- **Sorpresa**: el −90 nunca llegaba a la defensa, porque se borraba al declarar el ataque. Ahora
  dura toda la primera acción y se gasta antes de las contras (Core p.86). Era el error más grande
  del motor: cambia mucho a los personajes rápidos (ver la tabla de Kael abajo).
- **Acciones activas acumulables**: −25 por cada una (moverse, levantarse, zafarse) (Core p.87).
- Las parálisis no se suman (vale la peor); acumulación sorprendida absorbe la mitad (Core p.99).
- **Tabla 43 completa**: ceguera parcial y absoluta (cegado u oscuridad; Visión nocturna; Detección
  del Ki), combinada con flanco y espalda por la Tabla 1 del Dominus; carga; levitar; vuelo;
  enemigo pequeño y diminuto. Estados del cap. 14: miedo y dolor.
- **Movimiento**: Tipo de movimiento máximo 10 sin Inhumanidad y 13 sin Zen (Core p.62); cada −20 a
  toda acción resta 1 al TM (Core p.232).
- **Verificado y sin cambios**: apuntar sin armas a la cabeza es −30, porque el combate desarmado es
  Precisa (Core p.76-77). El usuario lo confirmó.

### Kael antes y después de la sorpresa (metodología)

Mismo script y misma semilla contra `f3ab5a1` (antes) y `3ab0911` (después), 4000 combates por
cruce, con `git worktree` para tener las dos versiones a la vez:

| Kael contra | Antes | Después |
|---|---|---|
| Teseo | 9,1% | 9,3% |
| Kaito | 3,3% | 4,8% |
| Kiran | 20,1% | 23,8% |
| Isana | 7,8% | 9,7% |
| 2 élites | 98,0% | 98,5% |
| 4 élites | 86,8% | 91,3% |
| 8 soldados | 43,5% | 53,3% |

Contra 4 élites Kael sorprende a alguien en el 58% de los asaltos.

### Narración (`962e26a`, `1b82ce6`)

- Primero la iniciativa y después quién sorprende a quién (con la diferencia); primero la
  acumulación de Ki y después la técnica.
- Aclara lo que se pierde: "X queda a la defensiva."; "resistió el golpe: sigue pudiendo actuar";
  la pifia "pierde el resto de sus acciones activas"; contras que no se pueden tomar y por qué
  ("está a la defensiva", "ya usó todos sus ataques"…); "está a la defensiva: no puede actuar".
- El disparo de Leo que pifia también niega el resto de las acciones (Core p.98).

### Mapa (`1b82ce6`, `216a774`)

- Grilla de celdas de 1 m con terreno no transitable (`motor/mapa.ts`). Trabado con las 8 celdas
  vecinas; caminos con Dijkstra que esquivan muros y cuerpos; la IA mide por el camino. Sin mapa se
  arma uno abierto. Mapa y posiciones viajan en `OpcionesEscenario` (`mapa`, `posiciones`).
- Velocidad: el grupo de 5 contra 22 pasó de 58 a ~60 combates/s después de optimizar (cola de
  prioridad con arreglos tipados, corte al llegar, campos de distancia guardados con el mapa).
- Arreglo: el mapa preparado se guardaba por objeto y la página edita el suyo en el lugar; ahora se
  vuelve a preparar si cambian tamaño o paredes.

### Página (`1b82ce6`, `9e4b639`, `216a774`, `228d9ee`)

- **Compendio** con dos pestañas: *Mis personajes* (planillas) y *Genéricos* (Abel y ejemplos).
- **Editor de mapa**: tamaño, paredes con clic izquierdo y se sacan con el derecho, fichas que se
  arrastran.
- **Combate en vivo**: las fichas recorren el camino celda por celda con estela; marca de turno y
  barra de iniciativa; flecha de quien ataca a quien defiende (roja impacta, gris falla, dorada
  contra); daño flotando; barras de PV; controles con teclado.
- **Barra fija arriba** con "Ver un combate en vivo", "Simular muchos…", progreso y resultado.
  "Simular muchos…" abre un diálogo con las opciones y los últimos valores usados.

### Infraestructura

- **Manuales** en el repo privado `GaelZiade/anima-manuales` (copyright: este repo es público).
- **README.md** con principios, metodología, estructura y próximos pasos, para retomar desde otra
  máquina o desde la nube.
- Tests: de 142 a 184 (`test/flujo.test.ts` lee el registro del combate real; `test/mapa.test.ts`;
  `test/ki.test.ts`).


## 13/10/2026: paso a GitHub y trabajo desde la nube

El estado inicial es el commit `e937774` ("Estado actual de anima-sim"): cuerpo a cuerpo completo,
maniobras, estilos, rotura opcional, CLI y 111 tests.

### Infraestructura

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

### Página web (nueva)

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

### Narración

- **Los dados de cada tirada** (`8535fe6`): `170+159 (abierta: 93+66)`, `abierta ×2: 95+99+26`,
  `150−72 (pifia: 2, nivel 74)`, `¡pifia! (sacó 2, nivel 26)`, iniciativa `[125+87]`, críticos
  `Crítico 206 [112+100=212, reducido] contra RF 136 [70+66]` y la RF de los puntos de presión.
  En la página, abiertas en verde y pifias en rojo. Los dados de una abierta sólo se guardan si
  abre, para no costar en Monte Carlo.

### Reglas

- **Pifia en la iniciativa** (`6236d1d`, `8325caf`), *revertido por la auditoría del 14/10*: el Core
  dice que actúa último sin nivel (p.98). Lo que se había hecho: antes, quien pifiaba actuaba siempre último y
  la sorpresa usaba un penalizador fijo por dado (−125/−100/−75) que venía de `roll.dart` del
  toolkit, no del manual. Ahora tira nivel como cualquier tirada: vale natural − nivel, y se ordena
  con ese valor (igual para la sorpresa y la IA).
- **Umbral de pifia** (`7e7f015`): 1-3; con maestría (más de 200 en la habilidad o característica
  que se tira) 1-2; Buena suerte (o Afortunado) uno menos: 1-2, o sólo el 1 con maestría. Vale para
  ataque, defensa, iniciativa y Acrobacias.
- **Pifia siempre natural − nivel** (`7e7f015`): corregido en las tiradas de la retirada
  (Acrobacias y ataques de respuesta), que sumaban el natural.

### Contenido

- **Arquetipos genéricos de Abel** (`4d39909`) en `ejemplos/arquetipos-abel.json`: marinero,
  burgués, soldado imperial, soldado de élite, oficial imperial y noble. Turno con el arma; TA de
  cuero tachonado, peto y piezas aproximadas (a confirmar con la tabla).

### IA

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

### Velocidad

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

### Tests

De 111 (8 salteados) a 128, todos corriendo: planillas reales, texto de las tiradas, pifia en la
iniciativa, umbrales de pifia, Buena suerte, tabla de la IA con cada umbral contra dados, efecto
del crítico contra dados, área contra dados, combinar tandas y decisiones de la IA.

## Pendiente

Ver README.md, "Estado y próximos pasos", y DISENO.md, "Pendiente del Ki" y "Pendiente: la moneda
del puntaje".
