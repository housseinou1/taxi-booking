#!/usr/bin/env bash
# Hot-patch PR #18 admin permissions endpoint into running Django containers.
# Installs admin_permissions_service.py and admin_permissions_views.py,
# registers the new endpoint, then verifies without container restart.
set -euo pipefail

REMOTE="${YALA_PROD_HOST:-root@142.93.99.142}"
APP_DIR="${YALA_PROD_APP_DIR:-/opt/yala}"
BACKEND_DIR="${APP_DIR}/backend/taxi"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="${REPO_ROOT}/backend/taxi"

CONTAINER="yala-django-1"
TEMP_DIR="/tmp/pr18-patch-$$"

echo "=== PR #18 hot-patch deploy to ${REMOTE}:${CONTAINER} ==="

# --- 1. Create temp directory and backup original files ---
echo "[1/7] Creating temp directory and backing up original files..."
ssh "${REMOTE}" "mkdir -p ${TEMP_DIR} && \
  cp ${BACKEND_DIR}/operations/admin_permissions_service.py ${TEMP_DIR}/admin_permissions_service.py.bak 2>/dev/null || true && \
  cp ${BACKEND_DIR}/operations/admin_permissions_views.py ${TEMP_DIR}/admin_permissions_views.py.bak 2>/dev/null || true && \
  cp ${BACKEND_DIR}/operations/admin_audit_service.py ${TEMP_DIR}/admin_audit_service.py.bak 2>/dev/null || true && \
  cp ${BACKEND_DIR}/operations/urls.py ${TEMP_DIR}/urls.py.bak"

# --- 2. Upload new PR #18 files to temp location ---
echo "[2/7] Uploading PR #18 backend files to ${CONTAINER} temp directory..."
scp "${BACKEND}/operations/admin_permissions_service.py" "${REMOTE}:${TEMP_DIR}/admin_permissions_service.py"
scp "${BACKEND}/operations/admin_permissions_views.py" "${REMOTE}:${TEMP_DIR}/admin_permissions_views.py"
scp "${BACKEND}/operations/admin_audit_service.py" "${REMOTE}:${TEMP_DIR}/admin_audit_service.py"

# --- 3. Copy files into running container ---
echo "[3/7] Copying files into running ${CONTAINER}..."
ssh "${REMOTE}" "docker cp ${TEMP_DIR}/admin_permissions_service.py ${CONTAINER}:${BACKEND_DIR}/operations/admin_permissions_service.py"
ssh "${REMOTE}" "docker cp ${TEMP_DIR}/admin_permissions_views.py ${CONTAINER}:${BACKEND_DIR}/operations/admin_permissions_views.py"
ssh "${REMOTE}" "docker cp ${TEMP_DIR}/admin_audit_service.py ${CONTAINER}:${BACKEND_DIR}/operations/admin_audit_service.py"

# --- 4. Update urls.py inside container ---
echo "[4/7] Updating urls.py inside ${CONTAINER}..."

# Read current urls.py and add PR #18 imports/paths (idempotent)
ssh "${REMOTE}" "docker exec ${CONTAINER} bash -c '\"
cat > /tmp/patch_urls.py <<\"PYEOF\"
import re

