# Simple SCP Upload Script for SGT-LMS Updates
Write-Host "Uploading SGT-LMS updates to EC2..." -ForegroundColor Green

# Configuration
$EC2_IP = "13.233.135.233"
$EC2_USER = "ubuntu"
$KEY_PATH = ".\frontend\sgt-lmskey.pem"

# Check PEM key
if (-not (Test-Path $KEY_PATH)) {
    $KEY_PATH = ".\backend\sgt-lmskey.pem"
    if (-not (Test-Path $KEY_PATH)) {
        Write-Host "PEM key not found!" -ForegroundColor Red
        exit 1
    }
}

Write-Host "Using PEM key: $KEY_PATH" -ForegroundColor Blue

# Upload individual updated files directly
Write-Host "Uploading updated files..." -ForegroundColor Blue

# Upload updated React components
Write-Host "Uploading React components..." -ForegroundColor Gray
scp -i $KEY_PATH "frontend\src\pages\dean\DeanCourseAnalytics.js" "${EC2_USER}@${EC2_IP}:/tmp/"
scp -i $KEY_PATH "frontend\src\components\common\StudentIndividualAnalytics.js" "${EC2_USER}@${EC2_IP}:/tmp/"
scp -i $KEY_PATH "frontend\src\pages\dean\DeanSectionAnalytics.js" "${EC2_USER}@${EC2_IP}:/tmp/"

# Upload updated configuration files
Write-Host "Uploading configuration files..." -ForegroundColor Gray
scp -i $KEY_PATH "frontend\package.json" "${EC2_USER}@${EC2_IP}:/tmp/package.json.frontend"
scp -i $KEY_PATH "frontend\.env.production.local" "${EC2_USER}@${EC2_IP}:/tmp/"

# Upload nginx config
Write-Host "Uploading nginx config..." -ForegroundColor Gray
scp -i $KEY_PATH "nginx-aws-config" "${EC2_USER}@${EC2_IP}:/tmp/"

Write-Host "All files uploaded successfully!" -ForegroundColor Green

Write-Host ""
Write-Host "Now SSH into your EC2 and run these commands:" -ForegroundColor Yellow
Write-Host "ssh -i $KEY_PATH $EC2_USER@$EC2_IP" -ForegroundColor Cyan
Write-Host ""

$commands = @"
# Update Frontend Files
sudo mkdir -p /var/www/html/frontend/src/pages/dean
sudo mkdir -p /var/www/html/frontend/src/components/common
sudo cp /tmp/DeanCourseAnalytics.js /var/www/html/frontend/src/pages/dean/
sudo cp /tmp/StudentIndividualAnalytics.js /var/www/html/frontend/src/components/common/
sudo cp /tmp/DeanSectionAnalytics.js /var/www/html/frontend/src/pages/dean/

# Update package.json and environment
sudo cp /tmp/package.json.frontend /var/www/html/frontend/package.json
sudo cp /tmp/.env.production.local /var/www/html/frontend/

# Rebuild Frontend
cd /var/www/html/frontend
sudo npm install
sudo REACT_APP_BACKEND_URL=https://13.233.135.233:5000 npm run build

# Update nginx
sudo cp /tmp/nginx-aws-config /etc/nginx/sites-available/sgt-lms
sudo ln -sf /etc/nginx/sites-available/sgt-lms /etc/nginx/sites-enabled/
sudo nginx -t

# Restart services
sudo systemctl restart sgt-lms-backend
sudo systemctl reload nginx

# Check status
sudo systemctl status sgt-lms-backend --no-pager
sudo systemctl status nginx --no-pager
"@

Write-Host $commands -ForegroundColor Gray
Write-Host ""
Write-Host "Test URLs after deployment:" -ForegroundColor Yellow
Write-Host "https://13.233.135.233/dean/section-analytics" -ForegroundColor Cyan
Write-Host "https://13.233.135.233/dean/student-analytics" -ForegroundColor Cyan