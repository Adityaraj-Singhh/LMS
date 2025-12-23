# PowerShell script to deploy Recent Activity fixes to AWS EC2
Write-Host "🚀 Deploying Recent Activity Fixes to AWS EC2..." -ForegroundColor Green

# Configuration
$EC2_IP = "13.233.135.233"
$EC2_USER = "ubuntu"
$KEY_PATH = ".\frontend\sgt-lmskey.pem"  # Using frontend PEM key
$BACKEND_KEY_PATH = ".\backend\sgt-lmskey.pem"  # Backup backend PEM key

# Check if PEM key exists
if (-not (Test-Path $KEY_PATH)) {
    if (Test-Path $BACKEND_KEY_PATH) {
        $KEY_PATH = $BACKEND_KEY_PATH
        Write-Host "Using backend PEM key" -ForegroundColor Yellow
    } else {
        Write-Host "❌ PEM key not found at $KEY_PATH or $BACKEND_KEY_PATH" -ForegroundColor Red
        exit 1
    }
}

Write-Host "🔑 Using PEM key: $KEY_PATH" -ForegroundColor Blue

# Set environment variables for frontend build
$env:REACT_APP_BACKEND_URL = "https://$EC2_IP"
$env:REACT_APP_ENVIRONMENT = "production"
$env:REACT_APP_API_BASE_URL = "https://$EC2_IP/api"

Write-Host "📋 Environment variables set:" -ForegroundColor Blue
Write-Host "   REACT_APP_BACKEND_URL: $env:REACT_APP_BACKEND_URL" -ForegroundColor Gray
Write-Host "   REACT_APP_API_BASE_URL: $env:REACT_APP_API_BASE_URL" -ForegroundColor Gray

# Step 1: Build Frontend with Recent Activity Fixes
Write-Host "`n🔨 Building Frontend with Recent Activity Fixes..." -ForegroundColor Blue
Set-Location -Path "frontend"

Write-Host "📦 Installing frontend dependencies..." -ForegroundColor Gray
npm install --production
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Frontend npm install failed!" -ForegroundColor Red
    exit 1
}

Write-Host "🏗️ Building production frontend..." -ForegroundColor Gray
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Frontend build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Frontend built successfully!" -ForegroundColor Green

# Create frontend archive
Write-Host "📦 Creating frontend archive..." -ForegroundColor Gray
Set-Location -Path "build"
if (Get-Command "tar" -ErrorAction SilentlyContinue) {
    tar -czf "..\frontend-recent-activity-fix.tar.gz" *
} else {
    Compress-Archive -Path "*" -DestinationPath "..\frontend-recent-activity-fix.zip" -Force
    Write-Host "⚠️ Created ZIP instead of tar.gz (tar not available)" -ForegroundColor Yellow
}
Set-Location -Path ".."
Set-Location -Path ".."

# Step 2: Prepare Backend Files with Recent Activity API Endpoints
Write-Host "`n📂 Preparing backend files with Recent Activity fixes..." -ForegroundColor Blue
$backendFiles = @(
    "backend\controllers\adminController.js",
    "backend\controllers\hodController.js", 
    "backend\controllers\deanController.js",
    "backend\controllers\teacherController.js",
    "backend\routes\admin.js",
    "backend\routes\hod.js",
    "backend\routes\dean.js",
    "backend\routes\teacher.js",
    "backend\package.json"
)

# Create a temp directory for backend files
New-Item -ItemType Directory -Force -Path "temp-backend-recent-activity" | Out-Null

foreach ($file in $backendFiles) {
    if (Test-Path $file) {
        $fileName = Split-Path $file -Leaf
        $targetDir = "temp-backend-recent-activity\$(Split-Path (Split-Path $file -Parent) -Leaf)"
        New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
        Copy-Item $file "$targetDir\$fileName"
        Write-Host "   Prepared: $file" -ForegroundColor Gray
    } else {
        Write-Host "   ⚠️  File not found: $file" -ForegroundColor Yellow
    }
}

# Create backend archive
Write-Host "📦 Creating backend archive..." -ForegroundColor Gray
Set-Location -Path "temp-backend-recent-activity"
if (Get-Command "tar" -ErrorAction SilentlyContinue) {
    tar -czf "..\backend-recent-activity-fix.tar.gz" *
} else {
    Compress-Archive -Path "*" -DestinationPath "..\backend-recent-activity-fix.zip" -Force
}
Set-Location -Path ".."

