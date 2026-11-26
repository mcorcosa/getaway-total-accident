export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function inside(rect, point) {
  return point.x >= rect.x && point.x <= rect.x + rect.width &&
    point.y >= rect.y && point.y <= rect.y + rect.height;
}

export function onRoad(map, point) {
  return map.roads.some(road => inside(road, point)) &&
    !map.obstacles.some(obstacle => inside(obstacle, point));
}

export function behind(spawn, gap) {
  return {
    x: spawn.x - Math.cos(spawn.heading) * gap,
    y: spawn.y - Math.sin(spawn.heading) * gap,
  };
}

// Find the portion of a segment inside an axis-aligned rectangle.
function interval(rect, from, to) {
  let low = 0;
  let high = 1;
  for (const [axis, size] of [['x', 'width'], ['y', 'height']]) {
    const start = from[axis];
    const delta = to[axis] - start;
    const min = rect[axis];
    const max = min + rect[size];
    if (!delta) {
      if (start < min || start > max) return null;
      continue;
    }
    const a = (min - start) / delta;
    const b = (max - start) / delta;
    low = Math.max(low, Math.min(a, b));
    high = Math.min(high, Math.max(a, b));
    if (low > high) return null;
  }
  return [low, high];
}

export function roadLine(map, from, to) {
  if (map.obstacles.some(obstacle => interval(obstacle, from, to))) return false;
  const spans = map.roads.map(road => interval(road, from, to)).filter(Boolean);
  spans.sort((a, b) => a[0] - b[0]);
  let end = 0;
  for (const [start, stop] of spans) {
    if (start > end + 1e-9) return false;
    end = Math.max(end, stop);
    if (end >= 1) return true;
  }
  return false;
}

export function makeMap(world, pieceIds) {
  const pieces = pieceIds.map(id => world.pieces.find(piece => piece.id === id));
  const minX = Math.min(...pieces.map(piece => piece.bounds.x));
  const minY = Math.min(...pieces.map(piece => piece.bounds.y));
  const maxX = Math.max(...pieces.map(piece => piece.bounds.x + piece.bounds.width));
  const maxY = Math.max(...pieces.map(piece => piece.bounds.y + piece.bounds.height));
  const nodes = pieces.flatMap(piece => piece.navNodes ?? []);
  const neighbors = new Map(nodes.map(node => [node.id, new Set()]));
  for (const [a, b] of pieces.flatMap(piece => piece.navLinks ?? [])) {
    if (neighbors.has(a) && neighbors.has(b)) {
      neighbors.get(a).add(b);
      neighbors.get(b).add(a);
    }
  }
  return {
    pieces,
    roads: pieces.flatMap(piece => piece.roads),
    obstacles: pieces.flatMap(piece => piece.obstacles ?? []),
    bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    nodes,
    neighbors,
  };
}
