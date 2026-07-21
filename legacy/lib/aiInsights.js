// lib/aiInsights.js
//
// THIS is the file that actually calls an LLM. Everything before this
// point (crawl.js, analyze.js) was deterministic code — same input always
// gives the same output. An LLM is different: we send it text, and it
// generates new text back based on patterns it learned during training.
//
// We use the LLM for the one part that genuinely needs judgement:
// turning a list of dry facts ("no CSP header", "62% alt coverage") into
// specific, well-explained, prioritised recommendations — the same way
// you'd ask a senior engineer to review a checklist and tell you what
// actually matters most.

import Anthropic from '@anthropic-ai/sdk';

// The SDK automatically reads process.env.ANTHROPIC_API_KEY if you don't
// pass a key explicitly — that's why we load dotenv in server.js first.
const client = new Anthropic();

const MODEL = 'claude-sonnet-5'; // current Anthropic model, good balance of quality/cost/speed for this task

/**
 * Sends real crawl + analysis data to Claude and asks it to generate
 * recommendations, efficiency tips, and AI integration ideas.
 *
 * @param {object} crawlData - raw facts from crawl.js
 * @param {object} analysis - scored output from analyze.js
 * @returns {Promise<{recs: object[], eff: object[], ai: object[]}>}
 */
export async function generateInsights(crawlData, analysis) {
  // We give Claude a STRUCTURED summary rather than the full raw HTML —
  // this keeps the request small (cheaper, faster) and means Claude is
  // reasoning over the same clean facts a human reviewer would look at.
  const briefing = {
    domain: crawlData.finalUrl,
    pageTitle: crawlData.title,
    metaDescription: crawlData.metaDescription,
    whatThePageIsAbout: crawlData.textSample, // helps Claude tailor AI ideas to the site's actual purpose
    scores: {
      performance: analysis.metrics[0].v,
      security: analysis.metrics[1].v,
      seo: analysis.metrics[2].v,
      accessibility: analysis.metrics[3].v
    },
    specificIssuesFound: analysis.findings
  };

  // System prompt: sets Claude's role and, critically, locks down the
  // OUTPUT FORMAT. We need machine-readable JSON back (our frontend
  // renders it into cards), not a conversational reply — so we're
  // explicit that ONLY JSON should be returned, nothing else.
  const systemPrompt = `You are a senior web engineering consultant specialising in performance, security, SEO, and accessibility audits.

You will be given real, measured findings about a website (not guesses). Turn them into specific, actionable recommendations.

Respond with ONLY valid JSON — no markdown code fences, no explanation text before or after. Match this exact schema:

{
  "recs": [ { "t": "short title", "b": "critical|improve|enhance|security", "d": "1-2 sentence explanation of the issue and its impact, referencing the real numbers given", "a": "one short action-oriented instruction" } ],
  "eff": [ { "t": "short title", "b": "efficiency", "d": "1-2 sentence explanation", "a": "one short action-oriented instruction" } ],
  "ai": [ { "ico": "single relevant emoji", "cat": "short category label", "t": "feature name", "d": "1-2 sentence description tailored to what this specific site is about", "impl": "1 sentence on how a developer would implement it" } ]
}

Rules:
- Base "recs" strictly on the specificIssuesFound provided. Do not invent issues that weren't reported.
- Produce 3-5 items in "recs", ranked most severe first.
- Produce 1-3 items in "eff" (performance/efficiency-focused, separate from "recs").
- Produce 2-3 items in "ai" — these should be AI features genuinely suited to what the page's content suggests the site does, not generic filler.
- Use "critical" only for severe security or major usability blockers.`;

  const userMessage = `Here is the real, measured data for this site:\n\n${JSON.stringify(briefing, null, 2)}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  });

  // response.content is an array of blocks (see docstring in server.js for
  // why it's an array, not just a string). For a plain text-only reply
  // like this one, it's a single block of type "text".
  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock) throw new Error('Claude returned no text content');

  // Defensive parsing: even with instructions, models occasionally wrap
  // JSON in ```json fences. Strip them before parsing, just in case.
  const cleaned = textBlock.text.trim().replace(/^```json\s*|^```\s*|```$/g, '');

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Claude's response wasn't valid JSON: ${err.message}`);
  }

  // Basic shape validation so a malformed response fails loudly and
  // clearly instead of silently breaking the frontend later.
  if (!Array.isArray(parsed.recs) || !Array.isArray(parsed.ai)) {
    throw new Error('Claude response is missing expected fields (recs/ai)');
  }

  return {
    recs: parsed.recs,
    eff: parsed.eff || [],
    ai: parsed.ai
  };
}
