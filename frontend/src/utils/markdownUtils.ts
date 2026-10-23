/**
 * markdownUtils.ts — Pure TypeScript Markdown parser and sanitizer.
 * 
 * Safe against XSS (no arbitrary HTML injection, strict URL scheme validation).
 * Correctly handles escaped markdown (\*\* -> **, \* -> *), links, lists, headers, and code.
 */

export interface InlineToken {
  type: 'text' | 'bold' | 'italic' | 'bold-italic' | 'code' | 'link' | 'auto-url'
  content: string
  href?: string
}

export interface MarkdownBlock {
  type: 'hr' | 'p' | 'h2' | 'h3' | 'h4' | 'ul' | 'ol'
  text?: string
  items?: { text: string; indent: number }[]
}

/**
 * Normalizes newlines and unescapes backslash-escaped Markdown artifacts.
 */
export function normalizeMarkdown(rawText: string): string {
  if (!rawText) return ''
  return rawText
    .replace(/\r\n/g, '\n')
    .replace(/\\\*\\\*/g, '**')
    .replace(/\\\*/g, '*')
    .replace(/\\_/g, '_')
    .replace(/\\`/g, '`')
}

/**
 * Safely parse inline text into structured tokens.
 */
export function parseInlineTokens(rawText: string): InlineToken[] {
  if (!rawText) return []

  const text = normalizeMarkdown(rawText)
  const tokenRegex = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>")]+)/g

  const tokens: InlineToken[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = tokenRegex.exec(text)) !== null) {
    const rawMatch = match[0]
    const matchIndex = match.index

    if (matchIndex > lastIndex) {
      tokens.push({
        type: 'text',
        content: text.slice(lastIndex, matchIndex),
      })
    }

    if (rawMatch.startsWith('***') && rawMatch.endsWith('***') && rawMatch.length > 6) {
      tokens.push({
        type: 'bold-italic',
        content: rawMatch.slice(3, -3),
      })
    } else if (rawMatch.startsWith('**') && rawMatch.endsWith('**') && rawMatch.length > 4) {
      tokens.push({
        type: 'bold',
        content: rawMatch.slice(2, -2),
      })
    } else if (rawMatch.startsWith('*') && rawMatch.endsWith('*') && rawMatch.length > 2) {
      tokens.push({
        type: 'italic',
        content: rawMatch.slice(1, -1),
      })
    } else if (rawMatch.startsWith('`') && rawMatch.endsWith('`') && rawMatch.length > 2) {
      tokens.push({
        type: 'code',
        content: rawMatch.slice(1, -1),
      })
    } else if (rawMatch.startsWith('[') && rawMatch.includes('](')) {
      const linkMatch = rawMatch.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/)
      if (linkMatch) {
        tokens.push({
          type: 'link',
          content: linkMatch[1],
          href: linkMatch[2],
        })
      } else {
        tokens.push({
          type: 'text',
          content: rawMatch,
        })
      }
    } else if (rawMatch.startsWith('http://') || rawMatch.startsWith('https://')) {
      tokens.push({
        type: 'auto-url',
        content: rawMatch,
        href: rawMatch,
      })
    } else {
      tokens.push({
        type: 'text',
        content: rawMatch,
      })
    }

    lastIndex = tokenRegex.lastIndex
  }

  if (lastIndex < text.length) {
    tokens.push({
      type: 'text',
      content: text.slice(lastIndex),
    })
  }

  return tokens
}

/**
 * Parses multi-line markdown text into block elements.
 */
export function parseMarkdownBlocks(rawText: string): MarkdownBlock[] {
  if (!rawText) return []

  const normalized = normalizeMarkdown(rawText)
  const lines = normalized.split('\n')
  const blocks: MarkdownBlock[] = []
  let currentList: { type: 'ul' | 'ol'; items: { text: string; indent: number }[] } | null = null

  const flushList = () => {
    if (!currentList) return
    blocks.push({
      type: currentList.type,
      items: [...currentList.items],
    })
    currentList = null
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()

    // Divider
    if (
      trimmed === '---' ||
      trimmed === '***' ||
      trimmed === '===' ||
      trimmed.startsWith('────────') ||
      trimmed.startsWith('--------')
    ) {
      flushList()
      blocks.push({ type: 'hr' })
      continue
    }

    // Blank line
    if (!trimmed) {
      flushList()
      continue
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      flushList()
      blocks.push({ type: 'h4', text: trimmed.slice(4) })
      continue
    }
    if (trimmed.startsWith('## ')) {
      flushList()
      blocks.push({ type: 'h3', text: trimmed.slice(3) })
      continue
    }
    if (trimmed.startsWith('# ')) {
      flushList()
      blocks.push({ type: 'h2', text: trimmed.slice(2) })
      continue
    }

    // Bullet list: •, -, * (must be followed by space)
    const bulletMatch = rawLine.match(/^(\s*)([•\-\*])\s+(.*)$/)
    if (bulletMatch) {
      const indent = bulletMatch[1].length
      const itemText = bulletMatch[3]
      if (!currentList || currentList.type !== 'ul') {
        flushList()
        currentList = { type: 'ul', items: [] }
      }
      currentList.items.push({ text: itemText, indent })
      continue
    }

    // Numbered list: 1. 2. etc
    const numMatch = rawLine.match(/^(\s*)(\d+)[\.\)]\s+(.*)$/)
    if (numMatch) {
      const indent = numMatch[1].length
      const itemText = numMatch[3]
      if (!currentList || currentList.type !== 'ol') {
        flushList()
        currentList = { type: 'ol', items: [] }
      }
      currentList.items.push({ text: itemText, indent })
      continue
    }

    // Paragraph
    flushList()
    blocks.push({ type: 'p', text: trimmed })
  }

  flushList()
  return blocks
}
