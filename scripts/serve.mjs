import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const types = { html: 'text/html', css: 'text/css', mjs: 'text/javascript', json: 'application/json' };

export function gameServer() {
  return createServer(async (request, response) => {
    const pathname = request.url.split('?')[0];
    const file = pathname === '/' ? 'index.html' : pathname.slice(1);
    const allowed = /^(?:index\.html|src\/(?:[\w-]+\/)*[\w-]+\.(?:mjs|css|json))$/.test(file);
    if (!allowed || !['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(404).end('Not found');
      return;
    }
    try {
      const data = await readFile(new URL(`../${file}`, import.meta.url));
      response.writeHead(200, {
        'Content-Type': `${types[file.split('.').at(-1)]}; charset=utf-8`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      }).end(request.method === 'HEAD' ? undefined : data);
    } catch (error) {
      const missing = error.code === 'ENOENT';
      response.writeHead(missing ? 404 : 500).end(missing ? 'Not found' : 'Unable to read file');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = process.argv[2] === undefined ? 8080 : Number(process.argv[2]);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error('Usage: node scripts/serve.mjs [port]');
    process.exitCode = 1;
  } else {
    const server = gameServer();
    server.on('error', error => {
      console.error(error.message);
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${server.address().port}/`;
      console.log(`Chapter 1: ${url}\nEngineering fixture: ${url}?fixture=1`);
    });
  }
}
