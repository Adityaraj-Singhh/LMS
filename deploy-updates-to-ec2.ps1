# PowerShell script to deploy updated SGT-LMS files to AWS EC2
Write-Host "🚀 Deploying SGT-LMS Updates to AWS EC2..." -ForegroundColor Green

# Configuration
$EC2_IP = "13.233.135.233"
$EC2_USER = "ubuntu"
$KEY_PATH = ".\frontend\sgt-lmskey.pem"  # Using frontend PEM key
$BACKEND_KEY_PATH = ".\backend\sgt-lmskey.pem"  # Backup backend PEM key

# Check if PEM key exists
if (-not (Test-Path $KEY_PATH)) {
    if (Test-Path $BACKEND_KEY_PATH) {
        $KEY_PATH = $BACKEND_KEY_PATH
        Write-Host "Using backend PEM key" -ForegroundColor Yellow
    } else {
        Write-Host "❌ PEM key not found at $KEY_PATH or $BACKEND_KEY_PATH" -ForegroundColor Red
        exit 1
    }
}

Write-Host "🔑 Using PEM key: $KEY_PATH" -ForegroundColor Blue

# Set environment variables for frontend build
$env:REACT_APP_BACKEND_URL = "https://$EC2_IP`:5000"
$env:REACT_APP_ENVIRONMENT = "production"
$env:REACT_APP_API_BASE_URL = "https://$EC2_IP`:5000/api"

Write-Host "📋 Environment variables set:" -ForegroundColor Blue
Write-Host "   REACT_APP_BACKEND_URL: $env:REACT_APP_BACKEND_URL" -ForegroundColor Gray
Write-Host "   REACT_APP_API_BASE_URL: $env:REACT_APP_API_BASE_URL" -ForegroundColor Gray

# Step 1: Build Frontend
Write-Host "`n🔨 Building Frontend..." -ForegroundColor Blue
Set-Location -Path "frontend"

Write-Host "📦 Installing frontend dependencies..." -ForegroundColor Gray
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Frontend npm install failed!" -ForegroundColor Red
    exit 1
}

Write-Host "🏗️ Building production frontend..." -ForegroundColor Gray
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Frontend build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Frontend built successfully!" -ForegroundColor Green

# Create frontend archive
Write-Host "📦 Creating frontend archive..." -ForegroundColor Gray
Set-Location -Path "build"
if (Get-Command "tar" -ErrorAction SilentlyContinue) {
    tar -czf "..\frontend-updated.tar.gz" *
} else {
    Compress-Archive -Path "*" -DestinationPath "..\frontend-updated.zip" -Force
    Write-Host "⚠️ Created ZIP instead of tar.gz (tar not available)" -ForegroundColor Yellow
}
Set-Location -Path ".."
Set-Location -Path ".."

# Step 2: Prepare Backend Files
Write-Host "`n📂 Preparing backend files..." -ForegroundColor Blue
$backendFiles = @(
    "backend\controllers\deanController.js",
    "backend\routes\dean.js",
    "backend\package.json"
)

# Create a temp directory for backend files
New-Item -ItemType Directory -Force -Path "temp-backend-upload" | Out-Null

foreach ($file in $backendFiles) {
    if (Test-Path $file) {
        $fileName = Split-Path $file -Leaf
        $targetDir = "temp-backend-upload\$(Split-Path (Split-Path $file -Parent) -Leaf)"
        New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
        Copy-Item $file "$targetDir\$fileName"
        Write-Host "   Prepared: $file" -ForegroundColor Gray
    }
}

# Create backend archive
Write-Host "📦 Creating backend archive..." -ForegroundColor Gray
Set-Location -Path "temp-backend-upload"
if (Get-Command "tar" -ErrorAction SilentlyContinue) {
    tar -czf "..\backend-updated.tar.gz" *
} else {
    Compress-Archive -Path "*" -DestinationPath "..\backend-updated.zip" -Force
}
Set-Location -Path ".."

# Step 3: Upload Files to EC2
Write-Host "`n📤 Uploading files to EC2..." -ForegroundColor Blue

# Upload frontend
Write-Host "📤 Uploading frontend..." -ForegroundColor Gray
if (Test-Path "frontend\frontend-updated.tar.gz") {
    scp -i $KEY_PATH "frontend\frontend-updated.tar.gz" "${EC2_USER}@${EC2_IP}:/tmp/"
} elseif (Test-Path "frontend\frontend-updated.zip") {
    scp -i $KEY_PATH "frontend\frontend-updated.zip" "${EC2_USER}@${EC2_IP}:/tmp/"
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Frontend upload failed!" -ForegroundColor Red
    exit 1
}

# Upload backend
Write-Host "📤 Uploading backend..." -ForegroundColor Gray
if (Test-Path "backend-updated.tar.gz") {
    scp -i $KEY_PATH "backend-updated.tar.gz" "${EC2_USER}@${EC2_IP}:/tmp/"
} elseif (Test-Path "backend-updated.zip") {
    scp -i $KEY_PATH "backend-updated.zip" "${EC2_USER}@${EC2_IP}:/tmp/"
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Backend upload failed!" -ForegroundColor Red
    exit 1
}

# Upload nginx config
Write-Host "📤 Uploading nginx config..." -ForegroundColor Gray
scp -i $KEY_PATH "nginx-aws-config" "${EC2_USER}@${EC2_IP}:/tmp/"

