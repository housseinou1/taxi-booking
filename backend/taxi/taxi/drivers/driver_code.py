import secrets

from taxi.drivers.models import DriverProfile


def ensure_driver_code(profile):
    """
    Ensure a 6-digit unique driver code exists before approval or QR generation.
    """
    if profile.driver_code:
        return profile.driver_code

    for _ in range(20):
        code = f"{secrets.randbelow(1_000_000):06d}"
        if not DriverProfile.objects.filter(driver_code=code).exists():
            profile.driver_code = code
            return code

    raise ValueError("Unable to assign a unique driver code. Please retry approval.")
