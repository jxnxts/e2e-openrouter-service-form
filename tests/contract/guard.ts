import assert from 'node:assert/strict';

// SDK image downloads also use global fetch, outside the provider's fetch hook.
const send = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  assert.equal(url.protocol, 'http:', 'Offline contracts reject nonloopback traffic before fetch');
  assert.equal(url.hostname, '127.0.0.1', 'Offline contracts reject nonloopback traffic before fetch');
  return send(input, { ...init, redirect: 'error' });
};
