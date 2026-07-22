# YALA — Coding Standards

**Document ID:** YALA-ENG-STD-007  
**Version:** 1.0.0  
**Effective:** 2026-07-21

---

## 1. General principles

| Principle | Guideline |
|-----------|-----------|
| Minimize scope | Smallest correct diff; no unrelated changes |
| Match conventions | Read surrounding code before adding new code |
| Self-documenting code | Comments only for non-obvious business logic |
| Test meaningful behavior | Not trivial assertions |
| No secrets in git | Use env vars and `.env.production.template` |

---

## 2. Python

### Style

| Rule | Standard |
|------|----------|
| Formatter | Black-compatible (88 char line length) |
| Imports | stdlib → third-party → Django → local apps |
| Type hints | Use on new service functions where practical |
| Docstrings | Module-level and public service functions |

### Naming

| Element | Convention | Example |
|---------|------------|---------|
| Modules | snake_case | `finance_operations_service.py` |
| Functions | snake_case | `build_daily_reconciliation()` |
| Classes | PascalCase | `SafetyIncident` |
| Constants | UPPER_SNAKE | `EXECUTIVE_GROUPS` |
| Private | leading `_` | `_compute_fare()` |

### Django models

```python
class Ride(models.Model):
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, db_index=True)
    rider = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)

    class Meta:
        indexes = [
            models.Index(fields=["rider", "status"]),
        ]
```

| Rule | Detail |
|------|--------|
| Choices | Define as class-level tuples |
| Indexes | Add for filtered/sorted query fields |
| `on_delete` | PROTECT for audit-critical FKs; CASCADE for owned children |
| Strings | `__str__` on all models |

---

## 3. Django / DRF

### Project layout

```
backend/taxi/
├── <app>/
│   ├── models.py
│   ├── views.py          # or views/ package
│   ├── urls.py
│   ├── serializers.py
│   ├── services/         # business logic
│   ├── migrations/
│   └── tests/
├── operations/           # admin/executive dashboards
│   ├── *_service.py      # build_* payload functions
│   ├── *_views.py        # thin DRF views
│   └── executive_permissions.py
└── taxi/
    ├── settings.py
    ├── urls.py
    └── asgi.py
```

### Service layer pattern (operations modules)

Operations dashboards use **service modules** with `build_*` functions:

```python
# operations/finance_operations_service.py
def build_daily_reconciliation(*, target_date=None) -> dict:
    """Return reconciliation payload for Finance Ops dashboard."""
    ...
    return {
        "date": str(target_date),
        "status": "balanced",
        "ride_revenue": ride_revenue,
        ...
    }
```

Views stay thin — call service, return `Response(payload)`.

### DRF views

| Pattern | Use |
|---------|-----|
| `@api_view(["GET"])` | Simple function endpoints |
| `APIView` / `ViewSet` | CRUD resources |
| `@permission_classes([IsFinanceStaff])` | Staff dashboards |
| Serializers | Input validation + output shaping |

### URL naming

| Rule | Example |
|------|---------|
| Trailing slash | Always use trailing slash |
| kebab-case paths | `/operations/trust-safety/incidents/` |
| Nested resources | `/rides/<ride_id>/stops/` |

### Migrations

- One logical change per migration
- Never edit applied migrations
- Run `python manage.py migrate --check` in CI
- Name descriptively: `0004_merchant_platform_phase31.py`

---

## 4. React

### Structure

```
frontend/src/
├── admin/           # Admin dashboard modules
│   ├── finance/
│   ├── command/
│   └── ...
├── rider/
├── driver/
├── delivery/
├── merchant/
├── auth/
│   └── roleRouting.js
└── App.js
```

### Conventions

| Rule | Standard |
|------|----------|
| Components | PascalCase filenames (`FinanceOperationsCenter.js`) |
| API clients | Separate `*Api.js` files per module |
| Hooks | `use*` prefix |
| State | React hooks; context for auth/role |
| Styling | Match existing inline/CSS module patterns in file |

### Admin module pattern (Phases 24–37)

Each ops module follows:

1. `frontend/src/admin/<module>/<Module>Center.js` — main page with tabs
2. `frontend/src/admin/<module>/<module>Api.js` — API client
3. Route in `App.js`
4. Menu item in `AdminDashboard.js`
5. Page key in `auth/roleRouting.js` → `ADMIN_PAGES`

### API calls

```javascript
// Use authenticatedApi helper
import { authenticatedApi } from "../services/api";
const res = await authenticatedApi.get(`${API_URL}/operations/command/`);
```

---

## 5. TypeScript

The primary frontend is **JavaScript (React)**. TypeScript appears in:

| Location | Usage |
|----------|-------|
| Capacitor config | `capacitor.config.ts` in mobile apps |
| Future modules | Prefer TypeScript for new standalone packages |

When adding TypeScript:

- Strict mode enabled
- Explicit types on function signatures
- Avoid `any` unless interfacing with untyped APIs

---

## 6. API design

### REST conventions

| Action | Method | Example |
|--------|--------|---------|
| List | GET | `/rides/history/` |
| Create | POST | `/rides/request/` |
| Retrieve | GET | `/rides/<id>/` |
| Update | PATCH | `/drivers/profile/update/` |
| Delete | DELETE | `/merchants/products/<pk>/` |
| Action | POST | `/rides/accept/<id>/` |