# Step 3: Upload Files to EC2
Write-Host "`n📤 Uploading files to EC2..." -ForegroundColor Blue

# Upload frontend
Write-Host "📤 Uploading frontend..." -ForegroundColor Gray
if (Test-Path "frontend\frontend-recent-activity-fix.tar.gz") {
    scp -i $KEY_PATH "frontend\frontend-recent-activity-fix.tar.gz" "${EC2_USER}@${EC2_IP}:/tmp/"
} elseif (Test-Path "frontend\frontend-recent-activity-fix.zip") {
    scp -i $KEY_PATH "frontend\frontend-recent-activity-fix.zip" "${EC2_USER}@${EC2_IP}:/tmp/"
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Frontend upload failed!" -ForegroundColor Red
    exit 1
}

# Upload backend
Write-Host "📤 Uploading backend..." -ForegroundColor Gray
if (Test-Path "backend-recent-activity-fix.tar.gz") {
    scp -i $KEY_PATH "backend-recent-activity-fix.tar.gz" "${EC2_USER}@${EC2_IP}:/tmp/"
} elseif (Test-Path "backend-recent-activity-fix.zip") {
    scp -i $KEY_PATH "backend-recent-activity-fix.zip" "${EC2_USER}@${EC2_IP}:/tmp/"
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Backend upload failed!" -ForegroundColor Red
    exit 1
}

# Step 4: Deploy on EC2
Write-Host "`n🚀 Deploying Recent Activity fixes on EC2..." -ForegroundColor Blue

$deployScript = @'
#!/bin/bash
echo "🚀 Starting Recent Activity fixes deployment on EC2..."

# Deploy Frontend
echo "📂 Deploying frontend with Recent Activity fixes..."
cd /var/www/html

# Backup existing frontend
if [ -d "sgt-lms" ]; then
    sudo mv sgt-lms "sgt-lms_backup_$(date +%Y%m%d_%H%M%S)"
    echo "✅ Backed up existing frontend"
fi

# Extract new frontend
sudo mkdir -p sgt-lms
cd sgt-lms

if [ -f "/tmp/frontend-recent-activity-fix.tar.gz" ]; then
    sudo tar -xzf /tmp/frontend-recent-activity-fix.tar.gz
    echo "✅ Extracted frontend from tar.gz"
elif [ -f "/tmp/frontend-recent-activity-fix.zip" ]; then
    sudo unzip -o /tmp/frontend-recent-activity-fix.zip
    echo "✅ Extracted frontend from zip"
fi

# Set permissions
sudo chown -R www-data:www-data /var/www/html/sgt-lms
sudo chmod -R 755 /var/www/html/sgt-lms
echo "✅ Set frontend permissions"

# Deploy Backend Recent Activity API endpoints
echo "📂 Deploying backend Recent Activity fixes..."
cd /opt/sgt-lms

# Backup existing controller files
sudo cp controllers/adminController.js "controllers/adminController.js.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || echo "adminController.js not found, will create new"
sudo cp controllers/hodController.js "controllers/hodController.js.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || echo "hodController.js not found, will create new"
sudo cp controllers/deanController.js "controllers/deanController.js.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || echo "deanController.js not found, will create new"
sudo cp controllers/teacherController.js "controllers/teacherController.js.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || echo "teacherController.js not found, will create new"

# Backup existing route files
sudo cp routes/admin.js "routes/admin.js.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || echo "admin.js not found, will create new"
sudo cp routes/hod.js "routes/hod.js.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || echo "hod.js not found, will create new"
sudo cp routes/dean.js "routes/dean.js.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || echo "dean.js not found, will create new"
sudo cp routes/teacher.js "routes/teacher.js.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || echo "teacher.js not found, will create new"

# Extract backend updates
cd /tmp
if [ -f "backend-recent-activity-fix.tar.gz" ]; then
    tar -xzf backend-recent-activity-fix.tar.gz
    echo "✅ Extracted backend from tar.gz"
elif [ -f "backend-recent-activity-fix.zip" ]; then
    unzip -o backend-recent-activity-fix.zip
    echo "✅ Extracted backend from zip"
fi

# Copy updated controller files
if [ -f "controllers/adminController.js" ]; then
    sudo cp controllers/adminController.js /opt/sgt-lms/controllers/
    echo "✅ Updated adminController.js"
fi
if [ -f "controllers/hodController.js" ]; then
    sudo cp controllers/hodController.js /opt/sgt-lms/controllers/
    echo "✅ Updated hodController.js with getRecentActivity"
