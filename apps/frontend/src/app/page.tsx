'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { SOCKET_EVENTS } from '@whatsapp-porter/shared';
import type { Group, MonitoredGroup, ChatMessage, LogEntry, ConnectionStatus, QueueStatus } from '@whatsapp-porter/shared';
import { useSocket } from '@/hooks/useSocket';
import { apiFetch } from '@/lib/api';

type Page = 'chat' | 'queue' | 'logs' | 'config' | 'jarvis';

const connColors: Record<ConnectionStatus, { color: string; label: string }> = {
  disconnected: { color: 'bg-red-500', label: 'Disconnected' },
  connecting: { color: 'bg-yellow-500', label: 'Connecting...' },
  qr_pending: { color: 'bg-yellow-500', label: 'Scan QR' },
  open: { color: 'bg-green-500', label: 'Connected' },
};

export default function App() {
  const socket = useSocket();
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('disconnected');
  const [qr, setQr] = useState<string | null>(null);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [monitored, setMonitored] = useState<MonitoredGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [destinationId, setDestinationId] = useState('');
  const [page, setPage] = useState<Page>('chat');
  const [addGroupId, setAddGroupId] = useState('');

  useEffect(() => {
    socket.emit(SOCKET_EVENTS.CONNECTION_REQUEST_STATUS);
    socket.on(SOCKET_EVENTS.CONNECTION_STATUS, (d: { status: ConnectionStatus }) => setConnStatus(d.status));
    socket.on(SOCKET_EVENTS.CONNECTION_QR, (d: { qr: string }) => setQr(d.qr));
    socket.on(SOCKET_EVENTS.GROUPS_UPDATED, (d: { groups: Group[] }) => setAllGroups(d.groups));
    socket.on(SOCKET_EVENTS.MESSAGE_NEW, (msg: ChatMessage) => {
      setMessages(prev => {
        if (msg.groupId !== selectedGroupId) return prev;
        if (prev.some(m => m.waMessageId === msg.waMessageId)) return prev;
        return [...prev, msg];
      });
    });
    return () => {
      socket.off(SOCKET_EVENTS.CONNECTION_STATUS);
      socket.off(SOCKET_EVENTS.CONNECTION_QR);
      socket.off(SOCKET_EVENTS.GROUPS_UPDATED);
      socket.off(SOCKET_EVENTS.MESSAGE_NEW);
    };
  }, [socket, selectedGroupId]);

  useEffect(() => {
    if (connStatus === 'open') {
      apiFetch<Group[]>('/api/groups').then(setAllGroups).catch(() => {});
      apiFetch<MonitoredGroup[]>('/api/monitored').then(setMonitored).catch(() => {});
      apiFetch<{ destinationGroupId?: string }>('/api/settings').then(s => {
        if (s.destinationGroupId) setDestinationId(s.destinationGroupId);
      }).catch(() => {});
    }
  }, [connStatus]);

  const selectGroup = useCallback(async (groupId: string) => {
    setSelectedGroupId(groupId);
    setPage('chat');
    try {
      const msgs = await apiFetch<ChatMessage[]>(`/api/messages/${encodeURIComponent(groupId)}`);
      setMessages(msgs);
    } catch { setMessages([]); }
  }, []);

  const addMonitoredGroup = async () => {
    if (!addGroupId) return;
    try {
      const m = await apiFetch<MonitoredGroup>('/api/monitored', {
        method: 'POST', body: JSON.stringify({ groupId: addGroupId }),
      });
      setMonitored(prev => [...prev, m]);
      setAddGroupId('');
    } catch {}
  };

  const removeMonitored = async (groupId: string) => {
    await apiFetch(`/api/monitored/${encodeURIComponent(groupId)}`, { method: 'DELETE' }).catch(() => {});
    setMonitored(prev => prev.filter(m => m.groupId !== groupId));
    if (selectedGroupId === groupId) { setSelectedGroupId(null); setMessages([]); }
  };

  const updateSavePath = async (groupId: string, savePath: string) => {
    await apiFetch(`/api/monitored/${encodeURIComponent(groupId)}`, {
      method: 'PUT', body: JSON.stringify({ savePath }),
    }).catch(() => {});
    setMonitored(prev => prev.map(m => m.groupId === groupId ? { ...m, savePath } : m));
  };

  const saveDestination = async (destId: string) => {
    setDestinationId(destId);
    await apiFetch('/api/settings', {
      method: 'PUT', body: JSON.stringify({ destinationGroupId: destId }),
    }).catch(() => {});
  };

  // QR screen
  if (connStatus !== 'open') {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center space-y-6">
          <h1 className="text-3xl font-bold">WA Porter</h1>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-800 border border-gray-700">
            <span className={`w-2.5 h-2.5 rounded-full ${connColors[connStatus].color} animate-pulse`} />
            <span className="text-sm">{connColors[connStatus].label}</span>
          </div>
          {qr ? (
            <div className="space-y-4">
              <div className="inline-block p-4 bg-white rounded-xl">
                <QRCodeSVG value={qr} size={280} level="M" />
              </div>
              <p className="text-gray-500 text-sm">Open WhatsApp &gt; Linked Devices &gt; Link a Device</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
              <p className="text-gray-500">Connecting...</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const destGroup = allGroups.find(g => g.id === destinationId);
  const unmonitoredGroups = allGroups.filter(g => !monitored.some(m => m.groupId === g.id));

  return (
    <div className="h-screen flex">
      {/* Sidebar */}
      <div className="w-80 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        {/* Header */}
        <div className="p-3 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h1 className="font-bold">WA Porter</h1>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-[11px] text-gray-400">Connected</span>
            </div>
          </div>
          <button onClick={() => setPage('config')}
            className={`p-2 rounded-lg ${page === 'config' ? 'bg-gray-700' : 'text-gray-400 hover:bg-gray-800'}`}
            title="Settings">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        {/* Nav tabs */}
        <div className="flex border-b border-gray-800">
          {([['chat', 'Chat'], ['queue', 'Queue'], ['logs', 'Logs']] as const).map(([p, label]) => (
            <button key={p} onClick={() => setPage(p)}
              className={`flex-1 py-2.5 text-xs font-semibold tracking-wider transition-colors ${
                page === p ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-500 hover:text-gray-300'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Group list */}
        <div className="flex-1 overflow-y-auto chat-scroll">
          {/* Jarvis AI assistant */}
          <button onClick={() => { setPage('jarvis'); setSelectedGroupId(null); }}
            className={`w-full text-left px-3 py-2.5 border-b border-gray-800/50 transition-colors ${
              page === 'jarvis' ? 'bg-purple-950/40' : 'hover:bg-purple-950/20'
            }`}>
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm text-purple-300">Jarvis</p>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-400 border border-purple-800">AI</span>
            </div>
            <p className="text-[10px] text-gray-600 mt-0.5">Ask about your groups</p>
          </button>

          {/* Destination group */}
          {destinationId && (
            <button onClick={() => selectGroup(destinationId)}
              className={`w-full text-left px-3 py-2.5 border-b border-gray-800/50 transition-colors ${
                selectedGroupId === destinationId && page === 'chat' ? 'bg-blue-950/40' : 'hover:bg-blue-950/20'
              }`}>
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm truncate text-blue-300">{destGroup?.name || 'Destination'}</p>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400 border border-blue-800">dest</span>
              </div>
            </button>
          )}

          {/* Monitored groups */}
          {monitored.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-gray-500 text-sm">No groups monitored</p>
              <button onClick={() => setPage('config')} className="text-green-400 text-sm mt-2 hover:underline">+ Add groups</button>
            </div>
          ) : monitored.map(m => (
            <button key={m.groupId}
              onClick={() => selectGroup(m.groupId)}
              className={`w-full text-left px-3 py-2.5 border-b border-gray-800/50 transition-colors ${
                selectedGroupId === m.groupId && page === 'chat' ? 'bg-gray-800' : 'hover:bg-gray-800/50'
              }`}>
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm truncate">{m.group.name}</p>
                <span className={`w-2 h-2 rounded-full shrink-0 ${m.enabled ? 'bg-green-500' : 'bg-gray-600'}`} />
              </div>
              {m.savePath && <p className="text-[10px] text-gray-600 truncate mt-0.5 font-mono">{m.savePath}</p>}
            </button>
          ))}
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {page === 'config' ? (
          <ConfigPanel allGroups={allGroups} monitored={monitored} unmonitoredGroups={unmonitoredGroups}
            addGroupId={addGroupId} setAddGroupId={setAddGroupId} addMonitoredGroup={addMonitoredGroup}
            removeMonitored={removeMonitored} updateSavePath={updateSavePath}
            destinationId={destinationId} saveDestination={saveDestination} />
        ) : page === 'jarvis' ? (
          <JarvisChat />
        ) : page === 'queue' ? (
          <QueuePage socket={socket} />
        ) : page === 'logs' ? (
          <LogsPage socket={socket} />
        ) : selectedGroupId ? (
          <ChatView groupId={selectedGroupId}
            groupName={monitored.find(m => m.groupId === selectedGroupId)?.group.name
              || destGroup?.name || selectedGroupId}
            messages={messages} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3">
              <p className="text-5xl">&#128225;</p>
              <p className="text-gray-400">Select a group to view messages</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Chat View ───────────────────────────────────
function ChatView({ groupId, groupName, messages }: {
  groupId: string; groupName: string; messages: ChatMessage[];
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const senderColor = (name: string) => {
    const colors = ['text-green-400','text-blue-400','text-purple-400','text-yellow-400','text-pink-400','text-cyan-400','text-orange-400','text-teal-400'];
    let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
  };

  const queueBadge = (s: QueueStatus) => {
    if (s === 'queued') return <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-900/40 text-yellow-400">queued</span>;
    if (s === 'forwarded') return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-900/40 text-green-400">forwarded</span>;
    if (s === 'forwarding') return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-400">forwarding...</span>;
    if (s === 'failed') return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/40 text-red-400">failed</span>;
    return null;
  };

  const sendMessage = async () => {
    if (!inputText.trim() || sending) return;
    setSending(true);
    try {
      await apiFetch('/api/send', {
        method: 'POST', body: JSON.stringify({ groupId, text: inputText.trim() }),
      });
      setInputText('');
    } catch {}
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const aiDraft = async () => {
    if (drafting) return;
    setDrafting(true);
    try {
      const res = await apiFetch<{ draft: string }>('/api/ai/draft', {
        method: 'POST', body: JSON.stringify({ groupId }),
      });
      if (res.draft) setInputText(res.draft);
    } catch {}
    setDrafting(false);
  };

  return (
    <>
      <div className="px-5 py-3 border-b border-gray-800 bg-gray-900 shrink-0">
        <h2 className="font-semibold">{groupName}</h2>
        <p className="text-xs text-gray-500">{messages.length} messages</p>
      </div>
      <div className="flex-1 overflow-y-auto chat-scroll p-4 space-y-2">
        {messages.length === 0 ? (
          <p className="text-gray-600 text-center py-16">No messages yet. They&apos;ll appear in real-time.</p>
        ) : messages.map(msg => (
          <div key={msg.id} className="py-1.5 px-3 hover:bg-gray-900/50 rounded group">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-sm font-semibold ${senderColor(msg.senderName)}`}>{msg.senderName}</span>
              <span className="text-[10px] text-gray-600">
                {new Date(msg.timestamp).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}
              </span>
              {queueBadge(msg.queueStatus)}
              {msg.savedPath && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400">saved</span>}
            </div>
            {msg.thumbnail && (
              <div className="mt-1.5 mb-1">
                <img src={`data:image/jpeg;base64,${msg.thumbnail}`} alt=""
                  className="max-w-[240px] max-h-[180px] rounded-lg object-cover border border-gray-700" />
              </div>
            )}
            {msg.mediaType && !msg.thumbnail && (
              <div className="mt-1 flex items-center gap-1.5 text-gray-400">
                <span>{msg.mediaType === 'image' ? '🖼' : msg.mediaType === 'video' ? '🎬' : msg.mediaType === 'audio' ? '🎵' : '📄'}</span>
                <span className="text-xs font-mono">{msg.fileName || msg.mediaType}</span>
                {msg.fileSizeBytes > 0 && (
                  <span className="text-[10px] text-gray-600">({(msg.fileSizeBytes / 1024).toFixed(0)} KB)</span>
                )}
              </div>
            )}
            {msg.content && !msg.content.startsWith('[') && (
              <p className="text-sm text-gray-300 mt-0.5">{msg.content}</p>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-gray-800 bg-gray-900 px-4 py-3 shrink-0">
        <div className="flex items-end gap-2">
          <button onClick={aiDraft} disabled={drafting}
            title="AI Draft Reply (Gemini)"
            className={`shrink-0 px-3 py-2.5 rounded-lg text-xs font-medium transition-all border ${
              drafting
                ? 'bg-purple-900/30 border-purple-700 text-purple-400 animate-pulse'
                : 'bg-purple-900/20 border-purple-800 text-purple-400 hover:bg-purple-900/40 hover:border-purple-600'
            }`}>
            {drafting ? '...' : '✨ AI Draft'}
          </button>
          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm resize-none focus:outline-none focus:border-gray-500 max-h-32 overflow-y-auto"
            style={{ minHeight: '42px', height: inputText.includes('\n') ? 'auto' : '42px' }}
          />
          <button onClick={sendMessage} disabled={sending || !inputText.trim()}
            className="shrink-0 px-5 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:hover:bg-green-600 rounded-lg text-sm font-medium transition-colors">
            {sending ? '...' : 'Send'}
          </button>
        </div>
        <p className="text-[10px] text-gray-600 mt-1.5">Enter to send, Shift+Enter for new line. AI Draft uses last 30 messages for context.</p>
      </div>
    </>
  );
}

// ─── Jarvis Chat ─────────────────────────────────
function JarvisChat() {
  const [messages, setMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const ask = async () => {
    if (!input.trim() || thinking) return;
    const question = input.trim();
    setInput('');
    const newMessages = [...messages, { role: 'user' as const, text: question }];
    setMessages(newMessages);
    setThinking(true);

    try {
      const res = await apiFetch<{ answer: string }>('/api/ai/jarvis', {
        method: 'POST',
        body: JSON.stringify({ question, history: newMessages }),
      });
      setMessages(prev => [...prev, { role: 'model', text: res.answer }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'model', text: `Error: ${err instanceof Error ? err.message : 'Failed to get response'}` }]);
    }
    setThinking(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); }
  };

  const suggestions = [
    'Are there any recent client complaints?',
    'Which groups haven\'t I replied to yet?',
    'Summarize today\'s important messages',
    'Any urgent matters I should handle?',
  ];

  return (
    <>
      <div className="px-5 py-3 border-b border-gray-800 bg-gray-900 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-purple-300">Jarvis</h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-400 border border-purple-800">AI Assistant</span>
        </div>
        <p className="text-xs text-gray-500">Has read access to all your monitored groups. Zero WhatsApp interaction.</p>
      </div>

      <div className="flex-1 overflow-y-auto chat-scroll p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="py-12 space-y-6">
            <div className="text-center space-y-2">
              <p className="text-4xl">🤖</p>
              <p className="text-gray-400">Ask me anything about your WhatsApp groups</p>
              <p className="text-xs text-gray-600">I can see messages from all monitored groups</p>
            </div>
            <div className="grid grid-cols-2 gap-2 max-w-lg mx-auto">
              {suggestions.map(s => (
                <button key={s} onClick={() => { setInput(s); }}
                  className="text-left p-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg border border-gray-700/50 text-xs text-gray-400 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-green-700/30 text-green-100 rounded-br-sm'
                  : 'bg-gray-800 text-gray-200 rounded-bl-sm border border-gray-700'
              }`}>
                {msg.text}
              </div>
            </div>
          ))
        )}
        {thinking && (
          <div className="flex justify-start">
            <div className="px-4 py-3 bg-gray-800 rounded-2xl rounded-bl-sm border border-gray-700">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-gray-800 bg-gray-900 px-4 py-3 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Jarvis about your groups..."
            rows={1}
            className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm resize-none focus:outline-none focus:border-purple-600 max-h-32 overflow-y-auto"
            style={{ minHeight: '42px' }}
          />
          <button onClick={ask} disabled={thinking || !input.trim()}
            className="shrink-0 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors">
            Ask
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Queue Page ──────────────────────────────────
function QueuePage({ socket }: { socket: ReturnType<typeof useSocket> }) {
  const [items, setItems] = useState<(ChatMessage & { group?: { name: string } })[]>([]);
  const [filter, setFilter] = useState<'queued' | 'forwarded' | 'failed' | 'all'>('queued');
  const [loading, setLoading] = useState(true);
  const [forwarding, setForwarding] = useState<Set<string>>(new Set());
  const [editingCaption, setEditingCaption] = useState<string | null>(null);
  const [captionDrafts, setCaptionDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<(ChatMessage & { group?: { name: string } })[]>(`/api/queue?status=${filter}`);
      setItems(data);
      // Initialize caption drafts
      const drafts: Record<string, string> = {};
      data.forEach(d => { drafts[d.id] = d.caption || ''; });
      setCaptionDrafts(prev => ({ ...prev, ...drafts }));
    } catch {} finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = (data: { id: string; queueStatus: QueueStatus; error?: string }) => {
      setItems(prev => prev.map(item =>
        item.id === data.id ? { ...item, queueStatus: data.queueStatus, error: data.error || item.error } : item
      ));
      setForwarding(prev => { const next = new Set(prev); next.delete(data.id); return next; });
    };
    socket.on(SOCKET_EVENTS.QUEUE_UPDATE, handler);
    return () => { socket.off(SOCKET_EVENTS.QUEUE_UPDATE, handler); };
  }, [socket]);

  // Also listen for new queue items
  useEffect(() => {
    const handler = (msg: ChatMessage) => {
      if (msg.queueStatus === 'queued') {
        setItems(prev => {
          if (prev.some(i => i.id === msg.id)) return prev;
          return [msg, ...prev];
        });
        setCaptionDrafts(prev => ({ ...prev, [msg.id]: msg.caption || '' }));
      }
    };
    socket.on(SOCKET_EVENTS.MESSAGE_NEW, handler);
    return () => { socket.off(SOCKET_EVENTS.MESSAGE_NEW, handler); };
  }, [socket]);

  const saveCaption = async (id: string) => {
    const caption = captionDrafts[id] ?? '';
    await apiFetch(`/api/queue/${id}/caption`, {
      method: 'PUT', body: JSON.stringify({ caption }),
    }).catch(() => {});
    setItems(prev => prev.map(i => i.id === id ? { ...i, caption } : i));
    setEditingCaption(null);
  };

  const forwardOne = async (id: string) => {
    setForwarding(prev => new Set(prev).add(id));
    const caption = captionDrafts[id];
    try {
      await apiFetch(`/api/queue/${id}/forward`, {
        method: 'POST', body: JSON.stringify({ caption }),
      });
    } catch {}
  };

  const forwardAll = async () => {
    const queued = items.filter(i => i.queueStatus === 'queued');
    for (const item of queued) {
      await forwardOne(item.id);
    }
  };

  const dismiss = async (id: string) => {
    await apiFetch(`/api/queue/${id}/dismiss`, { method: 'POST' }).catch(() => {});
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const queuedCount = items.filter(i => i.queueStatus === 'queued').length;

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-5 py-3 border-b border-gray-800 bg-gray-900 flex items-center justify-between shrink-0">
        <div>
          <h2 className="font-semibold">Forwarding Queue</h2>
          <p className="text-xs text-gray-500">{queuedCount} items waiting</p>
        </div>
        {queuedCount > 0 && (
          <button onClick={forwardAll}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-medium transition-colors">
            Forward All ({queuedCount})
          </button>
        )}
      </div>

      <div className="px-5 py-2 border-b border-gray-800 flex gap-2">
        {(['queued', 'forwarded', 'failed', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto chat-scroll p-4 space-y-3">
        {loading ? (
          <p className="text-gray-500 text-center py-12">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-gray-600 text-center py-12">No items in queue.</p>
        ) : items.map(item => (
          <div key={item.id} className="p-4 bg-gray-800/50 rounded-xl border border-gray-700/50 space-y-3">
            <div className="flex gap-3">
              {/* Thumbnail */}
              <div className="shrink-0">
                {item.thumbnail ? (
                  <img src={`data:image/jpeg;base64,${item.thumbnail}`} alt=""
                    className="w-20 h-20 rounded-lg object-cover border border-gray-700" />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-gray-700 flex items-center justify-center text-2xl">
                    {item.mediaType === 'image' ? '🖼' : item.mediaType === 'video' ? '🎬' : item.mediaType === 'audio' ? '🎵' : '📄'}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{item.senderName}</span>
                  <span className="text-[10px] text-gray-500">{(item as any).group?.name || ''}</span>
                  <QueueChip status={item.queueStatus} />
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {item.mediaType}{item.fileName ? ` — ${item.fileName}` : ''}
                  {item.fileSizeBytes > 0 ? ` (${(item.fileSizeBytes / 1024).toFixed(0)} KB)` : ''}
                </p>
                {item.error && <p className="text-xs text-red-400 mt-1">{item.error}</p>}
                <p className="text-[10px] text-gray-600 mt-0.5">{new Date(item.timestamp).toLocaleString()}</p>
              </div>

              {/* Actions */}
              <div className="shrink-0 flex flex-col gap-1.5 justify-start">
                {(item.queueStatus === 'queued' || item.queueStatus === 'failed') && (
                  <button onClick={() => forwardOne(item.id)}
                    disabled={forwarding.has(item.id)}
                    className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg text-xs font-medium transition-colors whitespace-nowrap">
                    {forwarding.has(item.id) ? 'Sending...' : '📤 Forward'}
                  </button>
                )}
                {item.queueStatus === 'queued' && (
                  <button onClick={() => dismiss(item.id)}
                    className="px-4 py-1.5 text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-700 rounded-lg transition-colors">
                    Dismiss
                  </button>
                )}
                {item.queueStatus === 'forwarding' && (
                  <div className="w-5 h-5 border-2 border-gray-600 border-t-green-400 rounded-full animate-spin mx-auto" />
                )}
              </div>
            </div>

            {/* Caption - editable */}
            <div className="border-t border-gray-700/50 pt-2">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Caption (sent with media)</label>
                {editingCaption !== item.id && item.queueStatus === 'queued' && (
                  <button onClick={() => setEditingCaption(item.id)}
                    className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors">
                    Edit
                  </button>
                )}
              </div>
              {editingCaption === item.id ? (
                <div className="space-y-2">
                  <textarea
                    value={captionDrafts[item.id] ?? item.caption ?? ''}
                    onChange={e => setCaptionDrafts(prev => ({ ...prev, [item.id]: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-xs font-mono focus:outline-none focus:border-gray-400 resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => saveCaption(item.id)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium transition-colors">
                      Save
                    </button>
                    <button onClick={() => setEditingCaption(null)}
                      className="px-3 py-1 text-xs text-gray-500 hover:text-gray-300 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400 whitespace-pre-wrap font-mono bg-gray-900/50 rounded px-3 py-2 max-h-20 overflow-y-auto">
                  {captionDrafts[item.id] || item.caption || '(no caption)'}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QueueChip({ status }: { status: QueueStatus }) {
  const styles: Record<QueueStatus, string> = {
    none: '',
    queued: 'bg-yellow-900/40 text-yellow-400 border-yellow-800',
    forwarding: 'bg-blue-900/40 text-blue-400 border-blue-800',
    forwarded: 'bg-green-900/40 text-green-400 border-green-800',
    failed: 'bg-red-900/40 text-red-400 border-red-800',
  };
  if (status === 'none') return null;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${styles[status]}`}>
      {status}
    </span>
  );
}

// ─── Logs Page ───────────────────────────────────
function LogsPage({ socket }: { socket: ReturnType<typeof useSocket> }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const params = filterType !== 'all' ? `?eventType=${filterType}` : '';
      try {
        const data = await apiFetch<{ logs: LogEntry[] }>(`/api/logs${params}&limit=200`);
        setLogs(data.logs);
      } catch {} finally { setLoading(false); }
    };
    load();
  }, [filterType]);

  useEffect(() => {
    const handler = (entry: LogEntry) => {
      setLogs(prev => [entry, ...prev].slice(0, 200));
    };
    socket.on(SOCKET_EVENTS.LOG_ENTRY, handler);
    return () => { socket.off(SOCKET_EVENTS.LOG_ENTRY, handler); };
  }, [socket]);

  const eventTypes = ['all', 'download', 'save', 'forward', 'queue', 'system', 'error'];

  const chipStyle = (type: string) => {
    const map: Record<string, string> = {
      download: 'bg-purple-900/40 text-purple-400 border-purple-800',
      save: 'bg-blue-900/40 text-blue-400 border-blue-800',
      forward: 'bg-green-900/40 text-green-400 border-green-800',
      queue: 'bg-yellow-900/40 text-yellow-400 border-yellow-800',
      system: 'bg-gray-800 text-gray-400 border-gray-700',
      error: 'bg-red-900/40 text-red-400 border-red-800',
    };
    return map[type] || map.system;
  };

  const chipEmoji = (type: string) => {
    const map: Record<string, string> = {
      download: '⬇️', save: '💾', forward: '📤', queue: '📋', system: '⚙️', error: '❌',
    };
    return map[type] || '⚙️';
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-5 py-3 border-b border-gray-800 bg-gray-900 shrink-0">
        <h2 className="font-semibold">Activity Log</h2>
        <p className="text-xs text-gray-500">{logs.length} entries</p>
      </div>

      {/* Filters */}
      <div className="px-5 py-2 border-b border-gray-800 flex gap-2 flex-wrap">
        {eventTypes.map(t => (
          <button key={t} onClick={() => setFilterType(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
              filterType === t ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}>
            {t !== 'all' && <span>{chipEmoji(t)}</span>}
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto chat-scroll">
        {loading ? (
          <p className="text-gray-500 text-center py-12">Loading...</p>
        ) : logs.length === 0 ? (
          <p className="text-gray-600 text-center py-12">No log entries.</p>
        ) : (
          <table className="w-full">
            <thead className="text-xs text-gray-500 bg-gray-900/50 sticky top-0">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Time</th>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium">Level</th>
                <th className="text-left px-4 py-2 font-medium">Message</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} className="border-t border-gray-800/50 hover:bg-gray-900/30">
                  <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded border inline-flex items-center gap-1 ${chipStyle(log.eventType)}`}>
                      {chipEmoji(log.eventType)} {log.eventType}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] font-bold uppercase ${
                      log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-yellow-400' : 'text-gray-500'
                    }`}>{log.level}</span>
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-300">{log.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Config Panel ────────────────────────────────
function ConfigPanel({ allGroups, monitored, unmonitoredGroups, addGroupId, setAddGroupId,
  addMonitoredGroup, removeMonitored, updateSavePath, destinationId, saveDestination }: {
  allGroups: Group[]; monitored: MonitoredGroup[]; unmonitoredGroups: Group[];
  addGroupId: string; setAddGroupId: (v: string) => void;
  addMonitoredGroup: () => void; removeMonitored: (id: string) => void;
  updateSavePath: (id: string, p: string) => void;
  destinationId: string; saveDestination: (id: string) => void;
}) {
  const [aiPrompt, setAiPrompt] = useState('');
  const [jarvisPrompt, setJarvisPrompt] = useState('');
  const [promptLoaded, setPromptLoaded] = useState(false);
  const [promptSaved, setPromptSaved] = useState(false);

  useEffect(() => {
    apiFetch<{ aiSystemPrompt?: string; jarvisSystemPrompt?: string }>('/api/settings').then(s => {
      if (s.aiSystemPrompt) setAiPrompt(s.aiSystemPrompt);
      if (s.jarvisSystemPrompt) setJarvisPrompt(s.jarvisSystemPrompt);
      setPromptLoaded(true);
    }).catch(() => setPromptLoaded(true));
  }, []);

  const savePrompt = async () => {
    await apiFetch('/api/settings', {
      method: 'PUT', body: JSON.stringify({ aiSystemPrompt: aiPrompt, jarvisSystemPrompt: jarvisPrompt }),
    }).catch(() => {});
    setPromptSaved(true);
    setTimeout(() => setPromptSaved(false), 2000);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-8 max-w-3xl">
      <h2 className="text-2xl font-bold">Configuration</h2>

      <section className="space-y-3">
        <h3 className="font-semibold text-gray-300">Destination Group</h3>
        <p className="text-sm text-gray-500">Media from monitored groups will be forwarded here when you approve.</p>
        <select value={destinationId} onChange={e => saveDestination(e.target.value)}
          className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-gray-500">
          <option value="">None (don&apos;t forward)</option>
          {allGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold text-gray-300">Monitor a Group</h3>
        <div className="flex gap-2">
          <select value={addGroupId} onChange={e => setAddGroupId(e.target.value)}
            className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-gray-500">
            <option value="">Select a group...</option>
            {unmonitoredGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button onClick={addMonitoredGroup} disabled={!addGroupId}
            className="px-5 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors">
            + Add
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold text-gray-300">Monitored Groups ({monitored.length})</h3>
        {monitored.length === 0 ? (
          <p className="text-gray-500 text-sm py-4">No groups being monitored yet.</p>
        ) : (
          <div className="space-y-3">
            {monitored.map(m => (
              <div key={m.groupId} className="p-4 bg-gray-800 rounded-xl border border-gray-700 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{m.group.name}</p>
                  <button onClick={() => removeMonitored(m.groupId)}
                    className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-900/30 transition-colors">
                    Remove
                  </button>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Save folder (absolute path)</label>
                  <input value={m.savePath} onChange={e => updateSavePath(m.groupId, e.target.value)}
                    placeholder="C:\Users\you\Downloads\media"
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm font-mono focus:outline-none focus:border-gray-500" />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* AI System Prompt */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-300">AI Draft System Prompt</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-400 border border-purple-800">Gemini 3.1</span>
        </div>
        <p className="text-sm text-gray-500">This prompt tells the AI how to draft replies. Leave empty for the default (HK Lawyer, Cantonese).</p>
        {promptLoaded && (
          <>
            <textarea
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              rows={8}
              placeholder="Leave empty to use default prompt (HK Lawyer, Cantonese 口語, friendly professional)"
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-gray-500 resize-none"
            />
          </>
        )}
      </section>

      {/* Jarvis System Prompt */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-300">Jarvis System Prompt</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-400 border border-purple-800">AI Assistant</span>
        </div>
        <p className="text-sm text-gray-500">Controls how Jarvis responds when you ask about your groups. Leave empty for default.</p>
        {promptLoaded && (
          <textarea
            value={jarvisPrompt}
            onChange={e => setJarvisPrompt(e.target.value)}
            rows={6}
            placeholder="Leave empty for default (Cantonese, analyzes group messages)"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-gray-500 resize-none"
          />
        )}
      </section>

      <button onClick={savePrompt}
        className="px-5 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium transition-colors">
        {promptSaved ? 'Saved!' : 'Save All Prompts'}
      </button>
    </div>
  );
}
