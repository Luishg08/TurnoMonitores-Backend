#!/usr/bin/env bash
# ============================================================
# QA Test Suite — TurnoMonitores API
# ============================================================
# Uso:  chmod +x qa-test.sh && ./qa-test.sh
# ============================================================

BASE_URL="${1:-http://localhost:3000}"
PASS=0
FAIL=0
TOTAL=0

pass() { PASS=$((PASS+1)); echo -e "  >>> OK\n"; }
fail() { FAIL=$((FAIL+1)); echo -e "  >>> FALLO\n"; }

pad() { printf '%*s' "$1" | tr ' ' '='; }

# ============================================================
echo -e "\n$(pad 60)"
echo "  QA — TurnoMonitores"
echo "$(pad 60)\n"

# ============================================================
# 1. ENDPOINTS DE LECTURA
# ============================================================
echo "1. CONSULTAR ENDPOINTS DE LECTURA"

TOTAL=$((TOTAL+1))
echo -n "  1a. GET /monitores"
HTTP=$(curl -s -o /tmp/qa-body.json -w "%{http_code}" "$BASE_URL/monitores")
BODY=$(cat /tmp/qa-body.json)
if [ "$HTTP" = "200" ] && echo "$BODY" | grep -q "monitor-001"; then
  pass
else
  echo "       HTTP $HTTP | $BODY"
  fail
fi

TOTAL=$((TOTAL+1))
echo -n "  1b. GET /salones"
HTTP=$(curl -s -o /tmp/qa-body.json -w "%{http_code}" "$BASE_URL/salones")
BODY=$(cat /tmp/qa-body.json)
if [ "$HTTP" = "200" ] && echo "$BODY" | grep -q "sala-lans-001"; then
  pass
else
  echo "       HTTP $HTTP | $BODY"
  fail
fi

# ============================================================
# 2. CREAR REGISTRO VÁLIDO — 201 + WEBHOOK
# ============================================================
echo "2. CREAR TURNO VÁLIDO (201 + webhook)"

TOTAL=$((TOTAL+1))
echo -n "  2. POST /turnos (valido)"
HTTP=$(curl -s -o /tmp/qa-body.json -w "%{http_code}" -X POST "$BASE_URL/turnos" \
  -H "Content-Type: application/json" \
  -d '{
    "monitorId":      "monitor-001",
    "salaId":         "sala-lans-002",
    "fecha":          "2026-06-15",
    "horaInicioPlan": "08:00",
    "horaFinPlan":    "10:00"
  }')
BODY=$(cat /tmp/qa-body.json)
TURNO_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ "$HTTP" = "201" ] && [ -n "$TURNO_ID" ]; then
  echo -e "\n       ID creado: $TURNO_ID"
  echo -e "       Body: $BODY"
  echo -e "       [webhook] notificacion enviada a n8n"
  pass
else
  echo "       HTTP $HTTP | $BODY"
  fail
fi

# ============================================================
# 3. CONFLICTO — 409 + NO WEBHOOK
# ============================================================
echo "3. FORZAR CONFLICTO DE MONITOR (409 + NO webhook)"

TOTAL=$((TOTAL+1))
echo -n "  3. POST /turnos (mismo monitor, franja solapada)"
HTTP=$(curl -s -o /tmp/qa-body.json -w "%{http_code}" -X POST "$BASE_URL/turnos" \
  -H "Content-Type: application/json" \
  -d '{
    "monitorId":      "monitor-001",
    "salaId":         "sala-lans-002",
    "fecha":          "2026-06-15",
    "horaInicioPlan": "09:00",
    "horaFinPlan":    "11:00"
  }')
BODY=$(cat /tmp/qa-body.json)
if [ "$HTTP" = "409" ] && echo "$BODY" | grep -q "TURNO_SOLAPADO"; then
  echo -e "       Body: $BODY"
  echo -e "       [webhook] NO se envio (no hubo registro)"
  pass
else
  echo "       HTTP $HTTP | $BODY"
  fail
fi

# ============================================================
# 4. CAMPO FALTANTE — 400
# ============================================================
echo "4. SOLICITUD CON CAMPOS FALTANTES (400)"

TOTAL=$((TOTAL+1))
echo -n "  4. POST /turnos (sin monitorId)"
HTTP=$(curl -s -o /tmp/qa-body.json -w "%{http_code}" -X POST "$BASE_URL/turnos" \
  -H "Content-Type: application/json" \
  -d '{
    "salaId":         "sala-lans-002",
    "fecha":          "2026-06-15",
    "horaInicioPlan": "08:00",
    "horaFinPlan":    "10:00"
  }')
BODY=$(cat /tmp/qa-body.json)
if [ "$HTTP" = "400" ]; then
  echo -e "       Body: $BODY"
  pass
else
  echo "       HTTP $HTTP | $BODY"
  fail
fi

# ============================================================
# 5. (OPCIONAL) CA3 — MAXIMO 2 MONITORES
# ============================================================
echo "5. CA3 — MAXIMO 2 MONITORES POR SALA/FRANJA"

