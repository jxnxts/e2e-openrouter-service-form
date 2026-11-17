import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { generateText, Output, tool } from 'ai';
import { z } from 'zod';
import { startFixture } from '../../scripts/fixture.ts';
import { openRouterModel } from '../../scripts/model.ts';
import { fixtureConfiguration } from '../../scripts/configuration.ts';
import './guard.ts';

const temporaryRoot = fileURLToPath(new URL('../../.e2e/contract-unit/', import.meta.url));
await mkdir(temporaryRoot, { recursive: true });

/** The contract ignores all shell keys/models and injects only its own loopback fixture. */
function fixtureModel(baseURL: string, metricsFile?: string) {
  return openRouterModel({ ...fixtureConfiguration(), timeoutMs: 300 }, { baseURL, fetch: globalThis.fetch }, metricsFile);
}

test('adapter transmits an image and decodes a forced tool call', async () => {
  const fixture = await startFixture('tool');
  try {
    const result = await generateText({
      model: fixtureModel(fixture.baseURL), maxRetries: 0,
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
    assert.equal(result.usage.inputTokens, 0, 'O adapter normaliza uso ausente para zero; isto não mede inferência');
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

test('schema response format is transmitted and validated', async () => {
  const fixture = await startFixture('schema');
  try {
    const result = await generateText({
      model: fixtureModel(fixture.baseURL), maxRetries: 0,
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
      await assert.rejects(generateText({ model: fixtureModel(fixture.baseURL), prompt: 'Contrato local.', maxRetries: 0 }));
      assert.equal(fixture.requests.length, 1, 'Sem fallback ou retry oculto neste probe');
      assert.deepEqual(fixture.errors, []);
    } finally { await fixture.close(); }
  });
}


test('schema-invalid response is rejected instead of treated as model success', async () => {
  const fixture = await startFixture('schema-invalid');
  try {
    await assert.rejects(generateText({
      model: fixtureModel(fixture.baseURL), maxRetries: 0,
      prompt: 'Contrato de JSON inválido.',
      output: Output.object({ schema: z.object({ protocol: z.literal('DEMO-0001') }) }),
    }));
    assert.equal(fixture.requests.length, 1);
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});


test('metrics retain only token counters actually present on the wire', async () => {
  const fixture = await startFixture('reported-usage');
  const directory = await mkdtemp(join(temporaryRoot, 'openrouter-metrics-'));
  const path = join(directory, 'requests.ndjson');
  try {
    await generateText({
      model: fixtureModel(fixture.baseURL, path),
      prompt: 'Contador sintético de contrato, não uso de inferência.', maxRetries: 0,
    });
    const record = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(record.inputTokens, 11);
    assert.equal(record.outputTokens, 2);
    assert.equal(record.costUSD, 0.004);
    assert.equal(record.kind, 'loopback-contract-no-inference');
    assert.equal(record.httpStatus, 200);
    assert.ok(record.clientRoundTripMs >= 0);
    assert.deepEqual(fixture.errors, []);
  } finally {
    await fixture.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('metrics omit absent wire usage despite SDK normalized zeros', { timeout: 5_000 }, async () => {
  const fixture = await startFixture('text');
  const directory = await mkdtemp(join(temporaryRoot, 'openrouter-absent-usage-'));
  const path = join(directory, 'requests.ndjson');
  try {
    const result = await generateText({ model: fixtureModel(fixture.baseURL, path), prompt: 'Synthetic.', maxRetries: 0 });
    assert.equal(result.usage.inputTokens, 0);
    const record = JSON.parse(await readFile(path, 'utf8'));
    for (const field of ['inputTokens', 'outputTokens', 'costUSD']) assert.equal(field in record, false);
    assert.equal(record.kind, 'loopback-contract-no-inference');
    assert.equal(fixture.requests.length, 1);
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); await rm(directory, { recursive: true, force: true }); }
});

test('official adapter keeps a screenshot file in multipart tool content', { timeout: 5_000 }, async () => {
  const fixture = await startFixture('text');
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
  try {
    const result = await generateText({ model: fixtureModel(fixture.baseURL), maxRetries: 0, messages: [
      { role: 'user', content: 'Synthetic screenshot contract.' },
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'synthetic-shot', toolName: 'screenshot', input: {} }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'synthetic-shot', toolName: 'screenshot', output: { type: 'content', value: [
        { type: 'text', text: 'Synthetic screen.' }, { type: 'file', mediaType: 'image/png', data: { type: 'data', data: png } },
      ] } }] },
    ] });
    const messages = fixture.requests[0]!.messages;
    assert.equal(messages.filter(message => message.role === 'user').length, 1);
    assert.deepEqual(messages.find(message => message.role === 'tool'), { role: 'tool', tool_call_id: 'synthetic-shot', name: 'screenshot', content: [
      { type: 'text', text: 'Synthetic screen.' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,' + png } },
    ] });
    assert.equal(result.text, 'Contrato local.');
    assert.equal(fixture.requests.length, 1);
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});
