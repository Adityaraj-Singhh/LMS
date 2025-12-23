#!/bin/bash
# Complete deployment script for LMS with Bunny Stream
# This script deploys backend, builds and deploys frontend, and configures nginx

set -e  # Exit on any error

echo "======================================"
echo "LMS Bunny Stream - Complete Deployment"
echo "======================================"
echo ""

REMOTE_DIR="/home/ubuntu/lms-bunny"
BACKEND_PORT=5000
FRONTEND_PORT=3000

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Step 1: Extracting uploaded files...${NC}"
cd ~
mkdir -p $REMOTE_DIR
cd $REMOTE_DIR

if [ -f ~/backend.tar.gz ]; then
    echo "Extracting backend..."
    tar -xzf ~/backend.tar.gz
    rm ~/backend.tar.gz
else
    echo -e "${RED}Error: backend.tar.gz not found in home directory${NC}"
    exit 1
fi

if [ -f ~/frontend.tar.gz ]; then
    echo "Extracting frontend..."
    tar -xzf ~/frontend.tar.gz
    rm ~/frontend.tar.gz
else
    echo -e "${RED}Error: frontend.tar.gz not found in home directory${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Files extracted${NC}"
echo ""

echo -e "${YELLOW}Step 2: Checking system dependencies...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "Installing Node.js 18.x..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "✓ Node.js already installed: $(node --version)"
fi

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}npm not found, installing...${NC}"
    sudo apt-get install -y npm
else
    echo "✓ npm already installed: $(npm --version)"
fi

# Check PM2
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    sudo npm install -g pm2
else
    echo "✓ PM2 already installed: $(pm2 --version)"
fi

# Check MongoDB
if ! command -v mongod &> /dev/null; then
    echo "Installing MongoDB..."
    wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
    echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
    sudo apt-get update
    sudo apt-get install -y mongodb-org
    sudo systemctl start mongod
    sudo systemctl enable mongod
else
    echo "✓ MongoDB already installed"
    sudo systemctl start mongod || true
fi

# Check nginx
if ! command -v nginx &> /dev/null; then
    echo "Installing nginx..."
    sudo apt-get install -y nginx
else
    echo "✓ nginx already installed"
fi

echo -e "${GREEN}✓ System dependencies ready${NC}"
echo ""

echo -e "${YELLOW}Step 3: Setting up environment files...${NC}"

# Create backend .env if it doesn't exist
if [ ! -f "$REMOTE_DIR/backend/.env" ]; then
    cat > $REMOTE_DIR/backend/.env << 'EOF'
# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/lms_db

# JWT Secret - CHANGE THIS TO A SECURE RANDOM STRING
JWT_SECRET=your-super-secure-jwt-secret-change-me-$(date +%s)

# Server Configuration
PORT=5000
NODE_ENV=production

# Bunny Stream Configuration (Video CDN - No S3!)
BUNNY_STREAM_API_KEY=e8bb584d-2f33-4e3f-ac5c52298c8e-4089-4fd6
BUNNY_LIBRARY_ID=567095
BUNNY_CDN_HOSTNAME=vz-6b31636e-f82.b-cdn.net
BUNNY_MAX_RESOLUTION=720
BUNNY_DEFAULT_QUALITY=360

# Redis Configuration (optional)
REDIS_HOST=localhost
REDIS_PORT=6379

# CORS Origin
CORS_ORIGIN=http://13.203.194.3

# Email Configuration (optional)
# EMAIL_SERVICE=gmail
# EMAIL_USER=your-email@gmail.com
# EMAIL_PASSWORD=your-app-password
EOF
    echo -e "${GREEN}✓ Created backend/.env${NC}"
    echo -e "${YELLOW}  IMPORTANT: Edit backend/.env and update JWT_SECRET!${NC}"
else
    echo "✓ backend/.env already exists"
fi

# Get EC2 public IP
EC2_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 || echo "localhost")

# Create frontend .env.production
cat > $REMOTE_DIR/frontend/.env.production << EOF
REACT_APP_API_URL=http://${EC2_IP}:${BACKEND_PORT}
REACT_APP_NAME=SGT LMS with Bunny Stream
EOF

echo -e "${GREEN}✓ Created frontend/.env.production (API URL: http://${EC2_IP}:${BACKEND_PORT})${NC}"
echo ""

echo -e "${YELLOW}Step 4: Installing backend dependencies...${NC}"
cd $REMOTE_DIR/backend
npm install --production
echo -e "${GREEN}✓ Backend dependencies installed${NC}"
echo ""

echo -e "${YELLOW}Step 5: Verifying Bunny Stream migration (no S3)...${NC}"
if grep -q "aws-sdk\|multer-s3" package.json 2>/dev/null; then
    echo -e "${RED}⚠ WARNING: Found S3 dependencies in package.json${NC}"
    grep "aws-sdk\|multer-s3" package.json
else
    echo -e "${GREEN}✓ No S3 dependencies found${NC}"
fi

if [ -f "services/bunnyStreamService.js" ]; then
    echo -e "${GREEN}✓ bunnyStreamService.js exists${NC}"
else
    echo -e "${RED}⚠ WARNING: bunnyStreamService.js not found${NC}"
fi
echo ""

echo -e "${YELLOW}Step 6: Installing frontend dependencies...${NC}"
cd $REMOTE_DIR/frontend
npm install

