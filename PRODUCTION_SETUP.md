# Production Setup Guide - Video KYC

## Prerequisites

1. ✅ Nginx installed
2. ✅ Certbot installed
3. ✅ DNS records configured (A records pointing to server IP)
4. ✅ Frontend built (`npm run build` in frontend directory)
5. ✅ Backend running (port 8005)

## Quick Setup Steps

### Step 1: Setup Nginx Configurations

```bash
cd /home/ubuntu/video_kyc
sudo bash setup-nginx.sh
```

Yeh script nginx config files ko link karega:
- `kyc.virtualinvestigation.xyz` - Frontend
- `backend.virtualinvestigation.xyz` - Backend API
- `admin.virtualinvestigation.xyz` - Admin Panel

### Step 2: Setup SSL Certificates

```bash
sudo bash setup-ssl-production.sh your-email@domain.com
```

Yeh script:
- Let's Encrypt certificates generate karega
- Auto-renewal setup karega
- Nginx ko reload karega

### Step 3: Build Frontend

```bash
cd /home/ubuntu/video_kyc/frontend
npm run build
```

### Step 4: Start Backend (if not running)

```bash
cd /home/ubuntu/video_kyc/backend
npm start
# ya PM2 use karo:
pm2 start ecosystem.config.js
```

## Nginx Configuration Files

1. **nginx-kyc.conf** - Frontend (kyc.virtualinvestigation.xyz)
2. **nginx-backend.conf** - Backend API (backend.virtualinvestigation.xyz)
3. **nginx-admin.conf** - Admin Panel (admin.virtualinvestigation.xyz)

## SSL Features

- ✅ TLS 1.2 & 1.3 support
- ✅ Modern cipher suites
- ✅ OCSP Stapling
- ✅ Security headers (HSTS, XSS Protection, etc.)
- ✅ Auto-renewal via certbot timer

## Troubleshooting

### Check Nginx Status
```bash
sudo systemctl status nginx
sudo nginx -t
```

### Check SSL Certificates
```bash
sudo certbot certificates
```

### Test SSL Renewal
```bash
sudo certbot renew --dry-run
```

### View Nginx Logs
```bash
sudo tail -f /var/log/nginx/kyc-error.log
sudo tail -f /var/log/nginx/backend-error.log
```

### Reload Nginx
```bash
sudo systemctl reload nginx
```

## Ports

- **80** - HTTP (redirects to HTTPS)
- **443** - HTTPS (SSL)
- **8005** - Backend Node.js server (internal)

## Security Notes

- SSL certificates auto-renew hote hain
- Security headers enabled hain
- File upload limit: 500MB
- WebSocket support enabled for Socket.io

