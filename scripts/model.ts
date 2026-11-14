import { appendFile } from 'node:fs/promises';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

/** Validate explicit configuration before any network operation; never load .env. */
export function manduSettings(env: NodeJS.ProcessEnv = process.env) {
  const endpoint = env.MANDU_BASE_URL?.trim();
  const model = env.MANDU_MODEL?.trim();
  if (!endpoint || !model) {
    throw new Error('Mandu: defina MANDU_BASE_URL (URL completa, incluindo /v1 se aplicável) e MANDU_MODEL explicitamente. Use npm run test:offline sem inferência.');
  }
  let url: URL;
  try { url = new URL(endpoint); }
  catch { throw new Error('Mandu: MANDU_BASE_URL precisa ser uma URL http(s) válida.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Mandu: use URL http(s) sem credenciais, query ou fragmento; autenticação usa MANDU_API_KEY.');
  }
  const structured = env.MANDU_STRUCTURED_OUTPUTS;
  if (structured !== 'true' && structured !== 'false') {
    throw new Error('Mandu: defina MANDU_STRUCTURED_OUTPUTS=true ou false conforme a capacidade do servidor.');
  }
  const multipart = env.MANDU_MULTIPART_TOOL_CONTENT;
  if (multipart !== 'true' && multipart !== 'false') {
    throw new Error('Mandu: defina MANDU_MULTIPART_TOOL_CONTENT=true ou false; imagens em resultados de ferramentas exigem suporte a content arrays no servidor.');
  }
  const timeoutMs = Number(env.MANDU_REQUEST_TIMEOUT_MS ?? '20000');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new Error('Mandu: MANDU_REQUEST_TIMEOUT_MS precisa ser inteiro entre 1 e 60000.');
  }
  return { baseURL: url.href.replace(/\/$/, ''), model, supportsStructuredOutputs: structured === 'true', supportsMultiPartToolContent: multipart === 'true', timeoutMs };
}

/** Resolve the harness's documented secret override for both authentication and redaction. */
export function manduApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.E2E_SECRET_MANDU_API_KEY ?? env.MANDU_API_KEY;
}

/** Construct the existing AI SDK adapter with a bounded request and no redirects. */
export function manduModel(env: NodeJS.ProcessEnv = process.env) {
  const settings = manduSettings(env);
  const apiKey = manduApiKey(env);
  const provider = createOpenAICompatible({
    name: 'mandu',
    baseURL: settings.baseURL,
    supportsStructuredOutputs: settings.supportsStructuredOutputs,
    supportsMultiPartToolContent: settings.supportsMultiPartToolContent,
    ...(apiKey ? { apiKey } : {}),
    fetch: async (input, init) => {
      const started = performance.now();
      let status: number | undefined;
      let usage: Record<string, number> = {};
      try {
        const response = await globalThis.fetch(input, {
          ...init,
          redirect: 'error',
          signal: init?.signal
            ? AbortSignal.any([init.signal, AbortSignal.timeout(settings.timeoutMs)])
            : AbortSignal.timeout(settings.timeoutMs),
        });
        status = response.status;
        if (env.SYNTHETIC_METRICS_FILE && response.ok) {
          const body: unknown = await response.clone().json().catch(() => undefined);
          usage = reportedTokens(body);
        }
        return response;
      } finally {
        if (env.SYNTHETIC_METRICS_FILE) {
          await appendFile(env.SYNTHETIC_METRICS_FILE, JSON.stringify({
            model: settings.model,
            clientRoundTripMs: Math.round(performance.now() - started),
            ...(status === undefined ? { transportFailed: true } : { httpStatus: status }),
            ...usage,
          }) + '\n');
        }
      }
    },
  });
  return provider.chatModel(settings.model);
}


/** Read only counters explicitly present in the HTTP response, before SDK normalization. */
function reportedTokens(body: unknown): Record<string, number> {
  if (!body || typeof body !== 'object' || !('usage' in body)) return {};
  const usage = body.usage;
  if (!usage || typeof usage !== 'object') return {};
  const input = 'prompt_tokens' in usage ? usage.prompt_tokens : undefined;
  const output = 'completion_tokens' in usage ? usage.completion_tokens : undefined;
  return {
    ...(typeof input === 'number' && Number.isSafeInteger(input) && input >= 0 ? { inputTokens: input } : {}),
    ...(typeof output === 'number' && Number.isSafeInteger(output) && output >= 0 ? { outputTokens: output } : {}),
  };
}
