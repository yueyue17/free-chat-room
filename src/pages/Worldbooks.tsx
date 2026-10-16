import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid } from '../db';
import { nav } from '../lib/router';
import { TopBar, Toast } from '../components';
import type { WorldBook, WorldEntry } from '../types';

const uidEntry = (): WorldEntry => ({ id: uid(), keys: [], content: '', constant: false, enabled: true, order: 100 });

export default function Worldbooks({ selectedId }: { selectedId: string | null }) {
  const books = useLiveQuery(() => db.worldbooks.orderBy('name').toArray(), []) ?? [];
  const currentId = selectedId ?? books[0]?.id ?? null;
  const book = books.find((b) => b.id === currentId) ?? null;
  const bookKey = book ? JSON.stringify(book) : '';
  const [draft, setDraft] = useState<WorldBook | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setDraft(book ? (JSON.parse(bookKey) as WorldBook) : null);
  }, [currentId, bookKey]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  async function createBook() {
    const b: WorldBook = { id: uid(), name: '新世界书', entries: [] };
    await db.worldbooks.add(b);
    nav(`/worldbook/${b.id}`);
  }

  async function save() {
    if (!draft) return;
    await db.worldbooks.put(draft);
    flash('已保存');
  }

  function patchEntry(idx: number, patch: Partial<WorldEntry>) {
    setDraft((d) =>
      d ? { ...d, entries: d.entries.map((e, i) => (i === idx ? { ...e, ...patch } : e)) } : d,
    );
  }

  const dirty = draft && bookKey !== JSON.stringify(draft);

  return (
    <>
      <TopBar
        title="世界书"
        backTo="/"
        right={
          <button className="icon-btn" title="新建世界书" onClick={() => void createBook()}>
            ＋
          </button>
        }
      />
      <div className="content form-page">
        <div className="hint box">
          世界书（Lorebook）：把世界观设定写成一个个「条目」，聊天记录里出现<b>关键词</b>时，对应条目才会被注入上下文——
          既能让 AI 记住设定，又不浪费 token。勾选「常驻」的条目每次都会注入。
        </div>

        {books.length === 0 ? (
          <div className="hint pad">还没有世界书，点击右上角「＋」创建一本。</div>
        ) : (
          <>
            <div className="toolbar">
              <select
                className="input select"
                value={currentId ?? ''}
                onChange={(e) => nav(`/worldbook/${e.target.value}`)}
              >
                {books.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <button className="btn primary" disabled={!dirty} onClick={() => void save()}>
                保存{dirty ? ' *' : ''}
              </button>
            </div>

            {draft && (
              <>
                <div className="field">
                  <label>世界书名称</label>
                  <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </div>

                {draft.entries.map((e, idx) => (
                  <div key={e.id} className="entry-card">
                    <div className="entry-head">
                      <label className="check" title="是否启用">
                        <input type="checkbox" checked={e.enabled} onChange={(ev) => patchEntry(idx, { enabled: ev.target.checked })} />
                        启用
                      </label>
                      <label className="check" title="勾选后每次对话都注入，无需关键词">
                        <input type="checkbox" checked={e.constant} onChange={(ev) => patchEntry(idx, { constant: ev.target.checked })} />
                        常驻
                      </label>
                      <input
                        className="input order"
                        type="number"
                        title="优先级（越小越靠前）"
                        value={e.order}
                        onChange={(ev) => patchEntry(idx, { order: Number(ev.target.value) || 0 })}
                      />
                      <button
                        className="icon-btn"
                        title="删除条目"
                        onClick={() => setDraft({ ...draft, entries: draft.entries.filter((_, i) => i !== idx) })}
                      >
                        🗑
                      </button>
                    </div>
                    {!e.constant && (
                      <input
                        className="input"
                        placeholder="触发关键词，用逗号分隔，如：魔法学院, 艾琳, 圣剑"
                        value={e.keys.join(', ')}
                        onChange={(ev) =>
                          patchEntry(idx, {
                            keys: ev.target.value.split(/[,，]/).map((k) => k.trim()).filter(Boolean),
                          })
                        }
                      />
                    )}
                    <textarea
                      className="textarea"
                      rows={3}
                      placeholder={e.constant ? '每次对话都会注入的设定内容' : '命中关键词时注入的设定内容'}
                      value={e.content}
                      onChange={(ev) => patchEntry(idx, { content: ev.target.value })}
                    />
                  </div>
                ))}

                <button className="btn" onClick={() => setDraft({ ...draft, entries: [...draft.entries, uidEntry()] })}>
                  ＋ 添加条目
                </button>
              </>
            )}
          </>
        )}
      </div>
      <Toast msg={toast} />
    </>
  );
}
