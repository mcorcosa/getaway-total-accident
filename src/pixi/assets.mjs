import { Assets } from '../../vendor/pixi.mjs';

const images = {
  map: '../../assets/ui/palmera-bay.jpg',
  'first-job': '../../assets/ui/postcards/first-job.jpg',
  'canal-ward': '../../assets/ui/postcards/canal-ward.jpg',
  success: '../../assets/ui/postcards/success.jpg',
  bonus: '../../assets/ui/postcards/bonus.jpg',
};

const cityHatchbackUrl = new URL('../../assets/gameplay/canal-ward/cars/city-hatchback.png', import.meta.url).href;
let cityHatchbackRequested = false;
let cityHatchbackTexture;

export function getCityHatchbackTexture() {
  if (!cityHatchbackRequested) {
    cityHatchbackRequested = true;
    Assets.load(cityHatchbackUrl).then(texture => {
      cityHatchbackTexture = texture;
    }).catch(() => {
      // The driving renderer keeps its procedural body when the optional image fails.
    });
  }
  return cityHatchbackTexture;
}

export async function loadImages() {
  const entries = await Promise.all(Object.entries(images).map(async ([id, src]) => {
    return [id, await Assets.load(new URL(src, import.meta.url).href)];
  }));
  return Object.fromEntries(entries);
}
