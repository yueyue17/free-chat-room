import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, uid } from '../db';
import { TabBar, TopBar, Toast } from '../components';
import { compileRules } from '../lib/regex';
import { applyBeautifierRules } from '../lib/beautify';
import { defaultStatusBars } from '../lib/statusbar';
import { renderMarkdown } from '../lib/markdown';
import type { Beautifier, RegexRule, StatusBarPreset } from '../types';

const newRule = (): RegexRule => ({
  id: uid(),
  name: '新规则',
  find: '',
  replace: '',
  scope: 'display',
  target: 'ai',
  enabled: true,
});

export default function RegexPage() {
  const rules = useLiveQuery(() => db.regexRules.toArray(), []) ?? [];
  const statusBars = useLiveQuery(() => db.statusBars.toArray(), []) ?? [];
  const beauts = useLiveQuery(() => db.beautifiers.toArray(), []) ?? [];
  const [testIn, setTestIn] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  function patch(id: string, p: Partial<RegexRule>) {
    void db.regexRules.update(id, p);
  }

  function patchBar(id: string, p: Partial<StatusBarPreset>) {
    void db.statusBars.update(id, p);
  }

  function patchBeaut(id: string, p: Partial<Beautifier>) {
    void db.beautifiers.update(id, p);
  }

  async function addBeautifier() {
    await db.beautifiers.add({
      id: uid(),
      name: '自定义美化',
      prompt: '',
      sample: '',
      rules: [{ find: '', replace: '' }],
      approved: false,
    });
  }

  // 测试区：对输入文本跑一遍所有启用的「显示层」规则
  const testOut = (() => {
    let out = testIn;
    for (const { rule, re, error } of compileRules(rules)) {
      if (error || !rule.enabled) continue;
      if (rule.scope === 'prompt') continue;
      try {
        out = out.replace(re, rule.replace);
      } catch {
        /* skip */
      }
    }
    return out;
  })();

  return (
    <>
      <TopBar title="自定义正则" />
      <TabBar active="regex" />
      <div className="content form-page">
        <div className="hint box">
          参考 SillyTavern 的正则脚本：用正则表达式自动替换/清理文本。两种作用层——
          <b>仅显示</b>（只改界面上的样子，聊天记录不变）、<b>仅发给AI</b>（只影响发给模型的内容）、
          或<b>两者</b>。替换文本中可用 <code>$1</code> 引用捕获组。模式支持 <code>/xxx/gi</code> 或裸写。
        </div>

        <div className="btn-row">
          <button className="btn primary" onClick={() => void db.regexRules.add(newRule())}>
            ＋ 添加规则
          </button>
        </div>

        {rules.length === 0 && <div className="hint pad">还没有规则。试试加一条：把 AI 回复里的 <code>&lt;think&gt;…&lt;/think&gt;</code> 思考过程隐藏掉。</div>}

        {rules.map((r) => {
          const { error } = compileRules([r])[0];
          return (
            <div key={r.id} className={`entry-card ${r.enabled ? '' : 'off'}`}>
              <div className="entry-head">
                <label className="check" title="是否启用">
                  <input type="checkbox" checked={r.enabled} onChange={(e) => patch(r.id, { enabled: e.target.checked })} />
                  启用
                </label>
                <input className="input grow" value={r.name} onChange={(e) => patch(r.id, { name: e.target.value })} placeholder="规则名称" />
                <button className="icon-btn" title="删除规则" onClick={() => void db.regexRules.delete(r.id)}>
                  🗑
                </button>
              </div>
              <div className="regex-grid">
                <label>
                  查找（正则）
                  <input className="input mono" value={r.find} onChange={(e) => patch(r.id, { find: e.target.value })} placeholder="/&lt;think&gt;[\s\S]*?&lt;\/think&gt;\n?/g" />
                </label>
                <label>
                  替换为（$1 = 捕获组）
                  <input className="input mono" value={r.replace} onChange={(e) => patch(r.id, { replace: e.target.value })} placeholder="留空即删除匹配内容" />
                </label>
                <label>
                  作用层
                  <select className="input select" value={r.scope} onChange={(e) => patch(r.id, { scope: e.target.value as RegexRule['scope'] })}>
                    <option value="display">仅显示</option>
                    <option value="prompt">仅发给AI</option>
                    <option value="both">两者</option>
                  </select>
                </label>
                <label>
                  应用到
                  <select className="input select" value={r.target} onChange={(e) => patch(r.id, { target: e.target.value as RegexRule['target'] })}>
                    <option value="ai">AI 回复</option>
                    <option value="user">我的消息</option>
                    <option value="both">两者</option>
                  </select>
                </label>
              </div>
              {error && <div className="hint err">正则错误：{error}</div>}
            </div>
          );
        })}

        {rules.length > 0 && (
          <div className="field" style={{ marginTop: 18 }}>
            <label>测试一下（按当前启用的显示层规则实时预览）</label>
            <textarea className="textarea" rows={3} value={testIn} onChange={(e) => setTestIn(e.target.value)} placeholder="粘贴一段消息文本试试效果…" />
            {testIn && (
              <>
                <div className="hint" style={{ margin: '6px 0' }}>处理后：</div>
                <div className="entry-card">{testOut || '（空）'}</div>
              </>
            )}
          </div>
        )}

        <h3 className="section">📊 状态栏</h3>
        <div className="hint box">
          状态栏 = 「提示词注入 + 显示/发送双层正则」的组合预设：<b>启用</b>后，每次聊天都会把它的指令注入提示词，
          让 AI 在回复末尾输出状态块；显示层正则把状态块渲染成面板，提示词层正则把历史里的旧状态块清理掉（避免污染上下文）。可在下方自由修改。
        </div>

        {statusBars.map((b) => (
          <div key={b.id} className={`entry-card ${b.enabled ? '' : 'off'}`}>
            <div className="entry-head">
              <label className="check" title="启用后每次聊天注入提示词并应用正则">
                <input type="checkbox" checked={b.enabled} onChange={(e) => patchBar(b.id, { enabled: e.target.checked })} />
                启用
              </label>
              <input className="input grow" value={b.name} onChange={(e) => patchBar(b.id, { name: e.target.value })} placeholder="状态栏名称" />
              <span className="hint mono small-text">{b.marker}…</span>
            </div>
            <label className="stack-label">
              注入的提示词（每次聊天都会带上）
              <textarea className="textarea" rows={3} value={b.prompt} onChange={(e) => patchBar(b.id, { prompt: e.target.value })} />
            </label>
            <div className="regex-grid">
              <label>
                显示层：查找（{b.marker} 行 → 面板）
                <input className="input mono" value={b.displayFind} onChange={(e) => patchBar(b.id, { displayFind: e.target.value })} />
              </label>
              <label>
                显示层：替换为
                <input className="input mono" value={b.displayReplace} onChange={(e) => patchBar(b.id, { displayReplace: e.target.value })} />
              </label>
              <label>
                发给AI层：查找（清理旧状态块）
                <input className="input mono" value={b.promptFind} onChange={(e) => patchBar(b.id, { promptFind: e.target.value })} />
              </label>
              <label>
                发给AI层：替换为
                <input className="input mono" value={b.promptReplace} onChange={(e) => patchBar(b.id, { promptReplace: e.target.value })} />
              </label>
            </div>
            <div className="hint">改动即时生效（自动保存）。显示层替换支持 HTML，会被自动消毒后渲染。</div>
            <div className="btn-row tight">
              <button
                className="btn small"
                title="把提示词与正则恢复成内置最新版本（保留启用状态）"
                onClick={() => {
                  const d = defaultStatusBars.find((x) => x.name === b.name || x.marker === b.marker);
                  if (d) {
                    patchBar(b.id, { ...d, enabled: b.enabled });
                    flash('已恢复默认内容');
                  }
                }}
              >
                ↺ 恢复默认
              </button>
            </div>
          </div>
        ))}

        {statusBars.length === 0 && <div className="hint pad">没有状态栏预设。</div>}

        <h3 className="section">🎨 美化预设</h3>
        <div className="hint box">
          美化预设 = 「提示词指令 + 显示层正则」：挂载到聊天后，指令会随请求注入，<b>由 AI 在合适的剧情里自行选用</b>
          （如发红包、点外卖、逛论坛、翻聊天记录时）。先在下方<b>预览效果</b>，点「认可」后才能在聊天页的
          「扩展 → 挂载美化预设」里勾选。
        </div>

        <div className="btn-row">
          <button className="btn primary" onClick={() => void addBeautifier()}>＋ 添加自定义美化</button>
        </div>

        {beauts.map((b) => (
          <div key={b.id} className="entry-card">
            <div className="entry-head">
              <span className={`approve-badge ${b.approved ? 'on' : ''}`}>{b.approved ? '已认可 ✓' : '未认可'}</span>
              <input className="input grow" value={b.name} onChange={(e) => patchBeaut(b.id, { name: e.target.value })} placeholder="美化名称" />
              <button className="icon-btn" title="删除美化" onClick={() => void db.beautifiers.delete(b.id)}>🗑</button>
            </div>

            <label className="stack-label">
              注入的指令（挂载后随请求发送，AI 自行决定是否使用）
              <textarea className="textarea" rows={3} value={b.prompt} onChange={(e) => patchBeaut(b.id, { prompt: e.target.value })} />
            </label>

            <label className="stack-label">
              预览用的示例输出（可改成你自己的剧情试试效果）
              <textarea className="textarea" rows={3} value={b.sample} onChange={(e) => patchBeaut(b.id, { sample: e.target.value })} />
            </label>

            {(b.rules ?? []).map((r, i) => (
              <div key={i} className="regex-grid">
                <label>
                  显示层规则 {i + 1}：查找
                  <input className="input mono" value={r.find} onChange={(e) => patchBeaut(b.id, { rules: b.rules.map((x, j) => (j === i ? { ...x, find: e.target.value } : x)) })} />
                </label>
                <label>
                  替换为（$1 = 捕获组）
                  <input className="input mono" value={r.replace} onChange={(e) => patchBeaut(b.id, { rules: b.rules.map((x, j) => (j === i ? { ...x, replace: e.target.value } : x)) })} />
                </label>
              </div>
            ))}
            <div className="btn-row tight">
              <button className="btn small" onClick={() => patchBeaut(b.id, { rules: [...(b.rules ?? []), { find: '', replace: '' }] })}>
                ＋ 添加规则
              </button>
              {(b.rules?.length ?? 0) > 1 && (
                <button className="btn small" onClick={() => patchBeaut(b.id, { rules: b.rules.slice(0, -1) })}>
                  删除末条规则
                </button>
              )}
            </div>

            <div className="preview-box">
              <div className="preview-label">👁 预览效果（示例经显示层正则 + Markdown 渲染）</div>
              <div className="preview-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(applyBeautifierRules(b.sample ?? '', b.rules ?? [])) }} />
            </div>

            <button className={`btn ${b.approved ? '' : 'primary'}`} onClick={() => patchBeaut(b.id, { approved: !b.approved })}>
              {b.approved ? '↩ 取消认可（聊天中将无法挂载）' : '✓ 认可效果（允许在聊天中挂载）'}
            </button>
          </div>
        ))}

        {beauts.length === 0 && <div className="hint pad">还没有美化预设，点上方按钮添加。</div>}
      </div>
      <Toast msg={toast} />
    </>
  );
}
