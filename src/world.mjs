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

const neighborhoodReach = 360;

function near(a, b, margin) {
  return a.x <= b.x + b.width + margin && a.x + a.width + margin >= b.x &&
    a.y <= b.y + b.height + margin && a.y + a.height + margin >= b.y;
}

function edges(rect, axis) {
  const size = axis === 'x' ? 'width' : 'height';
  return [rect[axis], rect[axis] + rect[size]];
}

function closureSpans(road, activeRoads) {
  const axis = road.width >= road.height ? 'x' : 'y';
  const across = axis === 'x' ? 'y' : 'x';
  const [start, end] = edges(road, axis);
  const [low, high] = edges(road, across);
  const crossCuts = new Set([low, high]);
  const nearbyRoads = [];
  for (const active of activeRoads) {
    const [from, to] = edges(active, axis);
    const [left, right] = edges(active, across);
    if (from > end || to < start || left >= high || right <= low) continue;
    crossCuts.add(Math.max(left, low));
    crossCuts.add(Math.min(right, high));
    nearbyRoads.push({ from, to, left, right });
  }

  const cuts = [...crossCuts].sort((a, b) => a - b);
  const spans = new Map();
  for (let i = 1; i < cuts.length; i += 1) {
    const left = cuts[i - 1];
    const right = cuts[i];
    const center = (left + right) / 2;
    const strips = nearbyRoads.filter(road => center > road.left && center < road.right);
    const boundaries = [...new Set(strips.flatMap(({ from, to }) => [from, to]))].sort((a, b) => a - b);
    for (const [index, coordinate] of boundaries.entries()) {
      if (coordinate < start || coordinate > end) continue;
      const openBefore = strips.some(({ from, to }) => from < coordinate && to >= coordinate);
      const openAfter = strips.some(({ from, to }) => from <= coordinate && to > coordinate);
      if (openBefore === openAfter) continue;
      const direction = openBefore ? 1 : -1;
      const space = direction > 0 ? Math.min(end, boundaries[index + 1] ?? end) - coordinate :
        coordinate - Math.max(start, boundaries[index - 1] ?? start);
      const thickness = Math.min(12, space);
      if (thickness <= 0) continue;

      // Put the barrier entirely on the closed side of the active road union.
      const along = direction > 0 ? coordinate : coordinate - thickness;
      const key = `${along}/${thickness}`;
      const spansAtEdge = spans.get(key) ?? [];
      const previous = spansAtEdge.at(-1);
      if (previous?.right === left) previous.right = right;
      else spansAtEdge.push({ along, thickness, left, right });
      spans.set(key, spansAtEdge);
    }
  }
  return [...spans.values()].flatMap(spansAtEdge => spansAtEdge.map(({ along, thickness, left, right }) =>
    axis === 'x' ? { x: along, y: left, width: thickness, height: right - left, axis } :
      { x: left, y: along, width: right - left, height: thickness, axis }));
}

function makeScenery(world, pieces, roads) {
  const vicinity = world.pieces.filter(piece => pieces.some(active => near(piece.bounds, active.bounds, neighborhoodReach)));
  const inactive = vicinity.filter(piece => !pieces.includes(piece));
  const surroundings = inactive.flatMap(piece => piece.roads);
  const obstacles = vicinity.flatMap(piece => (piece.obstacles ?? []).filter(obstacle =>
    pieces.includes(piece) || !roads.some(road => near(obstacle, road, 5))));
  return {
    roads: vicinity.flatMap(piece => piece.roads),
    surroundings,
    obstacles,
    closures: surroundings.flatMap(road => closureSpans(road, roads)),
  };
}

export function makeMap(world, pieceIds) {
  const pieces = pieceIds.map(id => world.pieces.find(piece => piece.id === id));
  const minX = Math.min(...pieces.map(piece => piece.bounds.x));
  const minY = Math.min(...pieces.map(piece => piece.bounds.y));
  const maxX = Math.max(...pieces.map(piece => piece.bounds.x + piece.bounds.width));
  const maxY = Math.max(...pieces.map(piece => piece.bounds.y + piece.bounds.height));
  const nodes = pieces.flatMap(piece => piece.navNodes ?? []);
  const roads = pieces.flatMap(piece => piece.roads);
  const neighbors = new Map(nodes.map(node => [node.id, new Set()]));
  for (const [a, b] of pieces.flatMap(piece => piece.navLinks ?? [])) {
    if (neighbors.has(a) && neighbors.has(b)) {
      neighbors.get(a).add(b);
      neighbors.get(b).add(a);
    }
  }
  return {
    pieces,
    roads,
    obstacles: pieces.flatMap(piece => piece.obstacles ?? []),
    bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    nodes,
    neighbors,
    scenery: makeScenery(world, pieces, roads),
  };
}
