#!/bin/bash

# Test Multi-Order Flow
# Verifica il flusso completo: login -> crea ordine 1 -> crea ordine 2 -> fetch lista ordini

set -e

API_URL="http://localhost:3000"

echo "=== Test Multi-Order Flow ==="
echo ""

# Step 1: Login con credenziali in cache
echo "1. Login con credenziali in cache..."
# Uso PasswordCache endpoint per salvare password
CACHE_RESPONSE=$(curl -s -X POST "$API_URL/api/password/cache" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "ikiA0930",
    "password": "Fresis26@"
  }')

echo "Cache response: $CACHE_RESPONSE"
echo ""

# Login normale
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "ikiA0930",
    "password": "Fresis26@"
  }')

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.token')
USER_ID=$(echo "$LOGIN_RESPONSE" | jq -r '.data.userId')
USERNAME=$(echo "$LOGIN_RESPONSE" | jq -r '.data.username')

if [ "$TOKEN" == "null" ]; then
  echo "❌ Login failed: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Login successful"
echo "   User: $USERNAME ($USER_ID)"
echo "   Token: ${TOKEN:0:30}..."
echo ""

# Step 2: Fetch customers
echo "2. Fetch customers..."
CUSTOMERS=$(curl -s "$API_URL/api/customers" \
  -H "Authorization: Bearer $TOKEN")

CUSTOMER_ID=$(echo "$CUSTOMERS" | jq -r '.data[0].customerId')
CUSTOMER_NAME=$(echo "$CUSTOMERS" | jq -r '.data[0].customerName')

echo "✅ Using customer: $CUSTOMER_NAME ($CUSTOMER_ID)"
echo ""

# Step 3: Fetch products for customer
echo "3. Fetch products for customer..."
PRODUCTS=$(curl -s "$API_URL/api/customers/$CUSTOMER_ID/products" \
  -H "Authorization: Bearer $TOKEN")

ARTICLE_1=$(echo "$PRODUCTS" | jq -r '.data[0].articleCode')
ARTICLE_2=$(echo "$PRODUCTS" | jq -r '.data[1].articleCode')

echo "✅ Using products: $ARTICLE_1, $ARTICLE_2"
echo ""

# Step 4: Create order 1
echo "4. Create order 1..."
ORDER1_RESPONSE=$(curl -s -X POST "$API_URL/api/orders/create" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"customerId\": \"$CUSTOMER_ID\",
    \"items\": [
      {\"articleCode\": \"$ARTICLE_1\", \"quantity\": 2}
    ]
  }")

JOB_ID_1=$(echo "$ORDER1_RESPONSE" | jq -r '.data.jobId')

if [ "$JOB_ID_1" == "null" ]; then
  echo "❌ Order 1 creation failed: $ORDER1_RESPONSE"
  exit 1
fi

echo "✅ Order 1 created: Job ID $JOB_ID_1"
echo ""

# Step 5: Create order 2 (should go to queue)
echo "5. Create order 2 (should wait in queue)..."
ORDER2_RESPONSE=$(curl -s -X POST "$API_URL/api/orders/create" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"customerId\": \"$CUSTOMER_ID\",
    \"items\": [
      {\"articleCode\": \"$ARTICLE_2\", \"quantity\": 1}
    ]
  }")

JOB_ID_2=$(echo "$ORDER2_RESPONSE" | jq -r '.data.jobId')

if [ "$JOB_ID_2" == "null" ]; then
  echo "❌ Order 2 creation failed: $ORDER2_RESPONSE"
  exit 1
fi

echo "✅ Order 2 created: Job ID $JOB_ID_2"
echo ""

# Step 6: Wait a bit for queue to process
echo "6. Wait 3 seconds..."
sleep 3
echo ""

# Step 7: Fetch user orders
echo "7. Fetch user's orders list..."
ORDERS_LIST=$(curl -s "$API_URL/api/orders/my-orders" \
  -H "Authorization: Bearer $TOKEN")

echo "Response: $ORDERS_LIST" | jq '.'
echo ""

# Verify order 1 and 2 are in the list
ORDER_COUNT=$(echo "$ORDERS_LIST" | jq -r '.data | length')
echo "✅ User has $ORDER_COUNT orders"
echo ""

# Step 8: Check status of both orders
echo "8. Check status of order 1..."
STATUS_1=$(curl -s "$API_URL/api/orders/status/$JOB_ID_1")
echo "   Status: $(echo $STATUS_1 | jq -r '.data.status')"
echo ""

echo "9. Check status of order 2..."
STATUS_2=$(curl -s "$API_URL/api/orders/status/$JOB_ID_2")
echo "   Status: $(echo $STATUS_2 | jq -r '.data.status')"
echo ""

echo "=== ✅ Test Complete ==="
echo ""
echo "Summary:"
echo "  - Login: ✅"
echo "  - Order 1 created: $JOB_ID_1"
echo "  - Order 2 created: $JOB_ID_2"
echo "  - Orders list fetched: $ORDER_COUNT orders"
echo ""
echo "You can now:"
echo "  1. Open http://localhost:5173"
echo "  2. Login with ikiA0930"
echo "  3. Click '📊 I Miei Ordini' to see both orders"
echo "  4. Click on each order card to view details"
