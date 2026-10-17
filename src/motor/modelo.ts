import type { Rng } from './rng';
import type { TamanoArma, TipoAtaque } from './reglas';
import type { Capacidades, LocalizacionArmadura, Ranura } from './rasgos';
import type { EstadoKi } from './ki';
import type { Bendicion, EstadoMagia } from './magia';
import type { Condicion, TipoCondicion } from './condiciones';
import type { BonoMagico } from './conjuros';
import type { Celda, Mapa, MapaListo } from './mapa';

export type Perfil = 'agresivo' | 'equilibrado' | 'cauto' | 'bestia';

/** Lo que el usuario carga: valores finales de la hoja, ya con bonos de características. */
export interface Ficha {
  id: string;
  nombre: string;
  pv: number;
  /** Turno final con el arma que usa. */
  turno: number;
  /** Habilidad de ataque final. */
  ataque: number;
  /** Habilidad de parada o esquiva final (la que usa). */
  defensa: number;
  /** Seres con acumulación de daño: no tiran defensa (Core p.98). */
  acumulacion?: boolean;
  danoBase: number;
  tipoAtaque: TipoAtaque;
  /** Tamaño para los ataques adicionales. Si falta, se deduce del nombre del arma (o M). */
  tamanoArma?: TamanoArma;
  arma?: DetalleArma;
  /** Tipo de armadura por tipo de ataque. Lo que falte vale 0. */
  ta: Partial<Record<TipoAtaque, number>>;
  /** Resistencia física. */
  rf: number;
  constitucion: number;
  /** Tipo de movimiento (normalmente = Agilidad). */
  tipoMovimiento: number;
  /** Por defecto = Constitución. */
  cansancio?: number;
  /** 1-20. Por defecto 6. Con 4 o menos actúa como bestia. */
  inteligencia?: number;
  perfil?: Perfil;
  /** Presencia base: la barrera del Escudo físico. */
  presencia?: number;
  /** Barrera de daño cargada a mano (criaturas, poderes). */
  barreraDanio?: number;
  rasgos?: Rasgos;
  /** Características (para controles enfrentados, Aikido, Orochi). Lo que falte vale 5. */
  atributos?: Partial<Record<Atributo, number>>;
  /** Parada o esquiva: decide si puede detener ataques intangibles. */
  tipoDefensa?: 'parada' | 'esquiva';
  /** Con qué pelea si lo desarman (el arma "Desarmado" o "Artes Marciales" de la planilla). */
  sinArmas?: PerfilSinArmas;
  /** Capas de armadura, para la rotura y para Hakyoukuken (blandas). */
  capasArmadura?: CapaArmadura[];
  /** Habilidad secundaria Acrobacias (retirarse del combate, Core p.94). */
  acrobacias?: number;
  /**
   * Lo pone el motor al cambiar la Fuerza (Aumento, Debilidad): la Fuerza y los daños de los que se
   * parte, para recalcular siempre desde ahí con un solo redondeo (Core p.75).
   */
  danoPorFuerza?: { fue: number; arma: number; sinArmas?: number };
  /** Dominios del Ki: reserva, acumulaciones y técnicas (Core p.102-107, Dominus cap. 5). */
  ki?: KiFicha;
  /** Estados con los que empieza el combate (Tabla 43, Core cap. 14). */
  estados?: EstadosFicha;
  /** Tipo de vuelo: de 7 a 14 o de 15 en adelante da bonos con espacio para maniobrar (Tabla 43). */
  tipoVuelo?: number;
  /** Criatura cuadrúpeda: +3 a sus controles de Derribo, por la estabilidad de sus patas (Core p.91). */
  cuadrupedo?: boolean;
  /** Ser orgánico (por defecto sí): sólo a ellos los afectan el crítico de Hakyoukuken y Mushin (Dominus p.42). */
  organico?: boolean;
  /** Forma humanoide (por defecto sí): sólo contra ellos suma el Aikido la Fuerza del rival (Dominus p.31). */
  humanoide?: boolean;
  /**
   * Arte marcial cuyo Daño Base usa sin armas (Dominus p.29: se elige uno, no se combinan). Sin el dato,
   * el Aikido cuenta como el suyo sólo si es su única arte marcial.
   */
  danoSinArmasDe?: string;
  /** Tamaño (Core p.14). Si falta, Fuerza + Constitución; sin esas características no se compara. */
  tamano?: number;
  /** Armas de proyectiles y arrojadizas (Core p.94-96, Tabla 34). */
  armasDistancia?: ArmaDistancia[];
  /** Para con un escudo (rodela, medio, corporal): contra proyectiles disparados sólo −30 (Core p.79). */
  escudo?: boolean;
  /** Habilidad secundaria Trucos de manos: atrapar proyectiles en el aire (Core p.94). */
  trucosDeManos?: number;
  /** Habilidad secundaria Resistir el dolor: no perder la magia acumulada al recibir daño (Core p.118). */
  resistirDolor?: number;
  /** Habilidad secundaria Advertir: notar a alguien invisible (Core p.190). */
  advertir?: number;
  /** Conocimiento Marcial total: con Advertir da la Detección del Ki (Core p.103). */
  cm?: number;
  /** Habilidad secundaria Frialdad: bono a resistir efectos sobrenaturales sobre el ánimo (Core p.54, Tabla 13). */
  frialdad?: number;
  /** Habilidad secundaria Buscar (descubrir un Holograma, Core p.127). */
  buscar?: number;
  /** Seres basados en un elemento o sentimiento ("fuego", "agua", "luz", "oscuridad"): los afectan conjuros propios. */
  naturaleza?: string[];
  /** Resistencia mágica. */
  rm?: number;
  /** Magia (Core cap. 11): zeon, ACT, Proyección Mágica y vías. */
  magia?: MagiaFicha;
}

