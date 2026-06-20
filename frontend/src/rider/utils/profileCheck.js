/**
 * Check whether a rider profile includes both photo and phone.
 * Used for optional UI hints only; ride requests are not blocked on this.
 *
 * @param {object|null|undefined} profile - Rider profile object
 * @returns {boolean} True when both profile_picture and phone_number are present
 */
export function isProfileComplete(profile) {
  if (!profile) return false;

  const hasPicture = profile.profile_picture != null && profile.profile_picture !== '';
  const hasPhone = profile.phone_number != null && profile.phone_number !== '';

  return hasPicture && hasPhone;
}

/**
 * Whether the rider can proceed with booking.
 * Backend no longer requires photo/phone before request_ride.
 */
export function canRequestRide() {
  return true;
}
