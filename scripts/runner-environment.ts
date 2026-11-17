/** Build the real CLI child's environment, isolating scripted credentials from the shell. */
export function runnerEnvironment(mode: 'deterministic' | 'contract' | 'openrouter', parent: NodeJS.ProcessEnv, appURL: string, metricsFile: string, fixtureURL?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...parent, SYNTHETIC_APP_URL: appURL, SYNTHETIC_METRICS_FILE: metricsFile };
  if (mode === 'contract') {
    delete env.OPENROUTER_API_KEY;
    delete env.E2E_SECRET_OPENROUTER_API_KEY;
    if (fixtureURL) env.SYNTHETIC_FIXTURE_URL = fixtureURL;
  }
  return env;
}
