# Auditoría contra los manuales (14/10/2026)

Revisión línea por línea del motor (`src/motor/`) contra los markdown de Core Exxet, Dominus Exxet y
Gaia I. Las páginas son las del PDF (las del índice impreso son 2 menos), como en el resto del código.

- **Corregido:** 16 diferencias con el manual. 3 venían de la sesión en la nube, 12 eran del código
  anterior.
- **Decisiones:** 9 puntos donde la regla no era literal, todos respondidos y aplicados.
- **Falta modelar:** reglas del manual que el simulador todavía no tiene.
- Pruebas: 142, todas pasan (`test/auditoria.test.ts` cubre lo corregido).
- **Segunda auditoría (15/10/2026):** 19 correcciones más (17 a 35) y 4 puntos para decidir, en la
  sección 7.

## 1. Corregido

| # | Qué estaba mal | Qué dice el manual | Dónde |
|---|---|---|---|
| 1 | **Pifia en la iniciativa** tiraba nivel y valía natural − nivel (cambio de la nube) | "Actuará automáticamente en último lugar. Al no ser estrictamente una habilidad, no es necesario calcular el Nivel de Pifia." Para la sorpresa se usa el turno con la Tabla 52 (−125/−100/−75). Core p.98 | `combate.ts` |
| 2 | **Afortunado** bajaba la pifia como Buena suerte (cambio de la nube) | Afortunado: "nunca sufrirá los efectos negativos de una trampa o de un ataque que se determinen mediante el azar". Sólo Buena suerte baja la pifia. Core p.21 | `rasgos.ts` |
| 3 | **Arquetipos de Abel** con TA "aproximadas" y entereza 0 (cambio de la nube) | Tabla 38 exacta (Cuero tachonado 3/1/2/2/1/2, Peto 4/5/4/1/0/1, Piezas 4/3/2/3/2/2) y entereza de la Tabla 37 (14, 16, 15). Con entereza 0 la rotura opcional las rompía siempre | `ejemplos/arquetipos-abel.json` |
| 4 | **RF contra críticos y puntos de presión** restaba el negativo a toda acción | "Las Resistencias del personaje no lo sufren." Core p.232 | `combate.ts` |
| 5 | **Iniciativa** restaba el negativo entero | "La única excepción a esta regla se encuentra en el cálculo de la iniciativa, donde el penalizador se reduce a la mitad." Core p.232. Esto da vuelta la decisión 3 de DISENO.md (ver 2.1) | `calculos.ts` |
| 6 | **Flanco y espalda al atacar**: el −10/−30 lo sufría quien estaba en el flanco | "−30 a parar o esquivar un ataque de un sujeto situado en su lateral, y un −10 para atacarlo": lo sufre el rodeado al atacar a quien tiene al costado. Soo Bahk avanzado y Hanja lo anulan. Core p.90, Dominus p.38 y p.43 | `calculos.ts` |
| 7 | **Precisa no reducía Engatillar** (y los ataques sin armas son Precisos) | "Disminuir a la mitad los penalizadores de los golpes apuntados, y los de la maniobra de Engatillar." Core p.76 | `estilos.ts` |
| 8 | **Negativos en controles de características** no se aplicaban | "Cada 20 puntos de penalización, disminuye temporalmente un punto el valor de todas sus características a la hora de realizar controles enfrentados" (y +1 cada +20 de bono). Afecta Derribo, Presa, Desarmar, zafarse y Emp arcano. Core p.232 | `calculos.ts`, `combate.ts`, `ia.ts` |
| 9 | **Kardad supremo** repetía todos los controles fallados | "Puede repetir **una vez por asalto** cualquier Control de Características enfrentado que falle." Dominus p.37 | `combate.ts` |
| 10 | **Xing Quan** perdía el bono con Inutilizar e Inconsciencia | Lo pierde con "cualquier maniobra que no sea un Ataque Apuntado"; las dos son apuntadas. Dominus p.38 | `calculos.ts` |
| 11 | **Muerte** a −5×CON exacto | "Aguanta sin morir hasta el quíntuple del valor de su Constitución en PV negativos" (Constitución 8 aguanta hasta −40). Core p.60 | `combate.ts` |
| 12 | **Ojos de la Muerte** hacía crítico automático contra acumulación | "Las criaturas con Acumulación de daño no sufren un Crítico automático, pero todo su cuerpo se considera un punto vulnerable." Dominus p.78 | `combate.ts` |
| 13 | **Berserker** podía huir | "Incapaz […] de comprender cuándo debe retirarse." Dominus p.84 | `ia.ts` |
| 14 | **Mala suerte y armas Complejas** no cambiaban la pifia (la nube agregó Buena suerte y se quedó ahí) | Mala suerte: pifia con 5 (4 con maestría), Core p.25. Compleja: "fracasando con un resultado de 5 […] Si alcanza la maestría con ella, desaparece", Core p.76. Compleja se lee de la descripción del arma; sólo cuenta al parar, no al esquivar | `reglas.ts`, `rasgos.ts` |
| 15 | **Armadura en los apuntados** usaba la TA del cuerpo | "En los golpes apuntados se aplica únicamente el tipo de armadura de la zona" (Core p.92). El peto cubre el torso, la camisola también los brazos, la completa todo menos la cabeza, y el yelmo sólo la cabeza (Core p.83, p.85). Se lee la Localización de cada capa de la planilla; lo que la planilla suma fuera de las capas (armaduras especiales, como la de Energía por Ki) cubre todo el cuerpo. Inutilizar va a la pierna (sólo la protege una completa). La rotura opcional sólo controla las capas de la zona golpeada | `calculos.ts`, `combate.ts`, `hoja/ficha.ts` |
| 16 | **Frialdad** no se aplicaba (15/10/2026) | "Si un personaje es blanco de un efecto sobrenatural que afecte a su ánimo o emociones, podrá añadir el bono a la Resistencia que corresponda empleando la Tabla 13" (Core p.54); el Aura de combate la nombra (Dominus p.21). Se suma al resistir el Aura y los estados de Miedo, Terror y Fascinación del Ki, y Éxtasis. Se lee de la planilla | `combate.ts`, `reglas.ts`, `hoja/ficha.ts` |

