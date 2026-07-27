"""
app/services/browser_tests.py
Automated functional + basic accessibility checks using Playwright.
Run `playwright install chromium` once before first use.
"""
from playwright.sync_api import sync_playwright


def run_tests(urls, max_pages=10, timeout_ms=15000):
    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        for url in urls[:max_pages]:
            page_result = {
                "url": url,
                "load_success": False,
                "console_errors": [],
                "broken_images": [],
                "missing_alt_count": 0,
                "has_lang_attr": False,
                "has_title": False,
            }

            console_errors = []
            page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

            try:
                response = page.goto(url, timeout=timeout_ms, wait_until="networkidle")
                page_result["load_success"] = response is not None and response.status < 400
                page_result["status_code"] = response.status if response else None

                page_result["has_title"] = bool(page.title())
                page_result["has_lang_attr"] = bool(page.get_attribute("html", "lang"))

                broken = page.evaluate("""
                    () => Array.from(document.images)
                        .filter(img => !img.complete || img.naturalWidth === 0)
                        .map(img => img.src)
                """)
                page_result["broken_images"] = broken

                missing_alt = page.evaluate("""
                    () => Array.from(document.images)
                        .filter(img => !img.alt || img.alt.trim() === '').length
                """)
                page_result["missing_alt_count"] = missing_alt

            except Exception as e:
                page_result["error"] = str(e)

            page_result["console_errors"] = console_errors[:10]
            results.append(page_result)

        browser.close()

    return {
        "pages_tested": len(results),
        "results": results,
        "summary": {
            "pages_with_errors": sum(1 for r in results if r["console_errors"]),
            "pages_with_broken_images": sum(1 for r in results if r["broken_images"]),
            "pages_missing_lang_attr": sum(1 for r in results if not r["has_lang_attr"]),
        }
    }
