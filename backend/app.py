"""Einstiegspunkt der Flask-App. Konfiguriert die App, initialisiert die DB
und registriert die Domain-Blueprints. Die eigentlichen Routen leben in den
jeweiligen Modulen (auth, users, catalog, figures, sequences, history,
attendance)."""

import os

from flask import Flask, jsonify, request
from flask_cors import CORS

from database import init_db
from seed import seed


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIST = os.environ.get(
    "FRONTEND_DIST",
    os.path.join(BASE_DIR, "..", "frontend", "dist"),
)

app = Flask(__name__, static_folder=FRONTEND_DIST, static_url_path="")
CORS(app, supports_credentials=True)

init_db()
seed()


# Blueprints (Routen-Module) erst nach init_db/seed importieren, damit beim
# Import nichts an einer noch nicht existierenden DB scheitern kann.
from attendance import bp as attendance_bp  # noqa: E402
from auth import bp as auth_bp  # noqa: E402
from catalog import bp as catalog_bp  # noqa: E402
from figures import bp as figures_bp  # noqa: E402
from history import bp as history_bp  # noqa: E402
from sequences import bp as sequences_bp  # noqa: E402
from users import bp as users_bp  # noqa: E402

app.register_blueprint(auth_bp)
app.register_blueprint(catalog_bp)
app.register_blueprint(users_bp)
app.register_blueprint(figures_bp)
app.register_blueprint(sequences_bp)
app.register_blueprint(history_bp)
app.register_blueprint(attendance_bp)


@app.route("/")
def serve_index():
    return app.send_static_file("index.html")


@app.errorhandler(404)
def not_found(_):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Nicht gefunden"}), 404
    return app.send_static_file("index.html")


@app.errorhandler(500)
def server_error(_):
    return jsonify({"error": "Serverfehler"}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
