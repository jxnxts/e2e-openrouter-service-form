import { createServer } from 'node:http';
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** Serve only the built synthetic page on loopback: on `port`, or on any free port for 0. */
export async function startApp(port = 0) {
  const html = await readFile(new URL('../dist/index.html', import.meta.url));
  const server = createServer((request, response) => {
    if (request.url !== '/') {
      response.writeHead(404).end('Não encontrado');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(html);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => {
      server.closeAllConnections();
      server.close(error => error ? reject(error) : resolve());
    }),
  };
}

// Compare real paths: a checkout reached through a symbolic link must still start the server.
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  // The e2e runner passes the port it reserved as PORT; `npm start` leaves it unset and gets any free port.
  const port = Number(process.env.PORT ?? '0');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT deve ser um inteiro entre 0 e 65535.');
  const app = await startApp(port);
  console.log(`Atendimento fictício: ${app.url}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); });
}
