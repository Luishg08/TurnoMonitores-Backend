#!/usr/bin/env bash
set -e

BASE_URL="http://localhost:3000"

echo "1) Datos disponibles"
curl -s "$BASE_URL/monitores" | head -c 300; echo
curl -s "$BASE_URL/salones" | head -c 300; echo

echo "2) Crear registro válido (espera 201 y webhook a n8n)"
curl -s -o /tmp/r1.json -w "HTTP %{http_code}\n" -X POST "$BASE_URL/turnos" -H "Content-Type: application/json" -d '{"monitorId":1,"salonId":1,"dia":"lunes","horaInicio":"08:00","horaFin":"10:00"}'
cat /tmp/r1.json; echo

echo "3) Repetir el mismo registro (espera 409, sin webhook)"
curl -s -o /tmp/r2.json -w "HTTP %{http_code}\n" -X POST "$BASE_URL/turnos" -H "Content-Type: application/json" -d '{"monitorId":1,"salonId":1,"dia":"lunes","horaInicio":"08:00","horaFin":"10:00"}'
cat /tmp/r2.json; echo

echo "4) Registro con campo faltante (espera 400)"
curl -s -o /tmp/r3.json -w "HTTP %{http_code}\n" -X POST "$BASE_URL/turnos" -H "Content-Type: application/json" -d '{"monitorId":1,"salonId":1,"dia":"lunes"}'
cat /tmp/r3.json; echo

echo "Revisar en n8n el nodo Send Email: debe llegar correo tras el paso 2 y NO tras el paso 3"
# Ajustar /turnos y los campos del payload al contrato real del equipo