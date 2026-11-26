function trackAxis(desired, offset, min, max) {
  const minWithGoal = Math.max(min, min - offset);
  const maxWithGoal = Math.min(max, max - offset);
  if (minWithGoal <= maxWithGoal) return Math.min(maxWithGoal, Math.max(minWithGoal, desired));
  return Math.min(max, Math.max(min, desired));
}

export function driveFrame(width, height, player, goal, { hudBottom, footerTop }) {
  const zoom = Math.max(1.2, Math.min(2.25, Math.min(width * 1.6, height) / 365));
  const padding = Math.max(24, goal.radius * zoom + 4);
  const side = Math.min(Math.max(28, padding), width * .16);
  const safe = {
    left: side,
    right: width - side,
    top: Math.min(hudBottom + padding, height * .44),
    bottom: Math.max(footerTop - padding, height * .56),
  };
  const lead = 39 * zoom;
  const projectedX = (goal.x - player.x) * zoom;
  const projectedY = (goal.y - player.y) * zoom;
  const x = trackAxis(width / 2 - Math.cos(player.heading) * lead, projectedX, safe.left, safe.right);
  const y = trackAxis((safe.top + safe.bottom) / 2 - Math.sin(player.heading) * lead, projectedY, safe.top, safe.bottom);
  const view = { x: player.x - x / zoom, y: player.y - y / zoom, width: width / zoom, height: height / zoom };
  return { zoom, safe, view };
}
