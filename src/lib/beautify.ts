import type { Beautifier } from '../types';

/** 内置美化预设：注入提示词供 AI 在剧情中选用；用户在正则页预览认可后才能挂载到聊天 */
export const defaultBeautifiers: Omit<Beautifier, 'id'>[] = [
  {
    name: '仿论坛帖子',
    approved: false,
    prompt:
      '【论坛帖美化】当剧情中出现"发帖、回帖、逛论坛、看帖子"等场景时，你可以用如下格式输出一个论坛帖子卡片：\n' +
      '【论坛帖】标题=帖子标题; 楼主=昵称; 楼层=楼层号\n帖子正文（可以多行）\n【/论坛帖】\n' +
      '是否使用由你根据剧情决定，日常对话请保持正常格式。',
    sample:
      '（她刷着手机忽然笑出声）你看这个帖子——\n\n【论坛帖】标题=月光书馆真的存在吗？; 楼主=夜行者; 楼层=1\n如题，昨晚在城西旧巷看见一座漂浮的图书馆，门口的灯是星星做的。有人一起去探吗？',
    rules: [
      {
        find: '\\n?【论坛帖】标题=([^;\\n]*);\\s*楼主=([^;\\n]*);\\s*楼层=(\\d+)\\n([\\s\\S]*?)\\n?【/论坛帖】\\n?',
        replace:
          '\n\n<div class="bx-forum"><div class="bx-forum-h"><span class="bx-forum-t">$1</span><span class="bx-forum-m">楼主：$2 · $3楼</span></div><div class="bx-forum-b">$4</div><div class="bx-forum-f">💬 回复　👍 点赞　⭐ 收藏</div></div>\n\n',
      },
    ],
  },
  {
    name: '微信红包',
    approved: false,
    prompt:
      '【红包美化】当剧情中出现"发红包"的场景时，你可以用如下格式输出一个红包卡片：\n' +
      '【红包】金额=8.88; 祝福=恭喜发财\n是否使用由你根据剧情决定。',
    sample: '（她拿起手机点了点，递到你面前）给你的。\n\n【红包】金额=8.88; 祝福=恭喜发财，书馆常来',
    rules: [
      {
        find: '\\n?【红包】金额=([^;\\n]*);\\s*祝福=([^\\n]*)\\n?',
        replace:
          '\n\n<div class="bx-hb"><div class="bx-hb-l">🧧</div><div class="bx-hb-m"><b>$2</b><i>点击领取红包</i></div><div class="bx-hb-r">¥$1</div></div>\n\n',
      },
    ],
  },
  {
    name: '外卖订单',
    approved: false,
    prompt:
      '【外卖美化】当剧情中出现"点外卖、送餐、取餐"等场景时，你可以用如下格式输出一个外卖订单卡片：\n' +
      '【外卖】店名=店名; 状态=订单状态; 商品=商品×数量、商品×数量; 合计=金额; 预计=送达时间\n是否使用由你根据剧情决定。',
    sample:
      '（门铃响了，她拎着袋子回来）你的奶茶到啦。\n\n【外卖】店名=茶百道·月光书馆店; 状态=骑手已送达; 商品=杨枝甘露×1、芋泥啵啵×1; 合计=36; 预计=已送达',
    rules: [
      {
        find:
          '\\n?【外卖】店名=([^;\\n]*);\\s*状态=([^;\\n]*);\\s*商品=([^;\\n]*);\\s*合计=([^;\\n]*);\\s*预计=([^\\n]*)\\n?',
        replace:
          '\n\n<div class="bx-takeout"><div class="bx-to-h"><b>🛵 $1</b><span>$2</span></div><div class="bx-to-b"><div>🧋 $3</div><div>💰 合计：<b>¥$4</b></div><div>⏱ 预计$5</div></div></div>\n\n',
      },
    ],
  },
  {
    name: '仿微信聊天记录',
    approved: false,
    prompt:
      '【微信记录美化】当剧情中出现"翻看手机、查看聊天记录、转发记录"等场景时，你可以用如下格式输出一张聊天记录卡片（单行，多条消息用 // 分隔）：\n' +
      '【微信记录】标题=与xx的聊天记录 | 内容=名字: 消息 // 名字: 消息 // 名字: 消息\n是否使用由你根据剧情决定。',
    sample:
      '（他把手机推到你面前）自己看吧。\n\n【微信记录】标题=与露娜的聊天记录 | 内容=阿风: 今晚书馆见？ // 露娜: 嗯，老地方。 // 阿风: 带上那本会发光的书',
    rules: [
      {
        find: '\\n?【微信记录】标题=([^|\\n]+)\\s*\\|\\s*内容=(.*)$',
        replace:
          '\n\n<div class="bx-wxlog"><div class="bx-wxlog-t">$1</div><div class="bx-wxlog-b">$2</div><div class="bx-wxlog-f">💬 聊天记录</div></div>\n\n',
      },
      { find: ' // ', replace: '<br>' },
    ],
  },
];

/** 应用美化预设的显示层规则（顺序执行每条规则） */
export function applyBeautifierDisplay(text: string, beauts: Beautifier[]): string {
  let out = text;
  for (const b of beauts) {
    for (const r of b.rules ?? []) {
      if (!r.find.trim()) continue;
      try {
        const re = new RegExp(r.find, 'gm');
        out = out.replace(re, r.replace);
      } catch {
        /* 非法正则跳过 */
      }
    }
  }
  return out;
}

/** 单个美化预设的规则应用（预览用） */
export function applyBeautifierRules(sample: string, rules: { find: string; replace: string }[]): string {
  let out = sample;
  for (const r of rules ?? []) {
    if (!r.find.trim()) continue;
    try {
      out = out.replace(new RegExp(r.find, 'gm'), r.replace);
    } catch {
      /* skip */
    }
  }
  return out;
}
