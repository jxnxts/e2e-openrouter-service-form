import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { appendFile, cp, mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { e2eBin } from '../../scripts/e2e-bin.ts';

/** Include binary media, hidden cache, reports and traces in the leak check. */
async function generatedFiles(directory: string): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await generatedFiles(path));
    else if (entry.isFile()) paths.push(path);
  }
  return paths;
}

for (const override of [false, true]) {
  test(`real CLI redacts a loopback echo-401 key, override=${override}`, { timeout: 30_000 }, async () => {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const temporaryRoot = join(root, '.e2e/security-projects');
    await mkdir(temporaryRoot, { recursive: true });
    // Nest under the project so published dependencies resolve through ancestors, no copied trees/symlinks.
    const project = await mkdtemp(join(temporaryRoot, 'echo401-'));
    const key = override ? 'override-SYNTHETIC-openrouter-key-246810' : 'primary-SYNTHETIC-openrouter-key-7654321';
    const diagnostic = 'Synthetic authentication rejected';
    let requests = 0;
    let matched = false;
    const server = createServer(async (request, response) => {
      for await (const chunk of request) { void chunk; }
      requests++;
      matched = request.headers.authorization === 'Bearer ' + key;
      response.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { code: 401, message: diagnostic + ': ' + request.headers.authorization } }));
    });
    // This test owns the page, not the CLI: a CLI killed by the watchdog cannot stop anything it started.
    let app: { url: string; close(): Promise<void> } | undefined;
    let child: ReturnType<typeof spawn> | undefined;
    let closed: Promise<{ code: number | null; signal: NodeJS.Signals | null }> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    // Opt-in sanitized receipt (SECURITY_EVIDENCE_FILE): counts, booleans and artifact hashes only, never key or output text.
    const evidence: Record<string, unknown> = { override };
    try {
      const inputs = ['scripts/model.ts', 'scripts/configuration.ts', 'scripts/serve.mjs', 'e2e.config.ts', 'tests/e2e/agent.e2e.ts', 'e2e.security.config.ts', 'package.json', 'tsconfig.json', 'dist/index.html'];
      for (const name of inputs) {
        await mkdir(join(project, name, '..'), { recursive: true });
        await cp(join(root, name), join(project, name));
      }
      await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      const address = server.address(); assert.ok(address && typeof address !== 'string');
      const serve = await import(pathToFileURL(join(project, 'scripts/serve.mjs')).href);
      app = await serve.startApp();
      const env: NodeJS.ProcessEnv = {
        PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: join(project, '.tmp'),
        SYNTHETIC_SECURITY_APP_URL: app!.url, SYNTHETIC_SECURITY_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
        OPENROUTER_MODEL: 'security-fixture-no-inference', OPENROUTER_PROVIDER: 'fixture-provider',
        OPENROUTER_API_KEY: override ? 'unused-SYNTHETIC-primary-key-135790' : key,
        ...(override ? { E2E_SECRET_OPENROUTER_API_KEY: key } : {}), OPENROUTER_REQUEST_TIMEOUT_MS: '3000',
        // Keep the CLI child offline: no usage telemetry, no registry update check, no user config writes.
        E2E_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1', E2E_UPDATE_CHECK_DISABLED: '1', XDG_CONFIG_HOME: join(project, '.config'),
      };
      await mkdir(env.TMPDIR!, { recursive: true });
      let output = '';
      child = spawn(process.execPath, [e2eBin(), 'run', 'tests/e2e/agent.e2e.ts', '--config', 'e2e.security.config.ts', '--no-cache', '--video', '--output', '.e2e/security'], { cwd: project, env, stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout!.on('data', chunk => { output += chunk.toString(); });
      child.stderr!.on('data', chunk => { output += chunk.toString(); });
      const running = child;
      closed = new Promise((resolve, reject) => { running.once('error', reject); running.once('close', (code, signal) => resolve({ code, signal })); });
      watchdog = setTimeout(() => running.kill('SIGKILL'), 20_000);
      const exit = await closed;
      clearTimeout(watchdog);
      evidence.exit = exit;
      assert.equal(exit.signal, null, 'CLI must exit normally, not via watchdog');
      assert.equal(exit.code, 3, 'Provider authentication failure must preserve exit 3');
      assert.equal(requests, 1, '401 must not be retried');
      assert.ok(matched, 'Effective key must authenticate only to the test loopback server');
      const outputDir = join(project, '.e2e/security');
      const report = await readFile(join(outputDir, 'report.json'), 'utf8');
      for (const text of [output, report]) {
        assert.ok(text.includes('MODEL_PROVIDER_FAILED') && text.includes(diagnostic));
        assert.ok(text.includes('<secret:openrouter-api-key>'));
        assert.ok(!text.includes(key));
      }
      const leaked: string[] = [];
      const scanned: { path: string; bytes: number; sha256: string }[] = [];
      for (const path of await generatedFiles(join(project, '.e2e'))) {
        const bytes = await readFile(path);
        scanned.push({ path: path.slice(project.length + 1), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
        if (bytes.includes(Buffer.from(key))) leaked.push(path.slice(project.length + 1));
      }
      Object.assign(evidence, { scanned, leaked: leaked.length });
      assert.deepEqual(leaked, [], 'No artifact, trace, cache or media may retain the effective key');
    } finally {
      if (watchdog) clearTimeout(watchdog);
      if (child && child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        if (closed) await Promise.race([closed.catch(() => undefined), new Promise(resolve => setTimeout(resolve, 2_000))]);
      }
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await app?.close();
      await rm(project, { recursive: true, force: true });
      if (process.env.SECURITY_EVIDENCE_FILE) {
        Object.assign(evidence, { requests, matched, projectRemoved: await stat(project).then(() => false, () => true) });
        // An unwritable optional receipt must never replace the test's own result.
        try { await appendFile(process.env.SECURITY_EVIDENCE_FILE, JSON.stringify(evidence) + '\n'); }
        catch { console.warn('SECURITY_EVIDENCE_FILE: optional receipt not written.'); }
      }
    }
  });
}
