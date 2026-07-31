from decimal import Decimal

from django.test import SimpleTestCase

from taxi.market import MARKET, calculate_fare
from locations.models import CityPricing


class MarketPricingFormulaTests(SimpleTestCase):
    """Unit tests for the approved distance-based fare formula."""

    def test_regular_short_trip(self):
        fare = calculate_fare("regular", 2)
        self.assertEqual(fare, Decimal("215.00"))

    def test_regular_long_trip(self):
        fare = calculate_fare("regular", 8)
        self.assertEqual(fare, Decimal("335.00"))

    def test_xl_short_trip(self):
        fare = calculate_fare("xl", 2)
        self.assertEqual(fare, Decimal("275.00"))

    def test_xl_long_trip(self):
        fare = calculate_fare("xl", 10)
        self.assertEqual(fare, Decimal("475.00"))

    def test_comfort_short_trip(self):
        fare = calculate_fare("comfort", 2)
        self.assertEqual(fare, Decimal("335.00"))

    def test_comfort_long_trip(self):
        fare = calculate_fare("comfort", 12)
        self.assertEqual(fare, Decimal("635.00"))

    def test_share_trip(self):
        fare = calculate_fare("share", 8)
        self.assertEqual(fare, Decimal("270.00"))

    def test_minimum_fare_enforcement(self):
        # A computed fare below the base must be floored at the base.
        self.assertEqual(calculate_fare("regular", 0), Decimal("175.00"))
        self.assertEqual(calculate_fare("regular", -5), Decimal("175.00"))
        self.assertEqual(calculate_fare("xl", 0), Decimal("225.00"))
        self.assertEqual(calculate_fare("comfort", 0), Decimal("275.00"))

    def test_decimal_distance_rounding(self):
        fare = calculate_fare("regular", Decimal("2.55"))
        self.assertEqual(fare, Decimal("226.00"))

    def test_unknown_ride_type_falls_back_to_regular(self):
        fare = calculate_fare("luxury", 5)
        self.assertEqual(fare, Decimal("275.00"))

    def test_zero_distance_uses_base(self):
        for ride_type in MARKET["fare"]:
            with self.subTest(ride_type=ride_type):
                base = MARKET["fare"][ride_type]["base"]
                self.assertEqual(calculate_fare(ride_type, 0), base)


class CityPricingFormulaTests(SimpleTestCase):
    """Unit tests for CityPricing.calculate_fare()."""

    def test_city_pricing_regular(self):
        pricing = CityPricing(base_fare=Decimal("175"), per_km=Decimal("20"))
        self.assertEqual(pricing.calculate_fare(8), Decimal("335.00"))

    def test_city_pricing_minimum_is_base(self):
        pricing = CityPricing(base_fare=Decimal("175"), per_km=Decimal("20"))
        self.assertEqual(pricing.calculate_fare(0), Decimal("175.00"))

    def test_city_pricing_respects_minimum_fare_field(self):
        pricing = CityPricing(
            base_fare=Decimal("175"),
            per_km=Decimal("20"),
            minimum_fare=Decimal("300"),
        )
        self.assertEqual(pricing.calculate_fare(0), Decimal("300.00"))

    def test_city_pricing_negative_distance_treated_as_zero(self):
        pricing = CityPricing(base_fare=Decimal("225"), per_km=Decimal("25"))
        self.assertEqual(pricing.calculate_fare(-3), Decimal("225.00"))
