"""Published legal document versions — bump LEGAL_VERSION keys to require re-acceptance."""

LEGAL_VERSION = {
    "rider": "v1.0",
    "driver": "v1.0",
    "courier": "v1.0",
    "merchant": "v1.0",
}

# API-facing version keys
RIDER_TERMS_VERSION_KEY = "rider_terms_version"
DRIVER_TERMS_VERSION_KEY = "driver_terms_version"
COURIER_TERMS_VERSION_KEY = "courier_terms_version"
MERCHANT_TERMS_VERSION_KEY = "merchant_terms_version"

def legal_versions_payload():
    return {
        "legal_version": LEGAL_VERSION,
        RIDER_TERMS_VERSION_KEY: LEGAL_VERSION["rider"],
        DRIVER_TERMS_VERSION_KEY: LEGAL_VERSION["driver"],
        COURIER_TERMS_VERSION_KEY: LEGAL_VERSION["courier"],
        MERCHANT_TERMS_VERSION_KEY: LEGAL_VERSION["merchant"],
    }

# Derived constants (backwards-compatible imports)
COURIER_TERMS_VERSION = LEGAL_VERSION["courier"]
MERCHANT_TERMS_VERSION = LEGAL_VERSION["merchant"]
RIDE_TERMS_VERSION = LEGAL_VERSION["rider"]
RIDER_TERMS_VERSION = LEGAL_VERSION["rider"]
DRIVER_AGREEMENT_VERSION = LEGAL_VERSION["driver"]

# Yala Delivery Customer (checkbox only — separate from LEGAL_VERSION)
CUSTOMER_DELIVERY_TERMS_VERSION = "v1.1"
CUSTOMER_PRIVACY_VERSION = "v1.0"
RIDE_PRIVACY_VERSION = CUSTOMER_PRIVACY_VERSION
RIDER_PRIVACY_VERSION = CUSTOMER_PRIVACY_VERSION

COURIER_LEGAL_DECLARATION = (
    "I confirm that this electronic signature is legally binding and that I agree "
    "to the Yala Delivery Terms & Conditions."
)

MERCHANT_LEGAL_DECLARATION = (
    "I confirm that this electronic signature is legally binding and that I agree "
    "to the Yala Merchant Terms & Conditions."
)

DRIVER_LEGAL_DECLARATION = (
    "I confirm that this electronic signature is legally binding and that I agree "
    "to the Yala Driver Agreement."
)
