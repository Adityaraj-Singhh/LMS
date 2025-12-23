# Direct Upload to EC2 - No Zip Files
# Uploads backend folder and built frontend directly

$ErrorActionPreference = "Stop"

$PEM_FILE = "frontend\lms-test-bunny.pem"
$EC2_HOST = "ubuntu@ec2-13-202-61-143.ap-south-1.compute.amazonaws.com"
$REMOTE_BASE = "/home/ubuntu/lms-bunny"

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Direct Upload to EC2 (No Zip)" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Check PEM file
if (-not (Test-Path $PEM_FILE)) {
    Write-Host "Error: PEM file not found" -ForegroundColor Red
    exit 1
}

# Set PEM permissions
Write-Host "Setting PEM file permissions..." -ForegroundColor Yellow
icacls $PEM_FILE /inheritance:r
icacls $PEM_FILE /grant:r "$($env:USERNAME):(R)"

Write-Host "Step 1: Cleaning remote directories..." -ForegroundColor Yellow
ssh -i $PEM_FILE $EC2_HOST "rm -rf $REMOTE_BASE && mkdir -p $REMOTE_BASE/backend $REMOTE_BASE/frontend"

Write-Host "Step 2: Uploading backend folder (excluding node_modules)..." -ForegroundColor Yellow
scp -i $PEM_FILE -r backend/* ${EC2_HOST}:${REMOTE_BASE}/backend/
ssh -i $PEM_FILE $EC2_HOST "rm -rf $REMOTE_BASE/backend/node_modules"

Write-Host "Step 3: Uploading built frontend..." -ForegroundColor Yellow
scp -i $PEM_FILE -r frontend/build ${EC2_HOST}:${REMOTE_BASE}/frontend/

Write-Host "Step 4: Uploading deployment script..." -ForegroundColor Yellow
scp -i $PEM_FILE complete-deployment.sh ${EC2_HOST}:~/

Write-Host "Step 5: Uploading nginx config..." -ForegroundColor Yellow
scp -i $PEM_FILE nginx-bunny-3gb.conf ${EC2_HOST}:~/

Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host "Upload Complete!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next: SSH into server and run deployment" -ForegroundColor Cyan
Write-Host "  ssh -i $PEM_FILE $EC2_HOST" -ForegroundColor White
Write-Host ""
Write-Host "Then on server:" -ForegroundColor Cyan
Write-Host "  chmod +x ~/complete-deployment.sh" -ForegroundColor White
Write-Host "  ./complete-deployment.sh" -ForegroundColor White
Write-Host ""
