# Auditoría contra los manuales (14/10/2026)

Revisión línea por línea del motor (`src/motor/`) contra los markdown de Core Exxet, Dominus Exxet y
Gaia I. Las páginas son las del PDF (las del índice impreso son 2 menos), como en el resto del código.

- **Corregido:** 15 diferencias con el manual. 3 venían de la sesión en la nube, 11 eran del código
  anterior.
- **Decisiones:** 9 puntos donde la regla no era literal, todos respondidos y aplicados.
- **Falta modelar:** reglas del manual que el simulador todavía no tiene.
- Pruebas: 142, todas pasan (`test/auditoria.test.ts` cubre lo corregido).

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

**Afectan combates comunes:**

1. Mushin arcano, **Debilidad**: −1 a FUE, DES, AGI y CON por cada 10 de fracaso (Core p.233). Hoy sólo
   se registra.
2. Parar sin armas con armadura dura de camisola o completa usa la entereza de la armadura (Core p.93).
3. Armas con regla **Presa** (látigo, lazo, red): presan con la Fuerza del arma, +1 por cada +5 de
   calidad (Core p.76).

**Opciones que la IA no considera (la regla está, la decisión no):**

4. Kung Fu: poner el bono variable al turno; Kung Fu supremo atacando en PEN; Dumah eligiendo FIL o PEN.
5. Inutilizar a la pantorrilla (−10) en vez del muslo o el brazo (−20).
6. Ojos de la Muerte: ignorar la barrera de daño y apuntar a las líneas (−10, +40 al crítico).
7. Velez arcano: usar el Poder en los controles enfrentados.
8. Enuth: reducir el daño a voluntad; contra acumulación, todos sus ataques cuentan como apuntados a
   puntos vulnerables.
9. Maniobra Especial: se pierde por cada rival que la vio (hoy, una vez para todos) y compara
    habilidades base (hoy, finales).

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
