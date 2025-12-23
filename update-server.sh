#!/bin/bash

echo "Updating SGT LMS server with security features..."

# Navigate to backend
cd /home/ubuntu/sgt-lms/backend

# Stop PM2 processes
pm2 stop all

# Add security route to server.js if not already present
if ! grep -q "app.use('/api/security'" server.js; then
    echo "Adding security route to server.js..."
    sed -i '/app\.use.*\/api\/students/a app.use("/api/security", require("./routes/security"));' server.js
fi

# Restart PM2 processes
pm2 start all

# Navigate to frontend and serve build
cd /home/ubuntu/sgt-lms/frontend

# Restart nginx to serve new build
sudo systemctl restart nginx

echo "Server updated successfully with security features!"
echo "Build files deployed and services restarted."