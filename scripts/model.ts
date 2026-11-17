import { appendFile } from 'node:fs/promises';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

/** Resolve explicit settings once, without loading dotenv or exposing key values. */
export function openRouterConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const model = env.OPENROUTER_MODEL?.trim();
  const provider = env.OPENROUTER_PROVIDER?.trim();
  if (!model || !provider || /[<>\s]/.test(model + provider)) {
    throw new Error('Defina OPENROUTER_MODEL e OPENROUTER_PROVIDER explicitamente, sem placeholders.');
  }
  const apiKey = env.E2E_SECRET_OPENROUTER_API_KEY ?? env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey.length < 6 || !/^[A-Za-z0-9._~+\/-]+=*$/.test(apiKey)) {
    throw new Error('OPENROUTER_API_KEY ou E2E_SECRET_OPENROUTER_API_KEY deve ser um bearer válido, sem espaços ou caracteres de controle.');
  }
  const timeoutMs = Number(env.OPENROUTER_REQUEST_TIMEOUT_MS ?? '20000');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new Error('OPENROUTER_REQUEST_TIMEOUT_MS deve ser inteiro entre 1 e 60000.');
  }
  return { model, provider, apiKey, timeoutMs };
}

export type OpenRouterConfiguration = ReturnType<typeof openRouterConfiguration>;
/** Only the dedicated contract configuration supplies this loopback transport. */
export interface LoopbackTransport { baseURL: string; fetch: typeof fetch }

/** Test-only injection cannot point at a remote or credential-bearing URL. */
export function loopbackBaseURL(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash || !['/v1', '/api/v1'].includes(url.pathname)) {
    throw new Error('O transporte de contrato exige URL loopback 127.0.0.1 com porta e /v1.');
  }
  return url.href.replace(/\/$/, '');
}

/** Official provider, typed routing for every call, bounded fetch and raw-wire metrics. */
export function openRouterModel(settings: OpenRouterConfiguration, transport?: LoopbackTransport, metricsFile?: string) {
  const baseURL = transport ? loopbackBaseURL(transport.baseURL) : 'https://openrouter.ai/api/v1';
  const send = transport?.fetch ?? globalThis.fetch;
  const provider = createOpenRouter({ apiKey: settings.apiKey, baseURL,
    fetch: async (input, init) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      if (url.href !== baseURL + '/chat/completions') throw new Error('Destino inesperado no transporte do modelo.');
      const started = performance.now();
      let status: number | undefined;
      let usage: Record<string, number> = {};
      try {
        const response = await send(input, { ...init, redirect: 'error', signal: init?.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(settings.timeoutMs)]) : AbortSignal.timeout(settings.timeoutMs) });
        status = response.status;
        if (metricsFile && response.ok) usage = reportedUsage(await response.clone().json().catch(() => undefined));
        return response;
      } finally {
        if (metricsFile) await appendFile(metricsFile, JSON.stringify({
          model: settings.model, provider: settings.provider,
          kind: transport ? 'loopback-contract-no-inference' : 'openrouter-request',
          clientRoundTripMs: Math.round(performance.now() - started),
          ...(status === undefined ? { transportFailed: true } : { httpStatus: status }), ...usage,
        }) + '\n');
      }
    },
  });
  return provider.chat(settings.model, { provider: {
    require_parameters: true, allow_fallbacks: false, only: [settings.provider], order: [settings.provider],
  } });
}

/** Preserve only counters/cost actually present in successful response JSON. */
function reportedUsage(body: unknown): Record<string, number> {
  if (!body || typeof body !== 'object' || !('usage' in body)) return {};
  const usage = body.usage;
  if (!usage || typeof usage !== 'object') return {};
  const result: Record<string, number> = {};
  for (const [field, label] of [['prompt_tokens', 'inputTokens'], ['completion_tokens', 'outputTokens'], ['cost', 'costUSD']] as const) {
    const value = (usage as Record<string, unknown>)[field];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && (field === 'cost' || Number.isSafeInteger(value))) result[label] = value;
  }
  return result;
}
