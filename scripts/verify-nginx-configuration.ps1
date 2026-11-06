#!/usr/bin/env pwsh
# Verify Nginx configuration between production and repository
# Usage: .\verify-nginx-configuration.ps1 [-Remote "root@142.93.99.142"]

param(
    [string]$Remote = "root@142.93.99.142"
)

$ErrorActionPreference = "Continue"

$TempDir = "/tmp/nginx-verify-$((Get-Date).ToString('yyyyMMdd-HHmmss'))"
$LocalTemp = "$PSScriptRoot/../_temp_nginx_verify"

# Create local temp directory
New-Item -ItemType Directory -Path $LocalTemp -Force | Out-Null

Write-Host "=== Nginx Configuration Verification ===" -ForegroundColor Cyan
Write-Host "Target: $Remote"
Write-Host ""

# Step 1: Get production Nginx config
Write-Host "Step 1: Getting production Nginx config..."
Invoke-SSH "docker exec yala-nginx-1 cat /etc/nginx/nginx.conf > ${TempDir}/nginx.conf"
Invoke-SSH "docker cp yala-nginx-1:${TempDir}/nginx.conf ${TempDir}/nginx.conf"
Invoke-SCP "${Remote}:${TempDir}/nginx.conf" "$LocalTemp/production_nginx.conf"

if (Test-Path "$LocalTemp/production_nginx.conf") {
    Write-Host "  [OK] Production config retrieved"
} else {
    Write-Host "  [ERROR] Failed to retrieve production config" -ForegroundColor Red
    exit 1
}

# Step 2: Get repository Nginx config
Write-Host "Step 2: Getting repository Nginx config..."
$RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$RepoConfig = "$RepoRoot/nginx/nginx.conf"
if (Test-Path $RepoConfig) {
    Copy-Item $RepoConfig "$LocalTemp/repository_nginx.conf"
    Write-Host "  [OK] Repository config retrieved"
} else {
    Write-Host "  [ERROR] Repository config not found: $RepoConfig" -ForegroundColor Red
    exit 1
}

# Step 3: Compare configurations
Write-Host "Step 3: Comparing configurations..."
$diff = Compare-Object $(Get-Content "$LocalTemp/production_nginx.conf") $(Get-Content "$LocalTemp/repository_nginx.conf") -SyncWindow 5

if ($diff -eq $null) {
    Write-Host "  [OK] Configurations are identical"
} else {
    Write-Host "  [WARNING] Configurations differ:" -ForegroundColor Yellow
    Write-Host "  First 20 differences:"
    $diff | Select-Object -First 20 | ForEach-Object {
        $side = if ($_.SideIndicator -eq "<=") { "PRODUCTION" } else { "REPOSITORY" }
        Write-Host "    $($_.InputObject)" -ForegroundColor Cyan
    }
}

# Step 4: Check for /operations/ in production config
Write-Host "Step 4: Checking for /operations/ path in production config..."
$hasOperations = Select-String -Path "$LocalTemp/production_nginx.conf" -Pattern "operations/"
if ($hasOperations) {
    Write-Host "  [OK] /operations/ found in production config"
} else {
    Write-Host "  [ERROR] /operations/ NOT found in production config!" -ForegroundColor Red
}

# Step 5: Check the location block regex
Write-Host "Step 5: Checking location block regex..."
$locationLine = Select-String -Path "$LocalTemp/production_nginx.conf" -Pattern "location ~" | Where-Object { $_.Line -match "operations" } | Select-Object -First 1
if ($locationLine) {
    Write-Host "  Found location block:"
    Write-Host "    $($locationLine.Line)" -ForegroundColor Cyan
} else {
    Write-Host "  [WARNING] No location block with /operations/ found"
}

# Step 6: Check upstream configuration
Write-Host "Step 6: Checking upstream configuration..."
$upstream = Select-String -Path "$LocalTemp/production_nginx.conf" -Pattern "upstream django" -Context 5,5
if ($upstream) {
    Write-Host "  Found upstream 'django':"
    Write-Host "    $($upstream.Line)" -ForegroundColor Cyan
    $upstream.Context.AfterContext | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
}

# Step 7: Report findings
Write-Host ""
Write-Host "=== Findings ===" -ForegroundColor Cyan

# Check if production matches repository
$prodContent = Get-Content "$LocalTemp/production_nginx.conf" -Raw
$repoContent = Get-Content "$LocalTemp/repository_nginx.conf" -Raw

if ($prodContent -eq $repoContent) {
    Write-Host "  [OK] Production config matches repository exactly"
    Write-Host ""
    Write-Host "  The HTTP 404 is NOT caused by Nginx configuration mismatch."
    Write-Host "  Investigate:"
    Write-Host "  - Nginx access logs for the endpoint"
    Write-Host "  - Whether the request reaches Django"
    Write-Host "  - Docker volume mounts for nginx config"
} else {
    Write-Host "  [WARNING] Production config differs from repository"
    Write-Host ""
    Write-Host "  Run diff to see exact differences:"
    Write-Host "  diff $LocalTemp/production_nginx.conf $LocalTemp/repository_nginx.conf"
    
    # Check if /operations/ is missing
    if (-not ($prodContent -match "operations/")) {
        Write-Host ""
        Write-Host "  [CRITICAL] /operations/ is MISSING from production config"
        Write-Host "  Fix: Sync nginx/nginx.conf to production and reload Nginx"
    } elseif (-not ($prodContent -match 'location ~ \^/\(.*\|operations/')) {
        Write-Host ""
        Write-Host "  [CRITICAL] /operations/ path is missing from location regex"
        Write-Host "  Fix: Update location block to include |operations/"
    }
}

# Cleanup
Write-Host ""
Write-Host "Cleaning up..."
Remove-Item -Path $LocalTemp -Recurse -Force | Out-Null
Write-Host "  [OK] Temp files removed"

Write-Host ""
Write-Host "=== Recommendations ===" -ForegroundColor Cyan

# Provide specific fix if needed
if (-not ($prodContent -match "operations/")) {
    Write-Host ""
    Write-Host "To fix (if confirmed):"
    Write-Host "  1. Backup: ssh $Remote \"cp /opt/yala/nginx/nginx.conf /opt/yala/nginx/nginx.conf.bak\""
    Write-Host "  2. Sync:   scp nginx/nginx.conf $Remote:/opt/yala/nginx/nginx.conf"
    Write-Host "  3. Update: ssh $Remote \"docker cp /opt/yala/nginx/nginx.conf yala-nginx-1:/etc/nginx/nginx.conf\""
    Write-Host "  4. Reload: ssh $Remote \"docker exec yala-nginx-1 nginx -t && docker exec yala-nginx-1 nginx -s reload\""
} else {
    Write-Host ""
    Write-Host "Nginx configuration appears correct."
    Write-Host "Next steps to debug HTTP 404:"
    Write-Host "  1. Check Nginx access logs: ssh $Remote \"docker exec yala-nginx-1 tail -100 /var/log/nginx/access.log | grep 'operations/admin/me/permissions'\""
    Write-Host "  2. Test direct endpoint: curl -I https://api.yalataxi.live/operations/admin/me/permissions/"
    Write-Host "  3. Check if request reaches Django: ssh $Remote \"docker exec yala-django-1 tail -100 /var/log/django/access.log\""
}

function Invoke-SSH {
    param([string]$Cmd)
    ssh $Remote $Cmd
}

function Invoke-SCP {
    param([string]$Src, [string]$Dst)
    scp $Src $Dst
}
