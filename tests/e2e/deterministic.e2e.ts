import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

describe('atendimento fictício: locators', () => {
  test('recusa formulário vazio', async ({ app, screen }) => {
    await app.open('/');
    await screen.getByRole('button', 'Gerar protocolo fictício').click();
    await app.screenshot('Formulário vazio');
    await expect(screen.getByRole('alert')).toHaveText('Preencha o nome fictício e a descrição do pedido.');
    await expect(screen.getByRole('status')).toHaveText('');
  });

  test('gera protocolo apenas na página', async ({ app, screen }) => {
    await app.open('/');
    await screen.getByLabel('Nome fictício').fill('Pessoa Exemplo');
    await screen.getByLabel('Descrição do pedido fictício').fill('Solicitar informação de horário');
    await screen.getByRole('button', 'Gerar protocolo fictício').click();
    await app.screenshot('Protocolo fictício');
    await expect(screen.getByRole('status')).toContainText('DEMO-0001 gerado para Pessoa Exemplo');
    await expect(screen.getByRole('status')).toContainText('Nenhum envio real foi realizado.');
  });
});
