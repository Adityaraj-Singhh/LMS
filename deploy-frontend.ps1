# Frontend Deployment Script for SGT LMS
# This script builds the React app and deploys it to the EC2 server

param(
    [string]$KeyPath = ".\sgtlmskey-v2.pem",
    [string]$Server = "ec2-3-110-146-56.ap-south-1.compute.amazonaws.com",
    [string]$User = "ubuntu"
)

Write-Host "🚀 Starting Frontend Deployment..." -ForegroundColor Green

# Step 1: Build the React application
Write-Host "📦 Building React application..." -ForegroundColor Yellow
Set-Location "frontend"
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Build completed successfully!" -ForegroundColor Green

# Step 2: Upload build files to server
Write-Host "📤 Uploading build files to server..." -ForegroundColor Yellow
scp -i $KeyPath -r build $User@${Server}:~/sgt-lms/frontend/

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Upload failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Upload completed!" -ForegroundColor Green

# Step 3: Copy files to nginx directory and restart nginx
Write-Host "🔄 Deploying files and restarting nginx..." -ForegroundColor Yellow
$deployCommand = @"
sudo cp -r ~/sgt-lms/frontend/build/* /var/www/sgt-lms/frontend/ && 
sudo chown -R www-data:www-data /var/www/sgt-lms/frontend/ && 
sudo nginx -s reload
"@

ssh -i $KeyPath $User@$Server $deployCommand

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Deployment failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Deployment completed successfully!" -ForegroundColor Green
Write-Host "🌐 Frontend is now live at http://$Server" -ForegroundColor Cyan

# Go back to original directory
Set-Location ".."

Write-Host "🎉 Deployment process completed!" -ForegroundColor Green