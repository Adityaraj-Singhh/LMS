# Deploy Frontend Fix for Socket.IO
# Usage: .\deploy-frontend-fix.ps1 -KeyPath "path/to/your/sgtlmskey-v2.pem"

param(
    [Parameter(Mandatory=$true)]
    [string]$KeyPath,
    [string]$EC2_HOST = "ec2-65-0-69-254.ap-south-1.compute.amazonaws.com",
    [string]$EC2_USER = "ec2-user"
)

$RED = "`e[31m"
$GREEN = "`e[32m" 
$YELLOW = "`e[33m"
$NC = "`e[0m"

Write-Host "${GREEN}=== SGT LMS Frontend Fix Deployment ===${NC}" -ForegroundColor Green
Write-Host "Deploying updated frontend with Socket.IO fix..." -ForegroundColor Yellow

# Verify SSH key exists
if (-not (Test-Path $KeyPath)) {
    Write-Host "${RED}Error: SSH key not found at $KeyPath${NC}" -ForegroundColor Red
    exit 1
}

# Test SSH connection
Write-Host "${YELLOW}Testing SSH connection...${NC}" -ForegroundColor Yellow
$sshTest = ssh -i $KeyPath -o ConnectTimeout=10 -o BatchMode=yes $EC2_USER@$EC2_HOST "echo 'SSH connection successful'"

if ($LASTEXITCODE -ne 0) {
    Write-Host "${RED}Error: Cannot connect to EC2 instance via SSH${NC}" -ForegroundColor Red
    Write-Host "Please ensure:" -ForegroundColor Yellow
    Write-Host "- Your SSH key has correct permissions (chmod 400)" -ForegroundColor Yellow
    Write-Host "- Security group allows SSH (port 22) from your IP" -ForegroundColor Yellow
    exit 1
}

Write-Host "${GREEN}SSH connection successful!${NC}" -ForegroundColor Green

# Deploy updated frontend
Write-Host "${YELLOW}Deploying updated frontend build...${NC}" -ForegroundColor Yellow

# Copy frontend build
scp -i $KeyPath -r frontend/build/* $EC2_USER@$EC2_HOST:/tmp/frontend-update/

# Move to nginx directory and restart services
ssh -i $KeyPath $EC2_USER@$EC2_HOST @"
    sudo mkdir -p /tmp/frontend-update
    sudo cp -r /tmp/frontend-update/* /var/www/html/
    sudo chown -R nginx:nginx /var/www/html/
    sudo systemctl reload nginx
    echo 'Frontend updated successfully!'
"@

if ($LASTEXITCODE -eq 0) {
    Write-Host "${GREEN}=== Frontend Deployment Successful! ===${NC}" -ForegroundColor Green
    Write-Host "Socket.IO URL has been fixed. Chat should now work properly." -ForegroundColor Green
    Write-Host "Application URL: http://$EC2_HOST" -ForegroundColor Cyan
} else {
    Write-Host "${RED}Deployment failed. Check the errors above.${NC}" -ForegroundColor Red
    exit 1
}