/**
 * Un arma a distancia con los valores finales de la planilla (Core p.94-96). Lo que falte se toma de
 * la Tabla 34 por el nombre (`datosProyectil`).
 */
export interface ArmaDistancia {
  nombre: string;
  /** Disparada (arco, ballesta, arma de fuego) o lanzada a mano (daga, hacha, jabalina). */
  clase: 'disparo' | 'lanzamiento';
  /** Habilidad de ataque final con ella. */
  ataque: number;
  /** Daño final (con el bono de Fuerza del usuario, o el del arma si tiene Fuerza propia). */
  danoBase: number;
  tipoAtaque: TipoAtaque;
  /** Alcance efectivo en metros, ya con la Tabla 46; llega hasta el doble. */
  alcance: number;
  /** Índice de recarga de un arma de disparo (Tabla 34). */
  recarga?: number;
  /** Cadencia de fuego de una arrojadiza (Tabla 34). */
  cadencia?: number;
  /** Proyectiles que lleva (flechas, balas, unidades a lanzar). Sin dato: sin límite al disparar, 1 al lanzar. */
  municion?: number;
  /** Recámara: disparos sin recargar (ballesta de repetición, 4 a 8); vacía, se recarga entera (Core p.81). */
  recamara?: number;
  /** Arma de fuego: con una pifia se encasquilla (menos de 80) o estalla (Core p.80-81). */
  fuego?: boolean;
  calidad?: number;
  /** El disparo de un arma Leo: comparte las balas del Ataque combinado (Dominus p.101). */
  leo?: boolean;
  precisa?: boolean;
}

