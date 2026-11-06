# Nginx Configuration Verification Guide

## Root Cause Analysis

The HTTP 404 for `https://api.yalataxi.live/operations/admin/me/permissions/` while Django returns HTTP 401 internally indicates that **Nginx is not routing the request to Django**.

## Verification Steps

Run these commands to identify the exact cause:

### Step 1: Get Production Nginx Config

```bash
ssh root@142.93.99.142 "docker exec yala-nginx-1 cat /etc/nginx/nginx.conf" > /tmp/production_nginx.conf
```

### Step 2: Get Repository Nginx Config

```bash
cp nginx/nginx.conf /tmp/repository_nginx.conf
```

### Step 3: Compare Configurations

```bash
diff /tmp/production_nginx.conf /tmp/repository_nginx.conf
```

### Step 4: Check for /operations/ Path

```bash
# In production config
grep -i "operations" /tmp/production_nginx.conf

# In repository config
grep -i "operations" /tmp/repository_nginx.conf
```

### Step 5: Verify Location Block

Check if the location block includes `/operations/`:

```bash
grep -A2 'location ~' /tmp/production_nginx.conf | grep operations
```

## Expected Findings

### If Production is Missing `/operations/`:

**Production (INCORRECT):**
```nginx
location ~ ^/(admin/|auth/|rides/|drivers/|payments/|...) {
```

**Repository (CORRECT):**
```nginx
location ~ ^/(admin/|auth/|rides/|drivers/|payments/|operations/|...) {
```

### Minimal Fix

If the above confirms the production config is missing `/operations/`:

```bash
# 1. Backup current config
ssh root@142.93.99.142 "cp /opt/yala/nginx/nginx.conf /opt/yala/nginx/nginx.conf.bak"

# 2. Sync the config
scp nginx/nginx.conf root@142.99.142:/opt/yala/nginx/nginx.conf

# 3. Update the running container
ssh root@142.93.99.142 "docker cp /opt/yala/nginx/nginx.conf yala-nginx-1:/etc/nginx/nginx.conf"

# 4. Test and reload
ssh root@142.93.99.142 "docker exec yala-nginx-1 nginx -t && docker exec yala-nginx-1 nginx -s reload"
```

## Verification After Fix

```bash
curl -I https://api.yalataxi.live/operations/admin/me/permissions/
# Expected: HTTP 401 (not 404)
```

## Rollback

If issues occur:

```bash
ssh root@142.93.99.142 "docker cp /opt/yala/nginx/nginx.conf.bak yala-nginx-1:/etc/nginx/nginx.conf"
ssh root@142.93.99.142 "docker exec yala-nginx-1 nginx -t && docker exec yala-nginx-1 nginx -s reload"
```

## Alternative: Use PowerShell Script

```powershell
cd c:\Users\Housseinou\Projects\Django\taxi-booking\scripts
.\verify-nginx-configuration.ps1
```

This script will:
- Compare configurations
- Report differences
- Provide fix commands
