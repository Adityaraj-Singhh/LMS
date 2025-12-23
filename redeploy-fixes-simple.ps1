# SGT-LMS Re-deployment Script with Fixes
param(
    [string]$EC2_HOST = "ec2-65-0-69-254.ap-south-1.compute.amazonaws.com",
    [string]$PEM_FILE = "frontend/sgtlmskey-v2.pem",
    [string]$EC2_USER = "ubuntu"
)

Write-Host "🚀 Re-deploying SGT-LMS with fixes..." -ForegroundColor Green

# Check if PEM file exists
if (!(Test-Path $PEM_FILE)) {
    Write-Host "❌ PEM file not found: $PEM_FILE" -ForegroundColor Red
    exit 1
}

# Set proper permissions for PEM file
Write-Host "🔐 Setting PEM file permissions..." -ForegroundColor Blue
icacls $PEM_FILE /inheritance:r /grant:r "$($env:USERNAME):(R)"

# Upload updated files
Write-Host "📤 Uploading updated backend files..." -ForegroundColor Blue
scp -i $PEM_FILE backend/.env "$EC2_USER@${EC2_HOST}:~/sgt-lms/backend/"
scp -i $PEM_FILE backend/server.js "$EC2_USER@${EC2_HOST}:~/sgt-lms/backend/"

Write-Host "📤 Uploading updated frontend files..." -ForegroundColor Blue  
scp -i $PEM_FILE frontend/.env "$EC2_USER@${EC2_HOST}:~/sgt-lms/frontend/"
scp -i $PEM_FILE -r frontend/src/utils "$EC2_USER@${EC2_HOST}:~/sgt-lms/frontend/src/"

Write-Host "🔄 Stopping backend service..." -ForegroundColor Blue
ssh -i $PEM_FILE "$EC2_USER@$EC2_HOST" "pm2 stop sgt-lms-backend"

Write-Host "🔨 Rebuilding frontend..." -ForegroundColor Blue
ssh -i $PEM_FILE "$EC2_USER@$EC2_HOST" "cd ~/sgt-lms/frontend && npm run build"

Write-Host "🚀 Restarting backend service..." -ForegroundColor Blue
ssh -i $PEM_FILE "$EC2_USER@$EC2_HOST" "cd ~/sgt-lms/backend && pm2 restart sgt-lms-backend"

Write-Host "🌐 Restarting nginx..." -ForegroundColor Blue
ssh -i $PEM_FILE "$EC2_USER@$EC2_HOST" "sudo systemctl restart nginx"

Write-Host "📊 Checking service status..." -ForegroundColor Blue
ssh -i $PEM_FILE "$EC2_USER@$EC2_HOST" "pm2 status"

Write-Host "🔍 Testing API connectivity..." -ForegroundColor Blue
ssh -i $PEM_FILE "$EC2_USER@$EC2_HOST" "curl -s http://localhost:5000/api/db-status"

Write-Host ""
Write-Host "🎉 Re-deployment completed!" -ForegroundColor Green
Write-Host "🌐 Test your application at: http://$EC2_HOST" -ForegroundColor Yellow
Write-Host "🔌 Test API at: http://$EC2_HOST/api/db-status" -ForegroundColor Yellow

Write-Host ""
Write-Host "🔧 Quick Tests:" -ForegroundColor Cyan
Write-Host "1. Visit: http://$EC2_HOST" -ForegroundColor White
Write-Host "2. Check API: http://$EC2_HOST/api/db-status" -ForegroundColor White
Write-Host "3. Test Login functionality" -ForegroundColor White
Write-Host "4. Test file uploads to S3" -ForegroundColor White