# A service request form tested with locators and one agent step on OpenRouter

The page under test is a synthetic citizen-service request form, written in Portuguese. You type a name and a request, press "Gerar protocolo fictício", and the page shows the fixed protocol `DEMO-0001`. Everything happens in the page: there is no backend, no real agency and no real data.

The example has two test files:

- [`tests/e2e/deterministic.e2e.ts`](tests/e2e/deterministic.e2e.ts) uses locators only. An empty form is refused, and a filled form shows the protocol.
- [`tests/e2e/agent.e2e.ts`](tests/e2e/agent.e2e.ts) fills the form with locators, asks `agent.act` to generate the protocol, then checks the name, the request and the "no real submission" notice with locator assertions.

The form labels, the agent instruction and the messages the scripts print are in Portuguese. This page and [`docs/harness.md`](docs/harness.md) are in English.

## Install

Use Node `^22.22.3 || >=24.8.0`.

```sh
npm ci --ignore-scripts
npm run build
```

`npm run build` type-checks the project and copies the page to `dist/`, which the tests serve. If Chromium is not installed for Playwright yet, run `npm exec -- playwright-core install chromium` once.

## Run offline

```sh
npx e2e run
```

This runs the two locator tests. The runner starts the page itself on a free loopback port and stops it afterwards (`app.command` in [`e2e.config.ts`](e2e.config.ts)). It needs no key and calls no model.

To run everything that needs no model:

```sh
npm run test:offline
```

That adds the provider contract tests, the key redaction test and the agent test against a scripted local fixture. [`docs/harness.md`](docs/harness.md) says what each one covers.

## Run the agent step with your own OpenRouter key

Create a key at [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys), then pick a model and a provider slug from the [model list](https://openrouter.ai/models) that support tool calls. There is no default model or provider.

Set `OPENROUTER_API_KEY` in your shell or from your secret manager. The project does not read `.env`.

```sh
export OPENROUTER_MODEL='openai/gpt-4.1-mini'
export OPENROUTER_PROVIDER='openai'
npm run test:openrouter
```

The model and provider above are the pair the recorded run used. To try another pair, name it in the same two variables; only this pair has been run. The command refuses to start if the key, the model or the provider is missing. It then runs `e2e run --config e2e.openrouter.config.ts --no-cache --video --output .e2e/openrouter`. Each run calls the model and is billed to your key.

Every call goes to the provider you named and nowhere else. This is the call in [`scripts/model.ts`](scripts/model.ts):

```ts
return provider.chat(settings.model, { provider: {
  require_parameters: true, allow_fallbacks: false, only: [settings.provider], order: [settings.provider],
} });
```

`provider` comes from `createOpenRouter` in `@openrouter/ai-sdk-provider`, and `settings` holds the model and provider slug from the two variables above.

## What has been checked

Last checked on 2026-11-17 with Node 24.22.2, e2e 0.23.1, `@e2e-dev/web` 0.16.0, AI SDK 7.0.173 and the OpenRouter provider 3.1.0.

- Offline, 2026-11-17: `npx e2e run` and `npm run test:offline` pass. That is the build, 29 provider contract tests, 2 key redaction tests through the real CLI, 2 locator tests and 1 agent test against the scripted fixture.
- With OpenRouter: one run passed on 2026-11-15, with `openai/gpt-4.1-mini` routed to `openai`. It made 2 model calls and OpenRouter reported a cost of $0.0025740. That run used the previous version of this example, before the runner started the page and before the scripts called the `e2e` bin. It has not been repeated on this version.
- The agent read the page structure in that run and sent no images, so a model reading screenshots is not covered. One passing run does not show reliability, and another model or provider may behave differently.

License: [Apache-2.0](LICENSE).
