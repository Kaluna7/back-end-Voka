const { getEnv } = require('../config/env');
const {
  DEEPSEEK_VOICE_HISTORY_LIMIT,
  DEEPSEEK_VOICE_MAX_TOKENS,
  DEEPSEEK_VOICE_TIMEOUT_MS,
  applyDeepseekThinking,
  buildLayeredChatMessages,
  clampVoiceReplyLength,
  shouldStopVoiceAgentStream,
  resolveDeepseekModel,
  sanitizeTeacherChatText,
} = require('../services/deepseekService');
const { isTeacherCompanionId } = require('../constants/teacherPrompts');
const { getVoiceAgentSession, updateVoiceAgentSession } = require('../services/voiceAgentSessionRegistry');

const THINK_SECRET = () => String(getEnv('VOICE_AGENT_THINK_SECRET', '') || '').trim();

const extractBearer = req => {
  const header = String(req.headers.authorization || req.headers.Authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
};

const extractLatestUserContent = messages => {
  if (!Array.isArray(messages)) {
    return '';
  }
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!msg || msg.role !== 'user') {
      continue;
    }
    if (typeof msg.content === 'string') {
      return msg.content.trim();
    }
    if (Array.isArray(msg.content)) {
      const text = msg.content
        .map(part => (typeof part?.text === 'string' ? part.text : ''))
        .join(' ')
        .trim();
      if (text) {
        return text;
      }
    }
  }
  return '';
};

