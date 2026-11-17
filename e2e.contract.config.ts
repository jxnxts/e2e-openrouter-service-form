import type { E2EConfig } from 'e2e';
import base from './e2e.config.ts';
import { fixtureConfiguration, openRouterAgent } from './scripts/configuration.ts';
import { loopbackBaseURL } from './scripts/model.ts';

const baseURL = loopbackBaseURL(process.env.SYNTHETIC_FIXTURE_URL ?? '');
export default {
  ...base, tests: ['tests/e2e/agent.e2e.ts'], ...openRouterAgent(fixtureConfiguration(), { baseURL, fetch: globalThis.fetch }, process.env.SYNTHETIC_METRICS_FILE),
} satisfies E2EConfig;