## 2. Decisiones (respondidas el 14/10/2026)

1. **Negativos en la iniciativa a la mitad:** como dice el Core p.232, bonos incluidos.
2. **Armadura en los apuntados:** la de la zona (corrección 15).
3. **Engatillar con Precisa y Tabla de Precisión:** se acumulan, −25 (como Sambo supremo con Precisa).
4. **Pifia en turno con Mala suerte (4 o 5):** −75 para la sorpresa, el tope de la Tabla 52.
5. **Selene arcano:** sus contras van con la habilidad plena, sin el penalizador de ataques
   adicionales (no cuentan como ataques, Dominus p.39). `calculos.ts`
6. **Desequilibrio de atributos (Dominus p.10):** opción de escenario `desequilibrio`, apagada por
   defecto; también en la página. `calculos.ts`
7. **Combinación de modificadores (Dominus p.11, Tabla 1):** parálisis completa no suma flanco,
   espalda ni ceguera; ceguera absoluta + flanco −100, + espalda −120. `calculos.ts`
8. **Orochi a 0 PV:** desencadenada no cae; deja de perder PV y hace un control de Voluntad (contra
   10) al final de cada asalto; si lo falla, cae inconsciente. Sigue muriendo por debajo de −5×CON.
   `combate.ts`
9. **Maestría con 200 o más** (Core p.17: "llega a tener una habilidad final de 200"): pifia, armas
   Complejas y parada sin armas. `reglas.ts`

## 3. Falta modelar (reglas del manual que no están)

Todo lo que figuraba acá quedó resuelto el 15/10/2026 (sección 8, correcciones 48 a 56): Debilidad,
parar sin armas con armadura dura, armas con regla Presa, Kung Fu (bono al turno, PEN), Dumah (FIL o
PEN), Inutilizar a la pantorrilla, Ojos de la Muerte (líneas existenciales, invisibles), Velez
arcano (Poder en los controles), Enuth arcano contra la acumulación y la Maniobra Especial por rival.

**No hace falta modelar:** Enuth puede reducir su daño a voluntad (Dominus p.43), pero eso nunca ayuda
a ganar un combate; Ojos de la Muerte ignora la Barrera de Daño de los *objetos* (Dominus p.78), no
la de las criaturas.

**Decidido por el usuario (15/10/2026):** la Tabla 25 da la velocidad "una vez que ya se encuentra en
movimiento" (Core p.62) sin decir cuánto avanza quien arranca de parado: queda como está, corre a
tope desde el primer asalto (el manual no da otra cifra).

## 4. Verificado correcto

Coincide con el texto, con la página citada en el código:

- **Dados:** tirada abierta 90/91/92…, 100 siempre abre; pifia 1-3, maestría 1-2; crítico y RF sin
  abierta; regla del 10 en características; control enfrentado con exceso de 4 doble.
- **Asalto:** máximo de ataques por cada 100; −20/−30/−40 por tamaño; segunda arma −40 (Ambidestría
  −10) acumulando el penalizador compartido; defensas adicionales −30/−50/−70/−90; contraataque a la
  mitad en grupos de 5, máx. +150, sólo contra el agresor y no en área; pifia de ataque da contra con
  el nivel y quita las acciones; pifia de defensa resta el nivel.
- **Daño:** absorción 20 + 10×TA; % en grupos de 10; menos de 10 no daña; impactado queda a la
  defensiva aunque no dañe; reducción de TA por calidad (−1 cada +5) y mellado de armas.
- **Críticos:** mitad de los PV actuales o más; 1/10 en punto vulnerable; nivel con exceso sobre 200 a
  la mitad; tramos ≤50, >50, >100, >150; cabeza inconsciente pasado 50; cabeza o corazón matan pasado
  100; acumulación a la mitad y pierde la acción pasado 50.
- **Tabla 43:** flanco, espalda, sorpresa (−90 sólo a la primera acción), derribado, parálisis menor,
  parcial y completa, amenazado, posición superior contra derribado, desenfundar, espacio reducido.
- **Maniobras:** Derribo −30 (−60 arma corta), Presa −40 sólo sin armas o con Presa Inusual, Desarmar
  −40, contra TA 0 y con 10% para el control; −3/+3 por <100%/>200%; grados de presa (<3, ≥3, >10);
  zafarse con −3; captor en parálisis menor; Inutilizar e Inconsciencia mitad de daño y crítico pleno,
  Inconsciencia −40 sin Contundente y nunca mata; Engatillar −100 con armadura; área −50 con 3/4/5
  blancos y la intercepción al parar; crítico secundario −10.
- **Defensas especiales:** Defensa total +30 declarada antes de la iniciativa; Apartar sólo
  esquivando, −30; Resistir el golpe −80 con mínimo 0 y pierde la acción sólo con un crítico con
  efectos.
- **Rotura (opcional):** d10 + rotura > entereza; bono de Fuerza 8-9 +1 … 15+ +5; calidad pierde un
  grado; armadura −1 a todas sus TA; parada sin armas 5 de daño por punto y sin perder la acción.
- **Retirarse:** acción activa; Acción Respuesta con flanco de cada enemigo con ataques; si una daña,
  no se va; con sorpresa se va libre; Acrobacias por más de 40.
- **Cansancio:** +15 por punto, máximo 2 por asalto, sólo habilidades físicas; Tabla 27; Inmunidad al
  dolor, Eliminación de penalizadores y Exhausto.
- **Tablas de estilo:** Área, Desarme, Precisión, Ataque Encadenado, Batto jutsu, Segunda Arma: Estilo
  Defensivo, Crítico Incrementado, Ataque Inusual, Presa Inusual, Guardaespaldas, Espacios Reducidos,
  Sujeción.
