import { Graphics, Sprite, Text, VERSION } from '../../vendor/pixi.mjs';

function point(node) {
  const p = node.toGlobal({ x: 0, y: 0 });
  return { x: p.x, y: p.y };
}

function bounds(node) {
  const box = node.getBounds();
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

function sceneTree(root) {
  const nodes = [];
  function visit(node, ancestor, shown) {
    const visible = shown && node.visible && node.alpha > 0;
    const label = node.label;
    if (label && !['palmera-bay-art', 'art-band'].includes(label)) {
      const type = node instanceof Graphics ? 'Graphics' : node instanceof Text ? 'Text' : node instanceof Sprite ? 'Sprite' : 'Container';
      const item = { label, ancestor, type, visible, position: point(node), bounds: bounds(node) };
      if (type === 'Text') item.text = node.text;
      nodes.push(item);
    }
    for (const child of node.children) visit(child, label, visible);
  }
  visit(root, null, true);
  return nodes;
}

export function attachObservation(app, view, game, input) {
  Object.defineProperty(window, '__getawayScene', {
    value: () => {
      const { phase, run, progress, failure } = game.state;
      const { controls, focus, scroll, modal } = view.observation();
      const drive = run?.drive;
      return {
        phase, focus, activeHost: document.activeElement === app.canvas, pixi: VERSION,
        renderer: app.renderer.name, width: app.screen.width, height: app.screen.height,
        modal, scroll: phase === 'home' ? { ...scroll } : null, input: input(),
        progress: structuredClone(progress),
        run: run && { missionId: run.mission.id, vehicleId: run.vehicleId, bonus: run.bonus, haul: run.haul },
        failure: failure && { ...failure },
        drive: drive && {
          player: { ...drive.player }, damage: drive.damage, pickup: drive.pickedUp,
          objective: structuredClone(drive.segment.objective),
        },
        controls: controls.map(control => {
          const { node, id, name, action, enabled, value, status, role, selected, expanded, drive } = control;
          const top = point(node);
          const area = node.hitArea;
          const opposite = node.toGlobal({ x: area.width, y: area.height });
          return {
            id, name, action, enabled, value, status, role, selected, expanded, drive,
            interactive: node.eventMode === 'static', visible: node.visible, alpha: node.alpha,
            bounds: { x: top.x, y: top.y, width: opposite.x - top.x, height: opposite.y - top.y },
          };
        }),
        scene: sceneTree(app.stage),
      };
    },
  });
}
