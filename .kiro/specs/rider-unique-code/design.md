# Design Document: Rider Unique Code

## Architecture Overview

This feature adds a `rider_code` field to the existing `User` model and auto-generates a globally unique 6-digit numeric code for every rider at registration time. The architecture follows the existing pattern used by `driver_code` on `DriverProfile`, but places the field directly on the `User` model since all riders share the same model.

### Key Design Decisions

1. **Field on User model** (not a separate profile model): Riders don't have a dedicated profile model like drivers. Adding `rider_code` directly to `User` keeps the schema flat and avoids an unnecessary join.
2. **Generation in RegisterSerializer.create()**: The code is generated inside the serializer's `create` method, just before `user.save()`. This keeps the logic co-located with the registration flow and ensures the code is set atomically with user creation.
3. **Retry-loop generation with cross-table uniqueness check**: The generator queries both `User.rider_code` and `DriverProfile.driver_code` before accepting a candidate. A retry loop handles collisions.
4. **Immutability via model `save()` override**: The `User.save()` method preserves an existing `rider_code` on subsequent saves, preventing accidental overwrites.

---

## Components

### 1. User Model Changes (`backend/taxi/authapp/models.py`)

```python
class User(AbstractUser):
    # ... existing fields ...

    rider_code = models.CharField(
        max_length=6,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
    )

    def save(self, *args, **kwargs):
        # Immutability guard: preserve rider_code once assigned
        if self.pk:
            try:
                existing = User.objects.only("rider_code").get(pk=self.pk)
                if existing.rider_code:
                    self.rider_code = existing.rider_code
            except User.DoesNotExist:
                pass
        super().save(*args, **kwargs)
```

### 2. Code Generation Utility (`backend/taxi/authapp/code_generator.py`)

A standalone utility function responsible for generating unique 6-digit codes.

```python
import random
from django.contrib.auth import get_user_model
from taxi.drivers.models import DriverProfile

def generate_unique_rider_code(max_retries: int = 100) -> str:
    """
    Generate a 6-digit numeric code (100000–999999) that is unique
    across both User.rider_code and DriverProfile.driver_code.

    Raises RuntimeError if unable to find a unique code within max_retries.
    """
    User = get_user_model()

    for _ in range(max_retries):
        candidate = str(random.randint(100000, 999999))

        rider_exists = User.objects.filter(rider_code=candidate).exists()
        driver_exists = DriverProfile.objects.filter(driver_code=candidate).exists()

        if not rider_exists and not driver_exists:
            return candidate

    raise RuntimeError(
        "Unable to generate a unique rider code after "
        f"{max_retries} attempts. Code space may be exhausted."
    )
```

### 3. RegisterSerializer Integration (`backend/taxi/authapp/serializers.py`)

The `create` method is updated to call the generator when `user_type == "rider"`.

```python
from .code_generator import generate_unique_rider_code

class RegisterSerializer(serializers.ModelSerializer):
    # ... existing fields and validation ...

    def create(self, validated_data):
        user_type = validated_data.pop("user_type")
        password = validated_data.pop("password")
        city = validated_data.pop("city")
        profile_picture = validated_data.pop("profile_picture", None)
        national_id_document = validated_data.pop("national_id_document", None)

        # Generate rider code for rider registrations
        rider_code = None
        if user_type == "rider":
            rider_code = generate_unique_rider_code()

        user = User(
            email=validated_data.get("email"),
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
            gender=validated_data.get("gender", ""),
            phone_number=validated_data.get("phone_number", ""),
            national_id_number=validated_data.get("national_id_number", ""),
            national_id_document=national_id_document,
            city=city,
            user_type=user_type,
            rider_status="pending" if user_type == "rider" else "approved",
            profile_picture=profile_picture,
            rider_code=rider_code,
        )

        user.set_password(password)
        user.save()

        if user_type == "driver":
            DriverProfile.objects.get_or_create(
                user=user,
                defaults={...},
            )

        return user
```

