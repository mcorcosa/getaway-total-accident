import { startDrive, stepDrive } from './simulation.mjs';
import { chooseVehicle, eligibleVehicles, vehicles } from './vehicles.mjs';
import { makeMap } from './world.mjs';

export function createGame({ world, chapter }, store) {
  const state = { phase: 'home', run: null, progress: store.read(), failure: null };
  const maps = new Map(chapter.missions.map(mission => [mission.id, makeMap(world, mission.mapPieceIds)]));
  const pending = state.progress.pending;
  if (pending) {
    state.phase = 'success';
    state.run = {
      mission: chapter.missions.find(mission => mission.id === pending.missionId),
      vehicleId: pending.vehicleId, haul: pending.haul, damage: pending.damage,
      firstClear: pending.firstClear === true, bonus: false, drive: null,
    };
  }

  function save(patch) {
    state.progress = store.write({ ...state.progress, ...patch });
  }

  function home() {
    state.phase = 'home';
    state.run = null;
    state.failure = null;
  }

  function openMission(missionId) {
    const index = chapter.missions.findIndex(mission => mission.id === missionId);
    if (index < 0 || index > state.progress.cleared.length) return false;
    const mission = chapter.missions[index];
    state.run = {
      mission, vehicleId: chooseVehicle(mission, state.progress.ownedVehicleIds),
      haul: 0, damage: 0, firstClear: false, bonus: false, drive: null,
    };
    state.failure = null;
    state.phase = 'briefing';
    return true;
  }

  function start() {
    const run = state.run;
    const vehicle = vehicles[run.vehicleId];
    if (!vehicle) return false;
    const segment = run.bonus ? run.mission.bonus : run.mission;
    if (!run.bonus) run.damage = vehicle.maxDamage;
    run.drive = startDrive(segment, maps.get(run.mission.id), vehicle, run.damage);
    state.phase = 'driving';
    return true;
  }

  function bank() {
    const balance = state.progress.bank + state.run.haul;
    if (!Number.isSafeInteger(balance)) return false;
    save({ bank: balance, pending: null });
    home();
    return true;
  }

  function tick(input, dt) {
    if (state.phase !== 'driving') return false;
    const run = state.run;
    const outcome = stepDrive(run.drive, input, dt);
    run.damage = run.drive.damage;
    if (!outcome) return false;
    if (outcome.kind === 'failure') {
      state.failure = { reason: outcome.reason, lost: run.haul, bonus: run.bonus };
      run.haul = 0;
      state.phase = 'failure';
      return true;
    }
    run.haul += run.drive.segment.payout;
    if (run.bonus) {
      if (!bank()) {
        state.failure = { reason: 'balance-limit', lost: run.haul, bonus: true };
        state.phase = 'failure';
      }
      return true;
    }
    const { mission, vehicleId, haul, damage } = run;
    run.firstClear = !state.progress.cleared.includes(mission.id);
    const cleared = run.firstClear ? [...state.progress.cleared, mission.id] : state.progress.cleared;
    save({ cleared, pending: { missionId: mission.id, vehicleId, haul, damage, firstClear: run.firstClear } });
    state.phase = 'success';
    return true;
  }

  function dispatch(action, value) {
    const { phase, run } = state;
    switch (action) {
      case 'open':
        return phase === 'home' && openMission(value);
      case 'garage':
      case 'shop':
      case 'daily':
        if (phase !== 'home' && !['garage', 'shop', 'daily'].includes(phase)) return false;
        state.phase = action;
        return true;
      case 'home':
        if (!['briefing', 'failure', 'pause', 'garage', 'shop', 'daily'].includes(phase)) return false;
        home();
        return true;
      case 'vehicle':
        if (phase !== 'briefing' || !eligibleVehicles(run.mission, state.progress.ownedVehicleIds).includes(value)) return false;
        run.vehicleId = value;
        return true;
      case 'start':
        if (phase !== 'briefing' && phase !== 'bonus-briefing') return false;
        if (run.bonus) save({ pending: null });
        return start();
      case 'bank':
        return phase === 'success' && bank();
      case 'bonus':
        if (phase !== 'success') return false;
        state.phase = 'bonus-briefing';
        run.bonus = true;
        return true;
      case 'cancel-bonus':
        if (phase !== 'bonus-briefing') return false;
        state.phase = 'success';
        run.bonus = false;
        return true;
      case 'pause':
        if (phase !== 'driving') return false;
        state.phase = 'pause';
        return true;
      case 'resume':
        if (phase !== 'pause') return false;
        state.phase = 'driving';
        return true;
      case 'replay':
        return phase === 'failure' && openMission(run.mission.id);
      default:
        return false;
    }
  }

  return { state, dispatch, tick, mapFor: missionId => maps.get(missionId) };
}