/** Lo mágico de la ficha (Core p.117-125). */
export interface MagiaFicha {
  /** Reserva de zeon. */
  zeon: number;
  /** Acumulación por turno final. */
  act: number;
  /** Turno al usar magia: el de las acciones desarmadas (Core p.117). */
  turno?: number;
  /** Proyección Mágica final para atacar y para defenderse (con el desequilibrio ofensivo, Core p.118). */
  proyeccion: number;
  proyeccionDefensa?: number;
  /** Nivel en cada vía: "Fuego" 80 conoce los conjuros de Fuego hasta el nivel 80 (Core p.120). */
  vias: Record<string, number>;
  /** Conjuros que eligió por nombre: los de libre acceso y los seleccionados de cualquier vía (Core p.120). */
  libres?: string[];
  /** Sub-vía elegida para cada vía: "Fuego" → "Guerra" (Arcana p.32). */
  subvias?: Record<string, string>;
  /** Control del Espacio: elige a quién alcanzan sus conjuros de área, por 10 de zeon más (Arcana p.28). */
  controlDelEspacio?: boolean;
  /** Romper Resistencias: +5 (arcano +10) a la RM de sus anímicos por cada 50% de daño (Arcana p.30). */
  romperResistencias?: number;
  /** Conjuros con Conjuro Especialista: +1 a la Inteligencia para su grado (Arcana p.30). */
  especialista?: string[];
  /** Esferas de Explotación de la Energía Física: +25 / +40 al ACT por punto de cansancio (Arcana p.27). */
  explotacion?: number;
  /** Esferas de Proyección Mágica Determinada: proyectar con 120, 140… pagando zeon (Arcana p.26). */
  proyeccionDeterminada?: number;
  /** Transmisión de Magia: pasar zeon sin tocarse, hasta su Presencia en metros (Arcana p.29). */
  transmision?: boolean;
  /** Seguridad Defensiva: un escudo lanzado con pifia se activa igual (Arcana p.27). */
  seguridadDefensiva?: boolean;
  /** Efectos Persistentes: sus anímicos se vuelven a resistir cada 10 asaltos en vez de cada 5 (Arcana p.24). */
  efectosPersistentes?: boolean;
}

/** Lo que pasa con un arma a distancia durante el combate. */
export interface EstadoArmaDistancia {
  /** Proyectiles que le quedan (Infinity sin límite). */
  municion: number;
  /** Asaltos de recarga que le faltan antes de poder volver a disparar. */
  recargaFalta: number;
  /** Disparos que quedan en la recámara (Infinity si el arma no tiene). */
  enRecamara: number;
  /** Encasquillada o rota (estalló): no se puede usar más en el combate. */
  inutil: '' | 'encasquillada' | 'rota';
}

/** Estados que duran todo el combate (Core cap. 14) y situaciones de la Tabla 43. */
export interface EstadosFicha {
  /** Cegado (Core p.233): ceguera absoluta, o parcial si sólo está deslumbrado. */
  ceguera?: 'parcial' | 'absoluta';
  /** Miedo: −60 a toda acción que no sea huir (Core p.232). */
  miedo?: boolean;
  /** Dolor: −20 leve, −40, −80 extremo a toda acción (Core p.233). */
  dolor?: 'leve' | 'normal' | 'extremo';
  /** Levita de algún modo o lo mantienen en el aire (Tabla 43). */
  levitando?: boolean;
}

/** Características de las que se acumula Ki (Core p.102). */
export type CaracteristicaKi = 'AGI' | 'CON' | 'DES' | 'FUE' | 'POD' | 'VOL';
export const CARACTERISTICAS_KI: readonly CaracteristicaKi[] = ['AGI', 'CON', 'DES', 'FUE', 'POD', 'VOL'];

export interface KiFicha {
  /** Puntos de Ki de la reserva. Con la Unificación de puntos de Ki es una sola (todas las planillas). */
  reserva: number;
  /**
   * La planilla no usa la Unificación de puntos de Ki (Dominus p.8). El simulador igual usa una sola
   * reserva y lo avisa en el registro (decisión del usuario).
   */
  sinUnificar?: boolean;
  /** Acumulación por asalto de cada característica (Tabla 53 más lo comprado). */
  acumulacion: Partial<Record<CaracteristicaKi, number>>;
  tecnicas: Tecnica[];
  /** Límites (Dominus p.28): "caelum", "cruor", "mors"… */
  limites?: string[];
}

/** Un efecto de una técnica, como lo resume la planilla: "Habilidad de Ataque (+50)". */
export interface EfectoTecnica {
  /** Nombre del efecto del Dominus, sin acentos: "Habilidad de Ataque", "Multiplicador al Dano". */
  nombre: string;
  /** Lo que va entre paréntesis: valor y ventajas ("+50", "5 metros de radio", "Eleccion de Blanco"). */
  opciones: string[];
  /** Se mantiene de un asalto a otro pagando su mantenimiento (Dominus p.48). */
  mantenido: boolean;
}

