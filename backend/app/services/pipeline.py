"""
app/services/pipeline.py
Runs every stage in order and returns the combined raw results:
crawl -> analyze (tech + security) -> ai_insights -> browser_tests.
This is what app/routes/routes.py calls for POST /api/analyze.
"""
from app.services.crawl import crawl_site
from app.services.analyze import detect_technologies, run_security_scan
from app.services.ai_insights import analyze_content_and_ux, analyze_tech_modernization
from app.services.browser_tests import run_tests


def run_pipeline_core(start_url, max_pages=15, skip_tests=False, progress_cb=None):
    def _progress(n, msg):
        print(msg)
        if progress_cb:
            progress_cb(n, msg)

    _progress(1, f"[1/6] Crawling {start_url} (max {max_pages} pages)...")
    crawl_result = crawl_site(start_url, max_pages=max_pages)
    pages = crawl_result["pages"]
    print(f"      -> {len(pages)} pages crawled, {len(crawl_result['errors'])} errors")

    _progress(2, "[2/6] Detecting technology stack...")
    tech_findings = detect_technologies(pages)

    _progress(3, "[3/6] Running passive security checks...")
    security_findings = run_security_scan(start_url, pages)

    _progress(4, "[4/6] AI content & UX analysis...")
    content_analysis = analyze_content_and_ux(pages)

    _progress(5, "[5/6] AI modernization recommendations...")
    modernization = analyze_tech_modernization(tech_findings, security_findings)

    test_results = {"skipped": True}
    if not skip_tests:
        _progress(6, "[6/6] Running automated browser tests...")
        try:
            test_results = run_tests([p["url"] for p in pages])
        except Exception as e:
            test_results = {"error": str(e), "note": "Run 'playwright install chromium' if this is a missing-browser error."}
    else:
        _progress(6, "[6/6] Skipping automated tests (--skip-tests)")

    crawl_summary = {
        "pages_crawled": len(pages),
        "crawl_errors": crawl_result["errors"],
        "pages": [{"url": p["url"], "title": p["title"], "word_count": p["word_count"]} for p in pages],
    }

    return {
        "pages": pages,
        "crawl_errors": crawl_result["errors"],
        "crawl_summary": crawl_summary,
        "tech_findings": tech_findings,
        "security_findings": security_findings,
        "content_analysis": content_analysis,
        "modernization": modernization,
        "test_results": test_results,
    }
