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
| Iniciativa = turno + d100 abierta cada asalto; pifia en turno actúa último | Core p.86, Tabla 52 |
| Sorpresa: diferencia de iniciativa ≥150 → −90 a la defensa en la primera acción del que sorprende | Core p.86 |
| Ataque y defensa: habilidad + d100 abierta (90+, luego 91+, 92+…; 100 siempre abre) | Core p.10 |
| Pifia 1-3 (maestría >200: 1-2). Ataque pifiado: falla, contra con bono = nivel de pifia, pierde acciones | Core p.97 |
| Defensa pifiada: resta el nivel de pifia | Core p.97 |
| Impacto: resultado > 0. Daño % = (resultado − absorción) en grupos de 10. Absorción = 20 + 10×TA | Core p.88 |
| Impactado (aunque sea sin daño) → a la defensiva: pierde acciones activas del asalto | Core p.89 |
| Contraataque: resultado < 0. Bono = mitad redondeada a 5, máx +150. Consume un ataque declarado | Core p.89 |
| Ataques adicionales: 1 extra por cada 100 de ataque; −20/−30/−40 (arma P/M/G) a todos | Core p.90 |
| Defensas adicionales: −30, −50, −70, −90 | Core Tabla 44 |
| Flanco/espalda por cantidad de enemigos trabados: 1-3 frente, 4-5 flanco, 6+ espalda | Core p.90, Tabla 43 |
| Movimiento: hasta ¼ del tipo de movimiento es pasivo; más es acción activa (−25 a lo siguiente) | Core p.86, Tabla 25 |
| Defensa total: +30 a defensa, sin acciones activas. Se declara antes de la iniciativa | Core p.93 |
| Resistir el golpe: −80 a defensa (mín. 0) pero no queda a la defensiva | Core p.93 |
| Cansancio: +15 por punto, máx. 2 por asalto, en cualquier tirada física. Agotamiento Tabla 27 | Core p.62 |
| Crítico: un golpe ≥ ½ de los PV actuales. Nivel = daño + d100 (exceso sobre 200 a la mitad) vs RF + d100 | Core p.97 |
| Efectos del crítico: ≤50 dolor; >50 mitad permanente + localización; >100 miembro/cabeza/corazón; >150 inconsciente | Core Tabla 50-51 |
| Acumulación de daño: sin tirada de defensa, nunca a la defensiva, sin contras, crítico a la mitad | Core p.98 |
| PV ≤ 0: fuera de combate. PV ≤ −5×CON: muerto | Core p.58 |

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

Toda opción se valora en "daño esperado":

```
valor = daño esperado causado
      + tempo: si el objetivo aún no actuó, P(impacto) × su daño esperado del asalto
      + bono por probabilidad de dejarlo fuera de combate
      − λ × daño esperado recibido por contras
      − costo del cansancio
```

`λ` sale del perfil: agresivo 0.5, equilibrado 0.9, cauto 1.4. Las bestias (inteligencia ≤ 4)
atacan al más cercano.

### Reglas de la IA que salieron de probar

- **Declaración simultánea.** Todos declaran viendo el asalto anterior. Si declaran en orden, el
  segundo ve lo que eligió el primero y el espejo deja de dar 50/50.
- **Esperar sólo si se gana el intercambio.** Defensa total y guardar ataques para contras retrasan
  la caída, no ganan. Se permiten sólo si el equipo le saca PV al rival más rápido de lo que los
  pierde (`ventajaEquipos`) y, para la defensa total, si hay aliados que peleen mientras tanto.
- **Coordinación.** Al declarar, supone que la mitad de los aliados que llegan a un blanco lo
  atacan antes: el blanco llega con defensas adicionales encima.
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
| Barrera de daño | Escudo físico (= Presencia base), Hanja (60, Arcano 200), a mano. Un daño base menor no quita PV, salvo que dañe energía |
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
3. **Cansancio en la iniciativa**: negativo entero, como cualquier negativo a toda acción.
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

- **Fichas:** se arrastran planillas `.xlsx`/`.xlsm` o un escenario `.json` (el formato del CLI). Las
  planillas de un escenario se buscan por nombre de archivo entre las ya cargadas. Lo cargado se
  recuerda en `localStorage`.
- **Combate:** dos equipos, con arma y perfil por luchador; una ficha repetida se numera. Opciones
  del escenario (rotura, huida, espacio reducido, armas enfundadas, fase lunar), cantidad de
  combates, hilos y semilla. La fase lunar sólo se habilita si alguien tiene el Legado de la Luna.
- **Publicación:** `.github/workflows/pages.yml` la construye y la publica en GitHub Pages en cada
  push a `main`.
- **Monte Carlo en paralelo** (`paralelo.ts`): un worker por núcleo. Los combates se cortan en
  tandas de 250, cada una con su semilla; cada worker pide la siguiente al terminar, y
  `combinar` (`src/motor/montecarlo.ts`) junta los resultados. Resultados parciales en vivo.
- **Narrar un combate:** corre uno con registro, con la semilla elegida.

El contenedor de desarrollo queda para tests, simulaciones largas y mediciones.

## Cómo correrlo

```bash
npm install
npm test                                     # reglas, tablas contra dados reales, combate
npm run sim -- ejemplos/duelo.json           # 10.000 combates
npm run sim -- ejemplos/duelo.json ver 7     # narra el combate con semilla 7
npm run sim -- ficha "Kaito.xlsm"            # lo que se lee de una planilla
npm run sim -- ejemplos/mesa.json            # Kaito contra Teseo desde sus planillas
npm run dev                                  # la página en http://localhost:5173
npm run build                                # la página estática en dist/
```

Velocidad (un hilo, empaquetado): ~4.500 duelos/s de ~10 asaltos. El tiempo se va en la IA
(`pronostico`), no en los dados.

## Mapa

Sin grilla, con posiciones en metros (2D continuo). Alcance cuerpo a cuerpo 2 m. Trabarse con
alguien lo agrega a una lista ordenada por llegada: el orden define frente/flanco/espalda.

## Fases

1. **Motor físico + IA + Monte Carlo por consola** ← ahora
2. Interfaz web (Vite) + workers en paralelo ← versión base hecha
3. Ki: acumulación y técnicas
4. Magia (zeon, ACT, escudos) y psíquica
5. Proyectiles, maniobras (derribo, presa, desarmar, área), repetición animada
