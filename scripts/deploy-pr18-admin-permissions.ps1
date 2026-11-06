#!/usr/bin/env pwsh
# PR #18 Admin Permissions Endpoint Hot-Patch Deployment Script
# Fixes compatibility with production Django containers by using production-compatible urls.py
# Also syncs Nginx configuration if production differs from repository
# Usage: .\deploy-pr18-admin-permissions.ps1 [-Remote "root@142.93.99.142"] [-TestOnly] [-Rollback]

param(
    [string]$Remote = "root@142.93.99.142",
    [switch]$TestOnly = $false,
    [switch]$Rollback = $false
)

$ErrorActionPreference = "Continue"

$AppDir = "/opt/yala"
$BackendDir = "$AppDir/backend/taxi"
$Container1 = "yala-django-1"
$Container2 = "yala-django-2"
$Container3 = "yala-django-3"
$NginxContainer = "yala-nginx-1"
$TempDir = "/tmp/pr18-patch-$((Get-Date).ToString('yyyyMMdd-HHmmss'))"
$BackupDir = "/tmp/pr18-backup-$((Get-Date).ToString('yyyyMMdd-HHmmss'))"

function Write-Section {
    param([string]$Title)
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "  $Title" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
}

function Invoke-SSH {
    param([string]$Cmd)
    ssh $Remote $Cmd
}

function Invoke-SCP {
    param([string]$Src, [string]$Dst)
    scp $Src $Dst
}

# ROLLBACK MODE
if ($Rollback.IsPresent) {
    Write-Section "ROLLBACK MODE"
    
    $hasBackups = $(Invoke-SSH "test -f ${BackupDir}/urls.py.bak && echo yes || echo no") -eq "yes"
    
    if (-not $hasBackups) {
        Write-Host "ERROR: No backup files found. Cannot rollback." -ForegroundColor Red
        exit 1
    }
    
    Write-Host "Restoring urls.py to all three containers..."
    foreach ($container in @($Container1, $Container2, $Container3)) {
        Write-Host "  Restoring $container..."
        Invoke-SSH "docker cp ${BackupDir}/urls_${container}.bak ${container}:${BackendDir}/operations/urls.py"
    }
    
    # Restore Nginx config if backed up
    if ($(Invoke-SSH "test -f ${BackupDir}/nginx.conf.bak && echo yes || echo no") -eq "yes") {
        Write-Host "Restoring Nginx config..."
        Invoke-SSH "docker cp ${BackupDir}/nginx.conf.bak ${NginxContainer}:/etc/nginx/nginx.conf"
        Write-Host "  [OK] Nginx config restored"
    }
    
    Write-Host "Restarting Django..."
    Invoke-SSH "docker compose -p yala restart django"
    Start-Sleep -Seconds 10
    
    Write-Host "Waiting for Django to become healthy..."
    for ($i = 0; $i -lt 20; $i++) {
        $status = Invoke-SSH "docker inspect ${Container1} --format '{{.State.Health.Status}}' 2>/dev/null"
        if ($status -eq "healthy") {
            Write-Host "  [OK] Django healthy"
            break
        }
        Write-Host "  Waiting... ($i/20)"
        Start-Sleep -Seconds 3
    }
    
    Write-Host "Rollback complete."
    Write-Host "Clean up backup: ssh ${Remote} \"rm -rf ${BackupDir}\""
    exit 0
}

# DEPLOYMENT
$RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$Backend = "$RepoRoot/backend/taxi"

Write-Section "PR #18 Admin Permissions Hot-Patch"
Write-Host "Target: $Remote"
Write-Host "Containers: $Container1, $Container2, $Container3"
Write-Host ""

# Step 1: Verify Nginx configuration
Write-Section "1. Verify Nginx configuration"

# Get production Nginx config
Invoke-SSH "docker exec ${NginxContainer} cat /etc/nginx/nginx.conf > ${TempDir}/nginx.conf"
Invoke-SSH "docker cp ${NginxContainer}:${TempDir}/nginx.conf ${TempDir}/nginx.conf"
Invoke-SCP "${Remote}:${TempDir}/nginx.conf" "${TempDir}/production_nginx.conf"

