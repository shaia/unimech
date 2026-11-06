/**
 * The formula sheet, collected at build time from the lesson sources: every `<Formula tex=… label=…>`
 * card in a lesson's MDX body becomes an entry of the course formula sheet, so a new lesson's
 * formulas appear without anyone editing a list.
 */

export interface FormulaEntry {
  tex: string;
  label: string;
  sheet: boolean;
}

/** Props of one tag, `name="value"` or a bare flag; the TeX attribute may also be `tex={String.raw`…`}`. */
function parseProps(inner: string, where: string): Record<string, string | true> {
  const props: Record<string, string | true> = {};
  const attr = /([A-Za-z]+)(?:=(?:"([^"]*)"|\{String\.raw`([^`]*)`\}|\{'([^']*)'\}))?/g;
  for (const m of inner.matchAll(attr)) {
    props[m[1]] = m[2] ?? m[3] ?? m[4] ?? true;
  }
  if (typeof props.tex !== 'string' || typeof props.label !== 'string') {
    throw new Error(`${where}: a <Formula> needs literal tex="…" and label="…" attributes to reach the formula sheet: ${inner.trim().slice(0, 80)}`);
  }
  return props;
}

export function formulasIn(mdxBody: string, where: string): FormulaEntry[] {
  // a ">" inside a quoted attribute must not end the tag
  return [...mdxBody.matchAll(/<Formula\b((?:[^>"']|"[^"]*"|'[^']*')*?)\/?>/g)].map((m) => {
    const p = parseProps(m[1], where);
    return { tex: p.tex as string, label: p.label as string, sheet: p.sheet === true || p.sheet === 'true' };
  });
}
