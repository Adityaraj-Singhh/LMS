#!/bin/bash

# SGT-LMS EC2 Environment Setup Script
# This script sets up Node.js, PM2, Nginx and runs the application

set -e

echo "🚀 Setting up SGT-LMS on EC2..."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Update system
echo -e "${YELLOW}Updating system packages...${NC}"
sudo apt-get update -y

# Install Node.js 18.x
echo -e "${YELLOW}Installing Node.js...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Install build tools
echo -e "${YELLOW}Installing build tools...${NC}"
sudo apt-get install -y build-essential git

# Install PM2 globally
echo -e "${YELLOW}Installing PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
fi

# Install Nginx
echo -e "${YELLOW}Installing Nginx...${NC}"
if ! command -v nginx &> /dev/null; then
    sudo apt-get install -y nginx
fi

# Navigate to project directory
cd ~/sgt-lms

# Install backend dependencies
echo -e "${YELLOW}Installing backend dependencies...${NC}"
cd backend
npm install --production

# Configure Nginx
echo -e "${YELLOW}Configuring Nginx...${NC}"
sudo cp ../nginx-ec2.conf /etc/nginx/sites-available/sgt-lms
sudo ln -sf /etc/nginx/sites-available/sgt-lms /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t

# Start services
echo -e "${YELLOW}Starting backend with PM2...${NC}"
pm2 start server.js --name "sgt-lms-backend"
pm2 save
pm2 startup

# Start Nginx
echo -e "${YELLOW}Starting Nginx...${NC}"
sudo systemctl start nginx
sudo systemctl enable nginx

# Configure firewall (if UFW is enabled)
echo -e "${YELLOW}Configuring firewall...${NC}"
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 5000/tcp

echo -e "${GREEN}✅ SGT-LMS setup completed successfully!${NC}"
echo -e "${BLUE}Services status:${NC}"
echo -e "Backend (PM2): $(pm2 list | grep sgt-lms-backend || echo 'Not running')"
echo -e "Nginx: $(sudo systemctl is-active nginx)"

echo -e "${BLUE}Access your application:${NC}"
echo -e "Frontend: http://$(curl -s ifconfig.me)"
echo -e "Backend API: http://$(curl -s ifconfig.me):5000"

echo -e "${YELLOW}Useful commands:${NC}"
echo -e "View backend logs: pm2 logs sgt-lms-backend"
echo -e "Restart backend: pm2 restart sgt-lms-backend"
echo -e "View nginx logs: sudo journalctl -u nginx -f"
echo -e "Restart nginx: sudo systemctl restart nginx"