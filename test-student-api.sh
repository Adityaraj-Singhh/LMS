#!/bin/bash

# Login and get token
echo "=== Logging in as dipa@gmail.com ==="
LOGIN_RESPONSE=$(curl -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"dipa@gmail.com","password":"dipa@gmail.com"}' \
  -s)

echo "$LOGIN_RESPONSE" | jq '.'

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "Failed to get token"
  exit 1
fi

echo ""
echo "=== Token obtained ==="
echo "Token: ${TOKEN:0:50}..."

# Get user profile with sections
echo ""
echo "=== Getting user profile with sections ==="
USER_PROFILE=$(curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer $TOKEN" \
  -s)

echo "$USER_PROFILE" | jq '.'

# Extract and show section courses
echo ""
echo "=== Section Courses Details ==="
echo "$USER_PROFILE" | jq '.assignedSections[0].courses'