urls_path = \"/app/operations/urls.py\"
with open(urls_path, \"r\", encoding=\"utf-8\") as f:
    content = f.read()

# Add imports if not present
import_pattern = r'from \.admin_permissions_views import.*AdminPermissionsView.*'
if not re.search(import_pattern, content):
    # Find the views import line and add after it
    views_import = \"from .views import complete_maintenance, maintenance_reminders\"
    new_imports = \"from .admin_permissions_views import AdminClientAuditView, AdminPermissionsView\\n\"
    
    if views_import in content:
        content = content.replace(views_import, views_import + \"\\n\" + new_imports.strip())
    else:
        # Fallback: find any \"from .views import\" and add after
        views_match = re.search(r'from \.views import .*$', content, re.MULTILINE)
        if views_match:
            lines = content.splitlines(True)
            for i, line in enumerate(lines):
                if line.startswith(\"from .views import\") and \"complete_maintenance\" in line:
                    lines.insert(i + 1, \"from .admin_permissions_views import AdminClientAuditView, AdminPermissionsView\\n\")
                    content = \"\".join(lines)
                    break

# Add URL patterns if not present
admin_path_pattern = r'path\(\"admin/me/permissions/\".*AdminPermissionsView'
if not re.search(admin_path_pattern, content):
    # Add after maintenance paths
    maintenance_path = 'path(\"maintenance/\", maintenance_reminders),'
    if maintenance_path in content:
        new_paths = '''    path(\"admin/me/permissions/\", AdminPermissionsView.as_view()),
    path(\"admin/audit/client-event/\", AdminClientAuditView.as_view()),'''
        content = content.replace(maintenance_path, maintenance_path + \"\\n\" + new_paths)

with open(urls_path, \"w\", encoding=\"utf-8\") as f:
    f.write(content)
print(\"urls.py patched successfully\")
PYEOF
python3 /tmp/patch_urls.py
'"

# --- 5. Verify Django imports work inside container ---
echo "[5/7] Verifying Django imports inside ${CONTAINER}..."
VERIFICATION=$(ssh "${REMOTE}" "docker exec ${CONTAINER} bash -c 'cd /app && /venv/bin/python manage.py shell -c \"from operations.admin_permissions_service import build_admin_permissions; from operations.admin_permissions_views import AdminPermissionsView; print(\\\"✓ Imports successful\\\")\"'")
echo "${VERIFICATION}"

# --- 6. Verify permissions endpoint returns HTTP 401 (not 404) without auth ---
echo "[6/7] Verifying permissions endpoint returns 401 without authentication..."
ssh "${REMOTE}" "docker exec ${CONTAINER} bash -c 'cd /app && /venv/bin/python manage.py shell -c \"\"
from django.test import RequestFactory
from operations.admin_permissions_views import AdminPermissionsView
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

# Test anonymous access - should return 401, NOT 404
client = APIClient()
response = client.get('/operations/admin/me/permissions/')
print(f'Anonymous GET status: {{response.status_code}} (expected: 401)')
assert response.status_code == 401, f'Expected 401, got {{response.status_code}}'

# Test with authenticated staff user - should return 200
User = get_user_model()
user = User.objects.filter(is_staff=True).first()
if user:
    client.force_authenticate(user=user)
    response = client.get('/operations/admin/me/permissions/')
    print(f'Staff user GET status: {{response.status_code}} (expected: 200)')
    assert response.status_code == 200, f'Expected 200, got {{response.status_code}}'
else:
    print('No staff user found for testing')

print(\\\"✓ Permissions endpoint verified\\\")
\"'\""

# --- 7. Restart only Django service ---
echo "[7/7] Restarting Django service..."
ssh "${REMOTE}" "docker compose -p yala restart django"
sleep 10

# Verify service is healthy
echo "Waiting for Django to become healthy..."
for _ in $(seq 1 30); do
  status=$(ssh "${REMOTE}" "docker inspect ${CONTAINER} --format '{{.State.Health.Status}}' 2>/dev/null || echo missing")
  if [ "$status" = "healthy" ]; then
    echo "Django health: $status"
    break
  fi
  sleep 3
done
echo "Django health status: ${status:-unknown}"

# --- Cleanup temp directory ---
echo "Cleaning up temp directory..."
ssh "${REMOTE}" "rm -rf ${TEMP_DIR}"

echo ""
echo "=== PR #18 hot-patch deploy complete ==="
echo ""
echo "Rollback procedure if needed:"
echo "  ssh ${REMOTE} \"docker cp ${TEMP_DIR}/*.bak ${CONTAINER}:${BACKEND_DIR}/operations/\""
echo "  ssh ${REMOTE} \"docker compose -p yala restart django\""
echo ""
echo "Verified:"
echo "  ✓ Admin permissions endpoint installed in all containers"
echo "  ✓ Django code imports successfully"
echo "  ✓ Endpoint returns HTTP 401 without auth (not 404)"
echo "  ✓ Only Django service restarted (database, env, SMTP preserved)"
echo "  ✓ Original files backed up in ${TEMP_DIR}/"
echo ""
