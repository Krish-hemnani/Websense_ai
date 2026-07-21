// lib/crawl.js
//
// This file's ONLY job is to fetch a REAL website and hand back the raw
// facts about it — the actual HTML text and the actual HTTP response
// headers the server sent back. Nothing in this file is AI. It's the
// same thing your browser does every time you visit a page, just without
// rendering it visually.

import * as cheerio from 'cheerio';

/**
 * Fetches a URL and returns raw data about it.
 * @param {string} url - full URL, e.g. "https://example.com"
 * @returns {Promise<object>} raw crawl data
 */
export async function crawlSite(url) {
  const startTime = Date.now(); // timestamp before the request — used to measure real response time

  // global fetch() is built into Node.js (no extra library needed, Node 18+).
  // We set a manual timeout using AbortController so a slow/dead site
  // doesn't hang our server forever.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15s max wait

  let response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow', // follow http->https or www redirects automatically
      headers: {
        // Some sites block requests with no User-Agent, so we identify
        // ourselves honestly as a bot rather than pretending to be a browser.
        'User-Agent': 'AI-Website-Tester/1.0 (+educational-project)'
      }
    });
  } catch (err) {
    clearTimeout(timeout);
    // Bubble up a clear error the API route can turn into a clean message
    if (err.name === 'AbortError') {
      throw new Error(`Site took too long to respond (>15s timeout): ${url}`);
    }
    throw new Error(`Could not reach ${url}: ${err.message}`);
  }
  clearTimeout(timeout);

  const responseTimeMs = Date.now() - startTime; // real, measured round-trip time

  const html = await response.text();
  const $ = cheerio.load(html); // parse HTML into a queryable structure, like jQuery

  // --- Collect real HTTP headers (these are FACTS, not opinions) ---
  const headers = {};
  response.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });

  // --- Collect real DOM facts using cheerio selectors ---
  const images = $('img');
  const imagesWithAlt = images.filter((i, el) => {
    const alt = $(el).attr('alt');
    return alt !== undefined && alt.trim().length > 0;
  });

  const scripts = $('script[src]'); // external scripts only (not inline)
  const headings = $('h1, h2, h3, h4, h5, h6');
  const h1Count = $('h1').length;

  const formInputs = $('input, textarea, select');
  const labeledInputs = formInputs.filter((i, el) => {
    const $el = $(el);
    const id = $el.attr('id');
    const hasAriaLabel = $el.attr('aria-label') || $el.attr('aria-labelledby');
    const hasMatchingLabel = id ? $(`label[for="${id}"]`).length > 0 : false;
    return Boolean(hasAriaLabel || hasMatchingLabel);
  });

  return {
    url,
    finalUrl: response.url,      // where we ended up after redirects
    statusCode: response.status,
    responseTimeMs,
    htmlSizeBytes: Buffer.byteLength(html, 'utf8'),
    headers,
    isHttps: response.url.startsWith('https://'),

    title: $('title').first().text().trim(),
    metaDescription: $('meta[name="description"]').attr('content') || '',
    hasCanonical: $('link[rel="canonical"]').length > 0,
    hasViewportMeta: $('meta[name="viewport"]').length > 0,
    hasJsonLd: $('script[type="application/ld+json"]').length > 0,
    htmlLang: $('html').attr('lang') || '',

    h1Count,
    headingCount: headings.length,

    imageCount: images.length,
    imagesWithAltCount: imagesWithAlt.length,

    externalScriptCount: scripts.length,

    formInputCount: formInputs.length,
    labeledInputCount: labeledInputs.length,

    hasNav: $('nav').length > 0,
    hasMain: $('main').length > 0,
    hasHeaderTag: $('header').length > 0,
    hasFooterTag: $('footer').length > 0,

    // Keep a trimmed sample of visible text — this is what we'll later
    // show to Claude so it understands what the SITE IS ABOUT (news site?
    // shop? docs?), which lets the AI recommendations be genuinely relevant
    // instead of generic. We cap it to keep API costs low.
    textSample: $('body').text().replace(/\s+/g, ' ').trim().slice(0, 1500)
  };
}
