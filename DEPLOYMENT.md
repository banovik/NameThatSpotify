# 🚀 Deployment Guide

This guide will help you deploy the Spotify Music Game to a production server.

## 📋 Prerequisites

- A server with Node.js 14+ installed
- A domain name (optional but recommended)
- SSL certificate (required for HTTPS)
- Spotify Developer App configured
- SQLite3 support (for lyrics caching)

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
```

**Note**: The app now uses lyrics.ovh API for lyrics (no authentication required) and caches lyrics locally in SQLite.

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

### 4. Test Lyrics Features
- Load a playlist
- Test lyrics scraping functionality
- Verify lyrics availability indicators

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

### 4. Database Security
- The SQLite lyrics database is created automatically
- Ensure proper file permissions on the database file
- Consider backing up the lyrics database regularly

## 🐛 Troubleshooting

### Common Issues

1. **CORS Errors**
   - Check `FRONTEND_URL` environment variable
   - Ensure frontend and backend URLs match

2. **Socket.IO Connection Issues**
   - Verify `REACT_APP_BACKEND_URL` is set correctly
   - Check that the backend server is running

3. **Lyrics Not Loading**
   - Check internet connectivity (lyrics.ovh API requires internet)
   - Verify the lyrics database has proper write permissions
   - Check server logs for lyrics API errors

4. **SQLite Issues**
   - Ensure the server has write permissions in the root directory
   - Check that sqlite3 is properly installed
   - Verify the lyrics.db file is created and accessible

5. **Admin Features Not Working**
   - Verify the admin password is set correctly
   - Check that Spotify authentication is working
   - Ensure all required environment variables are set

## 📊 Monitoring

### 1. Log Monitoring
```bash
# View PM2 logs
pm2 logs spotify-game-backend

# Monitor system resources
pm2 monit
```

### 2. Database Monitoring
```bash
# Check lyrics database size
ls -lh lyrics.db

# Backup lyrics database
cp lyrics.db lyrics.db.backup
```

## 🔄 Updates

### 1. Application Updates
```bash
# Pull latest changes
git pull origin main

# Install new dependencies
npm install
cd client && npm install && cd ..

# Rebuild frontend
cd client && npm run build && cd ..

# Restart services
pm2 restart spotify-game-backend
pm2 restart spotify-game-frontend
```

### 2. Database Migrations
- The SQLite database is automatically created and managed
- No manual migrations required for lyrics caching

## 📈 Performance Optimization

### 1. Caching
- Lyrics are cached in SQLite database for fast retrieval
- Spotify API responses are cached to reduce API calls
- Game state is maintained in memory for real-time updates

### 2. Memory Management for High Load
The application has been optimized to handle up to 200+ concurrent users on 1GB RAM:

#### **Memory Optimization Features:**
- **Connection Limits**: Maximum 250 concurrent Socket.IO connections
- **Database Optimization**: SQLite configured with WAL mode and memory mapping
- **Automatic Cleanup**: Old data is automatically cleaned up every 5 minutes
- **Memory Monitoring**: Real-time memory usage logging
- **Rate Limiting**: Prevents server overload from rapid requests

#### **Memory Usage Estimates:**
- **Per User**: ~65-130KB (Socket.IO + game state)
- **200 Users**: ~13-26MB total user overhead
- **Server Base**: ~100-200MB (Node.js + Express + SQLite)
- **Total Estimated**: ~163-326MB (well within 1GB limit)

#### **Performance Monitoring:**
```bash
# Monitor memory usage in logs
pm2 logs spotify-game-backend | grep "Memory Usage"

# Check active connections
pm2 logs spotify-game-backend | grep "Active connections"

# Monitor cleanup operations
pm2 logs spotify-game-backend | grep "Cleanup"
```

#### **Scaling Recommendations:**
- **Up to 200 users**: Current optimizations should handle this well
- **200-500 users**: Consider upgrading to 2GB RAM
- **500+ users**: Consider load balancing across multiple instances

#### **Emergency Scaling:**
If you need to handle more users immediately:
1. **Reduce cleanup intervals** (change from 5 minutes to 2 minutes)
2. **Lower connection limit** (change MAX_CONNECTIONS to 150)
3. **Increase rate limiting** (change from 1 second to 2 seconds between guesses)
4. **Disable detailed logging** (set console logging to false by default)

### 3. Database Performance

---

**Happy Deploying! 🚀🎵** 