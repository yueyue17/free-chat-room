import type { StatusBarPreset } from '../types';

export const STATUSBAR_VER = 2;

/** 内置状态栏预设（v2：更多属性 + 富卡片 + 动态效果；可恢复默认） */
export const defaultStatusBars: Omit<StatusBarPreset, 'id'>[] = [
  {
    name: '好感度状态栏',
    enabled: false,
    ver: STATUSBAR_VER,
    prompt:
      '【状态栏要求】每次回复的最末尾，另起一行输出如下格式的状态栏（严格遵守格式，不要翻译、不要加粗、不要遗漏，字段顺序固定）：\n' +
      '【状态栏】❤️好感：{0-100的数字} | 😊心情：{简短词语} | ⚡精力：{0-100} | 🕐时间：{简短} | 📍地点：{简短} | ✨事件：{一句话}\n' +
      '除该行外，正文中不要出现"状态栏"三个字。',
    marker: '【状态栏】',
    displayFind: '^【状态栏】\\s*\\n?(.*)$',
    displayReplace:
      '\n\n<div class="statusbar rich"><div class="sb-head"><span class="sb-dot"></span>📊 当前状态</div><div class="sb-body">$1</div></div>\n\n',
    promptFind: '【状态栏】[\\s\\S]*?(?=\\n|$)',
    promptReplace: '',
  },
  {
    name: '回合信息面板',
    enabled: false,
    ver: STATUSBAR_VER,
    prompt:
      '【回合面板要求】每次回复的最末尾，另起一行输出如下格式的回合面板（严格遵守格式，不要翻译、不要加粗）：\n' +
      '【回合】🎬回合：{第N回合} | 🕐时间：{简短} | 📍地点：{简短} | 🌤天气：{简短} | 🎯当前事件：{一句话} | 💭氛围：{两个字}\n' +
      '除该行外，正文中不要出现"回合面板"字样。',
    marker: '【回合】',
    displayFind: '^【回合】\\s*\\n?(.*)$',
    displayReplace:
      '\n\n<div class="statusbar alt rich"><div class="sb-head">🎬 本回合</div><div class="sb-body">$1</div></div>\n\n',
    promptFind: '【回合】[\\s\\S]*?(?=\\n|$)',
    promptReplace: '',
  },
  {
    name: '关系进度条',
    enabled: false,
    ver: STATUSBAR_VER,
    prompt:
      '【关系进度要求】每次回复的最末尾，另起一行输出如下格式的进度条（用▮填充、▯留空，严格遵守格式）：\n' +
      '【关系】💞好感：{▮/▯共10格} {0-100} | 🤝信任：{▮/▯共10格} {0-100} | 🧩默契：{▮/▯共10格} {0-100}\n' +
      '进度条数值根据剧情缓慢变化，不要跳变。',
    marker: '【关系】',
    displayFind: '^【关系】\\s*\\n?(.*)$',
    displayReplace:
      '\n\n<div class="statusbar bars rich"><div class="sb-head">💞 关系图谱</div><div class="sb-body">$1</div></div>\n\n',
    promptFind: '【关系】[\\s\\S]*?(?=\\n|$)',
    promptReplace: '',
  },
];

/** 显示层：把 AI 输出的状态块渲染成面板 */
export function applyStatusBarDisplay(text: string, bars: StatusBarPreset[]): string {
  let out = text;
  for (const b of bars) {
    if (!b.enabled || !b.displayFind.trim()) continue;
    try {
      const re = new RegExp(b.displayFind, 'gm');
      out = out.replace(re, b.displayReplace);
    } catch {
      /* 正则非法则跳过 */
    }
  }
  return out;
}

/** 提示词层：清理历史消息里的旧状态块，避免上下文被污染 */
export function applyStatusBarPrompt(text: string, bars: StatusBarPreset[]): string {
  let out = text;
  for (const b of bars) {
    if (!b.enabled || !b.promptFind.trim()) continue;
    try {
      const re = new RegExp(b.promptFind, 'gm');
      out = out.replace(re, b.promptReplace);
    } catch {
      /* skip */
    }
  }
  return out;
}
