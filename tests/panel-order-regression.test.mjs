import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const panelsSrc = readFileSync(resolve(root, 'src/config/panels.ts'), 'utf8');
const appSrc = readFileSync(resolve(root, 'src/App.ts'), 'utf8');

describe('panel order regressions', () => {
  it('puts AI overview panels ahead of raw feeds in the full variant defaults', () => {
    assert.match(
      panelsSrc,
      /const FULL_PANELS[\s\S]*?map:[\s\S]*?insights:[\s\S]*?'strategic-posture':[\s\S]*?'strategic-risk':[\s\S]*?cii:[\s\S]*?'geo-hubs':[\s\S]*?'live-news':/,
      'full variant should lead with AI overview panels before live feeds',
    );
  });

  it('puts AI overview panels ahead of raw feeds in the tech variant defaults', () => {
    assert.match(
      panelsSrc,
      /const TECH_PANELS[\s\S]*?map:[\s\S]*?insights:[\s\S]*?regulation:[\s\S]*?'tech-readiness':[\s\S]*?ai:[\s\S]*?'tech-hubs':[\s\S]*?tech:[\s\S]*?policy:[\s\S]*?'live-news':/,
      'tech variant should lead with AI overview panels before headline feeds',
    );
  });

  it('migrates saved panel order so existing users also get the AI overview up top', () => {
    assert.match(
      appSrc,
      /const AI_OVERVIEW_PRIORITY_PANELS: Record<string, string\[]> = \{/,
      'app startup should define per-variant AI overview priority panels',
    );
    assert.match(
      appSrc,
      /worldmonitor-ai-overview-top-v2\.7\.1/,
      'app startup should migrate existing saved layouts to the AI-first ordering',
    );
    assert.match(
      appSrc,
      /\.\.\.aiOverviewPriorityPanels\.filter\(panelKey => order\.includes\(panelKey\)\)/,
      'migration should explicitly lift AI overview panels to the front of saved layouts',
    );
  });
});
