#!/bin/bash

# Performance benchmark for products sync (5 iterations)

set -e

ITERATIONS=5
API_URL="${API_URL:-http://localhost:3000}"
ENDPOINT="/api/products/sync"

# Check JWT token
if [ -z "$JWT_TOKEN" ]; then
  echo "❌ Error: JWT_TOKEN environment variable not set"
  echo "Usage: JWT_TOKEN='your-token' ./benchmark-products-sync.sh"
  exit 1
fi

echo "=== Products Sync Performance Benchmark ==="
echo ""
echo "Iterations: $ITERATIONS"
echo "Endpoint: $API_URL$ENDPOINT"
echo ""

declare -a durations
total_duration=0
success_count=0

for i in $(seq 1 $ITERATIONS); do
  echo "Run $i/$ITERATIONS..."

  start=$(date +%s%3N)

  response=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    "$API_URL$ENDPOINT")

  http_code=$(echo "$response" | tail -n 1)
  body=$(echo "$response" | sed '$d')

  end=$(date +%s%3N)
  duration=$((end - start))

  durations+=($duration)
  total_duration=$((total_duration + duration))

  if [ "$http_code" -eq 200 ]; then
    success_count=$((success_count + 1))
    products_processed=$(echo "$body" | jq -r '.productsProcessed // 0')
    new_products=$(echo "$body" | jq -r '.newProducts // 0')
    updated_products=$(echo "$body" | jq -r '.updatedProducts // 0')

    echo "  Duration: ${duration}ms"
    echo "  Success: true"
    echo "  Processed: $products_processed products"
    echo "  New: $new_products, Updated: $updated_products"
  else
    echo "  Duration: ${duration}ms"
    echo "  Success: false (HTTP $http_code)"
    echo "  Error: $body"
  fi

  echo ""
done

# Calculate statistics
avg_duration=$((total_duration / ITERATIONS))
min_duration=${durations[0]}
max_duration=${durations[0]}

for duration in "${durations[@]}"; do
  if [ $duration -lt $min_duration ]; then
    min_duration=$duration
  fi
  if [ $duration -gt $max_duration ]; then
    max_duration=$duration
  fi
done

echo "=== Summary ==="
echo "Successful runs: $success_count/$ITERATIONS"
echo "Average: ${avg_duration}ms"
echo "Min: ${min_duration}ms"
echo "Max: ${max_duration}ms"
echo ""

# Validate target (<60s)
if [ $avg_duration -lt 60000 ]; then
  echo "✅ PASS: Average within target (<60s)"
  exit 0
else
  echo "❌ FAIL: Average exceeds target (${avg_duration}ms > 60000ms)"
  exit 1
fi
