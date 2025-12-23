#!/bin/bash

# Script to setup nginx configurations for Video KYC project
# This script links the nginx config files to nginx sites-available directory

echo "Setting up nginx configurations..."

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    echo "Please run with sudo: sudo bash setup-nginx.sh"
    exit 1
fi

# Path to nginx configs
NGINX_DIR="/home/ubuntu/video_kyc"
SITES_AVAILABLE="/etc/nginx/sites-available"
SITES_ENABLED="/etc/nginx/sites-enabled"

# Create symlinks for each nginx config
echo "Creating symlinks..."

# KYC Frontend
if [ -f "$NGINX_DIR/nginx-kyc.conf" ]; then
    ln -sf "$NGINX_DIR/nginx-kyc.conf" "$SITES_AVAILABLE/kyc.virtualinvestigation.xyz"
    ln -sf "$SITES_AVAILABLE/kyc.virtualinvestigation.xyz" "$SITES_ENABLED/kyc.virtualinvestigation.xyz"
    echo "✓ Linked kyc.virtualinvestigation.xyz"
else
    echo "✗ nginx-kyc.conf not found"
fi

# Backend API
if [ -f "$NGINX_DIR/nginx-backend.conf" ]; then
    ln -sf "$NGINX_DIR/nginx-backend.conf" "$SITES_AVAILABLE/backend.virtualinvestigation.xyz"
    ln -sf "$SITES_AVAILABLE/backend.virtualinvestigation.xyz" "$SITES_ENABLED/backend.virtualinvestigation.xyz"
    echo "✓ Linked backend.virtualinvestigation.xyz"
else
    echo "✗ nginx-backend.conf not found"
fi

# Admin Panel
if [ -f "$NGINX_DIR/nginx-admin.conf" ]; then
    ln -sf "$NGINX_DIR/nginx-admin.conf" "$SITES_AVAILABLE/admin.virtualinvestigation.xyz"
    ln -sf "$SITES_AVAILABLE/admin.virtualinvestigation.xyz" "$SITES_ENABLED/admin.virtualinvestigation.xyz"
    echo "✓ Linked admin.virtualinvestigation.xyz"
else
    echo "✗ nginx-admin.conf not found"
fi

# Test nginx configuration
echo ""
echo "Testing nginx configuration..."
nginx -t

if [ $? -eq 0 ]; then
    echo ""
    echo "✓ Nginx configuration is valid!"
    echo ""
    echo "Next steps:"
    echo "1. Make sure SSL certificates are installed for all domains"
    echo "2. Update SSL certificate paths in nginx configs if needed"
    echo "3. Run: sudo systemctl reload nginx"
    echo "4. Build frontend: cd frontend && npm run build"
    echo "5. Start backend: pm2 start ecosystem.config.js"
else
    echo ""
    echo "✗ Nginx configuration has errors. Please fix them before reloading."
fi
