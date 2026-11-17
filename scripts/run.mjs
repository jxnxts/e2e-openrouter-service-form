import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startApp } from './serve.mjs';
import { startFixture } from './fixture.ts';
import { openRouterConfiguration } from './model.ts';
import { runnerEnvironment } from './runner-environment.ts';

const mode = process.argv[2];
if (!['deterministic', 'contract', 'openrouter'].includes(mode)) throw new Error('Modo: deterministic, contract ou openrouter.');
const root = fileURLToPath(new URL('../', import.meta.url));
let app;
let fixture;
let child;
let interrupted = false;
/** Forward cancellation to the CLI so its browser resources can close. */
const interrupt = () => { interrupted = true; child?.kill('SIGTERM'); };
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, interrupt);
try {
  if (mode === 'openrouter') openRouterConfiguration();
  app = await startApp();
  if (mode === 'contract') fixture = await startFixture('agent');
  if (interrupted) throw new Error('Execução interrompida.');
  const env = runnerEnvironment(mode, process.env, app.url,
    fileURLToPath(new URL(`../.e2e/${mode}/requests.ndjson`, import.meta.url)), fixture?.baseURL);
  const config = mode === 'deterministic' ? 'e2e.config.ts' : mode === 'contract' ? 'e2e.contract.config.ts' : 'e2e.openrouter.config.ts';
  const test = mode === 'deterministic' ? 'deterministic' : 'agent';
  console.log(mode === 'contract' ? 'CONTRATO LOCAL SCRIPTADO: sem inferência.' : `Modo: ${mode}`);
  await rm(new URL(`../.e2e/${mode}/`, import.meta.url), { recursive: true, force: true });
  await mkdir(new URL(`../.e2e/${mode}/`, import.meta.url), { recursive: true });
  child = spawn(process.execPath, [
    'node_modules/e2e/dist/cli/bin.js', 'run', `tests/e2e/${test}.e2e.ts`,
    '--config', config, '--no-cache', '--video', '--output', `.e2e/${mode}`,
  ], { cwd: root, env, stdio: 'inherit' });
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(signal ? 1 : code ?? 1));
  });
  if (fixture) {
    assert.deepEqual(fixture.errors, []);
    assert.equal(fixture.requests.length, 3, 'Screenshot, tap e complete_step devem atravessar o adapter');
  }
  const reportFile = new URL(`../.e2e/${mode}/report.json`, import.meta.url);
  const reportText = await readFile(reportFile, 'utf8').catch(error => {
    if (error.code === 'ENOENT') throw new Error(`e2e encerrou com código ${exitCode} sem gerar relatório; veja a saída acima.`);
    throw error;
  });
  const report = JSON.parse(reportText);
  const steps = report.run.results.flatMap(result => result.attempts.flatMap(attempt => attempt.steps));
  const requestLog = await readFile(env.SYNTHETIC_METRICS_FILE, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  const metrics = {
    kind: mode === 'contract' ? 'scripted-contract-no-inference' : mode,
    versions: JSON.parse(await readFile(new URL('../package.json', import.meta.url))).devDependencies,
    status: report.run.status,
    runtime: process.version,
    requests: requestLog.trim() ? requestLog.trim().split('\n').map(line => JSON.parse(line)) : [],
    steps: steps.filter(step => step.model).map(step => ({
      label: step.label, model: step.model.model, modelCalls: step.model.calls,

      clientRoundTripsMs: step.events.filter(event => event.kind === 'model').map(event => event.durationMs),
    })),
  };
  await mkdir(new URL(`../.e2e/${mode}/`, import.meta.url), { recursive: true });
  await writeFile(new URL(`../.e2e/${mode}/metrics.json`, import.meta.url), JSON.stringify(metrics, null, 2) + '\n');
  if (fixture) console.log('Fixture sem inferência: uso de tokens indisponível; o 0 exibido pelo e2e não é medição de tokens.');
  process.exitCode = interrupted ? 1 : exitCode;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await fixture?.close();
  await app?.close();
  for (const signal of ['SIGINT', 'SIGTERM']) process.removeListener(signal, interrupt);
}