# Step 4: Deploy on EC2
Write-Host "`n🚀 Deploying on EC2..." -ForegroundColor Blue

$deployScript = @'
#!/bin/bash
echo "🚀 Starting deployment on EC2..."

# Deploy Frontend
echo "📂 Deploying frontend..."
cd /var/www/html

# Backup existing frontend
if [ -d "frontend" ]; then
    sudo mv frontend "frontend_backup_$(date +%Y%m%d_%H%M%S)"
    echo "✅ Backed up existing frontend"
fi

# Extract new frontend
sudo mkdir -p frontend
cd frontend

if [ -f "/tmp/frontend-updated.tar.gz" ]; then
    sudo tar -xzf /tmp/frontend-updated.tar.gz
    echo "✅ Extracted frontend from tar.gz"
elif [ -f "/tmp/frontend-updated.zip" ]; then
    sudo unzip -o /tmp/frontend-updated.zip
    echo "✅ Extracted frontend from zip"
fi

# Set permissions
sudo chown -R www-data:www-data /var/www/html/frontend
sudo chmod -R 755 /var/www/html/frontend
echo "✅ Set frontend permissions"

# Deploy Backend
echo "📂 Deploying backend updates..."
cd /opt/sgt-lms

# Backup existing files
sudo cp controllers/deanController.js "controllers/deanController.js.backup.$(date +%Y%m%d_%H%M%S)"
sudo cp routes/dean.js "routes/dean.js.backup.$(date +%Y%m%d_%H%M%S)"

# Extract backend updates
cd /tmp
if [ -f "backend-updated.tar.gz" ]; then
    tar -xzf backend-updated.tar.gz
    echo "✅ Extracted backend from tar.gz"
elif [ -f "backend-updated.zip" ]; then
    unzip -o backend-updated.zip
    echo "✅ Extracted backend from zip"
fi

# Copy updated files
sudo cp controllers/deanController.js /opt/sgt-lms/controllers/
sudo cp routes/dean.js /opt/sgt-lms/routes/
sudo chown -R sgt-lms:sgt-lms /opt/sgt-lms/
echo "✅ Updated backend files"

# Update Nginx Config
echo "🌐 Updating nginx configuration..."
sudo cp /tmp/nginx-aws-config /etc/nginx/sites-available/sgt-lms
sudo ln -sf /etc/nginx/sites-available/sgt-lms /etc/nginx/sites-enabled/sgt-lms

# Test nginx config
if sudo nginx -t; then
    echo "✅ Nginx configuration is valid"
else
    echo "❌ Nginx configuration has errors"
    exit 1
fi

# Restart Services
echo "🔄 Restarting services..."

# Restart backend
sudo systemctl stop sgt-lms-backend
sleep 2
sudo systemctl start sgt-lms-backend
sleep 3

if sudo systemctl is-active --quiet sgt-lms-backend; then
    echo "✅ Backend restarted successfully"
else
    echo "❌ Backend failed to start"
    sudo systemctl status sgt-lms-backend
fi

# Restart nginx
sudo systemctl reload nginx
if sudo systemctl is-active --quiet nginx; then
    echo "✅ Nginx reloaded successfully"
else
    echo "❌ Nginx failed to reload"
    sudo systemctl status nginx
fi

# Clean up
rm -f /tmp/frontend-updated.*
rm -f /tmp/backend-updated.*
rm -f /tmp/nginx-aws-config
rm -rf /tmp/controllers /tmp/routes

echo "🎉 Deployment completed!"
echo "🌐 Frontend: https://13.233.135.233"
echo "🔧 Backend: https://13.233.135.233:5000"

# Show service status
echo "📊 Service Status:"
sudo systemctl status sgt-lms-backend --no-pager -l
'@

# Save deploy script to temp file and upload
$deployScript | Out-File -FilePath "deploy-script.sh" -Encoding UTF8
scp -i $KEY_PATH "deploy-script.sh" "${EC2_USER}@${EC2_IP}:/tmp/"

# Execute deployment script on EC2
Write-Host "🚀 Executing deployment on EC2..." -ForegroundColor Blue
ssh -i $KEY_PATH "${EC2_USER}@${EC2_IP}" "chmod +x /tmp/deploy-script.sh && sudo /tmp/deploy-script.sh"

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n🎉 Deployment completed successfully!" -ForegroundColor Green
    Write-Host "🌐 Your application is now available at:" -ForegroundColor Blue
    Write-Host "   Frontend: https://$EC2_IP" -ForegroundColor Cyan
    Write-Host "   Backend API: https://$EC2_IP`:5000" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📋 Test these URLs:" -ForegroundColor Yellow
    Write-Host "   🔍 Dean Section Analytics: https://$EC2_IP/dean/section-analytics" -ForegroundColor Gray
    Write-Host "   👥 Dean Student Analytics: https://$EC2_IP/dean/student-analytics" -ForegroundColor Gray
    Write-Host ""
    Write-Host "✅ All fixes should now be active!" -ForegroundColor Green
} else {
    Write-Host "`n❌ Deployment failed! Check the output above for errors." -ForegroundColor Red
}

# Clean up local files
Write-Host "`n🧹 Cleaning up local files..." -ForegroundColor Gray
Remove-Item -Path "temp-backend-upload" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "frontend-updated.*" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "backend-updated.*" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "deploy-script.sh" -Force -ErrorAction SilentlyContinue

Write-Host "🏁 Script completed!" -ForegroundColor Green