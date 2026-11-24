import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../components/customer/ItemCustomizationDialog.jsx', import.meta.url),
  'utf8'
);

assert.match(source, /if \(dialog && !dialog\.open\)\s*{\s*dialog\.showModal\(\);\s*}/);
assert.doesNotMatch(source, /return\s*\(\)\s*=>\s*{[\s\S]*?dialog(?:\?|)\.close\(\)/);
assert.match(source, /onCancel={onClose}/);
assert.match(source, /onClose={onClose}/);
assert.match(source, /onSubmit={handleSubmit}/);

console.log('FR-04 item customization dialog lifecycle tests passed (5/5).');