# Check for hls.js
if grep -q "hls.js" package.json; then
    echo -e "${GREEN}✓ hls.js dependency found for Bunny Stream${NC}"
else
    echo -e "${RED}⚠ WARNING: hls.js not found in package.json${NC}"
fi
echo ""

echo -e "${YELLOW}Step 7: Building frontend for production...${NC}"
npm run build
echo -e "${GREEN}✓ Frontend build complete${NC}"
echo ""

echo -e "${YELLOW}Step 8: Stopping existing PM2 processes...${NC}"
pm2 stop all || true
pm2 delete all || true
echo ""

echo -e "${YELLOW}Step 9: Starting backend with PM2...${NC}"
cd $REMOTE_DIR/backend
pm2 start npm --name "lms-backend-bunny" -- start
echo -e "${GREEN}✓ Backend started on port ${BACKEND_PORT}${NC}"
echo ""

echo -e "${YELLOW}Step 10: Deploying frontend to nginx...${NC}"
sudo mkdir -p /var/www/html
sudo rm -rf /var/www/html/*
sudo cp -r $REMOTE_DIR/frontend/build/* /var/www/html/
sudo chown -R www-data:www-data /var/www/html
echo -e "${GREEN}✓ Frontend deployed to /var/www/html${NC}"
echo ""

echo -e "${YELLOW}Step 11: Configuring nginx for Bunny Stream (3GB upload limit)...${NC}"

# Create nginx configuration
sudo tee /etc/nginx/sites-available/lms-bunny > /dev/null << 'NGINXCONF'
server {
    listen 80;
    server_name _;
    
    # 3GB upload limit for Bunny Stream video uploads
    client_max_body_size 3G;
    
    # Force streaming - do NOT write to disk
    client_body_in_file_only off;
    client_body_in_single_buffer off;
    
    # Extended timeouts for large video uploads
    proxy_connect_timeout 1800s;
    proxy_send_timeout 1800s;
    proxy_read_timeout 1800s;
    send_timeout 1800s;
    client_body_timeout 1800s;
    client_header_timeout 1800s;
    keepalive_timeout 1800s;
    
    # Handle Socket.IO connections
    location /socket.io/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    # Proxy API requests to backend
    location /api/ {
        proxy_pass http://localhost:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection '';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Extended timeouts for Bunny Stream uploads
        proxy_connect_timeout 1800s;
        proxy_send_timeout 1800s;
        proxy_read_timeout 1800s;
        
        # CRITICAL: Disable buffering for streaming to Bunny
        proxy_request_buffering off;
        proxy_buffering off;
    }

    # Serve React frontend
    location / {
        root /var/www/html;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;
    }

    # Static assets caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|webp)$ {
        root /var/www/html;
        expires 1y;
        add_header Cache-Control "public, no-transform";
    }

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;
}
NGINXCONF

# Enable the site
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/lms-bunny /etc/nginx/sites-enabled/

# Test nginx configuration
if sudo nginx -t; then
    echo -e "${GREEN}✓ nginx configuration valid${NC}"
    sudo systemctl restart nginx
    echo -e "${GREEN}✓ nginx restarted${NC}"
else
    echo -e "${RED}✗ nginx configuration error${NC}"
    exit 1
fi
echo ""

echo -e "${YELLOW}Step 12: Saving PM2 configuration...${NC}"
pm2 save
pm2 startup | tail -n 1 | sudo bash || true
echo -e "${GREEN}✓ PM2 configured to start on boot${NC}"
echo ""

echo -e "${YELLOW}Step 13: Checking deployment status...${NC}"
echo ""
echo "PM2 Processes:"
pm2 status
echo ""
echo "nginx status:"
sudo systemctl status nginx --no-pager | grep "Active:"
echo ""

echo -e "${GREEN}======================================"
echo "Deployment Complete!"
echo "======================================${NC}"
echo ""
echo -e "${GREEN}Application URLs:${NC}"
echo -e "  Frontend: http://${EC2_IP}"
echo -e "  Backend API: http://${EC2_IP}/api"
echo ""
echo -e "${GREEN}Bunny Stream Configuration:${NC}"
echo -e "  Library ID: 567095"
echo -e "  CDN: vz-6b31636e-f82.b-cdn.net"
echo -e "  Max Resolution: 720p"
echo -e "  Default Quality: 360p"
echo -e "  ${GREEN}✓ No S3 - Using Bunny Stream only!${NC}"
echo ""
echo -e "${YELLOW}Important Notes:${NC}"
echo -e "  1. Videos upload directly to Bunny Stream (no S3)"
echo -e "  2. 3GB upload limit configured in nginx"
echo -e "  3. HLS streaming with quality selector (360p default)"
echo -e "  4. Update backend/.env JWT_SECRET for security"
echo ""
echo -e "${YELLOW}Useful Commands:${NC}"
echo -e "  pm2 logs                  - View all logs"
echo -e "  pm2 restart all           - Restart services"
echo -e "  sudo systemctl restart nginx - Restart nginx"
echo -e "  pm2 monit                 - Monitor processes"
echo ""
echo -e "${YELLOW}Test the deployment:${NC}"
echo -e "  curl http://localhost:5000/api/health"
echo -e "  curl http://localhost"
echo ""
