#!/bin/bash
# run-scheduled.sh — Lancia lo scanner solo nelle fasce orarie ammesse
# Fasce: 09:00-12:00 e 15:00-18:00 (simula normale utilizzo giornaliero)
# Uso: bash audit-scanner/run-scheduled.sh
# Lascia girare in background, interrompi con Ctrl+C

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAN="$SCRIPT_DIR/scan.js"
LOG="$SCRIPT_DIR/scheduler.log"

log() {
  echo "[$(date '+%H:%M:%S')] $1" | tee -a "$LOG"
}

in_window() {
  local hour=$(date '+%H')
  local min=$(date '+%M')
  local time_mins=$((10#$hour * 60 + 10#$min))
  local w1_start=$((9 * 60))    # 09:00
  local w1_end=$((12 * 60))     # 12:00
  local w2_start=$((15 * 60))   # 15:00
  local w2_end=$((18 * 60))     # 18:00
  [[ $time_mins -ge $w1_start && $time_mins -lt $w1_end ]] ||
  [[ $time_mins -ge $w2_start && $time_mins -lt $w2_end ]]
}

mins_to_next_window() {
  local hour=$(date '+%H')
  local min=$(date '+%M')
  local t=$((10#$hour * 60 + 10#$min))
  if   [[ $t -lt $((9  * 60)) ]]; then echo $(( 9*60 - t ))
  elif [[ $t -lt $((12 * 60)) ]]; then echo 0
  elif [[ $t -lt $((15 * 60)) ]]; then echo $((15*60 - t))
  elif [[ $t -lt $((18 * 60)) ]]; then echo 0
  else echo $(( (9 + 24)*60 - t ))   # domani mattina
  fi
}

log "=== Scanner schedulato avviato ==="
log "Fasce: 09:00-12:00 e 15:00-18:00"

SCANNER_PID=""

while true; do
  if in_window; then
    if [[ -z "$SCANNER_PID" ]] || ! kill -0 "$SCANNER_PID" 2>/dev/null; then
      log "▶ Finestra attiva — avvio scan.js"
      node "$SCAN" >> "$LOG" 2>&1 &
      SCANNER_PID=$!
      log "  PID scanner: $SCANNER_PID"
    fi
    sleep 30  # controlla ogni 30s che lo scanner sia ancora vivo
  else
    # Ferma lo scanner se sta girando
    if [[ -n "$SCANNER_PID" ]] && kill -0 "$SCANNER_PID" 2>/dev/null; then
      log "⏸ Finestra chiusa — fermo scanner (PID $SCANNER_PID)"
      kill "$SCANNER_PID" 2>/dev/null
      wait "$SCANNER_PID" 2>/dev/null
      SCANNER_PID=""
      log "  Scanner fermato. Progresso salvato nel DB."
    fi

    local wait_mins
    wait_mins=$(mins_to_next_window)
    if [[ $wait_mins -eq 0 ]]; then
      sleep 30
    else
      log "⏰ Prossima finestra tra ${wait_mins} minuti — attendo..."
      # Dorme in chunk da 60s per rispondere ai segnali
      for ((i=0; i<wait_mins; i++)); do
        sleep 60
        # Ricontrolla ogni minuto se siamo rientrati in finestra
        in_window && break
      done
    fi
  fi
done
