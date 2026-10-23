import React, { useState, useEffect, useRef } from 'react'
import {
  X, Send, Sparkles, Bot, User,
  AlertCircle, Minimize2, Trash2, ArrowRight
} from 'lucide-react'
import SafeMarkdown from './SafeMarkdown'
import { API_BASE } from '../services/api'

interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  text: string
  isAi?: boolean
  provider?: string
  timestamp: Date
}

interface AiStatus {
  is_live: boolean
  provider: string
  model: string
  notes?: string
}

const STARTER_PROMPTS = [
  '🌴 3-day weekend plan for Goa',
  '💰 Budget travel tips for Japan',
  '🎒 What to pack for a monsoon trek?',
  '🍕 Best street food in Mumbai',
]

let msgId = 1

export default function FloatingChatbot() {
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: msgId++,
      role: 'assistant',
      text: '👋 Hi there! I am Northstar Assistant, your AI travel companion. Ask me anything about destinations, itineraries, budgets, packing lists, or local travel tips.',
      isAi: false,
      provider: 'Assistant',
      timestamp: new Date(),
    },
  ])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Fetch AI provider status once
  useEffect(() => {
    fetch(`${API_BASE}/ai/status`)
      .then(res => res.json())
      .then(data => setStatus(data))
      .catch(() => {
        setStatus({
          is_live: false,
          provider: 'Offline / Fallback',
          model: 'rule-based',
        })
      })
  }, [])

  // Auto-scroll on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [isOpen])

  const handleSendMessage = async (userText: string) => {
    const trimmed = userText.trim()
    if (!trimmed || loading) return

    const userMsg: ChatMessage = {
      id: msgId++,
      role: 'user',
      text: trimmed,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch(`${API_BASE}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      })

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`)
      }

      const data = await res.json()
      const assistantMsg: ChatMessage = {
        id: msgId++,
        role: 'assistant',
        text: data.reply,
        isAi: data.is_ai,
        provider: data.provider,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, assistantMsg])

      if (data.is_ai && data.provider) {
        setStatus(prev => ({
          is_live: true,
          provider: data.provider,
          model: data.model || prev?.model || '',
        }))
      } else if (!data.is_ai) {
        setStatus({
          is_live: false,
          provider: data.provider || 'Offline Guide Mode',
          model: 'offline-curated',
        })
      }
    } catch (err: unknown) {
      const errMsg: ChatMessage = {
        id: msgId++,
        role: 'assistant',
        text: `⚠️ Could not reach the assistant: ${err instanceof Error ? err.message : 'Connection failed'}. Please check your network or try again.`,
        isAi: false,
        provider: 'Error',
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage(input)
    }
  }

  const handleClearChat = () => {
    setMessages([
      {
        id: msgId++,
        role: 'assistant',
        text: 'Chat cleared. How can I help you plan your journey?',
        isAi: false,
        provider: 'Assistant',
        timestamp: new Date(),
      },
    ])
  }

  return (
    <>
      {/* ── Floating Launcher Button ── */}
      {!isOpen && (
        <button
          id="floating-ai-btn"
          aria-label="Open AI Travel Assistant chat"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 px-4 py-3 rounded-full shadow-2xl transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
          style={{
            background: 'var(--color-accent, #0d9488)',
            color: '#ffffff',
            boxShadow: '0 8px 30px rgba(13, 148, 136, 0.35)',
          }}
        >
          <Sparkles size={18} className="animate-pulse" />
          <span className="text-sm font-semibold tracking-wide">Ask AI</span>
          {status?.is_live && (
            <span className="w-2 h-2 rounded-full bg-emerald-300 animate-ping" />
          )}
        </button>
      )}

      {/* ── Chat Panel ── */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="AI Travel Assistant chat panel"
          className="fixed bottom-6 right-6 z-50 flex flex-col rounded-2xl shadow-2xl border overflow-hidden transition-all duration-200 animate-in fade-in slide-in-from-bottom-4"
          style={{
            width: '380px',
            maxWidth: 'calc(100vw - 2rem)',
            height: '520px',
            maxHeight: 'calc(100vh - 5rem)',
            background: 'var(--color-card-bg, #ffffff)',
            borderColor: 'var(--color-border, #e2e8f0)',
            boxShadow: '0 20px 40px -8px rgba(0,0,0,0.25)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3.5 border-b select-none"
            style={{
              background: 'var(--color-surface-50, #f8fafc)',
              borderColor: 'var(--color-border, #e2e8f0)',
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--color-accent, #0d9488)', color: '#fff' }}
              >
                <Sparkles size={16} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold truncate leading-tight" style={{ color: 'var(--color-text-primary)' }}>
                  Travel Assistant
                </h3>
                <div className="flex items-center gap-1.5 text-[11px] truncate">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: status?.is_live ? '#10b981' : '#f59e0b' }}
                  />
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    {status?.is_live ? `${status.provider}` : 'Offline Guide Mode'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleClearChat}
                title="Clear chat"
                className="p-1.5 rounded-lg opacity-70 hover:opacity-100 transition-opacity"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <Trash2 size={15} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Minimize chat"
                className="p-1.5 rounded-lg opacity-70 hover:opacity-100 transition-opacity"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <Minimize2 size={15} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Close chat"
                className="p-1.5 rounded-lg opacity-70 hover:opacity-100 transition-opacity"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Conversation Messages */}
          <div
            className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs sm:text-sm"
            style={{ background: 'var(--color-body-bg, #f8fafc)' }}
          >
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar */}
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{
                    background: msg.role === 'user' ? 'var(--color-accent)' : 'var(--color-surface-100)',
                    color: msg.role === 'user' ? '#fff' : 'var(--color-accent)',
                  }}
                >
                  {msg.role === 'user' ? <User size={13} /> : <Bot size={13} />}
                </div>

                {/* Bubble */}
                <div
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 ${
                    msg.role === 'user' ? 'rounded-tr-xs chat-bubble-user' : 'rounded-tl-xs chat-bubble-assistant'
                  }`}
                  style={{
                    background: msg.role === 'user' ? 'var(--color-accent)' : 'var(--color-card-bg)',
                    color: msg.role === 'user' ? '#ffffff' : 'var(--color-text-primary)',
                    border: msg.role !== 'user' ? '1px solid var(--color-border)' : 'none',
                    lineHeight: 1.5,
                  }}
                >
                  {msg.role === 'assistant' ? (
                    <SafeMarkdown content={msg.text} />
                  ) : (
                    <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.text}</p>
                  )}
                  <div
                    className="flex items-center justify-between gap-2 mt-1.5 text-[10px]"
                    style={{ color: msg.role === 'user' ? 'rgba(255,255,255,0.75)' : 'var(--color-text-muted)' }}
                  >
                    {msg.role === 'assistant' && (
                      <span className="flex items-center gap-1 font-medium">
                        {msg.isAi ? (
                          <>
                            <Sparkles size={9} style={{ color: 'var(--color-accent)' }} />
                            {msg.provider}
                          </>
                        ) : (
                          <>
                            <AlertCircle size={9} className="text-amber-500" />
                            Guide Advice
                          </>
                        )}
                      </span>
                    )}
                    <span>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {/* Starter prompts when only initial welcome message is present */}
            {messages.length === 1 && (
              <div className="pt-2 space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                  Try asking:
                </p>
                <div className="grid grid-cols-1 gap-1.5">
                  {STARTER_PROMPTS.map(p => (
                    <button
                      key={p}
                      onClick={() => handleSendMessage(p)}
                      className="text-left px-3 py-2 rounded-xl border text-xs transition-all hover:translate-x-0.5 active:scale-98"
                      style={{
                        background: 'var(--color-card-bg)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Loading Indicator */}
            {loading && (
              <div className="flex gap-2.5">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--color-surface-100)', color: 'var(--color-accent)' }}
                >
                  <Bot size={13} />
                </div>
                <div
                  className="rounded-2xl rounded-tl-xs px-3.5 py-2.5 border chat-bubble-assistant"
                  style={{
                    background: 'var(--color-card-bg)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  <div className="flex items-center gap-1.5 py-1">
                    <span className="w-2 h-2 rounded-full bg-teal-500 animate-bounce" />
                    <span className="w-2 h-2 rounded-full bg-teal-500 animate-bounce [animation-delay:0.2s]" />
                    <span className="w-2 h-2 rounded-full bg-teal-500 animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input */}
          <div
            className="p-3 border-t"
            style={{
              background: 'var(--color-card-bg)',
              borderColor: 'var(--color-border)',
            }}
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask travel question… (Enter to send)"
                className="flex-1 resize-none px-3 py-2 text-xs sm:text-sm rounded-xl border outline-none transition-colors"
                style={{
                  background: 'var(--color-surface-50, #f8fafc)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                  maxHeight: '90px',
                }}
              />
              <button
                onClick={() => handleSendMessage(input)}
                disabled={!input.trim() || loading}
                title="Send message"
                className="p-2.5 rounded-xl text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-105 active:scale-95 flex-shrink-0"
                style={{ background: 'var(--color-accent, #0d9488)' }}
              >
                <Send size={15} />
              </button>
            </div>
            <div className="flex justify-between items-center mt-1.5 px-1 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              <span>Shift+Enter for new line</span>
              <a
                href="/ai-assistant"
                className="hover:underline flex items-center gap-0.5"
                style={{ color: 'var(--color-accent)' }}
              >
                Full Assistant page <ArrowRight size={10} />
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
