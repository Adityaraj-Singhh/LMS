# SGT-LMS EC2 Deployment Script
# This script uploads files to EC2 and sets up the application

param(
    [string]$EC2_HOST = "ec2-65-0-69-254.ap-south-1.compute.amazonaws.com",
    [string]$PEM_FILE = "frontend/sgtlmskey-v2.pem",
    [string]$EC2_USER = "ubuntu"
)

Write-Host "🚀 Starting deployment to EC2..." -ForegroundColor Green
Write-Host "EC2 Host: $EC2_HOST" -ForegroundColor Yellow
Write-Host "PEM File: $PEM_FILE" -ForegroundColor Yellow

# Check if PEM file exists
if (!(Test-Path $PEM_FILE)) {
    Write-Host "❌ PEM file not found: $PEM_FILE" -ForegroundColor Red
    exit 1
}

# Set proper permissions for PEM file (Windows equivalent)
Write-Host "🔐 Setting PEM file permissions..." -ForegroundColor Blue
icacls $PEM_FILE /inheritance:r /grant:r "$($env:USERNAME):(R)"

# Create deployment directory structure on EC2
Write-Host "📁 Creating directories on EC2..." -ForegroundColor Blue
ssh -i $PEM_FILE $EC2_USER@$EC2_HOST "mkdir -p ~/sgt-lms/backend ~/sgt-lms/frontend ~/sgt-lms/deployment"