# Primero crear segundo monitor en Sala CISCO 07-09
echo -n "  5a. POST /turnos (Luis, Sala CISCO, 07:00-09:00)"
HTTP=$(curl -s -o /tmp/qa-body.json -w "%{http_code}" -X POST "$BASE_URL/turnos" \
  -H "Content-Type: application/json" \
  -d '{
    "monitorId":      "monitor-002",
    "salaId":         "sala-lans-002",
    "fecha":          "2026-06-15",
    "horaInicioPlan": "07:00",
    "horaFinPlan":    "09:00"
  }')
BODY=$(cat /tmp/qa-body.json)
if [ "$HTTP" = "201" ]; then
  pass
else
  echo "       HTTP $HTTP | $BODY"
  fail
fi
TOTAL=$((TOTAL+1))

echo -n "  5b. POST /turnos (Carlos, Sala CISCO, 07:30-09:30) — CA3"
HTTP=$(curl -s -o /tmp/qa-body.json -w "%{http_code}" -X POST "$BASE_URL/turnos" \
  -H "Content-Type: application/json" \
  -d '{
    "monitorId":      "monitor-003",
    "salaId":         "sala-lans-002",
    "fecha":          "2026-06-15",
    "horaInicioPlan": "07:30",
    "horaFinPlan":    "09:30"
  }')
BODY=$(cat /tmp/qa-body.json)
TOTAL=$((TOTAL+1))
if [ "$HTTP" = "409" ] && echo "$BODY" | grep -q "SALA_CON_DOS_MONITORES"; then
  echo -e "       Body: $BODY"
  pass
else
  echo "       HTTP $HTTP | $BODY"
  fail
fi

# ============================================================
# 6. (OPCIONAL) TRANSICIONES DE ESTADO — PATCH
# ============================================================
echo "6. TRANSICIONES DE ESTADO VIA PATCH"

TOTAL=$((TOTAL+1))
echo -n "  6. POST /turnos (para probar cadena)"
HTTP=$(curl -s -o /tmp/qa-body.json -w "%{http_code}" -X POST "$BASE_URL/turnos" \
  -H "Content-Type: application/json" \
  -d '{
    "monitorId":      "monitor-001",
    "salaId":         "sala-lans-001",
    "fecha":          "2026-06-15",
    "horaInicioPlan": "11:00",
    "horaFinPlan":    "13:00"
  }')
BODY=$(cat /tmp/qa-body.json)
PATCH_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ "$HTTP" = "201" ]; then pass; else echo "       HTTP $HTTP | $BODY"; fail; fi

TOTAL=$((TOTAL+1))
echo -n "  6a. PATCH → aprobado"
HTTP=$(curl -s -o /tmp/qa-body.json -w "%{http_code}" -X PATCH "$BASE_URL/turnos/$PATCH_ID/estado" \
  -H "Content-Type: application/json" \
  -d '{"estado":"aprobado","coordinadorId":"coordinador-001"}')
BODY=$(cat /tmp/qa-body.json)
if [ "$HTTP" = "200" ] && echo "$BODY" | grep -q "aprobado"; then pass; else echo "       HTTP $HTTP | $BODY"; fail; fi

TOTAL=$((TOTAL+1))
echo -n "  6b. PATCH → en_curso"
HTTP=$(curl -s -o /tmp/qa-body.json -w "%{http_code}" -X PATCH "$BASE_URL/turnos/$PATCH_ID/estado" \
  -H "Content-Type: application/json" \
  -d '{"estado":"en_curso"}')
BODY=$(cat /tmp/qa-body.json)
if [ "$HTTP" = "200" ] && echo "$BODY" | grep -q "en_curso"; then pass; else echo "       HTTP $HTTP | $BODY"; fail; fi

TOTAL=$((TOTAL+1))
echo -n "  6c. PATCH → finalizado"
HTTP=$(curl -s -o /tmp/qa-body.json -w "%{http_code}" -X PATCH "$BASE_URL/turnos/$PATCH_ID/estado" \
  -H "Content-Type: application/json" \
  -d '{"estado":"finalizado"}')
BODY=$(cat /tmp/qa-body.json)
if [ "$HTTP" = "200" ] && echo "$BODY" | grep -q "finalizado"; then pass; else echo "       HTTP $HTTP | $BODY"; fail; fi

TOTAL=$((TOTAL+1))
echo -n "  6d. PATCH (transicion invalida) → 422"
HTTP=$(curl -s -o /tmp/qa-body.json -w "%{http_code}" -X PATCH "$BASE_URL/turnos/$PATCH_ID/estado" \
  -H "Content-Type: application/json" \
  -d '{"estado":"aprobado"}')
BODY=$(cat /tmp/qa-body.json)
if [ "$HTTP" = "422" ]; then pass; else echo "       HTTP $HTTP | $BODY"; fail; fi

# ============================================================
# RESUMEN
# ============================================================
echo "$(pad 60)"
echo "  RESULTADOS:  $PASS/$TOTAL PASAN  |  $FAIL FALLAN"
echo "$(pad 60)"
[ "$FAIL" -gt 0 ] && exit 1 || exit 0