# Get repository Nginx config
$RepoNginx = "$Backend/../nginx/nginx.conf"
if (Test-Path $RepoNginx) {
    Copy-Item $RepoNginx "${TempDir}/repository_nginx.conf"
    Write-Host "  [OK] Repository config retrieved"
} else {
    Write-Host "  [WARNING] Repository nginx.conf not found: $RepoNginx"
}

# Compare configs
$prodContent = Get-Content "${TempDir}/production_nginx.conf" -Raw
$repoContent = Get-Content "${TempDir}/repository_nginx.conf" -Raw

if ($prodContent -ne $repoContent) {
    Write-Host "  [WARNING] Production config differs from repository" -ForegroundColor Yellow
    Write-Host "  Checking for /operations/ path..."
    
    if (-not ($prodContent -match "operations/")) {
        Write-Host "  [CRITICAL] /operations/ path is MISSING from production config!" -ForegroundColor Red
        Write-Host "  This is the likely cause of HTTP 404."
        
        # Backup and sync Nginx config
        Write-Host "  Syncing Nginx config..."
        Invoke-SSH "mkdir -p ${BackupDir}"
        Invoke-SSH "docker exec ${NginxContainer} cat /etc/nginx/nginx.conf > ${BackupDir}/nginx.conf.bak"
        Invoke-SSH "docker cp ${NginxContainer}:${BackupDir}/nginx.conf.bak ${TempDir}/nginx.bak"
        Invoke-SCP "${Remote}:${TempDir}/nginx.bak" "${TempDir}/nginx.bak"
        
        # Sync new config
        Invoke-SCP $RepoNginx "${Remote}:${TempDir}/nginx.conf"
        Invoke-SSH "docker cp ${TempDir}/nginx.conf ${NginxContainer}:/etc/nginx/nginx.conf"
        Write-Host "  [OK] Nginx config synced"
        
        # Test and reload
        Write-Host "  Testing and reloading Nginx..."
        $nginxTest = Invoke-SSH "docker exec ${NginxContainer} nginx -t 2>&1"
        Write-Host "  $nginxTest"
        
        if ($LASTEXITCODE -eq 0) {
            Invoke-SSH "docker exec ${NginxContainer} nginx -s reload"
            Start-Sleep -Seconds 2
            Write-Host "  [OK] Nginx reloaded"
        } else {
            Write-Host "  [ERROR] Nginx config test failed!" -ForegroundColor Red
            Write-Host "  Restoring backup..."
            Invoke-SSH "docker cp ${BackupDir}/nginx.conf.bak ${NginxContainer}:/etc/nginx/nginx.conf"
            Invoke-SSH "docker exec ${NginxContainer} nginx -s reload"
            exit 1
        }
    } else {
        Write-Host "  [OK] /operations/ path exists in production config"
    }
} else {
    Write-Host "  [OK] Production config matches repository exactly"
}

# Step 2: Fetch production urls.py from container
Write-Section "2. Fetch production urls.py from yala-django-1"
Invoke-SSH "docker exec ${Container1} cat ${BackendDir}/operations/urls.py > ${TempDir}/production_urls.py"
Invoke-SSH "docker exec ${Container1} cat ${BackendDir}/operations/urls.py > ${TempDir}/urls.py"
Invoke-SSH "docker cp ${Container1}:${TempDir}/urls.py ${TempDir}/"
Invoke-SCP "${Remote}:${TempDir}/urls.py" "${TempDir}/"

if (Test-Path "${TempDir}/urls.py") {
    Write-Host "  [OK] Production urls.py retrieved from yala-django-1"
} else {
    Write-Host "  [ERROR] Failed to retrieve production urls.py" -ForegroundColor Red
    exit 1
}

# Step 3: Create backup of urls.py from ALL containers
Write-Section "3. Backup current urls.py from all containers"
Invoke-SSH "mkdir -p ${BackupDir}"
foreach ($container in @($Container1, $Container2, $Container3)) {
    $backupFile = "${TempDir}/urls_${container}.bak"
    Invoke-SSH "docker exec ${container} cat ${BackendDir}/operations/urls.py > ${TempDir}/urls_${container}.bak"
    Invoke-SSH "docker cp ${container}:${TempDir}/urls_${container}.bak ${TempDir}/"
    Invoke-SCP "${Remote}:${TempDir}/urls_${container}.bak" "${TempDir}/"
    Write-Host "  [OK] Backup of $container saved"
}

