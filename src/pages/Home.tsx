import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid, now, createSessionWithGreeting, deleteSession } from '../db';
import { nav } from '../lib/router';
import { importCardFromFile } from '../lib/cardfile';
import { Avatar, TabBar, TopBar, Toast, EmptyState, fmtTime } from '../components';

export default function Home({ tab }: { tab: 'chars' | 'chats' }) {
  const [q, setQ] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const characters = useLiveQuery(async () => {
    const list = await db.characters.orderBy('updatedAt').reverse().toArray();
    if (!q) return list;
    const k = q.toLowerCase();
    return list.filter((c) => (c.name + ' ' + c.tags.join(' ')).toLowerCase().includes(k));
  }, [q]);

  const sessions = useLiveQuery(async () => {
    const list = await db.sessions.orderBy('updatedAt').reverse().toArray();
    const chars = await db.characters.toArray();
    const map = new Map(chars.map((c) => [c.id, c]));
    return list.map((s) => ({ ...s, char: map.get(s.characterId) }));
  }, []);

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      setBusy(true);
      const card = await importCardFromFile(f);
      const id = uid();
      await db.characters.add({
        id,
        avatar: card.avatar,
        description: card.description ?? '',
        personality: card.personality ?? '',
        scenario: card.scenario ?? '',
        firstMes: card.firstMes ?? '',
        altGreetings: card.altGreetings ?? [],
        exampleDialogs: card.exampleDialogs ?? '',
        creatorNotes: card.creatorNotes ?? '',
        tags: card.tags ?? [],
        worldBookIds: [],
        createdAt: now(),
        updatedAt: now(),
        name: card.name ?? '未命名角色',
      });
      setToast(`已导入「${card.name}」，可继续编辑`);
      nav(`/char/${id}`);
    } catch (err) {
      setToast(`导入失败：${(err as Error).message}`);
      setTimeout(() => setToast(null), 3500);
    } finally {
      setBusy(false);
    }
  }

  async function startChat(characterId: string) {
    try {
      const sid = await createSessionWithGreeting(characterId);
      nav(`/chat/${sid}`);
    } catch (err) {
      setToast((err as Error).message);
      setTimeout(() => setToast(null), 3000);
    }
  }

  return (
    <>
      <TopBar
        title="💬 Free 聊天室"
        right={
          <>
            <button className="icon-btn" title="世界书" onClick={() => nav('/worldbook')}>📖</button>
            <button className="icon-btn" title="设置" onClick={() => nav('/settings')}>⚙️</button>
          </>
        }
      />
      <TabBar active={tab} />

      {tab === 'chars' && (
        <div className="content">
          <div className="toolbar">
            <input className="input" placeholder="搜索角色…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>导入 JSON</button>
            <button className="btn primary" onClick={() => nav('/char/new')}>＋ 新建角色</button>
            <input ref={fileRef} type="file" accept=".json" hidden onChange={onImport} />
          </div>

          {characters && characters.length === 0 && (
            <EmptyState
              icon="💬"
              title="还没有角色"
              sub="点击「＋ 新建角色」创建，或「导入 JSON」角色卡（兼容酒馆 V2 格式）"
            />
          )}

          <div className="grid">
            {(characters ?? []).map((c) => (
              <div key={c.id} className="card" onClick={() => nav(`/char/${c.id}`)}>
                <div className="card-avatar">
                  <Avatar src={c.avatar} name={c.name} size={160} />
                </div>
                <div className="card-body">
                  <div className="card-name">{c.name}</div>
                  {c.tags.length > 0 && <div className="card-tags">{c.tags.slice(0, 3).join(' · ')}</div>}
                  <button
                    className="btn primary small"
                    onClick={(e) => {
                      e.stopPropagation();
                      void startChat(c.id);
                    }}
                  >
                    开始聊天
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'chats' && (
        <div className="content">
          {sessions && sessions.length === 0 && (
            <EmptyState icon="💬" title="还没有聊天" sub="去「角色」页选择一个角色开始聊天" />
          )}
          <div className="list">
            {(sessions ?? []).map((s) => (
              <div key={s.id} className="row-item" onClick={() => nav(`/chat/${s.id}`)}>
                <Avatar src={s.char?.avatar} name={s.char?.name ?? '?'} size={44} />
                <div className="row-main">
                  <div className="row-title">{s.char?.name ?? '（角色已删除）'}</div>
                  <div className="row-sub">{s.title}</div>
                </div>
                <div className="row-time">{fmtTime(s.updatedAt)}</div>
                <button
                  className="icon-btn"
                  title="删除会话"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('删除这个聊天记录？')) void deleteSession(s.id);
                  }}
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Toast msg={toast} />
    </>
  );
}
