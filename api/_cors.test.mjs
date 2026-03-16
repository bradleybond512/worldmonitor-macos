import { strict as assert } from 'node:assert';
import test from 'node:test';
import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

function makeRequest(origin) {
  const headers = new Headers();
  if (origin !== null) {
    headers.set('origin', origin);
  }
  return new Request('https://worldmonitor.app/api/test', { headers });
}

test('allows desktop Tauri origins', () => {
  const origins = [
    'https://tauri.localhost',
    'https://abc123.tauri.localhost',
    'tauri://localhost',
    'asset://localhost',
    'http://127.0.0.1:46123',
  ];

  for (const origin of origins) {
    const req = makeRequest(origin);
    assert.equal(isDisallowedOrigin(req), false, `origin should be allowed: ${origin}`);
    const cors = getCorsHeaders(req);
    assert.equal(cors['Access-Control-Allow-Origin'], origin);
  }
});

test('rejects unrelated external origins', () => {
  const req = makeRequest('https://evil.example.com');
  assert.equal(isDisallowedOrigin(req), true);
  const cors = getCorsHeaders(req);
  assert.equal(cors['Access-Control-Allow-Origin'], 'https://worldmonitor.app');
});

test('requests without origin remain allowed', () => {
  const req = makeRequest(null);
  assert.equal(isDisallowedOrigin(req), false);
});

test('allows enumerated worldmonitor.app subdomains', () => {
  const subdomains = ['tech', 'finance', 'happy', 'api'];
  for (const sub of subdomains) {
    const origin = `https://${sub}.worldmonitor.app`;
    const req = makeRequest(origin);
    assert.equal(isDisallowedOrigin(req), false, `subdomain should be allowed: ${sub}`);
    const cors = getCorsHeaders(req);
    assert.equal(cors['Access-Control-Allow-Origin'], origin);
  }
});

test('allows bare worldmonitor.app origin', () => {
  const origin = 'https://worldmonitor.app';
  const req = makeRequest(origin);
  assert.equal(isDisallowedOrigin(req), false);
  const cors = getCorsHeaders(req);
  assert.equal(cors['Access-Control-Allow-Origin'], origin);
});

test('rejects non-enumerated worldmonitor.app subdomains', () => {
  const bad = [
    'https://evil.worldmonitor.app',
    'https://admin.worldmonitor.app',
    'https://www.worldmonitor.app',
  ];
  for (const origin of bad) {
    const req = makeRequest(origin);
    assert.equal(isDisallowedOrigin(req), true, `subdomain should be rejected: ${origin}`);
  }
});

test('allows Vercel preview deploy origins', () => {
  const origins = [
    'https://worldmonitor-abc123-elie-xyz.vercel.app',
    'http://localhost:5173',
    'http://localhost',
    'https://localhost:3000',
  ];
  for (const origin of origins) {
    const req = makeRequest(origin);
    assert.equal(isDisallowedOrigin(req), false, `preview origin should be allowed: ${origin}`);
  }
});

test('rejects origins with wrong protocol or port tricks', () => {
  const bad = [
    'http://worldmonitor.app',       // wrong protocol for prod
    'ftp://worldmonitor.app',
    'https://worldmonitor.app.evil.com',
  ];
  for (const origin of bad) {
    const req = makeRequest(origin);
    assert.equal(isDisallowedOrigin(req), true, `should be rejected: ${origin}`);
  }
});

test('Vary header is always set to Origin', () => {
  const cors = getCorsHeaders(makeRequest('https://worldmonitor.app'));
  assert.equal(cors['Vary'], 'Origin');
});

test('getCorsHeaders returns correct default methods', () => {
  const cors = getCorsHeaders(makeRequest('https://worldmonitor.app'));
  assert.equal(cors['Access-Control-Allow-Methods'], 'GET, OPTIONS');
});

test('getCorsHeaders accepts custom methods parameter', () => {
  const cors = getCorsHeaders(makeRequest('https://worldmonitor.app'), 'GET, POST, OPTIONS');
  assert.equal(cors['Access-Control-Allow-Methods'], 'GET, POST, OPTIONS');
});
