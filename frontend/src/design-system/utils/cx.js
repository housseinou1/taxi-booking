/**
 * Tiny className helper for design-system components.
 */
export function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default cx;
