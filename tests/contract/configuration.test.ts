import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { generateText } from 'ai';
import { openRouterConfiguration, openRouterModel, loopbackBaseURL } from '../../scripts/model.ts';
import { fixtureConfiguration, openRouterAgent } from '../../scripts/configuration.ts';
import './guard.ts';

const synthetic = { OPENROUTER_MODEL: 'fixture-only-no-inference', OPENROUTER_PROVIDER: 'fixture-provider', OPENROUTER_API_KEY: 'SYNTHETIC-PRIMARY-KEY' };

test('live configuration requires model, provider, key and bounded request timeout', () => {
  for (const field of ['OPENROUTER_MODEL', 'OPENROUTER_PROVIDER', 'OPENROUTER_API_KEY'] as const) {
    const env = { ...synthetic, [field]: '' };
    assert.throws(() => openRouterConfiguration(env), /OPENROUTER/);
  }
  assert.throws(() => openRouterConfiguration({ ...synthetic, OPENROUTER_MODEL: '<MODEL_ID>' }), /placeholders/);
  for (const timeout of ['0', '-1', 'NaN', '60001', '1.1']) assert.throws(() => openRouterConfiguration({ ...synthetic, OPENROUTER_REQUEST_TIMEOUT_MS: timeout }), /TIMEOUT/);
  assert.throws(() => openRouterConfiguration({ ...synthetic, E2E_SECRET_OPENROUTER_API_KEY: '' }), /API_KEY/, 'An empty override cannot fall back to a different auth key');
});

for (const override of [false, true]) {
  test(`one resolved key feeds auth and secret registration, override=${override}`, { timeout: 5_000 }, async () => {
    const effective = override ? 'SYNTHETIC-OVERRIDE-KEY' : synthetic.OPENROUTER_API_KEY;
    const env = { ...synthetic, ...(override ? { E2E_SECRET_OPENROUTER_API_KEY: effective } : {}) };
    const settings = openRouterConfiguration(env);
    env.OPENROUTER_API_KEY = 'CHANGED-AFTER-RESOLUTION';
    let count = 0;
    const config = openRouterAgent(settings, { baseURL: 'http://127.0.0.1:1/v1', fetch: async (input, init) => {
      assert.equal(String(input), 'http://127.0.0.1:1/v1/chat/completions');
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer ' + effective);
      assert.equal(init?.redirect, 'error');
      assert.ok(init?.signal);
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body.provider, { require_parameters: true, allow_fallbacks: false, only: ['fixture-provider'], order: ['fixture-provider'] });
      assert.equal('models' in body, false);
      count++;
      return Response.json({ id: 'fixture', model: settings.model, choices: [{ index: 0, message: { role: 'assistant', content: 'SYNTHETIC' }, finish_reason: 'stop' }] });
    } });
    assert.equal(config.secrets['openrouter-api-key'], effective);
    assert.equal(config.agents.default.maxModelCalls, 8);
    const result = await generateText({ model: config.agents.default.model, prompt: 'Synthetic.', maxRetries: 0, abortSignal: AbortSignal.timeout(1_000) });
    assert.equal(result.text, 'SYNTHETIC');
    assert.equal(count, 1);
  });
}

test('test injection rejects nonloopback URLs before the injected fetch', () => {
  let calls = 0;
  for (const url of ['https://openrouter.ai/api/v1', 'http://localhost:1/v1', 'http://127.0.0.1:1/v1?key=x', 'http://name:pass@127.0.0.1:1/v1']) {
    assert.throws(() => openRouterModel(fixtureConfiguration(), { baseURL: url, fetch: async () => { calls++; throw new Error('must not run'); } }));
  }
  assert.equal(calls, 0);
  assert.equal(loopbackBaseURL('http://127.0.0.1:1/v1'), 'http://127.0.0.1:1/v1');
});

test('global contract guard rejects remote fetch before network access', async () => {
  await assert.rejects(globalThis.fetch('https://unexpected.invalid/image.png'), /nonloopback/);
});

test('missing live settings fail the command before app/browser startup', { timeout: 5_000 }, () => {
  const result = spawnSync(process.execPath, ['scripts/run.mjs', 'openrouter'], { cwd: new URL('../../', import.meta.url), env: {}, encoding: 'utf8', timeout: 3_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /OPENROUTER_MODEL.*OPENROUTER_PROVIDER/);
  assert.doesNotMatch(result.stdout, /Modo:|App sintética|http:\/\//);
});
