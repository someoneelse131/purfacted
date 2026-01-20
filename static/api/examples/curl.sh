#!/bin/bash
#
# PurFacted API - cURL Examples
#
# Replace YOUR_API_KEY with your actual API key
# Get your free API key at https://purfacted.com/developers/keys
#

API_KEY="YOUR_API_KEY"
BASE_URL="https://purfacted.com/api/v1"

# ============================================
# Authentication Methods
# ============================================

# Method 1: X-API-Key header (recommended)
curl -X GET "$BASE_URL/facts" \
  -H "X-API-Key: $API_KEY"

# Method 2: Bearer token
curl -X GET "$BASE_URL/facts" \
  -H "Authorization: Bearer $API_KEY"

# Method 3: Query parameter
curl -X GET "$BASE_URL/facts?api_key=$API_KEY"


# ============================================
# Facts API
# ============================================

# Search for facts
curl -X GET "$BASE_URL/facts?q=climate&status=PROVEN&limit=10" \
  -H "X-API-Key: $API_KEY"

# Get a specific fact by ID
curl -X GET "$BASE_URL/facts/FACT_ID_HERE" \
  -H "X-API-Key: $API_KEY"

# Filter facts by category
curl -X GET "$BASE_URL/facts?category=CATEGORY_ID&sort=popular" \
  -H "X-API-Key: $API_KEY"


# ============================================
# Sources API
# ============================================

# List all sources
curl -X GET "$BASE_URL/sources" \
  -H "X-API-Key: $API_KEY"

# Get sources for a specific fact
curl -X GET "$BASE_URL/sources?factId=FACT_ID_HERE" \
  -H "X-API-Key: $API_KEY"

# Filter by source type and minimum credibility
curl -X GET "$BASE_URL/sources?type=PEER_REVIEWED&minCredibility=80" \
  -H "X-API-Key: $API_KEY"

# Get a specific source by ID
curl -X GET "$BASE_URL/sources/SOURCE_ID_HERE" \
  -H "X-API-Key: $API_KEY"


# ============================================
# Categories API
# ============================================

# List all categories
curl -X GET "$BASE_URL/categories" \
  -H "X-API-Key: $API_KEY"

# Search categories
curl -X GET "$BASE_URL/categories?q=science" \
  -H "X-API-Key: $API_KEY"

# Get root-level categories
curl -X GET "$BASE_URL/categories?parent=root" \
  -H "X-API-Key: $API_KEY"

# Get children of a category
curl -X GET "$BASE_URL/categories?parent=CATEGORY_ID" \
  -H "X-API-Key: $API_KEY"

# Get category details
curl -X GET "$BASE_URL/categories/CATEGORY_ID" \
  -H "X-API-Key: $API_KEY"

# Get the full category tree
curl -X GET "$BASE_URL/categories/tree" \
  -H "X-API-Key: $API_KEY"


# ============================================
# Trust API
# ============================================

# Get trust metrics for a single fact
curl -X GET "$BASE_URL/trust/FACT_ID_HERE" \
  -H "X-API-Key: $API_KEY"

# Batch lookup trust metrics for multiple facts
curl -X POST "$BASE_URL/trust/batch" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "factIds": ["fact_id_1", "fact_id_2", "fact_id_3"]
  }'

# Get platform statistics
curl -X GET "$BASE_URL/trust/stats" \
  -H "X-API-Key: $API_KEY"


# ============================================
# Webhooks API
# ============================================

# List your webhooks
curl -X GET "$BASE_URL/webhooks" \
  -H "X-API-Key: $API_KEY"

# Create a webhook
curl -X POST "$BASE_URL/webhooks" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-server.com/webhook",
    "events": ["fact.created", "fact.status_changed", "fact.voted"]
  }'

# Get webhook details and delivery logs
curl -X GET "$BASE_URL/webhooks/WEBHOOK_ID" \
  -H "X-API-Key: $API_KEY"

# Update a webhook
curl -X PATCH "$BASE_URL/webhooks/WEBHOOK_ID" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://new-url.com/webhook",
    "events": ["fact.status_changed"],
    "isActive": true
  }'

# Disable a webhook
curl -X PATCH "$BASE_URL/webhooks/WEBHOOK_ID" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "isActive": false
  }'

# Delete a webhook
curl -X DELETE "$BASE_URL/webhooks/WEBHOOK_ID" \
  -H "X-API-Key: $API_KEY"


# ============================================
# Response Headers
# ============================================

# Check rate limit headers
curl -X GET "$BASE_URL/facts" \
  -H "X-API-Key: $API_KEY" \
  -I

# Example response headers:
# X-RateLimit-Limit: 100
# X-RateLimit-Remaining: 99
# X-RateLimit-Reset: 2024-01-20T00:00:00.000Z


# ============================================
# Webhook Signature Verification (Example in bash)
# ============================================

# When receiving a webhook, verify the signature:
#
# webhook_secret="your_webhook_secret_here"
# payload='{"event":"fact.status_changed","timestamp":"...","data":{...}}'
# received_signature="signature_from_X-Webhook-Signature_header"
#
# expected_signature=$(echo -n "$payload" | openssl dgst -sha256 -hmac "$webhook_secret" | cut -d' ' -f2)
#
# if [ "$expected_signature" == "$received_signature" ]; then
#     echo "Signature valid!"
# else
#     echo "Invalid signature - reject the webhook"
# fi


# ============================================
# Pretty Print JSON (requires jq)
# ============================================

# Search facts with pretty output
curl -s -X GET "$BASE_URL/facts?q=climate&status=PROVEN" \
  -H "X-API-Key: $API_KEY" | jq .

# Get platform stats with pretty output
curl -s -X GET "$BASE_URL/trust/stats" \
  -H "X-API-Key: $API_KEY" | jq '.data.facts'
