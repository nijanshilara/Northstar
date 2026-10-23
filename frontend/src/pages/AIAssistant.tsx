import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Sparkles, AlertCircle, Info, Loader2 } from 'lucide-react'
import SafeMarkdown from '../components/SafeMarkdown'
import { API_BASE } from '../services/api'

interface Message {
  id: number
  role: 'user' | 'assistant'
  text: string
  isAi: boolean
  provider: string
  model?: string
  isFallback?: boolean
  isComplete?: boolean
  finishReason?: string
  error?: string | null
  timestamp: Date
}

interface AIStatus {
  is_live: boolean
  provider: string
  message: string
  configured_model?: string
  active_model?: string
  is_fallback?: boolean
}

let nextId = 1

const STARTER_PROMPTS = [
  'What are the best things to do in Goa in November?',
  'Give me a 3-day budget itinerary for Paris.',
  'What should I pack for a beach trip to Bali?',
  'Compare Tokyo and Kyoto for a first-time visitor.',
  'What is the best time to visit Rajasthan?',
  'Suggest family-friendly activities in Singapore.',
]

export default function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<AIStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Fetch AI status on mount
  useEffect(() => {
    fetch(`${API_BASE}/ai/status`)
      .then(r => r.json())
      .then((d: AIStatus) => setStatus(d))
      .catch(() => setStatus({ is_live: false, provider: 'Unknown', message: 'Could not reach server.' }))
      .finally(() => setStatusLoading(false))
  }, [])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return
    const userMsg: Message = {
      id: nextId++,
      role: 'user',
      text: text.trim(),
      isAi: false,
      provider: 'You',
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch(`${API_BASE}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim() }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      const assistantMsg: Message = {
        id: nextId++,
        role: 'assistant',
        text: data.reply,
        isAi: data.is_ai,
        provider: data.provider,
        model: data.model,
        isFallback: data.is_fallback,
        isComplete: data.is_complete ?? true,
        finishReason: data.finish_reason ?? 'stop',
        error: data.error,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, assistantMsg])

      // Keep banner status truthfully synchronized with actual provider & model used
      if (data.is_ai && data.provider) {
        setStatus(prev => ({
          is_live: true,
          provider: data.provider,
          message: `AI powered by ${data.provider}.`,
          configured_model: prev?.configured_model || '',
          active_model: data.model || prev?.active_model || '',
          is_fallback: data.is_fallback ?? false,
        }))
      } else if (!data.is_ai) {
        setStatus(prev => ({
          is_live: false,
          provider: data.provider || 'Offline Travel Guide Mode',
          message: 'Offline Travel Guide Mode',
          configured_model: prev?.configured_model || '',
          active_model: 'offline-curated',
          is_fallback: false,
        }))
      }
    } catch (e: unknown) {
      const errMsg: Message = {
        id: nextId++,
        role: 'assistant',
        text: `❌ Failed to get a response: ${e instanceof Error ? e.message : 'Unknown error'}`,
        isAi: false,
        provider: 'Error',
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 'calc(100vh - 8rem)' }}>
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
          <Sparkles size={22} style={{ color: 'var(--color-accent)' }} />
          AI Travel Assistant
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Ask me anything about destinations, itineraries, packing, budgets and more.
        </p>
      </div>

      {/* Status banner */}
      {!statusLoading && status && (
        <div
          className="flex items-start justify-between gap-3 px-4 py-3 rounded-xl mb-4 text-xs"
          style={{
            background: status.is_live ? 'var(--color-accent-light, #ecfeff)' : 'var(--color-surface-50, #f8fafc)',
            borderColor: status.is_live ? 'var(--color-accent)' : 'var(--color-border)',
            border: '1px solid',
            color: 'var(--color-text-muted)',
          }}
        >
          <div className="flex items-start gap-2.5">
            {status.is_live
              ? <Sparkles size={15} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--color-accent)' }} />
              : <Info size={15} className="flex-shrink-0 mt-0.5 text-amber-500" />
            }
            <div>
              {status.is_live ? (
                <>
                  <strong style={{ color: 'var(--color-text-primary)' }}>{status.provider}</strong>
                  <span className="ml-1 text-emerald-600 dark:text-emerald-400 font-medium">· Live Generative AI Connected</span>
                  {status.is_fallback && (
                    <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 font-medium">
                      Fallback Active
                    </span>
                  )}
                </>
              ) : (
                <>
                  <strong style={{ color: 'var(--color-text-primary)' }}>Offline Travel Guide Mode</strong>
                  <p className="mt-0.5 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                    Serving responses from our curated travel knowledge base. Add <strong>GEMINI_API_KEY</strong> in <code>backend/.env</code> to activate live Gemini AI.
                  </p>
                </>
              )}
            </div>
          </div>
          {!status.is_live && (
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 rounded-lg bg-accent-600 text-white font-medium hover:bg-accent-700 transition-colors whitespace-nowrap flex-shrink-0"
            >
              Get Free Gemini Key ↗
            </a>
          )}
        </div>
      )}

      {/* Chat area */}
      <div
        className="flex-1 overflow-y-auto rounded-xl border p-4 space-y-4 mb-4"
        style={{
          background: 'var(--color-card-bg)',
          borderColor: 'var(--color-border)',
          maxHeight: 'calc(100vh - 17rem)',
          minHeight: '380px',
        }}
      >
        {/* Empty state with starter prompts */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full py-8 space-y-4">
            <Bot size={40} style={{ color: 'var(--color-accent)', opacity: 0.7 }} />
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              Start a conversation — try one of these:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {STARTER_PROMPTS.map(p => (
                <button
                  key={p}
                  onClick={() => sendMessage(p)}
                  className="text-left px-3 py-2 rounded-lg border text-xs transition-colors hover:opacity-80"
                  style={{
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-secondary)',
                    background: 'var(--color-surface-50, transparent)',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            {/* Avatar */}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{
                background: msg.role === 'user'
                  ? 'var(--color-accent)'
                  : 'var(--color-surface-100, #f1f5f9)',
              }}
            >
              {msg.role === 'user'
                ? <User size={14} color="#fff" />
                : <Bot size={14} style={{ color: 'var(--color-accent)' }} />
              }
            </div>

            {/* Bubble */}
            <div
              className={`max-w-[85%] sm:max-w-[80%] break-words rounded-2xl px-4 py-3 text-sm ${
                msg.role === 'user' ? 'rounded-tr-sm chat-bubble-user' : 'rounded-tl-sm chat-bubble-assistant'
              }`}
              style={{
                background: msg.role === 'user'
                  ? 'var(--color-accent)'
                  : 'var(--color-card-bg)',
                color: msg.role === 'user'
                  ? '#ffffff'
                  : 'var(--color-text-primary)',
                border: msg.role !== 'user' ? '1px solid var(--color-border)' : 'none',
              }}
            >
              {msg.role === 'assistant' ? (
                <SafeMarkdown content={msg.text} />
              ) : (
                <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{msg.text}</p>
              )}

              {/* Footer: provider + timestamp + status notices */}
              <div
                className={`flex flex-wrap items-center gap-2 mt-2 text-xs ${msg.role === 'user' ? 'text-white/70' : ''}`}
                style={msg.role !== 'user' ? { color: 'var(--color-text-muted)' } : {}}
              >
                {msg.role === 'assistant' && (
                  msg.isAi
                    ? (
                      <span className="flex items-center gap-1 font-medium">
                        <Sparkles size={11} style={{ color: 'var(--color-accent)' }} />
                        {msg.provider}
                        {msg.isFallback && (
                          <span className="text-[10px] opacity-75 font-normal">(fallback)</span>
                        )}
                      </span>
                    )
                    : (
                      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                        <AlertCircle size={11} />
                        {msg.provider || 'Offline Guide'}
                      </span>
                    )
                )}

                {msg.role === 'assistant' && msg.isComplete === false && (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                    <AlertCircle size={11} />
                    Truncated
                    {!loading && (
                      <button
                        type="button"
                        onClick={() => sendMessage('Please continue your previous answer directly from where it was cut off.')}
                        className="underline ml-1 hover:opacity-80 text-accent-600 dark:text-accent-400"
                      >
                        Continue →
                      </button>
                    )}
                  </span>
                )}

                <span>{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="flex gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--color-surface-100, #f1f5f9)' }}
            >
              <Bot size={14} style={{ color: 'var(--color-accent)' }} />
            </div>
            <div
              className="flex items-center gap-2 px-4 py-3 rounded-2xl rounded-tl-sm text-sm"
              style={{
                background: 'var(--color-surface-50, #f8fafc)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-muted)',
              }}
            >
              <Loader2 size={14} className="animate-spin" />
              Thinking…
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2 items-end">
        <textarea
          ref={inputRef}
          rows={2}
          className="flex-1 resize-none px-4 py-2.5 rounded-xl border text-sm"
          style={{
            background: 'var(--color-card-bg)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-primary)',
          }}
          placeholder="Ask about a destination, activity, budget… (Enter to send, Shift+Enter for new line)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="p-3 rounded-xl transition-opacity disabled:opacity-40 flex-shrink-0"
          style={{ background: 'var(--color-accent)', color: '#fff' }}
          aria-label="Send message"
        >
          <Send size={18} />
        </button>
      </form>

      <p className="text-xs mt-2 text-center" style={{ color: 'var(--color-text-muted)' }}>
        AI responses may be inaccurate. Always verify prices, availability and safety information independently.
      </p>
    </div>
  )
}