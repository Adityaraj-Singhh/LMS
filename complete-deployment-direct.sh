#!/bin/bash
# Complete deployment for directly uploaded backend and frontend (no zip extraction)

set -e

echo "======================================"
echo "LMS Bunny Stream - Direct Deployment"
echo "======================================"
echo ""

REMOTE_DIR="/home/ubuntu/lms-bunny"
BACKEND_PORT=5000

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Step 1: Checking uploaded files...${NC}"
if [ ! -d "$REMOTE_DIR/backend" ]; then
    echo -e "${RED}Error: Backend folder not found at $REMOTE_DIR/backend${NC}"
    echo "Please upload backend folder first"
    exit 1
fi

if [ ! -d "$REMOTE_DIR/frontend/build" ]; then
    echo -e "${RED}Error: Frontend build folder not found at $REMOTE_DIR/frontend/build${NC}"
    echo "Please build frontend locally and upload build folder"
    exit 1
fi

echo -e "${GREEN}✓ Backend and frontend files found${NC}"
echo ""

echo -e "${YELLOW}Step 2: Installing system dependencies...${NC}"

# Update system
sudo apt update

# Install Node.js 18.x
if ! command -v node &> /dev/null; then
    echo "Installing Node.js 18.x..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "✓ Node.js: $(node --version)"
fi

# Install PM2
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    sudo npm install -g pm2
else
    echo "✓ PM2: $(pm2 --version)"
fi

# Install MongoDB
if ! command -v mongod &> /dev/null; then
    echo "Installing MongoDB..."
    wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
    echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
    sudo apt-get update
    sudo apt-get install -y mongodb-org
    sudo systemctl start mongod
    sudo systemctl enable mongod
else
    echo "✓ MongoDB installed"
    sudo systemctl start mongod || true
fi

# Install nginx
if ! command -v nginx &> /dev/null; then
    echo "Installing nginx..."
    sudo apt-get install -y nginx
else
    echo "✓ nginx installed"
fi

echo -e "${GREEN}✓ System dependencies ready${NC}"
echo ""

echo -e "${YELLOW}Step 3: Configuring environment files...${NC}"

# Get EC2 IP
EC2_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 || echo "13.203.194.3")

# Create backend .env
if [ ! -f "$REMOTE_DIR/backend/.env" ]; then
    cat > $REMOTE_DIR/backend/.env << EOF
# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/lms_db

# JWT Secret
JWT_SECRET=bunny-lms-jwt-secret-$(date +%s)-change-me

# Server Configuration
PORT=5000
NODE_ENV=production

# Bunny Stream Configuration (NO S3!)
BUNNY_STREAM_API_KEY=e8bb584d-2f33-4e3f-ac5c52298c8e-4089-4fd6
BUNNY_LIBRARY_ID=567095
BUNNY_CDN_HOSTNAME=vz-6b31636e-f82.b-cdn.net
BUNNY_MAX_RESOLUTION=720
BUNNY_DEFAULT_QUALITY=360

# Redis (optional)
REDIS_HOST=localhost
REDIS_PORT=6379

# CORS Origin
CORS_ORIGIN=http://${EC2_IP}
EOF
    echo -e "${GREEN}✓ Created backend/.env${NC}"
else
    echo "✓ backend/.env exists"
fi

echo ""

echo -e "${YELLOW}Step 4: Installing backend dependencies...${NC}"
cd $REMOTE_DIR/backend
npm install --production
echo -e "${GREEN}✓ Backend dependencies installed${NC}"
echo ""

echo -e "${YELLOW}Step 5: Verifying Bunny Stream (no S3)...${NC}"
if grep -q "aws-sdk\|multer-s3" package.json 2>/dev/null; then
    echo -e "${RED}⚠ WARNING: S3 dependencies found${NC}"
else
    echo -e "${GREEN}✓ No S3 dependencies${NC}"
fi

if [ -f "services/bunnyStreamService.js" ]; then
    echo -e "${GREEN}✓ bunnyStreamService.js exists${NC}"
else
    echo -e "${RED}⚠ bunnyStreamService.js missing${NC}"
fi

