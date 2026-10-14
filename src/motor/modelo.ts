import type { Rng } from './rng';
import type { TamanoArma, TipoAtaque } from './reglas';
import type { Capacidades, Ranura } from './rasgos';

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
}

export interface CapaArmadura {
  nombre: string;
  clase: 'blanda' | 'dura';
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
  planAtaques: Ranura[];
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
  /** Para análisis: todos atacan normal, sin maniobras. Sirve para medir cuánto aportan. */
  sinManiobras?: boolean;
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
