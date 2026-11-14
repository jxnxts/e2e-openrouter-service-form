import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

describe('atendimento fictício: agente + locators', () => {
  test('confirma o pedido preenchido com locators', async ({ app, agent, screen }) => {
    await app.open('/');
    await screen.getByLabel('Nome fictício').fill('Pessoa Exemplo');
    await screen.getByLabel('Descrição do pedido fictício').fill('Solicitar informação de horário');
    await agent.act('Gere o protocolo fictício para o pedido já preenchido.');
    await app.screenshot('Protocolo fictício com agente');
    await expect(screen.getByRole('status')).toContainText('DEMO-0001 gerado para Pessoa Exemplo');
    await expect(screen.getByRole('status')).toContainText('Solicitar informação de horário');
    await expect(screen.getByRole('status')).toContainText('Nenhum envio real foi realizado.');
  });
});