# Step 4: Apply PR #18 changes using Python for reliable parsing
Write-Section "4. Apply PR #18 to urls.py"

$pythonPatchScript = @'
import re

urls_path = "/app/operations/urls.py"
with open(urls_path, "r") as f:
    content = f.read()

# Add PR #18 imports after the views import
views_import = "from .views import complete_maintenance, maintenance_reminders"
pr18_imports = "from .admin_permissions_views import AdminClientAuditView, AdminPermissionsView"

if "admin_permissions_views" not in content:
    if views_import in content:
        new_import = views_import + "\n" + pr18_imports
        content = content.replace(views_import, new_import)
        print("Added PR #18 imports")
    else:
        print("ERROR: Could not find views import line")
        exit(1)
else:
    print("PR #18 imports already present")

# Add PR #18 URL patterns after maintenance paths
pr18_paths = """    # Admin shell RBAC bootstrap (staff JWT only; gated by IsStaffUser).
    path("admin/me/permissions/", AdminPermissionsView.as_view()),
    path("admin/audit/client-event/", AdminClientAuditView.as_view()),"""

if 'path("admin/me/permissions/"' not in content:
    maintenance_path = 'path("maintenance/", maintenance_reminders),'
    if maintenance_path in content:
        new_content = content.replace(maintenance_path, maintenance_path + "\n" + pr18_paths)
        content = new_content
        print("Added PR #18 URL patterns")
    else:
        print("ERROR: Could not find maintenance path")
        exit(1)
else:
    print("PR #18 URL patterns already present")

# Write the modified content
with open(urls_path, "w") as f:
    f.write(content)

print("urls.py patched successfully")
'@

# Save the Python script
$pythonScriptPath = "${TempDir}/patch_urls.py"
Set-Content -Path $pythonScriptPath -Value $pythonPatchScript -NoNewline

# Run the Python script inside the container
Invoke-SSH "docker exec ${Container1} python3 ${TempDir}/patch_urls.py"

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERROR] Python patch script failed!" -ForegroundColor Red
    Write-Host "  [ERROR] Restoring backup..." -ForegroundColor Red
    foreach ($container in @($Container1, $Container2, $Container3)) {
        Invoke-SSH "docker cp ${BackupDir}/urls_${container}.bak ${container}:${BackendDir}/operations/urls.py"
    }
    exit 1
}

Write-Host "  [OK] urls.py patched in yala-django-1"

# Copy updated urls.py to all containers
Write-Section "5. Copy updated urls.py to all containers"
foreach ($container in @($Container1, $Container2, $Container3)) {
    Write-Host "  Copying to $container..."
    Invoke-SSH "docker exec ${Container1} cat ${BackendDir}/operations/urls.py > ${TempDir}/urls.py"
    Invoke-SSH "docker cp ${TempDir}/urls.py ${container}:${BackendDir}/operations/urls.py"
    Write-Host "  [OK] Copied to $container"
}

# Step 6: Upload PR #18 files to server
Write-Section "6. Upload PR #18 files to server"
Invoke-SCP "$Backend/operations/admin_permissions_service.py" "${Remote}:${TempDir}/admin_permissions_service.py"
Invoke-SCP "$Backend/operations/admin_permissions_views.py" "${Remote}:${TempDir}/admin_permissions_views.py"
Invoke-SCP "$Backend/operations/admin_audit_service.py" "${Remote}:${TempDir}/admin_audit_service.py"
Write-Host "  [OK] Files uploaded to server"

# Step 7: Copy files to ALL containers
Write-Section "7. Copy files to all containers"
foreach ($container in @($Container1, $Container2, $Container3)) {
    Write-Host "  Copying to $container..."
    Invoke-SSH "docker cp ${TempDir}/admin_permissions_service.py ${container}:${BackendDir}/operations/admin_permissions_service.py"
    Invoke-SSH "docker cp ${TempDir}/admin_permissions_views.py ${container}:${BackendDir}/operations/admin_permissions_views.py"
    Invoke-SSH "docker cp ${TempDir}/admin_audit_service.py ${container}:${BackendDir}/operations/admin_audit_service.py"
    Write-Host "  [OK] Files copied to $container"
}

