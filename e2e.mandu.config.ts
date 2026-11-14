import type { E2EConfig } from 'e2e';
import base from './e2e.config.ts';
import { manduApiKey, manduModel } from './scripts/model.ts';

const apiKey = manduApiKey();

export default {
  ...base,
  ...(apiKey ? { secrets: { 'mandu-api-key': apiKey } } : {}),
  agents: {
    default: {
      model: manduModel(),
      maxModelCalls: 8,
      system: 'Você testa apenas a aplicação fictícia de atendimento público em português. Não existem cidadãos ou protocolos reais aqui.',
    },
  },
} satisfies E2EConfig;