# Upload backend files
Write-Host "📤 Uploading backend files..." -ForegroundColor Blue
scp -i $PEM_FILE -r backend/* $EC2_USER@${EC2_HOST}:~/sgt-lms/backend/

# Upload frontend files  
Write-Host "📤 Uploading frontend files..." -ForegroundColor Blue
scp -i $PEM_FILE -r frontend/* $EC2_USER@${EC2_HOST}:~/sgt-lms/frontend/

# Upload deployment configuration
Write-Host "📤 Uploading deployment files..." -ForegroundColor Blue
scp -i $PEM_FILE -r deployment/* $EC2_USER@${EC2_HOST}:~/sgt-lms/deployment/

# Upload root package.json and other config files
Write-Host "📤 Uploading project configuration..." -ForegroundColor Blue
scp -i $PEM_FILE package.json $EC2_USER@${EC2_HOST}:~/sgt-lms/

# Create production environment files on EC2
Write-Host "⚙️ Creating production environment files..." -ForegroundColor Blue
ssh -i $PEM_FILE $EC2_USER@$EC2_HOST @"
# Create backend .env for production
cat > ~/sgt-lms/backend/.env << 'EOF'
HTTPS_ENABLED=false
MONGO_URI=mongodb+srv://dipanwitakundu02_db_user:qItA3GEvqVBiGaYJ@cluster0.ak3b8nt.mongodb.net/
JWT_SECRET=433b9575beb088a0492ad3a35056be0a6d26c63caa474c69483f46def6fdb0eb
ADMIN_EMAIL=sourav11092002@gmail.com
ADMIN_PASSWORD=Admin@1234
ADMIN_NAME=Admin
EMAIL_USER=sourav11092002@gmail.com
EMAIL_PASS=qtlo jxee ssvo cnsf

PORT=5000
HOST=0.0.0.0

# Frontend URL for CORS
FRONTEND_URL=http://$EC2_HOST:3000

# Node Environment
NODE_ENV=production

# Network Configuration
BIND_IP=0.0.0.0
EXTERNAL_IP=$EC2_HOST
AWS_ACCESS_KEY=\${AWS_ACCESS_KEY_ID}
AWS_SECRET_KEY=\${AWS_SECRET_ACCESS_KEY}
AWS_REGION=ap-south-1
AWS_BUCKET=newtest-lms
EOF

# Create frontend .env for production
cat > ~/sgt-lms/frontend/.env << 'EOF'
DISABLE_ESLINT_PLUGIN=true
REACT_APP_API_URL=http://$EC2_HOST:5000/api
REACT_APP_BACKEND_URL=http://$EC2_HOST:5000
REACT_APP_SOCKET_URL=http://$EC2_HOST:5000
HOST=0.0.0.0
PORT=3000
CHOKIDAR_USEPOLLING=false
FAST_REFRESH=false
AWS_ACCESS_KEY=\${AWS_ACCESS_KEY_ID}
AWS_SECRET_KEY=\${AWS_SECRET_ACCESS_KEY}
AWS_REGION=ap-south-1
AWS_BUCKET=newtest-lms
EOF
"@

Write-Host "🏗️ Setting up EC2 environment..." -ForegroundColor Blue

# Setup script to run on EC2
$SETUP_SCRIPT = @"
#!/bin/bash
set -e

echo "🔄 Updating system packages..."
sudo apt-get update -y

echo "📦 Installing Node.js 18.x..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "🔧 Installing build tools..."
sudo apt-get install -y build-essential

echo "📋 Installing PM2 globally..."
sudo npm install -g pm2

echo "🏗️ Installing backend dependencies..."
cd ~/sgt-lms/backend
npm install --production

echo "🎨 Installing frontend dependencies..."
cd ~/sgt-lms/frontend
npm install

echo "🔨 Building frontend for production..."
npm run build

echo "🌐 Installing nginx..."
sudo apt-get install -y nginx

echo "⚙️ Configuring nginx..."
sudo tee /etc/nginx/sites-available/sgt-lms > /dev/null << 'NGINX_EOF'
server {
    listen 80;
    server_name $EC2_HOST;

    # Frontend (React build)
    location / {
        root /home/ubuntu/sgt-lms/frontend/build;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:5000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX_EOF

# Enable the site
sudo ln -sf /etc/nginx/sites-available/sgt-lms /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
sudo nginx -t

# Start services
echo "🚀 Starting backend with PM2..."
cd ~/sgt-lms/backend
pm2 start server.js --name sgt-lms-backend --env production

echo "🌐 Starting nginx..."
sudo systemctl restart nginx
sudo systemctl enable nginx

echo "💾 Saving PM2 configuration..."
pm2 save
pm2 startup | sudo bash

echo "✅ Deployment completed successfully!"
echo "🌐 Frontend accessible at: http://$EC2_HOST"
echo "🔌 Backend API at: http://$EC2_HOST/api"
echo ""
echo "📊 Service status:"
pm2 status
sudo systemctl status nginx --no-pager -l

echo ""
echo "📝 Useful commands:"
echo "  View backend logs: pm2 logs sgt-lms-backend"
echo "  Restart backend: pm2 restart sgt-lms-backend"
echo "  View nginx logs: sudo tail -f /var/log/nginx/access.log"
echo "  Restart nginx: sudo systemctl restart nginx"
"@

# Upload and execute setup script
Write-Host "📤 Uploading setup script..." -ForegroundColor Blue
$SETUP_SCRIPT | ssh -i $PEM_FILE "$EC2_USER@$EC2_HOST" "cat > setup.sh; chmod +x setup.sh"

Write-Host "🏗️ Executing setup script on EC2..." -ForegroundColor Blue
ssh -i $PEM_FILE "$EC2_USER@$EC2_HOST" "./setup.sh"

Write-Host ""
Write-Host "🎉 Deployment completed!" -ForegroundColor Green
Write-Host "🌐 Your application should be accessible at: http://$EC2_HOST" -ForegroundColor Yellow
Write-Host "🔌 API endpoints available at: http://$EC2_HOST/api" -ForegroundColor Yellow
Write-Host ""
Write-Host "📝 To monitor your application:" -ForegroundColor Cyan
Write-Host "  ssh -i $PEM_FILE $EC2_USER@$EC2_HOST" -ForegroundColor White
Write-Host "  pm2 status" -ForegroundColor White
Write-Host "  pm2 logs sgt-lms-backend" -ForegroundColor White
Write-Host "  sudo systemctl status nginx" -ForegroundColor White