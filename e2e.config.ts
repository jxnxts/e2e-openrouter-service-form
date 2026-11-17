import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';

export default {
  // Plain `npx e2e run` runs the locator tests. The agent test runs with one of the agent configs.
  tests: ['tests/e2e/deterministic.e2e.ts'],
  targets: [{
    engine: web(),
    app: {
      // The runner reserves a free loopback port, starts the built synthetic page on it and stops it after the run.
      url: 'http://127.0.0.1:0',
      command: { executable: process.execPath, args: ['scripts/serve.mjs'], env: { PORT: '{port}' }, log: '.e2e/logs/app.log' },
    },
  }],
  workers: 1,
  retries: 0,
  trace: 'on',
  timeout: 60_000,
  actionTimeout: 5_000,
  reporters: ['list'],
} satisfies E2EConfig;
