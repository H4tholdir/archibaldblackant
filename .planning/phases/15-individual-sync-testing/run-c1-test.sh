#!/bin/bash

# Test C-1: Product + Price Concurrent Writes
# Manual execution script using curl

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Test C-1: Product + Price Concurrent Write Testing       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if JWT_TOKEN is provided
if [ -z "$JWT_TOKEN" ]; then
  echo "❌ JWT_TOKEN environment variable required"
  echo "   "
  echo "   To get a token, run:"
  echo "   curl -X POST http://localhost:3000/api/auth/login \\"
  echo "        -H 'Content-Type: application/json' \\"
  echo "        -d '{\"username\":\"your-username\",\"password\":\"your-password\"}'"
  echo "   "
  echo "   Then export it:"
  echo "   export JWT_TOKEN='your-jwt-token-here'"
  echo "   "
  echo "   And run this script:"
  echo "   ./run-c1-test.sh"
  exit 1
fi

BASE_URL="http://localhost:3000"

echo "🔐 Testing authentication..."
AUTH_TEST=$(curl -s -H "Authorization: Bearer $JWT_TOKEN" "$BASE_URL/api/sync/status")
if echo "$AUTH_TEST" | grep -q '"success":true'; then
  echo "✅ Authentication successful"
else
  echo "❌ Authentication failed"
  echo "$AUTH_TEST"
  exit 1
fi

echo ""
echo "Running Test C-1: Concurrent Product + Price Sync"
echo "=================================================="
echo ""

# Function to trigger sync and capture start time
trigger_sync() {
  local TYPE=$1
  local START_MS=$(date +%s%3N)

  echo "🚀 Triggering $TYPE sync at $(date +%H:%M:%S.%3N)"

  RESPONSE=$(curl -s -X POST \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    "$BASE_URL/api/sync/manual/$TYPE")

  echo "   Response: $RESPONSE"
  echo "$START_MS"
}

# Run test 3 times
for RUN in 1 2 3; do
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "TEST RUN #$RUN"
  echo "════════════════════════════════════════════════════════════"
  echo ""

  # Trigger both syncs with minimal delay
  PRODUCT_START=$(trigger_sync "products")
  sleep 0.1  # 100ms delay
  PRICE_START=$(trigger_sync "prices")

  TRIGGER_DELAY=$((PRICE_START - PRODUCT_START))
  echo ""
  echo "⏱️  Trigger delay: ${TRIGGER_DELAY}ms"
  echo ""
  echo "⏳ Monitoring sync status (checking every 5 seconds)..."
  echo ""

  # Monitor sync status
  ELAPSED=0
  MAX_WAIT=300  # 5 minutes

  while [ $ELAPSED -lt $MAX_WAIT ]; do
    sleep 5
    ELAPSED=$((ELAPSED + 5))

    STATUS=$(curl -s -H "Authorization: Bearer $JWT_TOKEN" "$BASE_URL/api/sync/status")

    # Extract product and price sync status
    PRODUCT_STATUS=$(echo "$STATUS" | grep -o '"products":{[^}]*}' | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    PRICE_STATUS=$(echo "$STATUS" | grep -o '"prices":{[^}]*}' | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

    echo "   [$ELAPSED s] Products: $PRODUCT_STATUS | Prices: $PRICE_STATUS"

    # Check if both completed
    if [ "$PRODUCT_STATUS" != "syncing" ] && [ "$PRICE_STATUS" != "syncing" ]; then
      echo ""
      echo "✅ Both syncs completed"
      break
    fi
  done

  if [ $ELAPSED -ge $MAX_WAIT ]; then
    echo ""
    echo "⚠️  Timeout: Syncs did not complete within 5 minutes"
  fi

  # Get final status
  echo ""
  echo "📊 Final Status:"
  curl -s -H "Authorization: Bearer $JWT_TOKEN" "$BASE_URL/api/sync/status" | python3 -m json.tool 2>/dev/null || echo "$STATUS"

  # Wait before next run
  if [ $RUN -lt 3 ]; then
    echo ""
    echo "⏸️  Waiting 30 seconds before next test..."
    sleep 30
  fi
done

echo ""
echo "════════════════════════════════════════════════════════════"
echo "TESTS COMPLETE"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "📋 Next steps:"
echo "   1. Check backend logs for errors/warnings"
echo "   2. Verify database consistency"
echo "   3. Document findings in 15-01-TEST-REPORT.md"
echo ""
