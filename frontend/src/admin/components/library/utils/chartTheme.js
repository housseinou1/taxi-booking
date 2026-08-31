export function getChartColors(count = 5) {
  const palette = [
    "var(--admin-accent, #00a651)",
    "#38bdf8",
    "#f59e0b",
    "#a78bfa",
    "#f87171",
    "#34d399",
    "#fb7185",
  ];
  return Array.from({ length: count }, (_, i) => palette[i % palette.length]);
}

export function getChartDimensions(containerWidth, aspectRatio = 2.2) {
  const width = Math.max(280, containerWidth || 640);
  const height = Math.round(width / aspectRatio);
  return { width, height };
}
