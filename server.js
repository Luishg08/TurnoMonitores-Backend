import 'dotenv/config';
import express from 'express';
import { randomUUID } from 'crypto';

const app = express();
app.use(express.json());

const monitores = [
  { id: 'm-1', nombre: 'Mariana López', email: 'mariana.lopez35806@ucaldas.edu.co' },
  { id: 'm-2', nombre: 'Luis Henao', email: 'luis.henao37085@ucaldas.edu.co' },
];

const salones = [
  { id: 's-1', nombre: 'SALA E', sede: 'Sede Lans' },
  { id: 's-2', nombre: 'SALA J', sede: 'Sede Orlando Sierra' },
];

const turnos = [];

const toMinutes = (hora) => {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
};

const seSuperponen = (inicioA, finA, inicioB, finB) => {
  return toMinutes(inicioA) < toMinutes(finB) && toMinutes(inicioB) < toMinutes(finA);
};

const validateConflict = (salon_id, monitor_id, fecha, hora_inicio, hora_fin) => {
  const salon = salones.find((s) => s.id === salon_id);
  const turnosMismaFecha = turnos.filter((t) => t.fecha === fecha);

  const conflictoSalon = turnosMismaFecha.find(
    (t) =>
      t.salon_id === salon_id &&
      salones.find((s) => s.id === t.salon_id)?.sede === salon?.sede &&
      seSuperponen(hora_inicio, hora_fin, t.hora_inicio, t.hora_fin),
  );

  if (conflictoSalon) {
    return { status: 409, error: 'Conflicto de salon', detalle: `El salon ${salon?.nombre} ya tiene un turno de ${conflictoSalon.hora_inicio} a ${conflictoSalon.hora_fin}` };
  }

  const conflictoMonitor = turnosMismaFecha.find(
    (t) => {
      const salonTurno = salones.find((s) => s.id === t.salon_id);
      return (
        t.monitor_id === monitor_id &&
        salonTurno?.sede === salon?.sede &&
        seSuperponen(hora_inicio, hora_fin, t.hora_inicio, t.hora_fin)
      );
    },
  );

  if (conflictoMonitor) {
    const monitor = monitores.find((m) => m.id === monitor_id);
    return { status: 409, error: 'Conflicto de monitor', detalle: `${monitor?.nombre} ya tiene un turno de ${conflictoMonitor.hora_inicio} a ${conflictoMonitor.hora_fin} en esa sede` };
  }

  return null;
};

const calcularHorasPlanificadas = (hora_inicio, hora_fin) =>
  (toMinutes(hora_fin) - toMinutes(hora_inicio)) / 60;

const notifyWebhook = async (turno) => {
  const url = process.env.N8N_WEBHOOK_URL;
  if (!url) return;

  const salon = salones.find((s) => s.id === turno.salon_id);
  const monitor = monitores.find((m) => m.id === turno.monitor_id);

  const payload = {
    evento: 'turno.estado_cambiado',
    timestamp: new Date().toISOString(),
    turno: {
      id: turno.id,
      fecha: turno.fecha,
      horaInicioPlan: turno.hora_inicio,
      horaFinPlan: turno.hora_fin,
      horasPlanificadas: turno.horas_planificadas,
      horasReales: null,
      estadoAnterior: null,
      estadoNuevo: turno.estado,
    },
    sala: salon ? { id: salon.id, nombre: salon.nombre, sede: salon.sede } : null,
    monitor: monitor ? { id: monitor.id, nombre: monitor.nombre, email: monitor.email, horasSemestre: 0 } : null,
    coordinador: null,
  };

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[webhook] fallo al notificar n8n:', err.message);
  }
};

app.get('/monitores', (_req, res) => {
  res.json(monitores);
});

app.get('/salones', (_req, res) => {
  res.json(salones);
});

app.post('/turnos', async (req, res) => {
  const { salon_id, monitor_id, materia, fecha, hora_inicio, hora_fin } = req.body;

  if (!salon_id || !monitor_id || !materia || !fecha || !hora_inicio || !hora_fin) {
    return res.status(400).json({
      error: 'Campos requeridos faltantes',
      detalle: [!salon_id && 'salon_id', !monitor_id && 'monitor_id', !materia && 'materia', !fecha && 'fecha', !hora_inicio && 'hora_inicio', !hora_fin && 'hora_fin']
        .filter(Boolean)
        .join(', '),
    });
  }

  if (!salones.find((s) => s.id === salon_id)) {
    return res.status(404).json({ error: 'Salon no encontrado', detalle: salon_id });
  }

  if (!monitores.find((m) => m.id === monitor_id)) {
    return res.status(404).json({ error: 'Monitor no encontrado', detalle: monitor_id });
  }

  const conflicto = validateConflict(salon_id, monitor_id, fecha, hora_inicio, hora_fin);
  if (conflicto) {
    return res.status(conflicto.status).json({ error: conflicto.error, detalle: conflicto.detalle });
  }

  const turno = {
    id: randomUUID(),
    salon_id,
    monitor_id,
    materia,
    fecha,
    hora_inicio,
    hora_fin,
    horas_planificadas: calcularHorasPlanificadas(hora_inicio, hora_fin),
    estado: 'pendiente_aprobacion',
    created_at: new Date().toISOString(),
  };

  turnos.push(turno);

  notifyWebhook(turno);

  return res.status(201).json(turno);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`servidor corriendo en puerto ${PORT}`));
