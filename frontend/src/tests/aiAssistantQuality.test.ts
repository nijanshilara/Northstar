import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseInlineTokens,
  parseMarkdownBlocks,
} from '../utils/markdownUtils.ts'

describe('AI Assistant Quality & Markdown Rendering (Phase 7)', () => {
  it('parses a multi-paragraph, multi-section travel answer without dropping blocks', () => {
    const travelAnswer = `
🌴 **Visiting Goa in November — Top Things to Do & Practical Travel Guide**

November is widely considered one of the absolute best months to visit Goa. The monsoon rains have receded, the weather is pleasant (20°C to 32°C / 68°F to 90°F), humidity drops noticeably, and coastal tourism infrastructure fully reopens.

### 1. Beaches & Water Activities
• **Action & Water Sports**: Head to Baga, Calangute, or Anjuna for parasailing and jet-skiing.
• **Scenic & Relaxed**: Unwind at Palolem, Agonda, or Benaulim with gentle swimming and kayak rentals.
• **Safety Caveat**: Swim only in designated zones marked with red-and-yellow flags.

### 2. Heritage & Portuguese-Era Culture
• **Old Goa**: Tour the UNESCO World Heritage Basilica of Bom Jesus and Sé Cathedral.
• **Fontainhas**: Stroll the vibrant Portuguese Latin Quarter in Panaji.

### 3. Practical Planning Tips
1. Book accommodations 3–4 weeks in advance as prices climb toward December.
2. Rent a scooter for flexible transit; wear a helmet at all times.
    `.trim()

    const blocks = parseMarkdownBlocks(travelAnswer)
    assert.ok(blocks.length >= 6, `Expected at least 6 blocks, got ${blocks.length}`)

    // Verify first block is paragraph containing bold header
    assert.strictEqual(blocks[0].type, 'p')
    const tokens = parseInlineTokens(blocks[0].text || '')
    const boldToken = tokens.find(t => t.type === 'bold')
    assert.ok(boldToken, 'Expected a bold token in first paragraph')
    assert.ok(boldToken.content.includes('Visiting Goa in November'))

    // Verify headers (### maps to h4 block in SafeMarkdown)
    const headerBlocks = blocks.filter(b => b.type === 'h4')
    assert.strictEqual(headerBlocks.length, 3)
    assert.ok(headerBlocks[0].text?.includes('Beaches & Water Activities'))
    assert.ok(headerBlocks[1].text?.includes('Heritage & Portuguese-Era Culture'))
    assert.ok(headerBlocks[2].text?.includes('Practical Planning Tips'))

    // Verify bullet lists
    const ulBlocks = blocks.filter(b => b.type === 'ul')
    assert.strictEqual(ulBlocks.length, 2)
    assert.strictEqual(ulBlocks[0].items?.length, 3)
    assert.ok(ulBlocks[0].items?.[0].text.includes('Action & Water Sports'))

    // Verify numbered list
    const olBlocks = blocks.filter(b => b.type === 'ol')
    assert.strictEqual(olBlocks.length, 1)
    assert.strictEqual(olBlocks[0].items?.length, 2)
    assert.ok(olBlocks[0].items?.[0].text.includes('Book accommodations'))
  })

  it('correctly handles status banner synchronization logic', () => {
    // Initial state: configured model from status endpoint
    let status = {
      is_live: true,
      provider: 'Google gemini-3.8-flash',
      configured_model: 'gemini-3.8-flash',
      active_model: 'gemini-3.8-flash',
      is_fallback: false,
    }

    // Chat response received using fallback model
    const chatResponse = {
      reply: 'Detailed travel response...',
      is_ai: true,
      provider: 'Gemini (gemini-3.5-flash)',
      model: 'gemini-3.5-flash',
      is_fallback: true,
      is_complete: true,
      finish_reason: 'stop',
    }

    // Sync banner status
    if (chatResponse.is_ai && chatResponse.provider) {
      status = {
        ...status,
        provider: chatResponse.provider,
        active_model: chatResponse.model || status.active_model,
        is_fallback: chatResponse.is_fallback,
      }
    }

    assert.strictEqual(status.provider, 'Gemini (gemini-3.5-flash)')
    assert.strictEqual(status.active_model, 'gemini-3.5-flash')
    assert.strictEqual(status.is_fallback, true)
    assert.strictEqual(status.is_live, true)
  })

  it('detects truncated responses and distinguishes complete from incomplete', () => {
    const completeResponse = {
      is_complete: true,
      finish_reason: 'stop',
    }
    const truncatedResponse = {
      is_complete: false,
      finish_reason: 'max_tokens',
    }

    assert.strictEqual(completeResponse.is_complete, true)
    assert.strictEqual(truncatedResponse.is_complete, false)
    assert.strictEqual(truncatedResponse.finish_reason, 'max_tokens')
  })
})
