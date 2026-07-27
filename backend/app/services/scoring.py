"""
app/services/scoring.py
Transforms raw pipeline output into the exact JSON shape the frontend
(index.html) expects: score, label, metrics, recs, eff, ai.
All numbers are computed deterministically from real findings.
"""


def _status(v):
    if v >= 75:
        return "good"
    if v >= 55:
        return "warn"
    return "bad"


def _label(score):
    if score >= 80:
        return "Excellent"
    if score >= 65:
        return "Good"
    if score >= 50:
        return "Fair"
    return "Needs work"


def _security_score(security_findings, tech_findings):
    score = 100
    missing = security_findings.get("headers", {}).get("missing_headers", [])
    score -= min(len(missing) * 12, 60)

    ssl = security_findings.get("ssl", {})
    if not ssl.get("valid", True):
        score -= 25
    elif ssl.get("expiring_soon"):
        score -= 10

    cookie_issues = security_findings.get("cookies", {}).get("issues", [])
    score -= min(len(cookie_issues) * 8, 20)

    mixed = security_findings.get("mixed_content_flags", [])
    score -= min(len(mixed) * 5, 15)

    outdated = tech_findings.get("outdated_signals", [])
    score -= min(len(outdated) * 10, 30)

    return max(0, min(100, round(score)))


def _seo_score(pages, content_analysis):
    if not pages:
        return 50
    score = 100
    no_meta = sum(1 for p in pages if not p.get("meta_description"))
    no_title = sum(1 for p in pages if not p.get("title"))
    score -= round((no_meta / len(pages)) * 35)
    score -= round((no_title / len(pages)) * 25)

    seo_gaps = content_analysis.get("seo_gaps", []) if isinstance(content_analysis, dict) else []
    score -= min(len(seo_gaps) * 8, 30)

    return max(0, min(100, round(score)))


def _accessibility_score(pages, content_analysis, test_results):
    score = 100
    total_images = sum(len(p.get("images", [])) for p in pages)
    missing_alt = sum(
        sum(1 for i in p.get("images", []) if not i.get("has_alt")) for p in pages
    )
    if total_images:
        score -= round((missing_alt / total_images) * 40)

    a11y_gaps = content_analysis.get("accessibility_gaps", []) if isinstance(content_analysis, dict) else []
    score -= min(len(a11y_gaps) * 8, 30)

    if isinstance(test_results, dict) and not test_results.get("skipped"):
        summary = test_results.get("summary", {})
        pages_tested = test_results.get("pages_tested", 0) or 1
        missing_lang = summary.get("pages_missing_lang_attr", 0)
        score -= round((missing_lang / pages_tested) * 30)

    return max(0, min(100, round(score)))


def _technical_health_score(pages, crawl_errors, test_results):
    score = 100
    score -= min(len(crawl_errors) * 8, 30)

    if isinstance(test_results, dict) and not test_results.get("skipped"):
        summary = test_results.get("summary", {})
        pages_tested = test_results.get("pages_tested", 0) or 1
        score -= round((summary.get("pages_with_errors", 0) / pages_tested) * 30)
        score -= round((summary.get("pages_with_broken_images", 0) / pages_tested) * 25)

    return max(0, min(100, round(score)))


def _severity_to_badge(severity):
    return {"high": "critical", "medium": "improve", "low": "enhance"}.get(severity, "improve")


def _build_recs(content_analysis, security_findings, modernization):
    recs = []

    if isinstance(content_analysis, dict):
        for issue in content_analysis.get("issues", [])[:5]:
            recs.append({
                "t": issue.get("issue", "Issue found")[:70],
                "b": _severity_to_badge(issue.get("severity", "medium")),
                "d": issue.get("recommendation", ""),
                "a": issue.get("recommendation", "Review and fix")[:60],
            })

    missing_headers = security_findings.get("headers", {}).get("missing_headers", [])
    for m in missing_headers[:4]:
        recs.append({
            "t": f"Add {m['header']} header",
            "b": "security",
            "d": m["risk"],
            "a": f"Set the {m['header']} response header",
        })

    if isinstance(modernization, dict):
        for sp in modernization.get("security_priorities", [])[:4]:
            recs.append({
                "t": sp.get("finding", "Security finding")[:70],
                "b": _severity_to_badge(sp.get("severity", "medium")),
                "d": sp.get("fix", ""),
                "a": sp.get("fix", "")[:60],
            })

    return recs[:10] or [{
        "t": "No major issues detected",
        "b": "enhance",
        "d": "The automated checks did not surface high-priority issues on the crawled pages.",
        "a": "Re-run with more pages crawled for deeper coverage",
    }]


def _build_efficiency(modernization):
    eff = []
    if isinstance(modernization, dict):
        for rec in modernization.get("modernization_recommendations", []):
            if rec.get("effort") == "low":
                eff.append({
                    "t": rec.get("area", "Improvement")[:70],
                    "b": "efficiency",
                    "d": rec.get("recommendation", ""),
                    "a": rec.get("recommendation", "")[:60],
                })
    return eff[:6] or [{
        "t": "No quick efficiency wins flagged",
        "b": "efficiency",
        "d": "Nothing low-effort surfaced in this scan. Higher-effort modernization items may still apply.",
        "a": "See Quick Wins in the full report",
    }]


def _build_ai_suggestions(domain):
    return [
        {
            "ico": "🤖", "cat": "UX", "t": "AI chatbot assistant",
            "d": f"Help visitors find what they need on {domain} without digging through menus.",
            "impl": "Embed a chat widget backed by an LLM using retrieval-augmented generation over your site content.",
        },
        {
            "ico": "🔍", "cat": "Search", "t": "Semantic search",
            "d": "Replace exact keyword search with something that understands intent and synonyms.",
            "impl": "Embed page content as vectors (e.g. with a sentence-embedding model) and retrieve nearest neighbours per query.",
        },
        {
            "ico": "👤", "cat": "Personalisation", "t": "AI content personalisation",
            "d": "Surface the most relevant content to each visitor based on behavior.",
            "impl": "Build a lightweight recommendation layer using session/browsing data, served at request time.",
        },
    ]


def build_frontend_data(domain, pages, crawl_errors, tech_findings,
                         security_findings, content_analysis,
                         modernization, test_results):
    perf = _technical_health_score(pages, crawl_errors, test_results)
    sec = _security_score(security_findings, tech_findings)
    seo = _seo_score(pages, content_analysis)
    a11y = _accessibility_score(pages, content_analysis, test_results)

    score = round((perf + sec + seo + a11y) / 4)

    return {
        "score": score,
        "label": _label(score),
        "metrics": [
            {"l": "Technical health", "v": f"{perf}/100", "s": _status(perf)},
            {"l": "Security", "v": f"{sec}/100", "s": _status(sec)},
            {"l": "SEO", "v": f"{seo}/100", "s": _status(seo)},
            {"l": "Accessibility", "v": f"{a11y}/100", "s": _status(a11y)},
        ],
        "recs": _build_recs(content_analysis, security_findings, modernization),
        "eff": _build_efficiency(modernization),
        "ai": _build_ai_suggestions(domain),
    }
