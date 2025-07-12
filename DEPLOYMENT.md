# 🚀 Deployment Guide

This guide will help you deploy the Spotify Music Game to a production server.

## 📋 Prerequisites

- A server with Node.js 14+ installed
- A domain name (optional but recommended)
- SSL certificate (required for HTTPS)
- Spotify Developer App configured
- Genius API account (optional, for lyrics)

## 🔧 Environment Configuration

### 1. Backend Environment Variables

Create a `.env` file in the root directory with these variables:

```env
# Spotify API Credentials
SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here
SPOTIFY_REDIRECT_URI=https://yourdomain.com/auth/spotify/callback

# Frontend URL (your domain)
FRONTEND_URL=https://yourdomain.com

# Server Configuration
PORT=5001

# Admin Authentication
ADMIN_PASSWORD=your_secure_admin_password_here

# Genius API (Optional - for lyrics)
GENIUS_ACCESS_TOKEN=your_genius_access_token_here
```

### 2. Frontend Environment Variables

Create a `.env` file in the `client` directory:

```env
REACT_APP_BACKEND_URL=https://yourdomain.com
```

## 🌐 Domain and SSL Setup

### 1. Domain Configuration
- Point your domain to your server's IP address
- Set up DNS records (A record for root domain)

### 2. SSL Certificate
- Install Let's Encrypt or another SSL certificate
- Ensure HTTPS is working on both frontend and backend

## 🏗️ Server Setup

### 1. Install Dependencies

```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd client
npm install
cd ..
```

### 2. Build Frontend

```bash
cd client
npm run build
cd ..
```

### 3. Production Server Options

#### Option A: Simple Node.js Server

```bash
# Start backend
npm start

# Serve frontend (using a static file server)
npx serve -s client/build -l 3001
```

#### Option B: Using PM2 (Recommended)

```bash
# Install PM2
npm install -g pm2

# Start backend
pm2 start server.js --name "spotify-game-backend"

# Serve frontend
pm2 start "npx serve -s client/build -l 3001" --name "spotify-game-frontend"

# Save PM2 configuration
pm2 save
pm2 startup
```

#### Option C: Using Nginx + PM2

1. **Install Nginx**
```bash
sudo apt update
sudo apt install nginx
```

2. **Nginx Configuration**
Create `/etc/nginx/sites-available/spotify-game`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;

    # Frontend
    location / {
        root /path/to/your/app/client/build;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Spotify auth endpoints
    location /auth/ {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Socket.IO
    location /socket.io/ {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

3. **Enable the site**
```bash
sudo ln -s /etc/nginx/sites-available/spotify-game /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

4. **Start backend with PM2**
```bash
pm2 start server.js --name "spotify-game-backend"
pm2 save
pm2 startup
```

## 🔄 Spotify App Configuration

### 1. Update Redirect URIs
In your Spotify Developer Dashboard:
- Add your production redirect URI: `https://yourdomain.com/auth/spotify/callback`
- Keep the local development URI for testing

### 2. Update App Settings
- Ensure your app is properly configured
- Check that all required scopes are enabled

## 🧪 Testing Deployment

### 1. Test Backend
```bash
curl https://yourdomain.com/api/devices
```

### 2. Test Frontend
- Visit `https://yourdomain.com`
- Try logging in as admin
- Test player connection

### 3. Test Spotify Integration
- Log in as admin
- Connect Spotify account
- Try playing a song

## 🔒 Security Considerations

### 1. Environment Variables
- Never commit `.env` files to version control
- Use strong, unique passwords
- Rotate API keys regularly

### 2. Firewall Configuration
```bash
# Allow only necessary ports
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw enable
```

### 3. Regular Updates
- Keep Node.js updated
- Update dependencies regularly
- Monitor for security vulnerabilities

## 🐛 Troubleshooting

### Common Issues

1. **CORS Errors**
   - Check `FRONTEND_URL` environment variable
   - Ensure frontend and backend URLs match

2. **Socket.IO Connection Issues**
   - Verify `REACT_APP_BACKEND_URL` is set correctly
   - Check firewall settings
   - Ensure WebSocket proxy is configured in Nginx

3. **Spotify Authentication Fails**
   - Verify redirect URI matches exactly
   - Check SSL certificate is valid
   - Ensure domain is accessible

4. **Playback Not Working**
   - Admin must have Spotify Premium
   - Spotify must be open and active
   - Check device availability

### Logs and Monitoring

```bash
# View PM2 logs
pm2 logs

# View Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Monitor system resources
htop
```

## 📈 Scaling Considerations

### 1. Load Balancing
- Use multiple backend instances
- Configure load balancer for WebSocket connections

### 2. Database (Future Enhancement)
- Consider adding a database for persistent data
- Store user scores and game history

### 3. CDN
- Serve static assets through a CDN
- Improve global performance

## 🔄 Updates and Maintenance

### 1. Code Updates
```bash
# Pull latest changes
git pull origin main

# Install dependencies
npm install
cd client && npm install && cd ..

# Build frontend
cd client && npm run build && cd ..

# Restart services
pm2 restart all
```

### 2. Backup Strategy
- Regular backups of environment files
- Database backups (if implemented)
- Configuration backups

---

**Happy Deploying! 🎵🎮** 