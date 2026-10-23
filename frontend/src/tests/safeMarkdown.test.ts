import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeMarkdown,
  parseInlineTokens,
  parseMarkdownBlocks,
} from '../utils/markdownUtils.ts'

describe('Markdown Parsing, Formatting and Sanitization', () => {
  it('correctly unescapes and formats escaped bold (\\*\\*text\\*\\*)', () => {
    const raw = '\\*\\*Monsoon Trek Checklist\\*\\*'
    const normalized = normalizeMarkdown(raw)
    assert.strictEqual(normalized, '**Monsoon Trek Checklist**')

    const tokens = parseInlineTokens(raw)
    assert.strictEqual(tokens.length, 1)
    assert.strictEqual(tokens[0].type, 'bold')
    assert.strictEqual(tokens[0].content, 'Monsoon Trek Checklist')
  })

  it('correctly parses standard markdown bold (**text**)', () => {
    const raw = 'Please bring **waterproof boots** on the trail.'
    const tokens = parseInlineTokens(raw)
    assert.strictEqual(tokens.length, 3)
    assert.strictEqual(tokens[0].type, 'text')
    assert.strictEqual(tokens[0].content, 'Please bring ')
    assert.strictEqual(tokens[1].type, 'bold')
    assert.strictEqual(tokens[1].content, 'waterproof boots')
    assert.strictEqual(tokens[2].type, 'text')
    assert.strictEqual(tokens[2].content, ' on the trail.')
  })

  it('correctly parses markdown links [Anchor](https://...) safely', () => {
    const raw = 'Get your key at [AI Studio](https://aistudio.google.com/app/apikey) today.'
    const tokens = parseInlineTokens(raw)
    assert.strictEqual(tokens.length, 3)
    assert.strictEqual(tokens[0].content, 'Get your key at ')
    assert.strictEqual(tokens[1].type, 'link')
    assert.strictEqual(tokens[1].content, 'AI Studio')
    assert.strictEqual(tokens[1].href, 'https://aistudio.google.com/app/apikey')
  })

  it('does NOT create executable links for javascript: or unsafe schemes', () => {
    const raw = 'Check this [bad link](javascript:alert(1))'
    const tokens = parseInlineTokens(raw)
    // Must not be treated as a valid link token
    for (const t of tokens) {
      assert.notStrictEqual(t.type, 'link')
      assert.notStrictEqual(t.href, 'javascript:alert(1)')
    }
  })

  it('correctly formats inline code (`variable_name`)', () => {
    const raw = 'Set `GEMINI_API_KEY` in your `.env` file.'
    const tokens = parseInlineTokens(raw)
    assert.strictEqual(tokens[1].type, 'code')
    assert.strictEqual(tokens[1].content, 'GEMINI_API_KEY')
  })

  it('correctly autolinks raw https URLs', () => {
    const raw = 'Visit https://aistudio.google.com for free keys.'
    const tokens = parseInlineTokens(raw)
    assert.strictEqual(tokens.length, 3)
    assert.strictEqual(tokens[1].type, 'auto-url')
    assert.strictEqual(tokens[1].href, 'https://aistudio.google.com')
  })

  it('correctly parses multi-line blocks into headers, lists, dividers, and paragraphs', () => {
    const content = [
      '# Travel Guide',
      'Here is the intro text.',
      '──────────',
      '• **Clothing**: Breathable cottons',
      '• **Footwear**: Sturdy shoes',
      '1. Step one',
      '2. Step two',
    ].join('\n')

    const blocks = parseMarkdownBlocks(content)
    assert.strictEqual(blocks[0].type, 'h2')
    assert.strictEqual(blocks[0].text, 'Travel Guide')

    assert.strictEqual(blocks[1].type, 'p')
    assert.strictEqual(blocks[1].text, 'Here is the intro text.')

    assert.strictEqual(blocks[2].type, 'hr')

    assert.strictEqual(blocks[3].type, 'ul')
    assert.strictEqual(blocks[3].items?.length, 2)
    assert.strictEqual(blocks[3].items?.[0].text, '**Clothing**: Breathable cottons')

    assert.strictEqual(blocks[4].type, 'ol')
    assert.strictEqual(blocks[4].items?.length, 2)
    assert.strictEqual(blocks[4].items?.[0].text, 'Step one')
  })
})