fi
if [ -f "controllers/deanController.js" ]; then
    sudo cp controllers/deanController.js /opt/sgt-lms/controllers/
    echo "✅ Updated deanController.js with getRecentActivity"
fi
if [ -f "controllers/teacherController.js" ]; then
    sudo cp controllers/teacherController.js /opt/sgt-lms/controllers/
    echo "✅ Updated teacherController.js"
fi

# Copy updated route files
if [ -f "routes/admin.js" ]; then
    sudo cp routes/admin.js /opt/sgt-lms/routes/
    echo "✅ Updated admin.js routes"
fi
if [ -f "routes/hod.js" ]; then
    sudo cp routes/hod.js /opt/sgt-lms/routes/
    echo "✅ Updated hod.js routes"
fi
if [ -f "routes/dean.js" ]; then
    sudo cp routes/dean.js /opt/sgt-lms/routes/
    echo "✅ Updated dean.js routes"
fi
if [ -f "routes/teacher.js" ]; then
    sudo cp routes/teacher.js /opt/sgt-lms/routes/
    echo "✅ Updated teacher.js routes"
fi

# Set ownership
sudo chown -R sgt-lms:sgt-lms /opt/sgt-lms/
echo "✅ Updated backend files ownership"

# Install any new dependencies
echo "📦 Installing backend dependencies..."
cd /opt/sgt-lms
sudo -u sgt-lms npm install --production
echo "✅ Dependencies updated"

# Restart Services
echo "🔄 Restarting services..."

# Restart backend to load new Recent Activity endpoints
sudo systemctl stop sgt-lms-backend
sleep 3
sudo systemctl start sgt-lms-backend
sleep 5

if sudo systemctl is-active --quiet sgt-lms-backend; then
    echo "✅ Backend restarted successfully with Recent Activity fixes"
else
    echo "❌ Backend failed to start"
    sudo systemctl status sgt-lms-backend --no-pager -l
    echo "📋 Checking backend logs..."
    sudo journalctl -u sgt-lms-backend --no-pager -l --since "5 minutes ago"
fi

# Restart nginx
sudo systemctl reload nginx
if sudo systemctl is-active --quiet nginx; then
    echo "✅ Nginx reloaded successfully"
else
    echo "❌ Nginx failed to reload"
    sudo systemctl status nginx --no-pager -l
fi

# Test the new Recent Activity endpoints
echo "🧪 Testing Recent Activity endpoints..."

# Test admin endpoint
curl -s -o /dev/null -w "%{http_code}" "http://localhost:5000/api/admin/audit-logs/recent" | \
    (read code; [ "$code" = "200" ] && echo "✅ Admin Recent Activity API: OK" || echo "⚠️ Admin Recent Activity API: HTTP $code")

# Create a simple endpoint test script for logged-in users
cat > /tmp/test-recent-activity.js << 'EOF'
const axios = require('axios');

const testEndpoints = async () => {
    const baseURL = 'http://localhost:5000/api';
    
    // Test endpoints that don't require authentication first
    const publicEndpoints = [
        '/admin/audit-logs/recent',
        '/hod/activity/recent', 
        '/dean/activity/recent',
        '/teacher/activity/recent'
    ];
    
    for (const endpoint of publicEndpoints) {
        try {
            const response = await axios.get(`${baseURL}${endpoint}`, { 
                timeout: 5000,
                validateStatus: () => true // Accept any status code
            });
            
            if (response.status === 401) {
                console.log(`🔒 ${endpoint}: Requires authentication (expected)`);
            } else if (response.status === 200) {
                console.log(`✅ ${endpoint}: OK`);
            } else {
                console.log(`⚠️  ${endpoint}: HTTP ${response.status}`);
            }
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                console.log(`❌ ${endpoint}: Backend not responding`);
            } else {
                console.log(`⚠️  ${endpoint}: ${error.message}`);
            }
        }
    }
};

testEndpoints().catch(console.error);
EOF

# Run the endpoint test if Node.js is available
if command -v node &> /dev/null; then
    cd /opt/sgt-lms && sudo -u sgt-lms node /tmp/test-recent-activity.js
else
    echo "ℹ️  Node.js not available for endpoint testing"
fi

# Clean up
rm -f /tmp/frontend-recent-activity-fix.*
rm -f /tmp/backend-recent-activity-fix.*
rm -rf /tmp/controllers /tmp/routes
rm -f /tmp/test-recent-activity.js

