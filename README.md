# e2e + Mandu: atendimento público fictício

Exemplo comunitário independente, preparado para extração desta pasta para um repositório próprio. Usa o provider existente `@ai-sdk/openai-compatible`, sem modificar o e2e ou implementar um provider Mandu.

A página em português recebe um nome e um pedido **sintéticos**, valida campos vazios e mostra o protocolo fixo `DEMO-0001`. Tudo acontece no navegador, sem banco, órgão público ou envio de solicitação. Nenhuma marca de governo real é usada.

## Instalar e construir

Use Node `^22.22.3 || >=24.8.0`; a verificação local usou Node 24.22.2. Os comandos usam npm para manter o projeto independente do workspace pnpm que pode contê-lo. O `package-lock.json` fixa dependências e hashes de integridade.

```sh
npm ci --ignore-scripts
npm exec -- playwright-core install chromium
npm run build
```

O build verifica tipos e copia a aplicação para `dist/`. Os testes consomem os pacotes **publicados e construídos**, instalados do npm; não importam `src/` do monorepo.

## Executar sem inferência

```sh
npm test                     # dois testes com locators, Chromium real, sem modelo
npm run test:contract        # HTTP local: imagem, tool call, JSON Schema e falhas
npm run test:security        # CLI real contra erro HTTP local ecoando chave sintética
npm run test:agent-contract  # agent.act + fixture HTTP scriptada + Chromium real
npm run test:offline         # build e todos os testes acima
```

`test:agent-contract` usa `fixture-only-no-inference`: uma sequência explícita de respostas HTTP solicita `screenshot`, toca o botão encontrado na árvore real e conclui o passo. O teste exige a imagem no request e o protocolo na observação resultante, além das assertions determinísticas da aplicação. Isso prova a integração do adapter e da harness, **não** raciocínio, interpretação visual ou execução Mandu/Qwen/GLM. A fixture não fornece uso de tokens.

Os oito testes de contrato verificam configuração ausente/inválida, imagem PNG, schema das ferramentas, tool choice, decodificação da tool call, `response_format: json_schema`, timeout, desconexão, resposta inválida e conteúdo que viola o schema e omissão de contadores de tokens indisponíveis. Um teste usa um contador parcial explicitamente fabricado para testar a coleta de métricas; isso não representa uso de inferência. As falhas esperadas são capturadas por assertions; erro inesperado faz o comando falhar. Os probes usam `maxRetries: 0` e apenas loopback, sem acessar endpoints/keys do shell. A fixture e a aplicação usam portas efêmeras e fecham ao final.

## Executar com Mandu de desenvolvimento

Use somente um endpoint de desenvolvimento autorizado, com dados sintéticos. O modelo precisa suportar tool calls e imagens; confirme o model ID servido pelo seu Mandu. Não há descoberta automática, fallback para outro provider, nem leitura automática de `.env`.

```sh
export MANDU_BASE_URL='<URL_HTTP_OU_HTTPS_DO_MANDU_DEV_INCLUINDO_V1_SE_APLICAVEL>'
export MANDU_MODEL='<MODEL_ID_SERVIDO_PELO_MANDU_DEV>'
export MANDU_STRUCTURED_OUTPUTS='<true_OU_false>'
export MANDU_MULTIPART_TOOL_CONTENT='<true_OU_false>'
# Se o endpoint exigir autenticação, injete MANDU_API_KEY pelo seu gerenciador de segredos.
# Não coloque tokens em URL, código, argumentos de CLI ou commits.
export MANDU_REQUEST_TIMEOUT_MS=20000
npm run build
npm run test:mandu
```

Substitua todos os placeholders. `MANDU_BASE_URL` e `MANDU_MODEL` são obrigatórios; não há endpoint ou modelo padrão. `MANDU_STRUCTURED_OUTPUTS` também é obrigatório: use `true` apenas se o servidor aceitar `response_format` com JSON Schema. A flag declara capacidade, não a comprova. Com `false`, o AI SDK pode emitir aviso de schema não suportado; a execução do agente não valida essa capacidade. `MANDU_MULTIPART_TOOL_CONTENT` exige `true` ou `false`: habilite apenas se o endpoint aceitar arrays `content` em mensagens de papel `tool`. Com `true`, screenshots do agente atravessam o adapter como `image_url`; com `false`, o adapter serializa esses resultados como texto, o que **não** demonstra visão. Suporte a imagens em mensagens de usuário não implica suporte a imagens em resultados de ferramentas. Confirme isso com o operador Mandu antes do teste real. O timeout de cada request aceita 1–60000 ms, padrão 20000; o teste inteiro tem limite de 60 segundos e oito model calls. O e2e/AI SDK pode fazer retries dentro desses limites; não troca de provider. Redirect HTTP é recusado.

O comando valida a configuração antes de iniciar servidor ou modelo e retorna erro se faltar qualquer variável obrigatória. Não pula o teste nem substitui o Mandu por fixture. Sempre usa `--no-cache`, para que uma gravação anterior não seja confundida com nova inferência. Na tentativa autorizada de conectividade de 13/11/2026, os endereços configurados localmente retornaram HTTP 404 nas rotas de listagem e chat. Nenhuma resposta de modelo foi obtida; compatibilidade, ferramentas, imagens, JSON Schema e desempenho do Mandu/Qwen/GLM permanecem sem validação real.

