"""
app/app.py
Flask application factory. run.py calls create_app() to get a
configured Flask app -- keeping this separate from run.py means the
app can also be imported for testing without starting a server.
"""
from flask import Flask

from .config import Config
from .routes.routes import api_bp


def create_app():
    app = Flask(__name__, static_folder=None)
    app.secret_key = Config.SECRET_KEY
    app.register_blueprint(api_bp)
    return app
