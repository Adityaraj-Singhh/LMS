#!/bin/bash
# Force refresh deployment script for SGT LMS frontend

echo "🔄 Force refreshing SGT LMS frontend..."

# Remove old build
sudo rm -rf /home/ubuntu/sgt-lms/frontend/build/*

# Copy latest build
sudo cp -r /var/www/html/* /home/ubuntu/sgt-lms/frontend/build/

# Set proper permissions
sudo chown -R www-data:www-data /home/ubuntu/sgt-lms/frontend/build/

# Restart nginx completely
sudo systemctl stop nginx
sleep 2
sudo systemctl start nginx

# Check status
sudo systemctl status nginx --no-pager -l | head -10

echo "✅ Frontend refresh completed!"
echo "🌐 Application URL: http://ec2-65-0-69-254.ap-south-1.compute.amazonaws.com"
echo "⚠️  Please clear your browser cache (Ctrl+F5) and try again"