import { eligibleVehicles, STARTER_VEHICLE_ID, vehicles } from './vehicles.mjs';

export const SAVE_KEY = 'getaway-totally-accidental-chapter-1-v1';

export function newProgress() {
  return { version: 1, bank: 0, cleared: [], ownedVehicleIds: [STARTER_VEHICLE_ID], pending: null };
}

function validPending(pending, chapter, cleared, ownedVehicleIds) {
  if (pending === null) return true;
  if (!pending || !cleared.includes(pending.missionId) || !Object.hasOwn(vehicles, pending.vehicleId)) return false;
  const mission = chapter.missions.find(entry => entry.id === pending.missionId);
  if (!mission || pending.haul !== mission.payout ||
      (pending.firstClear !== undefined && typeof pending.firstClear !== 'boolean') || !Number.isInteger(pending.damage) ||
      pending.damage < 1 || pending.damage > vehicles[pending.vehicleId].maxDamage) return false;
  return eligibleVehicles(mission, ownedVehicleIds).includes(pending.vehicleId);
}

function validProgress(value, chapter) {
  return value?.version === 1 && Number.isSafeInteger(value.bank) && value.bank >= 0 &&
    Array.isArray(value.cleared) && value.cleared.length <= chapter.missions.length &&
    value.cleared.every((id, index) => chapter.missions[index].id === id) &&
    Array.isArray(value.ownedVehicleIds) && value.ownedVehicleIds.includes(STARTER_VEHICLE_ID) &&
    new Set(value.ownedVehicleIds).size === value.ownedVehicleIds.length &&
    value.ownedVehicleIds.every(id => Object.hasOwn(vehicles, id)) &&
    validPending(value.pending, chapter, value.cleared, value.ownedVehicleIds);
}

export function progressStore(chapter, { getStorage, fixture = false, onNotice = () => {} }) {
  const key = fixture ? `${SAVE_KEY}-fixture` : SAVE_KEY;
  let current = newProgress();
  let storage;
  try {
    storage = getStorage();
    const raw = storage.getItem(key);
    if (raw !== null) {
      try {
        const saved = JSON.parse(raw);
        if (!validProgress(saved, chapter)) throw new Error('Invalid save');
        current = saved;
      } catch {
        onNotice('Saved Chapter 1 progress could not be read. A new save will start when you make progress.');
      }
    }
  } catch {
    onNotice('Browser storage is unavailable. Progress is available for this session.');
  }
  return {
    read: () => current,
    write(next) {
      current = next;
      try {
        storage.setItem(key, JSON.stringify(current));
        onNotice('');
      } catch {
        onNotice('Browser storage could not save progress. Keep this tab open to retain your session.');
      }
      return current;
    },
  };
}
