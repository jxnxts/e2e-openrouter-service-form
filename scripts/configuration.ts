import type { E2EConfig } from 'e2e';
import { openRouterConfiguration, openRouterModel, type LoopbackTransport, type OpenRouterConfiguration } from './model.ts';

/** The exact resolved key feeds authentication and e2e's known-secret registry. */
export function openRouterAgent(settings: OpenRouterConfiguration, transport?: LoopbackTransport, metricsFile?: string) {
  return {
    secrets: { 'openrouter-api-key': settings.apiKey },
    agents: { default: {
      model: openRouterModel(settings, transport, metricsFile), maxModelCalls: 8,
      system: 'Você testa apenas a aplicação fictícia de atendimento público em português. Não existem cidadãos ou protocolos reais aqui.',
    } },
  } satisfies Pick<E2EConfig, 'agents' | 'secrets'>;
}

/** Ignore shell model/provider/key values in scripted browser-contract mode. */
export function fixtureConfiguration() {
  return openRouterConfiguration({ OPENROUTER_MODEL: 'fixture-only-no-inference', OPENROUTER_PROVIDER: 'fixture-provider', OPENROUTER_API_KEY: 'SYNTHETIC-FIXTURE-KEY', OPENROUTER_REQUEST_TIMEOUT_MS: '2000' });
}
