import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('gods-eye-layers', () => {
  it('exports default layer state with all layers disabled', async () => {
    const { DEFAULT_GODS_EYE_LAYERS } = await import(
      '../src/config/gods-eye-layers.ts'
    );
    const allDisabled = Object.values(DEFAULT_GODS_EYE_LAYERS).every(
      (layer) => !layer.enabled,
    );
    assert.equal(allDisabled, true, 'All layers should default to disabled');
  });

  it('every layer has required metadata fields', async () => {
    const { DEFAULT_GODS_EYE_LAYERS } = await import(
      '../src/config/gods-eye-layers.ts'
    );
    for (const [key, layer] of Object.entries(DEFAULT_GODS_EYE_LAYERS)) {
      assert.ok(layer.name, `${key} missing name`);
      assert.ok(layer.category, `${key} missing category`);
      assert.equal(typeof layer.enabled, 'boolean', `${key} enabled not boolean`);
    }
  });

  it('has layers for all 8 planned features', async () => {
    const { DEFAULT_GODS_EYE_LAYERS } = await import(
      '../src/config/gods-eye-layers.ts'
    );
    const keys = Object.keys(DEFAULT_GODS_EYE_LAYERS);
    const required = [
      'satellites', 'terrain', 'buildings', 'imagery',
      'hud', 'entityGraph', 'rfCoverage', 'timeline',
    ];
    for (const r of required) {
      assert.ok(keys.includes(r), `Missing required layer: ${r}`);
    }
  });
});
