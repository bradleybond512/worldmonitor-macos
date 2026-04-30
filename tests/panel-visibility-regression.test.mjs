import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const panelsSrc = readFileSync(resolve(root, 'src/config/panels.ts'), 'utf8');
const appSrc = readFileSync(resolve(root, 'src/App.ts'), 'utf8');
const unifiedSettingsSrc = readFileSync(resolve(root, 'src/components/UnifiedSettings.ts'), 'utf8');
const eventHandlersSrc = readFileSync(resolve(root, 'src/app/event-handlers.ts'), 'utf8');
const readmeSrc = readFileSync(resolve(root, 'README.md'), 'utf8');

function extractObjectBody(source, name) {
  const match = source.match(new RegExp(`const ${name}:[\\s\\S]*?= \\{([\\s\\S]*?)\\n\\};`));
  assert.ok(match, `expected to find ${name}`);
  return match[1];
}

function extractPanelKeys(objectBody) {
  return [...objectBody.matchAll(/^\s*'?([a-zA-Z0-9-]+)'?:\s*\{/gm)].map((match) => match[1]);
}

function extractDisabledPanelKeys(objectBody) {
  return [...objectBody.matchAll(/^\s*'?([a-zA-Z0-9-]+)'?:\s*\{[^\n]*enabled:\s*false/gm)].map((match) => match[1]);
}

function extractCategorizedPanelKeys(source) {
  const categoryBody = source.match(/export const PANEL_CATEGORY_MAP:[\s\S]*?= \{([\s\S]*?)\n\};/);
  assert.ok(categoryBody, 'expected to find PANEL_CATEGORY_MAP');
  const arrays = [...categoryBody[1].matchAll(/panelKeys:\s*\[([^\]]*)\]/gm)].map((match) => match[1]);
  return new Set(arrays.flatMap((entry) => [...entry.matchAll(/'([^']+)'/g)].map((match) => match[1])));
}

describe('full variant panel visibility regressions', () => {
  it('keeps every configured full-variant panel reachable from a sidebar category', () => {
    const fullPanels = extractPanelKeys(extractObjectBody(panelsSrc, 'FULL_PANELS')).filter((key) => key !== 'map');
    const categorizedKeys = extractCategorizedPanelKeys(panelsSrc);
    const uncategorized = fullPanels.filter((key) => !categorizedKeys.has(key));

    assert.deepEqual(
      uncategorized,
      [],
      `every full-variant panel should appear in PANEL_CATEGORY_MAP, missing: ${uncategorized.join(', ')}`,
    );
  });

  it('enables every configured full-variant panel by default so a fresh install shows the whole inventory', () => {
    // Panels that are intentionally disabled by default because they require
    // external/local infrastructure that most users do not have. Enabling them
    // would surface an empty / error UI on a clean install. Each entry must
    // have a stated reason; if the reason no longer applies, enable the panel
    // and remove the entry rather than silently growing this allowlist.
    const INTENTIONALLY_DISABLED = new Map([
      ['local-ids', 'Requires Suricata or Zeek IDS running on the user\'s LAN; opt-in for home/lab users.'],
    ]);

    const disabled = extractDisabledPanelKeys(extractObjectBody(panelsSrc, 'FULL_PANELS'))
      .filter((key) => key !== 'map')
      .filter((key) => !INTENTIONALLY_DISABLED.has(key));

    assert.deepEqual(
      disabled,
      [],
      `full variant should not ship with hidden panels by default unless they are listed in INTENTIONALLY_DISABLED with a reason. Unexpected disabled: ${disabled.join(', ')}`,
    );
  });

  it('migrates existing installs to the full visible panel inventory', () => {
    assert.match(
      appSrc,
      /worldmonitor-full-panels-visible-v2\.7\.6/,
      'startup should define a migration that lifts older installs to the fully visible panel inventory',
    );
    assert.match(
      appSrc,
      /panelSettings\[key\]\.enabled = true|panelSettings\[key\] = \{ \.\.\.config, enabled: true \}/,
      'migration should explicitly force legacy panel settings back to enabled',
    );
  });

  it('shows panel visibility counts and bulk enable controls in settings', () => {
    assert.match(
      unifiedSettingsSrc,
      /id="usPanelsCounter"/,
      'panels settings should show a visible enabled\/total counter',
    );
    assert.match(
      unifiedSettingsSrc,
      /class="panels-select-all"/,
      'panels settings should expose a bulk enable action',
    );
    assert.match(
      unifiedSettingsSrc,
      /class="panels-select-none"/,
      'panels settings should expose a bulk disable action',
    );
    assert.match(
      unifiedSettingsSrc,
      /setPanelsEnabled:\s*\(keys: string\[\], enabled: boolean\) => void;/,
      'settings config should support bulk panel toggles',
    );
    assert.match(
      eventHandlersSrc,
      /setPanelsEnabled:\s*\(keys,\s*enabled\)\s*=>/,
      'event handlers should wire bulk panel toggles through app state persistence',
    );
  });

  it('keeps the README inventory count aligned with the live full-variant config', () => {
    // Count panels by extracting each variant's object and counting top-level keys.
    // Stays in sync with src/config/panels.ts automatically — no hardcoded counts.
    const fullKeys = extractPanelKeys(extractObjectBody(panelsSrc, 'FULL_PANELS'));
    const techKeys = extractPanelKeys(extractObjectBody(panelsSrc, 'TECH_PANELS'));
    const financeKeys = extractPanelKeys(extractObjectBody(panelsSrc, 'FINANCE_PANELS'));
    const happyKeys = extractPanelKeys(extractObjectBody(panelsSrc, 'HAPPY_PANELS'));
    const fullEnabled = fullKeys.length - extractDisabledPanelKeys(extractObjectBody(panelsSrc, 'FULL_PANELS')).length;

    // README must mention each variant's count somewhere (loose match — text or table cell).
    const variantChecks = [
      { label: 'full', count: fullEnabled, alt: fullKeys.length },
      { label: 'tech', count: techKeys.length },
      { label: 'finance', count: financeKeys.length },
      { label: 'happy', count: happyKeys.length },
    ];
    for (const { label, count, alt } of variantChecks) {
      const pattern = new RegExp(`\\b${count}\\b\\s*${label}\\b|\\b${label}\\b[^\\n]{0,40}\\b${count}\\b` + (alt ? `|\\b${alt}\\b\\s*${label}\\b|\\b${label}\\b[^\\n]{0,40}\\b${alt}\\b` : ''), 'i');
      assert.match(
        readmeSrc,
        pattern,
        `README should mention the ${label} variant's panel count (${count}${alt ? ` or ${alt}` : ''}); update README.md when src/config/panels.ts changes`,
      );
    }
  });
});
