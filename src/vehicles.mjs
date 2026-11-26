export const STARTER_VEHICLE_ID = 'starter-coupe';

export const vehicles = Object.freeze({
  [STARTER_VEHICLE_ID]: Object.freeze({
    name: 'Starter Coupe', category: 'coupe', tier: 1, maxDamage: 4,
    speed: 120, acceleration: 194, turn: 3.45, grip: 12, length: 24, width: 13, color: '#FF4FA7',
  }),
  'street-coupe': Object.freeze({
    name: 'Street Coupe', category: 'coupe', tier: 2, maxDamage: 5,
    speed: 136, acceleration: 209, turn: 3.6, grip: 13, length: 25, width: 13, color: '#34E7E1',
  }),
  'city-hatchback': Object.freeze({
    name: 'City Hatchback', category: 'hatchback', tier: 1, maxDamage: 3,
    speed: 116, acceleration: 213, turn: 3.8, grip: 15, length: 21, width: 12, color: '#FFD368',
  }),
});

export function eligibleVehicles(mission, ownedVehicleIds) {
  if (mission.stolenVehicleId) return [mission.stolenVehicleId];
  const defaultVehicle = vehicles[mission.defaultVehicleId];
  const candidates = mission.allowVehicleSelection ? ownedVehicleIds : [mission.defaultVehicleId];
  return [...new Set(candidates)].filter(id => {
    const vehicle = Object.hasOwn(vehicles, id) ? vehicles[id] : null;
    return ownedVehicleIds.includes(id) && vehicle?.tier >= mission.minTier &&
      vehicle.category === defaultVehicle.category;
  });
}

export function chooseVehicle(mission, ownedVehicleIds) {
  const choices = eligibleVehicles(mission, ownedVehicleIds);
  return choices.includes(mission.defaultVehicleId) ? mission.defaultVehicleId : choices[0] ?? null;
}