export interface Tecnica {
  nombre: string;
  /** 1 Básica, 2 Mayor, 3 Arcana (Core p.106). */
  nivel: 1 | 2 | 3;
  cm: number;
  /** Ki a acumular de cada característica para ejecutarla. */
  coste: Partial<Record<CaracteristicaKi, number>>;
  /** Ki por asalto para mantenerla después de ejecutarla (0 si no se mantiene). */
  mantenimiento: number;
  /** Se puede usar junto con otras combinables en una misma acción (Dominus p.49). */
  combinable: boolean;
  efectos: EfectoTecnica[];
}

export interface CapaArmadura {
  nombre: string;
  clase: 'blanda' | 'dura';
  /**
   * Qué cubre (Core p.83): el peto sólo el torso, la camisola también los brazos, la completa todo
   * menos la cabeza, y el yelmo sólo la cabeza. Sin dato se deduce del nombre (Tabla 37).
   */
  localizacion?: LocalizacionArmadura;
  ta: Partial<Record<TipoAtaque, number>>;
  calidad: number;
  entereza: number;
}

export type Atributo = 'AGI' | 'CON' | 'DES' | 'FUE' | 'INT' | 'PER' | 'POD' | 'VOL';

export interface PerfilSinArmas {
  turno: number;
  ataque: number;
  defensa: number;
  danoBase: number;
  tipoAtaque: TipoAtaque;
  tipoDefensa?: 'parada' | 'esquiva';
  rotura?: number;
  entereza?: number;
}

export interface DetalleArma {
  /** "Espada y Daga" = dos armas (Core p.91). */
  nombre?: string;
  desarmado?: boolean;
  /** Calidad: cada +5 resta un tipo de armadura al defensor. */
  calidad?: number;
  /** Reducción de TA extra del arma (técnicas, poderes). */
  reduccionTA?: number;
  danaEnergia?: boolean;
  bonoCritico?: number;
  /** Característica, advertencia y especial de la planilla: "Mágica" la hace dañar energía. */
  descripcion?: string;
  /** Regla Precisa: ataques apuntados a mitad de penalizador. */
  precisa?: boolean;
  /** Crítico secundario: atacar con él cuesta −10 (sin la Tabla de Ataque Inusual). */
  critSecundario?: TipoAtaque;
  /** Rotura y entereza (regla opcional de rotura, Core p.93). Ya incluyen la calidad. */
  rotura?: number;
  entereza?: number;
}

/** Lo que figura en la ficha, por nombre, como lo exporta la planilla. Ver ./rasgos. */
export interface Rasgos {
  tablas?: string[];
  artesMarciales?: string[];
  ventajas?: string[];
  desventajas?: string[];
  habilidadesKi?: string[];
  arsMagnus?: string[];
}

export type Equipo = 'A' | 'B';

/** Modalidades declaradas antes de la iniciativa (Dominus). */
export interface Modo {
  seraphite: 0 | 1 | 3;
  berserker: boolean;
  /** Ataque Final activo este asalto. */
  ataqueFinal: boolean;
}
export type Estado = 'activo' | 'caido' | 'inconsciente' | 'muerto' | 'huido';

export interface Punto {
  x: number;
  y: number;
}

export interface Estadisticas {
  danoCausado: number;
  danoRecibido: number;
  bajas: number;
  criticosCausados: number;
  asaltoCaida: number | null;
  ataquesHechos: number;
  contrasHechas: number;
  cansancioGastado: number;
  asaltosDefensaTotal: number;
  /** Veces que usó cada maniobra. */
  maniobras: Partial<Record<string, number>>;
  /** Veces que ejecutó cada técnica de Ki. */
  tecnicas: Partial<Record<string, number>>;
}

/** Resultado del control contra el Aura de combate de alguien (Dominus p.21, Tabla 9). */
export type EstadoAura = 'resistio' | 'afectado' | 'miedo' | 'paralizado';

