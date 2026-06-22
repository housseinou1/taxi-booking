/**
 * Check whether a rider profile includes both photo and phone.
 * Profile completion is optional for booking, but still useful for UI hints.
 *
 * @param {object|null|undefined} profile - Rider profile object
 * @returns {boolean} True when both profile photo and phone number are present
 */
export function isProfileComplete(profile) {
  return Boolean(
    profile?.profile_picture &&
      String(profile.profile_picture).trim() &&
      profile?.phone_number &&
      String(profile.phone_number).trim()
  );
}

/**
 * Whether the rider can proceed with booking.
 * Backend no longer requires photo/phone before request_ride.
 */
export function canRequestRide() {
  return true;
}
