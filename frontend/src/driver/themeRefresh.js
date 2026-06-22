import { getDriverColors, isDriverLyftUI } from "./lyftColors";

/**
 * Keeps shared COLORS/styles in sync for driver pages with module-level subcomponents.
 */
export function bindDriverTheme(buildStyles) {
  const bag = {
    COLORS: getDriverColors(),
    styles: null,
    lyftUI: isDriverLyftUI(),
  };

  bag.styles = buildStyles(bag.COLORS);

  function syncDriverTheme() {
    bag.COLORS = getDriverColors();
    bag.styles = buildStyles(bag.COLORS);
    bag.lyftUI = isDriverLyftUI();
    return bag;
  }

  return { bag, syncDriverTheme };
}