export interface Luchador {
  ficha: Ficha;
  /** Condiciones del escenario (compartidas por todos los luchadores del combate). */
  entorno: OpcionesEscenario;
  /** Derivado de la ficha una sola vez. */
  cap: Capacidades;
  equipo: Equipo;
  /** Celda que ocupa (con mapa) o punto en metros. */
  pos: Punto;
  /** Mapa del combate: alcance por celdas vecinas y caminos que esquivan muros. Sin mapa, distancia en línea recta. */
  mapa: MapaListo | null;
  pv: number;
  cansancio: number;
  /** Negativo por el dolor de los críticos: baja 5 por asalto. */
  penDolor: number;
  /** Negativo del estado Dolor que impone una técnica (Mushin): baja 5 por asalto. */
  penDolorEstado: number;
  /** Negativo de un Estado sobrenatural (Penalización menor, puntos de presión): baja 5 por asalto. */
  penEstado: number;
  /** Negativo físico de críticos graves: dura todo el combate. */
  penFisico: number;
  /** Penalizador a toda Acción de una técnica (desventaja): baja 10 por asalto (Dominus p.74). */
  penTecnica: number;
  estado: Estado;
  /** Enemigos trabados con él, en orden de llegada (define frente/flanco/espalda). */
  trabados: Luchador[];

  // --- estado del asalto ---
  iniciativa: number;
  /** Puesto en el orden de iniciativa del asalto (0 el primero; los que pifian, al final). */
  puestoIniciativa: number;
  haActuado: boolean;
  aLaDefensiva: boolean;
  defensaTotal: boolean;
  ataquesDeclarados: number;
  /**
   * Penalizador propio de cada ataque del asalto, en el orden en que se usan: primero los
   * declarados (0), después los extra (segunda arma, patada).
   */
  planAtaques: readonly Ranura[];
  ataquesRestantes: number;
  defensasHechas: number;
  cansancioAsalto: number;
  movioActivo: boolean;
  /** Acciones activas distintas del ataque hechas este asalto (moverse, levantarse, zafarse): −25 cada una (Core p.87). */
  accionesActivas: number;
  metrosMovidos: number;
  /** Se movió el asalto anterior: puede declarar una carga si no está trabado (Tabla 43, Core p.90). */
  /** Este asalto corrió hacia un enemigo (la carga del asalto siguiente lo pide, Core p.90). */
  avanzoHaciaEnemigo: boolean;
  movioAsaltoAnterior: boolean;
  /** En carga este asalto: +10 al ataque, −10 a la parada, −20 a la esquiva, sin −25 por correr. */
  cargando: boolean;
  /** Enemigos sobre los que tiene sorpresa hasta su primera acción. */
  sorprendeA: Set<Luchador>;
  /** Prever Sorpresa (Dominus p.14): enemigos contra los que la declaró este asalto. */
  previene: Set<Luchador>;
  /** De esos, contra quiénes todavía no hizo su primera acción enfrentada (−40). */
  previenePendiente: Set<Luchador>;
  /**
   * Resistir el golpe: se decide al primer ataque del asalto y vale para todos hasta que actúe
   * (con un solo golpe no resistido queda a la defensiva igual). null = todavía no decidió.
   */
  planResistir: boolean | null;

  // --- estados que duran más de un asalto (Core p.89-92, Tabla 43) ---
  derribado: boolean;
  /**
   * Parálisis por una presa: 0 nada, 1 menor, 2 parcial, 3 completa. La inducida (Mushin, Estados)
   * es una condición; la que vale para las reglas es la peor de las dos: `nivelParalisis`.
   */
  paralisisPresa: 0 | 1 | 2 | 3;
  /** Quién lo tiene apresado, y a quién apresa él. */
  apresadoPor: Luchador | null;
  apresando: Luchador | null;
  /** Lo desarmaron: pelea con su perfil sin armas. */
  desarmado: boolean;
  /**
   * Condiciones con duración (condiciones.ts): ceguera de un destello o de un estado, parálisis inducida
   * (Mushin, Aura, estados), aparte de la de una presa.
   */
  condiciones: Partial<Record<TipoCondicion, Condicion>>;
  /** PV recuperados con Curación por Ki (no pasan de la mitad del daño sufrido, Core p.104). */
  curado: number;
  /**
   * Aura de combate de un rival (Dominus p.21, Tabla 9): el control ya hecho y su resultado. Quien lo
   * superó no lo repite en el combate; afectado lo repite cada 5 asaltos.
   */
  auras: Map<Luchador, { estado: EstadoAura; asalto: number }>;
  /** Marcas de Ki que le pusieron: bono al ataque de quien lo marcó (Dominus p.70). */
  marcas: Map<Luchador, number>;
  /** Escudo de energía activo: resistencia que le queda (0 sin escudo, Dominus p.66). */
  escudoKi: number;
  /** Acumulación (Ki): PV de pantalla que pierde antes que los suyos (Dominus p.65). */
  pantallaKi: number;
  /** Fascinación sobrenatural: sin acciones activas hasta superar la RF al verse en peligro (Dominus p.67). */
  fascinado: number;
  /** Engatillar: quién lo tiene amenazado (Core p.92). */
  amenazadoPor: Luchador | null;
  /** Arma todavía enfundada (escenario con armas enfundadas, Core p.91). */
  enfundada: boolean;
  /** Se está retirando: los que lo atacan al irse lo tienen de flanco (Core p.94). */
  huyendo: boolean;
  /** Tabla de 2ª Arma: Estilo Defensivo usada este asalto (la segunda arma defiende, no ataca). */
  estiloDefensivo: boolean;

