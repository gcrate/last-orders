import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const engineDir = join(__dirname, '..', 'src', 'engine');
const files = readdirSync(engineDir).filter((f) => f.endsWith('.ts'));

describe('engine architecture rules', () => {
  for (const f of files) {
    // Ignore comments, which may mention the forbidden calls.
    const src = readFileSync(join(engineDir, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    it(`${f} has no UI imports`, () => {
      expect(src).not.toMatch(/from ['"]react/);
      expect(src).not.toMatch(/from ['"]\.\.\/ui/);
    });
    it(`${f} uses no unseeded randomness or wall-clock time`, () => {
      expect(src).not.toMatch(/Math\.random\s*\(/);
      expect(src).not.toMatch(/Date\.now\s*\(/);
      expect(src).not.toMatch(/new Date\s*\(/);
    });
  }
});
