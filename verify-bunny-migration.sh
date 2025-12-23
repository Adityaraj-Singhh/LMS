#!/bin/bash
# Verify Bunny Stream Migration - No S3 References

echo "======================================"
echo "Bunny Stream Migration Verification"
echo "======================================"
echo ""

REMOTE_DIR="/home/ubuntu/lms-bunny"

echo "Checking for S3 references in backend..."
echo "=========================================="

S3_BACKEND=$(grep -r "aws-sdk\|multer-s3\|AWS\.S3\|s3\.upload\|s3\.getSignedUrl" $REMOTE_DIR/backend \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude="*.log" \
    --exclude="*.md" 2>/dev/null)

if [ -z "$S3_BACKEND" ]; then
    echo "✓ No S3 references found in backend code"
else
    echo "⚠ Found S3 references in backend:"
    echo "$S3_BACKEND"
fi

echo ""
echo "Checking for S3 references in frontend..."
echo "=========================================="

S3_FRONTEND=$(grep -r "aws-sdk\|multer-s3\|AWS\.S3" $REMOTE_DIR/frontend/src \
    --exclude-dir=node_modules \
    --exclude-dir=build \
    --exclude-dir=.git 2>/dev/null)

if [ -z "$S3_FRONTEND" ]; then
    echo "✓ No S3 references found in frontend code"
else
    echo "⚠ Found S3 references in frontend:"
    echo "$S3_FRONTEND"
fi

echo ""
echo "Checking backend package.json..."
echo "================================="

if grep -q "aws-sdk\|multer-s3" $REMOTE_DIR/backend/package.json; then
    echo "⚠ Found S3 dependencies in backend package.json"
    grep "aws-sdk\|multer-s3" $REMOTE_DIR/backend/package.json
else
    echo "✓ No S3 dependencies in backend package.json"
fi

echo ""
echo "Verifying Bunny Stream configuration..."
echo "========================================"

if [ -f "$REMOTE_DIR/backend/.env" ]; then
    if grep -q "BUNNY_STREAM_API_KEY\|BUNNY_LIBRARY_ID\|BUNNY_CDN_HOSTNAME" $REMOTE_DIR/backend/.env; then
        echo "✓ Bunny Stream configuration found in .env"
        echo "  Library ID: $(grep BUNNY_LIBRARY_ID $REMOTE_DIR/backend/.env | cut -d= -f2)"
        echo "  CDN Hostname: $(grep BUNNY_CDN_HOSTNAME $REMOTE_DIR/backend/.env | cut -d= -f2)"
        echo "  Max Resolution: $(grep BUNNY_MAX_RESOLUTION $REMOTE_DIR/backend/.env | cut -d= -f2)"
        echo "  Default Quality: $(grep BUNNY_DEFAULT_QUALITY $REMOTE_DIR/backend/.env | cut -d= -f2)"
    else
        echo "⚠ Bunny Stream configuration NOT found in .env"
    fi
else
    echo "⚠ Backend .env file not found"
fi

echo ""
echo "Checking frontend package.json for hls.js..."
echo "=============================================="

if grep -q "hls.js" $REMOTE_DIR/frontend/package.json; then
    echo "✓ hls.js dependency found in frontend"
    grep "hls.js" $REMOTE_DIR/frontend/package.json
else
    echo "⚠ hls.js dependency NOT found in frontend package.json"
fi

echo ""
echo "Checking Bunny Stream service file..."
echo "======================================"

if [ -f "$REMOTE_DIR/backend/services/bunnyStreamService.js" ]; then
    echo "✓ bunnyStreamService.js exists"
    echo "  Functions:"
    grep "exports\." $REMOTE_DIR/backend/services/bunnyStreamService.js | cut -d= -f1 | sed 's/^/    - /'
else
    echo "⚠ bunnyStreamService.js NOT found"
fi

echo ""
echo "======================================"
echo "Verification Complete!"
echo "======================================"
echo ""
