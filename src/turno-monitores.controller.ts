import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  sedes,
  salas,
  turnos,
  monitores,
  coordinadores,
  Turno,
  EstadoTurno,
  EstadoSala,
} from './store.js';
import { validateConflict } from './turno.validate.js';

const TRANSICIONES_VALIDAS: Record<EstadoTurno, EstadoTurno[]> = {
  pendiente_aprobacion: ['aprobado', 'rechazado'],
  aprobado: ['en_curso', 'cancelado', 'pendiente_aprobacion'],
  en_curso: ['finalizado'],
  finalizado: [],
  cancelado: [],
  rechazado: [],
};

const calcularHorasPlanificadas = (inicio: string, fin: string): number => {
  const [h0, m0] = inicio.split(':').map(Number);
  const [h1, m1] = fin.split(':').map(Number);
  return (h1 * 60 + m1 - (h0 * 60 + m0)) / 60;
};

const notifyWebhook = async (payload: object): Promise<void> => {
  const url = process.env.WEBHOOK_N8N_URL;
  if (!url) return;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[webhook] fallo al notificar n8n:', err);
  }
};

const buildWebhookPayload = (turno: Turno, estadoAnterior: EstadoTurno) => {
  const sala = salas.find((s) => s.id === turno.salaId);
  const sede = sala ? sedes.find((se) => se.id === sala.sedeId) : null;
  const monitor = monitores.find((m) => m.id === turno.monitorId);
  const coordinador = turno.coordinadorId
    ? coordinadores.find((c) => c.id === turno.coordinadorId)
    : null;

  return {
    evento: 'turno.estado_cambiado',
    timestamp: new Date().toISOString(),
    turno: {
      id: turno.id,
      fecha: turno.fecha,
      horaInicioPlan: turno.horaInicioPlan,
      horaFinPlan: turno.horaFinPlan,
      horasPlanificadas: turno.horasPlanificadas,
      horasReales: turno.horasReales,
      estadoAnterior,
      estadoNuevo: turno.estado,
    },
    sala: sala
      ? { id: sala.id, nombre: sala.nombre, sede: sede?.nombre ?? null }
      : null,
    monitor: monitor
      ? {
          id: monitor.id,
          nombre: monitor.nombre,
          email: monitor.email,
          horasSemestre: monitor.horasSemestre,
        }
      : null,
    coordinador: coordinador
      ? { id: coordinador.id, nombre: coordinador.nombre, email: coordinador.email }
      : null,
  };
};

@Controller()
export class TurnoMonitoresController {
  @Get('salas/:sedeId/disponibilidad')
  getSalasDisponibilidad(@Param('sedeId') sedeId: string) {
    const sede = sedes.find((s) => s.id === sedeId);
    if (!sede) throw new NotFoundException('Sede no encontrada');

    const salasEnSede = salas.filter((s) => s.sedeId === sedeId);
    const ahora = new Date();
    const horaActual = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
    const fechaHoy = ahora.toISOString().slice(0, 10);

    const result = salasEnSede.map((sala) => {
      if (sala.esRestringida) {
        return { id: sala.id, nombre: sala.nombre, estado: 'restringida' as EstadoSala };
      }

      const turnoEnCurso = turnos.find(
        (t) =>
          t.salaId === sala.id &&
          t.fecha === fechaHoy &&
          t.estado === 'en_curso' &&
          t.horaInicioPlan <= horaActual &&
          t.horaFinPlan > horaActual,
      );

      const estado: EstadoSala = turnoEnCurso ? 'en_monitoria' : 'libre';
      return { id: sala.id, nombre: sala.nombre, estado };
    });

    return {
      sede: sede.nombre,
      consultadaEn: ahora.toISOString(),
      salas: result,
    };
  }

  @Post('turnos')
  @HttpCode(HttpStatus.CREATED)
  async crearTurno(
    @Body()
    body: {
      monitorId: string;
      salaId: string;
      fecha: string;
      horaInicioPlan: string;
      horaFinPlan: string;
    },
  ) {
    const { monitorId, salaId, fecha, horaInicioPlan, horaFinPlan } = body;

    if (!monitorId || !salaId || !fecha || !horaInicioPlan || !horaFinPlan) {
      throw new BadRequestException('Faltan campos obligatorios');
    }

    const monitor = monitores.find((m) => m.id === monitorId);
    if (!monitor) throw new NotFoundException('Monitor no encontrado');

    const sala = salas.find((s) => s.id === salaId);
    if (!sala) throw new NotFoundException('Sala no encontrada');

    const sede = sedes.find((s) => s.id === sala.sedeId);
    if (!sede) throw new NotFoundException('Sede no encontrada');

    if (horaInicioPlan < sede.horaInicio || horaFinPlan > sede.horaFin) {
      throw new BadRequestException(
        `Horario fuera del rango de la sede ${sede.nombre}: ${sede.horaInicio} - ${sede.horaFin}`,
      );
    }

    const conflicto = validateConflict(turnos, { monitorId, salaId, fecha, horaInicioPlan, horaFinPlan });

    if (conflicto) {
      throw new HttpException(
        { error: conflicto.tipo, detalle: conflicto.detalle },
        HttpStatus.CONFLICT,
      );
    }

    const nuevoTurno: Turno = {
      id: randomUUID(),
      monitorId,
      salaId,
      coordinadorId: null,
      fecha,
      horaInicioPlan,
      horaFinPlan,
      horaInicioReal: null,
      horaFinReal: null,
      horasPlanificadas: calcularHorasPlanificadas(horaInicioPlan, horaFinPlan),
      horasReales: null,
      estado: 'pendiente_aprobacion',
      createdAt: new Date().toISOString(),
    };

    turnos.push(nuevoTurno);

    notifyWebhook(buildWebhookPayload(nuevoTurno, 'pendiente_aprobacion'));

    return {
      id: nuevoTurno.id,
      estado: nuevoTurno.estado,
      horasPlanificadas: nuevoTurno.horasPlanificadas,
    };
  }

  @Patch('turnos/:id/estado')
  async cambiarEstado(
    @Param('id') id: string,
    @Body() body: { estado: EstadoTurno; coordinadorId?: string },
  ) {
    const turno = turnos.find((t) => t.id === id);
    if (!turno) throw new NotFoundException('Turno no encontrado');

    const { estado: nuevoEstado, coordinadorId } = body;
    const transicionesPermitidas = TRANSICIONES_VALIDAS[turno.estado];

    if (!transicionesPermitidas.includes(nuevoEstado)) {
      throw new UnprocessableEntityException(
        `Transicion invalida: ${turno.estado} → ${nuevoEstado}`,
      );
    }

    const estadoAnterior = turno.estado;

    if (nuevoEstado === 'pendiente_aprobacion' && estadoAnterior === 'aprobado') {
      turno.coordinadorId = null;
    }

    if (coordinadorId) {
      const coordinador = coordinadores.find((c) => c.id === coordinadorId);
      if (!coordinador) throw new NotFoundException('Coordinador no encontrado');
      turno.coordinadorId = coordinadorId;
    }

    turno.estado = nuevoEstado;

    notifyWebhook(buildWebhookPayload(turno, estadoAnterior));

    return {
      id: turno.id,
      estadoAnterior,
      estadoNuevo: turno.estado,
      updatedAt: new Date().toISOString(),
    };
  }
}
