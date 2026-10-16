import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid, now } from '../db';
import { loadSettings, saveSettings } from '../lib/settings';
import { generateOnce } from '../lib/llm';
import { TabBar, TopBar, Toast, Field, EmptyState } from '../components';

/** 预设提示词：让 AI 一次性填满人设的名称与描述（返回 JSON） */
const PERSONA_PROMPT = `你是用户人设写作助手。根据提供的名字和已有描述，塑造一个立体的用户人设。严格输出如下 JSON（不要 markdown 代码块、不要解释）：
{"name":"人设名称，4-8个字，有辨识度","description":"身份背景、性格特质、说话风格、兴趣爱好、一两个独特的小习惯，150-300字"}`;

export default function PersonaPage() {
  const personas = useLiveQuery(() => db.personas.orderBy('name').toArray(), []) ?? [];
  const [s, setS] = useState(loadSettings());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function set<K extends keyof typeof s>(k: K, v: (typeof s)[K]) {
    const next = { ...s, [k]: v };
    setS(next);
    saveSettings(next);
  }

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function addPersona() {
    const id = uid();
    await db.personas.add({ id, name: `人设 ${personas.length + 1}`, description: '', createdAt: now(), updatedAt: now() });
    flash('已创建，点击卡片编辑');
  }

  async function patch(id: string, p: Partial<{ name: string; description: string }>) {
    await db.personas.update(id, { ...p, updatedAt: now() });
  }

  async function removePersona(id: string) {
    const usedBy = await db.characters.filter((c) => c.personaId === id).toArray();
    if (usedBy.length && !confirm(`该人设已绑定角色：${usedBy.map((c) => c.name).join('、')}。解绑并删除？`)) return;
    for (const c of usedBy) await db.characters.update(c.id, { personaId: undefined });
    await db.personas.delete(id);
  }

  async function aiGenerate(id: string, name: string, desc: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      const text = await generateOnce([
        { role: 'system', content: PERSONA_PROMPT },
        { role: 'user', content: `名字：${name || '未命名'}\n已有描述：${desc.trim() || '（无，请自由发挥）'}` },
      ]);
      const m = /\{[\s\S]*\}/.exec(text);
      if (!m) throw new Error('AI 未返回有效的 JSON');
      const j = JSON.parse(m[0]) as { name?: string; description?: string };
      await patch(id, { name: j.name?.trim() || name, description: j.description?.trim() || desc });
      flash('已生成名称与描述，可继续修改');
    } catch (err) {
      flash('生成失败：' + (err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <TopBar title="用户人设" />
      <TabBar active="persona" />
      <div className="content form-page">
        <div className="hint box">
          可以创建多份人设，并在角色编辑页<b>绑定</b>到角色——与该角色聊天时自动使用对应人设。
          未绑定时使用下方的默认人设（{`{{user}}`} 宏会替换为对应的名字）。
        </div>

        <div className="btn-row">
          <button className="btn primary" onClick={() => void addPersona()}>
            ＋ 新建人设
          </button>
        </div>

        {personas.length === 0 && <EmptyState icon="🎭" title="还没有自定义人设" sub="创建后绑定到角色；未绑定的角色走默认人设" />}

        {personas.map((p) => (
          <div key={p.id} className="entry-card">
            <div className="entry-head">
              <input className="input grow" value={p.name} onChange={(e) => void patch(p.id, { name: e.target.value })} placeholder="人设名称" />
              <button
                className="btn primary small"
                disabled={busyId === p.id}
                onClick={() => void aiGenerate(p.id, p.name, p.description)}
              >
                {busyId === p.id ? '✨ 生成中…' : '✨ AI 生成'}
              </button>
              <button className="icon-btn" title="删除人设" onClick={() => void removePersona(p.id)}>🗑</button>
            </div>
            <textarea
              className="textarea"
              rows={4}
              value={p.description}
              onChange={(e) => void patch(p.id, { description: e.target.value })}
              placeholder="身份背景、性格、说话风格……（自动保存）"
            />
          </div>
        ))}

        <h3 className="section">默认人设（未绑定角色时使用）</h3>
        <Field label="你的名字（对应 {{user}}）">
          <input className="input" value={s.userName} onChange={(e) => set('userName', e.target.value)} placeholder="例如：阿岚" />
        </Field>
        <Field label="人设描述（AI 会参考）">
          <textarea
            className="textarea"
            rows={4}
            value={s.userDescription}
            onChange={(e) => set('userDescription', e.target.value)}
            placeholder="例如：一位路过的年轻旅者，背着旧吉他……"
          />
        </Field>
        <div className="btn-row">
          <button
            className="btn primary"
            disabled={busyId !== null}
            onClick={async () => {
              setBusyId('__default__');
              try {
                const text = await generateOnce([
                  { role: 'system', content: PERSONA_PROMPT },
                  { role: 'user', content: `名字：${s.userName || '未命名'}\n已有描述：${s.userDescription.trim() || '（无，请自由发挥）'}` },
                ]);
                const m = /\{[\s\S]*\}/.exec(text);
                if (!m) throw new Error('AI 未返回有效的 JSON');
                const j = JSON.parse(m[0]) as { name?: string; description?: string };
                set('userName', j.name?.trim() || s.userName);
                set('userDescription', j.description?.trim() || s.userDescription);
                flash('已生成名称与描述，可继续修改');
              } catch (err) {
                flash('生成失败：' + (err as Error).message);
              } finally {
                setBusyId(null);
              }
            }}
          >
            {busyId === '__default__' ? '✨ 生成中…' : '✨ AI 生成默认人设'}
          </button>
        </div>
      </div>
      <Toast msg={toast} />
    </>
  );
}
