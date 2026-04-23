import katex from 'katex';
import 'katex/dist/katex.min.css';

function renderLatex(text) {
  const blockPattern = /\$\$([\s\S]*?)\$\$/g;
  const inlinePattern = /\$([^\$\n]+?)\$/g;

  let result = text;

  result = result.replace(blockPattern, (_, math) => {
    try {
      return `<div class="katex-block">${katex.renderToString(math.trim(), { displayMode: true, throwOnError: false })}</div>`;
    } catch {
      return `<div class="katex-error">${math}</div>`;
    }
  });

  result = result.replace(inlinePattern, (_, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
    } catch {
      return `$${math}$`;
    }
  });

  return result;
}

function renderText(text) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const html = renderLatex(line);
    return (
      <span key={i} dangerouslySetInnerHTML={{ __html: html }} />
    );
  });
}

export { renderText };
