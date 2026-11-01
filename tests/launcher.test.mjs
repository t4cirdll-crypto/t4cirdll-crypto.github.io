import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// LF-only UTF-8 batches break parsing in cmd.exe on the target Windows machine.
// Check bytes, not a normalised string: the source text alone still looks valid.
test('Windows launcher retains CRLF line endings and has no UTF-8 BOM', () => {
  const bytes = readFileSync(new URL('../serve.bat', import.meta.url));
  assert.equal(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);
  assert.equal(bytes.subarray(0, 9).toString('ascii'), '@echo off');
  let lineCount = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i] !== 10) continue;
    lineCount += 1;
    assert.equal(bytes[i - 1], 13, `Line ${lineCount} must end with CRLF, not LF`);
  }
  assert.ok(lineCount > 0, 'The BAT must contain complete command lines');
  assert.equal(bytes.at(-1), 10, 'The final command must have a line ending');
});