- **Artes marciales (sólo sin armas):** Aikido, Kung Fu, Pankration, Boxeo, Moai Thai, Capoeira,
  Malla-yuddha, Sambo, Kempo, Tae Kwon Do, Lama, Grappling, Kardad, Xing Quan, Soo Bahk, Emp, Selene,
  Velez, Asakusen, Lama Tsu, Seraphite, Melkaiah, Dumah, Mushin, Hakyoukuken, Shephon, Enuth, Hanja,
  Godhand, Rex Frame.
- **Ars Magnus:** Berserker, Guardián (−10, no si lo sorprendieron), Ataque Final, Maniobra Especial,
  Haima (mínimo 5 PV, requiere Sangre Eterna), Samiel (máx. +150 por acción).
- **Legados:** Aeon (afinidad elemental), Toa (+10 RF a críticos), Ojos de la Muerte, Tsukiyomi,
  Uroboros (sorpresa con 100, retirada sin flanco), Sangre Eterna, Orochi (+20/+30, 2/5 PV por asalto,
  control de Voluntad por crítico con −3 si está despierta).
- **Prever Sorpresa:** declarada antes de la iniciativa contra cada rival; anula el −90 y cuesta −40 a
  la primera acción enfrentada contra cada uno.
- **Estados de Mushin arcano:** Dolor −40, Dolor extremo −80, parálisis, coma (Core p.233).

## 5. Sobre la IA

Las decisiones de la IA son heurísticas, no reglas: no las comparé con el manual sino que verifiqué que
sólo elija acciones legales. Lo están todas: no contraataca en área ni en Defensa total, no presa con
armas sin Presa Inusual, no desarma a quien pelea sin armas, no apunta a puntos vulnerables de Sangre
Eterna ni hace maniobras contra acumulación, declara modos y Prever Sorpresa antes de la iniciativa,
usa Ataque Final una vez y por debajo de la mitad de los PV, y prepara Godhand sólo si todavía puede
atacar.

## 6. Modificadores en el flujo del combate (segunda pasada)

Revisión de la Tabla 43 fila por fila y de cuándo se aplica cada modificador en `atacar` →
`resolverDefensa`, con pruebas que leen los números del registro (`test/flujo.test.ts`).

| # | Qué estaba mal | Qué dice el manual | Dónde |
|---|---|---|---|
| 16 | **Sorpresa**: el −90 nunca llegaba a la defensa. La sorpresa se borraba al declarar el ataque, antes de que el sorprendido se defendiera | "Un personaje sorprendido tiene un penalizador de –90 a cualquier acción enfrentada […] incluyendo su capacidad de defenderse de un ataque. Este penalizador queda limitado a la primera acción del sujeto que consigue la sorpresa." Core p.86. Ahora se gasta al terminar esa acción (todos los blancos de un área incluidos), antes de las contras | `combate.ts` |
| 17 | **Acciones activas**: levantarse, zafarse y moverse más de ¼ daban −25 en total | "Por cada una que realice con posterioridad sufrirá un penalizador acumulable de –25." Core p.87 | `calculos.ts`, `combate.ts` |
| 18 | **Parálisis**: la inducida (Mushin arcano) y la de una presa se sumaban | Son grados de una misma situación de la Tabla 43: vale la peor | `maniobras.ts` |
| 19 | **Acumulación sorprendida**: absorbía entero | "Si un ser con acumulación recibe un ataque con sorpresa disminuye a la mitad el valor de su Absorción." Core p.99 | `calculos.ts` |

Narración: el registro muestra primero la iniciativa y después quién sorprende a quién (con la
diferencia), y primero la acumulación de Ki y después la técnica que se ejecuta con ella.

Verificado y correcto:

- Flanco −10/−30, espalda −30/−80, posición superior +20 contra derribado, derribado −30 y −10 al
  turno, parálisis −20/−80/−200, amenazado sólo contra quien amenaza (Core p.90), desenfundar −25,
  espacio reducido, defensas adicionales −30/−50/−70/−90, resistir −80 con mínimo 0, defensa total +30.
- **Apuntar sin armas a −30**: correcto. El combate desarmado es Precisa (Tabla 30) y Precisa "permite
  al personaje disminuir a la mitad los penalizadores de los golpes apuntados" (Core p.76). El −60 de
  la cabeza queda en −30.
Agregado después (lo que faltaba de la Tabla 43 y los estados del capítulo 14 que son modificadores):

- **Ceguera parcial y absoluta** (Tabla 43), por estar cegado (estado del luchador) o por la oscuridad
  del escenario (penumbra, oscuridad total, oscuridad mágica). Visión nocturna ignora la penumbra y
  reduce a la mitad la oscuridad total (Core p.20); la completa anula la natural (Core p.318).
  Detección del Ki deja la absoluta en parcial y reduce a la mitad flanco y espalda (Dominus p.11; se
  supone que la tirada de detección sale). Un área de Ki no sufre la ceguera del atacante.
- **Combinación con flanco y espalda** según la Tabla 1 del Dominus (p.11) para los dos grados de
  ceguera, al atacar y al defenderse. Antes sólo estaba la absoluta de Velez a la defensa.
- **Carga** (+10 / −10 / −20, sin el −25 por correr): se declara antes de la iniciativa si corrió
  hacia el enemigo el asalto anterior y no está trabado (Core p.90). Con la distancia inicial por
  defecto (10 m) casi nunca se da: se llega en el primer asalto.
- **Levitando** (−20 / −20 / −40) y **vuelo** 7 a 14 (+10 a todo) o 15+ (+15 / +10 / +20, +10 al
  turno). El vuelo no da bono en un espacio reducido: pide "un amplio espacio para maniobrar".
- **Enemigo pequeño** (−10) y **diminuto** (−20 al ataque, −10 a pararlo), salvo Ataque en área.
  Tamaño = Fuerza + Constitución (Core p.14) o el que diga la ficha; sin esas características no se
  compara.
- **Miedo** (−60) y **Dolor** (−20 / −40 / −80) como estados que duran todo el combate (Core
  p.232-233).
- En la página: selector de luz en Opciones y un tercer selector por luchador con su estado.


## 7. Segunda auditoría (15/10/2026)

