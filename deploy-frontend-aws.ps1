# PowerShell script to deploy SGT-LMS Frontend to AWS EC2
Write-Host "🚀 Deploying SGT-LMS Frontend to AWS EC2..." -ForegroundColor Green

# Set AWS EC2 details  
$EC2_IP = "ec2-65-0-56-84.ap-south-1.compute.amazonaws.com"
$EC2_USER = "ubuntu"  # or ec2-user depending on your AMI
$KEY_PATH = ".\frontend\sgtlmskey-v2.pem"  # Using the key found in frontend directory

# Set environment variables for the build
$env:REACT_APP_BACKEND_URL = "http://$EC2_IP`:5000"
$env:REACT_APP_ENVIRONMENT = "production"
$env:REACT_APP_API_BASE_URL = "http://$EC2_IP`:5000/api"
$env:REACT_APP_UMS_URL = "https://ums-frontend-cyr2.onrender.com"

Write-Host "📋 Building frontend with production settings..." -ForegroundColor Blue
Write-Host "   Backend URL: $env:REACT_APP_BACKEND_URL" -ForegroundColor Gray

# Navigate to frontend directory
Set-Location -Path "frontend"

# Install dependencies if needed
Write-Host "📦 Installing dependencies..." -ForegroundColor Blue
npm install

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ npm install failed!" -ForegroundColor Red
    exit 1
}

# Build the production version
Write-Host "🔨 Building production build..." -ForegroundColor Blue
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed! Check the errors above." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Build completed successfully!" -ForegroundColor Green

# Create tar.gz file (requires 7-zip or similar)
Write-Host "📁 Preparing deployment files..." -ForegroundColor Blue
Set-Location -Path "build"

# Check if 7z is available
if (Get-Command "7z" -ErrorAction SilentlyContinue) {
    7z a -tgzip "..\frontend-build.tar.gz" "*"
} else {
    Write-Host "⚠️  7-zip not found. Creating zip file instead..." -ForegroundColor Yellow
    Compress-Archive -Path "*" -DestinationPath "..\frontend-build.zip" -Force
}

Set-Location -Path ".."

Write-Host "📤 Upload instructions:" -ForegroundColor Yellow
Write-Host "Since we're on Windows, please manually:" -ForegroundColor Gray
Write-Host "1. Upload frontend-build.tar.gz (or .zip) to your EC2 instance" -ForegroundColor Gray
Write-Host "2. Or use the following command if you have WSL/Git Bash:" -ForegroundColor Gray
Write-Host "   scp -i $KEY_PATH frontend-build.* $EC2_USER@$EC2_IP:/tmp/" -ForegroundColor Cyan

Write-Host ""
Write-Host "🔧 Manual deployment steps for EC2:" -ForegroundColor Yellow
Write-Host @"
SSH into your EC2 instance and run:

sudo mkdir -p /var/www/html
cd /var/www/html

# Backup existing frontend if any
if [ -d "frontend" ]; then
    sudo mv frontend "frontend_backup_`$(date +%Y%m%d_%H%M%S)"
fi

# Extract new frontend
sudo mkdir frontend
cd frontend

# If you uploaded tar.gz:
sudo tar -xzf /tmp/frontend-build.tar.gz

# If you uploaded zip:
sudo unzip /tmp/frontend-build.zip

# Set proper permissions
sudo chown -R www-data:www-data /var/www/html/frontend
sudo chmod -R 755 /var/www/html/frontend

# Restart nginx
sudo systemctl reload nginx

echo "✅ Frontend deployed successfully!"
"@ -ForegroundColor Cyan

Write-Host ""
Write-Host "🌐 After deployment, your application will be available at: https://$EC2_IP" -ForegroundColor Green

Write-Host ""
Write-Host "📋 Troubleshooting tips:" -ForegroundColor Yellow
Write-Host "1. If you get SSL/HTTPS errors, check your nginx configuration" -ForegroundColor Gray
Write-Host "2. Check browser console for any API errors" -ForegroundColor Gray
Write-Host "3. Verify backend is running on port 5000" -ForegroundColor Gray
Write-Host "4. Check that all environment variables are correctly set" -ForegroundColor Gray

Write-Host "🏁 Build preparation completed!" -ForegroundColor Green