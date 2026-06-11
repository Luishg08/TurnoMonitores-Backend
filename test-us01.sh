#!/usr/bin/env bash

BASE="http://localhost:3000"

echo "=== GET disponibilidad sede LANS ==="
curl -s "$BASE/salas/sede-lans-001/disponibilidad" | jq .

echo ""
echo "=== GET disponibilidad sede inexistente — 404 ==="
curl -s "$BASE/salas/sede-inexistente/disponibilidad" | jq .

echo ""
echo "=== POST /turnos — turno valido (Mariana, Sala 2, manana) ==="
curl -s -X POST "$BASE/turnos" \
  -H "Content-Type: application/json" \
  -d '{
    "monitorId":      "monitor-001",
    "salaId":         "sala-lans-002",
    "fecha":          "2025-06-12",
    "horaInicioPlan": "08:00",
    "horaFinPlan":    "10:00"
  }' | jq .

echo ""
echo "=== POST /turnos — conflicto de monitor (Mariana ya tiene turno solapado) ==="
curl -s -X POST "$BASE/turnos" \
  -H "Content-Type: application/json" \
  -d '{
    "monitorId":      "monitor-001",
    "salaId":         "sala-lans-002",
    "fecha":          "2025-06-12",
    "horaInicioPlan": "09:00",
    "horaFinPlan":    "11:00"
  }' | jq .

echo ""
echo "=== POST /turnos — segundo monitor en Sala 2 (valido, aun no hay 2) ==="
curl -s -X POST "$BASE/turnos" \
  -H "Content-Type: application/json" \
  -d '{
    "monitorId":      "monitor-002",
    "salaId":         "sala-lans-002",
    "fecha":          "2025-06-12",
    "horaInicioPlan": "08:00",
    "horaFinPlan":    "10:00"
  }' | jq .

echo ""
echo "=== POST /turnos — conflicto SALA_CON_DOS_MONITORES (CA3) ==="
curl -s -X POST "$BASE/turnos" \
  -H "Content-Type: application/json" \
  -d '{
    "monitorId":      "monitor-003",
    "salaId":         "sala-lans-002",
    "fecha":          "2025-06-12",
    "horaInicioPlan": "08:30",
    "horaFinPlan":    "10:30"
  }' | jq .

echo ""
echo "=== PATCH /turnos/turno-seed-001/estado — aprobado → en_curso ==="
curl -s -X PATCH "$BASE/turnos/turno-seed-001/estado" \
  -H "Content-Type: application/json" \
  -d '{
    "estado":        "en_curso",
    "coordinadorId": "coordinador-001"
  }' | jq .

echo ""
echo "=== PATCH /turnos/turno-seed-001/estado — en_curso → finalizado ==="
curl -s -X PATCH "$BASE/turnos/turno-seed-001/estado" \
  -H "Content-Type: application/json" \
  -d '{
    "estado": "finalizado"
  }' | jq .

echo ""
echo "=== PATCH transicion invalida — finalizado → aprobado — 422 ==="
curl -s -X PATCH "$BASE/turnos/turno-seed-001/estado" \
  -H "Content-Type: application/json" \
  -d '{
    "estado": "aprobado"
  }' | jq .
