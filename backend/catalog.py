"""Stammdaten: Kurse und Tänze."""

from flask import Blueprint, jsonify

from database import get_connection


bp = Blueprint("catalog", __name__)


@bp.get("/api/courses")
def list_courses():
    conn = get_connection()
    try:
        rows = conn.execute("SELECT id, name FROM courses ORDER BY id").fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


@bp.get("/api/dances")
def list_dances():
    conn = get_connection()
    try:
        rows = conn.execute("SELECT id, name FROM dances ORDER BY id").fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()
