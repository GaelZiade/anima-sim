import type { Rng } from './rng';
import type { TamanoArma, TipoAtaque } from './reglas';
import type { Capacidades, LocalizacionArmadura, Ranura } from './rasgos';
import type { EstadoKi } from './ki';

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
  /** Dominios del Ki: reserva, acumulaciones y técnicas (Core p.102-107, Dominus cap. 5). */
  ki?: KiFicha;
}

/** Características de las que se acumula Ki (Core p.102). */
export type CaracteristicaKi = 'AGI' | 'CON' | 'DES' | 'FUE' | 'POD' | 'VOL';
export const CARACTERISTICAS_KI: readonly CaracteristicaKi[] = ['AGI', 'CON', 'DES', 'FUE', 'POD', 'VOL'];

export interface KiFicha {
  /** Puntos de Ki de la reserva. Con la Unificación de puntos de Ki es una sola (todas las planillas). */
  reserva: number;
  /** Acumulación por asalto de cada característica (Tabla 53 más lo comprado). */
  acumulacion: Partial<Record<CaracteristicaKi, number>>;
  tecnicas: Tecnica[];
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

export interface Luchador {
  ficha: Ficha;
  /** Condiciones del escenario (compartidas por todos los luchadores del combate). */
  entorno: OpcionesEscenario;
  /** Derivado de la ficha una sola vez. */
  cap: Capacidades;
  equipo: Equipo;
  pos: Punto;
  pv: number;
  cansancio: number;
  /** Negativo por dolor: baja 5 por asalto. */
  penDolor: number;
  /** Negativo físico de críticos graves: dura todo el combate. */
  penFisico: number;
  estado: Estado;
  /** Enemigos trabados con él, en orden de llegada (define frente/flanco/espalda). */
  trabados: Luchador[];

  // --- estado del asalto ---
  iniciativa: number;
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
  metrosMovidos: number;
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
  /** 0 nada, 1 parálisis menor, 2 parcial, 3 completa. */
  paralisis: 0 | 1 | 2 | 3;
  /** Quién lo tiene apresado, y a quién apresa él. */
  apresadoPor: Luchador | null;
  apresando: Luchador | null;
  /** Lo desarmaron: pelea con su perfil sin armas. */
  desarmado: boolean;
  /** Paralización inducida (Mushin arcano), aparte de la de una presa, y asaltos que le quedan. */
  paralisisInducida: 0 | 1 | 2 | 3;
  paralisisTurnos: number;
  /** Engatillar: quién lo tiene amenazado (Core p.92). */
  amenazadoPor: Luchador | null;
  /** Arma todavía enfundada (escenario con armas enfundadas, Core p.91). */
  enfundada: boolean;
  /** Se está retirando: los que lo atacan al irse lo tienen de flanco (Core p.94). */
  huyendo: boolean;
  /** Tabla de 2ª Arma: Estilo Defensivo usada este asalto (la segunda arma defiende, no ataca). */
  estiloDefensivo: boolean;

  /** Dominios del Ki: reserva, Ki concentrado y técnicas activas (null sin técnicas). */
  ki: EstadoKi | null;

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
  maniobraEspecialUsada: boolean;
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
}

/** Reglas opcionales y condiciones del escenario. */
export interface OpcionesEscenario {
  /** Rotura y entereza de armas y armaduras (Core p.93): opcional. */
  rotura?: boolean;
  /** Pelean en un espacio reducido (Tabla 43). */
  espacioReducido?: boolean;
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
}
