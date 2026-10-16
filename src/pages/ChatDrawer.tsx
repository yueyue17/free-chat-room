import { useRef } from 'react';
import { db, now } from '../db';
import { fileToAvatarDataUrl } from '../lib/img';
import { REPLY_LENGTH_PRESETS, STYLE_PRESETS } from '../lib/stylepresets';
import type { Beautifier, ChatSession } from '../types';

const BUBBLE_STYLES = [
  { id: 'default', label: '默认', desc: '跟随主题' },
  { id: 'qq', label: 'QQ 风', desc: '经典蓝白气泡' },
  { id: 'wx', label: '微信风', desc: '绿色气泡' },
  { id: 'paper', label: '信纸风', desc: '衬线字体信笺' },
];

export default function ChatDrawer({
  tab,
  session,
  beautifiers,
  onClose,
  onSwitch,
}: {
  tab: 'settings' | 'extend';
  session: ChatSession;
  beautifiers: Beautifier[];
  onClose: () => void;
  onSwitch: (t: 'settings' | 'extend') => void;
}) {
  const bgRef = useRef<HTMLInputElement>(null);

  function patch(p: Partial<ChatSession>) {
    void db.sessions.update(session.id, { ...p, updatedAt: now() });
  }

  async function onBg(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      patch({ bgImage: await fileToAvatarDataUrl(f, 1600) });
    } catch {
      /* ignore */
    }
  }

  const mounted = session.mountedIds ?? [];
  const approved = beautifiers.filter((b) => b.approved);

  return (
    <>
      <div className="drawer-mask" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-tabs">
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => onSwitch('settings')}>
            设置
          </button>
          <button className={tab === 'extend' ? 'active' : ''} onClick={() => onSwitch('extend')}>
            扩展
          </button>
          <button className="icon-btn close" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        {tab === 'settings' && (
          <div className="drawer-body">
            <div className="field">
              <label>回复字数（留空为不限）</label>
              <input
                className="input"
                value={session.replyLength ?? ''}
                onChange={(e) => patch({ replyLength: e.target.value })}
                placeholder="例如：150-400字"
              />
              <div className="chip-row">
                {REPLY_LENGTH_PRESETS.filter(Boolean).map((p) => (
                  <button key={p} className="chip" onClick={() => patch({ replyLength: p })}>
                    {p}
                  </button>
                ))}
                <button className="chip" onClick={() => patch({ replyLength: '' })}>不限</button>
              </div>
            </div>

            <div className="field">
              <label>文风（自定义框，会原文注入提示词；点预设快速填充）</label>
              <textarea
                className="textarea"
                rows={4}
                value={session.styleText ?? ''}
                onChange={(e) => patch({ styleText: e.target.value, styleId: undefined })}
                placeholder="例如：民国旧上海腔，称呼用『侬』，克制而含蓄；或直接点下面的预设再改。"
              />
              <div className="chip-row">
                {STYLE_PRESETS.map((s) => (
                  <button
                    key={s.id}
                    className={`chip ${session.styleId === s.id ? 'active' : ''}`}
                    onClick={() => patch({ styleText: s.prompt, styleId: s.id })}
                  >
                    {s.label}
                  </button>
                ))}
                <button className="chip" onClick={() => patch({ styleText: '', styleId: undefined })}>清空</button>
              </div>
            </div>

            <div className="field">
              <label>剧情走向（每次回复都会注入提示词）</label>
              <textarea
                className="textarea"
                rows={3}
                value={session.plotDirection ?? ''}
                onChange={(e) => patch({ plotDirection: e.target.value })}
                placeholder="例如：轻松日常为主，感情线缓慢升温；中期引入一场误会让两人短暂分离。"
              />
            </div>

            <label className="check big">
              <input
                type="checkbox"
                checked={session.assistOn !== false}
                onChange={(e) => patch({ assistOn: e.target.checked })}
              />
              开启辅助回复（AI 回复后给出 3 条候选回答）
            </label>
            <div className="hint">以上设置仅对当前聊天生效，改动即时保存。</div>
          </div>
        )}

        {tab === 'extend' && (
          <div className="drawer-body">
            <div className="field">
              <label>挂载美化预设（发送请求时注入指令，AI 自行决定是否使用）</label>
              {approved.length === 0 ? (
                <div className="hint">还没有已认可的美化预设——去「正则」页预览并认可后，这里就能挂载。</div>
              ) : (
                <div className="check-list">
                  {approved.map((b) => (
                    <label key={b.id} className="check">
                      <input
                        type="checkbox"
                        checked={mounted.includes(b.id)}
                        onChange={(e) =>
                          patch({
                            mountedIds: e.target.checked
                              ? [...mounted, b.id]
                              : mounted.filter((x) => x !== b.id),
                          })
                        }
                      />
                      {b.name}
                    </label>
                  ))}
                </div>
              )}
              <div className="hint">注意：状态栏预设不走这里——只要在「正则」页启用就始终注入。</div>
            </div>

            <div className="field">
              <label>聊天气泡样式</label>
              <div className="bubble-grid">
                {BUBBLE_STYLES.map((b) => (
                  <button
                    key={b.id}
                    className={`bubble-card ${(session.bubbleStyle ?? 'default') === b.id ? 'active' : ''}`}
                    onClick={() => patch({ bubbleStyle: b.id })}
                  >
                    <b>{b.label}</b>
                    <span>{b.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>聊天背景</label>
              <div className="btn-row">
                <button className="btn" onClick={() => bgRef.current?.click()}>上传背景图</button>
                {session.bgImage && (
                  <button className="btn danger" onClick={() => patch({ bgImage: undefined })}>清除背景</button>
                )}
                <input ref={bgRef} type="file" accept="image/*" hidden onChange={onBg} />
              </div>
              {session.bgImage && (
                <div className="bg-thumb" style={{ backgroundImage: `url(${session.bgImage})` }} />
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