A chave estática é declarada condicionalmente em `config.secrets` como `'mandu-api-key'`, além de ser enviada ao adapter. Assim o próprio e2e redige o valor conhecido em erros, terminal e artefatos; o wrapper não implementa redator próprio. O contrato de secrets exige pelo menos seis caracteres (code points) para uma chave presente. O override público `E2E_SECRET_MANDU_API_KEY`, se definido, tem precedência sobre `MANDU_API_KEY` tanto para autenticação quanto para o registro de redação; mantenha a chave em uma única variável. O modo offline ignora ambos e usa apenas dados sintéticos.

`test:security` executa o comando real `node scripts/run.mjs mandu` em projetos temporários contra um servidor loopback que ecoa o header Authorization em um HTTP 401, para a chave principal e para o override. Exige saída 3 (`MODEL_PROVIDER_FAILED`), diagnóstico de autenticação útil com marcador `<secret:mandu-api-key>` e ausência da chave sintética no terminal e em **todos** os arquivos gerados em `.e2e/`, incluindo report, trace e mídia; percorre também qualquer cache que existir (o comando usa `--no-cache` e não o gera neste cenário). Não usa inferência. Isso verifica redação do valor estático conhecido; não promete esconder todo texto de erro, nomes de modelo, endpoints ou outras informações não declaradas como segredo. O endpoint loopback ecoado continua nos diagnósticos e não é tratado como confidencial. Conteúdo transformado ou outros segredos não declarados precisam de sua própria classificação; revise artefatos antes de compartilhá-los.

## O fluxo

[tests/e2e/deterministic.e2e.ts](tests/e2e/deterministic.e2e.ts) verifica o formulário vazio e o protocolo preenchido usando locators. [tests/e2e/agent.e2e.ts](tests/e2e/agent.e2e.ts) preenche os dados exatos com locators, dá ao `agent.act` um único objetivo (gerar o protocolo) e confirma o resultado com assertions determinísticas. Esse mesmo teste roda na fixture ou no Mandu conforme o comando explícito.

Para olhar a aplicação manualmente depois do build:

```sh
npm start
```

O terminal imprime a URL loopback com porta efêmera. Encerre com Ctrl+C.

## Evidências e métricas

Cada execução do navegador escreve em `.e2e/deterministic/`, `.e2e/contract/` ou `.e2e/mandu/`:

- `report.json`: relatório original do e2e, incluindo resultado e erros.
- `results/`: trace de ações (`trace.md`), screenshots e vídeo por tentativa.
- `metrics.json`: versões fixas, modelo, model calls observadas e duração de cada ida/volta medida pelo cliente. Tokens são copiados apenas dos campos numéricos `usage.prompt_tokens` e `usage.completion_tokens` realmente presentes na resposta HTTP, antes da normalização do SDK; um campo ausente é omitido, mesmo se o SDK o converter em zero. `requests.ndjson` contém essas mesmas medições por request, sem headers, URL, prompts ou respostas. Campos indisponíveis de custo/latência do serviço não são inventados.

O relatório original do e2e pode conter contagens estimadas marcadas `adapter-upper-bound`; não trate isso como uso reportado pelo Mandu. `clientRoundTripMs` mede o fetch no cliente, incluindo a leitura do JSON em respostas bem-sucedidas; `clientRoundTripsMs` contém os eventos de modelo medidos pela harness, incluindo adapter. Nenhum deles é latência de inferência informada pelo servidor. A fixture não executa inferência e suas durações não são benchmark de Mandu. A versão/modelo do backend Mandu só pode ser confirmada com seu operador; a string configurada no cliente não comprova a versão do servidor.

Os artefatos incluem tela, dados sintéticos, texto retornado pelo modelo e detalhes de falha. Revise antes de compartilhar; `.e2e/`, `.env*`, `node_modules/` e `dist/` são ignorados. Não há telemetria adicional ou upload neste exemplo.

## Publicação futura

[proposal/examples-entry.draft.json](proposal/examples-entry.draft.json) é um rascunho separado da registry upstream, com placeholders explícitos. Publique o repositório somente após revisão independente, obtenha o SHA completo revisado e substitua URL/SHA/autor antes de propor a entrada. Não copie o rascunho com placeholders para `examples/examples.json`. O exemplo é comunitário, sem preset oficial ou job nightly upstream.

Fontes primárias: [modelos no e2e](https://github.com/e2e-inc/e2e/blob/e167149af1d390492af09e5fe28bb64072e9df64/docs/models.mdx), [OpenAI Compatible Provider no AI SDK](https://ai-sdk.dev/providers/openai-compatible-providers) e [contribuir exemplo](https://github.com/e2e-inc/e2e/blob/e167149af1d390492af09e5fe28bb64072e9df64/examples/CONTRIBUTING.md).

Licença: [Apache-2.0](LICENSE).
