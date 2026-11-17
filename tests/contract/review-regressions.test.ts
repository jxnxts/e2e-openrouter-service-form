import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { generateText } from 'ai';
import { openRouterConfiguration } from '../../scripts/model.ts';
import { fixtureConfiguration, openRouterAgent } from '../../scripts/configuration.ts';
import { runnerEnvironment } from '../../scripts/runner-environment.ts';
import './guard.ts';

const base = { OPENROUTER_MODEL: 'fixture-only-no-inference', OPENROUTER_PROVIDER: 'fixture-provider', OPENROUTER_API_KEY: 'SYNTHETIC-PRIMARY-KEY' };
const require = createRequire(import.meta.url);
const { resolveConfig } = await import(new URL('./config/resolve.js', pathToFileURL(require.resolve('e2e'))).href);

for (const override of [false, true]) {
  for (const [label, key] of [['blank', '      '], ['newline', 'SYNTHETIC\nBAD-KEY'], ['tab', 'SYNTHETIC\tBAD-KEY'], ['non-ascii', 'SYNTHETIC-ç-KEY'], ['invalid-bearer', 'SYNTHETIC:BAD-KEY']]) {
    test(`preflight rejects ${label}, override=${override}, without app startup`, { timeout: 5_000 }, () => {
      const env = { ...base, [override ? 'E2E_SECRET_OPENROUTER_API_KEY' : 'OPENROUTER_API_KEY']: key };
      const expected = 'OPENROUTER_API_KEY ou E2E_SECRET_OPENROUTER_API_KEY deve ser um bearer válido, sem espaços ou caracteres de controle.';
      // Fail here if validation regresses, before the actual entry could start an app.
      assert.throws(() => openRouterConfiguration(env), error => error instanceof Error && error.message === expected);
      const result = spawnSync(process.execPath, ['scripts/run.mjs', 'openrouter'], { cwd: new URL('../../', import.meta.url), env, encoding: 'utf8', timeout: 3_000 });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      assert.equal(result.stderr.trim(), expected);
      assert.equal(result.stdout, '');
    });
  }
}

for (const [label, value] of [['absent', undefined], ['nonempty', 'SYNTHETIC-SHELL-OVERRIDE'], ['empty', '']] as const) {
  test(`contract child isolates actual e2e secret resolution, override=${label}`, async () => {
    const parent: NodeJS.ProcessEnv = { OPENROUTER_API_KEY: 'SYNTHETIC-PARENT-KEY', ...(value === undefined ? {} : { E2E_SECRET_OPENROUTER_API_KEY: value }) };
    const env = runnerEnvironment('contract', parent, '/unused/synthetic-metrics', 'http://127.0.0.1:2/v1');
    assert.equal(env.OPENROUTER_API_KEY, undefined);
    assert.equal(env.E2E_SECRET_OPENROUTER_API_KEY, undefined);
    assert.deepEqual(parent, { OPENROUTER_API_KEY: 'SYNTHETIC-PARENT-KEY', ...(value === undefined ? {} : { E2E_SECRET_OPENROUTER_API_KEY: value }) });
    const settings = fixtureConfiguration();
    let auth: string | null = null;
    const config = openRouterAgent(settings, { baseURL: 'http://127.0.0.1:2/v1', fetch: async (input, init) => {
      assert.equal(String(input), 'http://127.0.0.1:2/v1/chat/completions');
      auth = new Headers(init?.headers).get('authorization');
      return Response.json({ id: 'fixture', model: settings.model, choices: [{ index: 0, message: { role: 'assistant', content: 'SYNTHETIC' }, finish_reason: 'stop' }] });
    } });
    const resolved = resolveConfig({ targets: [{ platform: 'web' }], ...config }, { projectRoot: new URL('../../', import.meta.url).pathname, configPath: new URL('../../e2e.contract.config.ts', import.meta.url).pathname, env });
    const secret = resolved.secrets.get('openrouter-api-key').value;
    assert.equal(secret, settings.apiKey);
    await generateText({ model: config.agents.default.model, prompt: 'Synthetic resolution.', maxRetries: 0, abortSignal: AbortSignal.timeout(1_000) });
    assert.equal(auth, 'Bearer ' + secret);
  });
}

test('live child preserves explicit override behavior without mutating parent', () => {
  const parent = { OPENROUTER_API_KEY: 'SYNTHETIC-PRIMARY', E2E_SECRET_OPENROUTER_API_KEY: 'SYNTHETIC-OVERRIDE' };
  const env = runnerEnvironment('openrouter', parent, '/unused/metrics');
  assert.equal(env.OPENROUTER_API_KEY, parent.OPENROUTER_API_KEY);
  assert.equal(env.E2E_SECRET_OPENROUTER_API_KEY, parent.E2E_SECRET_OPENROUTER_API_KEY);
});