Revisión del motor entero contra Core, Arcana y Dominus, más la coherencia entre el motor y la IA (que
antes calculaban algunas reglas de dos maneras). Cada hallazgo se verificó en el manual antes de
tocarlo. Los tests están en `test/auditoria.test.ts` ("segunda auditoría").

| # | Qué estaba mal | Qué dice el manual | Dónde |
|---|---|---|---|
| 17 | **RF contra Destrucción por Ki y puntos de presión** no sumaba el Incremento de RF del Ki ni las Resistencias de Protección Final; la IA valoraba los críticos y los Estados con otra RF que el motor | Incremento de RF: "contra cualquier clase de efecto, durante todo el asalto" (Dominus p.61). Protección Final: "+10 a todas las Resistencias" (Arcana p.35). Una sola RF (`rfDe`, `rfCritico`) para motor e IA; la IA suma la Frialdad en Miedo, Terror y Fascinación como el motor (Core p.54) | `calculos.ts`, `combate.ts`, `ia.ts` |
| 18 | **Resistencia al calor** distinta entre motor e IA: la IA no sumaba la Inmunidad contra el fuego a Incinerar ni la restaba al prender; tocar a Cuerpo a Fuego no sumaba el bono contra el calor | Inmunidad contra el Fuego: +5 a las Resistencias contra el calor por intensidad y −20 en la Tabla 76 (Core p.156, p.236). Una sola cuenta (`resistenciaCalor`, `nivelLlamas`) | `calculos.ts`, `magia.ts`, `efectos/` |
| 19 | **Ataques en área sobrenaturales** (Bola de Fuego, Tormenta, Mina, Consumir Esencia, áreas de Ki) se defendían como cualquier otro | "Parar estos ataques de manera convencional no resulta posible […] aplicará un penalizador de –120 a su habilidad de parada"; esquivando, −80 si su movimiento no le alcanza para salir del área ese asalto; un escudo sobrenatural no sufre nada (Core p.101). Vale para las áreas de Ki: Incremento de movimiento sirve "para contrarrestar los Penalizadores de un Ataque en área" (Dominus p.61). Kael vs Teseo pasa de 13% a 50% | `calculos.ts`, `combate.ts`, `efectos/` |
| 20 | **Conjuros de calor, frío o electricidad** no se podían parar (como los de energía) | Los de energía, parada a cero; los de electricidad, frío o fuego, "como una descarga ígnea", −120 a parar si no se puede parar energía (Core p.100) | `calculos.ts` |
| 21 | **Áreas contra seres con acumulación** hacían el daño normal | "Recibirá el doble de daño de lo que indique el Resultado del Asalto" (Core p.99). En el motor y en el pronóstico de la IA | `combate.ts`, `calculos.ts` |
| 22 | **El ACT no bajaba con los negativos** a toda acción | "Un personaje sufre un penalizador a su ACT equivalente a la mitad del negativo, redondeado hacia arriba en grupos de cinco" (Core p.232). También para la magia innata (Tabla 58) | `magia.ts` (`actDe`) |
| 23 | **El "+ a toda acción" de Campeón** (y la Luna) subía la Proyección Mágica | El bono a toda acción "no aumenta las habilidades sobrenaturales del personaje en ninguno de sus aspectos" (Core p.232; Campeón da "+10 a toda acción", Arcana p.35) | `calculos.ts` |
| 24 | **Daño a los escudos**: sólo sumaba la reducción de TA de las técnicas de Ki (y citaba Dominus p.11) | "Un luchador aumenta el Daño que producen sus ataques a los escudos en un valor equivalente a diez puntos por cada TA que resta", también por calidad (Dominus p.13); Sin armadura, +200 (Dominus p.60). Una sola cuenta (`danoAEscudo`) para el escudo mágico, el de energía y la IA que elige el grado | `calculos.ts`, `combate.ts`, `ia-magia.ts` |
| 25 | **Cegado por Flash** tenía ceguera absoluta hasta el final | "En el asalto previo a recuperar la vista el personaje afectado sólo aplica el penalizador de ceguera parcial" (Core p.233) | `calculos.ts` |
| 26 | **Fascinación** sólo impedía las acciones activas | "Las acciones pasivas que realice sufren un penalizador de –20" (Core p.233): defenderse, también con un escudo mágico | `calculos.ts` |
| 27 | **Empates en las Resistencias** contaban como superadas (y el Aura con fracaso 0 como resistida) | "Para pasar un control de Resistencia […] si supera la dificultad requerida" (Core p.13); el Aura: "0 a −19, Afectado" (Dominus p.22, Tabla 9). Una sola regla (`resultadoResistencia`) para RF, RM, Aura, puntos de presión, Fundir y la probabilidad que usa la IA | `reglas.ts`, `combate.ts`, `efectos/`, `probabilidades.ts` |
| 28 | **Buena y Mala suerte** sólo cambiaban la pifia en combate físico y Acrobacias | "La cifra requerida para pifiar" cambia en general (Core p.21, p.25): también Proyección Mágica, Advertir, Buscar, Trucos de manos y Resistir el dolor | `combate.ts`, `magia.ts` |
| 29 | **Pifia defendiendo con escudo mágico** usaba el umbral de la defensa física (maestría y arma Compleja) | La maestría es la de la habilidad que se tira (Core p.10, p.17); lo Complejo sólo cuenta al parar con el arma (Core p.76) | `combate.ts` |
| 30 | **Defensa final con mínimo 0** (heredado del toolkit), distinto del pronóstico de la IA | Una pifia en defensa resta su nivel "directamente de su habilidad de defensa" (Core p.98), sin mínimo | `combate.ts` |
| 31 | **Empate de iniciativa** se desempataba por el turno de la ficha | "Actuará primero quien tenga mayor turno final" (Core p.86) | `combate.ts` |
| 32 | **Tabla 48**: un disparo que igualaba la dificultad llegaba | "Si el resultado final supera la dificultad" (Core p.96) | `combate.ts` |
| 33 | **Cañón** se encasquillaba como el arcabuz (80) | "Pifia con el cañón de nivel inferior a 70, el arma se bloquea" (Core p.81) | `proyectiles.ts` |
| 34 | **Seres con acumulación** no podían usar escudos mágicos, y nunca perdían la concentración al acumular | Pueden usarlos "aplicando un penalizador de –80 a su habilidad de Proyección, pero cuando su defensa es superada, sí perderán su acción" (Core p.99); "no efectúan este control, salvo si reciben un ataque que les produzca un crítico" (Core p.118) | `calculos.ts`, `combate.ts`, `magia.ts` |
| 35 | **Crítico de un Impacto de Grado 4+** sumaba los bonos de crítico del atacante | El crítico viene del choque: "un valor equivalente al doble del Daño recibido" (Dominus p.12), no del arma | `combate.ts` |