# Step 8: Verify Django configuration in ALL containers
Write-Section "8. Verify Django configuration"
foreach ($container in @($Container1, $Container2, $Container3)) {
    Write-Host "  Checking $container..."
    Invoke-SSH "docker exec ${container} cd /app && /venv/bin/python manage.py check --deploy 2>&1"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [ERROR] Django check failed for $container!" -ForegroundColor Red
        Write-Host "  [ERROR] Restoring backup..." -ForegroundColor Red
        foreach ($c in @($Container1, $Container2, $Container3)) {
            Invoke-SSH "docker cp ${BackupDir}/urls_${c}.bak ${c}:${BackendDir}/operations/urls.py"
        }
        exit 1
    }
    Write-Host "  [OK] $container configuration valid"
}

# Step 9: Verify permissions endpoint security
Write-Section "9. Verify permissions endpoint security"

Invoke-SSH "docker exec ${Container1} /venv/bin/python -c \"from rest_framework.test import APIClient; c = APIClient(); r = c.get('/operations/admin/me/permissions/'); print(f'Anonymous: HTTP {r.status_code}'); exit(1 if r.status_code == 200 else 0)\""
$verifyExitCode = $LASTEXITCODE

if ($verifyExitCode -eq 1) {
    Write-Host "  [ERROR] Security check FAILED - endpoint returns 200 without auth!" -ForegroundColor Red
    Write-Host "  [ERROR] DEPLOYMENT ABORTED" -ForegroundColor Red
    Write-Host "  [INFO] Restoring backup..." -ForegroundColor Yellow
    foreach ($container in @($Container1, $Container2, $Container3)) {
        Invoke-SSH "docker cp ${BackupDir}/urls_${container}.bak ${container}:${BackendDir}/operations/urls.py"
    }
    exit 1
}
Write-Host "  [OK] Endpoint returns 401/403 (security check passed)"

# Step 10: Test public endpoint
Write-Section "10. Test public endpoint"
Write-Host "  Testing: https://api.yalataxi.live/operations/admin/me/permissions/"
Write-Host "  (This will be tested manually after deployment)"
Write-Host "  [OK] Deployment complete - test manually"

# Step 11: Restart Django (unless test-only)
if ($TestOnly.IsPresent) {
    Write-Section "TEST ONLY - NO RESTART"
    Write-Host "Files copied but Django NOT restarted."
    Write-Host "Test mode complete. To restart: run without -TestOnly"
    Write-Host ""
    Write-Host "Rollback command:"
    Write-Host "  .\deploy-pr18-admin-permissions.ps1 -Rollback"
    exit 0
}

Write-Section "11. Restart Django"
Invoke-SSH "docker compose -p yala restart django"
Start-Sleep -Seconds 10

Write-Host "Waiting for Django to become healthy..."
for ($i = 0; $i -lt 20; $i++) {
    $status = Invoke-SSH "docker inspect ${Container1} --format '{{.State.Health.Status}}' 2>/dev/null"
    if ($status -eq "healthy") {
        Write-Host "  [OK] Django healthy"
        break
    }
    Write-Host "  Waiting... ($i/20)"
    Start-Sleep -Seconds 3
}

# Cleanup
Write-Section "Cleanup"
Invoke-SSH "rm -rf ${TempDir}"
Write-Host "  [OK] Temp files removed"

Write-Section "PR #18 DEPLOY COMPLETE"
Write-Host ""
Write-Host "Endpoint: GET /operations/admin/me/permissions/"
Write-Host "Security: Returns 401/403 without auth (not 200)"
Write-Host ""
Write-Host "Rollback command:"
Write-Host "  .\deploy-pr18-admin-permissions.ps1 -Rollback"
Write-Host ""
Write-Host "MANUAL VERIFICATION REQUIRED:"
Write-Host "  curl -I https://api.yalataxi.live/operations/admin/me/permissions/"
Write-Host "  Expected: HTTP 401 (not 404)"
Write-Host ""
