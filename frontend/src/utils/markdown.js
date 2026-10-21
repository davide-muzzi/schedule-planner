import MarkdownIt from 'markdown-it'

// html: false - any raw HTML typed into notes is escaped rather than
// rendered, so v-html of the output is safe without a separate sanitizer.
// breaks: true - a single Enter is a visible line break, the way notes
// are actually written, rather than Markdown's "needs a blank line" rule.
const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

// Links in notes open in a new tab instead of navigating the app away.
const defaultLinkOpen =
  md.renderer.rules.link_open ?? ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('target', '_blank')
  tokens[idx].attrSet('rel', 'noopener noreferrer')
  return defaultLinkOpen(tokens, idx, options, env, self)
}

export function renderMarkdown(text) {
  return text ? md.render(text) : ''
}

// Plain-text version for one-line snippets (e.g. a task card's clamped
// notes preview), where rendered headings/lists would break the layout -
// keeps only the text content, one space between blocks/lines.
export function markdownToPlainText(text) {
  if (!text) return ''
  const parts = []
  for (const token of md.parse(text, {})) {
    if (token.type === 'fence' || token.type === 'code_block') {
      const code = token.content.replace(/\s+/g, ' ').trim()
      if (code) parts.push(code)
      continue
    }
    if (token.type !== 'inline') continue
    const line = (token.children ?? [])
      .map((child) => {
        if (child.type === 'text' || child.type === 'code_inline') return child.content
        if (child.type === 'softbreak' || child.type === 'hardbreak') return ' '
        if (child.type === 'image') return child.content
        return ''
      })
      .join('')
      .trim()
    if (line) parts.push(line)
  }
  return parts.join(' ')
}
