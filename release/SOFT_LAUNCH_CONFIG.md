# Soft Launch Configuration — RC1

**Release:** v1.0.0-rc1  
**Pilot city:** Nouakchott  

---

## Pilot Parameters

| Parameter | Value |
|-----------|-------|
| Pilot city | Nouakchott |
| Max drivers | 100 |
| Max riders | 1000 |
| Max couriers | 50 |

---

## Apply Configuration

```bash
docker compose -p yala exec -T django python manage.py configure_soft_launch
```

Disable: `configure_soft_launch --disable`  
Dry run: `configure_soft_launch --dry-run`

---

## PlatformSetting (`soft_launch`)

```json
{
  "enabled": true,
  "release": "v1.0.0-rc1",
  "pilot_city": "Nouakchott",
  "max_drivers": 100,
  "max_riders": 1000,
  "max_couriers": 50,
  "registration_open": true
}
```

---

## Feature Flags

| Flag | Key | RC1 default |
|------|-----|-------------|
| Soft launch | `soft_launch` | enabled |
| Maintenance mode | `maintenance_mode` | disabled |

Maintenance mode controlled via Executive Dashboard.

---

## Capacity

| Layer | Tested capacity | Pilot cap |
|-------|-------------------|-----------|
| API concurrent | 335 @ 0% 5xx | Within pilot |
| Drivers | — | 100 target |
| Riders | — | 1000 target |
| Couriers | — | 50 target |

---

## Rollout

1. Apply `configure_soft_launch`  
2. Verify Launch Hub 100%  
3. Internal beta: 10 drivers + 50 riders  
4. Monitor 48 h → expand to full caps  
