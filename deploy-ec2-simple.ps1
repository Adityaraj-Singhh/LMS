# SGT-LMS EC2 Deployment Script
param(
    [string]$EC2_HOST = "ec2-65-0-69-254.ap-south-1.compute.amazonaws.com",
    [string]$PEM_FILE = "frontend/sgtlmskey-v2.pem",
    [string]$EC2_USER = "ubuntu"
)

Write-Host "🚀 Starting deployment to EC2..." -ForegroundColor Green

# Check if PEM file exists
if (!(Test-Path $PEM_FILE)) {
    Write-Host "❌ PEM file not found: $PEM_FILE" -ForegroundColor Red
    exit 1
}

# Set proper permissions for PEM file
Write-Host "🔐 Setting PEM file permissions..." -ForegroundColor Blue
icacls $PEM_FILE /inheritance:r /grant:r "$($env:USERNAME):(R)"

# Create directories on EC2
Write-Host "📁 Creating directories on EC2..." -ForegroundColor Blue
ssh -i $PEM_FILE "$EC2_USER@$EC2_HOST" "mkdir -p ~/sgt-lms/backend ~/sgt-lms/frontend ~/sgt-lms/deployment"

# Upload files
Write-Host "📤 Uploading backend files..." -ForegroundColor Blue
scp -i $PEM_FILE -r backend/* "$EC2_USER@${EC2_HOST}:~/sgt-lms/backend/"

Write-Host "📤 Uploading frontend files..." -ForegroundColor Blue  
scp -i $PEM_FILE -r frontend/* "$EC2_USER@${EC2_HOST}:~/sgt-lms/frontend/"

Write-Host "📤 Uploading deployment files..." -ForegroundColor Blue
scp -i $PEM_FILE -r deployment/* "$EC2_USER@${EC2_HOST}:~/sgt-lms/deployment/"

Write-Host "📤 Uploading project configuration..." -ForegroundColor Blue
scp -i $PEM_FILE package.json "$EC2_USER@${EC2_HOST}:~/sgt-lms/"

# Create setup script content
$SetupScript = @'
#!/bin/bash
set -e

echo "🔄 Updating system..."
sudo apt-get update -y

echo "📦 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential

echo "📋 Installing PM2..."
sudo npm install -g pm2

echo "🌐 Installing nginx..."
sudo apt-get install -y nginx

# Update environment files for production
echo "⚙️ Updating backend .env..."
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
FRONTEND_URL=http://ec2-65-0-69-254.ap-south-1.compute.amazonaws.com
NODE_ENV=production
BIND_IP=0.0.0.0
EXTERNAL_IP=ec2-65-0-69-254.ap-south-1.compute.amazonaws.com
BUNNY_STREAM_API_KEY=\${BUNNY_STREAM_API_KEY}
BUNNY_LIBRARY_ID=567095
BUNNY_CDN_HOSTNAME=vz-6b31636e-f82.b-cdn.net
BUNNY_STORAGE_API_KEY=\${BUNNY_STORAGE_API_KEY}
BUNNY_STORAGE_ZONE=lms-document-storage
BUNNY_STORAGE_HOSTNAME=storage.bunnycdn.com
EOF

echo "⚙️ Updating frontend .env..."
cat > ~/sgt-lms/frontend/.env << 'EOF'
DISABLE_ESLINT_PLUGIN=true
REACT_APP_API_URL=http://ec2-65-0-69-254.ap-south-1.compute.amazonaws.com/api
REACT_APP_BACKEND_URL=http://ec2-65-0-69-254.ap-south-1.compute.amazonaws.com
REACT_APP_SOCKET_URL=http://ec2-65-0-69-254.ap-south-1.compute.amazonaws.com
HOST=0.0.0.0
PORT=3000
CHOKIDAR_USEPOLLING=false
FAST_REFRESH=false
EOF

echo "🏗️ Installing backend dependencies..."
cd ~/sgt-lms/backend
npm install --production

echo "🎨 Installing frontend dependencies..."
cd ~/sgt-lms/frontend
npm install

echo "🔨 Building frontend..."
npm run build

echo "⚙️ Configuring nginx..."
sudo tee /etc/nginx/sites-available/sgt-lms > /dev/null << 'NGINX_EOF'
server {
    listen 80;
    server_name _;

    location / {
        root /home/ubuntu/sgt-lms/frontend/build;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io/ {
        proxy_pass http://localhost:5000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX_EOF

sudo ln -sf /etc/nginx/sites-available/sgt-lms /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx

echo "🚀 Starting backend..."
cd ~/sgt-lms/backend
pm2 start server.js --name sgt-lms-backend --env production

pm2 save
pm2 startup ubuntu | sudo bash

echo "✅ Deployment completed!"
echo "Frontend: http://ec2-65-0-69-254.ap-south-1.compute.amazonaws.com"
echo "API: http://ec2-65-0-69-254.ap-south-1.compute.amazonaws.com/api"

pm2 status
'@

# Upload and execute setup script
Write-Host "📤 Uploading setup script..." -ForegroundColor Blue
$SetupScript | ssh -i $PEM_FILE "$EC2_USER@$EC2_HOST" "cat > setup.sh"

ssh -i $PEM_FILE "$EC2_USER@$EC2_HOST" "chmod +x setup.sh"

Write-Host "🏗️ Executing setup on EC2..." -ForegroundColor Blue
ssh -i $PEM_FILE "$EC2_USER@$EC2_HOST" "./setup.sh"

Write-Host ""
Write-Host "🎉 Deployment completed!" -ForegroundColor Green
Write-Host "🌐 Frontend: http://$EC2_HOST" -ForegroundColor Yellow
Write-Host "🔌 API: http://$EC2_HOST/api" -ForegroundColor Yellow