import type { RegexRule, RegexScope, RegexTarget } from '../types';

export interface CompiledRule {
  rule: RegexRule;
  re: RegExp;
  error?: string;
}

/** 兼容 "/pattern/flags" 与裸模式两种写法（参考 SillyTavern 的书写习惯） */
export function parsePattern(find: string, fallbackFlags = 'g'): { source: string; flags: string } | null {
  const s = find.trim();
  if (!s) return null;
  const m = /^\/(.+)\/([a-z]*)$/s.exec(s);
  if (m) return { source: m[1], flags: m[2] || fallbackFlags };
  return { source: s, flags: fallbackFlags };
}

export function compileRules(rules: RegexRule[]): CompiledRule[] {
  return rules.map((rule) => {
    const parsed = parsePattern(rule.find);
    if (!parsed) return { rule, re: /$^/, error: '模式为空' };
    try {
      return { rule, re: new RegExp(parsed.source, parsed.flags.includes('g') ? parsed.flags : parsed.flags + 'g') };
    } catch (e) {
      return { rule, re: /$^/, error: (e as Error).message };
    }
  });
}

function applies(rule: RegexRule, role: 'user' | 'assistant'): boolean {
  if (rule.target === 'both') return true;
  return rule.target === 'user' ? role === 'user' : role === 'assistant';
}

function run(rules: CompiledRule[], text: string, scope: Exclude<RegexScope, 'both'>): string {
  let out = text;
  for (const { rule, re, error } of rules) {
    if (error || !rule.enabled) continue;
    if (rule.scope !== 'both' && rule.scope !== scope) continue;
    try {
      out = out.replace(re, rule.replace);
    } catch {
      // 替换阶段异常则跳过该条
    }
  }
  return out;
}

/** 应用「显示层」规则：只影响界面渲染，不改动保存的原文 */
export function applyDisplayRules(text: string, rules: RegexRule[], role: 'user' | 'assistant'): string {
  const compiled = compileRules(rules.filter((r) => applies(r, role)));
  return run(compiled, text, 'display');
}

/** 应用「提示词层」规则：影响发给模型的历史文本 */
export function applyPromptRules(text: string, rules: RegexRule[], role: 'user' | 'assistant'): string {
  const compiled = compileRules(rules.filter((r) => applies(r, role)));
  return run(compiled, text, 'prompt');
}
