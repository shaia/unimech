import katex from 'katex';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Render a short Hebrew string that may contain $inline$ or $$display$$ math into HTML,
 * at build time. Used for question prompts, choices and feedback that live in YAML.
 * Invalid TeX throws, so a broken formula fails the build instead of shipping raw.
 * **bold** is the only other markup supported.
 */
export function tex(input: string, where = ''): string {
  const parts = input.split(/(\$\$[^$]+\$\$|\$[^$]+\$)/g);
  return parts
    .map((part) => {
      if (part.startsWith('$$') && part.endsWith('$$') && part.length > 4) {
        return renderMath(part.slice(2, -2), true, where);
      }
      if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
        return renderMath(part.slice(1, -1), false, where);
      }
      return escapeHtml(part).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    })
    .join('');
}

function renderMath(src: string, display: boolean, where: string): string {
  try {
    return katex.renderToString(src, { displayMode: display, throwOnError: true, strict: 'error' });
  } catch (err) {
    throw new Error(`KaTeX rejected ${JSON.stringify(src)}${where ? ` in ${where}` : ''}: ${(err as Error).message}`);
  }
}
