const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const markerGlowRadius = 23;
export const markerRingWidth = 1.35;

export function driveFrame(width, height, player, goal, { hudBottom, footerTop }) {
  const zoom = Math.max(1.2, Math.min(2.25, Math.min(width * 1.6, height) / 365));
  const side = Math.min(28, width * .16);
  const car = {
    left: side,
    right: width - side,
    top: Math.min(hudBottom + 24, height * .44),
    bottom: Math.max(footerTop - 24, height * .56),
  };
  const lead = 39 * zoom;
  const x = clamp(width / 2 - Math.cos(player.heading) * lead, car.left, car.right);
  const y = clamp((car.top + car.bottom) / 2 - Math.sin(player.heading) * lead, car.top, car.bottom);
  const view = { x: player.x - x / zoom, y: player.y - y / zoom, width: width / zoom, height: height / zoom };

  // The marker retains its glow and ring clearance without moving the camera.
  const markerRadius = Math.max(markerGlowRadius, goal.radius + markerRingWidth / 2);
  const padding = markerRadius * zoom + 4;
  const safe = { left: padding, right: width - padding, top: hudBottom + padding, bottom: footerTop - padding };
  const edge = safe.left < safe.right && safe.top < safe.bottom ? safe : car;
  return { zoom, safe, edge, view };
}
