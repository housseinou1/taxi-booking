# PR #18 Admin Permissions Endpoint - Hot-Patch Deployment

## Summary

This hot-patch deploys the PR #18 admin permissions endpoint to running Django containers without rebuilding the entire Docker image. The endpoint is required for the new YALA Admin Dashboard.

## What Was Changed (PR #18)

The following files were added to `backend/taxi/operations/`:

1. **admin_permissions_service.py** - RBAC logic that maps Django groups to frontend roles
2. **admin_permissions_views.py** - View that serves `/operations/admin/me/permissions/`
3. **admin_audit_service.py** - Client-side audit logging helper

## Files Created

| File | Purpose |
|------|---------|
| `scripts/deploy-pr18-admin-permissions.ps1` | Main PowerShell deployment script |
| `PR18-HOT-PATCH-DEPLOYMENT.md` | Documentation |

## Security Verification

The deployment script includes a **critical security check**:

- The unauthenticated `/operations/admin/me/permissions/` endpoint **MUST** return HTTP 401 or 403
- If the endpoint returns HTTP 200, the deployment **STOPS IMMEDIATELY** with error messages
- The script restores the original urls.py and stops if the security check fails
- Rollback instructions are displayed if the security check fails

## Compatibility Fix

The deployment script now:
1. Fetches the production container's `urls.py` as the base
2. Adds only PR #18 imports and URL patterns
3. Preserves all existing production routes
4. Does not introduce imports for views that don't exist in production

## Files SHA-256 Checksums

| File | SHA-256 |
|------|---------|
| `deploy-pr18-admin-permissions.ps1` | `07C3FE0579F8281F258B035142629E0016DE082FD3D4ACE35520E08590E92617` |

## Deployment Steps

### Step 1: Verify Source Files Exist

```powershell
cd c:\Users\Housseinou\Projects\Django\taxi-booking
Test-Path backend\taxi\operations\admin_permissions_service.py
Test-Path backend\taxi\operations\admin_permissions_views.py
Test-Path backend\taxi\operations\admin_audit_service.py
```

### Step 2: Run the Deployment Script

```powershell
cd c:\Users\Housseinou\Projects\Django\taxi-booking\scripts
.\deploy-pr18-admin-permissions.ps1
```

### Step 3: Test Only Mode (No Restart)

```powershell
.\deploy-pr18-admin-permissions.ps1 -TestOnly
```

### Step 4: Rollback (If Needed)

```powershell
.\deploy-pr18-admin-permissions.ps1 -Rollback
```

## Features

- **Hot-patch**: Files copied directly into running container via `docker cp`
- **Rollback-safe**: Original urls.py backed up before patching
- **Production-compatible**: Uses production container's urls.py as base
- **Security verified**: Aborts if endpoint returns 200 without auth
- **Django verified**: Runs `manage.py check` before any restart
- **Test-only mode**: Verify without restarting Django

## Verification

After deployment, the endpoint `/operations/admin/me/permissions/` will:

- Return **HTTP 401 or 403** (not 200, not 404) without authentication
- Return **HTTP 200 OK** with RBAC payload for authenticated staff users

## Rollback Procedure

If issues occur:

```powershell
.\deploy-pr18-admin-permissions.ps1 -Rollback
```

## What's Preserved

- Database (no migrations)
- Environment variables
- SMTP settings
- Separate `app` Docker project
- PR #21 deployment (completely separate)

## Notes

- Only the `yala-django-1` container is affected
- The deployment preserves the existing Docker Compose setup
- No rebuild of the Django image required
- Files are installed inside the running container at `/app/operations/`
- The production urls.py is retrieved from the container to ensure compatibility
