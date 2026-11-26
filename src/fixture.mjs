import { STARTER_VEHICLE_ID } from './vehicles.mjs';

export const fixtureWorld = {
  version: 1,
  pieces: [{
    id: 'test-block',
    bounds: { x: -50, y: -40, width: 880, height: 530 },
    roads: [
      { x: 0, y: 34, width: 780, height: 96 },
      { x: 388, y: 82, width: 112, height: 321 },
      { x: 90, y: 343, width: 690, height: 100 },
    ],
    navNodes: [
      { id: 'northwest', x: 35, y: 82 }, { id: 'junction', x: 444, y: 82 },
      { id: 'northeast', x: 750, y: 82 }, { id: 'bend', x: 444, y: 393 },
      { id: 'southwest', x: 115, y: 393 }, { id: 'southeast', x: 748, y: 393 },
    ],
    navLinks: [
      ['northwest', 'junction'], ['junction', 'northeast'], ['junction', 'bend'],
      ['bend', 'southwest'], ['bend', 'southeast'],
    ],
  }],
};

const spawn = (x, y = 82, heading = 0) => ({ x, y, heading });
const marker = (x, y = 82) => ({ x, y, radius: 22 });
const delivery = destination => ({ kind: 'delivery', destination });
const pickupDelivery = (pickup, destination) => ({ kind: 'pickup-delivery', pickup, destination });
const base = {
  minTier: 1,
  defaultVehicleId: STARTER_VEHICLE_ID,
  allowVehicleSelection: true,
  mapPieceIds: ['test-block'],
};

export const fixtureChapter = {
  version: 1,
  id: 'test-chapter',
  title: 'Canal Ward · Engineering Fixture',
  missions: [
    {
      ...base, id: 'straight-delivery', title: 'A Short Drive',
      flavour: 'Nina: The garage is expecting you.',
      instructions: 'Nina: Let the car roll straight to the garage.',
      spawn: spawn(90), objective: delivery(marker(270)), payout: 100,
      bonus: {
        flavour: 'Nina: There’s another envelope up the street.',
        instructions: 'Nina: Collect the envelope and keep going to the highlighted garage.',
        spawn: spawn(280), objective: pickupDelivery(marker(425), marker(610)), payout: 75,
      },
    },
    {
      ...base, id: 'street-pickup', title: 'At the Junction',
      flavour: 'Nina: Look for the envelope near the junction.',
      instructions: 'Nina: Collect the envelope, then steer right toward the south garage.',
      spawn: spawn(260), objective: pickupDelivery(marker(420), marker(445, 310)), payout: 125,
      bonus: {
        flavour: 'Nina: The second garage is down the block.',
        instructions: 'Nina: Drive along the south road to the garage.',
        spawn: spawn(450, 393), objective: delivery(marker(680, 393)), payout: 60,
      },
    },
    {
      ...base, id: 'patrol-delivery', title: 'Company',
      flavour: 'Nina: There’s a patrol behind you.',
      instructions: 'Nina: Keep driving until you reach the garage.',
      spawn: spawn(175), objective: delivery(marker(610)), payout: 150,
      patrol: { startGap: 100, speed: 118, captureRadius: 28, captureSeconds: .6 },
      bonus: {
        flavour: 'Nina: There’s one more garage.',
        instructions: 'Nina: Head west to the garage.',
        spawn: spawn(650, 82, Math.PI), objective: delivery(marker(305)), payout: 80,
      },
    },
  ],
};
