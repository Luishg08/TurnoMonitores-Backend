# API TurnoMonitores — Documentación para Frontend

Base URL: `http://localhost:3000`

---

## 1. Obtener disponibilidad de salas por sede

```
GET /salas/{sedeId}/disponibilidad
```

**Ejemplo:**
```
GET /salas/sede-lans-001/disponibilidad
```

**Respuesta 200:**
```json
{
  "sede": "LANS",
  "consultadaEn": "2026-06-11T17:13:05.108Z",
  "salas": [
    { "id": "sala-lans-001", "nombre": "Sala 1", "estado": "libre" },
    { "id": "sala-lans-002", "nombre": "Sala 2", "estado": "libre" },
    { "id": "sala-lans-mac", "nombre": "MAC", "estado": "restringida" }
  ]
}
```

**Estados posibles de cada sala:**
| estado | significado |
|---|---|
| `libre` | Sin turno activo en la franja actual |
| `en_monitoria` | Hay un turno `en_curso` en este momento |
| `restringida` | Sala MAC — solo accesible para ciertos roles |

**Error 404:**
```json
{ "error": "No encontrado", "detalle": "Sede no encontrada" }
```

**sedeId disponibles:**
| id | nombre |
|---|---|
| `sede-lans-001` | LANS |
| `sede-central-001` | CENTRAL |

---

## 2. Listar monitores

```
GET /monitores
```

**Respuesta 200:**
```json
[
  { "id": "monitor-001", "nombre": "Mariana López", "email": "mariana.lopez35806@ucaldas.edu.co", "horasSemestre": 18.5 },
  { "id": "monitor-002", "nombre": "Luis Henao", "email": "luis.henao37085@ucaldas.edu.co", "horasSemestre": 32.0 }
]
```

---

## 3. Listar salones

```
GET /salones
```

**Respuesta 200:**
```json
[
  { "id": "sala-lans-001", "nombre": "Sala E", "sede": { "id": "sede-lans-001", "nombre": "LANS" }, "esRestringida": false },
  { "id": "sala-lans-mac", "nombre": "MAC", "sede": { "id": "sede-lans-001", "nombre": "LANS" }, "esRestringida": true }
]
```

---

## 4. Listar turnos pendientes de aprobación

```
GET /turnos/pendientes
```

**Respuesta 200:**
```json
[
  {
    "id": "a3dc242f-...",
    "monitor": { "id": "monitor-001", "nombre": "Mariana López", "email": "mariana.lopez35806@ucaldas.edu.co" },
    "sala": { "id": "sala-lans-001", "nombre": "Sala E" },
    "sede": { "id": "sede-lans-001", "nombre": "LANS" },
    "fecha": "2026-06-12",
    "horaInicioPlan": "08:00",
    "horaFinPlan": "10:00",
    "horasPlanificadas": 2,
    "createdAt": "2026-06-11T17:28:05.870Z"
  }
]
```

---

## 5. Crear un turno

```
POST /turnos
Content-Type: application/json
```

**Body:**
```json
{
  "monitorId": "monitor-001",
  "salaId": "sala-lans-002",
  "fecha": "2025-06-12",
  "horaInicioPlan": "08:00",
  "horaFinPlan": "10:00"
}
```

**Respuesta 201:**
```json
{
  "id": "b3ed5769-1484-4f67-b936-d409c7752416",
  "estado": "pendiente_aprobacion",
  "horasPlanificadas": 2
}
```

**Errores:**
| código | error | detalle |
|---|---|---|
| 400 | `Solicitud invalida` | Faltan campos obligatorios |
| 400 | `Solicitud invalida` | Horario fuera del rango de la sede |
| 404 | `No encontrado` | Monitor, sala o sede no encontrada |
| 409 | `TURNO_SOLAPADO` | El monitor ya tiene un turno en esa fecha y franja |
| 409 | `SALA_CON_DOS_MONITORES` | La sala ya tiene 2 monitores asignados en esa franja |

> **Nota:** Una sala puede tener hasta 2 monitores simultáneamente en la misma franja. El tercero recibe `SALA_CON_DOS_MONITORES`.

---

## 6. Cambiar estado de un turno

```
PATCH /turnos/{id}/estado
Content-Type: application/json
```

**Body:**
```json
{
  "estado": "en_curso",
  "coordinadorId": "coordinador-001"
}
```
`coordinadorId` es opcional.

**Respuesta 200:**
```json
{
  "id": "turno-seed-001",
  "estadoAnterior": "aprobado",
  "estadoNuevo": "en_curso",
  "updatedAt": "2026-06-11T17:17:19.118Z"
}
```

**Transiciones válidas:**
| desde | hacia |
|---|---|
| `pendiente_aprobacion` | `aprobado`, `rechazado` |
| `aprobado` | `en_curso`, `cancelado`, `pendiente_aprobacion` |
| `en_curso` | `finalizado` |
| `finalizado` | _ninguna_ |
| `cancelado` | _ninguna_ |
| `rechazado` | _ninguna_ |

**Error 422 — transición inválida:**
```json
{ "error": "Entidad no procesable", "detalle": "Transicion invalida: finalizado → aprobado" }
```

---

## 7. Seed data — IDs disponibles para pruebas

### Monitores
| id | nombre | email |
|---|---|---|
| `monitor-001` | Mariana López | mariana.lopez35806@ucaldas.edu.co |
| `monitor-002` | Luis Henao | luis.henao37085@ucaldas.edu.co |
| `monitor-003` | Carlos Pérez | carlos.perez@ucaldas.edu.co |

### Salas
| id | nombre | sede |
|---|---|---|
| `sala-lans-001` | Sala E | LANS |
| `sala-lans-002` | Sala CISCO | LANS |
| `sala-lans-mac` | MAC (restringida) | LANS |
| `sala-central-001` | Sala J | CENTRAL |
| `sala-central-002` | Sala I | CENTRAL |
| `sala-central-mac` | MAC (restringida) | CENTRAL |

### Coordinadores
| id | nombre | sede |
|---|---|---|
| `coordinador-001` | Luis Henao | LANS |

### Turno semilla
| id | estado |
|---|---|
| `turno-seed-001` | `aprobado` — Sala 1 LANS, monitor Mariana, 10:00-12:00 |

---

## 8. Formato de errores (global)

Toda respuesta de error sigue esta estructura:
```json
{
  "error": "Nombre del error",
  "detalle": "Descripción legible del problema"
}
```

Códigos HTTP posibles: `400`, `404`, `409`, `422`, `500`.