echo ""
echo "🎉 Recent Activity fixes deployment completed!"
echo "🌐 Frontend: https://13.233.135.233"
echo "🔧 Backend: https://13.233.135.233/api"

# Show service status
echo ""
echo "📊 Service Status:"
sudo systemctl status sgt-lms-backend --no-pager -l | head -10
echo ""
sudo systemctl status nginx --no-pager -l | head -5

echo ""
echo "✅ Recent Activity Features Added:"
echo "   🎯 Admin Dashboard: Enhanced recent activity display"
echo "   👨‍💼 HOD Dashboard: New /api/hod/activity/recent endpoint" 
echo "   🎓 Dean Dashboard: New /api/dean/activity/recent endpoint"
echo "   👨‍🏫 Teacher Dashboard: New /api/teacher/activity/recent endpoint"
echo "   🔄 Auto-refresh every 30 seconds"
echo "   💫 Real-time activity tracking"
echo ""
echo "🧪 Test Recent Activity in dashboards:"
echo "   👨‍💼 HOD: https://13.233.135.233/hod/dashboard"
echo "   🎓 Dean: https://13.233.135.233/dean/dashboard" 
echo "   👨‍🏫 Teacher: https://13.233.135.233/teacher/dashboard"
echo "   👑 Admin: https://13.233.135.233/admin/dashboard"
'@

# Save deploy script to temp file and upload
$deployScript | Out-File -FilePath "deploy-recent-activity-script.sh" -Encoding UTF8
scp -i $KEY_PATH "deploy-recent-activity-script.sh" "${EC2_USER}@${EC2_IP}:/tmp/"

# Execute deployment script on EC2
Write-Host "🚀 Executing Recent Activity deployment on EC2..." -ForegroundColor Blue
ssh -i $KEY_PATH "${EC2_USER}@${EC2_IP}" "chmod +x /tmp/deploy-recent-activity-script.sh && sudo /tmp/deploy-recent-activity-script.sh"

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n🎉 Recent Activity fixes deployment completed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🌐 Your application with Recent Activity fixes is now available at:" -ForegroundColor Blue
    Write-Host "   Frontend: https://$EC2_IP" -ForegroundColor Cyan
    Write-Host "   Backend API: https://$EC2_IP/api" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📋 Test Recent Activity in these dashboards:" -ForegroundColor Yellow
    Write-Host "   👑 Admin Dashboard: https://$EC2_IP/admin/dashboard" -ForegroundColor Gray
    Write-Host "   👨‍💼 HOD Dashboard: https://$EC2_IP/hod/dashboard" -ForegroundColor Gray  
    Write-Host "   🎓 Dean Dashboard: https://$EC2_IP/dean/dashboard" -ForegroundColor Gray
    Write-Host "   👨‍🏫 Teacher Dashboard: https://$EC2_IP/teacher/dashboard" -ForegroundColor Gray
    Write-Host ""
    Write-Host "✨ New Features:" -ForegroundColor Green
    Write-Host "   📊 Recent activity now loads properly in all dashboards" -ForegroundColor Gray
    Write-Host "   🔄 Auto-refresh every 30 seconds for real-time updates" -ForegroundColor Gray
    Write-Host "   🎯 Role-specific activity feeds (student progress, quiz attempts)" -ForegroundColor Gray
    Write-Host "   💫 Enhanced error handling and loading states" -ForegroundColor Gray
    Write-Host ""
    Write-Host "✅ All Recent Activity issues should now be resolved!" -ForegroundColor Green
} else {
    Write-Host "`n❌ Deployment failed! Check the output above for errors." -ForegroundColor Red
    Write-Host "💡 Common issues:" -ForegroundColor Yellow
    Write-Host "   🔑 Check if PEM key permissions are correct (chmod 400)" -ForegroundColor Gray
    Write-Host "   🌐 Verify EC2 instance is running and accessible" -ForegroundColor Gray
    Write-Host "   📡 Check if security groups allow SSH (port 22)" -ForegroundColor Gray
}

# Clean up local files
Write-Host "`n🧹 Cleaning up local files..." -ForegroundColor Gray
Remove-Item -Path "temp-backend-recent-activity" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "frontend-recent-activity-fix.*" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "backend-recent-activity-fix.*" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "deploy-recent-activity-script.sh" -Force -ErrorAction SilentlyContinue

Write-Host "🏁 Recent Activity fixes deployment script completed!" -ForegroundColor Green