if grep -q "hls.js" $REMOTE_DIR/frontend/build/index.html 2>/dev/null || [ -f "$REMOTE_DIR/frontend/build/static/js/main.*.js" ]; then
    echo -e "${GREEN}✓ Frontend build includes HLS.js${NC}"
fi
echo ""

echo -e "${YELLOW}Step 6: Stopping existing services...${NC}"
pm2 stop all || true
pm2 delete all || true
echo ""

echo -e "${YELLOW}Step 7: Starting backend with PM2...${NC}"
cd $REMOTE_DIR/backend
pm2 start npm --name "lms-backend-bunny" -- start
echo -e "${GREEN}✓ Backend started on port ${BACKEND_PORT}${NC}"
echo ""

echo -e "${YELLOW}Step 8: Deploying frontend to nginx...${NC}"
sudo mkdir -p /var/www/html
sudo rm -rf /var/www/html/*
sudo cp -r $REMOTE_DIR/frontend/build/* /var/www/html/
sudo chown -R www-data:www-data /var/www/html
echo -e "${GREEN}✓ Frontend deployed to /var/www/html${NC}"
echo ""

echo -e "${YELLOW}Step 9: Configuring nginx (3GB limit for Bunny Stream)...${NC}"

# Check if nginx config exists in home
if [ -f ~/nginx-bunny-3gb.conf ]; then
    sudo cp ~/nginx-bunny-3gb.conf /etc/nginx/sites-available/lms-bunny
else
    # Create default config
    sudo tee /etc/nginx/sites-available/lms-bunny > /dev/null << 'NGINXCONF'
server {
    listen 80;
    server_name _;
    
    # 3GB upload limit for Bunny Stream
    client_max_body_size 3G;
    client_body_in_file_only off;
    client_body_in_single_buffer off;
    
    # Extended timeouts
    proxy_connect_timeout 1800s;
    proxy_send_timeout 1800s;
    proxy_read_timeout 1800s;
    send_timeout 1800s;
    client_body_timeout 1800s;
    client_header_timeout 1800s;
    keepalive_timeout 1800s;
    
    # Socket.IO
    location /socket.io/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    # API to backend
    location /api/ {
        proxy_pass http://localhost:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # Critical for Bunny Stream uploads
        proxy_request_buffering off;
        proxy_buffering off;
        proxy_connect_timeout 1800s;
        proxy_send_timeout 1800s;
        proxy_read_timeout 1800s;
    }

    # Frontend
    location / {
        root /var/www/html;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|webp)$ {
        root /var/www/html;
        expires 1y;
        add_header Cache-Control "public, no-transform";
    }

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;
}
NGINXCONF
fi

# Enable site
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/lms-bunny /etc/nginx/sites-enabled/

# Test and restart nginx
if sudo nginx -t; then
    echo -e "${GREEN}✓ nginx configuration valid${NC}"
    sudo systemctl restart nginx
    echo -e "${GREEN}✓ nginx restarted${NC}"
else
    echo -e "${RED}✗ nginx configuration error${NC}"
    exit 1
fi
echo ""

echo -e "${YELLOW}Step 10: Saving PM2 configuration...${NC}"
pm2 save
pm2 startup | tail -n 1 | sudo bash || true
echo ""

echo -e "${YELLOW}Step 11: Deployment status...${NC}"
echo ""
pm2 status
echo ""
sudo systemctl status nginx --no-pager | grep "Active:"
echo ""

echo -e "${GREEN}======================================"
echo "Deployment Complete!"
echo "======================================${NC}"
echo ""
echo -e "${GREEN}Access URLs:${NC}"
echo -e "  Frontend: http://${EC2_IP}"
echo -e "  Backend: http://${EC2_IP}/api"
echo ""
echo -e "${GREEN}Bunny Stream Active:${NC}"
echo -e "  Library: 567095"
echo -e "  CDN: vz-6b31636e-f82.b-cdn.net"
echo -e "  Quality: 360p default, 720p max"
echo -e "  ${GREEN}✓ NO S3 - Pure Bunny Stream${NC}"
echo ""
echo -e "${YELLOW}Quick Commands:${NC}"
echo -e "  pm2 logs                   # View logs"
echo -e "  pm2 restart all            # Restart"
echo -e "  pm2 monit                  # Monitor"
echo ""