### Response format

| Case | Format |
|------|--------|
| Success object | `{ "id": 1, "status": "..." }` |
| Success list | `[{ ... }, { ... }]` or paginated `{ "results": [], "count": N }` |
| Error | `{ "detail": "message" }` or field errors |
| Dashboard | Nested dict with named sections |

### Versioning

| Prefix | Use |
|--------|-----|
| Unversioned | Primary mobile/admin API |
| `/api/v1/` | Selected admin endpoints (QR verification) |
| `/api-gateway/v1/partner/` | B2B partner API |

### Pagination

Use DRF pagination for large lists in admin endpoints. Mobile lists use cursor/limit patterns where implemented.

---

## 7. Naming conventions

### Backend

| Item | Pattern |
|------|---------|
| App name | lowercase singular (`merchants`, `payments`) |
| Service file | `<domain>_service.py` or `<domain>_<feature>_service.py` |
| View file | `<domain>_views.py` |
| Test file | `test_<feature>.py` under `tests/` |
| Permission class | `Is<Role>Staff` |

### Frontend

| Item | Pattern |
|------|---------|
| Page component | `<Feature>Center.js` or `<Feature>Dashboard.js` |
| API module | `<feature>Api.js` |
| Route path | `/admin/<kebab-case>` |

### Database

| Item | Pattern |
|------|---------|
| Table | `<app>_<model>` (Django default) |
| Index | Descriptive fields in Meta.indexes |
| Enum fields | lowercase snake values |

---

## 8. Folder structure

### Backend apps by domain

| App | Domain |
|-----|--------|
| `authapp` | Authentication, users |
| `taxi.rides` | Ride lifecycle |
| `taxi.drivers` | Driver profiles |
| `deliveries` | Delivery lifecycle |
| `merchants` | Merchant catalog/orders |
| `payments` | Wallet, payments, withdrawals |
| `operations` | Admin/executive dashboards |
| `safety` | SOS, incidents |
| `security` | Audit, fraud |
| `loyalty` | Rider loyalty |
| `partners` | Franchise partners |
| `api_gateway` | B2B API |

### Frontend by client

| Directory | Client |
|-----------|--------|
| `frontend/src/rider/` | Rider app |
| `frontend/src/driver/` | Driver app |
| `frontend/src/delivery/` | Delivery app |
| `frontend/src/merchant/` | Merchant portal |
| `frontend/src/admin/` | Admin + executive |

### Documentation

| Directory | Content |
|-----------|---------|
| `engineering/` | Architecture, API, standards |
| `operations/` | Operational SOPs |
| `release/` | Phase reports, launch docs |
| `handover/` | Enterprise handover package |
| `project-management/` | Tracker, backlog |

---

## 9. Testing standards

### Backend

| Rule | Detail |
|------|--------|
| Framework | Django `TestCase` + DRF `APIClient` |
| Location | `tests/` or `<app>/tests/` |
| Naming | `test_<behavior>_<expected>()` |
| Auth tests | Verify 401 unauthenticated, 403 wrong role, 200 correct role |
| Operations tests | Assert payload keys match service contract |

### Run tests

```bash
cd backend/taxi
python manage.py test -v 1
python manage.py test tests.operations.test_finance_operations -v 1
python manage.py test operations payments -v 1
```

### What to test

| Test | Priority |
|------|----------|
| Permission boundaries | Required for all new admin endpoints |
| Service payload shape | Dashboard endpoints return expected keys |
| State transitions | Ride/delivery status changes |
| Payment flows | Wallet, withdrawal, refund |
| Regression bugs | Reproduce before fix |

### What not to test

- Django/DRF framework behavior
- Trivial getters with no logic
- Third-party library internals

### Frontend

- `npm run build` must succeed before deploy
- Manual QA for admin UI changes
- Mobile apps: physical device QA per release docs

---

## 10. Code review checklist

### Author (before PR)

- [ ] Smallest focused diff
- [ ] Matches existing patterns in module
- [ ] Migrations included if models changed
- [ ] Tests added for new endpoints/permissions
- [ ] No secrets, debug prints, or commented-out code
- [ ] `python manage.py test` passes for affected apps
- [ ] `npm run build` passes if frontend changed

### Reviewer

- [ ] Business logic in service layer, not views
- [ ] Permissions correctly restrict access
- [ ] Audit logging for financial/admin actions
- [ ] No N+1 queries in new list endpoints
- [ ] Error responses use standard DRF format
- [ ] Mobile app UX unchanged unless explicitly scoped
- [ ] Migration is reversible or safe for production data

### Security review triggers

- Auth/permission changes
- Payment or wallet logic
- New public (AllowAny) endpoints
- File upload handling
- SQL raw queries

---

## 11. Git conventions

| Item | Convention |
|------|------------|
| Branch | `feature/<name>`, `fix/<name>`, `release/v1.0.0` |
| Commits | Imperative mood: "Add finance reconciliation export" |
| PR scope | One feature/fix per PR when possible |
| No force push | To main/master without explicit approval |

---

## 12. Document control

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-07-21 | Initial coding standards |

**Cross-references:** `08_ENGINEERING_ONBOARDING.md` · `02_API_CATALOG.md`
