import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { renderText } from './latex.jsx'

function render(text) {
  return renderToStaticMarkup(<>{renderText(text)}</>)
}

describe('renderText', () => {
  it('renders one span per line', () => {
    const html = render('first line\nsecond line')

    expect(html.match(/<span/g)).toHaveLength(2)
    expect(html).toContain('first line')
    expect(html).toContain('second line')
  })

  it('renders inline LaTeX through KaTeX', () => {
    const html = render('Value: $x^2$')

    expect(html).toContain('katex')
    expect(html).not.toContain('$x^2$')
  })

  it('renders block LaTeX through KaTeX', () => {
    const html = render('$$x^2$$')

    expect(html).toContain('katex-block')
    expect(html).toContain('katex')
  })
})
