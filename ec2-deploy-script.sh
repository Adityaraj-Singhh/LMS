#!/bin/bash

echo "🚀 Deploying SGT-LMS Updates on EC2..."

# Update Frontend Files
echo "📂 Updating frontend files..."
sudo mkdir -p /var/www/html/frontend/src/pages/dean
sudo mkdir -p /var/www/html/frontend/src/components/common

# Copy updated React components
sudo cp /tmp/DeanCourseAnalytics.js /var/www/html/frontend/src/pages/dean/
sudo cp /tmp/StudentIndividualAnalytics.js /var/www/html/frontend/src/components/common/
sudo cp /tmp/DeanSectionAnalytics.js /var/www/html/frontend/src/pages/dean/

echo "✅ React components updated"

# Update package.json and environment
sudo cp /tmp/package.json.frontend /var/www/html/frontend/package.json
sudo cp /tmp/.env.production.local /var/www/html/frontend/

echo "✅ Configuration files updated"

# Rebuild Frontend
echo "🔨 Rebuilding frontend..."
cd /var/www/html/frontend

# Set environment variables for build
export REACT_APP_BACKEND_URL=https://13.233.135.233:5000
export REACT_APP_ENVIRONMENT=production
export REACT_APP_API_BASE_URL=https://13.233.135.233:5000/api

# Install dependencies and build
sudo npm install
if [ $? -ne 0 ]; then
    echo "❌ npm install failed"
    exit 1
fi

sudo REACT_APP_BACKEND_URL=https://13.233.135.233:5000 REACT_APP_ENVIRONMENT=production npm run build
if [ $? -ne 0 ]; then
    echo "❌ Frontend build failed"
    exit 1
fi

echo "✅ Frontend rebuilt successfully"

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

# Stop backend service
sudo systemctl stop sgt-lms-backend
sleep 2

# Start backend service
sudo systemctl start sgt-lms-backend
sleep 3

# Check if backend started successfully
if sudo systemctl is-active --quiet sgt-lms-backend; then
    echo "✅ Backend service restarted successfully"
else
    echo "❌ Backend service failed to start"
    echo "Backend status:"
    sudo systemctl status sgt-lms-backend --no-pager -l
    exit 1
fi

# Reload nginx
sudo systemctl reload nginx
if sudo systemctl is-active --quiet nginx; then
    echo "✅ Nginx reloaded successfully"
else
    echo "❌ Nginx failed to reload"
    sudo systemctl status nginx --no-pager
    exit 1
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
sudo systemctl status sgt-lms-backend --no-pager -l | head -10
echo ""
sudo systemctl status nginx --no-pager | head -5
echo ""
echo "🌐 Test URLs:"
echo "   Frontend: https://13.233.135.233"
echo "   Dean Section Analytics: https://13.233.135.233/dean/section-analytics"
echo "   Dean Student Analytics: https://13.233.135.233/dean/student-analytics"
echo ""
echo "✅ All fixes for React Error #31 and 404 issues should now be active!"