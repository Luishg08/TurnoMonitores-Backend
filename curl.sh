#!/usr/bin/env bash

BASE="http://localhost:3000"

echo "=== GET /monitores ==="
curl -s "$BASE/monitores" | jq .

echo ""
echo "=== GET /salones ==="
curl -s "$BASE/salones" | jq .

echo ""
echo "=== POST /turnos — turno valido (Mariana, SALA E) ==="
curl -s -X POST "$BASE/turnos" \
  -H "Content-Type: application/json" \
  -d '{
    "salon_id":    "s-1",
    "monitor_id":  "m-1",
    "materia":     "Programacion I",
    "fecha":       "2025-06-12",
    "hora_inicio": "08:00",
    "hora_fin":    "10:00"
  }' | jq .

echo ""
echo "=== POST /turnos — conflicto de salon (mismo salon, franja solapada) ==="
curl -s -X POST "$BASE/turnos" \
  -H "Content-Type: application/json" \
  -d '{
    "salon_id":    "s-1",
    "monitor_id":  "m-2",
    "materia":     "Bases de Datos",
    "fecha":       "2025-06-12",
    "hora_inicio": "09:00",
    "hora_fin":    "11:00"
  }' | jq .

echo ""
echo "=== POST /turnos — turno valido (Luis, SALA E, franja distinta) ==="
curl -s -X POST "$BASE/turnos" \
  -H "Content-Type: application/json" \
  -d '{
    "salon_id":    "s-1",
    "monitor_id":  "m-2",
    "materia":     "Bases de Datos",
    "fecha":       "2025-06-12",
    "hora_inicio": "10:00",
    "hora_fin":    "12:00"
  }' | jq .

echo ""
echo "=== POST /turnos — conflicto de monitor (Luis ya tiene turno en Sede Lans esa franja) ==="
curl -s -X POST "$BASE/turnos" \
  -H "Content-Type: application/json" \
  -d '{
    "salon_id":    "s-1",
    "monitor_id":  "m-2",
    "materia":     "Redes",
    "fecha":       "2025-06-12",
    "hora_inicio": "10:30",
    "hora_fin":    "12:30"
  }' | jq .

echo ""
echo "=== POST /turnos — 400 campos faltantes ==="
curl -s -X POST "$BASE/turnos" \
  -H "Content-Type: application/json" \
  -d '{
    "salon_id": "s-1"
  }' | jq .
