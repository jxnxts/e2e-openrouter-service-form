import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

/** Enumerate every generated file, including reports, cache, traces and binary media. */
async function generatedFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await generatedFiles(path));
    else if (entry.isFile()) paths.push(path);
  }
  return paths;
}

for (const override of [false, true]) {
  test(`the real Mandu command redacts a key echoed by HTTP 401 (override=${override})`, { timeout: 30_000 }, async () => {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const project = await mkdtemp(join(tmpdir(), 'mandu-error-redaction-'));
    const syntheticKey = override ? 'override-SYNTHETIC-key-246810' : 'security-SYNTHETIC-key-7654321';
    const diagnostic = 'Synthetic authentication rejected';
    let endpoint = '';
    let requests = 0;
    let authorizationMatched = false;
    const server = createServer(async (request, response) => {
      for await (const chunk of request) { void chunk; }
      requests += 1;
      authorizationMatched = request.headers.authorization === `Bearer ${syntheticKey}`;
      response.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({
        error: { message: `${diagnostic}: ${request.headers.authorization}; endpoint ${endpoint}` },
      }));
    });
    let child: ReturnType<typeof spawn> | undefined;
    try {
      for (const name of ['scripts', 'tests/e2e', 'dist', 'e2e.config.ts', 'e2e.mandu.config.ts', 'package.json', 'tsconfig.json']) {
        await cp(join(root, name), join(project, name), { recursive: true });
      }
      await symlink(join(root, 'node_modules'), join(project, 'node_modules'), 'dir');
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      endpoint = `http://127.0.0.1:${address.port}/v1`;
      const env: NodeJS.ProcessEnv = {
        PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
        MANDU_BASE_URL: endpoint,
        MANDU_MODEL: 'security-fixture-no-inference',
        MANDU_API_KEY: override ? 'unused-SYNTHETIC-key-135790' : syntheticKey,
        ...(override ? { E2E_SECRET_MANDU_API_KEY: syntheticKey } : {}),
        MANDU_STRUCTURED_OUTPUTS: 'true', MANDU_MULTIPART_TOOL_CONTENT: 'true',
        MANDU_REQUEST_TIMEOUT_MS: '3000',
      };
      let output = '';
      child = spawn(process.execPath, ['scripts/run.mjs', 'mandu'], { cwd: project, env, stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout!.on('data', chunk => { output += chunk.toString(); });
      child.stderr!.on('data', chunk => { output += chunk.toString(); });
      const running = child;
      const watchdog = setTimeout(() => running.kill('SIGKILL'), 20_000);
      let exit: { code: number | null; signal: string | null };
      try {
        exit = await new Promise((resolve, reject) => {
          running.once('error', reject);
          running.once('close', (code, signal) => resolve({ code, signal }));
        });
      } finally { clearTimeout(watchdog); }
      const outputDir = join(project, '.e2e');
      const files = await generatedFiles(outputDir);
      const leaked: string[] = [];
      for (const path of files) {
        if ((await readFile(path)).includes(Buffer.from(syntheticKey))) leaked.push(path.slice(outputDir.length + 1));
      }
      const reportText = await readFile(join(outputDir, 'mandu/report.json'), 'utf8');
      const evidence = process.env.MANDU_SECURITY_EVIDENCE_DIR
        ? join(process.env.MANDU_SECURITY_EVIDENCE_DIR, override ? 'override' : 'primary') : undefined;
      if (evidence) {
        await mkdir(evidence, { recursive: true });
        await writeFile(join(evidence, 'cli.log'), output);
        await writeFile(join(evidence, 'scan.json'), JSON.stringify({
          exit, requests, authorizationMatched, syntheticKeyInCli: output.includes(syntheticKey),
          endpointInCli: output.includes(endpoint), endpointInReport: reportText.includes(endpoint),
          diagnosticInCli: output.includes(diagnostic), diagnosticInReport: reportText.includes(diagnostic),
          markerInCli: output.includes('<secret:mandu-api-key>'),
          markerInReport: reportText.includes('<secret:mandu-api-key>'),
          scannedFiles: files.map(path => path.slice(outputDir.length + 1)), leakedFiles: leaked,
        }, null, 2) + '\n');
        await cp(outputDir, join(evidence, 'artifacts'), { recursive: true });
      }
      assert.equal(exit.signal, null, 'The command must fail normally, not be killed');
      assert.equal(exit.code, 3, 'HTTP authentication failure must preserve the CLI provider-error exit code');
      assert.equal(requests, 1);
      assert.ok(authorizationMatched, 'The synthetic key must reach only the loopback server');
      assert.ok(output.includes('MODEL_PROVIDER_FAILED') && output.includes(diagnostic), 'A useful provider diagnostic must remain visible');
      assert.ok(reportText.includes('MODEL_PROVIDER_FAILED') && reportText.includes(diagnostic), 'The report must retain the failure diagnostic');
      assert.ok(!output.includes(syntheticKey), 'The CLI must not print the synthetic key');
      assert.deepEqual(leaked, [], 'No generated artifact may contain the synthetic key');
      assert.ok(output.includes('<secret:mandu-api-key>'), 'The CLI must show the harness redaction marker');
      assert.ok(reportText.includes('<secret:mandu-api-key>'), 'The report must show the harness redaction marker');
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(project, { recursive: true, force: true });
    }
  });
}
