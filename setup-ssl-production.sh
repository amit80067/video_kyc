#!/bin/bash

# SSL Setup Script for Production Domains
# Run this script after DNS records are properly configured

echo "🔒 Setting up SSL certificates for production domains..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Please run as root (use sudo)"
    exit 1
fi

# Check if email is provided
if [ -z "$1" ]; then
    echo "Usage: sudo bash setup-ssl-production.sh <email>"
    echo "Example: sudo bash setup-ssl-production.sh admin@virtualinvestigation.xyz"
    exit 1
fi

EMAIL=$1
DOMAINS="kyc.virtualinvestigation.xyz backend.virtualinvestigation.xyz admin.virtualinvestigation.xyz"

echo "📧 Email: $EMAIL"
echo "🌐 Domains: $DOMAINS"
echo ""

# First, setup nginx configs (without SSL - will use temporary self-signed certs)
echo "📝 Setting up nginx configurations..."
bash /home/ubuntu/video_kyc/setup-nginx.sh

# Check if nginx is running
if ! systemctl is-active --quiet nginx; then
    echo "🔄 Starting nginx..."
    systemctl start nginx
fi

# Generate Let's Encrypt certificates for each domain
echo "📜 Generating Let's Encrypt certificates..."

for domain in $DOMAINS; do
    echo ""
    echo "🔐 Setting up SSL for $domain..."
    certbot certonly --nginx \
        -d $domain \
        --non-interactive \
        --agree-tos \
        --email $EMAIL \
        --redirect
    
    if [ $? -eq 0 ]; then
        echo "✅ Certificate generated for $domain"
    else
        echo "❌ Failed to generate certificate for $domain"
        echo "💡 Make sure DNS A record points to this server:"
        echo "   $domain -> $(curl -s ifconfig.me 2>/dev/null || echo 'Unable to detect IP')"
    fi
done

# Test nginx configuration
echo ""
echo "🧪 Testing nginx configuration..."
nginx -t

if [ $? -eq 0 ]; then
    echo "🔄 Reloading nginx..."
    systemctl reload nginx
    echo ""
    echo "✅ SSL setup complete!"
    echo ""
    echo "🔐 Your domains are now secured with Let's Encrypt SSL"
    echo "🔄 Certificates will auto-renew via certbot timer"
    echo ""
    echo "📍 Access your application:"
    for domain in $DOMAINS; do
        echo "   - https://$domain"
    done
    echo ""
    echo "📋 To check certificate status: sudo certbot certificates"
    echo "📋 To test auto-renewal: sudo certbot renew --dry-run"
else
    echo "❌ Nginx configuration test failed after SSL setup"
    exit 1
fi

