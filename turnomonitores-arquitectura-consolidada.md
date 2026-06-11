# TurnoMonitores — Arquitectura consolidada US-01

---

## 1. Diagrama de arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│ CLIENTE                                                     │
│                                                             │
│  Next.js + Vite (Fly.io)                                    │
│  ├── /disponibilidad/:sedeId   → grilla de salas por estado │
│  └── /turnos/solicitar         → formulario de reserva      │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS — REST JSON
┌──────────────────────▼──────────────────────────────────────┐
│ API                                                         │
│                                                             │
│  NestJS (Fly.io)                                            │
│  ├── SedeController                                         │
│  │   └── GET /salas/:sedeId/disponibilidad                  │
│  ├── TurnoController                                        │
│  │   ├── POST /turnos                                       │
│  │   ├── PATCH /turnos/:id/estado                           │
│  │   └── PATCH /turnos/:id/salida                           │
│  ├── DisponibilidadService   ← calculo en tiempo real       │
│  ├── TurnoService            ← reglas de negocio            │
│  ├── HorasService            ← calcularHorasReales()        │
│  └── WebhookService          → POST n8n al persistir turno  │
│                                        │                    │
│                              ┌─────────▼──────────┐        │
│                              │ n8n (externo)       │        │
│                              │ POST /webhook/turno │        │
│                              │ → notificacion      │        │
│                              │   monitor por email │        │
│                              └────────────────────┘        │
└──────────────────────┬──────────────────────────────────────┘
                       │ TypeORM — TCP
