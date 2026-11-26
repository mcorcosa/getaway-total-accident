import { Assets } from '/vendor/pixi.mjs';

const images = {
  map: '/assets/ui/palmera-bay.jpg',
  'first-job': '/assets/ui/postcards/first-job.jpg',
  'canal-ward': '/assets/ui/postcards/canal-ward.jpg',
  success: '/assets/ui/postcards/success.jpg',
  bonus: '/assets/ui/postcards/bonus.jpg',
};

export async function loadImages() {
  const entries = await Promise.all(Object.entries(images).map(async ([id, src]) => [id, await Assets.load(src)]));
  return Object.fromEntries(entries);
}
