#!/bin/bash

# SSL Setup Script for VirtualInvestigation.xyz
# Run this script after DNS records are properly configured

echo "🔒 Setting up SSL certificates for virtualinvestigation.xyz domains..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Please run as root (use sudo)"
    exit 1
fi

# Generate Let's Encrypt certificates
echo "📜 Generating Let's Encrypt certificates..."
certbot certonly --nginx \
    -d kyc.virtualinvestigation.xyz \
    -d backend.virtualinvestigation.xyz \
    --non-interactive \
    --agree-tos \
    --email admin@virtualinvestigation.xyz

if [ $? -eq 0 ]; then
    echo "✅ Certificates generated successfully!"
    
    # Update nginx config to use Let's Encrypt certificates
    echo "📝 Updating nginx configuration..."
    
    # Update frontend server block
    sed -i 's|ssl_certificate /etc/nginx/ssl/virtualinvestigation.xyz/kyc.crt;|ssl_certificate /etc/letsencrypt/live/kyc.virtualinvestigation.xyz/fullchain.pem;|g' /etc/nginx/sites-available/video-kyc
    sed -i 's|ssl_certificate_key /etc/nginx/ssl/virtualinvestigation.xyz/kyc.key;|ssl_certificate_key /etc/letsencrypt/live/kyc.virtualinvestigation.xyz/privkey.pem;|g' /etc/nginx/sites-available/video-kyc
    
    # Update backend server block
    sed -i 's|ssl_certificate /etc/nginx/ssl/virtualinvestigation.xyz/kyc.crt;|ssl_certificate /etc/letsencrypt/live/backend.virtualinvestigation.xyz/fullchain.pem;|g' /etc/nginx/sites-available/video-kyc
    sed -i 's|ssl_certificate_key /etc/nginx/ssl/virtualinvestigation.xyz/kyc.key;|ssl_certificate_key /etc/letsencrypt/live/backend.virtualinvestigation.xyz/privkey.pem;|g' /etc/nginx/sites-available/video-kyc
    
    # Add SSL stapling
    sed -i '/ssl_session_timeout/a\    ssl_stapling on;\n    ssl_stapling_verify on;' /etc/nginx/sites-available/video-kyc
    
    # Test and reload nginx
    nginx -t && systemctl reload nginx
    
    echo "✅ SSL setup complete with Let's Encrypt certificates!"
    echo "📋 Certificate auto-renewal is enabled by default"
else
    echo "❌ Certificate generation failed. Please check DNS records."
    echo "💡 Make sure DNS A records point to this server:"
    echo "   - kyc.virtualinvestigation.xyz -> $(curl -s ifconfig.me)"
    echo "   - backend.virtualinvestigation.xyz -> $(curl -s ifconfig.me)"
fi

