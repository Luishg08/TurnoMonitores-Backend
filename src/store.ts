export type EstadoTurno =
  | 'pendiente_aprobacion'
  | 'aprobado'
  | 'en_curso'
  | 'finalizado'
  | 'cancelado'
  | 'rechazado';

export type EstadoSala = 'libre' | 'en_monitoria' | 'restringida' | 'sin_horario_configurado';

export interface Sede {
  id: string;
  nombre: string;
  horaInicio: string;
  horaFin: string;
}

export interface Sala {
  id: string;
  sedeId: string;
  nombre: string;
  esRestringida: boolean;
}

export interface Monitor {
  id: string;
  usuarioId: string;
  nombre: string;
  email: string;
  horasSemestre: number;
}

export interface Coordinador {
  id: string;
  usuarioId: string;
  nombre: string;
  email: string;
  sedeId: string;
}

export interface Turno {
  id: string;
  monitorId: string;
  salaId: string;
  coordinadorId: string | null;
  fecha: string;
  horaInicioPlan: string;
  horaFinPlan: string;
  horaInicioReal: string | null;
  horaFinReal: string | null;
  horasPlanificadas: number;
  horasReales: number | null;
  estado: EstadoTurno;
  createdAt: string;
}

export const sedes: Sede[] = [
  { id: 'sede-lans-001', nombre: 'LANS', horaInicio: '07:00', horaFin: '15:00' },
  { id: 'sede-central-001', nombre: 'CENTRAL', horaInicio: '07:00', horaFin: '18:00' },
];

export const salas: Sala[] = [
  { id: 'sala-lans-001', sedeId: 'sede-lans-001', nombre: 'Sala 1', esRestringida: false },
  { id: 'sala-lans-002', sedeId: 'sede-lans-001', nombre: 'Sala 2', esRestringida: false },
  { id: 'sala-lans-mac', sedeId: 'sede-lans-001', nombre: 'MAC', esRestringida: true },
  { id: 'sala-central-001', sedeId: 'sede-central-001', nombre: 'Sala 1', esRestringida: false },
  { id: 'sala-central-002', sedeId: 'sede-central-001', nombre: 'Sala 2', esRestringida: false },
  { id: 'sala-central-mac', sedeId: 'sede-central-001', nombre: 'MAC', esRestringida: true },
];

export const monitores: Monitor[] = [
  {
    id: 'monitor-001',
    usuarioId: 'usuario-001',
    nombre: 'Mariana López',
    email: 'mariana.lopez35806@ucaldas.edu.co',
    horasSemestre: 18.5,
  },
  {
    id: 'monitor-002',
    usuarioId: 'usuario-002',
    nombre: 'Luis Henao',
    email: 'luis.henao37085@ucaldas.edu.co',
    horasSemestre: 32.0,
  },
  {
    id: 'monitor-003',
    usuarioId: 'usuario-004',
    nombre: 'Carlos Pérez',
    email: 'carlos.perez@ucaldas.edu.co',
    horasSemestre: 20.0,
  },
];

export const coordinadores: Coordinador[] = [
  {
    id: 'coordinador-001',
    usuarioId: 'usuario-003',
    nombre: 'Ana Restrepo',
    email: 'ana.restrepo@ucaldas.edu.co',
    sedeId: 'sede-lans-001',
  },
];

export const turnos: Turno[] = [
  {
    id: 'turno-seed-001',
    monitorId: 'monitor-001',
    salaId: 'sala-lans-001',
    coordinadorId: 'coordinador-001',
    fecha: '2025-06-11',
    horaInicioPlan: '10:00',
    horaFinPlan: '12:00',
    horaInicioReal: null,
    horaFinReal: null,
    horasPlanificadas: 2.0,
    horasReales: null,
    estado: 'aprobado',
    createdAt: '2025-06-10T14:00:00Z',
  },
];
