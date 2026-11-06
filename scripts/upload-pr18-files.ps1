# PR #18: Upload files to DigitalOcean server (step 1/2 of deployment)
# Usage: Copy the line below into PowerShell and press Enter
# After uploading, run: .\deploy-pr18-admin-permissions.ps1

scp "c:\Users\Housseinou\Projects\Django\taxi-booking\backend\taxi\operations\admin_permissions_service.py" "root@142.93.99.142:/tmp/pr18-upload/"; scp "c:\Users\Housseinou\Projects\Django\taxi-booking\backend\taxi\operations\admin_permissions_views.py" "root@142.93.99.142:/tmp/pr18-upload/"; scp "c:\Users\Housseinou\Projects\Django\taxi-booking\backend\taxi\operations\admin_audit_service.py" "root@142.93.99.142:/tmp/pr18-upload/"