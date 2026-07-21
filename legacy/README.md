# AI Website Tester

A tool that actually crawls a real website, scores it on Performance/Security/SEO/Accessibility using real measured data, then asks Claude to generate specific recommendations from those real findings.

## How it works (architecture)

```
Browser (public/index.html)
      │  POST /api/analyze { url }
      ▼
server.js  (Express — routes the request)
      │
      ├─► lib/crawl.js     — fetches the real site, parses real HTML/headers   (no AI)
      ├─► lib/analyze.js   — turns those facts into 0-100 scores via rules     (no AI)
      └─► lib/aiInsights.js — sends the real findings to Claude for            (THE AI PART)
                              recommendations, efficiency tips, AI feature ideas
      │
      ▼
JSON response ──► rendered back into the same UI cards as before
```

The key idea: **only the parts that need judgement use AI.** Whether a header is missing is a fact, checked in code. Explaining why it matters and what to do about it is judgement — that's what we send to Claude for.

## First-time setup

1. Open this folder in VS Code (`File → Open Folder…`)
2. Open a terminal in VS Code (`` Ctrl+` ``)
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create your real environment file:
   - Copy `.env.example` and rename the copy to `.env`
   - Open `.env` and replace `sk-ant-your-real-key-here` with your actual key from console.anthropic.com
   - **This file is already in `.gitignore` — it will never be committed if you push to GitHub.**

## Running it

```bash
node server.js
```

You should see:
```
✅ AI Website Tester running at http://localhost:3000
```

Open **http://localhost:3000** in your browser. Type in any real website URL and hit Analyse — it will actually crawl that site live.

To stop the server: click into the terminal and press `Ctrl+C`.

## What's real vs. what's still a proxy

| Category | How it's measured | Real or proxy? |
|---|---|---|
| Security | Actual HTTP response headers (CSP, HSTS, etc.) | Real |
| SEO | Actual HTML tags (title, meta, canonical, JSON-LD) | Real |
| Accessibility | Actual alt-text/label coverage from the DOM | Real, but partial (no color-contrast checking — that needs a rendered browser) |
| Performance | Real response time + page size + script count | **Proxy** — not full Core Web Vitals (LCP/CLS/FID), which need a real rendered browser |
| Recommendations / AI ideas | Claude reasoning over the real findings above | Real AI, grounded in real data |
| Feature security scanner | Static OWASP-pattern knowledge base | Unchanged from before — genuinely general-purpose, not tied to a specific site (this was already accurate before) |

## Stretch upgrades (for later, once this is working)

- **Real Core Web Vitals**: add Puppeteer + Lighthouse to actually render the page in a headless Chrome and measure true LCP/CLS/FID, instead of the response-time/size proxy
- **Real accessibility audit**: add `axe-core` via Puppeteer for a full WCAG-rule engine instead of the current heuristic checks
- **Live progress updates**: currently the loading animation just advances on a timer while waiting for one big response. Switching to Server-Sent Events (SSE) would let the frontend show real "crawling… now scoring… now asking AI…" progress as each phase actually completes
- **Make Feature Security AI-driven**: instead of matching against a fixed list of features, send the crawled site + a described feature to Claude and get a tailored risk assessment
- **Caching**: store results per domain for a few hours so re-analysing the same site doesn't re-spend API credits unnecessarily

## Cost note

Each analysis makes one Claude API call. At current pricing this is a small fraction of a cent to a few cents per analysis depending on response length — testing this repeatedly during development will not meaningfully dent a $5 credit balance.
