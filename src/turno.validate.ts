import { Turno } from './store.js';

export interface ConflictoTurno {
  tipo: 'TURNO_SOLAPADO' | 'SALA_CON_DOS_MONITORES';
  detalle: string;
}

interface NuevoTurno {
  monitorId: string;
  salaId: string;
  fecha: string;
  horaInicioPlan: string;
  horaFinPlan: string;
}

const toMinutes = (hora: string): number => {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
};

const seSuperponen = (
  inicioA: string,
  finA: string,
  inicioB: string,
  finB: string,
): boolean => {
  return toMinutes(inicioA) < toMinutes(finB) && toMinutes(inicioB) < toMinutes(finA);
};

const estadosActivos: Turno['estado'][] = [
  'pendiente_aprobacion',
  'aprobado',
  'en_curso',
];

export const validateConflict = (
  turnos: Turno[],
  nuevo: NuevoTurno,
): ConflictoTurno | null => {
  const turnosMismaFecha = turnos.filter(
    (t) => t.fecha === nuevo.fecha && estadosActivos.includes(t.estado),
  );

  const turnoSolapado = turnosMismaFecha.find(
    (t) =>
      t.monitorId === nuevo.monitorId &&
      seSuperponen(nuevo.horaInicioPlan, nuevo.horaFinPlan, t.horaInicioPlan, t.horaFinPlan),
  );

  if (turnoSolapado) {
    return {
      tipo: 'TURNO_SOLAPADO',
      detalle: `El monitor ya tiene un turno de ${turnoSolapado.horaInicioPlan} a ${turnoSolapado.horaFinPlan} en esa fecha`,
    };
  }

  const monitoresEnSalaFranja = turnosMismaFecha.filter(
    (t) =>
      t.salaId === nuevo.salaId &&
      seSuperponen(nuevo.horaInicioPlan, nuevo.horaFinPlan, t.horaInicioPlan, t.horaFinPlan),
  );

  if (monitoresEnSalaFranja.length >= 2) {
    return {
      tipo: 'SALA_CON_DOS_MONITORES',
      detalle: `La sala ya tiene ${monitoresEnSalaFranja.length} monitores asignados en esa franja`,
    };
  }

  return null;
};
