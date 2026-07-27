import { getDriverColors, isDriverYalaUI } from "./yalaColors";

/**
 * Keeps shared COLORS/styles in sync for driver pages with module-level subcomponents.
 */
export function bindDriverTheme(buildStyles) {
  const bag = {
    COLORS: getDriverColors(),
    styles: null,
    yalaUI: isDriverYalaUI(),
  };

  bag.styles = buildStyles(bag.COLORS);

  function syncDriverTheme() {
    bag.COLORS = getDriverColors();
    bag.styles = buildStyles(bag.COLORS);
    bag.yalaUI = isDriverYalaUI();
    return bag;
  }

  return { bag, syncDriverTheme };
}
