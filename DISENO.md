# Anima Sim: diseño

Simulador de combate para Anima: Beyond Fantasy, inspirado en BattleCast (D&D 5e). Corre miles de
combates con IA por heurística (sin LLM) y da estadísticas: % de victoria, daño, asalto de caída.

## Por qué es rápido (idea tomada de BattleCast)

1. **Sin búsqueda.** Cada decisión es greedy de un paso: se puntúan las opciones del momento y se
   elige la mejor. No hay minimax ni simulación hacia adelante.
2. **Esperanzas analíticas, no tiradas.** La IA no tira dados para decidir. Al arrancar se
   precalcula la distribución de `d100 abierta − d100 abierta` (con pifias) y cada pregunta
   ("¿cuánto daño espero?", "¿qué chance de contra?") es una consulta a esa tabla.
3. **Pocas opciones por decisión.** Cantidad de ataques 1..N, objetivos alcanzables, 0-2 de cansancio.
4. **Sin registro en Monte Carlo.** El log narrativo sólo se arma para el combate que se mira.
5. **Varios workers**, uno por núcleo (en la página). BattleCast usa uno solo.

## Reglas modeladas (fase 1: combate físico cuerpo a cuerpo)

| Regla | Fuente |
|---|---|
| Iniciativa = turno + d100 abierta cada asalto; el negativo a toda acción cuenta la mitad. Una pifia en turno actúa último, sin nivel; para la sorpresa usa el turno con la Tabla 52 (−125/−100/−75) | Core p.86, p.98, p.232 |
| Sorpresa: diferencia de iniciativa ≥150 → −90 a la defensa en la primera acción del que sorprende | Core p.86 |
| Ataque y defensa: habilidad + d100 abierta (90+, luego 91+, 92+…; 100 siempre abre) | Core p.10 |
| Pifia 1-3 (maestría, 200 o más: 1-2; Buena suerte −1; Mala suerte y armas Complejas +2, Compleja no con maestría). La maestría sale de la habilidad que se tira (ataque, defensa, Acrobacias); el turno no es una habilidad y no tiene maestría. Una pifia tira nivel (d100) y vale natural − nivel. Ataque pifiado: falla, contra con bono = nivel de pifia, pierde acciones | Core p.10, p.17, p.25, p.76, p.97 |
| Defensa pifiada: resta el nivel de pifia | Core p.97 |
| Impacto: resultado > 0. Daño % = (resultado − absorción) en grupos de 10. Absorción = 20 + 10×TA | Core p.88 |
| Impactado (aunque sea sin daño) → a la defensiva: pierde acciones activas del asalto | Core p.89 |
| Contraataque: resultado < 0. Bono = mitad redondeada a 5, máx +150. Consume un ataque declarado | Core p.89 |
| Ataques adicionales: 1 extra por cada 100 de ataque; −20/−30/−40 (arma P/M/G) a todos | Core p.90 |
| Movimiento: metros por asalto según el Tipo de movimiento de la planilla (Tabla 25). Hasta ¼ es pasivo; pasarlo es una acción activa, −25 a lo que haga después. TM máximo 10 sin Inhumanidad y 13 sin Zen; cada −20 a toda acción resta 1 al TM (los bonos no lo suben) | Core p.62, p.87, p.232 |
| Mapa en celdas de 1 m: cada luchador ocupa una; está trabado con los de las 8 vecinas (no en diagonal si un muro tapa la esquina). Se mueve en 8 direcciones (diagonal √2 m) esquivando muros y cuerpos; la IA mide la distancia por el camino. Sin mapa, uno abierto con la distancia inicial entre bandos | Diseño (como BattleCast); metros del Tipo de movimiento, Core p.87 |
| Defensas adicionales: −30, −50, −70, −90 | Core Tabla 44 |
| Flanco/espalda por cantidad de enemigos trabados: 1-3 frente, 4-5 flanco, 6+ espalda | Core p.90, Tabla 43 |
| Movimiento: hasta ¼ del tipo de movimiento es pasivo; más es acción activa (−25 a lo siguiente) | Core p.86, Tabla 25 |
| Defensa total: +30 a defensa, sin acciones activas. Se declara antes de la iniciativa | Core p.93 |
| Resistir el golpe: −80 a defensa (mín. 0) pero no queda a la defensiva | Core p.93 |
| Cansancio: +15 por punto, máx. 2 por asalto, en cualquier tirada física. Agotamiento Tabla 27 | Core p.62 |
| Crítico: un golpe ≥ ½ de los PV actuales. Nivel = daño + d100 (exceso sobre 200 a la mitad) vs RF + d100 | Core p.97 |
| Efectos del crítico: ≤50 dolor; >50 mitad permanente + localización; >100 miembro/cabeza/corazón; >150 inconsciente | Core Tabla 50-51 |
| Acumulación de daño: sin tirada de defensa, nunca a la defensiva, sin contras, crítico a la mitad | Core p.98 |
| Apuntados: sólo la armadura de la zona (peto = torso, camisola + brazos, completa = todo menos la cabeza, yelmo = cabeza); las armaduras especiales de la planilla cubren todo | Core p.83, p.92 |
| PV ≤ 0: fuera de combate. PV por debajo de −5×CON: muerto | Core p.60 |

## Decisiones de la IA (cuándo y qué)

| Momento | Decisión |
|---|---|
| Declaración (antes de la iniciativa) | Defensa total o no; **cuántos** ataques declarar (X) |
| Su turno | Usa los ataques que le queden **uno por uno**, eligiendo objetivo después de ver cada resultado; moverse |
| Al ser atacado | Resistir el golpe o defender; cansancio |
| Al ganar una contra | Usarla ya (gasta un ataque declarado) o guardarlo |
| Cualquier tirada física | Cuánto cansancio gastar (0-2 por asalto en total) |

El reparto de los X ataques **no** se declara: se decide en el momento (contra quién, cuántos a
cada uno, o guardarlos para contras).

### Puntaje

Toda opción se valora en PV esperados, con las mismas piezas para lo que uno pega y lo que recibe
(`valorGolpe`, `valorCritico`, `valorNegativo` en `ia.ts`):

```
golpe    = daño esperado
         + P(dejarlo fuera por PV) × su amenaza de dos asaltos
         + P(crítico) × [P(fuera) × (PV que le quedan + su amenaza) + P(negativos) × valor de los negativos]
ataque   = golpe + tempo (si todavía no actuó: P(impacto) × su asalto) − λ × P(contra) × su golpe
negativo = lo que deja de pegar (este asalto si no actuó, el próximo si sigue en pie)
         + lo que pegan de más los golpes siguientes, sin pasar de los PV que le quedarían
```

- El crítico es exacto (`valoracion.ts`, probado contra dados): nivel = daño + d100 (reducido sobre
  200) contra RF + d100, con los tramos de la Tabla 51 según dónde pega (al azar o apuntado).
- Inutilizar e Inconsciencia valen la mitad de daño y de chance de tumbarlo; el crítico, pleno.
- Ningún efecto cuenta daño sobre un rival que ya iba a caer con los golpes normales.
- `λ` sale del perfil: agresivo 0.5, equilibrado 0.9, cauto 1.4. Las bestias (inteligencia ≤ 4)
  atacan al más cercano.
- **Amenaza** (lo que un enemigo hará en su asalto): si al blanco pueden llegarle varios, se
  supone que la mitad de los demás ya lo atacó: con esas defensas adicionales y la posición que le
  toca por orden de llegada (frente, flanco o espalda, Tabla 43).
- **Ataque en área**: una sola tirada contra todos; un blanco que para y le queda contra lo
  intercepta. La probabilidad de llegar a cada blanco es exacta (`pLlegaArea`, suma sobre cada valor
  de la tirada de ataque, probada contra dados).
- `sinManiobras` en las opciones del escenario: `'A'` o `'B'` le quita las maniobras a un equipo
  (para medir cuánto le aportan, el rival no tiene que cambiar), `true` a los dos.

### Pendiente: la moneda del puntaje

Dejar a un enemigo fuera de combate se valora como sus PV restantes; frenar su ataque, como el daño
que iba a hacer. Son escalas distintas: un enemigo con muchos PV que casi no lastima vale mucho más
muerto que frenado. Contra 12 soldados de élite, Kiran remata de a uno (gana 41%) cuando frenar a
varios con el área rinde más (forzando el área gana 54%).

