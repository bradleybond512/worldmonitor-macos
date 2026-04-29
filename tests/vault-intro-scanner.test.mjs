import { strict as assert } from 'node:assert';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const src = readFileSync(path.join(repoRoot, 'src', 'app', 'vault-intro.ts'), 'utf8');

test('vault intro scanner registers exactly one click listener and guards re-entry', () => {
  const clickListenerMatches = src.match(/scannerBtn\.addEventListener\('click'/g) ?? [];
  assert.equal(
    clickListenerMatches.length,
    1,
    'scanner button should register exactly one click listener (no duplicate registration on retry)',
  );
});

test('vault intro auth flow guards against re-entry while a request is in flight', () => {
  assert.match(
    src,
    /const tryAuth = async \([^)]*\) => \{[\s\S]*?if \(settled \|\| inFlight\) return;[\s\S]*?inFlight = true;/m,
    'tryAuth must short-circuit when settled or already in flight, then mark inFlight before async work',
  );
});

test('vault intro success path settles the flow and plays the open sequence', () => {
  assert.match(
    src,
    /await invokeTauri<void>\(CMD,[\s\S]*?settled = true;[\s\S]*?await playOpenSequence\(refs, appReady\);[\s\S]*?resolveFlow\(true\);/m,
    'on successful biometric auth, the flow must mark settled, play open sequence, and resolve true',
  );
});

test('vault intro failure path resets the scanner so the user can retry', () => {
  assert.match(
    src,
    /\} catch \([^)]*\) \{[\s\S]*?inFlight = false;[\s\S]*?setScannerError\(refs[\s\S]*?setTimeout\([\s\S]*?setScannerIdle\(refs\)/m,
    'on biometric failure, inFlight must clear and the scanner UI must return to idle so the user can retry',
  );
});
