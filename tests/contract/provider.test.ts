import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateText, Output, tool } from 'ai';
import { z } from 'zod';
import { startFixture } from '../../scripts/fixture.ts';
import { manduModel, manduSettings } from '../../scripts/model.ts';

/** Explicit synthetic settings; real shell credentials and endpoints are never used. */
function fixtureEnv(baseURL: string): NodeJS.ProcessEnv {
  return { MANDU_BASE_URL: baseURL, MANDU_MODEL: 'fixture-only-no-inference', MANDU_STRUCTURED_OUTPUTS: 'true', MANDU_MULTIPART_TOOL_CONTENT: 'true', MANDU_REQUEST_TIMEOUT_MS: '300' };
}

test('missing or unsafe configuration fails before a request', () => {
  assert.throws(() => manduSettings({}), /MANDU_BASE_URL.*MANDU_MODEL/);
  assert.throws(() => manduSettings({ MANDU_BASE_URL: 'https://example.invalid/v1' }), /MANDU_MODEL/);
  for (const baseURL of ['not-a-url', 'file:///tmp/test', 'https://user:secret@example.invalid/v1', 'https://example.invalid/v1?key=secret']) {
    assert.throws(() => manduSettings(fixtureEnv(baseURL)), /URL|http/);
  }
  assert.throws(() => manduSettings({ ...fixtureEnv('http://127.0.0.1/v1'), MANDU_STRUCTURED_OUTPUTS: '' }), /STRUCTURED/);
  assert.throws(() => manduSettings({ ...fixtureEnv('http://127.0.0.1/v1'), MANDU_MULTIPART_TOOL_CONTENT: '' }), /MULTIPART/);
  assert.throws(() => manduSettings({ ...fixtureEnv('http://127.0.0.1/v1'), MANDU_REQUEST_TIMEOUT_MS: '0' }), /TIMEOUT/);
});

test('adapter transmits an image and decodes a forced tool call', async () => {
  const fixture = await startFixture('tool');
  try {
    const result = await generateText({
      model: manduModel(fixtureEnv(fixture.baseURL)), maxRetries: 0,
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'Contrato local, devolva um protocolo fictício.' },
        { type: 'file', mediaType: 'image/png', data: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64') },
      ] }],
      tools: { protocol: tool({ inputSchema: z.object({ protocol: z.string() }) }) },
      toolChoice: { type: 'tool', toolName: 'protocol' },
    });
    assert.deepEqual(result.toolCalls[0]?.input, { protocol: 'DEMO-0001' });
    assert.ok(JSON.stringify(fixture.requests[0]?.messages).includes('data:image/png;base64,'));
    assert.deepEqual(fixture.requests[0]?.tool_choice, { type: 'function', function: { name: 'protocol' } });
    assert.ok(fixture.requests[0]?.tools?.[0]?.function.parameters);
    assert.equal(result.usage.inputTokens, undefined, 'Fixture não inventa uso de tokens');
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

test('schema response format is transmitted and validated', async () => {
  const fixture = await startFixture('schema');
  try {
    const result = await generateText({
      model: manduModel(fixtureEnv(fixture.baseURL)), maxRetries: 0,
      prompt: 'Contrato de JSON, sem inferência.',
      output: Output.object({ schema: z.object({ protocol: z.literal('DEMO-0001') }) }),
    });
    assert.deepEqual(result.output, { protocol: 'DEMO-0001' });
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

for (const mode of ['timeout', 'disconnect', 'malformed'] as const) {
  test(`contract failure propagates: ${mode}`, async () => {
    const fixture = await startFixture(mode);
    try {
      await assert.rejects(generateText({ model: manduModel(fixtureEnv(fixture.baseURL)), prompt: 'Contrato local.', maxRetries: 0 }));
      assert.equal(fixture.requests.length, 1, 'Sem fallback ou retry oculto neste probe');
      assert.deepEqual(fixture.errors, []);
    } finally { await fixture.close(); }
  });
}


test('schema-invalid response is rejected instead of treated as model success', async () => {
  const fixture = await startFixture('schema-invalid');
  try {
    await assert.rejects(generateText({
      model: manduModel(fixtureEnv(fixture.baseURL)), maxRetries: 0,
      prompt: 'Contrato de JSON inválido.',
      output: Output.object({ schema: z.object({ protocol: z.literal('DEMO-0001') }) }),
    }));
    assert.equal(fixture.requests.length, 1);
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});


test('metrics retain only token counters actually present on the wire', async () => {
  const fixture = await startFixture('partial-usage');
  const directory = await mkdtemp(join(tmpdir(), 'mandu-metrics-'));
  const path = join(directory, 'requests.ndjson');
  try {
    await generateText({
      model: manduModel({ ...fixtureEnv(fixture.baseURL), SYNTHETIC_METRICS_FILE: path }),
      prompt: 'Contador sintético de contrato, não uso de inferência.', maxRetries: 0,
    });
    const record = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(record.inputTokens, 11);
    assert.equal('outputTokens' in record, false, 'Não transformar campo ausente em zero');
    assert.equal(record.httpStatus, 200);
    assert.ok(record.clientRoundTripMs >= 0);
    assert.deepEqual(fixture.errors, []);
  } finally {
    await fixture.close();
    await rm(directory, { recursive: true, force: true });
  }
});
