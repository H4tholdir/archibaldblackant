#!/bin/bash
# Benchmark customer sync performance

echo "=== Customer Sync Performance Benchmark ==="
echo ""

# Check if JWT token is available
if [ -z "$JWT_TOKEN" ]; then
  echo "❌ JWT_TOKEN environment variable not set"
  echo "Please login first and export JWT_TOKEN"
  echo "Example: export JWT_TOKEN='your-jwt-token-here'"
  exit 1
fi

# Run 5 sync iterations and measure
for i in {1..5}; do
  echo "Run $i/5..."

  START=$(date +%s%3N)

  curl -s -X POST http://localhost:3000/api/customers/sync \
    -H "Authorization: Bearer $JWT_TOKEN" \
    > /tmp/sync-result-$i.json

  END=$(date +%s%3N)
  DURATION=$((END - START))

  SUCCESS=$(jq -r '.success' /tmp/sync-result-$i.json 2>/dev/null || echo "false")

  if [ "$SUCCESS" = "true" ]; then
    PROCESSED=$(jq -r '.customersProcessed' /tmp/sync-result-$i.json)
    NEW=$(jq -r '.newCustomers' /tmp/sync-result-$i.json)
    UPDATED=$(jq -r '.updatedCustomers' /tmp/sync-result-$i.json)

    echo "  Duration: ${DURATION}ms"
    echo "  Success: $SUCCESS"
    echo "  Processed: $PROCESSED customers"
    echo "  New: $NEW, Updated: $UPDATED"
  else
    ERROR=$(jq -r '.message // .error' /tmp/sync-result-$i.json 2>/dev/null || echo "Unknown error")
    echo "  Duration: ${DURATION}ms"
    echo "  Success: $SUCCESS"
    echo "  Error: $ERROR"
  fi

  echo ""

  # Wait 2s between runs
  sleep 2
done

# Calculate statistics
echo "=== Summary ==="

# Extract durations from result files
DURATIONS=""
SUCCESSFUL_RUNS=0

for i in {1..5}; do
  SUCCESS=$(jq -r '.success' /tmp/sync-result-$i.json 2>/dev/null || echo "false")

  if [ "$SUCCESS" = "true" ]; then
    DUR=$(jq -r '.duration' /tmp/sync-result-$i.json)
    if [ -n "$DURATIONS" ]; then
      DURATIONS="$DURATIONS,$DUR"
    else
      DURATIONS="$DUR"
    fi
    SUCCESSFUL_RUNS=$((SUCCESSFUL_RUNS + 1))
  fi
done

if [ $SUCCESSFUL_RUNS -eq 0 ]; then
  echo "❌ No successful syncs to analyze"
  rm /tmp/sync-result-*.json 2>/dev/null
  exit 1
fi

# Calculate avg, min, max
AVG=$(echo $DURATIONS | awk -F',' '{sum=0; for(i=1;i<=NF;i++) sum+=$i; print sum/NF}')
MIN=$(echo $DURATIONS | awk -F',' '{min=$1; for(i=2;i<=NF;i++) if($i<min) min=$i; print min}')
MAX=$(echo $DURATIONS | awk -F',' '{max=$1; for(i=2;i<=NF;i++) if($i>max) max=$i; print max}')

echo "Successful runs: $SUCCESSFUL_RUNS/5"
echo "Average: ${AVG}ms"
echo "Min: ${MIN}ms"
echo "Max: ${MAX}ms"
echo ""

# Validate against target (15-20s = 15000-20000ms)
if [ $(echo "$AVG < 20000" | bc -l) -eq 1 ]; then
  echo "✅ PASS: Average within target (< 20s)"
else
  echo "❌ FAIL: Average exceeds target (> 20s)"
fi

# Cleanup
rm /tmp/sync-result-*.json 2>/dev/null
