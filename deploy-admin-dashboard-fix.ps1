# Deploy Admin Dashboard Statistics Fix to EC2
# This script fixes the hardcoded values in AdminDashboard.js

$ErrorActionPreference = "Stop"

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Admin Dashboard Statistics Fix Deploy" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$EC2_HOST = "ubuntu@ec2-65-0-56-84.ap-south-1.compute.amazonaws.com"
$KEY_PATH = ".\frontend\sgtlmskey-v2.pem"
$REMOTE_DIR = "/var/www/sgt-lms/frontend"
$LOCAL_FILE = ".\frontend\src\pages\AdminDashboard.js"

# Check if key file exists
if (-not (Test-Path $KEY_PATH)) {
    Write-Host "❌ Error: SSH key not found at $KEY_PATH" -ForegroundColor Red
    exit 1
}

# Check if AdminDashboard.js exists
if (-not (Test-Path $LOCAL_FILE)) {
    Write-Host "❌ Error: AdminDashboard.js not found at $LOCAL_FILE" -ForegroundColor Red
    exit 1
}

Write-Host "📦 Step 1: Building frontend..." -ForegroundColor Yellow
cd frontend
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    cd ..
    exit 1
}
cd ..
Write-Host "✅ Frontend built successfully" -ForegroundColor Green
Write-Host ""

Write-Host "📤 Step 2: Uploading build to EC2..." -ForegroundColor Yellow
scp -i $KEY_PATH -r .\frontend\build\* ${EC2_HOST}:${REMOTE_DIR}/
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Upload failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Build uploaded successfully" -ForegroundColor Green
Write-Host ""

Write-Host "🔄 Step 3: Restarting nginx..." -ForegroundColor Yellow
ssh -i $KEY_PATH $EC2_HOST "sudo systemctl restart nginx"
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Warning: Failed to restart nginx" -ForegroundColor Yellow
} else {
    Write-Host "✅ Nginx restarted successfully" -ForegroundColor Green
}
Write-Host ""

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "✅ Deployment Complete!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Changes deployed:" -ForegroundColor Cyan
Write-Host "  • Added dashboard statistics API integration" -ForegroundColor White
Write-Host "  • Replaced hardcoded values (12 users, 6 courses)" -ForegroundColor White
Write-Host "  • Added real-time data from /api/admin/analytics/overview" -ForegroundColor White
Write-Host "  • Shows: Total Students, Active Courses, Total Videos, Quiz Attempts" -ForegroundColor White
Write-Host "  • Added loading spinner while fetching data" -ForegroundColor White
Write-Host ""
Write-Host "🌐 Access the dashboard at:" -ForegroundColor Cyan
Write-Host "   http://ec2-65-0-56-84.ap-south-1.compute.amazonaws.com" -ForegroundColor White
Write-Host ""
