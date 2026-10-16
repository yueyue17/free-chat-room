import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid, now, deleteCharacter, createSessionWithGreeting } from '../db';
import { nav } from '../lib/router';
import { fileToAvatarDataUrl } from '../lib/img';
import { downloadCardJson, importCardFromFile } from '../lib/cardfile';
import { generateOnce } from '../lib/llm';
import { Avatar, TopBar, Toast, Field } from '../components';
import type { CharacterCard } from '../types';

/** 预设提示词：让 AI 把角色设定写丰满 */
const CHARACTER_PROMPT = `你是角色设定作家。请根据下面提供的角色名和已有信息，写一段丰满、立体的角色设定，包含：外貌特征、身份背景、性格特质、说话风格、一两个标志性的习惯或小动作。要求200-400字，直接输出正文，不要标题、不要解释、不要列表符号。`;

function blank(): CharacterCard {
  return {
    id: '',
    name: '',
    description: '',
    personality: '',
    scenario: '',
    firstMes: '',
    altGreetings: [],
    exampleDialogs: '',
    creatorNotes: '',
    tags: [],
    worldBookIds: [],
    createdAt: now(),
    updatedAt: now(),
  };
}

export default function CharacterEdit({ id }: { id: string | null }) {
  const char = useLiveQuery(async () => (id ? db.characters.get(id) : undefined), [id]);
  const books = useLiveQuery(() => db.worldbooks.orderBy('name').toArray(), []) ?? [];
  const personas = useLiveQuery(() => db.personas.orderBy('name').toArray(), []) ?? [];
  const [form, setForm] = useState<CharacterCard | null>(id ? null : blank());
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const initRef = useRef<string>('');

  useEffect(() => {
    if (char && initRef.current !== char.id) {
      initRef.current = char.id;
      setForm(JSON.parse(JSON.stringify(char)) as CharacterCard);
    }
  }, [char]);

  function set<K extends keyof CharacterCard>(k: K, v: CharacterCard[K]) {
    setForm((f) => (f ? { ...f, [k]: v } : f));
  }

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function aiGenerate() {
    if (!form || busy) return;
    setBusy(true);
    try {
      const text = await generateOnce([
        { role: 'system', content: CHARACTER_PROMPT },
        {
          role: 'user',
          content:
            `角色名：${form.name || '未命名'}\n已有信息：\n${form.description.trim() || '（无，请自由发挥）'}`,
        },
      ]);
      if (text) set('description', text);
      flash('已生成设定，可继续手动修改');
    } catch (err) {
      flash('生成失败：' + (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onSave(): Promise<string | null> {
    if (!form) return null;
    if (!form.name.trim()) {
      flash('请先填写角色名称');
      return null;
    }
    const data = { ...form, name: form.name.trim(), updatedAt: now() };
    const newId = form.id || uid();
    if (form.id) await db.characters.put(data);
    else await db.characters.add({ ...data, id: newId, createdAt: now() });
    setForm({ ...data, id: newId });
    initRef.current = newId;
    return newId;
  }

  async function onSaveAndChat() {
    const cid = await onSave();
    if (!cid) return;
    const sid = await createSessionWithGreeting(cid);
    nav(`/chat/${sid}`);
  }

  async function onAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      set('avatar', await fileToAvatarDataUrl(f));
    } catch (err) {
      flash((err as Error).message);
    }
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !form) return;
    try {
      const card = await importCardFromFile(f);
      setForm({ ...form, ...card, avatar: form.avatar, id: form.id } as CharacterCard);
      flash(`已导入「${card.name}」的资料到当前表单`);
    } catch (err) {
      flash('导入失败：' + (err as Error).message);
    }
  }

  async function onDelete() {
    if (!form?.id) return;
    if (!confirm(`删除角色「${form.name}」及其所有聊天记录？此操作不可恢复。`)) return;
    await deleteCharacter(form.id);
    nav('/');
  }

  if (id && !char && !form) {
    return (
      <>
        <TopBar title="角色" backTo="/" />
        <div className="content">
          <div className="hint pad">加载中…</div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar
        title={id ? '编辑角色' : '新建角色'}
        backTo="/"
        right={form?.avatar ? <Avatar src={form.avatar} name={form.name} size={28} /> : undefined}
      />
      <div className="content form-page">
        {form && (
          <>
            <div className="avatar-row">
              <label className="avatar-picker">
                <Avatar src={form.avatar} name={form.name} size={88} />
                <span>点击更换头像</span>
                <input type="file" accept="image/*" hidden onChange={onAvatar} />
              </label>
              <div className="avatar-side">
                <Field label="角色名称 *">
                  <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="例如：银发图书管理员" />
                </Field>
                <Field label="标签（逗号分隔）">
                  <input className="input" value={form.tags.join(', ')} onChange={(e) => set('tags', e.target.value.split(/[,，]/).map((t) => t.trim()).filter(Boolean))} placeholder="原创, 奇幻, 温柔" />
                </Field>
              </div>
            </div>

            <Field label="描述 / 设定（外貌、身份、能力…）">
              <textarea className="textarea" rows={5} value={form.description} onChange={(e) => set('description', e.target.value)} />
            </Field>
            <div className="btn-row tight">
              <button className="btn primary small" disabled={busy} onClick={() => void aiGenerate()}>
                {busy ? '✨ 生成中…' : '✨ AI 生成设定'}
              </button>
              <span className="hint">发送一次请求，把名称与已有信息扩写成完整设定</span>
            </div>

            <Field label="性格">
              <textarea className="textarea" rows={3} value={form.personality} onChange={(e) => set('personality', e.target.value)} />
            </Field>
            <Field label="场景（故事发生的背景）">
              <textarea className="textarea" rows={3} value={form.scenario} onChange={(e) => set('scenario', e.target.value)} />
            </Field>
            <Field label="开场白（角色的第一条消息）">
              <textarea className="textarea" rows={4} value={form.firstMes} onChange={(e) => set('firstMes', e.target.value)} placeholder="（她抬起头，微微一笑）你来啦……" />
            </Field>
            <Field label="备选开场白（每行一条，开聊时随机选用）">
              <textarea className="textarea" rows={3} value={form.altGreetings.join('\n')} onChange={(e) => set('altGreetings', e.target.value.split('\n').filter((t) => t.trim()))} />
            </Field>
            <Field label="示例对话（用 <START> 分隔多组，AI 会模仿文风）">
              <textarea className="textarea" rows={5} value={form.exampleDialogs} onChange={(e) => set('exampleDialogs', e.target.value)} placeholder={'<START>\n{{user}}: 你好\n{{char}}: （愣了一下）……嗯，你好。'} />
            </Field>
            <Field label="创建者备注（仅自己可见）">
              <textarea className="textarea" rows={2} value={form.creatorNotes} onChange={(e) => set('creatorNotes', e.target.value)} />
            </Field>

            <Field label="绑定的世界书" hint="条目会在聊天中出现相关关键词时自动注入上下文">
              {books.length === 0 ? (
                <div className="hint">
                  还没有世界书，<button className="link" onClick={() => nav('/worldbook')}>去创建 →</button>
                </div>
              ) : (
                <div className="check-list">
                  {books.map((b) => (
                    <label key={b.id} className="check">
                      <input
                        type="checkbox"
                        checked={form.worldBookIds.includes(b.id)}
                        onChange={(e) =>
                          set('worldBookIds', e.target.checked ? [...form.worldBookIds, b.id] : form.worldBookIds.filter((x) => x !== b.id))
                        }
                      />
                      {b.name}（{b.entries.length} 条）
                    </label>
                  ))}
                </div>
              )}
            </Field>

            <Field label="绑定的用户人设" hint="与该角色聊天时自动使用这个人设；未绑定则用「人设」页里的默认人设">
              <select
                className="input select"
                value={form.personaId ?? ''}
                onChange={(e) => set('personaId', e.target.value || undefined)}
              >
                <option value="">（未绑定，使用默认人设）</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>

            <div className="btn-row">
              <button className="btn primary" onClick={() => void onSave().then((cid) => cid && flash('已保存'))}>保存</button>
              <button className="btn primary" onClick={() => void onSaveAndChat()}>保存并开始聊天</button>
            </div>
            <div className="btn-row">
              <button className="btn" onClick={() => downloadCardJson(form)} title="导出为酒馆 V2 兼容的 JSON 角色卡">导出 JSON</button>
              <label className="btn" style={{ display: 'inline-flex', alignItems: 'center' }} title="把 JSON 角色卡的内容填入当前表单">
                导入 JSON 到表单
                <input type="file" accept=".json" hidden onChange={onImport} />
              </label>
              {form.id && <button className="btn danger" onClick={() => void onDelete()}>删除角色</button>}
            </div>
          </>
        )}
      </div>
      <Toast msg={toast} />
    </>
  );
}
