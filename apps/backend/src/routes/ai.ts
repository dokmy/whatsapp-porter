import { Router } from 'express';
import { prisma } from '../db';
import { config } from '../config';

const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const DEFAULT_SYSTEM_PROMPT = `你係一個香港律師嘅WhatsApp助手。你要幫佢草擬回覆訊息。

重要規則：
- 用廣東話口語回覆（唔好用書面語）
- 語氣要友善、專業，似真人對話
- 回覆要簡潔，唔好太長
- 如果係法律相關嘅問題，要專業但易明
- 唔好用emoji，除非對方先用
- 直接寫回覆內容，唔好加任何解釋或者前綴`;

const JARVIS_SYSTEM_PROMPT = `你係 Jarvis，一個香港律師嘅私人AI助手。你可以睇到所有被監控嘅WhatsApp群組嘅訊息。

你嘅職責：
- 分析各個群組嘅訊息，回答用戶嘅問題
- 幫手搵出邊個客戶有投訴、邊個群組未回覆等等
- 用廣東話口語回覆
- 回覆要清晰、有條理
- 如果唔肯定，就講「我唔太確定，你可以再check下」
- 唔好編造冇出現過嘅訊息內容

你只係讀取訊息嚟分析，唔會發送任何訊息去WhatsApp群組。`;

const router = Router();

async function getSystemPrompt(): Promise<string> {
  const setting = await prisma.setting.findUnique({ where: { key: 'aiSystemPrompt' } });
  if (setting) {
    try { return JSON.parse(setting.value); } catch { return setting.value; }
  }
  return DEFAULT_SYSTEM_PROMPT;
}

async function getJarvisPrompt(): Promise<string> {
  const setting = await prisma.setting.findUnique({ where: { key: 'jarvisSystemPrompt' } });
  if (setting) {
    try { return JSON.parse(setting.value); } catch { return setting.value; }
  }
  return JARVIS_SYSTEM_PROMPT;
}

async function getGeminiKey(): Promise<string> {
  const setting = await prisma.setting.findUnique({ where: { key: 'geminiApiKey' } });
  if (setting) {
    try { const v = JSON.parse(setting.value); if (v) return v; } catch { if (setting.value) return setting.value; }
  }
  return config.geminiApiKey;
}

async function callGemini(systemPrompt: string, contents: { role: string; parts: { text: string }[] }[]) {
  const apiKey = await getGeminiKey();
  if (!apiKey) throw new Error('Gemini API key not set. Go to Settings to add it.');

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.8, topP: 0.9, maxOutputTokens: 1000 },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error: ${err}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

// Draft a reply for a specific group
router.post('/draft', async (req, res) => {
  const { groupId } = req.body;
  if (!groupId) return res.status(400).json({ error: 'groupId required' });


  const messages = await prisma.message.findMany({
    where: { groupId },
    orderBy: { timestamp: 'desc' },
    take: 30,
  });
  messages.reverse();

  if (messages.length === 0) return res.status(400).json({ error: 'No messages to draft a reply to' });

  const group = await prisma.group.findUnique({ where: { id: groupId } });
  const chatContext = messages.map(m => {
    const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const media = m.mediaType ? ` [sent ${m.mediaType}]` : '';
    return `[${time}] ${m.senderName}: ${m.content}${media}`;
  }).join('\n');

  const systemPrompt = await getSystemPrompt();
  const userPrompt = `以下係WhatsApp群組「${group?.name || groupId}」嘅最近對話：\n\n${chatContext}\n\n請根據以上對話內容，草擬一個合適嘅回覆。`;

  try {
    const draft = await callGemini(systemPrompt, [{ role: 'user', parts: [{ text: userPrompt }] }]);
    res.json({ draft });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Jarvis — chat with context from all monitored groups
router.post('/jarvis', async (req, res) => {
  const { question, history } = req.body;
  if (!question) return res.status(400).json({ error: 'question required' });


  // Fetch recent messages from all monitored groups
  const monitored = await prisma.monitoredGroup.findMany({ where: { enabled: true } });
  const groupIds = monitored.map(m => m.groupId);

  const allMessages = await prisma.message.findMany({
    where: { groupId: { in: groupIds } },
    orderBy: { timestamp: 'desc' },
    take: 200,
    include: { group: { select: { name: true } } },
  });
  allMessages.reverse();

  // Build context grouped by group
  const byGroup: Record<string, { name: string; msgs: string[] }> = {};
  for (const m of allMessages) {
    if (!byGroup[m.groupId]) {
      byGroup[m.groupId] = { name: m.group.name, msgs: [] };
    }
    const time = new Date(m.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const media = m.mediaType ? ` [${m.mediaType}]` : '';
    byGroup[m.groupId].msgs.push(`[${time}] ${m.senderName}: ${m.content}${media}`);
  }

  let context = '';
  for (const [, data] of Object.entries(byGroup)) {
    context += `\n═══ 群組: ${data.name} ═══\n`;
    context += data.msgs.join('\n') + '\n';
  }

  const systemPrompt = await getJarvisPrompt();

  // Build conversation with history
  const contents: { role: string; parts: { text: string }[] }[] = [];

  // First message always includes the context
  const contextPrefix = `以下係所有被監控WhatsApp群組嘅最近訊息：\n${context}\n\n---\n\n`;

  // Add conversation history
  if (history && Array.isArray(history)) {
    for (let i = 0; i < history.length; i++) {
      const h = history[i];
      const text = i === 0 ? contextPrefix + h.text : h.text;
      contents.push({ role: h.role, parts: [{ text }] });
    }
  }

  // Add current question
  const questionText = contents.length === 0 ? contextPrefix + question : question;
  contents.push({ role: 'user', parts: [{ text: questionText }] });

  try {
    const answer = await callGemini(systemPrompt, contents);
    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
