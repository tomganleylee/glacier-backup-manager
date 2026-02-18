'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

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

  // Load usage stats on mount
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
        // Refresh stats
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

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Assistant</h1>
          <p className="text-gray-500 text-sm">Ask about your backup status, get recommendations, or troubleshoot issues</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Session cost badge */}
          {sessionCost > 0 && (
            <div className="text-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-300">
              Session: {formatCost(sessionCost)} ({formatTokens(sessionTokens.input + sessionTokens.output)} tokens)
            </div>
          )}
          {/* Stats toggle */}
          <button
            onClick={() => setShowStats(!showStats)}
            className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-400 transition-colors"
          >
            {showStats ? 'Hide' : 'Usage'} Stats
          </button>
        </div>
      </div>

      {/* Usage stats panel */}
      {showStats && usageStats && (
        <div className="mb-4 bg-gray-900 border border-gray-800 rounded-xl p-4 text-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-200">AI Usage & Costs</h3>
            <span className="text-xs text-gray-500">Model: {usageStats.configured_model_display}</span>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-3">
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-gray-500 text-xs mb-1">Today</div>
              <div className="text-lg font-bold text-white">{formatCost(usageStats.today.total_cost)}</div>
              <div className="text-xs text-gray-400">{usageStats.today.messages} messages &middot; {formatTokens(usageStats.today.input_tokens + usageStats.today.output_tokens)} tokens</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-gray-500 text-xs mb-1">This Week</div>
              <div className="text-lg font-bold text-white">{formatCost(usageStats.week.total_cost)}</div>
              <div className="text-xs text-gray-400">{usageStats.week.messages} messages &middot; {formatTokens(usageStats.week.input_tokens + usageStats.week.output_tokens)} tokens</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-gray-500 text-xs mb-1">All Time</div>
              <div className="text-lg font-bold text-white">{formatCost(usageStats.all_time.total_cost)}</div>
              <div className="text-xs text-gray-400">{usageStats.all_time.messages} messages &middot; {formatTokens(usageStats.all_time.input_tokens + usageStats.all_time.output_tokens)} tokens</div>
            </div>
          </div>
          {usageStats.by_model.length > 0 && (
            <div className="text-xs text-gray-500">
              {usageStats.by_model.map((m, i) => (
                <span key={m.model}>
                  {i > 0 && ' · '}
                  {m.model_display}: {m.messages} msgs ({formatCost(m.total_cost)})
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm bg-red-950 border border-red-800 text-red-300">
          {error}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-auto bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-600 py-12">
            <p className="text-lg mb-2">No messages yet</p>
            <p className="text-sm">Try asking:</p>
            <div className="mt-3 space-y-2">
              {[
                'What\'s in the root of my NAS?',
                'Which rare shows don\'t have backup enabled?',
                'How much is Glacier costing me per month?',
                'Show me any failed backup items',
              ].map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(suggestion); }}
                  className="block mx-auto px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className="max-w-[80%]">
              <div
                className={`rounded-xl px-4 py-3 text-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-200'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-pre:bg-gray-900 prose-pre:border prose-pre:border-gray-700">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                )}
              </div>
              {/* Per-message cost display */}
              {msg.usage && (
                <div className="mt-1 text-[10px] text-gray-600 flex items-center gap-2 px-1">
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
            <div className="bg-gray-800 rounded-xl px-4 py-3 text-sm text-gray-400">
              Thinking...
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
          className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:border-blue-500 focus:outline-none"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-600 rounded-xl font-medium text-sm transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}
