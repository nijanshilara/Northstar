import React from 'react'
import {
  parseInlineTokens,
  parseMarkdownBlocks,
  type InlineToken,
} from '../utils/markdownUtils'

interface SafeMarkdownProps {
  content: string
  className?: string
}

/**
 * Renders parsed inline markdown tokens safely into React nodes.
 */
export function renderInlineTokens(tokens: InlineToken[]): React.ReactNode[] {
  return tokens.map((token, idx) => {
    switch (token.type) {
      case 'bold-italic':
        return (
          <strong key={idx} className="font-semibold text-inherit">
            <em className="italic">{token.content}</em>
          </strong>
        )
      case 'bold':
        return (
          <strong key={idx} className="font-semibold text-inherit">
            {token.content}
          </strong>
        )
      case 'italic':
        return (
          <em key={idx} className="italic text-inherit">
            {token.content}
          </em>
        )
      case 'code':
        return (
          <code
            key={idx}
            className="px-1.5 py-0.5 rounded text-[11px] font-mono bg-black/10 dark:bg-white/10 text-inherit"
          >
            {token.content}
          </code>
        )
      case 'link':
      case 'auto-url':
        return (
          <a
            key={idx}
            href={token.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-medium hover:opacity-80 inline-flex items-center gap-0.5 text-inherit"
          >
            {token.content}
            <span className="text-[10px] ml-0.5 opacity-70">↗</span>
          </a>
        )
      case 'text':
      default:
        return token.content
    }
  })
}

/**
 * SafeMarkdown renders multi-line Markdown text securely into React nodes.
 * Supports headings, bullet lists, numbered lists, dividers, links, code, and bold text.
 */
export default function SafeMarkdown({ content, className = '' }: SafeMarkdownProps) {
  if (!content) return null

  const blocks = parseMarkdownBlocks(content)

  return (
    <div className={`markdown-body space-y-1.5 ${className}`}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'hr':
            return (
              <hr
                key={`hr-${idx}`}
                className="my-3 border-t border-slate-200 dark:border-slate-700/60 opacity-60"
              />
            )
          case 'h2':
            return (
              <h2 key={`h2-${idx}`} className="text-base font-bold mt-3 mb-1.5 text-inherit">
                {renderInlineTokens(parseInlineTokens(block.text || ''))}
              </h2>
            )
          case 'h3':
            return (
              <h3 key={`h3-${idx}`} className="text-sm font-bold mt-2.5 mb-1 text-inherit">
                {renderInlineTokens(parseInlineTokens(block.text || ''))}
              </h3>
            )
          case 'h4':
            return (
              <h4 key={`h4-${idx}`} className="text-xs font-bold uppercase tracking-wider mt-2 mb-1 opacity-90">
                {renderInlineTokens(parseInlineTokens(block.text || ''))}
              </h4>
            )
          case 'ul':
            return (
              <ul key={`ul-${idx}`} className="space-y-1 my-1.5 pl-1">
                {(block.items || []).map((it, itemIdx) => (
                  <li
                    key={itemIdx}
                    className={`flex items-start gap-2 leading-relaxed ${it.indent > 0 ? 'ml-4' : ''}`}
                  >
                    <span className="opacity-60 select-none text-[10px] mt-1.5">•</span>
                    <span className="flex-1">
                      {renderInlineTokens(parseInlineTokens(it.text))}
                    </span>
                  </li>
                ))}
              </ul>
            )
          case 'ol':
            return (
              <ol key={`ol-${idx}`} className="list-decimal pl-5 space-y-1 my-1.5">
                {(block.items || []).map((it, itemIdx) => (
                  <li key={itemIdx} className="leading-relaxed">
                    {renderInlineTokens(parseInlineTokens(it.text))}
                  </li>
                ))}
              </ol>
            )
          case 'p':
          default:
            return (
              <p key={`p-${idx}`} className="leading-relaxed my-1">
                {renderInlineTokens(parseInlineTokens(block.text || ''))}
              </p>
            )
        }
      })}
    </div>
  )
}
