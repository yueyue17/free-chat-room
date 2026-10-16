import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid, now, deleteSession } from '../db';
import { nav } from '../lib/router';
import { streamChat } from '../lib/llm';
import { buildLlmMessages, swipeText, fillMacros, resolvePersona } from '../lib/prompt';
import { applyDisplayRules } from '../lib/regex';
import { applyStatusBarDisplay } from '../lib/statusbar';
import { applyBeautifierDisplay } from '../lib/beautify';
import { generateSuggestions } from '../lib/llm';
import { loadSettings } from '../lib/settings';
import { renderMarkdown } from '../lib/markdown';
import { Avatar, TopBar } from '../components';
import ChatDrawer from './ChatDrawer';

export default function Chat({ sessionId }: { sessionId: string }) {
  const session = useLiveQuery(() => db.sessions.get(sessionId), [sessionId]);
  const character = useLiveQuery(
    async () => (session ? db.characters.get(session.characterId) : undefined),
    [session?.characterId],
  );
  const messages = useLiveQuery(() => db.messages.where('sessionId').equals(sessionId).sortBy('ts'), [sessionId]) ?? [];
  const regexRules = useLiveQuery(() => db.regexRules.toArray(), []) ?? [];
  const statusBars = useLiveQuery(() => db.statusBars.toArray(), []) ?? [];
  const beautifiers = useLiveQuery(() => db.beautifiers.toArray(), []) ?? [];
  const persona = useLiveQuery(
    async () => (character?.personaId ? db.personas.get(character.personaId) : undefined),
    [character?.personaId],
  );

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggBusy, setSuggBusy] = useState(false);
  const [panel, setPanel] = useState<null | 'settings' | 'extend'>(null);
  const [streaming, setStreaming] = useState<{ content: string; error?: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, streaming?.content, editingId]);

  async function saveAssistantResult(content: string): Promise<string | undefined> {
    // 从数据库取最新消息，避免闭包中的旧列表误判
    const all = await db.messages.where('sessionId').equals(sessionId).sortBy('ts');
    const last = all[all.length - 1];
    if (last && last.role === 'assistant') {
      const swipes = [...(last.swipes?.length ? last.swipes : [last.content]), content];
      await db.messages.update(last.id, { swipes, activeSwipe: swipes.length - 1, content, suggestions: undefined });
      await db.sessions.update(sessionId, { updatedAt: now() });
      return last.id;
    }
    const id = uid();
    await db.messages.add({ id, sessionId, role: 'assistant', content, swipes: [content], activeSwipe: 0, ts: now() });
    await db.sessions.update(sessionId, { updatedAt: now() });
    return id;
  }

  /** 生成 3 条候选回答并挂到刚生成的回复上（失败不影响主流程；可在会话设置中关闭） */
  async function fireSuggestions(messageId: string, reply: string) {
    if (!character || session?.assistOn === false) return;
    setSuggBusy(true);
    try {
      const p = await resolvePersona(character, loadSettings());
      const suggs = await generateSuggestions({
        charName: character.name,
        charBrief: (character.description + '\n' + character.personality).slice(0, 600),
        userName: p.name,
        userBrief: p.description.slice(0, 400),
        lastReply: reply.slice(0, 600),
      });
      if (suggs.length) await db.messages.update(messageId, { suggestions: suggs });
    } catch {
      /* 忽略建议生成失败 */
    } finally {
      setSuggBusy(false);
    }
  }

  async function runGeneration() {
    if (!character || busy) return;
    setBusy(true);
    setStreaming({ content: '' });
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let acc = '';
    let failed: string | null = null;
    try {
      const llmMessages = await buildLlmMessages({ character, sessionId, settings: loadSettings() });
      for await (const chunk of streamChat({ messages: llmMessages, characterName: character.name, signal: ctrl.signal })) {
        acc += chunk;
        setStreaming({ content: acc });
      }
      if (acc.trim()) {
        const mid = await saveAssistantResult(acc);
        if (mid) void fireSuggestions(mid, acc);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        if (acc.trim()) {
          const mid = await saveAssistantResult(acc);
          if (mid) void fireSuggestions(mid, acc);
        }
      } else {
        failed = (err as Error).message;
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
    setStreaming(failed ? { content: acc, error: failed } : null);
  }

  async function send() {
    const text = input.trim();
    if (!text || busy || !character) return;
    setInput('');
    await db.messages.add({ id: uid(), sessionId, role: 'user', content: text, ts: now() });
    await db.sessions.update(sessionId, { updatedAt: now() });
    await runGeneration();
  }

  async function saveEdit(id: string) {
    const m = messages.find((x) => x.id === id);
    if (!m) return;
    if (m.role === 'assistant' && m.swipes?.length) {
      const swipes = [...m.swipes];
      const idx = m.activeSwipe ?? swipes.length - 1;
      swipes[idx] = editDraft;
      await db.messages.update(id, { swipes, content: swipes[idx] });
    } else {
      await db.messages.update(id, { content: editDraft });
    }
    setEditingId(null);
  }

  function stop() {
    abortRef.current?.abort();
  }

  if (session === undefined) {
    return (
      <>
        <TopBar title="聊天" backTo="/" />
        <div className="content">
          <div className="hint pad">加载中…</div>
        </div>
      </>
    );
  }
  if (session === null) {
    return (
      <>
        <TopBar title="聊天" backTo="/" />
        <div className="content">
          <div className="hint pad">会话不存在，可能已被删除。</div>
        </div>
      </>
    );
  }

  const st = loadSettings();
  const userName = persona?.name || st.userName || '我';
  // 显示层管线：自定义正则 → 挂载的美化预设 → 状态栏（后两者仅 AI 回复）
  const mountedBeauts = beautifiers.filter(
    (b) => b.approved && (session?.mountedIds ?? []).includes(b.id),
  );
  const display = (text: string, role: 'user' | 'assistant') =>
    applyStatusBarDisplay(
      applyBeautifierDisplay(
        applyDisplayRules(fillMacros(text, character?.name ?? '角色', userName), regexRules, role),
        role === 'assistant' ? mountedBeauts : [],
      ),
      role === 'assistant' ? statusBars : [],
    );

  const canRegen = !busy && !!character;

  return (
    <div className="chat-page">
      <TopBar
        title={
          <div className="chat-title">
            <Avatar src={character?.avatar} name={character?.name ?? '?'} size={26} />
            <span>{character?.name ?? '聊天'}</span>
          </div>
        }
        backTo="/"
        right={
          <>
            <button className="icon-btn" title="聊天设置" onClick={() => setPanel('settings')}>🎛️</button>
            <button className="icon-btn" title="扩展" onClick={() => setPanel('extend')}>🧩</button>
            <button
              className="icon-btn"
              title="重命名会话"
              onClick={async () => {
                const t = prompt('会话名称', session.title);
                if (t && t.trim()) await db.sessions.update(sessionId, { title: t.trim() });
              }}
            >
              ✏️
            </button>
            <button
              className="icon-btn"
              title="删除会话"
              onClick={async () => {
                if (confirm('删除这个聊天记录？')) {
                  await deleteSession(sessionId);
                  nav('/chats');
                }
              }}
            >
              🗑
            </button>
          </>
        }
      />

      <div
        className={`messages b-${session.bubbleStyle ?? 'default'} ${session.bgImage ? 'has-bg' : ''}`}
        ref={scrollRef}
        style={
          session.bgImage
            ? { backgroundImage: `url(${session.bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : undefined
        }
      >
        {messages.length === 0 && !streaming && (
          <div className="hint pad">发送第一条消息开始吧。当前模型：{loadSettings().provider === 'mock' ? '演示模式' : loadSettings().model}</div>
        )}
        {messages.map((m, i) => {
          const isUser = m.role === 'user';
          const content = swipeText(m);
          const showSwipe = m.role === 'assistant' && (m.swipes?.length ?? 0) > 1;
          const isLast = i === messages.length - 1;
          return (
            <div key={m.id} className={`msg-row ${isUser ? 'user' : 'assistant'}`}>
              {!isUser && <Avatar src={character?.avatar} name={character?.name ?? '?'} size={34} />}
              <div className="msg-col">
                {editingId === m.id ? (
                  <div className="msg-edit">
                    <textarea className="textarea" rows={4} value={editDraft} onChange={(e) => setEditDraft(e.target.value)} />
                    <div className="btn-row">
                      <button className="btn primary small" onClick={() => void saveEdit(m.id)}>保存</button>
                      <button className="btn small" onClick={() => setEditingId(null)}>取消</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      className={`bubble ${isUser ? 'user' : ''}`}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(display(content, isUser ? 'user' : 'assistant')) }}
                    />
                    {showSwipe && (
                      <div className="swipe-bar">
                        <button
                          className="icon-btn small"
                          onClick={() => {
                            const n = m.swipes!.length;
                            const cur = m.activeSwipe ?? n - 1;
                            void db.messages.update(m.id, { activeSwipe: (cur - 1 + n) % n });
                          }}
                        >
                          ‹
                        </button>
                        <span>
                          {(m.activeSwipe ?? m.swipes!.length - 1) + 1} / {m.swipes!.length}
                        </span>
                        <button
                          className="icon-btn small"
                          onClick={() => {
                            const n = m.swipes!.length;
                            const cur = m.activeSwipe ?? n - 1;
                            void db.messages.update(m.id, { activeSwipe: (cur + 1) % n });
                          }}
                        >
                          ›
                        </button>
                      </div>
                    )}
                    <div className="msg-actions">
                      <button
                        onClick={() => {
                          void navigator.clipboard.writeText(content).then(() => {}, () => {});
                        }}
                      >
                        复制
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(m.id);
                          setEditDraft(content);
                        }}
                      >
                        编辑
                      </button>
                      <button onClick={() => void db.messages.delete(m.id)}>删除</button>
                      {isLast && m.role === 'assistant' && !busy && (
                        <button className="accent" onClick={() => void runGeneration()}>
                          重新生成
                        </button>
                      )}
                    </div>
                    {isLast && m.role === 'assistant' && !busy && session.assistOn !== false && (suggBusy || m.suggestions?.length) ? (
                      m.suggestions?.length ? (
                        <div className="suggestions">
                          {m.suggestions.map((s, i) => (
                            <button
                              key={i}
                              className="suggestion"
                              onClick={() => {
                                setInput(s);
                              }}
                            >
                              ✦ {s}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="hint sugg-hint">✦ 正在构思候选回复…</div>
                      )
                    ) : null}
                  </>
                )}
              </div>
            </div>
          );
        })}

        {streaming && (
          <div className="msg-row assistant">
            {character && <Avatar src={character.avatar} name={character.name} size={34} />}
            <div className="msg-col">
              {streaming.error ? (
                <div className="bubble error">
                  <div>⚠️ 生成失败：{streaming.error}</div>
                  <button className="btn small" onClick={() => void runGeneration()}>重试</button>
                </div>
              ) : (
                <div
                  className="bubble streaming"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(display(streaming.content, 'assistant')) + '<span class="cursor"></span>' }}
                />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="composer">
        {busy ? (
          <button className="btn danger" onClick={stop}>■ 停止</button>
        ) : (
          canRegen && (
            <button className="btn ghost" title="生成新回复" onClick={() => void runGeneration()}>
              🔄
            </button>
          )
        )}
        <textarea
          className="input"
          placeholder={busy ? '生成中…' : '说点什么…（Enter 发送，Shift+Enter 换行）'}
          value={input}
          rows={1}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 120) + 'px';
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button className="btn primary" disabled={busy || !input.trim()} onClick={() => void send()}>
          发送
        </button>
      </div>

      {panel && (
        <ChatDrawer
          tab={panel}
          session={session}
          beautifiers={beautifiers}
          onClose={() => setPanel(null)}
          onSwitch={setPanel}
        />
      )}
    </div>
  );
}
