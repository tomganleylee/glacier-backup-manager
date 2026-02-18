'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Bot, Send, BarChart3, Loader2, Sparkles } from 'lucide-react';

interface UsageInfo {
  model: string;
  model_display: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  usage?: UsageInfo;
}

interface UsageStats {
  configured_model: string;
  configured_model_display: string;
  all_time: { messages: number; input_tokens: number; output_tokens: number; total_cost: number };
  today: { messages: number; input_tokens: number; output_tokens: number; total_cost: number };
  week: { messages: number; input_tokens: number; output_tokens: number; total_cost: number };
  by_model: { model: string; model_display: string; messages: number; input_tokens: number; output_tokens: number; total_cost: number }[];
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionCost, setSessionCost] = useState(0);
  const [sessionTokens, setSessionTokens] = useState({ input: 0, output: 0 });
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [showStats, setShowStats] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    fetch('/api/assistant')
      .then(res => res.json())
      .then(data => { if (!data.error) setUsageStats(data); })
      .catch(() => {});
  }, []);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setError('');

    const newMessages: Message[] = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          history: messages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        const usage: UsageInfo | undefined = data.usage;
        setMessages([...newMessages, { role: 'assistant', content: data.content, usage }]);
        if (usage) {
          setSessionCost(prev => prev + usage.cost_usd);
          setSessionTokens(prev => ({
            input: prev.input + usage.input_tokens,
            output: prev.output + usage.output_tokens,
          }));
        }
        fetch('/api/assistant')
          .then(res => res.json())
          .then(stats => { if (!stats.error) setUsageStats(stats); })
          .catch(() => {});
      }
    } catch {
      setError('Failed to connect to assistant.');
    } finally {
      setLoading(false);
    }
  }

  const suggestions = [
    "What's in the root of my NAS?",
    "Which rare shows don't have backup enabled?",
    'How much is Glacier costing me per month?',
    'Show me any failed backup items',
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">AI Assistant</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Ask about your backup status, get recommendations, or troubleshoot issues</p>
        </div>
        <div className="flex items-center gap-2">
          {sessionCost > 0 && (
            <div className="badge text-xs" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              {formatCost(sessionCost)} ({formatTokens(sessionTokens.input + sessionTokens.output)} tokens)
            </div>
          )}
          <button
            onClick={() => setShowStats(!showStats)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-[var(--radius-sm)] transition-all"
            style={{ background: showStats ? 'var(--accent-dim)' : 'var(--bg-elevated)', border: '1px solid var(--border)', color: showStats ? 'var(--accent)' : 'var(--text-muted)' }}
          >
            <BarChart3 size={12} /> {showStats ? 'Hide' : 'Usage'} Stats
          </button>
        </div>
      </div>

      {/* Usage stats panel */}
      {showStats && usageStats && (
        <div className="mb-4 card p-4 text-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">AI Usage & Costs</h3>
            <span className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>Model: {usageStats.configured_model_display}</span>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {[
              { label: 'Today', data: usageStats.today },
              { label: 'This Week', data: usageStats.week },
              { label: 'All Time', data: usageStats.all_time },
            ].map(period => (
              <div key={period.label} className="p-3 rounded-[var(--radius-sm)]" style={{ background: 'var(--bg-elevated)' }}>
                <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>{period.label}</div>
                <div className="text-lg font-bold" style={{ color: 'var(--text)' }}>{formatCost(period.data.total_cost)}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{period.data.messages} msgs &middot; {formatTokens(period.data.input_tokens + period.data.output_tokens)} tokens</div>
              </div>
            ))}
          </div>
          {usageStats.by_model.length > 0 && (
            <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
              {usageStats.by_model.map((m, i) => (
                <span key={m.model}>{i > 0 && ' · '}{m.model_display}: {m.messages} msgs ({formatCost(m.total_cost)})</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded-[var(--radius-sm)] text-sm" style={{ background: 'color-mix(in srgb, var(--error) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--error) 25%, transparent)', color: 'var(--error)' }}>
          {error}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-auto card p-4 mb-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-16">
            <div className="w-12 h-12 rounded-[var(--radius)] mx-auto mb-4 flex items-center justify-center" style={{ background: 'var(--accent-dim)' }}>
              <Sparkles size={24} style={{ color: 'var(--accent)' }} />
            </div>
            <p className="text-base mb-1 font-medium">No messages yet</p>
            <p className="text-sm mb-6" style={{ color: 'var(--text-dim)' }}>Try asking:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg mx-auto">
              {suggestions.map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => setInput(suggestion)}
                  className="px-4 py-2.5 rounded-[var(--radius-sm)] text-sm text-left transition-all"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                  onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = 'var(--accent)'; (e.target as HTMLElement).style.color = 'var(--accent)'; }}
                  onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'var(--border)'; (e.target as HTMLElement).style.color = 'var(--text-secondary)'; }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[80%]">
              <div className="flex items-start gap-2.5">
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-[var(--radius-xs)] flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'var(--accent-dim)' }}>
                    <Bot size={14} style={{ color: 'var(--accent)' }} />
                  </div>
                )}
                <div
                  className="rounded-[var(--radius)] px-4 py-3 text-sm"
                  style={{
                    background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: msg.role === 'user' ? 'var(--bg)' : 'var(--text-secondary)',
                  }}
                >
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-pre:border" style={{ '--tw-prose-pre-bg': 'var(--bg)', '--tw-prose-pre-border': 'var(--border)' } as React.CSSProperties}>
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
              </div>
              {msg.usage && (
                <div className="mt-1 text-[10px] flex items-center gap-2 px-1" style={{ color: 'var(--text-dim)', marginLeft: msg.role === 'assistant' ? '2.375rem' : undefined }}>
                  <span>{msg.usage.model_display}</span>
                  <span>&middot;</span>
                  <span>{formatTokens(msg.usage.input_tokens)} in / {formatTokens(msg.usage.output_tokens)} out</span>
                  <span>&middot;</span>
                  <span>{formatCost(msg.usage.cost_usd)}</span>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-[var(--radius-xs)] flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-dim)' }}>
                <Bot size={14} style={{ color: 'var(--accent)' }} />
              </div>
              <div className="rounded-[var(--radius)] px-4 py-3 text-sm flex items-center gap-2" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                <Loader2 size={14} className="animate-spin" /> Thinking...
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="flex gap-3">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about your backups..."
          className="flex-1 input-field px-4 py-3 text-sm rounded-[var(--radius)]"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-5 py-3 rounded-[var(--radius)] font-medium text-sm transition-all flex items-center gap-2"
          style={{
            background: loading || !input.trim() ? 'var(--bg-elevated)' : 'var(--accent)',
            color: loading || !input.trim() ? 'var(--text-dim)' : 'var(--bg)',
          }}
        >
          <Send size={16} /> Send
        </button>
      </form>
    </div>
  );
}
