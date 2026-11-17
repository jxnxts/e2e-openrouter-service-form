import { readFileSync } from 'node:fs';
import { findPackageJSON } from 'node:module';
import { dirname, resolve } from 'node:path';

/**
 * The file the installed `e2e` package declares as its `e2e` bin, the one
 * `npx e2e` runs. It is read from the package's own manifest, so nothing here
 * assumes a path inside the package. Callers run it with this same Node as a
 * direct child, with no shell or `.cmd` shim in between: the exit code and the
 * signals are then the CLI's own on every platform.
 */
export function e2eBin(): string {
  const manifest = findPackageJSON('e2e', import.meta.url);
  if (manifest === undefined) throw new Error('Pacote e2e não encontrado; rode npm ci.');
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8')) as { bin?: string | Record<string, string> };
  const entry = typeof bin === 'string' ? bin : bin?.['e2e'];
  if (entry === undefined) throw new Error('O pacote e2e instalado não declara o bin "e2e".');
  return resolve(dirname(manifest), entry);
}
