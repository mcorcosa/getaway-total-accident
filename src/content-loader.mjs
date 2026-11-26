import { validateChapter, validateChapterOneProgression, validateWorld } from './schema.mjs';

async function loadJson(name, fetcher) {
  const url = new URL(`./content/${name}`, import.meta.url);
  let response;
  try {
    response = await fetcher(url);
  } catch {
    throw new Error(`Could not load src/content/${name}. Open the game using node scripts/serve.mjs.`);
  }
  if (!response.ok) {
    throw new Error(`Could not load src/content/${name} (HTTP ${response.status}). Add the authored JSON file at that path.`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`src/content/${name} contains invalid JSON: ${error.message}`);
  }
}

export async function loadContent({ fixture = false, fetcher = fetch } = {}) {
  let world;
  let chapter;
  if (fixture) {
    ({ fixtureWorld: world, fixtureChapter: chapter } = await import('./fixture.mjs'));
  } else {
    [world, chapter] = await Promise.all([
      loadJson('world.json', fetcher),
      loadJson('chapter1.json', fetcher),
    ]);
  }
  validateWorld(world);
  validateChapter(chapter, world);
  if (!fixture) validateChapterOneProgression(chapter, world);
  return { world, chapter, fixture };
}
