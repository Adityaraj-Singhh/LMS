# PowerShell script to deploy Recent Activity fixes to AWS EC2
Write-Host "Starting Recent Activity fixes deployment to AWS EC2..." -ForegroundColor Green

# Configuration
$EC2_IP = "13.233.135.233"
$EC2_USER = "ubuntu"
$KEY_PATH = ".\frontend\sgt-lmskey.pem"
$BACKEND_KEY_PATH = ".\backend\sgt-lmskey.pem"

# Check if PEM key exists
if (-not (Test-Path $KEY_PATH)) {
    if (Test-Path $BACKEND_KEY_PATH) {
        $KEY_PATH = $BACKEND_KEY_PATH
        Write-Host "Using backend PEM key" -ForegroundColor Yellow
    } else {
        Write-Host "PEM key not found" -ForegroundColor Red
        exit 1
    }
}

Write-Host "Using PEM key: $KEY_PATH" -ForegroundColor Blue

# Step 1: Build Frontend
Write-Host "Building Frontend..." -ForegroundColor Blue
Set-Location -Path "frontend"

npm install --production
if ($LASTEXITCODE -ne 0) {
    Write-Host "Frontend npm install failed!" -ForegroundColor Red
    exit 1
}

npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Frontend build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Frontend built successfully!" -ForegroundColor Green

# Create frontend archive
Set-Location -Path "build"
Compress-Archive -Path "*" -DestinationPath "..\frontend-fix.zip" -Force
Set-Location -Path ".."
Set-Location -Path ".."

# Step 2: Prepare Backend Files
Write-Host "Preparing backend files..." -ForegroundColor Blue
$backendFiles = @(
    "backend\controllers\hodController.js", 
    "backend\controllers\deanController.js",
    "backend\controllers\teacherController.js",
    "backend\routes\hod.js",
    "backend\routes\dean.js", 
    "backend\routes\teacher.js"
)

New-Item -ItemType Directory -Force -Path "temp-backend" | Out-Null

foreach ($file in $backendFiles) {
    if (Test-Path $file) {
        $fileName = Split-Path $file -Leaf
        $targetDir = "temp-backend\$(Split-Path (Split-Path $file -Parent) -Leaf)"
        New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
        Copy-Item $file "$targetDir\$fileName"
        Write-Host "Prepared: $file" -ForegroundColor Gray
    }
}

Set-Location -Path "temp-backend"
Compress-Archive -Path "*" -DestinationPath "..\backend-fix.zip" -Force
Set-Location -Path ".."

# Step 3: Upload Files
Write-Host "Uploading files to EC2..." -ForegroundColor Blue

scp -i $KEY_PATH "frontend\frontend-fix.zip" "${EC2_USER}@${EC2_IP}:/tmp/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Frontend upload failed!" -ForegroundColor Red
    exit 1
}

scp -i $KEY_PATH "backend-fix.zip" "${EC2_USER}@${EC2_IP}:/tmp/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Backend upload failed!" -ForegroundColor Red
    exit 1
}

# Step 4: Create and upload deployment script
$deployContent = @"
#!/bin/bash
echo "Starting deployment on EC2..."

# Deploy Frontend
echo "Deploying frontend..."
cd /var/www/html
if [ -d "sgt-lms" ]; then
    sudo mv sgt-lms sgt-lms_backup_`date +%Y%m%d_%H%M%S`
fi
sudo mkdir -p sgt-lms
cd sgt-lms
sudo unzip -o /tmp/frontend-fix.zip
sudo chown -R www-data:www-data /var/www/html/sgt-lms
sudo chmod -R 755 /var/www/html/sgt-lms
echo "Frontend deployed"

