import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import base from './e2e.config.ts';
import { openRouterConfiguration, loopbackBaseURL } from './scripts/model.ts';
import { openRouterAgent } from './scripts/configuration.ts';

// Test-owned configuration only; production continues to use the fixed public endpoint.
const settings = openRouterConfiguration();
const baseURL = loopbackBaseURL(process.env.SYNTHETIC_SECURITY_BASE_URL ?? '');
// The security test serves the page itself instead of `app.command`: it must be able to stop the page after it has to kill this CLI.
const appURL = process.env.SYNTHETIC_SECURITY_APP_URL;
if (!appURL || !/^http:\/\/127\.0\.0\.1:\d+$/.test(appURL)) {
  throw new Error('O teste de segurança inicia a página sintética e informa SYNTHETIC_SECURITY_APP_URL em http://127.0.0.1:<porta>.');
}
export default {
  ...base, tests: ['tests/e2e/agent.e2e.ts'], targets: [{ engine: web(), app: { url: appURL } }],
  ...openRouterAgent(settings, { baseURL, fetch: globalThis.fetch }),
} satisfies E2EConfig;
