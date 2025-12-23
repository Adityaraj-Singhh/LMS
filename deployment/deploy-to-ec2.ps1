# SGT-LMS Deployment Script for EC2
# This script will deploy both frontend and backend to EC2 using SCP and SSH

param(
    [Parameter(Mandatory=$true)]
    [string]$EC2_HOST = "ec2-65-0-69-254.ap-south-1.compute.amazonaws.com",
    
    [Parameter(Mandatory=$true)]
    [string]$PEM_FILE = "sgtlmskey-v2.pem",
    
    [string]$EC2_USER = "ubuntu",
    [string]$PROJECT_NAME = "sgt-lms"
)

# Colors for output
$RED = "`e[31m"
$GREEN = "`e[32m"
$YELLOW = "`e[33m"
$BLUE = "`e[34m"
$NC = "`e[0m" # No Color

Write-Host "${BLUE}SGT-LMS EC2 Deployment Script${NC}" -ForegroundColor Blue
Write-Host "Target: ${EC2_USER}@${EC2_HOST}" -ForegroundColor Cyan

# Check if PEM file exists
if (-not (Test-Path $PEM_FILE)) {
    Write-Host "${RED}Error: PEM file '$PEM_FILE' not found!${NC}" -ForegroundColor Red
    Write-Host "Please ensure the PEM file is in the current directory." -ForegroundColor Yellow
    exit 1
}

# Set correct permissions for PEM file (Windows equivalent)
Write-Host "${YELLOW}Setting PEM file permissions...${NC}" -ForegroundColor Yellow
icacls $PEM_FILE /inheritance:r
icacls $PEM_FILE /grant:r "$env:USERNAME:(R)"

# Test SSH connection
Write-Host "${YELLOW}Testing SSH connection...${NC}" -ForegroundColor Yellow
$sshTest = ssh -i $PEM_FILE -o ConnectTimeout=10 -o BatchMode=yes $EC2_USER@$EC2_HOST "echo 'SSH connection successful'"
if ($LASTEXITCODE -ne 0) {
    Write-Host "${RED}Error: Cannot connect to EC2 instance via SSH${NC}" -ForegroundColor Red
    Write-Host "Please check:" -ForegroundColor Yellow
    Write-Host "- EC2 instance is running" -ForegroundColor Yellow
    Write-Host "- Security group allows SSH (port 22) from your IP" -ForegroundColor Yellow
    Write-Host "- PEM file is correct" -ForegroundColor Yellow
    exit 1
}
Write-Host "${GREEN}SSH connection successful!${NC}" -ForegroundColor Green

# Create project directory on EC2
Write-Host "${YELLOW}Creating project directory on EC2...${NC}" -ForegroundColor Yellow
ssh -i $PEM_FILE $EC2_USER@$EC2_HOST "mkdir -p ~/$PROJECT_NAME"

# Build frontend locally
Write-Host "${YELLOW}Building frontend locally...${NC}" -ForegroundColor Yellow
Set-Location frontend
if (Test-Path "package.json") {
    npm install
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "${RED}Frontend build failed!${NC}" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "${RED}Error: frontend/package.json not found!${NC}" -ForegroundColor Red
    exit 1
}
Set-Location ..

# Upload frontend build to EC2
Write-Host "${YELLOW}Uploading frontend build to EC2...${NC}" -ForegroundColor Yellow
scp -i $PEM_FILE -r frontend/build $EC2_USER@$EC2_HOST:~/$PROJECT_NAME/frontend-build

# Upload backend to EC2
Write-Host "${YELLOW}Uploading backend to EC2...${NC}" -ForegroundColor Yellow
scp -i $PEM_FILE -r backend $EC2_USER@$EC2_HOST:~/$PROJECT_NAME/

# Upload deployment scripts
Write-Host "${YELLOW}Uploading deployment configurations...${NC}" -ForegroundColor Yellow
scp -i $PEM_FILE deployment/setup-ec2-environment.sh $EC2_USER@$EC2_HOST:~/$PROJECT_NAME/
scp -i $PEM_FILE deployment/nginx-ec2.conf $EC2_USER@$EC2_HOST:~/$PROJECT_NAME/
scp -i $PEM_FILE deployment/.env.production $EC2_USER@$EC2_HOST:~/$PROJECT_NAME/backend/.env

Write-Host "${GREEN}Files uploaded successfully!${NC}" -ForegroundColor Green
Write-Host "${BLUE}Next steps:${NC}" -ForegroundColor Blue
Write-Host "1. SSH to your EC2 instance:" -ForegroundColor Yellow
Write-Host "   ssh -i $PEM_FILE $EC2_USER@$EC2_HOST" -ForegroundColor Cyan
Write-Host "2. Run the setup script:" -ForegroundColor Yellow
Write-Host "   cd $PROJECT_NAME && chmod +x setup-ec2-environment.sh && ./setup-ec2-environment.sh" -ForegroundColor Cyan
Write-Host "3. Your application will be available at:" -ForegroundColor Yellow
Write-Host "   http://$EC2_HOST (frontend)" -ForegroundColor Cyan
Write-Host "   http://${EC2_HOST}:5000 (backend API)" -ForegroundColor Cyan