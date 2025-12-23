#!/bin/bash

echo "🚀 Deploying SGT-LMS Updates on EC2..."

# Find the correct frontend source path
FRONTEND_SOURCE="/var/www/sgt-lms/frontend"
FRONTEND_BUILD="/var/www/html"

if [ ! -d "$FRONTEND_SOURCE" ]; then
    echo "❌ Frontend source directory not found at $FRONTEND_SOURCE"
    exit 1
fi

# Update Frontend Source Files
echo "📂 Updating frontend source files..."
sudo mkdir -p $FRONTEND_SOURCE/src/pages/dean
sudo mkdir -p $FRONTEND_SOURCE/src/components/common

# Copy updated React components to source
sudo cp /tmp/DeanCourseAnalytics.js $FRONTEND_SOURCE/src/pages/dean/
sudo cp /tmp/StudentIndividualAnalytics.js $FRONTEND_SOURCE/src/components/common/
sudo cp /tmp/DeanSectionAnalytics.js $FRONTEND_SOURCE/src/pages/dean/

echo "✅ React components updated in source"

# Update package.json and environment
sudo cp /tmp/package.json.frontend $FRONTEND_SOURCE/package.json
sudo cp /tmp/.env.production.local $FRONTEND_SOURCE/

echo "✅ Configuration files updated in source"

# Rebuild Frontend
echo "🔨 Rebuilding frontend..."
cd $FRONTEND_SOURCE

# Set environment variables for build
export REACT_APP_BACKEND_URL=https://13.233.135.233:5000
export REACT_APP_ENVIRONMENT=production
export REACT_APP_API_BASE_URL=https://13.233.135.233:5000/api

echo "🔧 Environment variables set for build"

# Install dependencies (skip if already installed recently)
echo "📦 Installing dependencies..."
sudo npm install --production=false
if [ $? -ne 0 ]; then
    echo "❌ npm install failed"
    exit 1
fi

# Build the frontend
echo "🏗️ Building frontend..."
sudo REACT_APP_BACKEND_URL=https://13.233.135.233:5000 REACT_APP_ENVIRONMENT=production REACT_APP_API_BASE_URL=https://13.233.135.233:5000/api npm run build
if [ $? -ne 0 ]; then
    echo "❌ Frontend build failed"
    exit 1
fi

# Copy build files to web directory
echo "📁 Deploying build files..."
sudo cp -r build/* $FRONTEND_BUILD/
sudo chown -R www-data:www-data $FRONTEND_BUILD/
sudo chmod -R 755 $FRONTEND_BUILD/

echo "✅ Frontend built and deployed successfully"

# Update nginx configuration
echo "🌐 Updating nginx configuration..."
sudo cp /tmp/nginx-aws-config /etc/nginx/sites-available/sgt-lms
sudo ln -sf /etc/nginx/sites-available/sgt-lms /etc/nginx/sites-enabled/

# Test nginx configuration
sudo nginx -t
if [ $? -ne 0 ]; then
    echo "❌ Nginx configuration test failed"
    exit 1
fi

echo "✅ Nginx configuration updated"

# Restart services
echo "🔄 Restarting services..."

# Find backend service name
BACKEND_SERVICE="sgt-lms-backend"
if ! sudo systemctl list-units --type=service | grep -q $BACKEND_SERVICE; then
    # Try alternative names
    if sudo systemctl list-units --type=service | grep -q "sgt-lms"; then
        BACKEND_SERVICE="sgt-lms"
    elif sudo systemctl list-units --type=service | grep -q "backend"; then
        BACKEND_SERVICE="backend"
    else
        echo "⚠️ Backend service not found, trying pm2..."
        if command -v pm2 >/dev/null 2>&1; then
            sudo pm2 restart all
            echo "✅ PM2 services restarted"
        else
            echo "❌ No backend service manager found"
        fi
    fi
fi

if [ -n "$BACKEND_SERVICE" ]; then
    # Stop backend service
    sudo systemctl stop $BACKEND_SERVICE
    sleep 2

    # Start backend service
    sudo systemctl start $BACKEND_SERVICE
    sleep 3

    # Check if backend started successfully
    if sudo systemctl is-active --quiet $BACKEND_SERVICE; then
        echo "✅ Backend service ($BACKEND_SERVICE) restarted successfully"
    else
        echo "❌ Backend service failed to start"
        echo "Backend status:"
        sudo systemctl status $BACKEND_SERVICE --no-pager -l
    fi
fi

# Reload nginx
sudo systemctl reload nginx
if sudo systemctl is-active --quiet nginx; then
    echo "✅ Nginx reloaded successfully"
else
    echo "❌ Nginx failed to reload"
    sudo systemctl status nginx --no-pager
fi

# Clean up temporary files
echo "🧹 Cleaning up..."
rm -f /tmp/DeanCourseAnalytics.js
rm -f /tmp/StudentIndividualAnalytics.js
rm -f /tmp/DeanSectionAnalytics.js
rm -f /tmp/package.json.frontend
rm -f /tmp/.env.production.local
rm -f /tmp/nginx-aws-config

echo "🎉 Deployment completed successfully!"
echo ""
echo "📊 Service Status:"
if [ -n "$BACKEND_SERVICE" ]; then
    sudo systemctl status $BACKEND_SERVICE --no-pager -l | head -10
else
    echo "Backend service status unknown - check pm2 if using pm2"
fi
echo ""
sudo systemctl status nginx --no-pager | head -5
echo ""
echo "🌐 Test URLs:"
echo "   Frontend: https://13.233.135.233"
echo "   Dean Section Analytics: https://13.233.135.233/dean/section-analytics"
echo "   Dean Student Analytics: https://13.233.135.233/dean/student-analytics"
echo ""
echo "✅ All fixes for React Error #31 and 404 issues should now be active!"