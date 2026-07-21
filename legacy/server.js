// server.js
//
// This is the entry point — the file you run with `node server.js`.
// It starts a small web server on your machine that:
//   1. Serves the frontend (the HTML/CSS/JS in /public) to your browser
//   2. Listens for requests from that frontend at /api/analyze
//   3. On each request, runs crawl -> analyze -> AI insights, in order
//   4. Sends the combined result back as JSON for the frontend to render
//
// "dotenv" loads your .env file into process.env BEFORE anything else
// runs, so ANTHROPIC_API_KEY is available when aiInsights.js needs it.
import 'dotenv/config';

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { crawlSite } from './lib/crawl.js';
import { analyzeSite } from './lib/analyze.js';
import { generateInsights } from './lib/aiInsights.js';

// In ES modules (the `import` syntax we're using, set via "type": "module"
// in package.json) there's no automatic __dirname like older Node code
// uses — this is the modern equivalent.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());               // lets us read JSON bodies sent from the frontend
app.use(express.static(path.join(__dirname, 'public'))); // serves index.html, CSS, JS as-is

// --- THE MAIN ENDPOINT ---
// The frontend calls: POST /api/analyze  with body { "url": "https://..." }
app.post('/api/analyze', async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing "url" in request body' });
  }

  // Normalise the input the same way the original frontend did
  let target = url.trim();
  if (!target.startsWith('http')) target = 'https://' + target;

  let parsedUrl;
  try {
    parsedUrl = new URL(target);
  } catch {
    return res.status(400).json({ error: `"${url}" is not a valid URL` });
  }

  try {
    console.log(`[analyze] Starting: ${target}`);

    // STEP 1 — real crawl (no AI)
    const crawlData = await crawlSite(target);
    console.log(`[analyze] Crawled OK — ${crawlData.statusCode}, ${crawlData.responseTimeMs}ms`);

    // STEP 2 — real rule-based scoring (no AI)
    const analysis = analyzeSite(crawlData);
    console.log(`[analyze] Scored — overall ${analysis.score}/100`);

    // STEP 3 — AI-generated recommendations (this is the actual Claude call)
    const insights = await generateInsights(crawlData, analysis);
    console.log(`[analyze] AI insights generated — ${insights.recs.length} recommendations`);

    // Shape the response to match what the frontend already expects
    // (same shape as the old DB{} objects, so the frontend needs minimal changes)
    res.json({
      domain: parsedUrl.hostname.replace('www.', ''),
      url: target,
      score: analysis.score,
      label: analysis.label,
      metrics: analysis.metrics,
      recs: insights.recs,
      eff: insights.eff,
      ai: insights.ai
    });
  } catch (err) {
    console.error('[analyze] Failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ AI Website Tester running at http://localhost:${PORT}\n`);
});