const writeSseChunk = (res, payload) => {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

/**
 * OpenAI Chat Completions compatible gateway for Deepgram Voice Agent → DeepSeek.
 * Deepgram never sees DeepSeek keys or full Nami system prompts from the client.
 */
const voiceAgentChatCompletions = async (req, res) => {
  const startedAt = Date.now();
  const secret = THINK_SECRET();
  const token = extractBearer(req);
  if (secret && token !== secret) {
    return res.status(401).json({ error: { message: 'Unauthorized voice-agent LLM request.' } });
  }

  const sessionId = String(
    req.headers['x-voice-session-id'] ||
      req.headers['x-session-id'] ||
      req.body?.metadata?.sessionId ||
      '',
  ).trim();
  const session = getVoiceAgentSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: { message: 'Voice agent session not found.' } });
  }

  const wantStream = req.body?.stream !== false;
  const userMessage = extractLatestUserContent(req.body?.messages);
  if (!userMessage) {
    console.warn('[voice-agent-llm] refusing empty transcript (no Hello? fallback)', { sessionId });
    return res.status(400).json({
      error: {
        message: 'Empty user transcript; waiting for a real end-of-turn transcript.',
        code: 'EMPTY_TRANSCRIPT',
      },
    });
  }

  const model = resolveDeepseekModel(true);
  const historyLimit = session.historyLimit || DEEPSEEK_VOICE_HISTORY_LIMIT;
  const maxTokens =
    typeof session.maxTokens === 'number' && session.maxTokens > 0
      ? session.maxTokens
      : DEEPSEEK_VOICE_MAX_TOKENS;

  updateVoiceAgentSession(sessionId, {
    lastUserTranscript: userMessage,
    llmStartedAt: startedAt,
    firstTokenAt: 0,
  });

  if (typeof session.onLlmRequestStarted === 'function') {
    try {
      session.onLlmRequestStarted({ sessionId, transcript: userMessage, model, startedAt });
    } catch {}
  }

  const apiKey = getEnv('DEEPSEEK_API_KEY');
  if (!apiKey) {
    return res.status(500).json({ error: { message: 'DeepSeek is not configured.' } });
  }

  const payload = {
    model,
    stream: true,
    stream_options: { include_usage: true },
    // Slightly lower than chat — faster first audible token on voice.
    temperature: 0.75,
    top_p: 0.9,
    thinking: { type: 'disabled' },
    messages: buildLayeredChatMessages({
      message: userMessage,
      companionId: session.companionId,
      companionName: session.companionName,
      companionDescription: session.companionDescription,
      companionPrompt: session.companionPrompt,
      targetLanguage: session.targetLanguage,
      history: session.history || [],
      historyLimit,
      forVoice: true,
      user: session.user,
      callChatTopic: session.callChatTopic,
      bondContext: session.bondContext || '',
    }),
  };
  // Voice must never use DeepSeek thinking / reasoning_content.
  applyDeepseekThinking(payload, true);
  payload.thinking = { type: 'disabled' };
  delete payload.reasoning_effort;
  if (maxTokens > 0) {
    payload.max_tokens = maxTokens;
  }
  console.log('[voice-agent-llm] deepseek request', {
    sessionId,
    model,
    thinking: payload.thinking,
    hasReasoningEffort: Object.prototype.hasOwnProperty.call(payload, 'reasoning_effort'),
    max_tokens: payload.max_tokens || null,
    temperature: payload.temperature,
    messageCount: Array.isArray(payload.messages) ? payload.messages.length : 0,
  });

  const controller = new AbortController();
  const timeoutMs = session.timeoutMs || DEEPSEEK_VOICE_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let deepgramClosedEarly = false;
  // Only abort upstream if Deepgram disconnects before we finished writing.
  res.on('close', () => {
    if (!res.writableEnded) {
      deepgramClosedEarly = true;
      try {
        controller.abort();
      } catch {}
    }
  });

  let upstream;
  try {
    upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify(payload),
    });
  } catch (error) {
    clearTimeout(timeout);
    console.warn('[voice-agent-llm] deepseek network failed', {
      sessionId,
      message: error?.message,
    });
    return res.status(502).json({ error: { message: 'DeepSeek request failed.' } });
  }

  if (!upstream.ok) {
    clearTimeout(timeout);
    const detail = await upstream.text().catch(() => '');
    console.warn('[voice-agent-llm] deepseek status', {
      sessionId,
      status: upstream.status,
      detail: detail.slice(0, 200),
    });
    return res.status(502).json({ error: { message: `DeepSeek status ${upstream.status}` } });
  }

  const completionId = `chatcmpl-va-${sessionId}-${Date.now()}`;
  if (!wantStream) {
    // Deepgram Voice Agent expects streaming; still support non-stream for debugging.
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let carry = '';
    let full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      carry += decoder.decode(value, { stream: true });
      const parts = carry.split('\n');
      carry = parts.pop() || '';
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string') full += delta;
        } catch {}
      }
    }
    clearTimeout(timeout);
    let reply = clampVoiceReplyLength(full.trim());
    if (isTeacherCompanionId(session.companionId)) {
      reply = sanitizeTeacherChatText(reply);
    }
    return res.json({
      id: completionId,
      object: 'chat.completion',
      model,
      choices: [{ index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' }],
    });
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  writeSseChunk(res, {
    id: completionId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
  });

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let carry = '';
  let fullContent = '';
  let firstTokenAt = 0;
  let reasoningChunks = 0;

  const pumpLine = line => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) {
      return false;
    }
    const data = trimmed.slice(5).trim();
    if (data === '[DONE]') {
      return false;
    }
    let json;
    try {
      json = JSON.parse(data);
    } catch {
      return false;
    }
    const choiceDelta = json?.choices?.[0]?.delta || {};
    // Never forward DeepSeek reasoning/thinking tokens to Deepgram TTS.
    if (choiceDelta.reasoning_content) {
      reasoningChunks += 1;
      if (reasoningChunks === 1) {
        console.warn('[voice-agent-llm] reasoning_content received (thinking still on?)', {
          sessionId,
          preview: String(choiceDelta.reasoning_content).slice(0, 40),
        });
      }
      return false;
    }
    const delta = choiceDelta.content;
    if (typeof delta !== 'string' || !delta) {
      return false;
    }
    if (!firstTokenAt) {
      firstTokenAt = Date.now();
      updateVoiceAgentSession(sessionId, { firstTokenAt });
      if (typeof session.onFirstToken === 'function') {
        try {
          session.onFirstToken({
            sessionId,
            model,
            msFromLlmStart: firstTokenAt - startedAt,
          });
        } catch {}
      }
    }
    fullContent += delta;
    if (typeof session.onTokenDelta === 'function') {
      try {
        session.onTokenDelta({ sessionId, text: fullContent, delta });
      } catch {}
    }
    writeSseChunk(res, {
      id: completionId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
    });
    return shouldStopVoiceAgentStream(fullContent);
  };

  let stopEarly = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      carry += decoder.decode(value, { stream: true });
      const parts = carry.split('\n');
      carry = parts.pop() || '';
      for (const line of parts) {
        if (pumpLine(line)) {
          stopEarly = true;
          break;
        }
      }
      if (stopEarly) {
        break;
      }
    }
    if (!stopEarly && carry.trim()) {
      pumpLine(carry);
    }
  } catch (error) {
    if (!stopEarly) {
      console.warn('[voice-agent-llm] stream aborted', {
        sessionId,
        message: error?.message,
        deepgramClosedEarly,
        reasoningChunks,
        contentChars: fullContent.length,
        ms: Date.now() - startedAt,
      });
    }
  } finally {
    clearTimeout(timeout);
    try {
      reader.releaseLock();
    } catch {}
  }

  let reply = clampVoiceReplyLength(String(fullContent || '').trim());
  if (isTeacherCompanionId(session.companionId)) {
    reply = sanitizeTeacherChatText(reply);
  }
  if (stopEarly) {
    console.log('[voice-agent-llm] early stop for short voice reply', {
      sessionId,
      chars: reply.length,
      ms: Date.now() - startedAt,
    });
  }
  if (reasoningChunks > 0) {
    console.warn('[voice-agent-llm] dropped reasoning chunks (not spoken)', {
      sessionId,
      reasoningChunks,
      contentChars: reply.length,
    });
  }
  updateVoiceAgentSession(sessionId, {
    lastAssistantText: reply,
    llmCompletedAt: Date.now(),
  });
  if (typeof session.onLlmCompleted === 'function') {
    try {
      session.onLlmCompleted({
        sessionId,
        reply,
        model,
        msFromLlmStart: Date.now() - startedAt,
        msToFirstToken: firstTokenAt ? firstTokenAt - startedAt : null,
        emptyBecauseAbort: !reply && deepgramClosedEarly,
      });
    } catch {}
  }

  // Always finalize SSE for Deepgram before closing — aborting upstream first can
  // leave Aura hung in THINKING with ttt set but no TTS.
  if (!res.writableEnded) {
    try {
      writeSseChunk(res, {
        id: completionId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      });
      res.write('data: [DONE]\n\n');
      res.end();
    } catch {}
  }
  if (stopEarly) {
    try {
      controller.abort();
    } catch {}
  }
};

module.exports = {
  voiceAgentChatCompletions,
  extractLatestUserContent,
};
