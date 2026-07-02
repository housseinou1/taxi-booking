"""Force-complete all active deliveries."""
import os
import sqlite3

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "taxi.settings")
import django
django.setup()
from django.conf import settings

db = settings.DATABASES["default"]["NAME"]
conn = sqlite3.connect(str(db))
c = conn.cursor()
c.execute(
    "UPDATE deliveries_delivery SET status='delivered', delivered_at=datetime('now') "
    "WHERE status IN ('accepted','courier_arriving','picked_up','in_transit','delivering')"
)
print(f"Marked {c.rowcount} deliveries as delivered")
conn.commit()
conn.close()
