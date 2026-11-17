# Gerar um protocolo fictício com agente e locators

A aplicação em português recebe um nome e um pedido sintéticos e mostra o protocolo fixo `DEMO-0001`. O teste preenche o formulário com locators, pede ao `agent.act` que gere o protocolo e confirma nome, pedido e aviso de ausência de envio real com assertions determinísticas.

Tudo acontece na página, sem banco, órgão público ou solicitação real. A aplicação não usa marcas de governo. O agente usa o provider oficial `@openrouter/ai-sdk-provider`, já suportado pelo e2e, com a chave OpenRouter do leitor. Nenhum acesso a serviço privado é necessário.

## Instalar e construir

Use Node `^22.22.3 || >=24.8.0`. Última verificação local em 2026-11-17, com Node 24.22.2, e2e 0.23.1, `@e2e-dev/web` 0.16.0, AI SDK 7.0.173 e provider OpenRouter 3.1.0. O lockfile fixa versões e integridade.

```sh
npm ci --ignore-scripts
npm run build
```

O build verifica tipos e copia `app/` para `dist/`. Os testes usam os pacotes publicados, sem importar código do monorepo e2e.

## Contratos locais sem navegador ou inferência

```sh
npm run test:offline-contract
```

Esse comando faz build e executa os contratos locais. Verifica configuração obrigatória, chave principal e override no mesmo registro de secrets e autenticação, routing sem fallback, imagem de usuário, imagem em resultado de ferramenta, tool choice, parsing, JSON Schema, timeout, desconexão e métricas do HTTP. Os contadores fabricados da fixture testam apenas a coleta. Uso ausente é omitido das métricas, mesmo quando o SDK o normaliza para zero.

Os contratos e o modo scriptado removem chaves de produção e o override do ambiente do processo filho. O modelo da fixture é literal. Os contratos recusam tráfego não loopback antes do fetch e usam dados sintéticos, `maxRetries: 0` e limites de tempo. Nenhum contrato comprova inferência, compreensão visual, aplicação das regras pelo servidor ou redação dos erros pela execução completa do e2e.

## Testes com navegador

Em um ambiente que permita executar Chromium:

```sh
npm exec -- playwright-core install chromium
npm test
npm run test:agent-contract
```

`npm test` executa dois testes determinísticos com locators. `test:agent-contract` usa o mesmo teste de agente com uma sequência HTTP scriptada de screenshot, tap e conclusão. O resultado esperado continua sendo `DEMO-0001`, sem inferência. `test:security` verifica erros do CLI com servidor loopback que ecoa uma chave sintética em HTTP 401, tanto para chave principal quanto override. O teste exige saída 3, diagnóstico útil, marcador de redação e ausência da chave no terminal e em todos os artefatos, incluindo trace, cache e mídia. Usa configuração pertencente ao teste, `e2e.security.config.ts`, na raiz do projeto, porque o e2e trata a pasta do arquivo de configuração como raiz; não permite redirecionar o endpoint de produção. O CLI filho roda com telemetria e verificação de atualização desligadas e com `XDG_CONFIG_HOME` próprio. Esse teste precisa de navegador. `test:offline` combina build, contratos, segurança e esses testes com navegador. Ter contratos verdes não significa que `test:offline` passou.

## Executar o agente com OpenRouter

