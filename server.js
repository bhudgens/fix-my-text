#!/usr/bin/env node

const express = require('express');

const app = express();
const ROOT = __dirname;
const DEFAULT_PROVIDER = 'grok';

const FALLBACK_MODELS = {
  anthropic: ['claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022', 'claude-3-7-sonnet-20250219'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
  grok: ['grok-4-1-fast-non-reasoning', 'grok-4-fast', 'grok-4', 'grok-2-1212'],
};

const PROVIDER_CONFIGS = {
  anthropic: {
    name: 'Anthropic',
    modelsEndpoint: 'https://api.anthropic.com/v1/models',
    rewriteEndpoint: 'https://api.anthropic.com/v1/messages',
    buildAuthHeaders: (apiKey) => ({
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    buildRewritePayload: (model, userPrompt) => ({
      model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    }),
    extractRewrittenText: (responseJson) => {
      const first = responseJson?.content?.[0];
      if (first?.type === 'text' && typeof first.text === 'string' && first.text.trim()) {
        return first.text;
      }

      if (typeof responseJson?.text === 'string' && responseJson.text.trim()) {
        return responseJson.text;
      }

      return null;
    },
    envKey: 'ANTHROPIC_API_KEY',
  },
  openai: {
    name: 'OpenAI',
    modelsEndpoint: 'https://api.openai.com/v1/models',
    rewriteEndpoint: 'https://api.openai.com/v1/chat/completions',
    buildAuthHeaders: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
    buildRewritePayload: (model, userPrompt) => ({
      model,
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      max_tokens: 2048,
      temperature: 0.2,
    }),
    extractRewrittenText: (responseJson) => {
      const first = responseJson?.choices?.[0]?.message;
      if (typeof first?.content === 'string' && first.content.trim()) {
        return first.content;
      }

      if (typeof responseJson?.output_text === 'string' && responseJson.output_text.trim()) {
        return responseJson.output_text;
      }

      return null;
    },
    envKey: 'OPENAI_API_KEY',
  },
  grok: {
    name: 'Grok',
    modelsEndpoint: 'https://api.x.ai/v1/models',
    rewriteEndpoint: 'https://api.x.ai/v1/responses',
    buildAuthHeaders: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
    buildRewritePayload: (model, userPrompt) => ({
      model,
      input: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      instructions: SYSTEM_PROMPT,
    }),
    extractRewrittenText: (responseJson) => {
      if (typeof responseJson?.output_text === 'string' && responseJson.output_text.trim()) {
        return responseJson.output_text;
      }

      for (const item of responseJson?.output || []) {
        if (item?.type !== 'message') {
          continue;
        }

        for (const content of item.content || []) {
          if (content?.type === 'output_text' && typeof content.text === 'string' && content.text) {
            return content.text;
          }
        }
      }

      return null;
    },
    envKey: 'XAI_API_KEY',
  },
};

const SYSTEM_PROMPT = `You are an expert editor for short-form writing. Make communication clear, natural, polished, and pleasant to read without changing what the user means. Preserve the user's facts, intent, point of view, tone, sentiment, certainty, emphasis, formatting, line breaks, mentions, hashtags, and emojis. Do not stop after fixing typos: also improve presentation when the original is choppy, mechanical, or awkward and the intended meaning is clear. If an improvement would require guessing, inventing context, changing meaning, changing sentiment, or making a dramatic rewrite, leave that part alone. Do not explain your work. Do not add commentary. Return only the rewritten text.`;

const MODE_PROMPTS = {
  cleanup:
    'Clean up the following text so it reads like well-written, natural English. Do two passes: first fix grammar, spelling, punctuation, and word choice; then improve presentation by smoothing awkward flow, unnecessary wordiness, clunky sentence structure, and choppy adjacent sentences. You may lightly reorganize, combine, or split sentences when it improves readability and the meaning is clear. In particular, if several adjacent simple sentences repeat the same subject or idea, combine them or use pronouns when that preserves all facts and sentiment. Example: "I is mking lotz of mstakes. Peter is happy. Peter is sad. Peter likes toys." can become "I am making lots of mistakes. Peter is happy and sad, and he likes toys." Preserve every fact, idea, sentiment, relationship, caveat, and level of certainty. Do not add new information, remove meaningful information, intensify, soften, infer, or reinterpret anything. Prefer leaving wording alone over making a change that might alter meaning.\\n\\nTEXT:\\n{text}',
  style:
    'Improve the style of the following text. Make it sound sharper, more polished, and more deliberate while preserving meaning and roughly similar length. Do not turn it into generic marketing copy.\\n\\nTEXT:\\n{text}',
};

app.use(express.json());
app.use(express.static(ROOT));

function normalizeProvider(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function getProviderConfig(provider) {
  const normalized = normalizeProvider(provider) || DEFAULT_PROVIDER;
  return PROVIDER_CONFIGS[normalized] ? { ...PROVIDER_CONFIGS[normalized], id: normalized } : null;
}

function getDefaultModel(providerConfig) {
  return FALLBACK_MODELS[providerConfig.id]?.[0] || '';
}

function getApiKey(providerConfig, providedApiKey) {
  const provided = typeof providedApiKey === 'string' ? providedApiKey.trim() : '';
  if (provided) {
    return provided;
  }

  const fromEnv = providerConfig.envKey ? (process.env[providerConfig.envKey] || '').trim() : '';
  return fromEnv;
}

function makeUserPrompt(text, mode) {
  const template = MODE_PROMPTS[mode] || MODE_PROMPTS.cleanup;
  return template.replace('{text}', text);
}

function toModelArray(modelsPayload) {
  if (!modelsPayload || typeof modelsPayload !== 'object') {
    return [];
  }

  const source =
    Array.isArray(modelsPayload.data) ? modelsPayload.data
    : Array.isArray(modelsPayload.models) ? modelsPayload.models
    : Array.isArray(modelsPayload.models?.data) ? modelsPayload.models.data
    : [];

  const ids = [];
  for (const item of source) {
    if (typeof item === 'string') {
      ids.push(item);
      continue;
    }

    if (item && typeof item.id === 'string') {
      ids.push(item.id);
    } else if (item && typeof item.model === 'string') {
      ids.push(item.model);
    }
  }

  return [...new Set(ids.filter((model) => model && model.trim()))];
}

function formatProviderError(responseJson) {
  if (!responseJson || typeof responseJson !== 'object') {
    return null;
  }

  if (responseJson.error && typeof responseJson.error === 'object') {
    if (typeof responseJson.error.message === 'string') {
      return responseJson.error.message;
    }

    if (typeof responseJson.error.code === 'string') {
      return responseJson.error.code;
    }
  }

  if (typeof responseJson.message === 'string') {
    return responseJson.message;
  }

  return null;
}

async function fetchModelList(providerConfig, apiKey) {
  const response = await fetch(providerConfig.modelsEndpoint, {
    method: 'GET',
    headers: providerConfig.buildAuthHeaders(apiKey),
  });

  let responseJson = null;
  try {
    responseJson = await response.json();
  } catch (error) {
    responseJson = null;
  }

  if (!response.ok) {
    const message = formatProviderError(responseJson) || 'Model lookup failed.';
    throw new Error(message);
  }

  const modelIds = toModelArray(responseJson);
  return modelIds.length ? modelIds : FALLBACK_MODELS[providerConfig.id];
}

async function callRewrite(providerConfig, apiKey, body) {
  const response = await fetch(providerConfig.rewriteEndpoint, {
    method: 'POST',
    headers: providerConfig.buildAuthHeaders(apiKey),
    body: JSON.stringify(body),
  });

  let responseJson = null;
  try {
    responseJson = await response.json();
  } catch (error) {
    throw new Error(`Could not parse ${providerConfig.name} response: ${error.message}`);
  }

  if (!response.ok) {
    const message = formatProviderError(responseJson)
      || `Request failed for ${providerConfig.name}.`;
    throw new Error(message);
  }

  const rewrittenText = providerConfig.extractRewrittenText(responseJson);
  if (!rewrittenText) {
    throw new Error(`Could not parse ${providerConfig.name} response.`);
  }

  return rewrittenText;
}

app.post('/api/models', async (req, res) => {
  const providerConfig = getProviderConfig(req.body?.provider);
  if (!providerConfig) {
    res.status(400).json({ error: 'Unsupported provider.' });
    return;
  }

  const apiKey = getApiKey(providerConfig, req.body?.apiKey);
  if (!apiKey) {
    res.status(400).json({
      error: `Missing ${providerConfig.name} API key. Paste one into the page or set ${providerConfig.envKey}.`,
    });
    return;
  }

  try {
    const models = await fetchModelList(providerConfig, apiKey);
    res.json({ provider: providerConfig.id, models });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Model lookup failed.' });
  }
});

app.post('/api/rewrite', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const mode = typeof req.body?.mode === 'string' ? req.body.mode.trim().toLowerCase() : 'cleanup';
  const providerConfig = getProviderConfig(req.body?.provider);

  if (!providerConfig) {
    res.status(400).json({ error: 'Unsupported provider.' });
    return;
  }

  const requestedModel = typeof req.body?.model === 'string' ? req.body.model.trim() : '';
  const apiKey = getApiKey(providerConfig, req.body?.apiKey);

  if (!text) {
    res.status(400).json({ error: 'Enter some text first.' });
    return;
  }

  if (!apiKey) {
    res.status(400).json({
      error: `Missing ${providerConfig.name} API key. Paste one into the page or set ${providerConfig.envKey}.`,
    });
    return;
  }

  if (!MODE_PROMPTS[mode]) {
    res.status(400).json({ error: `Unsupported mode: ${mode}` });
    return;
  }

  const userPrompt = makeUserPrompt(text, mode);
  const selectedModel = requestedModel || getDefaultModel(providerConfig);
  const payload = providerConfig.buildRewritePayload(selectedModel, userPrompt);

  try {
    const rewrittenText = await callRewrite(providerConfig, apiKey, payload);
    res.json({
      rewrittenText,
      provider: providerConfig.id,
      mode,
      model: selectedModel,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || `${providerConfig.name} request failed.` });
  }
});

const port = Number.parseInt(process.env.PORT || process.argv[2], 10) || 8000;
const host = process.env.HOST || (process.argv[3] && !process.argv[3].startsWith('-') ? process.argv[3] : null) || '127.0.0.1';

if (require.main === module) {
  app.listen(port, host, () => {
    console.log(`Serving Fix My Text at http://${host}:${port}`);
  });
}

module.exports = { app, port, host };