  /** Balas del arma de fuego de un arma Leo (6, la recámara más corta, Dominus p.101; no recarga). */
  balas: number;
  /** Estado de cada arma a distancia de la ficha, en el mismo orden. */
  proyectiles: EstadoArmaDistancia[];
  /** Apuntando (Tabla 47): a quién, con qué arma y desde hace cuántos asaltos. */
  apuntando: { blanco: Luchador; arma: number; asaltos: number } | null;
  /** A quién le disparó por última vez este asalto (cambiar de blanco, Tabla 47). */
  ultimoBlanco: Luchador | null;
  /** Usó un arma a distancia este asalto: no se acerca después. */
  disparo: boolean;
  /** Controles de Trucos de manos para atrapar proyectiles hechos este asalto (−25 cada uno, Core p.94). */
  atrapadas: number;
  /** Dominios del Ki: reserva, Ki concentrado y técnicas activas (null sin técnicas). */
  ki: EstadoKi | null;
  /** Magia: zeon, lo acumulado y los conjuros mantenidos (null si no tiene conjuros). */
  magia: EstadoMagia | null;
  /** Conjuros de efecto que lo benefician (de quién vienen) y su suma (null sin ninguno). */
  bendiciones: Bendicion[];
  bono: BonoMagico | null;
  /** Tabla 76: En llamas (Core p.236). 0 si no arde; si no, el nivel en la tabla. */
  llamas: number;
  /** Este asalto intentó apagarse: las llamas no crecen. */
  apagando: boolean;
  /** Bajo Éxtasis: −20 a toda acción e ignora los demás negativos salvo los físicos (Core p.128). */
  extasis: boolean;
  /** Lo sujetan unos Lazos de Luz de este mago: no puede romperlos él mismo (Core p.127). */
  lazos: Luchador | null;
  /** Detección del Ki (Core p.103-104): hasta cuántos metros localiza presencias este asalto (0 si no). */
  radioDeteccionKi: number;
  /** A qué invisibles percibe este asalto (superó Advertir). */
  percibe: Set<Luchador>;
  /** La ficha con el arma entera, si se la rompieron (Reparación la devuelve). */
  armaRota: Ficha | null;
  /** A quiénes localiza con un conjuro de detección aunque sean invisibles. */
  detecta: Set<Luchador>;
  /** Hologramas que ya descubrió (no los ataca por error). */
  descubre: Set<Luchador>;
  /** Tiene un Holograma suyo al lado. */
  holograma: boolean;
  /** Atado con sogas o cadenas: su Fuerza para zafarse en contra (0 si no). */
  atadura: number;