### Reglas de la IA que salieron de probar

- **Declaración simultánea.** Todos declaran viendo el asalto anterior. Si declaran en orden, el
  segundo ve lo que eligió el primero y el espejo deja de dar 50/50.
- **Esperar sólo si se gana el intercambio.** Defensa total y guardar ataques para contras retrasan
  la caída, no ganan. Se permiten sólo si el equipo le saca PV al rival más rápido de lo que los
  pierde (`ventajaEquipos`) y, para la defensa total, si hay aliados que peleen mientras tanto.
- **Coordinación.** Al declarar, supone que la mitad de los aliados que llegan a un blanco lo
  atacan antes: el blanco llega con defensas adicionales encima.
- **Resistir el golpe.** Compara lo que cuesta (la diferencia de `valorGolpe` de cada ataque que
  recibe antes de actuar) con su asalto × P(lo impactan) × P(sigue en pie). El tempo de su asalto
  sólo cuenta contra quien actúa después que él.
- **Cansancio.** Nunca se agota para atacar. Para defender, sólo si baja ≥20 puntos la chance de
  quedar fuera de combate en ese golpe. La referencia es su propia vida, no la del blanco.

## Planillas de Excel

`src/hoja/` lee las fichas `.xlsx`/`.xlsm` de la mesa. Es un port 1:1 de `sheet_to_json.dart` de
[animaMasterToolkit](https://github.com/GaelZiade/animaMasterToolkit), que a su vez traduce la
macro `ExportJson.bas` de la propia planilla: mismas celdas, mismo JSON.

- `libro.ts`: lector mínimo de xlsx (valor cacheado de las fórmulas, celdas combinadas).
- `hojaAJson.ts`: planilla → JSON de la macro.
- `ficha.ts`: JSON → `Ficha` del simulador. Elige la mejor arma cuerpo a cuerpo (ataque + defensa)
  salvo que se pida otra, y lee los rasgos que cambian negativos (Inmunidad al dolor y al
  cansancio, Eliminación de penalizadores, Exhausto).

Los tests de `test/hoja.test.ts` son los de `sheet_import_test.dart` sobre las planillas reales de
`fichas/` (o de la carpeta de `ANIMA_FICHAS`). Si faltan, se saltan.

## Rasgos de combate (`src/motor/rasgos.ts`)

Port de las reglas del toolkit sobre tablas, artes marciales, ventajas y habilidades del Ki. Se
calculan una vez por luchador (`capacidades`). Tests en `test/rasgos.test.ts`, con los mismos
casos que los tests del toolkit.

| Regla | Qué cambia |
|---|---|
| Ataques adicionales | Tope 1 + HA/100, +1 Tabla de Ataque Adicional, +1 Kempo supremo. −20/−30/−40 por tamaño; Ataque Encadenado baja un tamaño; sin armas −20, Kempo −15/−10 |
| Ataques extra fuera del tope | Segunda arma −40 (Ambidestría −10); patada de Tae Kwon Do −30/−20/0. No suman al penalizador compartido |
| Tamaño del arma | De la planilla, o deducido del nombre con las Tablas 29, 30 y 32 |
| Reducción de TA | Calidad (cada +5 resta 1), Tabla de Reducción de Armadura (n), Dumah sin armas (−2, Arcano −6). La TA no baja de 0 |
| Barrera de daño | Escudo físico (= Presencia base), Rex Frame sin armas (60, Arcano 200), a mano. Un daño base menor no quita PV, salvo que dañe energía |
| Dañar energía | Arma mágica (por su descripción), Extensión del aura al arma, Extrusión de presencia sin armas |
| Defensas sin penalizador | Lama (Avanzado 1, Supremo 2), Lama Tsu (+2, Arcano todas), 2ª Arma: Estilo Defensivo (1) |
| Negativos | Inmunidad al dolor y al cansancio, Eliminación de penalizadores, Exhausto, Esencia de vacío |
| Defensa final | Nunca negativa (habilidad + tirada, mínimo 0) |

### Criterio: manda el manual

Ante cualquier duda o diferencia, se sigue el texto de los manuales lo más literalmente posible.
Diferencias con el toolkit resueltas así (el toolkit tiene estos errores):

1. **Crítico** con la mitad de los PV actuales **o más** (Core p.97). El nivel (daño + d100) se
   reduce sobre 200 y después se compara con RF + d100. → `esCritico`, `nivelCritico`
2. **Inmunidad al dolor y al cansancio** también reduce el dolor de los críticos.
3. **Negativos en la iniciativa**: cuentan la mitad, cansancio incluido (Core p.232: "la única excepción […] es el cálculo de la iniciativa"). Corregido en la auditoría; antes se aplicaba entero.
4. **Sorpresa** con 150 **o más** de diferencia (Core p.86). → `haySorpresa`

## Combate cuerpo a cuerpo completo

### Maniobras (`src/motor/maniobras.ts`, Core p.91-92)

Derribo, Presa (con zafarse y parálisis menor/parcial/completa), Desarmar (pasa al perfil sin armas
de la planilla), Ataque en área (una tirada, los blancos se defienden en orden; una parada lo
intercepta) y ataques apuntados a cabeza y corazón (crítico con 1/10 de los PV, cabeza deja
inconsciente pasado 50, corazón mata pasado 100). Controles enfrentados de características con la
regla del 10 y la de diferencia mayor de 4 (Core p.9). La IA elige maniobra en cada ataque por valor
esperado.

**Prever Sorpresa** (Dominus p.14): se declara antes de la iniciativa contra cada enemigo si
P(sorpresa) × lo que cuesta el −90 supera lo que cuesta el −40 seguro. P(sorpresa) sale de la
misma tabla de dos d100 abiertas. Contra Kaito (turno 125 contra 50, ~11% de sorpresas) Teseo no
la usa; contra rivales mucho más rápidos o con Uroboros, sí.

**Resistir el golpe** es todo o nada: con un solo golpe no resistido queda a la defensiva igual y lo
pagado se pierde. Al primer ataque del asalto calcula cuántos le llegan antes de su turno (el
actual más los de quienes actúan antes, repartidos entre sus blancos), suma lo que cuesta
resistirlos todos y lo compara con su asalto × P(que al menos uno lo impacte). Lo decidido se
mantiene hasta que actúa. Contra Kaito, Teseo resiste asaltos enteros pocas veces (~7 en 40
combates) porque Kaito lo ataca 5-6 veces antes de que actúe.

### Estilos (`src/motor/estilos.ts`)

Los bonos fijos ("Bono", "Bono Maestro", daño) ya vienen en la planilla. Se modela lo condicional:

| Grupo | Qué hace en combate |
|---|---|
| Artes marciales básicas | Aikido (daño de contra con FUE rival, maniobras sin penalizador en contras), Kung Fu (bono variable), Pankration, Grappling, Sambo (maniobras más baratas), Boxeo (+10 en contras), Moai Thai (crítico), Capoeira (área), Malla-yuddha (desarmar en contras), Kempo, Tae Kwon Do (patada con el perfil sin armas), Lama, Kardad (resistir y repetir controles), Xing Quan (bono contra un rival), Soo Bahk (flanco, derribado) |
| Artes marciales avanzadas | Emp (desarmar, arcano desarma al defender), Selene (contra doble, arcano ilimitadas), Velez arcano (intangible e invisible), Asakusen (bono variable +40, crítico vital), Lama Tsu, Seraphite (+20/−30, arcano +30/−50 y sigue actuando), Melkaiah, Dumah, Hakyoukuken (crítico), Shephon (Defensa total +60/+100), Hanja (sin espalda, arcano sin parálisis), Godhand (sacrificar un ataque), Rex Frame (barrera 60/200) |
| Tablas | Ataque Adicional y Encadenado, Reducción de Armadura, Área, Desarme, Presa Inusual, Sujeción, Crítico Incrementado, Ataque Inusual (crítico secundario), 2ª Arma: Estilo Defensivo (se elige cada asalto) |
| Ars Magnus sin Ki | Berserker, Ataque Final, Maniobra Especial, Guardián (defiende a un aliado con −10), Samiel |
| Legados | Uroboros (sorpresa con 100), Ojos de la Muerte (crítico automático), Toa (+10 RF), Sangre Eterna (sin puntos vulnerables, consciente hasta −20×CON), Orochi (despertar y furia), Aeon (mitad de daño de su elemento) |

Todas las ventajas de Artes Marciales exigen pelear sin armas (Dominus p.45), salvo la patada del
Tae Kwon Do (p.36). Tests en `test/estilos.test.ts`, con los números de los manuales.

### Interpretaciones (confirmadas)

Criterio general: si una regla no dice algo, se aplica la regla general.

1. **Levantarse** de un derribo usa la acción activa (el Core no lo regula): lo que sigue va con −25.
2. **Asakusen base** (+10 a todo con artes marciales): la planilla ya lo suma.
3. **Rex Frame** da su barrera sólo peleando sin armas, como el resto de ventajas marciales.
4. **Furia de Orochi**: control de Voluntad contra 10 (dificultad normal si no se precisa).
5. **Guardián**: quien cubre a un aliado puede contraatacar si alcanza al agresor (regla general).
6. **Desarmado**: usa el perfil sin armas de la planilla, que siempre existe. El valor por defecto
   (mitad de habilidad, daño 10) sólo cubre fichas cargadas a mano.

### Completado del cuerpo a cuerpo

| Qué | Regla |
|---|---|
| Inutilizar | Apuntado a una extremidad (−20), mitad de daño, crítico con el pleno y con 1/10 de los PV (Core p.91) |
| Inconsciencia | Apuntado a la cabeza (−60, −40 más sin crítico Contundente), mitad de daño; inconsciente si el crítico falla por más de 50; nunca mata (Core p.92) |
| Engatillar | −100 (Tabla de Precisión −50); si habría dañado, el rival queda amenazado: −120 a defenderse y −20 al atacar a quien lo amenaza (Core p.92, Tabla 43) |
| Mushin | Puntos de presión: RF contra daño + 20; arcano + 40 y estados con su penalizador al ataque (Dominus p.42) |
| Enuth | +20 al crítico al dejar inconsciente; arcano +50 y todo golpe obliga a un control de inconsciencia (p.43) |
| Retirarse | Acción activa; cada enemigo trabado con ataques tiene una Acción Respuesta con flanco; si alguna daña, no se va. Acrobacias > 40 o sorpresa: se va sin ataques. Uroboros sin flanco (Core p.94) |
| Apartar | Quien esquiva, ganó el turno al atacante y reservó un ataque defiende por otro con −30 (Guardaespaldas −10) (Core p.93) |
| Haima | Con Sangre Eterna: sacrifica PV; la sombra aguanta el doble. Si el daño no la supera, no pierde ni PV ni la acción (Dominus p.88) |
| Hakyoukuken | Contra armadura blanda (Tabla 38, por nombre de capa): −2 a su TA; arcano: sólo vale su calidad |
| Rotura (opcional) | Al parar, las armas pueden romperse (calidad +5: pierde un grado; sin calidad: desarmado). Al evitar el daño, la armadura pierde 1 de TA por capa rota. Parar sin armas un arma: 5 de daño por punto fallado (Malla-yuddha, maestría) (Core p.93-94) |
| Escenario | `espacioReducido`, `armasEnfundadas` (Batto jutsu), `faseLunar` (Tsukiyomi), `huida`, `rotura` en `opciones` del escenario |

### Interpretaciones nuevas (la regla no lo precisa)

1. **Amenazado** termina cuando quien amenaza lo ataca, cuando a él lo impactan o cuando cae.
2. **Mushin arcano**: las parálisis duran tantos asaltos como el fracaso (como en las Técnicas);
   parálisis completa y coma lo dejan fuera de combate. La debilidad no se modela (sólo afecta
   controles de características).
3. **Enuth arcano**: daño completo; el control de inconsciencia se hace en cada golpe que daña y
   que no causó ya un crítico.
4. **Apartar** sin Guardián exige haber ganado el turno al atacante y tener un ataque sin usar
   (la acción reservada); lo gasta.
5. **Huida**: sólo con la opción de escenario; quien no es agresivo huye por debajo de 1/4 de sus
   PV si su equipo pierde claramente.
6. **Rotura**: las armas se controlan en cada parada; la parada sin armas sólo si la defensa tuvo
   éxito; las armas grandes cuentan como a dos manos para Batto jutsu.

### Pendiente

- **Necesitan Ki (fase 3):** Suyanta, Kiai, Magnum, Raikou, Etherial, Shinkyou, Summun,
  Transformaciones, Sellos del Dragón, Ojos del Destino, Kami Señor de la Guerra, Ashuriam, Mundus.
- **Fuera del cuerpo a cuerpo:** proyectiles (Kuan, Tabla de Esquiva con Escudo, Acumulación de
  Proyectiles), Yuuse Batojutsu (preparación de varios asaltos).
- **Del toolkit:** Resistir el dolor (Tabla 15), combate de masas (Bestiario) y el lector de
  enemigos desde texto (`npc_text_parser`).

## Página (`web/`)

Versión base de la interfaz, al estilo BattleCast. Todo corre en el navegador del usuario: las
planillas se leen ahí con el mismo lector de `src/hoja/` y no se suben a ningún lado.

- **Compendio:** dos pestañas. *Mis personajes*: las planillas `.xlsx`/`.xlsm` que se arrastran, o un
  escenario `.json` (el formato del CLI; sus planillas se buscan por nombre de archivo entre las ya
  cargadas). *Genéricos*: los arquetipos de Abel y las fichas de `ejemplos/`, siempre disponibles.
  Cada uno se suma con "+ A" o "+ B" las veces que haga falta. Lo cargado se recuerda en
  `localStorage`.
- **Mapa** (`tablero.ts`): grilla de celdas de 1 m de tamaño configurable, con paredes que se ponen
  con clic izquierdo y se sacan con clic derecho (también arrastrando). Las fichas se ubican solas al sumarlas (el A desde la izquierda, el
  B desde la derecha) y se arrastran a otra celda. Mapa y posiciones viajan en
  `OpcionesEscenario` (`mapa`, `posiciones`), así el Monte Carlo usa el mismo mapa.
- **Combate:** dos equipos, con arma, perfil y estado inicial por luchador; una ficha repetida se
  numera.
- **Botones siempre a mano:** una barra fija arriba con "Ver un combate en vivo", "Simular muchos…",
  el progreso y el resultado resumido. "Simular muchos…" abre un diálogo con las opciones (cantidad
  de combates, hilos, semilla, luz, fase lunar y reglas opcionales) con los últimos valores usados:
  "Simular" los guarda y corre; "Cancelar" o Escape no cambian nada. Ver en vivo usa las mismas. La
  fase lunar sólo se habilita si alguien tiene el Legado de la Luna.
- **En vivo:** corre un combate con la semilla elegida y lo reproduce sobre el mapa, una línea del
  registro por vez. Las fichas recorren el camino real celda por celda (`Evento.camino`) y dejan
  una estela punteada de su color, que dura todo el asalto. Quien tiene el turno lleva un aro
  dorado y un triángulo encima, y se destaca en la barra de iniciativa del asalto (`Evento.turno`,
  `Evento.orden`). Cada ataque dibuja una flecha de quien ataca a quien defiende, roja si impacta,
  gris si falla (punteada si pifia) y dorada si es una contra, con el defensor rodeado del mismo
  color (`Evento.ataque`); el daño aparece flotando sobre quien lo recibe (`Evento.dano`). Barras
  de PV, borde punteado a la defensiva, cruz si cayó. Cada línea guarda la foto de todos
  (`Evento.foto`).
  Controles: reproducir/pausa (espacio), línea anterior o siguiente (flechas), desde el principio y
  velocidad; clic en una línea de la narración salta ahí.
- **Publicación:** `.github/workflows/pages.yml` la construye y la publica en GitHub Pages en cada
  push a `main`.
- **Monte Carlo en paralelo** (`paralelo.ts`): un worker por núcleo. Los combates se cortan en
  tandas de 250, cada una con su semilla; cada worker pide la siguiente al terminar, y
  `combinar` (`src/motor/montecarlo.ts`) junta los resultados. Resultados parciales en vivo.
- **Narrar un combate:** corre uno con registro, con la semilla elegida. Cada tirada muestra sus
  dados: abiertas con cada d100 (`170+159 (abierta: 93+66)`), pifias con el natural y el nivel,
  y críticos con daño + d100 contra RF + d100. Abiertas y pifias se resaltan en color. Los dados
  de una abierta sólo se guardan cuando abre (`TiradaD100.dados`), para no costar en Monte Carlo.

El contenedor de desarrollo queda para tests, simulaciones largas y mediciones.

## Cómo correrlo

```bash
npm install
npm test                                     # reglas, tablas contra dados reales, combate
npm run sim -- ejemplos/duelo.json           # 10.000 combates en todos los núcleos
npm run sim -- ejemplos/duelo.json 50000 --hilos=1 --semilla=7
npm run bench                                # combates por segundo (un hilo)
npm run sim -- ejemplos/duelo.json ver 7     # narra el combate con semilla 7
npm run sim -- ficha "Kaito.xlsm"            # lo que se lee de una planilla
npm run sim -- ejemplos/mesa.json            # Kaito contra Teseo desde sus planillas
npm run dev                                  # la página en http://localhost:5173
npm run build                                # la página estática en dist/
```

## Velocidad

`npm run bench` mide combates por segundo con un hilo, con el código empaquetado igual que la
página; `npm run bench -- huella` agrega una huella de los resultados que, con la misma semilla,
tiene que quedar idéntica después de cualquier optimización.

| Escenario | Antes de optimizar | Ahora |
|---|---|---|
| Duelo simple | 405/s | ~1.100/s |
| Kaito contra Teseo | 275/s | ~800/s |
| Kiran contra 8 soldados | 171/s | ~430/s |
| Grupo (5) contra 22 | 30/s | ~90/s |

Con todos los núcleos (página y CLI) se multiplica por los hilos: en el contenedor, 4 hilos dan
~2,8×. El tiempo se va en la IA, no en los dados. Lo que más rindió, sin cambiar resultados:

- Memoria por decisión del golpe normal de cada par (`base` en `ia.ts`), que se vacía al empezar
  cada decisión y al probar otro modo: nunca sobrevive a un cambio de estado.
- `efectoCritico` memorizado por clave exacta: unas 3.000 combinaciones distintas cada 140.000
  llamadas.
- Capacidades por ficha y planes de ataque por capacidades (no se modifican en combate: si algo
  cambia, el motor arma una ficha nueva).
- `danoEsperado` cuando sólo hace falta el daño.
- `declarar` sólo recalcula el blanco elegido entre ranuras iguales.

Monte Carlo en paralelo: `motor/tandas.ts` corta en tandas de 250 con semilla propia, y el
resultado se combina por índice. Con la misma semilla da lo mismo con 1 o con N hilos, en la página
y en el CLI (`src/paralelo-node.ts`, `--hilos=N`).

## Mapa

Grilla de celdas de 1 m (`motor/mapa.ts`), al estilo BattleCast. Hay dos clases de celdas no
transitables: **paredes** (`bloqueadas`: no se pasa ni se ve a través) y **terreno infranqueable**
(`infranqueables`: abismo, agua, lava; no se pisa, pero se ve y se dispara por encima, y se puede
rodear en diagonal). Los mapas guardados antes sólo tienen paredes. Cada luchador ocupa una celda y
está trabado con los de las 8 vecinas (en diagonal no, si una pared tapa la esquina). Se mueve en 8 direcciones (la diagonal mide √2 m) sin atravesar muros ni cuerpos: Dijkstra
con corte al llegar, y un campo de distancias por celda de destino (sólo terreno) que la IA usa para
medir cuánto le falta a cada uno y que queda guardado con el mapa para todos los combates. Sin mapa
se arma uno abierto con los bandos a la distancia inicial. Trabarse con alguien lo agrega a una
lista ordenada por llegada: el orden define frente/flanco/espalda (Core p.90).

**Línea de visión** (`lineaDeVision`): recorre las celdas que cruza el segmento entre los centros. Una
pared la corta; pasar justo por la esquina de dos paredes también, y por la de una sola o por una
celda con otro luchador da **cobertura** (−40, Tabla 47).

## Fases

1. **Motor físico + IA + Monte Carlo por consola** ← hecho (auditado contra los manuales, ver AUDITORIA.md)
2. Interfaz web (Vite) + workers en paralelo + mapa + combate en vivo ← hecho
3. **Ki** ← hecho (lo que no se simula, en "Pendiente del Ki")
4. **Proyectiles y línea de visión** ← hecho (ver "Proyectiles")
5. **Magia** ← en curso (ver "Magia": partes 1 y 2 hechas); después psíquica

## Magia (fase 5)

Por partes: **1. núcleo** (hecho), **2. catálogo de combate de las vías de Stéphan** (hecho, a
confirmar las interpretaciones), 3. reglas avanzadas (conjuro preparado, magia innata, choque de
descargas, el resto de la metamagia), 4. psíquica. Los conjuros no tienen una forma genérica: cada
uno se cataloga y se resuelve caso por caso (`Conjuro.efecto`).

### Datos

`Ficha.magia` (hoja Místicos): zeon, ACT, Proyección Mágica para atacar y defender (ya con el
desequilibrio ofensivo), nivel en cada vía y conjuros libres. Sólo si tiene vías o libres. También
se leen la RM y Resistir el dolor. El catálogo (`motor/conjuros.ts`) tiene los números de cada grado
(zeon, Inteligencia requerida, daño, área, resistencia, TA, mantenimiento), nunca el texto del
manual; conoce los de sus vías hasta su nivel, los de la sub-vía elegida para cada vía y los libres
que eligió. También se leen las sub-vías y la metamagia que usa el motor (Control del Espacio, Romper
Resistencias, Conjuro Especialista).

### Reglas (`motor/magia.ts`)

| Regla | Fuente |
|---|---|
| Acumular es pasivo: suma el ACT cada asalto, sin pasar la reserva; si hace otra cosa que lanzar, la mitad | Core p.117 |
| Si deja de acumular, lo acumulado vuelve a la reserva menos 10; si lanzó, lo que sobra al terminar el asalto, igual | Core p.117 |
| Grados por zeon; la Inteligencia limita el grado | Core p.121 |
| Mantener: cada asalto de la reserva, sin tocar el ACT | Core p.121 |
| Daño mientras acumula: Resistir el dolor contra el doble para conservarlo; si ni llega al daño, lo pierde; si no, vuelve a la reserva | Core p.118 |
| Proyección Mágica: sin penalizadores de combate (ataques o defensas adicionales, proyectiles, posición), sólo los negativos a toda acción y la ceguera; +40 en contacto | Core p.118 |
| Conjuros de ataque: proyectil disparado (Tabla 49 para el defensor) que sólo para quien para energía; varios por asalto mientras alcance lo acumulado; con pifia fallan | Core p.118, p.122 |
| Área: alcanza a todos los del radio, aliados incluidos | Core p.157 |
| Escudo mágico: defiende con la Proyección sin penalizadores por defensas adicionales ni proyectiles (sólo sorpresa, amenazado y ceguera); si para, recibe el daño base; si se rompe, el resto pasa sin defensa. No se combina con parar o esquivar | Core p.100 |
| Escudo de Luz: sólo lo dañan los ataques sobrenaturales | Core p.126 |
| Armadura de Luz: una capa más de armadura | Core p.127 |

**IA**: acumula si le queda zeon y hay enemigos. En su turno lanza, de a uno mientras le alcance lo
acumulado, el conjuro y grado que más rinda contra el blanco que más rinda (en área suma a todos y
resta a los aliados), descontando el zeon a un precio por punto como el del Ki; si nada rinde, espera
acumulando (salvo trabado). Levanta el escudo cuando lo atacan si lo que ahorra en ese golpe y los
siguientes del asalto vale más que su zeon, y se defiende con él si su Proyección rinde más.

**Interpretaciones confirmadas** (14/10/2026):

1. El alcance de los conjuros es el del Recuadro X según su Proyección Mágica, sin tirada (140: 250 m),
   salvo que el conjuro diga otro.
2. Los conjuros de ataque no sufren la cobertura (es de la Tabla 47, que no usan).
3. "Otra acción" que baja el ACT: atacar, defenderse sin el escudo o moverse con acción activa;
   defenderse con el escudo, no.
4. Si pierde la concentración pero la tirada llega al daño, el zeon vuelve a la reserva menos los 10
   de interrumpir la acumulación.
5. El mantenimiento del Escudo de Luz es el de su espejo, el Escudo de Oscuridad (5 / 15 / 20 / 25).
6. Quien pelea con magia usa el turno de las acciones desarmadas (el de la Proyección en la planilla).
7. La Absorción de energía (Ki) también absorbe el daño de los conjuros de ataque.

### Parte 2: los conjuros de Stéphan

Stéphan: Fuego 80 con la sub-vía de Guerra, Luz 40 con la de Conocimiento (ninguno de combate), y
libres. Catalogados los de combate:

| Conjuro | Tipo | Cómo se resuelve | Fuente |
|---|---|---|---|
| Flash Cegador | automático | RF de todos los del radio salvo el lanzador; ciego tantos asaltos como decenas de fracaso | Core p.126 |
| Escudo de Luz, Armadura de Luz, Descarga de Luz | | parte 1 | Core p.126-127 |
| Bola de Fuego, Descarga de Calor | ataque | parte 1 (ahora además prenden: Tabla 76) | Core p.157 |
| Arma Ígnea | efecto | el arma ataca en calor como crítico primario, +daño | Core p.157 |
| Aumentar el Crítico | pasivo | +20 a +80 a la tirada del crítico; se lanza antes de tirarla | Core p.157 |
| Secar | anímico | área; RM o RF; pierde la mitad del fracaso | Core p.158 |
| Cuerpo a Fuego | efecto | inmune a lo que no sea energía, frío o agua; quien lo toca, RF contra el doble de su Presencia o pierde la mitad del fracaso | Core p.158 |
| Incinerar | automático | RM; si falla, 1d100 + bono en la Tabla 76 | Core p.158 |
| Consumir Esencia | anímico | radio alrededor del mago; RM; pierde PV y zeon igual al fracaso | Core p.158 |
| Crítico Directo | anímico | RM; si falla, un crítico de ese nivel contra su RF | Core p.159 |
| Tormenta de Fuego | automático | zona estática; desde el asalto siguiente, ataque automático de habilidad fija (180, 240…) y daño 100 en calor a los de adentro | Core p.159 |
| Ira Ancestral | efecto (Guerra) | +10 al ataque y estado de Ira a los aliados del radio | Arcana p.35 |
| Velocidad en la Batalla | efecto (Guerra) | +10 / +20 al turno | Arcana p.35 |
| Destrucción Desencadenada | efecto (Guerra) | +20 a +40 al daño | Arcana p.35 |
| Protección Final | efecto (Guerra) | + Resistencias y + TA | Arcana p.35 |
| Campeón | efecto (Guerra) | a uno: + toda acción, + daño, + turno, + TA | Arcana p.35 |
| Curar Heridas | efecto (libre) | recupera 40 / 80 / 160 / 320 PV | Core p.187 |

Reglas generales que se agregaron:

| Regla | Fuente |
|---|---|
| Anímicos: ataque de energía con la Proyección; invisibles (el defensor, cegado si no ve la magia); alcanza si logra un resultado de daño contra la TA de energía; después, RM | Core p.122 |
| Automáticos: no hay defensa; la Proyección sólo decide si se manifiesta (pifia) | Core p.122 |
| Todo conjuro pide un control de Proyección: con pifia falla aunque gaste el zeon | Core p.118 |
| Tabla 76, En llamas: todo ataque de calor que daña tira 1d100 + el daño; prendido (100), ardiendo (180, 10 PV/asalto), en llamas (240, 25), calcinado (300, 50, sin armadura); la TA contra calor resta 2 por punto; crece 10 por asalto si no se apaga; apagarse: 1d100 + Destreza o Agilidad restado; acumulación: el resultado /5 y el daño ×5 | Core p.236-237 |
| Ira: se lanza al ataque (no hace defensa total ni huye) | Core p.232 |
| Control del Espacio: elige los blancos de sus conjuros de área, por 10 de zeon más | Arcana p.27 |
| Romper Resistencias: +5 (arcano +10) a la RM de sus anímicos por cada 50% de daño | Arcana p.28 |
| Conjuro Especialista: +1 a la Inteligencia para el grado de ese conjuro | Arcana p.30 |
| Sub-vías: se conocen si son las elegidas para esa vía y la vía llega a su nivel | Arcana p.32 |
| RM sin planilla: Presencia + bono de POD (Presencia sin planilla: RF − bono de CON) | Core p.12 |
| Muerto, deja de mantener sus conjuros (inconsciente los sigue sosteniendo) | Core p.122 |

**IA**: cada conjuro se valora a su manera, en PV, contra el zeon (y tres asaltos de mantenimiento):
ataques y anímicos por blanco (sumando enemigos, restando aliados por λ); Flash por los asaltos de
ceguera; Incinerar por lo que quemaría; Tormenta por tres asaltos de ataques automáticos; beneficios
por el daño de más que hace y el que deja de recibir el beneficiado en cuatro asaltos (quien pelea con
conjuros no cuenta sus ataques físicos); Curar Heridas por los PV que recupera. Usa Control del
Espacio sólo si hay un aliado en el área. Aumentar el Crítico, si sube el valor del crítico más que su
zeon. En llamas, se apaga si ya lo quema o está por hacerlo. Los demás saben que un Cuerpo a Fuego no
recibe sus golpes (el daño esperado es 0).

**Interpretaciones nuevas, a confirmar:**

1. Dos nombres están cortados en la copia: el de nivel 26 de Fuego se llama acá **Arma Ígnea**, y el de
   52, **Cuerpo a Fuego** (por su espejo, Cuerpo a Luz).
2. A Destrucción Desencadenada le falta el mantenimiento: se toma el de Protección Final, que cuesta
   lo mismo (5 / 15 / 20 / 20).
3. Los beneficios de Guerra "a los aliados del radio" incluyen al lanzador; alcanzan a los que están
   en el radio al lanzarlo y lo conservan aunque se alejen.
4. El mismo conjuro de dos lanzadores no se acumula (vale el mayor); conjuros distintos, sí. Cada
   lanzador mantiene una sola copia de cada conjuro a la vez.
5. Un anímico que alcanza no deja al blanco a la defensiva (no lo golpea).
6. Secar es en un área elegida (como la Bola de Fuego); el blanco resiste con la mejor de RM y RF.
   Consumir Esencia pide Proyección y defensa a cada uno del radio (es anímico de área).
7. Crítico Directo: el nivel es fijo (no se tira el dado del crítico); la RF se tira como siempre.
8. Flash Cegador: todos lo miran (nadie se cubre: sin el +40); el asalto en que lo lanza cuenta como
   el primero de ceguera.
9. Incinerar no se mantiene en la simulación: el texto no dice qué hace su mantenimiento.
10. Tormenta de Fuego: el ataque automático va al empezar cada asalto y se defiende como de un conjuro
    de ataque; la zona queda donde estaba el objetivo al lanzarla.
11. Tabla 76: el daño de las llamas va al final del asalto; apagarse ocupa el turno; en llamas y
    calcinado también se apagan así (no hay agua ni arena en la simulación); cuenta la TA contra
    calor de la armadura.
12. Cuerpo a Fuego: "tocarlo" es un golpe sin armas que alcanza, dado o recibido. Los conjuros de calor
    no lo dañan (sólo los de energía, Core p.122); un luchador que daña energía (Ki), sí.
13. Arma Ígnea vale para el arma principal, no para el perfil sin armas ni los proyectiles.
14. Campeón: el "+ a toda acción" no suma al turno (trae su propio bono de turno). Los bonos al daño de
    Guerra no se suman a los conjuros.
15. Conjuro Especialista: el +10 al ACT "al declarar que se prepara para lanzarlo" queda para la parte
    3 (la IA todavía no planifica qué va a lanzar).

**Pendiente de la parte 2:** Barrera de Fuego (un muro en el mapa), Lazos de Luz (Presa con los
lazos), Invisibilidad (hace falta leer Advertir y Buscar de la planilla), Éxtasis, Moral (Frialdad),
la mina de fuego de nivel 40, Sacrificio Vital y de Poder, Magia por Capacidades, Consumir Vida por
Magia. La IA no se aparta de una Tormenta de Fuego.

**Tabla 57 (choque de descargas)**, dada por el usuario (la copia del manual está cortada): diferencia
1-50, se anulan; 51-100, la ganadora pasa con la mitad del daño base; 101 o más, pasa con el daño
entero. Se implementa en la parte 3.

## Proyectiles (fase 4)

Arcos, ballestas, armas de fuego y arrojadizas (`motor/proyectiles.ts`, Core p.80-81 y p.94-96).

### Datos

`Ficha.armasDistancia`: nombre, disparo o lanzamiento, habilidad y daño finales, crítico, alcance
efectivo (ya con la Tabla 46), recarga o cadencia, munición, si es de fuego y calidad. De la planilla
se leen las armas con munición y las "Lanzable (CF/alcance)"; lo que falte sale de la Tabla 34 por
el nombre. Sin munición declarada: sin límite al disparar, una unidad al lanzar. Las armas Leo
disparan con su revólver (alcance de Dominus p.101, sin recargar). Genéricos con arco, ballesta y
arcabuz en `ejemplos/tiradores.json`.

### Reglas

| Regla | Fuente |
|---|---|
| Un disparo es un ataque con la ranura del arma: su habilidad, daño y crítico; la calidad del arma resta la TA | Core p.94 |
| Recarga: por cada 100 de habilidad baja un asalto con −30 acumulable a todos los disparos; por debajo de 1 dispara de más (arco con 100: dos flechas a −30) | Core p.96 |
| Cadencia (arrojadizas): una por cada CF de habilidad, mínimo una, −10 a todas por cada una de más | Core p.96 |
| Alcance efectivo; hasta el doble con −30 y la mitad de daño | Core p.95 |
| Tope de 280 al resultado final, salvo Extensión del aura | Core p.95 |
| Tabla 47: moverse −10 (correr al máximo −50), cobertura −40, cambiar de blanco −10, blanco que se mueve rápido −20/−40/−60, haberse defendido −40, apuntar +10 por asalto (hasta +30), bocajarro +30 | Core p.95-96 |
| Tabla 48: dificultad por distancia | Core p.96 |
| Tabla 49: disparo parada −80 (maestro −20), esquiva −30 (maestro 0); lanzamiento parada −50 (maestro 0); a bocajarro, nada; un escudo sobrenatural, nada | Core p.96, p.100 |
| Contra desde lejos: sólo con un arma a distancia y sin el bono | Core p.95 |
| Armas de fuego: pifia de nivel menor al umbral (80, +15 por cada +5) se encasquilla; mayor, estalla | Core p.80-81 |
| Sin línea de visión no se dispara (tampoco con técnicas de Ki a distancia) | |
| Escudo (rodela, medio, corporal): parar disparos −30 (maestro nada), lanzamientos sin penalizador | Core p.79 |
| Blanco grande (+30): Tamaño 22 o más (más de 2,5 m, Tabla 3), no contra acumulación | Core p.95 |
| Escasa visibilidad (opción del escenario: niebla, humo): −20 | Core p.95 |
| Ballesta de repetición: recámara de 4 virotes (la más corta de 4 a 8); vacía, se recarga entera en 3 asaltos | Core p.80-81 |
| Trucos de manos: atrapar en el aire (defensa pasiva, −25 por cada control de más): lanzado Absurdo, disparado Casi Imposible, arma de fuego Inhumano con maestría, sobrenatural enfrentado con el ataque final; si falla, se defiende con −50 | Core p.94 |
| Disparos paralelos (opción del escenario): con menos de 25 de diferencia de turno y sin haber actuado, quien recibe un disparo dispara a su vez antes de defenderse | Core p.95 |
| Contra desde lejos también con una técnica de Ki a distancia, sin bono | Core p.95, Dominus p.57 |

**IA**: al empezar su turno compara disparar (cada forma de recarga o cadencia, contra cada enemigo
que alcance y vea, repartida entre los asaltos de recarga que deja) con su mejor ataque cuerpo a
cuerpo; recarga si el próximo disparo, repartido entre los asaltos que faltan, rinde más que pelear;
si nadie está al alcance pero alguien llegará, le apunta. Quien usa un arma a distancia no se acerca
ese asalto. Si el blanco cae a mitad de los disparos, sigue con el que más rinda. Antes de disparar
retrocede (hasta un cuarto de su movimiento, sin penalizador) si así ningún enemigo lo alcanza el
asalto siguiente y sigue viendo y alcanzando a su blanco. Intenta atrapar con Trucos de manos si lo
que espera recibir intentándolo es menos que defendiéndose como siempre.

**Interpretaciones confirmadas** (14/10/2026; la 1, la 3 y la 5 son adaptaciones de mesa aceptadas:
el manual permite mezclar acciones con −25, recoger armas y obliga a desenfundar con −25 y a usar
el turno del arma más lenta):

1. Disparar, recargar o apuntar ocupa todo el turno: no se mezclan disparos y golpes en un asalto.
2. Los asaltos de recarga se gastan recargando (el turno); si hace otra cosa, la recarga no avanza.
3. Una arrojadiza lanzada se pierde: no se recoge durante el combate.
4. Un arma encasquillada no se vuelve a usar en el combate.
5. El turno es siempre el del arma principal: usar el arma a distancia no lo cambia ni cuesta
   desenfundar.
6. La cobertura (−40) sale de la geometría: un cuerpo en la línea o la esquina de una pared. También
   resta a las técnicas de Ki a distancia, que no tienen los demás modificadores de la Tabla 47.
7. La velocidad del blanco cuenta si se movió en el asalto, por su Tipo de movimiento.

**Interpretaciones confirmadas** (14/10/2026; la 8 y la 10 son adaptaciones aceptadas: el manual
dice "esquivarlo", y deja entrar conjuros y descargas en los disparos paralelos):

8. Si no atrapa el proyectil con Trucos de manos, se defiende con su habilidad −50 aunque pare (el
   manual dice "esquivarlo"; la ficha sólo tiene la defensa que usa).
9. La ballesta de repetición dispara como un arma de índice 1 mientras tenga virotes en la recámara
   (4); vacía, la recarga entera con su índice de 3.
10. Disparos paralelos: sólo con armas a distancia y contra disparos de armas (no técnicas de Ki); el
    que dispara a la vez elige el blanco que más le rinda y ya no actúa en su turno.
11. Retroceder antes de disparar: sólo hasta un cuarto del movimiento, para no sufrir el −10.
12. Lleva escudo si entre sus armas hay uno (escudo, rodela); el Tamaño, si la ficha no lo trae, es
    Fuerza + Constitución.

**Cómo quedan las demás reglas:**

- **Lluvia de proyectiles** (Core p.97): es un atajo de mesa para no tirar cada disparo de más de diez
  tiradores; el simulador los resuelve uno por uno, que es lo exacto.
- **Preparado para disparar** (Core p.95; el texto está cortado en el manual): con la adaptación 5
  (siempre el turno del arma principal) no hay nada que cambie.
- **Recoger arrojadizas**: no, por la adaptación 3.

## Ki (fase 3)

Dos partes (Core p.102-107, Dominus cap. 2 y 5):

- **Habilidades del Ki y del Némesis**: poderes comprados con CM (columna R de la hoja Ki, en
  `rasgos.habilidadesKi`). Los bonos fijos (Velocidad incrementada +10 al turno, Daño incrementado y
  Extensión del aura +10 al daño, Armadura de energía TA 2 ENE) **ya vienen sumados en la planilla**:
  el motor no los vuelve a sumar. Uso de la energía necesaria deja gastar 5 de cansancio por asalto.
- **Técnicas**: se acumula Ki por característica cada asalto y se gasta para ejecutarlas. Son sobre
  todo de los Tecnicistas (Kael). La planilla trae las propias y las de los árboles armados.

### Datos (`hoja/ficha.ts`, `leerKi`)

`Ficha.ki`: reserva (Unificación de puntos de Ki), acumulación por característica y técnicas con
nivel, CM, coste por característica, mantenimiento por asalto, si es Combinable y sus efectos con
opciones. Se leen de los bloques de la hoja Ki desde el título "Técnicas de Dominio"; Combinable, de
"Creación de Técnicas". La variante Akuma Exxet corre las filas: las cabeceras se buscan por etiqueta.

### Motor (`motor/ki.ts`)

| Regla | Fuente |
|---|---|
| Acumular es pasivo: cada asalto suma su acumulación de cada característica, sin pasar la reserva | Core p.102 |
| Si además hace cualquier otra cosa, lo ganado en el asalto queda en la mitad hacia arriba (Acumulación Plena lo evita); dentro del asalto tiene la acumulación entera | Core p.102, p.106; Dominus p.18 |
| Cada −20 a toda acción baja 1 cada acumulación | Core p.232 |
| Si deja de acumular, lo concentrado vuelve a la reserva | Core p.102 |
| Ejecutar: se declara antes de tirar (antes de la iniciativa si cambia el turno); gasta su coste de lo concentrado y de la reserva | Core p.105 |
| Efectos de tipo Acción valen para esa acción; de tipo Asalto, para todo el asalto | Dominus p.48 |
| Mantenidas: pagan su mantenimiento cada asalto de la reserva, sin acumular; sus efectos de Acción valen una vez por asalto. Dejar de mantenerlas no cuesta nada | Dominus p.48 |
| En espera: la técnica declarada antes de empezar a acumular, una vez juntada, queda lista con su Ki apartado (no se pierde al terminar el asalto ni al ejecutar otras) pagando 1, 2 o 3 de Ki por asalto según su nivel | Core p.105 |
| Defensa adicional +N: las N defensas siguientes del asalto no tienen penalizador por defensa adicional | Dominus p.56 |
| Los efectos iguales de varias técnicas no se suman: vale el mayor | Core p.106, Dominus p.49 |
| Multiplicador al Daño antes de sumar otros bonos; área de Ki con el doble de la Presencia + bono de Poder si conviene; sin Elección de blanco alcanza también a los aliados del radio | Dominus p.55, p.58 |
| Armadura: una capa más contra todo, energía incluida (TA 6 + TA 4 = TA 8) | Dominus p.60 |
| Ataque y Defensa Predeterminada: valor final fijo, sin dados | Dominus p.51, p.53 |

Efectos que entiende: Habilidad de ataque, de contraataque, de parada y de esquiva (normal, completa
y limitada), Ataque y Defensa predeterminados, Aumento, Multiplicador y Sustitución de Daño (y sus
versiones reales), Ataque y Defensa adicional, Incrementar Turno, Ataque con área, Ataque a
distancia, Destruir armadura, Armadura, Incremento de RF, Dañar energía, Maniobras de combate y
apuntar, Potenciar Crítico, Ataque sobrenatural, Ataque elemental, Ataque indirecto, Marca, Impacto,
Apresamiento, Estados sobrenaturales, Interrupción, Escudo de energía, Acumulación, Intangibilidad,
Reflectar el ataque y Absorción de Ki; y las desventajas Agotamiento, Exceso de energía,
Penalizador a toda Acción, Circunstancia límite, Daño reducido y Ataque especializado. Los demás se
registran como desconocidos y se ignoran.

### Combinables y forzadas (`repertorio`)

Lo que puede ejecutar es su repertorio: sus técnicas, las combinaciones de 2 o 3 Combinables y, con
Forzar Técnicas, la versión forzada de cada una. La IA elige entre todas con la misma cuenta.

| Regla | Fuente |
|---|---|
| Combinables: se usan a la vez en una acción, suman sus costes y reúnen sus efectos; de los iguales vale el mayor | Dominus p.49 |
| Forzar: el doble de cada acumulación; cada efecto sube la mitad hacia abajo, el multiplicador +1 y las Resistencias +40 | Dominus p.21 |
| Una mantenida se fuerza sólo al ejecutarla; los asaltos siguientes se mantiene la normal | Dominus p.21 |

### Habilidades del Ki que se usan en combate

| Habilidad | Cómo se simula | Fuente |
|---|---|---|
| Armadura de energía mayor | La planilla ya trae TA 4 contra energía; apagada vuelve a TA 2. La IA la enciende (1 de Ki al encenderla y cada 5 asaltos) si algún rival ataca con energía | Dominus p.19 |
| Armadura de energía arcana | TA 4 gratis; TA 6 pagando como la mayor | Dominus p.19 |
| Recuperación | 5 de Ki por 1 de cansancio, uno por asalto | Core p.105 |
| Dominio físico | +10 a la RF contra críticos y estados | Dominus p.22 |
| Aura de combate | Control de Presencia + d100 de los enemigos sensibles (Presencia menor a la suya −10) contra la dificultad; afectado (−10), miedo o parálisis según el fracaso, desvanecido con 100 o más. Gratis, 1 de Ki cada 5 asaltos | Dominus p.20-22, Tabla 9 |
| Absorción de energía | 1 de Ki por cada 5 de daño de energía | Dominus p.20 |
| Curación por Ki / superior | 2 o 5 PV por Ki, nunca más de la mitad del daño sufrido; una acción activa en lugar de un ataque | Core p.104, Dominus p.20 |
| Aumento de características (Incremento superior) | Sube AGI, CON, DES o FUE hasta +3 (+4) pagando el valor alcanzado y 1 de Ki por asalto (cada 10); recalcula los bonos de la Tabla 3 | Core p.105, Dominus p.21 |
| Destrucción por Ki | Toque sin penalizador; RF contra la Presencia base (+5 por punto extra, hasta el doble); el fracaso es daño sin armadura | Core p.104 |
| Forzar Técnicas | Ver arriba | Dominus p.21 |

### Efectos sobrenaturales (Dominus cap. 5)

| Efecto | Cómo se simula | Fuente |
|---|---|---|
| Estados sobrenaturales | Cada Estado añadido se tira aparte con su RF. Condición Ataque o Beso (−120): si el golpe daña (o dañaría, con Daño reducido); Contacto físico: si alcanza contra TA 0; las demás (visual, sonido, aire, superficie) son automáticas: una acción activa sin tirada de ataque sobre un blanco o, si son de varios, sobre todos a la Distancia del Efecto | p.66-68 |
| Duraciones | Lo que dura minutos u horas dura todo el combate; las parálisis, tantos asaltos como el fracaso; Penalización menor baja 5 por asalto | p.67 |
| Escudo de energía | Defiende con su parada o esquiva sin penalizador por defensas adicionales ni por proyectiles; si para, recibe el daño base (+10 por TA que reste el ataque) salvo que no pase su barrera 40; si se rompe, el resto alcanza sin defensa. Mantenido conserva el daño | p.66; Core p.100; Dominus p.11 |
| Acumulación | Ese asalto es un ser con acumulación, con TA 4 más y una pantalla de PV que pierde primero | p.65 |
| Intangibilidad | Lo atraviesa todo ataque que no sea de energía | p.69 |
| Reflectar el ataque | Si se defiende con éxito, el ataque vuelve con la habilidad final del atacante (+ el bono de contra) y su daño, sin efectos esotéricos; no gasta acciones | p.71 |
| Absorción de Ki | Con una defensa que permita contraatacar se queda con Ki de la técnica rival (hasta su límite) | p.64 |
| Apresamiento | Presa sin penalizador, con el valor de la técnica en el control | p.64 |
| Impacto | Control enfrentado de su Fuerza contra la del Impacto si supera la defensa; si lo pierde, Tabla 2 (metros) y Tabla 3 (daño del Grado, −10 por TA contundente; desde G4 crítico con el doble). Con Atraer, lo trae al cuerpo a cuerpo | p.68-69, p.12 |
| Marca | Si daña, +20 (menor) o +50 (mayor) a sus ataques contra ese rival | p.70 |
| Interrupción (Ki) | RF contra el daño + el valor; si falla, pierde lo acumulado, las mantenidas y las que tenía en espera | p.69 |
| Potenciar Crítico | Suma a la tirada del crítico; con Crítico automático, critica si daña | p.70-71 |
| Ataque sobrenatural | Ataca en ENE; sólo lo para quien para energía (o con un escudo) | p.64 |
| Ataque elemental | Ataca en CAL (fuego), ELE (aire), FRI (agua), FIL/CON/PEN (tierra) o ENE (luz, oscuridad), sin el −10 del crítico secundario | p.63 |
| Ataque indirecto | No se le puede contraatacar | p.52 |
| Ataque a distancia | Alcance en metros; daño del arma o 2×Presencia base + bono de POD. Proyectil disparado: el defensor sufre la Tabla 49 (parada −80, maestro −20; esquiva −30, maestro 0); el ataque final tiene que superar la dificultad de la Tabla 48. A distancia sólo se apunta, y no hay contra si no lo alcanza | p.57; Core p.96 |

Desventajas: Agotamiento (cansancio al ejecutarla, sin bono), Exceso de energía (paga otra vez su
coste), Penalizador a toda Acción (baja 10 por asalto, nada lo quita), Circunstancia límite (mitad
de PV, un cuarto, PV negativos, o haber recibido más de 10 de daño el asalto anterior), Daño reducido
(mitad o nada, los efectos siguen) y Ataque especializado (contra otra defensa no tiene efectos).
Las demás (elementales, condiciones de ambiente, Predeterminación…) no cambian el combate simulado.

**Interpretaciones confirmadas** (14/10/2026):

1. El Aura de combate alcanza a todos los del radio (Presencia/5 m), aliados incluidos, salvo a
   quienes tengan la Presencia a 10 o menos de la suya; su paralización es parcial ("incapaz apenas
   de moverse"). La IA no la enciende con un aliado sensible cerca.
2. Absorción de energía: contra daño plenamente sobrenatural o energético (ataques en ENE, Ataque
   sobrenatural, descargas), no contra un golpe físico que sólo daña energía ni contra efectos con
   RF (Dominus p.20).
3. Curación por Ki es una acción activa que reemplaza un ataque.
4. Aumento de CON no cambia los PV durante el combate.
5. Destrucción por Ki se paga al usarla (1 de Ki más los extra) y es su propio ataque de contacto.
6. Control y Terror lo sacan del combate (como huido); Fascinación lo deja sin acciones activas
   hasta superar la RF, que repite cada vez que lo atacan; las Ilusiones no se simulan.
7. Estados automáticos de varios blancos alcanzan también a los aliados a esa distancia.
8. Impacto: Tabla 2 (metros, el mínimo del rango) y Tabla 3 (daño medio del Grado); contra un muro
   el Grado no baja.
9. Reflectar usa la habilidad final y el daño base del atacante; lo reflejado no se vuelve a reflectar.
10. Las técnicas a distancia sufren la Tabla 48 (dificultad por distancia); la cobertura llega con la
    línea de visión.

11. Aumento de FUE: el daño final se redondea en grupos de 10 hacia arriba, como siempre que se suma
    el bono de Fuerza (Core p.74: sable 45 + 10 = 55 → 60).
12. El efecto de técnica Acumulación (Dominus p.65) lo hace actuar ese asalto como una criatura con
    Acumulación de daño: no tira defensa y no pierde sus acciones al recibir impactos. Acumular Ki,
    en cambio, deja defenderse normalmente.

**Interpretaciones confirmadas**:

1. Al ejecutar una técnica, lo sobrante sigue disponible hasta el fin del asalto para otra técnica
   atada a otra acción del mismo asalto (Core p.106: "pueden realizarse tantas Técnicas como permita
   el Ki concentrado"). Al terminar el asalto vuelve a la reserva y la acumulación empieza de cero: no
   se guarda Ki concentrado para asaltos futuros salvo que se siga acumulando sin ejecutar.
2. El área de Ki pega a todos los del radio (centrada en el blanco elegido) y no se intercepta: la
   intercepción al parar es sólo de la maniobra Ataque en área con un arma (Core p.92).
3. Defensa adicional +N deja N defensas sin penalizador a partir de la que ejecuta la técnica. El
   ejemplo del Dominus (p.56) dice que con +3 "se defenderá de los tres primeros golpes con
   habilidad plena" y el cuarto va a −30: eso daría N − 1 (la primera defensa nunca tiene
   penalizador), y entonces +1 no haría nada. Se toma N.
4. Una técnica en espera que se ejecuta no reinicia lo acumulado para otras (Core p.105: "nada
   impide a un personaje que tiene preparada una Técnica empezar a acumular otras").

### Límites (Dominus p.28-29)

Se leen de la hoja Ki (debajo del título "Límite"). Recuperan Ki perdido sin pasar la reserva inicial:
Caelum 30 una vez al bajar de un cuarto de los PV; Terminus 30 una vez al quedar con PV negativos;
Cenobus 1 cada 5 de daño (máx. 60); Cruor 10 por cada crítico sufrido; Agon 1 por asalto; Mors 1 por
rival muerto (máx. 10 por asalto). Custodium (un ser querido en peligro) no se simula.

### Leo, Armas-pistola (Ars Magnus, Dominus p.101)

Ataque combinado: −20 al ataque con la hoja; si alcanza el cuerpo (dañe o no), dispara a bocajarro
con +30 (Tabla 47) y sin otro penalizador que el −20. A bocajarro el defensor no sufre los
penalizadores contra disparos (Core p.96). La bala no suma la Fuerza del usuario sino la del arma
(pistola 10, rifle 11, cañón 12; +1 por cada +5 de calidad).

**Interpretaciones confirmadas**:

1. Daño incrementado suma +10 a la bala ("también funciona con proyectiles", Dominus p.19); Extensión
   del aura no (la bala es un proyectil, no el arma extendida). Kael: 50 + 15 + 10 = 75 PEN.
2. El disparo no gasta otro ataque y va antes de las contras del golpe con la hoja.
3. Recámara de 6 balas (la más corta del rango 6-12) y sin recargar durante el combate (recargar lleva
   dos asaltos completos).

### IA

- Acumula siempre que le quede reserva: es pasivo y no cuesta nada.
- Técnica de ataque: se prueba cada técnica con cada maniobra y se descuenta el Ki gastado a un
  precio por punto (gastar toda la reserva tiene que rendir la mitad de sus PV; sube al vaciarse).
  Guarda Ki si una técnica mejor estará lista en 1 a 3 asaltos y rinde más que la de ahora en todos
  esos asaltos.
- Técnica de defensa: si lo que le ahorra del golpe (y de los siguientes del asalto, con efectos de
  Asalto) vale más que el Ki.
- Técnica de turno: antes de la iniciativa, por la chance de actuar primero y de sorprender.
- Mantenidas: al empezar cada asalto deja de mantener la que rinde menos que su mantenimiento.
- En espera: al empezar a acumular de cero declara la técnica (de las que tardan más de un asalto)
  que más rinde por asalto de acumulación; si al final de un asalto la juntó y no la usó, la deja en
  espera. Si pasa más de 3 asaltos en espera sin usarse, la deja ir.
- Efectos sobrenaturales: cada uno vale en PV (un estado, lo que deja de pegar o los PV que le
  quedan si lo saca del combate, por la chance de fallar la RF; Impacto, el asalto que pierde; Marca,
  lo que suman los golpes siguientes; Interrupción, el Ki que le hace perder). Las desventajas se
  descuentan (Exceso, el Ki otra vez; Agotamiento, 5 PV por punto; Penalizador, lo que deja de pegar).
- Estados automáticos: en lugar de un ataque, si rinden más que su mejor ataque (los aliados que
  alcance cuentan en contra).
- A distancia: si el objetivo está lejos, ataca con la técnica a distancia que más rinda si eso vale
  más que acercarse a pegarle. Intangibilidad, antes de la iniciativa, por lo que le ahorra de los
  que no dañan energía. Escudo, Acumulación, Reflectar y Absorción de Ki, al defenderse.
- Aumento de características: el atributo que más gana en golpes previstos (4 asaltos) frente a su
  costo. Armadura mayor si algún rival ataca con energía; Aura si algún rival es sensible;
  Recuperación si le sobra el Ki. Curación cuando un aliado (o él) está por debajo del 70%.

### Pendiente del Ki

No se simulan (no cambian el combate de la mesa o piden reglas que todavía no están): Camuflar
ataque (Advertir), Acción adicional, Recuperar acción, Previsión, Transporte automático, Parada en
área, Aumentar rotura y entereza, Incremento de movimiento y de habilidad, Capacidad incrementada,
Armas físicas de Ki, Espejismo, Choque físico (descargas), las Ilusiones, Regeneración de escudos y
pantallas, Ataque continuo y Combo, Proyección y Estela de destrucción, y la Transmisión del Ki.
Las técnicas a distancia todavía no miran la línea de visión (llega con los proyectiles).

Velocidad: con Ki la IA evalúa cada técnica con cada maniobra. Tras las optimizaciones exactas (huella
idéntica) Kael simula unos 1.500 combates/s contra unos 3.300 sin Ki (`npm run bench -- Kael`).
