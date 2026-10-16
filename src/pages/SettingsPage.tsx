import { useRef, useState } from 'react';
import { db } from '../db';
import { loadSettings, saveSettings } from '../lib/settings';
import { testConnection } from '../lib/llm';
import { Field, TopBar, Toast } from '../components';
import type { Settings, ThemeId } from '../types';

const THEMES: { id: ThemeId; label: string; swatch: string[] }[] = [
  { id: 'mono', label: '黑白极简', swatch: ['#ffffff', '#17171a'] },
  { id: 'green', label: '浅绿清新', swatch: ['#eaf7ef', '#2ea36b'] },
  { id: 'blue', label: '深蓝梦幻', swatch: ['#0e1530', '#7c8cff'] },
  { id: 'red', label: '红白极简', swatch: ['#ffffff', '#d23c3c'] },
];

export default function SettingsPage() {
  const [s, setS] = useState(loadSettings());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  async function fetchModels() {
    if (!s.baseUrl.trim()) {
      setTestResult('❌ 请先填写接口地址');
      return;
    }
    setLoadingModels(true);
    setModels([]);
    try {
      const res = await fetch(`${s.baseUrl.replace(/\/+$/, '')}/models`, {
        headers: { ...(s.apiKey ? { Authorization: `Bearer ${s.apiKey}` } : {}) },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}：${(await res.text()).slice(0, 120)}`);
      const j = (await res.json()) as { data?: { id?: string }[] };
      const list = (j.data ?? []).map((m) => m.id ?? '').filter(Boolean).sort();
      if (!list.length) throw new Error('接口未返回模型列表');
      setModels(list);
      if (!list.includes(s.model) && list.length) set('model', list[0]);
      setTestResult(`✓ 拉取到 ${list.length} 个模型，在下方下拉框选择`);
    } catch (err) {
      setTestResult('❌ 拉取失败：' + (err as Error).message);
    } finally {
      setLoadingModels(false);
    }
  }

  function set<K extends keyof Settings>(k: K, v: Settings[K]) {
    const next = { ...s, [k]: v };
    setS(next);
    saveSettings(next);
  }

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await testConnection(s));
    } catch (err) {
      setTestResult('❌ ' + (err as Error).message);
    } finally {
      setTesting(false);
    }
  }

  async function exportBackup() {
    const data = {
      app: 'ai-tavern',
      version: 1,
      exportedAt: new Date().toISOString(),
      characters: await db.characters.toArray(),
      sessions: await db.sessions.toArray(),
      messages: await db.messages.toArray(),
      worldbooks: await db.worldbooks.toArray(),
      settings: { ...s, apiKey: '' },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ai-tavern-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text()) as {
        characters?: unknown[];
        sessions?: unknown[];
        messages?: unknown[];
        worldbooks?: unknown[];
      };
      await db.transaction('rw', [db.characters, db.sessions, db.messages, db.worldbooks], async () => {
        if (data.characters) await db.characters.bulkPut(data.characters as never[]);
        if (data.sessions) await db.sessions.bulkPut(data.sessions as never[]);
        if (data.messages) await db.messages.bulkPut(data.messages as never[]);
        if (data.worldbooks) await db.worldbooks.bulkPut(data.worldbooks as never[]);
      });
      flash('备份导入成功');
    } catch (err) {
      flash('导入失败：' + (err as Error).message);
    }
  }

  async function clearAll() {
    if (!confirm('清空所有本地数据（角色、聊天、世界书、设置）？此操作不可恢复！')) return;
    await db.delete();
    localStorage.removeItem('ai-tavern.settings');
    location.hash = '/';
    location.reload();
  }

  return (
    <>
      <TopBar title="设置" backTo="/" />
      <div className="content form-page">
        <h3 className="section">🔌 模型接入</h3>
        <Field label="模式" hint="演示模式无需任何密钥，回复为固定演示内容">
          <select className="input select" value={s.provider} onChange={(e) => set('provider', e.target.value as Settings['provider'])}>
            <option value="mock">演示模式（无需 API Key）</option>
            <option value="openai">OpenAI 兼容接口</option>
          </select>
        </Field>

        {s.provider === 'openai' && (
          <>
            <Field label="接口地址 Base URL" hint="如 https://api.openai.com/v1、https://api.deepseek.com/v1（需支持浏览器跨域访问）">
              <input className="input" value={s.baseUrl} onChange={(e) => set('baseUrl', e.target.value)} placeholder="https://api.deepseek.com/v1" />
            </Field>
            <Field label="API Key" hint="仅保存在你的浏览器本地，不会上传">
              <input className="input" type="password" value={s.apiKey} onChange={(e) => set('apiKey', e.target.value)} placeholder="sk-…" />
            </Field>
            <Field label="模型名称" hint="可点「拉取模型」自动获取">
              <input className="input" value={s.model} onChange={(e) => set('model', e.target.value)} placeholder="deepseek-chat / gpt-4o-mini …" />
            </Field>
            {models.length > 0 && (
              <Field label={`可用模型（${models.length} 个，点选即填入）`}>
                <select className="input select" value="" onChange={(e) => e.target.value && set('model', e.target.value)}>
                  <option value="">选择模型…</option>
                  {models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </Field>
            )}
            <div className="btn-row">
              <button className="btn" disabled={loadingModels} onClick={() => void fetchModels()}>
                {loadingModels ? '拉取中…' : '⬇ 拉取模型'}
              </button>
              <button className="btn" disabled={testing} onClick={() => void runTest()}>
                {testing ? '测试中…' : '测试连接'}
              </button>
            </div>
            {testResult && <div className="hint box">{testResult}</div>}
          </>
        )}

        <Field label={`创作温度 temperature：${s.temperature}`} hint="越高越发散有创造力，越低越稳定">
          <input type="range" min={0} max={2} step={0.1} value={s.temperature} onChange={(e) => set('temperature', Number(e.target.value))} style={{ width: '100%' }} />
        </Field>
        <Field label="上下文最大历史条数" hint="每次请求携带的最近消息数量，太大更费 token">
          <input className="input" type="number" min={4} max={200} value={s.maxHistory} onChange={(e) => set('maxHistory', Number(e.target.value) || 40)} />
        </Field>
        <Field label="世界书注入预算（字符）">
          <input className="input" type="number" min={500} max={50000} value={s.worldBookBudget} onChange={(e) => set('worldBookBudget', Number(e.target.value) || 6000)} />
        </Field>

        <h3 className="section">🎨 主题</h3>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button key={t.id} className={`theme-card ${s.theme === t.id ? 'active' : ''}`} onClick={() => set('theme', t.id)}>
              <span className="swatch">
                <i style={{ background: t.swatch[0] }} />
                <i style={{ background: t.swatch[1] }} />
              </span>
              {t.label}
            </button>
          ))}
        </div>
        <Field label="自定义 CSS" hint="作用于整站，可用类名：.app .topbar .messages .bubble .msg-row .composer .card 等；CSS 变量：--bg --surface --accent --text">
          <textarea className="textarea css" rows={6} value={s.customCss} onChange={(e) => set('customCss', e.target.value)} placeholder={'.bubble {\n  border-radius: 20px;\n}\n:root {\n  --accent: #ff7eb6;\n}'} />
        </Field>

        <h3 className="section">💾 数据（全部保存在本浏览器）</h3>
        <div className="btn-row">
          <button className="btn" onClick={() => void exportBackup()}>导出备份</button>
          <button className="btn" onClick={() => backupRef.current?.click()}>导入备份</button>
          <button className="btn danger" onClick={() => void clearAll()}>清空数据</button>
          <input ref={backupRef} type="file" accept=".json" hidden onChange={(e) => void importBackup(e)} />
        </div>
      </div>
      <Toast msg={toast} />
    </>
  );
}
