import { describe, expect, it } from 'vitest';
import { tex } from '~/lib/tex';

describe('tex', () => {
  it('renders a multi-line formula whose rows end in \\\\', () => {
    expect(() => tex('$$\\begin{aligned} a &= b \\\\\n c &= d \\end{aligned}$$')).not.toThrow();
  });
  it('rejects a row that ends in a single \\, which KaTeX would read as a space', () => {
    expect(() => tex('$$\\begin{aligned} a &= b \\\n c &= d \\end{aligned}$$', 'x')).toThrow(/single/);
    expect(() => tex('$$\\begin{aligned} a &= b \\ &= d \\end{aligned}$$', 'x')).toThrow(/single/);
  });
  it('still accepts a deliberate \\ space inside a row', () => {
    expect(() => tex('$a\\ b$')).not.toThrow();
  });
  it('rejects Hebrew inside math', () => {
    expect(() => tex('$\\text{שלום}$')).toThrow();
  });
});