**Efecto medido** (`npm run medir`, 500 combates, % que gana el primero): Kael contra Teseo 13 → 56
(Teseo para las áreas de Ki, que ahora tienen −120); Stéphan contra Teseo 92 → 87; Stéphan, Kael y
Kaito contra Teseo, Kiran y cuatro soldados 52 → 64; el resto, sin cambios apreciables.

### Decididas por el usuario (15/10/2026)

1. **ACT a la mitad por hacer otra cosa:** se aplica en el momento en que hace la otra acción (atacar,
   defenderse sin el escudo, moverse con acción activa), como Serenade al declararlo (Core p.117):
   pierde la mitad de lo acumulado ese asalto. `hacerOtraAccion` en `magia.ts`.
2. **Impacto de Grado 4:** el crítico es el doble del daño + 1d100, como cualquier crítico, sin los
   bonos del atacante (Dominus p.12). Queda como estaba.
3. **Ataque en área físico contra la acumulación:** dobla el daño con un arma grande (la que alcanza a
   cinco: Grande, Capoeira, Área excepcional) contra un ser de Tamaño 22 o menos (Core p.99).
   `areaDoblaDano` en `calculos.ts`, en el motor y en el pronóstico.
4. **Dolor:** quedan dos reglas distintas: el estado Dolor (Dominus p.67) dura el combate; el de la
   tabla del Mushin arcano es dolor de la técnica y baja 5 por asalto, como el de los críticos.

## 8. Tercera tanda: la IA contra el motor, y la página (15/10/2026)

La IA tiene que valorar cada regla como la aplica el motor; donde hacía su propia cuenta, se la
reemplazó por la del motor o por una función compartida. Lo que cambia de resultado está medido
abajo; lo puramente estructural mantiene la huella idéntica.

| # | Qué estaba mal | Qué dice el manual (y el motor) | Dónde |
|---|---|---|---|
| 36 | **Efectos de las técnicas de Ki** valorados como si siempre se aplicaran | Marca, Interrupción y los Estados de ataque piden que el golpe dañe; los de contacto, alcanzar contra TA 0 (Dominus p.68); la marca sólo mejora si es mayor; la Interrupción usa el daño sin reducir y la acumulación entre cinco (Dominus p.69); nada en maniobras de control | `ia.ts` (`valorEfectosKi`) |
| 37 | **Tempo** (impactar a quien no actuó le quita el asalto) contado también contra Seraphite arcano y contra quien resiste el golpe | Seraphite arcano sigue actuando (Dominus p.40); resistir el golpe conserva la acción (Core p.93). Un criterio: `pierdeElAsalto` | `ia.ts`, `efectos/valorar.ts` |
| 38 | **Ataques adicionales de Ki** no se valoraban | Más golpes con los mismos efectos (Dominus p.55): cada uno vale y arriesga su contra; el asalto se le quita una vez | `ia.ts` (`mejorManiobra`) |
| 39 | **Cuándo critica**: el pronóstico ignoraba Ojos de la Muerte y que con Ojos todo el cuerpo de un ser con acumulación es vulnerable; el punto vulnerable se calculaba aparte | Ojos y el crítico automático critican en cuanto dañan (Dominus p.78, p.71); punto vulnerable con 1/10 de los PV (Core p.97). `preparar` calcula el umbral para todas las valoraciones | `calculos.ts` |
| 40 | **Enuth arcano**: el control de inconsciencia de cada golpe que daña no se valoraba | Dominus p.43 | `ia.ts` |
| 41 | **Destrucción por Ki** con un bucle propio y sin la chance de crítico | Pierde el fracaso de la RF en PV (Core p.104), que critica como cualquier daño. `fallaResistencia` | `ia.ts` |
| 42 | **La contra** se valoraba como un golpe común, y sin las contras ilimitadas de Selene arcano | El bono de la contra y los modificadores de contraataque cuentan (Core p.89); Selene arcano contraataca sin gastar ataques (Dominus p.39). `puedeContraatacar` y `riesgoContra` reemplazan ocho cuentas | `ia.ts`, `efectos/valorar.ts` |
| 43 | **Atrapar un proyectil**: una recta sobre un d100 cerrado | Trucos de manos abierta, con su pifia, contra la dificultad o el ataque (Core p.94) | `ia.ts` (`intentaAtrapar`) |
| 44 | **Cuánto tarda en juntar el Ki** de una técnica: dos estimaciones distintas entre sí y del motor | Cada asalto suma la acumulación entera (−1 cada 20 de negativo); si no la ejecuta, lo ganado queda en la mitad (Core p.102). `asaltosParaJuntar` | `ki.ts`, `ia.ts` |
| 45 | **Neto de una técnica** a veces sin las desventajas o sin el ataque especializado | Desventajas (Dominus p.71-74), ataque especializado (Dominus p.72): `costoTecnica`, `sirveContra`, `netoTecnica` | `ia.ts` |
| 46 | **Área de Ki**: los aliados del radio pesaban distinto que el daño propio; de lejos se defendía como cuerpo a cuerpo | Aliados con λ; de lejos, como de un proyectil (Dominus p.57-58) | `ia.ts` (`valorAreaKi`) |
| 47 | **Reflectar** sumaba la contra y no el bono de contraataque | Devuelve el ataque con la habilidad final más el bono de contra, y cuenta como su contra (Dominus p.71) | `ia.ts` (`elegirTecnicaDefensa`) |

