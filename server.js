require('dotenv').config();
const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 80;

const aiKeysConfig = require('./ai-keys.json');

const generatedSiteDir = path.join(__dirname, 'generated-site');
const publicDir = path.join(__dirname, 'public');

app.use(express.json({ limit: '1mb' }));
app.use('/app', express.static(publicDir));
app.use(express.static(generatedSiteDir));

app.get('/api/providers', (_req, res) => {
  const providers = aiKeysConfig.providers.map((provider) => ({
    ...provider,
    keyConfigured: Boolean(process.env[provider.apiKeyEnv])
  }));

  res.json({ providers });
});

app.post('/api/build-site', async (req, res) => {
  const { prompt, providerId = 'openai' } = req.body || {};

  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'A non-empty prompt is required.' });
    return;
  }

  try {
    const provider = aiKeysConfig.providers.find((item) => item.id === providerId);

    if (!provider) {
      res.status(400).json({ error: `Unknown provider: ${providerId}` });
      return;
    }

    const apiKey = process.env[provider.apiKeyEnv];
    let generatedFiles;

    if (!apiKey) {
      generatedFiles = buildFallbackSite(prompt);
    } else {
      generatedFiles = await generateSiteWithAI(provider, apiKey, prompt);
    }

    await writeGeneratedSite(generatedFiles);

    res.json({
      message: 'Website generated and running on http://localhost',
      provider: provider.id,
      usedFallback: !apiKey,
      websiteUrl: 'http://localhost'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to build website.', details: error.message });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'AI website builder is running on http://localhost' });
});

async function generateSiteWithAI(provider, apiKey, prompt) {
  const systemInstruction = `You generate a small website.
Return strictly valid JSON with keys: html, css, js.
- html must be a complete page body fragment (not doctype) and reference style.css and script.js.
- css is stylesheet content.
- js is vanilla JS.
Do not include markdown fences.`;

  let response;

  if (provider.id === 'openai') {
    response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: provider.model,
        input: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: `Build a website for: ${prompt}` }
        ]
      })
    });

    const data = await response.json();
    const raw = data.output_text || '';
    return parseGeneratedJson(raw);
  }

  if (provider.id === 'anthropic') {
    response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 1800,
        system: systemInstruction,
        messages: [{ role: 'user', content: `Build a website for: ${prompt}` }]
      })
    });

    const data = await response.json();
    const raw = data?.content?.[0]?.text || '';
    return parseGeneratedJson(raw);
  }

  if (provider.id === 'gemini') {
    const endpointWithKey = `${provider.endpoint}?key=${encodeURIComponent(apiKey)}`;

    response = await fetch(endpointWithKey, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${systemInstruction}\nBuild a website for: ${prompt}`
              }
            ]
          }
        ]
      })
    });

    const data = await response.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return parseGeneratedJson(raw);
  }

  throw new Error(`Provider not implemented: ${provider.id}`);
}

function parseGeneratedJson(text) {
  const trimmed = text.trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  const candidate = match ? match[0] : trimmed;
  const parsed = JSON.parse(candidate);

  if (!parsed.html || !parsed.css || !parsed.js) {
    throw new Error('AI response missing html/css/js keys.');
  }

  return parsed;
}

function buildFallbackSite(prompt) {
  return {
    html: `<main class="container"><h1>AI Website Builder</h1><p>This site was generated locally because no API key was configured.</p><section class="card"><h2>Your Prompt</h2><p>${escapeHtml(prompt)}</p></section><button id="refresh">Refresh Timestamp</button><p id="timestamp"></p></main>`,
    css: 'body { font-family: Arial, sans-serif; background: #0b1220; color: #f8fafc; margin: 0; } .container { max-width: 860px; margin: 3rem auto; padding: 2rem; } .card { background: #1e293b; padding: 1rem; border-radius: 8px; } button { margin-top: 1rem; padding: 0.75rem 1rem; border: none; border-radius: 6px; cursor: pointer; background: #38bdf8; color: #0f172a; }',
    js: 'const stamp = document.getElementById("timestamp"); const btn = document.getElementById("refresh"); function setStamp(){ stamp.textContent = new Date().toString(); } btn.addEventListener("click", setStamp); setStamp();'
  };
}

async function writeGeneratedSite({ html, css, js }) {
  const page = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Generated AI Website</title><link rel="stylesheet" href="/style.css"></head><body>${html}<script src="/script.js"></script></body></html>`;

  await fs.mkdir(generatedSiteDir, { recursive: true });
  await fs.writeFile(path.join(generatedSiteDir, 'index.html'), page, 'utf8');
  await fs.writeFile(path.join(generatedSiteDir, 'style.css'), css, 'utf8');
  await fs.writeFile(path.join(generatedSiteDir, 'script.js'), js, 'utf8');
}

function escapeHtml(input) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function ensureInitialSite() {
  const initial = buildFallbackSite('Create a modern landing page with a CTA button');
  await writeGeneratedSite(initial);
}

ensureInitialSite().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT === 80 ? '' : PORT}`);
  });
});
