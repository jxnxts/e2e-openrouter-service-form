# What the checks cover, and their limits

This page holds the detail the [README](../README.md) leaves out: what each command checks, how the model call is bounded, what the runs write, and what none of it proves.

## Commands

| Command | What it runs | Needs |
| --- | --- | --- |
| `npx e2e run` | The two locator tests, with the default config | Chromium |
| `npm test` | The same tests through `scripts/run.mjs`, with `--no-cache --video --output .e2e/deterministic` | Chromium |
| `npm run test:contract` | 29 provider contract tests, no browser | nothing |
| `npm run test:offline-contract` | The build, then the contract tests | nothing |
| `npm run test:security` | 2 key redaction tests through the real CLI | Chromium |
| `npm run test:agent-contract` | The agent test against a scripted local fixture | Chromium |
| `npm run test:offline` | The build and all of the above except `npx e2e run` | Chromium |
| `npm run test:openrouter` | The agent test against OpenRouter | your key, a model, a provider |
| `npm start` | Serves the built page and prints its loopback URL, to look at it. Stop it with Ctrl+C | nothing |

Passing contract tests do not mean `test:offline` passed: the browser tests are separate.

## How the page is started

`e2e.config.ts` declares the page as the app under test. The runner reserves a free loopback port, starts `scripts/serve.mjs` on it, waits for it to answer and stops it when the run ends. The page's output goes to `.e2e/logs/app.log`. If you skipped `npm run build`, the run stops with `APP_UNREACHABLE` and quotes that log, which names the missing `dist/index.html`.

`scripts/run.mjs` runs the file the installed `e2e` package declares as its `e2e` bin, with the same Node and as a direct child. `tests/security/provider-errors.test.ts` does the same.

## Contract tests, with no browser and no model

They check:

- the required settings, and that an invalid key is refused before anything starts;
- that one resolved key feeds both the provider's authentication and e2e's registry of known secrets, for the main key and for the override;
- provider routing with fallback off;
- an image from the user, an image inside a tool result, a forced tool choice, response parsing and a JSON Schema response;
- a request timeout, a dropped connection and a malformed response;
- what the request metrics keep.

The fixture's token counters are made up and only test the collection. A counter the server omits stays out of the metrics, even when the SDK turns it into zero.

The contract tests and the scripted agent test take the production key and its override out of the child's environment, and the fixture's model name is a literal. The contract tests refuse any address other than loopback before sending, use synthetic data, set `maxRetries: 0` and have time limits.

No contract test shows inference, an understanding of images, the server applying the routing rules, or error redaction by a full e2e run.

## Browser tests

- The two locator tests need no model.
- `test:agent-contract` runs the agent test against a scripted sequence of HTTP responses: a screenshot, a tap, a completion. The expected result is still `DEMO-0001`. No model is involved.
- `test:security` runs the real CLI against a loopback server that answers 401 and echoes a synthetic key, once for the main key and once for the override. It requires exit code 3, a useful diagnostic, the redaction marker, and no trace of the key in the terminal or in any file the run wrote, the trace, the cache and the media included. It uses its own config, `e2e.security.config.ts`, at the project root, because e2e treats the config file's directory as the root. The production endpoint cannot be redirected. The CLI child runs with telemetry and the update check off and with its own `XDG_CONFIG_HOME`.

## The call to OpenRouter

Choose a model and a provider slug that advertise tools, tool choice, images and JSON Schema. See OpenRouter's [quickstart](https://openrouter.ai/docs/quickstart) and its page on [provider routing](https://openrouter.ai/docs/guides/routing/provider-selection). What a provider advertises does not show that this example works with it.

- Every call carries `require_parameters: true`, `allow_fallbacks: false`, and `only` and `order` with the slug you named. There is no list of alternative models.
- A missing key, model or provider ends the command before the page or a browser starts. A real failure does not skip the test and does not switch to the fixture.
- `OPENROUTER_REQUEST_TIMEOUT_MS` sets the timeout of one request: 1-60000 ms, 20000 by default.
- The config uses one worker, no test retries, a 60 second test timeout and a budget of eight model turns. That is not a limit of eight HTTP requests: e2e allows five transport retries per call, and repairs can add requests. The test timeout does not necessarily cover browser startup and cleanup, so it is not a proven bound on the whole process.
- An HTTP redirect is refused. The `npm` scripts that run e2e pass `--no-cache`; plain `npx e2e run` keeps e2e's default cache, which the locator tests do not use.

### The key

`E2E_SECRET_OPENROUTER_API_KEY`, when set, replaces `OPENROUTER_API_KEY`. The config resolves the value once and uses it both for the provider and for `config.secrets['openrouter-api-key']`. A key must have at least six characters that are valid in a bearer token, with no spaces, control characters or line breaks. An invalid value is refused before the page or a browser starts, and is neither printed nor corrected. A well-formed key is not proof that the service accepts it.

Do not put the key in chat, code, command-line arguments, screenshots or commits.

### Screenshots

The provider package sends a screenshot as a `role: tool` message with multipart content and an `image_url`. That transport passed against the loopback fixture.

Whether a model reads those images correctly is not covered. In separate probes outside this suite, one model answered orange for a red image in one run and red in another, and a later test passed on that model and on Haiku 4.5. The model and the dates of those probes are not recorded here. They show neither general image reading, nor what the service does to images, nor this example's full flow. A model that accepts images from the user does not necessarily accept screenshots returned by tools.

## Results and limits

| Check | Result |
| --- | --- |
| Build and types | Passed (`test:offline`, 2026-11-17) |
| Contract tests, no browser | Passed (29/29, `test:offline`, 2026-11-17) |
| Locator tests in Chromium | Passed (2/2, `npx e2e run` and `test:offline`, 2026-11-17) |
| Agent test against the scripted fixture | Passed (1/1, no inference, `test:offline`, 2026-11-17) |
| Key redaction in a full e2e run | Passed (main key and override, `test:offline`, 2026-11-17) |
| Full flow with OpenRouter | Passed once on the previous version (`test:openrouter`, 2026-11-15). Not repeated on this version |
| A real model reading screenshots | Not exercised |

The OpenRouter run used `OPENROUTER_MODEL='openai/gpt-4.1-mini'` and `OPENROUTER_PROVIDER='openai'`. It had eight steps, three of them assertions on the `DEMO-0001` status, and two model calls that both answered HTTP 200. OpenRouter reported a cost of $0.0025740. The agent used the page structure and sent no images. One passing run does not show reliability, and another model or provider may behave differently.

Since that run, this example changed how the page is started (the runner does it now) and how the scripts call the CLI (through the package's `e2e` bin). The test, the page, the model settings and the routing did not change. The offline checks above ran on this version; the OpenRouter run did not.

## What a run writes

- `npx e2e run` writes under `.e2e/`. The `npm` scripts write under `.e2e/deterministic/`, `.e2e/contract/` or `.e2e/openrouter/`: `report.json`, a trace, screenshots and video.
- The `npm` scripts also write `metrics.json` and `requests.ndjson`, with the versions, the model, the provider, the HTTP status and the round-trip time measured by the client. Tokens and cost in USD come only from numeric fields actually present in the response's `usage.prompt_tokens`, `usage.completion_tokens` and `usage.cost`. A zero the server left out does not become a measurement. The client's round-trip time is not the inference latency the service reports.
- Prompts, headers, URLs and responses stay out of those metrics. The other e2e files can hold the screen, the synthetic data and the model's diagnostics. Read them before you share them.
- `node_modules/`, `dist/`, `.e2e/` and `.env*` are ignored by git.
