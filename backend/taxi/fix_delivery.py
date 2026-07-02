"""Force-complete all active deliveries and add dropoff_pin column if missing."""
import os
import sqlite3

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "taxi.settings")

import django
django.setup()

from django.conf import settings as django_settings

# Get database path
db_path = django_settings.DATABASES["default"]["NAME"]
print(f"Database: {db_path}")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Add dropoff_pin column if it doesn't exist
try:
    cursor.execute("ALTER TABLE deliveries_delivery ADD COLUMN dropoff_pin VARCHAR(4) DEFAULT '0000'")
    print("Added dropoff_pin column")
except sqlite3.OperationalError as e:
    if "duplicate column" in str(e).lower():
        print("dropoff_pin column already exists")
    else:
        raise

# Add dropoff_pin_verified_at column if it doesn't exist
try:
    cursor.execute("ALTER TABLE deliveries_delivery ADD COLUMN dropoff_pin_verified_at DATETIME NULL")
    print("Added dropoff_pin_verified_at column")
except sqlite3.OperationalError as e:
    if "duplicate column" in str(e).lower():
        print("dropoff_pin_verified_at column already exists")
    else:
        raise

conn.commit()

# Now force-complete active deliveries
cursor.execute("""
    SELECT id, status, pickup_pin, dropoff_pin 
    FROM deliveries_delivery 
    WHERE status IN ('accepted', 'courier_arriving', 'picked_up', 'in_transit', 'delivering')
""")
rows = cursor.fetchall()
print(f"\nFound {len(rows)} active deliveries:")

for row in rows:
    delivery_id, status, pickup_pin, dropoff_pin = row
    print(f"  #{delivery_id} | status={status} | pickup_pin={pickup_pin} | dropoff_pin={dropoff_pin}")
    cursor.execute(
        "UPDATE deliveries_delivery SET status='delivered', delivered_at=datetime('now') WHERE id=?",
        (delivery_id,)
    )
    print(f"    -> Marked as delivered")

conn.commit()
conn.close()
print("\nDone! All active deliveries completed. You can now start a fresh test.")