**Página:** quien huyó se dibujaba como caído; los estados (derribado, en llamas, ceguera,
parálisis, miedo…) no se veían; la regla "sin maniobras" de un escenario se perdía al cargarlo. Ahora
la foto de cada línea lleva los estados (`estadoVisible`), Ki y zeon.

**Efecto medido** (500 combates): sin cambios fuera del ruido (Stéphan contra Teseo 86 → 89; grupo
63 ± 2).

**Cerrado después:** `conCambio` aparta la memoria de la decisión mientras prueba el cambio (ver al
final).

**Cerrado después:** de quién habla cada línea es un dato del evento (`Evento.sujeto`: quien ataca,
quien recibe el daño o, si no, el primer nombre de la línea, calculado en el motor sólo con el
registro prendido); el compendio muestra Ki y magia y ya no relee la planilla en cada redibujo; el
progreso de "Simular muchos" avanza dentro de cada tanda; `aliadosSobre` se recuerda por decisión.
En el escenario más lento no hay un cuello de botella: el perfil se reparte (Dijkstra 5%,
`preparar` 5%, el resto menos), y leer planillas pasa una sola vez.

### Reglas que faltaban (cerradas el 15/10/2026)

| # | Qué faltaba | Qué dice el manual | Dónde |
|---|---|---|---|
| 48 | **Debilidad** (Mushin arcano y conjuros) sólo se anotaba | −1 a FUE, DES, AGI y CON por cada 10 de fracaso (Core p.233); con lo que eso cambia de ataque, defensa, turno, daño y RF | `efectos/estados.ts`, `combate-ki.ts` |
| 49 | **Parar sin armas** con armadura dura usaba la entereza del cuerpo | Con una armadura dura de camisola o completa puede bloquear con su entereza (Core p.93) | `rotura.ts` |
| 50 | **Armas con regla Presa** (látigo, lazo, red, kusari-gama) no podían presar | Presan con la Fuerza del arma (8, 9, 10, 8), +1 cada +5 de calidad (Core p.76-77), también al sostener la presa | `rasgos.ts`, `estilos.ts`, `maniobras.ts`, `combate.ts` |
| 51 | **Maniobra Especial** se perdía para todos al usarla una vez | Deja de servir contra quien la presenció o sufrió (Dominus p.86). Presencian el blanco y los rivales activos que ven al atacante (interpretación) | `calculos.ts`, `combate.ts` |
| 52 | **Inutilizar** apuntaba al brazo o al muslo (−20) | Brazo o pierna; la pantorrilla es pierna y cuesta −10 (Core p.91-92) | `maniobras.ts` |
| 53 | **Dumah y Kung Fu supremo** atacaban sólo en su tabla principal; Kung Fu no ponía el bono al turno | Dumah elige FIL o PEN (Dominus p.41); Kung Fu supremo también PEN, y el bono variable puede ir al turno (Dominus p.32) | `estilos.ts`, `calculos.ts`, `ia.ts` |
| 54 | **Enuth arcano** contra seres con acumulación | Todos sus ataques cuentan como apuntados a puntos vulnerables (Dominus p.43). Una sola función decide el punto vulnerable para motor, pronóstico e IA | `calculos.ts` (`golpeAPuntoVulnerable`) |
| 55 | **Velez arcano** usaba Fuerza, Destreza o Agilidad en los controles | Puede usar su Poder al hacer o sufrir cualquier maniobra con control (Dominus p.40). Una sola función para todos los controles | `maniobras.ts` (`mejorCaracteristica`) |
| 56 | **Ojos de la Muerte** no podía apuntar a las líneas y sufría ceguera completa contra invisibles | Líneas existenciales: −10 y +40 al crítico; contra invisibles sólo ceguera parcial (Dominus p.78) | `maniobras.ts`, `calculos.ts`, `ia.ts` |

**IA, hipótesis:** `conCambio` aparta la memoria de la decisión mientras prueba un cambio y la
recupera al deshacerlo; ninguna hipótesis puede leer valores del estado real (huella idéntica).

**Valoración de la IA:** un bug propio de esta tanda: la Debilidad, agregada al registro de estados,
se valoraba en `valorEstado` como si sacara al rival del combate (caía en el caso por defecto); ahora
vale el negativo que deja. "Dejarlo fuera de combate" se cuenta en un solo lugar (`valorDejarFuera`),
que antes estaba copiado en cinco archivos.

## 9. Efectos de Ki que faltaban (16/10/2026)

Comparando los títulos del Dominus cap. 5 (p.51-75) con el catálogo de efectos (`ki.ts`, `CATALOGO`)
faltaban efectos, ventajas y desventajas. Ninguna planilla de la mesa los usaba, así que la huella no
cambia; todos tienen tests en `test/ki-efectos.test.ts`.

