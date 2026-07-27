"""
app/agents/promo_email_agent.py
Runs automatically after a user analyzes a site and gets their report.
Generates a short AI-written follow-up email referencing their actual
results (via Groq) and sends it via SMTP. Never raises -- if a key or
credential is missing, it logs a warning and the analysis response is
unaffected.
"""
import json
import smtplib
from email.mime.text import MIMEText

from groq import Groq

from app.config import Config

MODEL = "llama-3.3-70b-versatile"

_client = Groq(api_key=Config.GROQ_API_KEY) if Config.GROQ_API_KEY else None


def generate_promo_email(name, domain, report_data):
    top_recs = [r.get("t", "") for r in (report_data.get("recs") or [])[:3]]

    if not _client:
        return _fallback_email(name, domain, report_data, top_recs)

    system = (
        "You write short, friendly, non-spammy marketing emails for an "
        "AI website auditing tool. The email should reference the "
        "specific site and findings given, feel personal (not generic), "
        "and end with a clear but low-pressure call to action to come "
        "back and re-run the audit or explore the recommendations in "
        "the dashboard. Keep it under 150 words. Output valid JSON only."
    )
    user_prompt = f"""
User's name: {name or "there"}
Site just analyzed: {domain}
Overall score: {report_data.get("score")}/100 ({report_data.get("label")})
Top issues found: {json.dumps(top_recs)}

Return ONLY a JSON object:
{{"subject": "...", "body": "..."}}
No markdown, no commentary outside the JSON.
"""
    try:
        resp = _client.chat.completions.create(
            model=MODEL,
            max_tokens=500,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_prompt},
            ],
        )
        raw = resp.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        parsed = json.loads(raw)
        if "subject" in parsed and "body" in parsed:
            return parsed
    except Exception as e:
        print(f"[PromoEmailAgent] AI email generation failed, using fallback: {e}")

    return _fallback_email(name, domain, report_data, top_recs)


def _fallback_email(name, domain, report_data, top_recs):
    greeting = f"Hi {name}," if name else "Hi there,"
    issues_line = "; ".join(top_recs) if top_recs else "a few opportunities to improve"
    return {
        "subject": f"Your {domain} audit is ready — score: {report_data.get('score')}/100",
        "body": (
            f"{greeting}\n\n"
            f"We just finished analyzing {domain}. It scored "
            f"{report_data.get('score')}/100 ({report_data.get('label')}).\n\n"
            f"Top things worth a look: {issues_line}.\n\n"
            f"Head back to the dashboard any time to see the full breakdown "
            f"and re-run the audit after you make changes.\n\n"
            f"— The AI Website Tester team"
        ),
    }


def send_email(to_email, subject, body):
    if not Config.SMTP_EMAIL or not Config.SMTP_PASSWORD:
        print("[PromoEmailAgent] SMTP_EMAIL / SMTP_PASSWORD not set — skipping send.")
        return False

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = Config.SMTP_EMAIL
    msg["To"] = to_email

    try:
        with smtplib.SMTP(Config.SMTP_HOST, Config.SMTP_PORT, timeout=15) as server:
            server.starttls()
            server.login(Config.SMTP_EMAIL, Config.SMTP_PASSWORD)
            server.sendmail(Config.SMTP_EMAIL, [to_email], msg.as_string())
        return True
    except Exception as e:
        print(f"[PromoEmailAgent] Failed to send email to {to_email}: {e}")
        return False


def send_promo_email(to_email, name, domain, report_data):
    if not to_email:
        return False
    email_content = generate_promo_email(name, domain, report_data)
    return send_email(to_email, email_content["subject"], email_content["body"])
