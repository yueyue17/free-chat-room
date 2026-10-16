import type { Beautifier, CharacterCard, ChatMessage, RegexRule, Settings, StatusBarPreset, WorldBook, WorldEntry } from '../types';
import { db } from '../db';
import type { LlmMessage } from './llm';
import { applyPromptRules } from './regex';
import { applyStatusBarPrompt } from './statusbar';

export function fillMacros(text: string, charName: string, userName: string): string {
  return text
    .replaceAll('{{char}}', charName)
    .replaceAll('{{user}}', userName)
    .replaceAll('<BOT>', charName);
}

export function swipeText(m: ChatMessage): string {
  if (m.swipes?.length) return m.swipes[m.activeSwipe ?? m.swipes.length - 1];
  return m.content;
}

/** 解析某角色聊天时生效的用户人设：优先角色绑定的人设，否则用设置里的默认人设 */
export async function resolvePersona(
  character: CharacterCard,
  settings: Settings,
): Promise<{ name: string; description: string }> {
  if (character.personaId) {
    const p = await db.personas.get(character.personaId);
    if (p) return { name: p.name || settings.userName || '我', description: p.description };
  }
  return { name: settings.userName || '我', description: settings.userDescription };
}

export function collectEntries(books: WorldBook[]): WorldEntry[] {
  return books.flatMap((b) => b.entries.filter((e) => e.enabled));
}

/** 扫描命中：常驻条目永远注入；其余条目当文本中出现关键词时注入。按 order 排序并受字符预算约束 */
export function scanWorldEntries(entries: WorldEntry[], text: string, budget: number): WorldEntry[] {
  const lower = text.toLowerCase();
  const hit = entries.filter((e) => e.constant || e.keys.some((k) => k.trim() && lower.includes(k.trim().toLowerCase())));
  hit.sort((a, b) => a.order - b.order || a.content.length - b.content.length);
  const out: import('../types').WorldEntry[] = [];
  let total = 0;
  for (const e of hit) {
    if (total + e.content.length > budget && out.length) continue;
    total += e.content.length;
    out.push(e);
  }
  return out;
}

export async function buildLlmMessages(opts: {
  character: CharacterCard;
  sessionId: string;
  settings: Settings;
}): Promise<LlmMessage[]> {
  const { character, sessionId, settings } = opts;
  const session = await db.sessions.get(sessionId);
  const msgs = await db.messages.where('sessionId').equals(sessionId).sortBy('ts');
  const history = msgs.filter((m) => m.role !== 'system').slice(-Math.max(2, settings.maxHistory));

  // 提示词层正则：只影响发给模型的历史，不改动聊天记录
  const rules = (await db.regexRules.toArray()) as RegexRule[];
  const bars = (await db.statusBars.toArray()).filter((b) => b.enabled);
  const promptText = (m: ChatMessage) => {
    const role = m.role === 'user' ? 'user' : 'assistant';
    return applyStatusBarPrompt(applyPromptRules(swipeText(m), rules, role), bars);
  };

  const books = character.worldBookIds?.length ? await db.worldbooks.bulkGet(character.worldBookIds) : [];
  const entries = collectEntries(books.filter(Boolean) as WorldBook[]);
  const scanText = history.slice(-6).map(swipeText).join('\n');
  const world = scanWorldEntries(entries, scanText, settings.worldBookBudget);

  const persona = await resolvePersona(character, settings);
  const char = character.name || '角色';
  const user = persona.name;
  const parts: string[] = [
    `你将扮演"${char}"，与"${user}"进行沉浸式文字角色扮演。请始终保持角色，以${char}的身份用第一人称回复；` +
      `动作与神态用括号或斜体描写；不要代替${user}做出行动或发言，不要跳出角色。`,
  ];
  if (character.description.trim()) parts.push(`【${char}的设定】\n${character.description}`);
  if (character.personality.trim()) parts.push(`【${char}的性格】\n${character.personality}`);
  if (character.scenario.trim()) parts.push(`【当前场景】\n${character.scenario}`);
  if (persona.description.trim()) parts.push(`【${user}的人设】\n${persona.description}`);
  if (world.length) parts.push(`【世界观与背景设定】（与对话相关时遵循）\n${world.map((e) => `- ${e.content}`).join('\n')}`);
  if (character.exampleDialogs.trim()) parts.push(`【示例对话】（模仿文风与格式）\n${character.exampleDialogs.trim()}`);
  // 状态栏预设：启用的按顺序注入为提示词（始终生效）
  for (const b of bars) {
    if (b.prompt.trim()) parts.push(b.prompt.trim());
  }
  // 会话级聊天设置：字数 / 文风（自定义框） / 剧情走向
  const sessionParts: string[] = [];
  if (session?.replyLength?.trim()) sessionParts.push(`回复字数：每条回复控制在 ${session.replyLength.trim()} 左右。`);
  const styleText = session?.styleText?.trim();
  if (styleText) sessionParts.push(`【文风要求】${styleText}`);
  if (session?.plotDirection?.trim()) sessionParts.push(`剧情走向：${session.plotDirection.trim()}`);
  if (sessionParts.length) parts.push(`【本次对话的写作要求】\n${sessionParts.join('\n')}`);
  // 挂载的美化预设：注入指令，由 AI 根据剧情自行决定是否使用
  const mounted = (await db.beautifiers.bulkGet(session?.mountedIds ?? [])).filter(
    (b): b is Beautifier => !!b && b.approved,
  );
  for (const b of mounted) {
    if (b.prompt.trim()) parts.push(`${b.prompt.trim()}\n（是否使用由你根据剧情灵活决定，不要每条回复都强行使用）`);
  }

  const out: LlmMessage[] = [{ role: 'system', content: fillMacros(parts.join('\n\n'), char, user) }];
  for (const m of history) out.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: promptText(m) });
  return out;
}