| # | Qué faltaba | Cómo quedó | Dónde |
|---|---|---|---|
| 57 | **Detección del Ki** se suponía siempre lograda | Una tirada por asalto ((CM + Advertir)/2); localiza hasta el radio que da (Dominus p.11, p.17) | `combate-ki.ts`, `calculos.ts` |
| 58 | **Camuflar ataque, Ataque adicional** (continuo, combo, cansancio) **y limitado** | Advertir contra la dificultad o Sorpresa; más golpes con o sin los efectos (Dominus p.52, p.55-56) | `combate.ts`, `ia.ts` |
| 59 | **Acción adicional, Recuperar acción, Previsión** | Sin el −25; recupera la acción; −45 o nada de la Sorpresa (Dominus p.56-57) | `calculos.ts`, `combate.ts`, `ia.ts` |
| 60 | **Parada en área** | Una sola Parada que cubre a los aliados del radio; contra lo sobrenatural, parar energía (Dominus p.58) | `combate.ts`, `combate-magia.ts`, `ia.ts` |
| 61 | **Transporte automático** | Ataque (Advertir 140 dos veces), contra con bono, retirada al defenderse (Dominus p.59) | `combate.ts`, `ia.ts` |
| 62 | **Proyección y Estela de destrucción** | Viaja con el ataque; alcanza la línea recta (Dominus p.58) | `combate.ts`, `calculos.ts` |
| 63 | **Aumentar rotura y entereza, ventajas de Armadura** | Inmodificable, Armadura física, Lentitud (Dominus p.60-61) | `rotura.ts`, `calculos.ts` |
| 64 | **Incrementos y Habilidades perceptivas** | Movimiento, habilidad, Capacidad incrementada, RM/RP, Visión nocturna, Ver lo sobrenatural (Dominus p.61-62) | `calculos.ts`, `maniobras.ts`, `magia.ts` |
| 65 | **Dañar energía y Ataque elemental** en quien ya lo hace | +10 al daño base (Dominus p.63) | `calculos.ts` |
| 66 | **Regeneración, Presa existencial, Apresamiento mantenido, Choque físico** | (Dominus p.64-66, Core p.117) | `ki.ts`, `combate.ts`, `combate-magia.ts` |
| 67 | **Ventajas** de Aumento de daño, Interrupción, Reflectar e Intangibilidad | Sacrificio y Daño límite; Ki y Magia; Elección del blanco y esotérico; Afectar a otros y Fusión (Dominus p.54, p.69-71) | `combate.ts`, `combate-ki.ts`, `ia.ts` |
| 68 | **Desventajas** que no se leían | Circunstancia de combate, Atada a un arma, Compleja, Condiciones, Defensa especializada, Pérdida del arma, Predeterminación, Sacrificios, Sin defensa, Sobrecarga, Técnica final, Técnica mantenida, Usos limitados (Dominus p.71-75) | `ki.ts`, `combate.ts`, `ia.ts` |
| 69 | **Espejismo y Armas físicas de Ki** | Ilusiones que reciben ataques y atacan (fantasmales con RP); el arma de su planilla con la calidad de la técnica (Dominus p.63-66) | `combate-ki.ts`, `rotura.ts` |
| 70 | Efectos escritos **como en el libro** ("Armadura 4", "Turno +50") no se leían | Valor en el nombre, alias y propiedades; de 132 técnicas de ejemplo queda una sin leer | `ki.ts` |

Interpretaciones nuevas y lo que sigue sin simular: DISENO.md, "Ki", "Interpretaciones" y
"Pendiente del Ki".

## 10. Cuarta auditoría: todo el sistema (17/10/2026)

Tres revisiones en paralelo (magia, combate, estructura y velocidad) contra los manuales. Cada regla
tiene test; la huella cambió sólo en los commits de reglas, nunca en los de estructura o velocidad.

| # | Qué estaba mal | Cómo quedó | Dónde |
|---|---|---|---|
| 71 | La IA no valoraba la rotura | Probabilidad de romper con la regla del motor (`pRompe`) (Core p.93) | `rotura.ts`, `ia.ts` |
| 72 | Todo conjuro dañaba energía | Sólo con TA ENE (Core p.122) | `combate-magia.ts` |
| 73 | ACT entera sin poder gesticular | A la mitad apresado, atado, con lazos o parálisis 2+ (Core p.117) | `magia.ts` |
| 74 | Choque de descargas sin daño; Escudo de Luz igual contra todo | Sólo con daño (Core p.119); doble contra oscuridad | `combate-magia.ts`, `conjuros.ts` |
| 75 | Escudo lanzado con pifia funcionaba | Fracasa salvo Seguridad Defensiva (Core p.118, Arcana p.27) | `combate-magia.ts`, `hoja/ficha.ts` |
| 76 | Éxtasis no se volvía a resistir | RM cada 5 asaltos, 10 con Efectos Persistentes (Core p.123, Arcana p.24) | `efectos/` |
| 77 | La descarga parada no rompía armas | Rotura con daño/20 (Core p.122) | `rotura.ts` |
| 78 | Conjuro Especialista repetido contaba una vez | Se suman (Arcana p.30) | `conjuros.ts` |
| 79 | La IA de escudos copiaba la regla | Usa la del motor; usos y metamagia una vez por decisión | `ia-magia.ts` |
| 80 | Presa: el que no actuó no se zafaba; apresado huía | Se zafa al final del asalto; no huye (Core p.92, p.94) | `combate.ts` |
| 81 | Ataque a distancia de quien no está trabado contaba flanco | Llega de frente (Core p.90) | `combate.ts` |
| 82 | Pifia daba contra a distancia; el fascinado contraatacaba | Sólo en alcance; no contraataca (Core p.98, p.233) | `combate.ts` |
| 83 | Trucos de manos no acortaba recarga ni cadencia | Sí; el motor valida la forma de disparar (Core p.94, p.97) | `proyectiles.ts` |
| 84 | Inconsciencia miraba el crítico del arma | El del golpe (Core p.92) | `maniobras.ts` |
| 85 | Crítico de más de 100 en un miembro sin efecto | Inservible: desarma o derriba (Core p.98) | `combate.ts`, `valoracion.ts` |
| 86 | Soo Bahk base reducía también el ataque | Sólo defensa; supremo conserva el −10 derribado (Dominus p.38) | `estilos.ts` |
| 87 | Rotura de armadura ignoraba las capas | Recalcula con `combinarTA` (Core p.83) | `rotura.ts` |
| 88 | Carga sin haber corrido | Sólo tras avanzar hacia un enemigo (Core p.90) | `maniobras.ts` |
| 89 | Sin límite de acciones activas | Tabla 41 por DES + AGI (Core p.85) | `reglas.ts`, `combate.ts` |
| 90 | Acrobacias al escapar sin la Tabla 43 | Columna Acción física (Core p.90) | `calculos.ts` |
| 91 | Engatillar gastaba una acción activa | Pasiva, al empezar el turno del amenazado (Core p.92) | `combate.ts` |
| 92 | Caminos de técnicas que no pagaban todo | Todos por `usarTecnica`/`trasLaTecnica` | `combate-ki.ts` |
| 93 | La IA no miraba la Tabla 41 al moverse | No cuenta como alcanzable a quien sólo llega gastando la última acción activa (Core p.85) | `calculos.ts`, `ia.ts` |
| 94 | La parálisis inducida no quitaba gestos ni anulaba la posición | Una sola parálisis para las reglas, `nivelParalisis` (Core p.117, Dominus p.11) | `condiciones.ts`, `magia.ts`, `calculos.ts` |
| 96 | Elegir blancos en un área pedía siempre Control del Espacio | Libre salvo que el conjuro lo prohíba; esos alcanzan también al mago si no lo excluyen (Core p.123, decidido por el usuario) | `efectos/comun.ts`, `conjuros.ts`, `ia-magia.ts` |
| 97 | Un solo conjuro preparado: preparar otro tiraba el listo con −10 | Varios: los listos y uno en preparación (Core p.117) | `magia.ts`, `ia-magia.ts` |
| 98 | Sin el +3 de los cuadrúpedos al Derribo | Dato de la ficha `cuadrupedo` (Core p.91) | `maniobras.ts`, `modelo.ts` |
| 95 | Ceguera de la planilla y del destello contadas distinto en cada lugar | Una sola, `nivelCeguera`; el último asalto del destello, parcial (Core p.233) | `condiciones.ts`, `calculos.ts`, `ia-ki.ts` |

