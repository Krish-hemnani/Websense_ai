// lib/analyze.js
//
// This file turns the raw facts from crawl.js into 0-100 scores.
// This is DELIBERATELY not AI. Whether a site has an HSTS header is a
// yes/no fact — asking an LLM to "guess" that would be slower, costlier,
// and less reliable than just checking `headers['strict-transport-security']`
// directly. We only reach for the AI later, for the part that genuinely
// needs judgement: writing recommendations in plain English.
//
// Every score below is a CHECKLIST: each check is worth some points,
// and the score is (points earned / points possible) * 100.

function pct(earned, possible) {
  return Math.round((earned / Math.max(possible, 1)) * 100);
}

// ---------- SECURITY ----------
// Based on standard OWASP Secure Headers recommendations.
function scoreSecurity(d) {
  const h = d.headers;
  let earned = 0;
  const possible = 7;
  const notes = [];

  if (d.isHttps) { earned++; } else { notes.push('Site is not served over HTTPS'); }
  if (h['strict-transport-security']) { earned++; } else { notes.push('Missing Strict-Transport-Security (HSTS) header'); }
  if (h['content-security-policy']) { earned++; } else { notes.push('Missing Content-Security-Policy header'); }
  if (h['x-content-type-options']) { earned++; } else { notes.push('Missing X-Content-Type-Options header'); }
  if (h['x-frame-options'] || (h['content-security-policy'] || '').includes('frame-ancestors')) { earned++; } else { notes.push('No clickjacking protection (X-Frame-Options / frame-ancestors)'); }
  if (h['referrer-policy']) { earned++; } else { notes.push('Missing Referrer-Policy header'); }
  if (h['permissions-policy']) { earned++; } else { notes.push('Missing Permissions-Policy header'); }

  return { score: pct(earned, possible), notes };
}

// ---------- SEO ----------
function scoreSEO(d) {
  let earned = 0;
  const possible = 7;
  const notes = [];

  if (d.title && d.title.length >= 10 && d.title.length <= 60) { earned++; }
  else notes.push(d.title ? `Title tag length (${d.title.length} chars) is outside the ideal 10-60 range` : 'Missing <title> tag');

  if (d.metaDescription && d.metaDescription.length >= 50 && d.metaDescription.length <= 160) { earned++; }
  else notes.push(d.metaDescription ? `Meta description length (${d.metaDescription.length} chars) is outside the ideal 50-160 range` : 'Missing meta description');

  if (d.h1Count === 1) { earned++; }
  else notes.push(`Page has ${d.h1Count} <h1> tags (should be exactly 1)`);

  if (d.hasCanonical) { earned++; } else notes.push('Missing canonical link tag');
  if (d.hasViewportMeta) { earned++; } else notes.push('Missing viewport meta tag (hurts mobile SEO)');
  if (d.hasJsonLd) { earned++; } else notes.push('No JSON-LD structured data found (missing rich-result eligibility)');

  const altCoverage = d.imageCount > 0 ? d.imagesWithAltCount / d.imageCount : 1;
  if (altCoverage >= 0.8) { earned++; } else notes.push(`Only ${Math.round(altCoverage * 100)}% of images have alt text`);

  return { score: pct(earned, possible), notes };
}

// ---------- ACCESSIBILITY ----------
function scoreAccessibility(d) {
  let earned = 0;
  const possible = 5;
  const notes = [];

  const altCoverage = d.imageCount > 0 ? d.imagesWithAltCount / d.imageCount : 1;
  if (altCoverage >= 0.9) { earned++; } else notes.push(`${Math.round(altCoverage * 100)}% image alt-text coverage (target 90%+)`);

  if (d.htmlLang) { earned++; } else notes.push('Missing lang attribute on <html> (screen readers cannot determine language)');

  const labelCoverage = d.formInputCount > 0 ? d.labeledInputCount / d.formInputCount : 1;
  if (labelCoverage >= 0.9) { earned++; } else notes.push(`Only ${Math.round(labelCoverage * 100)}% of form fields have an associated label`);

  if (d.hasNav || d.hasMain) { earned++; } else notes.push('No semantic landmark elements (<nav>, <main>) found — harder for screen readers to navigate');

  if (d.hasFooterTag || d.hasHeaderTag) { earned++; } else notes.push('No semantic <header>/<footer> landmarks found');

  return { score: pct(earned, possible), notes };
}

// ---------- PERFORMANCE ----------
// NOTE: this is a lightweight PROXY, not a full Core Web Vitals audit.
// A real LCP/CLS/FID measurement requires actually rendering the page in
// a browser (Lighthouse/Puppeteer) — see README for how to add that later.
// This version scores based on signals we CAN measure from a plain fetch.
function scorePerformance(d) {
  let points = 0;

  // Response time: under 300ms is great, over 2000ms is poor
  if (d.responseTimeMs <= 300) points += 30;
  else if (d.responseTimeMs <= 800) points += 22;
  else if (d.responseTimeMs <= 1500) points += 12;
  else points += 4;

  // Page weight: smaller HTML is generally better
  const kb = d.htmlSizeBytes / 1024;
  if (kb <= 100) points += 25;
  else if (kb <= 300) points += 18;
  else if (kb <= 700) points += 10;
  else points += 3;

  // Number of external scripts: fewer is generally faster
  if (d.externalScriptCount <= 10) points += 25;
  else if (d.externalScriptCount <= 30) points += 16;
  else if (d.externalScriptCount <= 60) points += 8;
  else points += 2;

  // Compression: gzip/br saves real bandwidth
  const enc = d.headers['content-encoding'] || '';
  if (enc.includes('br') || enc.includes('gzip')) points += 20;
  else points += 0;

  return {
    score: Math.min(100, points),
    notes: [
      `Response time: ${d.responseTimeMs}ms`,
      `Page HTML size: ${Math.round(kb)}KB`,
      `External scripts: ${d.externalScriptCount}`,
      enc ? `Compression: ${enc}` : 'No compression (gzip/br) detected'
    ]
  };
}

function statusFor(score) {
  return score >= 75 ? 'good' : score >= 55 ? 'warn' : 'bad';
}

/**
 * Main entry point: takes raw crawl data, returns the full metrics block
 * in the exact shape the frontend already expects (matches the original
 * DB{} object's `metrics` array format).
 */
export function analyzeSite(crawlData) {
  const perf = scorePerformance(crawlData);
  const sec = scoreSecurity(crawlData);
  const seo = scoreSEO(crawlData);
  const a11y = scoreAccessibility(crawlData);

  const overall = Math.round((perf.score + sec.score + seo.score + a11y.score) / 4);
  const label = overall >= 80 ? 'Excellent' : overall >= 65 ? 'Good' : overall >= 50 ? 'Fair' : 'Needs work';

  return {
    score: overall,
    label,
    metrics: [
      { l: 'Performance', v: `${perf.score}/100`, s: statusFor(perf.score) },
      { l: 'Security', v: `${sec.score}/100`, s: statusFor(sec.score) },
      { l: 'SEO', v: `${seo.score}/100`, s: statusFor(seo.score) },
      { l: 'Accessibility', v: `${a11y.score}/100`, s: statusFor(a11y.score) }
    ],
    // Raw findings notes are passed along — this is what we'll feed to
    // Claude in Phase 3, so its recommendations are grounded in real
    // facts instead of invented ones.
    findings: {
      performance: perf.notes,
      security: sec.notes,
      seo: seo.notes,
      accessibility: a11y.notes
    }
  };
}