  // --- modalidades y recursos de estilos ---
  modo: Modo;
  /** Kung Fu: dónde puso el bono variable este asalto. */
  bonoVariableEn: 'ataque' | 'defensa' | 'turno' | 'dano' | null;
  /** Xing Quan: el único adversario al que atacó este asalto. */
  objetivoUnico: Luchador | null;
  /** Godhand: el primer ataque de este asalto va potenciado. */
  godhandListo: boolean;
  godhandPreparado: boolean;
  ataqueFinalUsado: boolean;
  /** Camuflar ataque: a quiénes les toca defenderse de este golpe con el penalizador de Sorpresa (Dominus p.52). */
  camufladoA: Set<Luchador>;
  /** Previsión (Ki): el rival contra el que la usa este asalto, si alguno lo sorprende (Dominus p.57). */
  previsionContra: Luchador | null;
  /** Recibió un crítico este asalto: Recuperar acción no le sirve (Dominus p.57). */
  criticoEnAsalto: boolean;
  /** Camuflar ataque: quiénes ya vieron sus técnicas camufladas, y quiénes ya conocen el truco (Dominus p.52). */
  camuflajeConocido: Map<Luchador, 'visto' | 'superado'>;
  /** Transporte automático: cuántas veces vio cada rival que se transporta para atacarlo (Dominus p.59). */
  transportesVistos: Map<Luchador, number>;
  /**
   * Espejismo (Ki): ilusiones de sí mismo que le quedan, su Indetección, la RP de las fantasmales y
   * quiénes ya las descubrieron (Dominus p.65-66).
   */
  espejismos: { n: number; indeteccion: number; fantasmal: number; descubren: Set<Luchador> } | null;
  /** La ficha armada que tenía antes de que lo desarmaran (un Arma física de Ki la imita). */
  fichaArmada: Ficha | null;
  /** Arma física de Ki en la mano: la ficha y si estaba desarmado antes de crearla (Dominus p.63). */
  sinArmaKi: { ficha: Ficha; desarmado: boolean; proyectiles?: EstadoArmaDistancia[] } | null;
  /** Intangible por la técnica de un aliado (Afectar a otros), mientras éste la mantenga (Dominus p.69). */
  intangiblePor: Luchador | null;
  /** Lo atrapó una Presa existencial: controla con su Poder y no se libra con transportes (Dominus p.64). */
  presaExistencial: boolean;
  /** Ya intentó zafarse de la presa este asalto (si no pudo actuar, lo intenta al final, Core p.92). */
  intentoZafarse: boolean;
  /** Se retira con un Transporte automático: se defiende sin defensas previas ni posición (Dominus p.59). */
  defensaPlena: boolean;
  /** Maniobra Especial: rivales que ya la presenciaron o sufrieron; contra ellos no da bono (Dominus p.86). */
  maniobraEspecialVista: Set<Luchador>;
  /** Kardad supremo: ya repitió este asalto un control fallado al defenderse (Dominus p.37). */
  repitioControl: boolean;
  /** Ars Magnus Samiel: puntos acumulados contra cada enemigo. */
  samiel: Map<Luchador, number>;
  /** Sangre de Orochi despierta (1) o desencadenada (2). */
  orochi: 0 | 1 | 2;
  /** Turnos que lleva activa la sangre de Orochi (empieza a actuar al asalto siguiente). */
  orochiAsaltos: number;

  stats: Estadisticas;
}

export interface Evento {
  asalto: number;
  texto: string;
  /** Cómo quedó cada luchador (en el orden de `luchadores`) al narrarse esta línea: para verlo en vivo. */
  foto?: FotoLuchador[];
  // Lo que sigue usa índices en `luchadores`.
  /** De quién es el turno, si alguien está actuando. */
  turno?: number;
  /** Orden de iniciativa del asalto, en la línea de la iniciativa. */
  orden?: number[];
  /** Un ataque: quién a quién, si es una contra y el resultado del asalto (null si pifió). */
  ataque?: { de: number; a: number; contra: boolean; resultado: number | null };
  /** Un movimiento: las celdas que recorrió, desde donde estaba. */
  camino?: { quien: number; celdas: Punto[] };
  /** PV que perdió alguien. */
  dano?: { quien: number; cantidad: number };
  /** De quién habla la línea: quien ataca, o si no el primero que nombra (`sujetoDe` en combate.ts). */
  sujeto?: number;
  /** El área del ataque que narra la línea (conjuro, técnica de Ki): para dibujarla. */
  area?: AreaVisible;
  /** Zonas que siguen activas (Tormenta de Fuego, Mina): para dibujarlas todo el tiempo. */
  zonas?: AreaVisible[];
}

