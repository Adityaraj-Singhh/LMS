# Deploy LMS with Bunny Stream to EC2 Instance
# This script transfers backend and frontend to a fresh EC2 instance

$ErrorActionPreference = "Stop"

# Configuration
$PEM_FILE = "frontend\lms-test-bunny.pem"
$EC2_HOST = "ubuntu@ec2-13-202-61-143.ap-south-1.compute.amazonaws.com"
$REMOTE_DIR = "/home/ubuntu/lms-bunny"
$PROJECT_ROOT = Get-Location

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "LMS Bunny Stream Deployment to EC2" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Check if PEM file exists
if (-not (Test-Path $PEM_FILE)) {
    Write-Host "Error: PEM file not found at $PEM_FILE" -ForegroundColor Red
    exit 1
}

Write-Host "Step 1: Setting PEM file permissions..." -ForegroundColor Yellow
# Set correct permissions for PEM file (read-only for owner)
icacls $PEM_FILE /inheritance:r
icacls $PEM_FILE /grant:r "$($env:USERNAME):(R)"

Write-Host "Step 2: Creating temporary build archives..." -ForegroundColor Yellow

# Create backend archive (excluding node_modules and .env)
Write-Host "  - Packaging backend..." -ForegroundColor Gray
if (Test-Path "backend-deploy.tar.gz") { Remove-Item "backend-deploy.tar.gz" -Force }
tar -czf backend-deploy.tar.gz --exclude="node_modules" --exclude=".env" --exclude="*.log" --exclude=".git" -C "$PROJECT_ROOT" backend

# Create frontend archive (excluding node_modules, build, and .env)
Write-Host "  - Packaging frontend..." -ForegroundColor Gray
if (Test-Path "frontend-deploy.tar.gz") { Remove-Item "frontend-deploy.tar.gz" -Force }
tar -czf frontend-deploy.tar.gz --exclude="node_modules" --exclude="build" --exclude=".env" --exclude="*.pem" --exclude="*.tar.gz" --exclude=".git" -C "$PROJECT_ROOT" frontend

Write-Host "Step 3: Creating remote directory on EC2..." -ForegroundColor Yellow
ssh -i $PEM_FILE $EC2_HOST "mkdir -p $REMOTE_DIR"

Write-Host "Step 4: Transferring files to EC2 (this may take a few minutes)..." -ForegroundColor Yellow
Write-Host "  - Uploading backend..." -ForegroundColor Gray
scp -i $PEM_FILE backend-deploy.tar.gz ${EC2_HOST}:${REMOTE_DIR}/

Write-Host "  - Uploading frontend..." -ForegroundColor Gray
scp -i $PEM_FILE frontend-deploy.tar.gz ${EC2_HOST}:${REMOTE_DIR}/

Write-Host "Step 5: Extracting files on EC2..." -ForegroundColor Yellow
ssh -i $PEM_FILE $EC2_HOST "cd $REMOTE_DIR && tar -xzf backend-deploy.tar.gz && tar -xzf frontend-deploy.tar.gz && rm backend-deploy.tar.gz frontend-deploy.tar.gz && echo 'Files extracted successfully!'"

Write-Host "Step 6: Manual setup required on EC2..." -ForegroundColor Yellow
Write-Host "  SSH into EC2 and run these commands:" -ForegroundColor Gray
Write-Host "  1. Install Node.js: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs" -ForegroundColor DarkGray
Write-Host "  2. Install PM2: sudo npm install -g pm2" -ForegroundColor DarkGray
Write-Host "  3. Install backend deps: cd $REMOTE_DIR/backend && npm install --production" -ForegroundColor DarkGray
Write-Host "  4. Install frontend deps: cd $REMOTE_DIR/frontend && npm install" -ForegroundColor DarkGray
Write-Host "  5. Build frontend: cd $REMOTE_DIR/frontend && npm run build" -ForegroundColor DarkGray

Write-Host ""
Write-Host "Step 7: Creating .env files..." -ForegroundColor Yellow
Write-Host ""
Write-Host "IMPORTANT: You need to create .env files with your configuration!" -ForegroundColor Red
Write-Host ""
Write-Host "Backend .env should include:" -ForegroundColor Yellow
Write-Host "  - MONGODB_URI" -ForegroundColor Gray
Write-Host "  - JWT_SECRET" -ForegroundColor Gray
Write-Host "  - BUNNY_STREAM_API_KEY=e8bb584d-2f33-4e3f-ac5c52298c8e-4089-4fd6" -ForegroundColor Gray
Write-Host "  - BUNNY_LIBRARY_ID=567095" -ForegroundColor Gray
Write-Host "  - BUNNY_CDN_HOSTNAME=vz-6b31636e-f82.b-cdn.net" -ForegroundColor Gray
Write-Host "  - BUNNY_MAX_RESOLUTION=720" -ForegroundColor Gray
Write-Host "  - BUNNY_DEFAULT_QUALITY=360" -ForegroundColor Gray
Write-Host ""
Write-Host "Frontend .env.production should include:" -ForegroundColor Yellow
Write-Host "  - REACT_APP_API_URL=http://your-ec2-ip:5000" -ForegroundColor Gray
Write-Host ""

# Cleanup local archives
Write-Host "Step 8: Cleaning up local archives..." -ForegroundColor Yellow
Remove-Item backend-deploy.tar.gz -Force
Remove-Item frontend-deploy.tar.gz -Force

Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. SSH into EC2: ssh -i $PEM_FILE $EC2_HOST" -ForegroundColor White
Write-Host "2. Create backend/.env with Bunny Stream credentials" -ForegroundColor White
Write-Host "3. Create frontend/.env.production with API URL" -ForegroundColor White
Write-Host "4. Start backend: cd $REMOTE_DIR/backend && pm2 start npm --name 'lms-backend' -- start" -ForegroundColor White
Write-Host "5. Serve frontend: pm2 serve $REMOTE_DIR/frontend/build 3000 --name 'lms-frontend' --spa" -ForegroundColor White
Write-Host "6. Configure nginx as reverse proxy (optional)" -ForegroundColor White
Write-Host ""
Write-Host "To verify no S3 references:" -ForegroundColor Yellow
Write-Host "  grep -r 'aws-sdk\|multer-s3' $REMOTE_DIR/backend --exclude-dir=node_modules" -ForegroundColor Gray
Write-Host ""
