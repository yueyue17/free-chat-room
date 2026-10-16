import type { ReactNode } from 'react';
import { nav } from './lib/router';

export function Avatar({ src, name, size = 40 }: { src?: string; name: string; size?: number }) {
  if (src) return <img className="avatar" src={src} alt={name} style={{ width: size, height: size }} />;
  return (
    <div className="avatar avatar-ph" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}>
      {(name || '?').slice(0, 1)}
    </div>
  );
}

export function TopBar({
  title,
  backTo,
  right,
}: {
  title: ReactNode;
  backTo?: string;
  right?: ReactNode;
}) {
  return (
    <header className="topbar">
      <div className="topbar-side">
        {backTo !== undefined && (
          <button className="icon-btn" onClick={() => nav(backTo)} aria-label="返回">
            ‹
          </button>
        )}
      </div>
      <div className="topbar-title">{title}</div>
      <div className="topbar-side right">{right}</div>
    </header>
  );
}

/** 首页四大栏：角色 / 聊天 / 人设 / 正则 */
export function TabBar({ active }: { active: 'chars' | 'chats' | 'persona' | 'regex' }) {
  const tabs: { key: typeof active; label: string; to: string }[] = [
    { key: 'chars', label: '角色', to: '/' },
    { key: 'chats', label: '聊天', to: '/chats' },
    { key: 'persona', label: '人设', to: '/persona' },
    { key: 'regex', label: '正则', to: '/regex' },
  ];
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.key} className={active === t.key ? 'active' : ''} onClick={() => nav(t.to)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <div className="toast">{msg}</div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      {sub && <div className="empty-sub">{sub}</div>}
    </div>
  );
}

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (sameDay) return hm;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}
