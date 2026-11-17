import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';

interface Message {
  role: string;
  content?: unknown;
  tool_call_id?: string;
  tool_calls?: { function: { name: string } }[];
}
interface RequestBody {
  model: string;
  messages: Message[];
  tools?: { type: string; function: { name: string; parameters: unknown } }[];
  tool_choice?: unknown;
  provider?: { require_parameters: boolean; allow_fallbacks: boolean; only: string[]; order: string[] };
  response_format?: { type: string; json_schema?: { schema: unknown } };
}
type Mode = 'text' | 'tool' | 'schema' | 'agent' | 'timeout' | 'disconnect' | 'malformed' | 'schema-invalid' | 'reported-usage';
let fixtureSequence = 0;

/** Scripted HTTP contract fixture: no inference, no tokens or service latency invented. */
export async function startFixture(mode: Mode) {
  const sequence = ++fixtureSequence;
  const requests: RequestBody[] = [];
  const responses: unknown[] = [];
  const errors: string[] = [];
  const server = createServer(async (request, response) => {
    try {
      assert.equal(request.method, 'POST');
      assert.equal(request.url, '/v1/chat/completions');
      let raw = '';
      for await (const chunk of request) { raw += chunk; assert.ok(raw.length < 512_000); }
      const body = JSON.parse(raw) as RequestBody;
      assert.equal(body.model, 'fixture-only-no-inference');
      assert.deepEqual(body.provider, { require_parameters: true, allow_fallbacks: false, only: ['fixture-provider'], order: ['fixture-provider'] });
      assert.ok(requests.length < 8);
      assert.equal(request.headers.authorization, 'Bearer SYNTHETIC-FIXTURE-KEY');
      assert.ok(Array.isArray(body.messages));
      requests.push(body);
      if (mode === 'timeout') return;
      if (mode === 'disconnect') { response.destroy(); return; }
      let message: Record<string, unknown> = { role: 'assistant', content: 'Contrato local.' };
      let finishReason = 'stop';
      const toolCall = (name: string, args: unknown) => {
        assert.ok(body.tools?.some(tool => tool.function.name === name), `Tool ${name} precisa estar anunciada`);
        finishReason = 'tool_calls';
        message = { role: 'assistant', content: null, tool_calls: [{ id: `fixture-${requests.length}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] };
      };
      if (mode === 'tool') toolCall('protocol', { protocol: 'DEMO-0001' });
      if (mode === 'schema' || mode === 'schema-invalid') {
        assert.equal(body.response_format?.type, 'json_schema');
        assert.ok(body.response_format.json_schema?.schema);
        message.content = JSON.stringify({ protocol: mode === 'schema' ? 'DEMO-0001' : 7 });
      }
      if (mode === 'agent') {
        assert.ok(body.tools?.some(tool => tool.function.name === 'complete_step'));
        const called = body.messages.flatMap(message => message.tool_calls?.map(call => call.function.name) ?? []);
        if (!called.includes('screenshot')) toolCall('screenshot', {});
        else if (!called.includes('tap')) {
          const line = JSON.stringify(body.messages).split(/\\n|\n/).find(line => /button.*Gerar protocolo fictício/.test(line));
          const target = line?.match(/#(n\d+)/)?.[1];
          assert.ok(target, 'O botão precisa estar na observação real do navegador');
          assert.ok(body.messages.some(message => message.role === 'tool' && Array.isArray(message.content) && message.content.some(part => part.type === 'image_url' && part.image_url.url.startsWith('data:image/'))), 'A imagem do screenshot deve chegar como image_url no resultado da ferramenta');
          toolCall('tap', { target });
        } else {
          assert.ok(JSON.stringify(body.messages).includes('DEMO-0001 gerado'), 'A confirmação precisa aparecer no resultado real da ação');
          toolCall('complete_step', { status: 'passed', summary: 'Fixture de contrato: protocolo fictício visível.' });
        }
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      const payload = mode === 'malformed' ? { invalid: true } : {
        id: `fixture-${requests.length}`, object: 'chat.completion', created: 0,
        model: body.model,
        ...(mode === 'reported-usage' ? { usage: { prompt_tokens: 11, completion_tokens: 2, total_tokens: 13, cost: 0.004 } } : {}),
        choices: [{ index: 0, message, finish_reason: finishReason }],
      };
      responses.push(payload);
      response.end(JSON.stringify(payload));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      response.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: errors.at(-1) } }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    baseURL: `http://127.0.0.1:${address.port}/v1`, requests, errors,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      const directory = new URL('../.e2e/contract-wire/', import.meta.url);
      await mkdir(directory, { recursive: true });
      await writeFile(new URL(`${sequence}-${mode}.json`, directory), JSON.stringify({ kind: 'synthetic-loopback-no-inference', mode, requests, responses, errors }, null, 2) + '\n');
    },
  };
}
