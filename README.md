# AI Node.js Website Builder

This project is a Node.js website generator that runs on **http://localhost** and can use AI providers to build a website from a text prompt.

## What this project includes

- A Node.js web server using Express.
- A JSON config file for AI providers: `ai-keys.json`.
- An AI-powered endpoint that generates a website (`html`, `css`, `js`) from your prompt.
- A local fallback generator when no API key is configured.
- A simple control panel at `http://localhost/app` to trigger website generation.

## Requirements

- Node.js 18+ (for native `fetch` support).

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables (all API key names supported by this app):

```bash
export OPENAI_API_KEY="your_openai_key"
export ANTHROPIC_API_KEY="your_anthropic_key"
export GEMINI_API_KEY="your_gemini_key"
```

You can set one, two, or all keys. The UI/API shows which keys are available.

3. Start the server:

```bash
npm start
```

The app runs on:

- Generated website: `http://localhost`
- Builder UI: `http://localhost/app`

## API

### `GET /api/health`
Returns service status.

### `GET /api/providers`
Returns configured providers and whether their API key exists.

### `POST /api/build-site`
Builds and writes a website to `generated-site/`.

Request body example:

```json
{
  "providerId": "openai",
  "prompt": "Build a modern startup landing page with pricing and FAQ."
}
```

If the selected provider key is missing, the server safely uses a local fallback page.

## Notes

- The generated website files are written to:
  - `generated-site/index.html`
  - `generated-site/style.css`
  - `generated-site/script.js`
- The server starts with a default generated page so `http://localhost` always has content.
