from django.test import TestCase

from locations.models import City as LocationCity, Region as LocationRegion
from locations.operating_cities import (
    OPERATING_METRO_SPECS,
    build_operating_city_payload,
    canonical_operating_name,
    invalidate_operating_city_cache,
    is_operating_location_city_id,
)
from locations.operating_city_seed import ensure_operating_metro_cities


class OperatingCitiesTests(TestCase):
    def test_canonical_name_aliases(self):
        self.assertEqual(canonical_operating_name("Kaedi"), "Kaédi")
        self.assertEqual(canonical_operating_name("Nouakchott Sud"), "Nouakchott")
        self.assertIsNone(canonical_operating_name("Ouadane"))

    def test_payload_collapses_nouakchott_once(self):
        r1 = LocationRegion.objects.create(name="NKC Op T1", slug="nkc-op-t1", is_active=True)
        r2 = LocationRegion.objects.create(name="NKC Op T2", slug="nkc-op-t2", is_active=True)
        LocationCity.objects.create(region=r1, name="Nouakchott", slug="nkc-op-c1", is_active=True, is_default=True)
        LocationCity.objects.create(region=r2, name="Nouakchott", slug="nkc-op-c2", is_active=True)
        names = [row["name"] for row in build_operating_city_payload()]
        self.assertEqual(names.count("Nouakchott"), 1)

    def test_operating_id_check(self):
        reg = LocationRegion.objects.create(name="Fleet Op", slug="fleet-op", is_active=True)
        rosso = LocationCity.objects.create(region=reg, name="Rosso", slug="rosso-op", is_active=True)
        small = LocationCity.objects.create(region=reg, name="Ouadane", slug="ouadane-op", is_active=True)
        invalidate_operating_city_cache()
        payload = build_operating_city_payload()
        rosso_row = next((r for r in payload if r.get("canonical_name") == "Rosso"), None)
        self.assertIsNotNone(rosso_row)
        self.assertTrue(is_operating_location_city_id(rosso_row["id"]))
        self.assertFalse(is_operating_location_city_id(small.id))

    def test_ensure_operating_metros_seeds_missing(self):
        """Only Nouakchott active — repair creates the other 12 metros."""
        LocationCity.objects.update(is_active=False)
        reg = LocationRegion.objects.create(name="NKC Test", slug="nkc-test-op", is_active=True)
        LocationCity.objects.create(
            region=reg, name="Nouakchott", slug="nouakchott-test-op", is_active=True, is_default=True
        )
        invalidate_operating_city_cache()
        self.assertEqual(len(build_operating_city_payload()), 1)
        created = ensure_operating_metro_cities()
        self.assertGreater(created, 0)
        invalidate_operating_city_cache()
        names = {row["canonical_name"] for row in build_operating_city_payload()}
        self.assertEqual(len(names), len(OPERATING_METRO_SPECS))
        self.assertIn("Nouadhibou", names)
        self.assertIn("Rosso", names)
