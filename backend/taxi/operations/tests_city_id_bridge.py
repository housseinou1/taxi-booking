"""City id bridge: locations.City vs cities.City (Nouakchott unified)."""

from django.test import TestCase

from authapp.models import User
from cities.models import City as RegistryCity, Region as RegistryRegion
from locations.models import City as LocationCity, Region as LocationRegion
from operations.city_id_bridge import (
    registry_city_ids_for_location_city,
    user_registry_matches_location_city,
)


class CityIdBridgeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.loc_reg = LocationRegion.objects.create(name="Trarza Test Bridge", slug="trarza-test-bridge")
        cls.loc_city = LocationCity.objects.create(region=cls.loc_reg, name="Rosso", slug="rosso-test-bridge")
        cls.reg_reg = RegistryRegion.objects.create(name="Trarza Test Bridge")
        cls.reg_city = RegistryCity.objects.create(region=cls.reg_reg, name="Rosso")

    def test_name_region_match_returns_registry_id(self):
        ids = registry_city_ids_for_location_city(self.loc_city)
        self.assertEqual(ids, [self.reg_city.id])

    def test_nouakchott_unifies_multiple_location_rows(self):
        r1 = LocationRegion.objects.create(name="Nouakchott Nord Bridge", slug="nkc-nord-bridge-ux")
        r2 = LocationRegion.objects.create(name="Nouakchott Ouest Bridge", slug="nkc-ouest-bridge-ux")
        nk1 = LocationCity.objects.create(region=r1, name="Nouakchott", slug="nkc-nord-city-bridge-ux")
        nk2 = LocationCity.objects.create(region=r2, name="Nouakchott", slug="nkc-ouest-city-bridge-ux")
        reg_r = RegistryRegion.objects.create(name="Nouakchott Bridge Reg")
        reg_nk = RegistryCity.objects.create(region=reg_r, name="Nouakchott")
        ids1 = registry_city_ids_for_location_city(nk1)
        ids2 = registry_city_ids_for_location_city(nk2)
        # Seed data may already include a Nouakchott row — bridge returns every registry match.
        self.assertIn(reg_nk.id, ids1)
        self.assertEqual(ids1, ids2)
        for cid in ids1:
            self.assertEqual(RegistryCity.objects.get(pk=cid).name, "Nouakchott")


class UserRegistryMatchTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.loc_reg = LocationRegion.objects.create(name="Brakna Test Match", slug="brakna-test-match")
        cls.loc_city = LocationCity.objects.create(region=cls.loc_reg, name="Aleg", slug="aleg-test-match")
        cls.reg_reg = RegistryRegion.objects.create(name="Brakna Test Match")
        cls.reg_city = RegistryCity.objects.create(region=cls.reg_reg, name="Aleg")

    def test_driver_matches_when_registry_aligns(self):
        u = User.objects.create_user(
            email="drv-bridge@example.com",
            password="x-Strong-Pass-1",
            first_name="D",
            last_name="R",
            user_type="driver",
            city=self.reg_city,
        )
        self.assertTrue(user_registry_matches_location_city(u, self.loc_city.id))

    def test_driver_rejects_wrong_city(self):
        other = RegistryCity.objects.create(
            region=RegistryRegion.objects.create(name="OtherR Bridge"),
            name="OtherTownBridge",
        )
        u = User.objects.create_user(
            email="drv-wrong@example.com",
            password="x-Strong-Pass-1",
            first_name="D",
            last_name="W",
            user_type="driver",
            city=other,
        )
        self.assertFalse(user_registry_matches_location_city(u, self.loc_city.id))
