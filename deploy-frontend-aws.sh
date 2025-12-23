#!/bin/bash

echo "🚀 Deploying SGT-LMS Frontend to AWS EC2..."

# Set AWS EC2 details
EC2_IP="13.233.135.233"
EC2_USER="ubuntu"  # or ec2-user depending on your AMI
KEY_PATH="./sgt-lmskey.pem"  # Update this path

# Set environment variables
export REACT_APP_BACKEND_URL="https://${EC2_IP}:5000"
export REACT_APP_ENVIRONMENT="production"
export REACT_APP_API_BASE_URL="https://${EC2_IP}:5000/api"

echo "📋 Building frontend with production settings..."
echo "   Backend URL: $REACT_APP_BACKEND_URL"

# Navigate to frontend directory
cd frontend

# Install dependencies if needed
echo "📦 Installing dependencies..."
npm install

# Build the production version
echo "🔨 Building production build..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed! Check the errors above."
    exit 1
fi

echo "✅ Build completed successfully!"

# Create deployment directory structure
echo "📁 Preparing deployment files..."
cd build
tar -czf ../frontend-build.tar.gz *
cd ..

echo "📤 Uploading to EC2..."

# Upload the build to EC2
scp -i "$KEY_PATH" frontend-build.tar.gz "$EC2_USER@$EC2_IP:/tmp/"

if [ $? -ne 0 ]; then
    echo "❌ Upload failed! Check your SSH key and EC2 connection."
    exit 1
fi

echo "🔧 Deploying on EC2..."

# SSH into EC2 and deploy
ssh -i "$KEY_PATH" "$EC2_USER@$EC2_IP" << 'ENDSSH'
    # Navigate to web directory (adjust path as needed)
    sudo mkdir -p /var/www/html
    cd /var/www/html
    
    # Backup existing frontend if any
    if [ -d "frontend" ]; then
        sudo mv frontend "frontend_backup_$(date +%Y%m%d_%H%M%S)"
    fi
    
    # Extract new frontend
    sudo mkdir frontend
    cd frontend
    sudo tar -xzf /tmp/frontend-build.tar.gz
    
    # Set proper permissions
    sudo chown -R www-data:www-data /var/www/html/frontend
    sudo chmod -R 755 /var/www/html/frontend
    
    # Clean up
    rm /tmp/frontend-build.tar.gz
    
    echo "✅ Frontend deployed successfully!"
    
    # Restart nginx if needed
    sudo systemctl reload nginx
    
    echo "🌐 Frontend is now live at: https://13.233.135.233"
ENDSSH

if [ $? -eq 0 ]; then
    echo "🎉 Deployment completed successfully!"
    echo "🌐 Your application is now available at: https://$EC2_IP"
    echo ""
    echo "📋 Next steps:"
    echo "   1. Test the dean analytics pages"
    echo "   2. Check browser console for any remaining errors"
    echo "   3. Verify all API endpoints are working"
else
    echo "❌ Deployment failed on EC2!"
fi

# Clean up local files
rm -f frontend-build.tar.gz

echo "🏁 Done!"