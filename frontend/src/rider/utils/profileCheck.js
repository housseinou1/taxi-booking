/**
 * Check if a rider's profile is complete enough to proceed with booking.
 * Blocks booking if either profile_picture or phone_number is empty/null.
 *
 * @param {object} profile - Rider profile object
 * @param {string|null} profile.profile_picture - Profile picture URL or null
 * @param {string|null} profile.phone_number - Phone number or null
 * @returns {boolean} True if profile is complete, false otherwise
 */
export function isProfileComplete(profile) {
  if (!profile) return false;

  const hasPicture = profile.profile_picture != null && profile.profile_picture !== '';
  const hasPhone = profile.phone_number != null && profile.phone_number !== '';

  return hasPicture && hasPhone;
}