Crie sua conta e sua própria chave em [OpenRouter](https://openrouter.ai/settings/keys). Consulte o [guia oficial](https://openrouter.ai/docs/quickstart) e o [catálogo de modelos](https://openrouter.ai/models). Escolha um modelo e um slug de provider/endpoint que anunciem ferramentas, tool choice, imagens e JSON Schema. Confira o [routing por provider](https://openrouter.ai/docs/guides/routing/provider-selection). Esses anúncios não comprovam o fluxo deste exemplo.

Injete `OPENROUTER_API_KEY` pelo seu gerenciador de segredos ou pelo ambiente da sessão. Não coloque a chave em chat, código, argumentos de CLI, screenshots ou commits. O projeto não lê `.env` automaticamente.

```sh
export OPENROUTER_MODEL='<MODEL_ID_EXPLICITO>'
export OPENROUTER_PROVIDER='<SLUG_EXPLICITO_DO_PROVIDER_OU_ENDPOINT>'
export OPENROUTER_REQUEST_TIMEOUT_MS=20000
npm run build
npm run test:openrouter
```

Substitua os placeholders. Não há modelo ou provider padrão. A ausência de chave, modelo ou provider encerra o comando antes de iniciar aplicação ou navegador. Uma falha real não pula o teste nem ativa fixture.

O mesmo modelo recebe `require_parameters: true`, `allow_fallbacks: false` e `only`/`order` com o slug explícito em todas as chamadas. Não há lista de modelos alternativos. O timeout por request aceita 1-60000 ms, padrão 20000. A configuração usa um worker, zero retries do teste, timeout de teste de 60 segundos e orçamento de oito turnos lógicos do modelo. Isso não limita o fluxo a oito requisições HTTP: o e2e permite cinco retries de transporte por chamada, e reparos podem gerar outras requisições. O timeout de teste não inclui necessariamente todo o tempo de inicialização e limpeza do navegador; não é um limite comprovado do processo inteiro. Redirect HTTP é recusado. Todos os modos usam `--no-cache`.

O override `E2E_SECRET_OPENROUTER_API_KEY`, quando definido, substitui `OPENROUTER_API_KEY`. A configuração resolve o valor uma vez e o usa tanto no provider quanto em `config.secrets['openrouter-api-key']`. Uma chave presente precisa ter ao menos seis caracteres ASCII válidos para bearer, sem espaços, controles ou quebras de linha. Valores inválidos são recusados antes da aplicação/navegador, sem imprimir nem corrigir o valor. Sintaxe válida não comprova autenticação no serviço. Os contratos conferem essa correspondência, mas a redação da chave em terminal, relatórios e mídia pelo e2e ainda exige validação própria.

O adapter oficial transporta screenshots em `role: tool` com conteúdo multipart e `image_url`. Esse transporte passou em loopback. Sondagens SDK separadas observaram vermelho e, em uma execução anterior, laranja para o mesmo PNG vermelho no modelo original. Um teste posterior passou nesse modelo e em Haiku 4.5. Essas amostras não comprovam interpretação visual geral, normalização interna ou o fluxo completo do aplicativo. Suporte a imagem de usuário sozinho não basta para aceitar screenshots retornados por ferramentas.

## Resultados e limites

| Verificação | Resultado |
| --- | --- |
| Build e tipos | Passaram (`test:offline`, 2026-11-17) |
| Contratos locais sem navegador | Passaram (29/29, `test:offline`, 2026-11-17) |
| Locators com Chromium | Passaram (2/2, `test:offline`, 2026-11-17) |
| Agente scriptado com Chromium | Passou (1/1, fixture sem inferência, `test:offline`, 2026-11-17) |
| Segurança de erros na execução completa do e2e | Passou (chave principal e override, `test:offline`, 2026-11-17) |
| Fluxo completo do aplicativo com OpenRouter | Passou uma vez (`test:openrouter`, 2026-11-15) |
| Leitura de screenshots por um modelo real | Não exercitada |

O fluxo completo com OpenRouter passou em uma execução, com `OPENROUTER_MODEL='openai/gpt-4.1-mini'` e `OPENROUTER_PROVIDER='openai'`. Foram oito passos, com três assertions do status `DEMO-0001`, e duas chamadas de modelo com HTTP 200. O custo informado pela OpenRouter foi US$ 0,0025740. O agente usou a estrutura da página e não enviou imagens ao modelo, então essa execução não valida a leitura de screenshots. Uma execução aprovada não comprova confiabilidade, e outro modelo ou provider pode se comportar de outra forma. Depois dessa execução só este README mudou.

As execuções com navegador escrevem `report.json`, trace, screenshots e vídeo em `.e2e/deterministic/`, `.e2e/contract/` ou `.e2e/openrouter/`. `metrics.json` e `requests.ndjson` registram versão, modelo, provider, status HTTP e duração de ida e volta no cliente. Tokens e custo em USD vêm somente de campos numéricos efetivamente presentes em `usage.prompt_tokens`, `usage.completion_tokens` e `usage.cost` da resposta. Zero omitido pelo servidor não vira uma medição. Duração no cliente não é latência de inferência informada pelo serviço.

Prompts, headers, URLs e respostas não entram nas métricas customizadas. Os demais artefatos do e2e podem incluir tela, dados sintéticos e diagnósticos do modelo. Revise tudo antes de compartilhar. `node_modules/`, `dist/`, `.e2e/` e `.env*` são ignorados.

Para olhar a aplicação localmente, execute `npm start` após o build. O terminal imprime a URL loopback com porta efêmera. Encerre com Ctrl+C.

Código do fluxo: [locators](tests/e2e/deterministic.e2e.ts) e [agente](tests/e2e/agent.e2e.ts). Configuração do modelo: [scripts/model.ts](scripts/model.ts). Licença: [Apache-2.0](LICENSE).