**Estructura y velocidad (huella idéntica):** `combate.ts` partido (`combate-defensa.ts`,
`combate-distancia.ts`, `combate-movimiento.ts`, con `MotorCombate`); `ia.ts` partido (`ia-ki.ts`, `cache-decision.ts`);
`nuevoAsalto`; registros exhaustivos sin listas a mano; `dijkstra` sólo recorre las celdas que tocó;
`cegueraContra` y `vistaPrevia` sin trabajo repetido; la IA reusa la preparación de cada base.

**Decidido por el usuario (17/10/2026):** blancos libres salvo prohibición, y el mago entra en el área
sólo si el conjuro lo dice (96); zafarse fallido pierde el asalto; la IA no usa el Sacrificio de
Características. Cerrados por el manual: varios conjuros preparados (97) y el +3 de los cuadrúpedos (98). Verificado en el manual: zafarse lleva el −3 (Core p.92; 5 con Pankration).

## 11. Estilos, habilidades del Ki y lector de planillas (17/10/2026)

Las dos partes que faltaban revisar. Cada regla con test; la huella sólo cambió con Dominio físico
(Kiran, en revuelto).

| # | Qué estaba mal | Cómo quedó | Dónde |
|---|---|---|---|
| 99 | La IA valoraba la contra de Selene sin el bono doble | Una sola cuenta, `bonoDeContra` (Dominus p.39) | `calculos.ts`, `ia.ts` |
| 100 | Xing Quan fijaba el blanco aunque no aplicara el bono | Sólo si lo aplicó (Dominus p.38) | `combate.ts` |
| 101 | La patada del Tae Kwon Do podía ir antes que la segunda arma | Siempre al final (`alFinal`, Dominus p.36) | `rasgos.ts` |
| 102 | Afinidad elemental incompleta (Boreas y Ran sin elemento; sin +20 ni +10) | Tabla Aeon → TA, +20 a resistir el fuego, +10 al daño de Ki y Magia (Dominus p.63, p.76) | `estilos.ts`, `calculos.ts` |
| 103 | El +10 de Ataque elemental del Ki se sumaba a los conjuros | Sólo a técnicas (Dominus p.63) | `calculos.ts` |
| 104 | Los Legados se buscaban de dos maneras ("Límite de la Muerte" contaba como los Ojos) | `legadosDe`, por nombre completo (Dominus cap. 6) | `estilos.ts` |
| 105 | Dominio físico sumaba +10 a una RF que ya lo trae | No se suma de nuevo (Dominus p.22) | `calculos.ts` |
| 106 | El daño por Fuerza se redondeaba dos veces y se inflaba; sin armas doblaba la Fuerza; Aumento pisaba la Debilidad | Desde el daño de partida con un solo redondeo; sin armas una vez; se deshace sólo lo del Aumento; DES y AGI actualizan armas a distancia, Acrobacias y turno con magia (Core p.75, p.105, p.233) | `ki.ts`, `combate.ts` |
| 107 | Un solo registro de Aura por luchador; un bono subía su dificultad | Una por fuente; sólo los negativos restan (Dominus p.21, Core p.232) | `combate-ki.ts`, `condiciones.ts` |
| 108 | Presencia base calculada de tres maneras | Una, `presenciaBase` (Core p.25) | `rasgos.ts` |
| 109 | Detección del Ki calculada dos veces y sin Percepción del Ki | Una, `baseDeteccionKi`, +10 por nivel (Dominus p.18) | `calculos.ts`, `combate-ki.ts` |

| 110 | Eliminación de penalizadores e Inmunidad al dolor dividían todo junto | Tres bolsas: críticos (las dos), Dolor (Inmunidad), Estados sobrenaturales (ninguna) (Core p.21, p.104) | `calculos.ts`, `combate-ki.ts`, `efectos/estados.ts` |
| 112 | Xing Quan no miraba la Iniciativa | Sólo si actúa antes que ese rival (`puestoIniciativa`, Dominus p.38) | `calculos.ts`, `combate.ts` |
| 111 | Aikido sumaba la Fuerza del rival con el daño de otro arte y contra cualquiera; Hakyoukuken y Mushin contra cualquiera | `danoSinArmasDe`, `humanoide`, `organico` (Dominus p.29, p.31-32, p.42). Cambia Kiran (siete artes, daño de otra) | `estilos.ts`, `calculos.ts`, `ia.ts` |

**Supuesto anotado:** el simulador trata el Ki como una sola reserva (Unificación de puntos de Ki,
Dominus p.8); las siete planillas la marcan.

**Interpretaciones preguntadas al usuario:** ver DISENO.md, "Pendiente de decidir".
