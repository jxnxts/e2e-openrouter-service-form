import type { E2EConfig } from 'e2e';
import base from './e2e.config.ts';
import { openRouterConfiguration } from './scripts/model.ts';
import { openRouterAgent } from './scripts/configuration.ts';

const settings = openRouterConfiguration();
export default { ...base, tests: ['tests/e2e/agent.e2e.ts'], ...openRouterAgent(settings, undefined, process.env.SYNTHETIC_METRICS_FILE) } satisfies E2EConfig;
