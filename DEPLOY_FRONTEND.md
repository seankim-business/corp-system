# Deploy Frontend to Railway

## Architecture

```
nubabel.com           → GoDaddy landing page (existing)
app.nubabel.com       → React frontend (Railway)
auth.nubabel.com      → Backend API (Railway)
```

## Steps to Deploy Frontend

### 1. Create New Railway Service

1. Go to https://railway.app/project/YOUR_PROJECT_ID
2. Click "New Service" → "GitHub Repo"
3. Select `corp-system` repository
4. Set **Root Directory**: `frontend`
5. Service name: `nubabel-frontend`

### 2. Configure Build Settings

Railway should auto-detect the Dockerfile in `/frontend/Dockerfile`.

If not, manually set:

- **Build Command**: `npm run build`
- **Start Command**: Not needed (Docker will handle this)

### 3. Add Environment Variables

Add in Railway dashboard:

```
NODE_ENV=production
```

### 4. Deploy

Railway will automatically build using:

- `/frontend/Dockerfile`
- Multi-stage build (Node.js builder → Nginx server)
- Nginx serves static files from `/usr/share/nginx/html`

### 5. Configure Domain

1. Go to Settings → Networking
2. Add custom domain: `app.nubabel.com`
3. Railway will provide CNAME target (e.g., `xyz.up.railway.app`)

### 6. Update DNS (GoDaddy)

Add CNAME record:

```
Type: CNAME
Name: app
Value: [Railway CNAME from step 5]
TTL: 30 minutes
```

### 7. Test

Wait 5-10 minutes for DNS propagation, then:

```bash
curl -I https://app.nubabel.com
# Should return: 200 OK
```

## Architecture Benefits

### Frontend (app.nubabel.com)

- Static files served by Nginx
- Fast CDN delivery
- Proxy `/api` and `/auth` to backend
- No CORS issues

### Backend (auth.nubabel.com)

- Express API server
- Database connections
- Session management
- JWT authentication

### Landing (nubabel.com)

- GoDaddy hosted
- Marketing content
- Independent from app

## Nginx Configuration

Located at `/frontend/nginx.conf`:

```nginx
location / {
    try_files $uri $uri/ /index.html;  # SPA routing
}

location /api {
    proxy_pass https://auth.nubabel.com;  # API proxy
}
```

This ensures:

- React Router works (all routes → index.html)
- API calls automatically routed to backend
- No CORS configuration needed

## Troubleshooting

### Build Fails

```bash
# Test locally
cd frontend
docker build -t nubabel-frontend .
docker run -p 8080:80 nubabel-frontend
open http://localhost:8080
```

### DNS Not Resolving

```bash
dig app.nubabel.com +short
# Should return Railway IP
```

### API Calls Fail

- Check nginx.conf proxy settings
- Verify auth.nubabel.com is online
- Check browser DevTools Network tab

## Files Created

- `/frontend/Dockerfile` - Multi-stage build (Node + Nginx)
- `/frontend/nginx.conf` - Nginx configuration
- `/frontend/.dockerignore` - Exclude node_modules from build
- `/frontend/.env.production` - Production environment variables

## Cost Estimate

Railway pricing:

- Frontend service: ~$5-10/month (static site, low resources)
- Backend service: ~$10-20/month (API, database connections)
- Total: ~$15-30/month for both services

## Next Steps After Deployment

1. Test registration: `https://app.nubabel.com` → Sign up
2. Test login: Use registered credentials
3. Test workflows: Create and execute workflow
4. Monitor: Check Railway deployment logs

## Rollback Plan

If deployment fails:

1. Railway keeps previous versions
2. Go to Deployments → Select working version → Redeploy
3. Or: Git revert and push to trigger new deploy
