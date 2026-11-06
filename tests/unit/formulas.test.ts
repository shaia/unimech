import { describe, expect, it } from 'vitest';
import { formulasIn } from '~/lib/formulas';

describe('formulasIn', () => {
  it('collects every Formula card of a lesson body, in order', () => {
    const body = `
text <Formula tex="\vec E = \frac{\vec F}{q_0}" label="הגדרת השדה" />
more
<Formula tex="E = k|Q|/r^2" label="שדה של מטען נקודתי" sheet />`;
    expect(formulasIn(body, 'x')).toEqual([
      { tex: '\vec E = \frac{\vec F}{q_0}', label: 'הגדרת השדה', sheet: false },
      { tex: 'E = k|Q|/r^2', label: 'שדה של מטען נקודתי', sheet: true },
    ]);
  });

  it('is not fooled by a ">" inside the TeX', () => {
    expect(formulasIn('<Formula tex="a > b" label="אי-שוויון" />', 'x')).toEqual([{ tex: 'a > b', label: 'אי-שוויון', sheet: false }]);
  });

  it('fails loudly when a card cannot be read, rather than dropping it from the sheet', () => {
    expect(() => formulasIn('<Formula tex={expr} label="x" />', 'lesson.mdx')).toThrow(/lesson\.mdx/);
  });

  it('finds nothing in a body without cards', () => {
    expect(formulasIn('no cards <Formulas> here', 'x')).toEqual([]);
  });
});