/** Un área en el tablero: centro en metros, radio, de quién es y el tipo de ataque (el color). */
export interface AreaVisible {
  x: number;
  y: number;
  radio: number;
  de: number;
  tipo: string;
  nombre: string;
}

export interface FotoLuchador {
  x: number;
  y: number;
  pv: number;
  estado: Estado;
  aLaDefensiva: boolean;
  /** Estados a la vista (condiciones.ts, `estadoVisible`); sólo si tiene alguno. */
  marcas?: string[];
  /** Reserva de Ki y zeon libre, si los tiene. */
  ki?: number;
  zeon?: number;
}

/** Reglas opcionales y condiciones del escenario. */
export interface OpcionesEscenario {
  /** Rotura y entereza de armas y armaduras (Core p.93): opcional. */
  rotura?: boolean;
  /** Pelean en un espacio reducido (Tabla 43). */
  espacioReducido?: boolean;
  /** Mapa en celdas de 1 m. Sin mapa se arma uno abierto con la distancia inicial entre los bandos. */
  mapa?: Mapa;
  /** Celda inicial de cada luchador, por equipo y en orden. Lo que falte (u ocupado) se ubica solo. */
  posiciones?: { A?: (Celda | null)[]; B?: (Celda | null)[] };
  /**
   * Oscuridad (Tabla 43): penumbra da ceguera parcial; total (carencia absoluta de luz) y mágica,
   * ceguera absoluta. Visión nocturna la reduce o la anula (Core p.20, p.318).
   */
  oscuridad?: 'penumbra' | 'total' | 'magica';
  /** Empiezan con las armas enfundadas: desenfundar cuesta −25 (Tabla 43). */
  armasEnfundadas?: boolean;
  /** Fase de la luna para los Legados de Tsukiyomi (Dominus p.79). Sin valor: de día. */
  faseLunar?: 'llena' | 'menguante' | 'creciente' | 'nueva' | 'eclipse';
  /** Permite huir del combate a quien va perdiendo (Core p.94). Por defecto se pelea hasta el final. */
  huida?: boolean;
  /**
   * Desequilibrio excesivo en los atributos (Dominus p.10): +10 a toda acción física enfrentada por
   * cada punto por el que la Destreza + Agilidad supera en más de 7 a la del rival. Opcional.
   */
  desequilibrio?: boolean;
  /**
   * Para análisis: atacan normal, sin maniobras. `true` para los dos equipos, o el equipo ('A' o
   * 'B') al que se le quitan; para medir cuánto le aportan a uno, el rival no tiene que cambiar.
   */
  sinManiobras?: boolean | Equipo;
  /** Escasa visibilidad (niebla, humo, lluvia densa): −20 a los proyectiles (Tabla 47). */
  escasaVisibilidad?: boolean;
  /**
   * Disparos paralelos (Core p.95, opcional): con menos de 25 de diferencia de turno, quien recibe un
   * disparo todavía sin actuar puede disparar a su vez antes de defenderse.
   */
  disparosParalelos?: boolean;
  /** Hay sogas o cadenas a mano: un mago puede Atar con ellas (Fuerza 10 o 12, Core p.180). */
  cuerdas?: 'soga' | 'cadena';
}

export interface Contexto {
  opciones: OpcionesEscenario;
  rng: Rng;
  luchadores: Luchador[];
  asalto: number;
  /** Sólo se llena cuando se pide (combate individual). */
  registro: Evento[] | null;
  ataquesEnAsalto: number;
  ataquesAsaltoAnterior: number;
  movimientosEnAsalto: number;
  /**
   * Cuánto gana cada equipo el intercambio de daño (>1: le quita PV al rival más rápido de lo que
   * pierde los suyos). Se calcula al inicio de cada asalto.
   */
  ventaja: Record<Equipo, number>;
  /** Quién está jugando su turno (para el registro). */
  turnoDe?: Luchador | null;
  /** El ataque en área que se está resolviendo, para que el registro lo dibuje. */
  areaActual?: AreaVisible | null;
}