### 4. Profile API Serializer Update

The existing user profile endpoint serializer is updated to include `rider_code` as a read-only field.

```python
class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [..., "rider_code"]
        read_only_fields = ["rider_code"]
```

### 5. Admin API Serializer Update

The admin user list/detail serializer includes `rider_code` as read-only.

```python
class AdminUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [..., "rider_code"]
        read_only_fields = ["rider_code"]
```

### 6. Rider App Profile Screen (`rider-app/www/`)

The rider app React component fetches the profile endpoint and renders `rider_code` in a visible card/badge on the profile screen.

```jsx
{user.rider_code && (
  <div className="rider-code-badge">
    <span className="rider-code-label">Your Rider Code</span>
    <span className="rider-code-value">{user.rider_code}</span>
  </div>
)}
```

### 7. Admin Dashboard (`frontend/src/admin/AdminDashboard.js`)

The admin user detail/list view renders the `rider_code` column for rider users.

```jsx
{user.user_type === "rider" && user.rider_code && (
  <td>{user.rider_code}</td>
)}
```

### 8. Database Migration

A Django migration adds the `rider_code` field to the `User` model:

```python
# Generated migration
from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ("authapp", "<previous_migration>"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="rider_code",
            field=models.CharField(
                blank=True,
                max_length=6,
                null=True,
                unique=True,
                db_index=True,
            ),
        ),
    ]
```

---

## Data Model

| Field | Type | Constraints | Location |
|-------|------|-------------|----------|
| `rider_code` | CharField(6) | unique, null=True, blank=True, db_index | User model |
| `driver_code` | CharField(6) | unique, null=True, blank=True | DriverProfile model |

Both fields share the same 6-digit numeric space (100000–999999). Global uniqueness is enforced at the application level during code generation.

---

## Interfaces

### Code Generator

```python
def generate_unique_rider_code(max_retries: int = 100) -> str:
    """
    Returns a 6-digit numeric string in [100000, 999999] that does not
    exist in User.rider_code or DriverProfile.driver_code.

    Raises: RuntimeError if code space exhausted.
    """
```

### Profile API Response (existing endpoint)

```json
{
  "id": 42,
  "email": "rider@example.com",
  "first_name": "Ahmed",
  "last_name": "Diallo",
  "user_type": "rider",
  "rider_code": "483927",
  ...
}
```

### Admin User List API Response

```json
{
  "results": [
    {
      "id": 42,
      "email": "rider@example.com",
      "user_type": "rider",
      "rider_code": "483927",
      ...
    }
  ]
}
```

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| Code space near exhaustion (>100 collisions) | `RuntimeError` raised; registration fails with 500; alerts operators |
| Database race condition (two threads generate same code) | Database `UNIQUE` constraint causes `IntegrityError`; caught and retried once |
| Non-rider user type at registration | `rider_code` left as `None`; no generation attempted |
| Attempt to overwrite existing rider_code | `User.save()` override silently preserves original value |

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Generated codes are within valid range

*For any* invocation of the code generator, the returned string must represent a numeric value in the inclusive range [100000, 999999] (i.e., exactly 6 digits, no leading zeros below 100000).

**Validates: Requirements 2.2**

### Property 2: Generated codes are globally unique

*For any* set of pre-existing rider_codes and driver_codes in the database, the code generator must return a value that does not appear in either set. Equivalently: for any rider created through registration, their assigned rider_code is distinct from every other rider_code and every driver_code in the system.

**Validates: Requirements 1.2, 2.3, 2.4, 2.5, 3.1**

### Property 3: Driver code assignment rejects existing rider codes

*For any* driver_code value being assigned to a DriverProfile, if that value already exists as a rider_code on any User record, the assignment must be rejected.

**Validates: Requirements 3.2**

### Property 4: Rider code immutability

*For any* User with a non-null rider_code, saving that user (regardless of other field changes) must preserve the original rider_code value unchanged.

**Validates: Requirements 6.1, 6.3**
