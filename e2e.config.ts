import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';

const url = process.env.SYNTHETIC_APP_URL;
if (!url || new URL(url).hostname !== '127.0.0.1') {
  throw new Error('Use npm test ou npm run test:openrouter para iniciar a aplicação sintética local.');
}

export default {
  targets: [{ engine: web(), app: { url } }],
  workers: 1,
  retries: 0,
  trace: 'on',
  timeout: 60_000,
  actionTimeout: 5_000,
  reporters: ['list'],
} satisfies E2EConfig;