┌──────────────────────▼──────────────────────────────────────┐
│ BASE DE DATOS                                               │
│                                                             │
│  MySQL (Fly.io volumen persistente)                         │
│  ├── sede                                                   │
│  ├── sala                                                   │
│  ├── horario_clase                                          │
│  ├── usuario                                                │
│  ├── monitor        (extiende usuario via composicion)      │
│  ├── coordinador    (extiende usuario via composicion)      │
│  ├── turno                                                  │
│  └── registro_uso_computador                                │
└─────────────────────────────────────────────────────────────┘
```

Notas de diseno:

- `DisponibilidadService` calcula el estado de cada sala en tiempo real consultando `turno` y `horario_clase`. No existe tabla `disponibilidad_sala`. El volumen total es 16 salas (8 por sede) — la consulta es O(salas) y nunca justifica una cache materializada con el riesgo de desincronizacion que implica.
- El calculo de horas reales vive en `HorasService.calcularHorasReales()` invocado desde `TurnoService` al registrar salida. Sin trigger en la base de datos — la logica de negocio pertenece a la capa de servicio.
- El conteo de monitores activos por sala+franja se valida en `TurnoService` antes de insertar. La restriccion de maximo 2 monitores no se delega a un trigger — los triggers ocultan logica de negocio y dificultan el testing unitario.
- Cuando un monitor modifica un turno en estado `aprobado`, `TurnoService` lo devuelve a `pendiente_aprobacion` antes de persistir. Esta transicion es responsabilidad del servicio, no del controlador.

---

## 2. Decisiones tecnicas del equipo

**Autenticacion para el taller**

Sin autenticacion. La seccion 6 del documento de producto establece que la historia priorizada se entrega "sin necesitar autenticacion ni logica compleja de negocio". El endpoint `GET /salas/:sedeId/disponibilidad` es publico. JWT y `@RolesGuard` se implementan en una iteracion posterior sin necesidad de tocar la logica de negocio porque ya estara encapsulada en los servicios.

**Restriccion de sala MAC**

El endpoint de disponibilidad es publico sin JWT para el taller. La sala MAC se marca con `es_restringida = true` en la tabla `sala` y `DisponibilidadService` devuelve estado `restringida` cuando encuentra esa bandera. La regla es una sola condicion en el servicio. Cuando llegue autenticacion real, se reemplaza por un `@RolesGuard` sin modificar la logica de negocio. El schema ya tiene la columna `es_restringida` para soportar ambos escenarios.

**Persistencia**

MySQL via TypeORM con UUIDs como claves primarias. Schema con 8 tablas: `sede`, `sala`, `horario_clase`, `usuario`, `monitor`, `coordinador`, `turno`, `registro_uso_computador`. La columna `horas_planificadas` es generada (`GENERATED ALWAYS AS ... STORED`). Sin tabla `disponibilidad_sala` — el estado de cada sala se calcula en tiempo real desde turnos activos y horarios de clase en `DisponibilidadService`. La restriccion `UNIQUE (monitor_id, fecha, hora_inicio_plan)` actua como segunda linea de defensa contra turnos duplicados a nivel de base de datos tras la validacion del servicio. La logica de negocio (maximo 2 monitores por sala, calculo de horas reales, transiciones de estado) vive en los servicios, no en triggers.

**Webhook**

Fire-and-forget desde `WebhookService.notify()` inmediatamente despues de persistir la transicion de estado del turno. Un fallo del webhook no revierte la transaccion. El payload tiene estructura anidada con los objetos `evento`, `timestamp`, `turno` (con `estadoAnterior` y `estadoNuevo`), `sala`, `monitor` y `coordinador`. Se dispara desde `PATCH /turnos/:id/estado`. La URL destino se lee de variable de entorno.

---

## 3. Schema SQL

Este schema es el de produccion. Para el taller se usa un seed minimo sobre esta misma estructura: una sede, tres salas (una con `es_restringida = true`) y un turno en estado `aprobado`.

```sql
-- Sede
CREATE TABLE sede (
  id          VARCHAR(36) PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL UNIQUE,
  hora_inicio TIME NOT NULL,
  hora_fin    TIME NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Sala
CREATE TABLE sala (
  id             VARCHAR(36) PRIMARY KEY,
  sede_id        VARCHAR(36) NOT NULL,
  nombre         VARCHAR(100) NOT NULL,
  es_restringida TINYINT(1) NOT NULL DEFAULT 0,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sala_sede_nombre (sede_id, nombre),
  CONSTRAINT fk_sala_sede FOREIGN KEY (sede_id) REFERENCES sede(id) ON DELETE CASCADE
);

-- Usuario (base comun para monitor y coordinador)
CREATE TABLE usuario (
  id            VARCHAR(36) PRIMARY KEY,
  codigo        VARCHAR(20) NOT NULL UNIQUE,
  nombre        VARCHAR(150) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol           VARCHAR(20) NOT NULL,
  estado        VARCHAR(30) NOT NULL DEFAULT 'pendiente_aprobacion',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_usuario_rol    CHECK (rol IN ('monitor', 'coordinador', 'estudiante')),
  CONSTRAINT chk_usuario_estado CHECK (estado IN ('pendiente_aprobacion', 'activo', 'rechazado'))
);

-- Monitor (extension de usuario)
CREATE TABLE monitor (
  id              VARCHAR(36) PRIMARY KEY,
  usuario_id      VARCHAR(36) NOT NULL UNIQUE,
  promedio        DECIMAL(3,2) NOT NULL,
  horas_semestre  DECIMAL(5,2) NOT NULL DEFAULT 0,
  semestre_activo VARCHAR(10) NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_monitor_promedio CHECK (promedio >= 3.70),
  CONSTRAINT fk_monitor_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
);

-- Coordinador (extension de usuario)
CREATE TABLE coordinador (
  id         VARCHAR(36) PRIMARY KEY,
  usuario_id VARCHAR(36) NOT NULL UNIQUE,
  sede_id    VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_coordinador_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE,
  CONSTRAINT fk_coordinador_sede    FOREIGN KEY (sede_id)    REFERENCES sede(id)    ON DELETE CASCADE
);

-- Horario de clase (cargado manualmente por el coordinador al inicio de semestre)
CREATE TABLE horario_clase (
  id          VARCHAR(36) PRIMARY KEY,
  sala_id     VARCHAR(36) NOT NULL,
  dia_semana  TINYINT NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin    TIME NOT NULL,
  activo      TINYINT(1) NOT NULL DEFAULT 1,
  semestre    VARCHAR(10) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_horario_dia CHECK (dia_semana BETWEEN 1 AND 7),
  CONSTRAINT fk_horario_sala FOREIGN KEY (sala_id) REFERENCES sala(id) ON DELETE CASCADE
);

-- Turno
CREATE TABLE turno (
  id                 VARCHAR(36) PRIMARY KEY,
  monitor_id         VARCHAR(36) NOT NULL,
  sala_id            VARCHAR(36) NOT NULL,
  coordinador_id     VARCHAR(36),
  fecha              DATE NOT NULL,
  hora_inicio_plan   TIME NOT NULL,
  hora_fin_plan      TIME NOT NULL,
  hora_inicio_real   TIME,
  hora_fin_real      TIME,
  horas_planificadas DECIMAL(4,2) AS (
                       TIMESTAMPDIFF(MINUTE, CAST(fecha AS DATETIME) + INTERVAL (TIME_TO_SEC(hora_inicio_plan)) SECOND,
                                             CAST(fecha AS DATETIME) + INTERVAL (TIME_TO_SEC(hora_fin_plan))    SECOND) / 60.0
                     ) STORED,
  horas_reales       DECIMAL(4,2),
  estado             VARCHAR(30) NOT NULL DEFAULT 'pendiente_aprobacion',
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_turno_monitor_fecha_inicio UNIQUE (monitor_id, fecha, hora_inicio_plan),
  CONSTRAINT chk_turno_estado CHECK (estado IN (
    'pendiente_aprobacion', 'aprobado', 'en_curso', 'finalizado', 'cancelado', 'rechazado'
  )),
  CONSTRAINT fk_turno_monitor      FOREIGN KEY (monitor_id)     REFERENCES monitor(id)     ON DELETE CASCADE,
  CONSTRAINT fk_turno_sala         FOREIGN KEY (sala_id)        REFERENCES sala(id)        ON DELETE CASCADE,
  CONSTRAINT fk_turno_coordinador  FOREIGN KEY (coordinador_id) REFERENCES coordinador(id) ON DELETE SET NULL
);

-- Registro de uso de computador por estudiante
CREATE TABLE registro_uso_computador (
  id         VARCHAR(36) PRIMARY KEY,
  sala_id    VARCHAR(36) NOT NULL,
  turno_id   VARCHAR(36) NOT NULL,
  usuario_id VARCHAR(36) NOT NULL,
  ingreso_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  egreso_at  DATETIME,
  CONSTRAINT fk_registro_sala    FOREIGN KEY (sala_id)    REFERENCES sala(id)    ON DELETE CASCADE,
  CONSTRAINT fk_registro_turno   FOREIGN KEY (turno_id)   REFERENCES turno(id)   ON DELETE CASCADE,
  CONSTRAINT fk_registro_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
);
```

Decisiones del schema:

- `horas_planificadas` es columna generada — se calcula sola, nunca se escribe.
- `horas_reales` se escribe desde `HorasService` al registrar salida. Sin trigger.
- La restriccion `UNIQUE (monitor_id, fecha, hora_inicio_plan)` previene turnos duplicados a nivel de base de datos como segunda linea de defensa tras la validacion del servicio.
- Sin columna `disponible` en `sala` — el estado se calcula siempre en tiempo real.
- La liberacion de sala por clase cancelada es una modificacion puntual sobre `horario_clase.activo = false`, no un borrado, para conservar el historico.

---

## 4. Endpoints del taller — imprescindibles para US-01

| Orden | Metodo | Ruta | Rol | Desbloquea |
|---|---|---|---|---|
| 1 | GET | `/salas/:sedeId/disponibilidad` | Backend | Frontend puede arrancar; Automatizador puede verificar que el seed existe |
| 2 | POST | `/turnos` | Backend | Automatizador tiene un turno real para disparar el webhook, no un mock |
| 3 | PATCH | `/turnos/:id/estado` | Backend | Automatizador puede forzar la transicion `aprobado → en_curso → finalizado` desde Postman y verificar que n8n recibe el payload |

`PATCH /turnos/:id/salida` no es imprescindible para la demo — la transicion de estado que dispara el webhook se ejecuta via `PATCH /turnos/:id/estado` directamente desde Postman. Se deja para una iteracion posterior.

Lo que el backend puede hardcodear temporalmente para no bloquear al frontend mientras el seed no esta listo:

```typescript
// temporal — reemplazar cuando el seed este conectado
return {
  sede: "LANS",
  consultadaEn: new Date().toISOString(),
  salas: [
    { id: "uuid-1", nombre: "Sala 1", estado: "libre" },
    { id: "uuid-2", nombre: "Sala 2", estado: "en_monitoria" },
    { id: "uuid-3", nombre: "MAC",    estado: "restringida" },
  ],
};
```

El contrato del objeto es identico al real. Cuando el backend reemplaza este bloque por la consulta a MySQL, el frontend no toca nada.

Lo que el backend no debe simular: la validacion del 404 por `sedeId` inexistente. El frontend envia un `sedeId` fijo y si ese ID no existe en el seed, la pantalla muestra el mensaje de error en la demo.

---

## 5. Endpoints completos del sistema

| Metodo | Ruta | Body entrada | Respuesta exitosa | Errores |
|---|---|---|---|---|
| GET | `/salas/:sedeId/disponibilidad` | — | `{ sede, consultadaEn, salas: [{ id, nombre, estado }] }` | 404 sede no encontrada |
| POST | `/turnos` | `{ monitorId, salaId, fecha, horaInicioPlan, horaFinPlan }` | `{ id, estado: "pendiente_aprobacion", horasPlanificadas }` | 400 regla de horas violada, 409 sala con 2 monitores activos, 409 turno solapado |
| PATCH | `/turnos/:id/estado` | `{ estado, coordinadorId? }` | `{ id, estadoAnterior, estadoNuevo, updatedAt }` | 404 turno no encontrado, 422 transicion de estado invalida |
| PATCH | `/turnos/:id/salida` | `{ horaFinReal }` | `{ id, horasReales, horasPlanificadas, estadoNuevo: "finalizado" }` | 404, 422 turno no en curso |

Estados validos de un turno y sus transiciones:

```
pendiente_aprobacion → aprobado              (coordinador aprueba)
pendiente_aprobacion → rechazado             (coordinador rechaza)
aprobado             → en_curso              (monitor inicia)
aprobado             → cancelado             (monitor o coordinador cancela)
en_curso             → finalizado            (monitor registra salida)
aprobado             → pendiente_aprobacion  (monitor modifica horario)
```

Logica de estado en `GET /salas/:sedeId/disponibilidad`:

- `libre`: sin turnos `en_curso` o `aprobado` en la franja actual y sin `horario_clase` activo en este momento.
- `en_monitoria`: existe al menos un turno `en_curso` en la franja actual.
- `restringida`: `sala.es_restringida = true`.
- `sin_horario_configurado`: no existe ningun `horario_clase` cargado para la sala en el semestre activo.

---

## 6. Contrato del webhook para n8n

`WebhookService.notify()` se invoca inmediatamente despues de persistir la transicion de estado. El envio es fire-and-forget — un fallo del webhook no revierte la transaccion del turno. La URL destino se lee de la variable de entorno `WEBHOOK_N8N_URL`.

```json
{
  "evento": "turno.estado_cambiado",
  "timestamp": "2025-06-11T10:45:00Z",
  "turno": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "fecha": "2025-06-11",
    "horaInicioPlan": "10:00",
    "horaFinPlan": "12:00",
    "horasPlanificadas": 2.0,
    "horasReales": null,
    "estadoAnterior": "aprobado",
    "estadoNuevo": "en_curso"
  },
  "sala": {
    "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "nombre": "Sala 3",
    "sede": "LANS"
  },
  "monitor": {
    "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
    "nombre": "Carlos Perez",
    "email": "carlos.perez@ucaldas.edu.co",
    "horasSemestre": 18.5
  },
  "coordinador": {
    "id": "d4e5f6a7-b8c9-0123-defa-234567890123",
    "nombre": "Ana Gomez",
    "email": "ana.gomez@ucaldas.edu.co"
  }
}
```

Campos que n8n usa para armar el correo al monitor:

- Asunto: `turno.estadoNuevo` + `sala.nombre` + `turno.fecha`
- Cuerpo: `monitor.nombre`, `sala.sede`, `turno.horaInicioPlan`, `turno.horaFinPlan`, `turno.estadoNuevo`
- Destinatario: `monitor.email`
- CC opcional: `coordinador.email`

`horasReales` llega `null` en todos los eventos excepto cuando `estadoNuevo` es `"finalizado"`.

---

## 7. Punto de coordinacion critico entre roles

El Automatizador necesita la URL del webhook de n8n antes del minuto 20. El Backend necesita esa URL para configurar el `.env` antes de probar `POST /turnos`.

El Backend entrega al Automatizador: URL del servidor NestJS corriendo + ID del turno sembrado en estado `aprobado` + confirmacion de que `WebhookService.notify()` se llama dentro de `PATCH /turnos/:id/estado`.

El Automatizador entrega al Backend: URL del webhook receptor en n8n para que el Backend la asigne a `WEBHOOK_N8N_URL` en `.env`.

Los nombres de campo del payload son el contrato compartido. Un campo renombrado en el Backend obliga al Automatizador a reconfigurar todo el mapeo en n8n dentro de una ventana de 40 minutos. El payload de la seccion 6 es la fuente de verdad para ambos roles.
