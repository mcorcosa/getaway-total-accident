import { readFile } from 'node:fs/promises';
import { loadContent } from '../src/content-loader.mjs';

const fixture = process.argv.includes('--fixture');

try {
  const { chapter } = await loadContent({
    fixture,
    async fetcher(url) {
      try {
        return Response.json(JSON.parse(await readFile(url, 'utf8')));
      } catch (error) {
        if (error.code === 'ENOENT') return new Response(null, { status: 404 });
        return new Response(error.message);
      }
    },
  });
  console.log(`${chapter.title}: ${chapter.missions.length} missions passed content checks.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
