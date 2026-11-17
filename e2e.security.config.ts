import type { E2EConfig } from 'e2e';
import base from './e2e.config.ts';
import { openRouterConfiguration, loopbackBaseURL } from './scripts/model.ts';
import { openRouterAgent } from './scripts/configuration.ts';

// Test-owned configuration only; production continues to use the fixed public endpoint.
const settings = openRouterConfiguration();
const baseURL = loopbackBaseURL(process.env.SYNTHETIC_SECURITY_BASE_URL ?? '');
export default {
  ...base, ...openRouterAgent(settings, { baseURL, fetch: globalThis.fetch }),
} satisfies E2EConfig;
