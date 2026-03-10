import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

describe('Crystal Ball desktop shell branding', () => {
  const settingsHtml = readFileSync(resolve(root, 'settings.html'), 'utf-8');
  const liveChannelsHtml = readFileSync(resolve(root, 'live-channels.html'), 'utf-8');
  const tauriMain = readFileSync(resolve(root, 'src-tauri', 'src', 'main.rs'), 'utf-8');
  const viteConfig = readFileSync(resolve(root, 'vite.config.ts'), 'utf-8');

  it('uses Crystal Ball branding in standalone html entry points', () => {
    assert.match(settingsHtml, /<title>Crystal Ball Settings<\/title>/);
    assert.match(settingsHtml, /<span class="settings-header-title">Crystal Ball Settings<\/span>/);
    assert.match(liveChannelsHtml, /<title>Channel management - Crystal Ball<\/title>/);
    assert.doesNotMatch(settingsHtml, /World Monitor Settings/);
    assert.doesNotMatch(liveChannelsHtml, /Channel management - World Monitor/);
  });

  it('relaunches and labels desktop windows as Crystal Ball', () => {
    assert.match(tauriMain, /\.args\(\["-a", "Crystal Ball"\]\)/);
    assert.match(tauriMain, /\.title\("Crystal Ball Settings"\)/);
    assert.match(tauriMain, /\.title\("Channel management - Crystal Ball"\)/);
    assert.doesNotMatch(tauriMain, /\.args\(\["-a", "World Monitor"\]\)/);
  });

  it('preserves auxiliary window titles during Vite html transforms', () => {
    assert.match(viteConfig, /isAuxiliaryWindow/);
    assert.match(viteConfig, /fileName\.endsWith\('\/settings\.html'\)/);
    assert.match(viteConfig, /fileName\.endsWith\('\/live-channels\.html'\)/);
    assert.match(viteConfig, /if \(isAuxiliaryWindow\) \{\s*return html;\s*\}/);
  });
});
