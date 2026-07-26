"""
app/routes/routes.py
Every HTTP endpoint the frontend talks to:
    GET  /              -> serves frontend/index.html
    POST /api/login      -> login gate: stores name+email, starts a session
    GET  /api/session     -> lets the frontend check if already logged in
    POST /api/analyze      -> runs the full audit pipeline for a URL
"""
import threading
import traceback
from urllib.parse import urlparse

from flask import Blueprint, request, jsonify, send_from_directory, session

from app.config import Config, FRONTEND_DIR
from app.services.pipeline import run_pipeline_core
from app.services.scoring import build_frontend_data
from app.agents.promo_email_agent import send_promo_email
from app.utils import users_store

api_bp = Blueprint("api", __name__)


@api_bp.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@api_bp.route("/api/login", methods=["POST"])
def login():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip()
    name = (body.get("name") or "").strip()

    if "@" not in email or "." not in email.split("@")[-1]:
        return jsonify({"error": "Please enter a valid email address"}), 400

    user = users_store.save_user(email, name)
    session["user_email"] = user["email"]
    session["user_name"] = user["name"]
    return jsonify({"ok": True, "email": user["email"], "name": user["name"]})


@api_bp.route("/api/session")
def get_session():
    if session.get("user_email"):
        return jsonify({"logged_in": True, "email": session["user_email"], "name": session.get("user_name", "")})
    return jsonify({"logged_in": False})


@api_bp.route("/api/analyze", methods=["POST"])
def analyze():
    body = request.get_json(silent=True) or {}
    url = (body.get("url") or "").strip()
    if not url:
        return jsonify({"error": "Missing 'url' in request body"}), 400
    if not url.startswith("http"):
        url = "https://" + url

    try:
        domain = urlparse(url).hostname or url
    except Exception:
        return jsonify({"error": "Invalid URL"}), 400

    try:
        result = run_pipeline_core(url, max_pages=Config.MAX_PAGES, skip_tests=Config.SKIP_TESTS)
        data = build_frontend_data(
            domain=domain,
            pages=result["pages"],
            crawl_errors=result["crawl_errors"],
            tech_findings=result["tech_findings"],
            security_findings=result["security_findings"],
            content_analysis=result["content_analysis"],
            modernization=result["modernization"],
            test_results=result["test_results"],
        )

        user_email = session.get("user_email")
        if user_email:
            threading.Thread(
                target=send_promo_email,
                args=(user_email, session.get("user_name", ""), domain, data),
                daemon=True,
            ).start()

        return jsonify({"domain": domain, "url": url, "data": data})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