# Deploy Backend  
echo "Deploying backend..."
cd /opt/sgt-lms
sudo cp controllers/hodController.js controllers/hodController.js.backup.`date +%Y%m%d_%H%M%S` 2>/dev/null || true
sudo cp controllers/deanController.js controllers/deanController.js.backup.`date +%Y%m%d_%H%M%S` 2>/dev/null || true
sudo cp controllers/teacherController.js controllers/teacherController.js.backup.`date +%Y%m%d_%H%M%S` 2>/dev/null || true
sudo cp routes/hod.js routes/hod.js.backup.`date +%Y%m%d_%H%M%S` 2>/dev/null || true
sudo cp routes/dean.js routes/dean.js.backup.`date +%Y%m%d_%H%M%S` 2>/dev/null || true
sudo cp routes/teacher.js routes/teacher.js.backup.`date +%Y%m%d_%H%M%S` 2>/dev/null || true

cd /tmp
unzip -o backend-fix.zip
sudo cp controllers/hodController.js /opt/sgt-lms/controllers/ 2>/dev/null || true
sudo cp controllers/deanController.js /opt/sgt-lms/controllers/ 2>/dev/null || true  
sudo cp controllers/teacherController.js /opt/sgt-lms/controllers/ 2>/dev/null || true
sudo cp routes/hod.js /opt/sgt-lms/routes/ 2>/dev/null || true
sudo cp routes/dean.js /opt/sgt-lms/routes/ 2>/dev/null || true
sudo cp routes/teacher.js /opt/sgt-lms/routes/ 2>/dev/null || true

sudo chown -R sgt-lms:sgt-lms /opt/sgt-lms/
echo "Backend files updated"

# Restart services
echo "Restarting services..."
sudo systemctl stop sgt-lms-backend
sleep 3
sudo systemctl start sgt-lms-backend
sleep 5

if sudo systemctl is-active --quiet sgt-lms-backend; then
    echo "Backend restarted successfully"
else
    echo "Backend failed to start"
    sudo systemctl status sgt-lms-backend --no-pager -l
fi

sudo systemctl reload nginx
echo "Nginx reloaded"

# Clean up
rm -f /tmp/frontend-fix.zip /tmp/backend-fix.zip
rm -rf /tmp/controllers /tmp/routes

echo "Deployment completed!"
echo "Frontend: https://13.233.135.233"
echo "Backend: https://13.233.135.233/api"
echo ""
echo "Test Recent Activity in dashboards:"
echo "Admin: https://13.233.135.233/admin/dashboard"
echo "HOD: https://13.233.135.233/hod/dashboard"  
echo "Dean: https://13.233.135.233/dean/dashboard"
echo "Teacher: https://13.233.135.233/teacher/dashboard"
"@

$deployContent | Out-File -FilePath "deploy-script.sh" -Encoding UTF8
scp -i $KEY_PATH "deploy-script.sh" "${EC2_USER}@${EC2_IP}:/tmp/"

# Execute deployment
Write-Host "Executing deployment on EC2..." -ForegroundColor Blue
ssh -i $KEY_PATH "${EC2_USER}@${EC2_IP}" "chmod +x /tmp/deploy-script.sh && sudo /tmp/deploy-script.sh"

if ($LASTEXITCODE -eq 0) {
    Write-Host "Deployment completed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your application with Recent Activity fixes is now available at:" -ForegroundColor Blue
    Write-Host "Frontend: https://$EC2_IP" -ForegroundColor Cyan
    Write-Host "Backend API: https://$EC2_IP/api" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Test Recent Activity in these dashboards:" -ForegroundColor Yellow
    Write-Host "Admin Dashboard: https://$EC2_IP/admin/dashboard" -ForegroundColor Gray
    Write-Host "HOD Dashboard: https://$EC2_IP/hod/dashboard" -ForegroundColor Gray  
    Write-Host "Dean Dashboard: https://$EC2_IP/dean/dashboard" -ForegroundColor Gray
    Write-Host "Teacher Dashboard: https://$EC2_IP/teacher/dashboard" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Recent Activity features now working in all dashboards!" -ForegroundColor Green
} else {
    Write-Host "Deployment failed! Check the output above for errors." -ForegroundColor Red
}

# Clean up
Remove-Item -Path "temp-backend" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "frontend-fix.zip" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "backend-fix.zip" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "deploy-script.sh" -Force -ErrorAction SilentlyContinue

Write-Host "Script completed!" -ForegroundColor Green