# DanceFans

Webanwendung zur Verwaltung von Tanzkursen — Figuren, Folgen, Unterrichtshistorie und Anwesenheit.

- Frontend: React + Vite + Tailwind + React Router
- Backend: Flask + SQLite + Werkzeug (Passwort-Hashing) + Flask-CORS

## Projektstruktur

```
DanceOrga/
  backend/    Flask API + SQLite + CLI
  frontend/   React App
```

## Backend starten

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Beim ersten Start werden die Datenbank `danceorga.db` und die Basisdaten
(2 Kurse, Tänze, Demo-Figuren, Demo-Benutzer) automatisch angelegt.

API läuft auf `http://127.0.0.1:5000`.

### Standard-Logins

- `admin` / `admin123` (Admin, Kurs Donnerstag 20:00 Uhr)
- `user` / `user123` (Teilnehmer, Kurs Donnerstag 20:00 Uhr)

### Benutzerverwaltung über CLI

```powershell
python manage.py create-user
python manage.py list-users
python manage.py delete-user
```

## Frontend starten

```powershell
cd frontend
npm install
npm run dev
```

Frontend läuft auf `http://127.0.0.1:5173` und proxyt `/api`-Aufrufe ans Backend.

## Funktionen

- **Login** über Flask Backend mit gehashten Passwörtern und Token-Auth
- **Rollenbasiert**: Admin darf Historien- und Anwesenheitseinträge anlegen,
  Teilnehmer nur lesen (sowohl im Frontend als auch im Backend geprüft).
- **Figuren** und **Folgen** je Tanz als Tabs.
- **Historie** zeigt die letzten 4 Wochen in 4 Sektionen.
- **Anwesenheit** als Tabelle mit Haken/Kreuz und Stundenstand (1/4 … 4/4).
- **Sidebar rechts**, fixiert, Inhalt unabhängig scrollbar.
