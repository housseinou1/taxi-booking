export function getCourierLevelInfo(profile = {}) {
  const level = profile.level;

  if (level && typeof level === "object") {
    return {
      label: level.label || "Bronze Courier",
      points: Number(level.points ?? profile.courier_points ?? profile.points ?? 0),
      nextLevelPoints: Number(level.next_level_points ?? profile.next_level_points ?? 3000),
      rewardRate: level.reward_rate || "",
    };
  }

  return {
    label: profile.courier_level || (typeof level === "string" ? level : "") || "Bronze Courier",
    points: Number(profile.courier_points ?? profile.points ?? 0),
    nextLevelPoints: Number(profile.next_level_points ?? 3000),
    rewardRate: "",
  };
}
