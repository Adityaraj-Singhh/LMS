#!/bin/bash
# Setup environment files on EC2 for Bunny Stream LMS

echo "======================================"
echo "Setting up LMS Environment Files"
echo "======================================"
echo ""

# Backend .env
cat > backend/.env << 'EOF'
# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/lms_db

# JWT Secret (change this to a secure random string)
JWT_SECRET=your-secure-jwt-secret-change-this

# Server Configuration
PORT=5000
NODE_ENV=production

# Bunny Stream Configuration (Video CDN)
BUNNY_STREAM_API_KEY=e8bb584d-2f33-4e3f-ac5c52298c8e-4089-4fd6
BUNNY_LIBRARY_ID=567095
BUNNY_CDN_HOSTNAME=vz-6b31636e-f82.b-cdn.net
BUNNY_MAX_RESOLUTION=720
BUNNY_DEFAULT_QUALITY=360

# Redis Configuration (optional - for caching)
REDIS_HOST=localhost
REDIS_PORT=6379

# Email Configuration (optional - for notifications)
# EMAIL_SERVICE=gmail
# EMAIL_USER=your-email@gmail.com
# EMAIL_PASSWORD=your-app-password

# CORS Origin (your frontend URL)
CORS_ORIGIN=http://localhost:3000
EOF

echo "✓ Created backend/.env"

# Frontend .env.production
cat > frontend/.env.production << 'EOF'
# API Configuration
REACT_APP_API_URL=http://localhost:5000

# Other frontend configurations
REACT_APP_NAME=SGT LMS with Bunny Stream
EOF

echo "✓ Created frontend/.env.production"
echo ""
echo "======================================"
echo "Environment files created!"
echo "======================================"
echo ""
echo "IMPORTANT: Please update the following:"
echo "1. Backend JWT_SECRET - Use a secure random string"
echo "2. Backend MONGODB_URI - Update if using remote MongoDB"
echo "3. Frontend REACT_APP_API_URL - Update with your EC2 public IP"
echo "4. Backend CORS_ORIGIN - Update with your frontend URL"
echo ""
echo "To edit:"
echo "  nano backend/.env"
echo "  nano frontend/.env.production"
echo ""
