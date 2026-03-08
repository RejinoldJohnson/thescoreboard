# 🏓 Table Tennis Tournament Portal — Setup Guide

## Project Structure

```
tt-tournament/
├── backend/              ← FastAPI (Python)
│   ├── main.py           ← App entry point
│   ├── database.py       ← PostgreSQL connection
│   ├── schemas.py        ← Pydantic models
│   ├── requirements.txt  ← Python dependencies
│   ├── .env.example      ← Config template
│   ├── models/
│   │   └── models.py     ← SQLAlchemy DB models
│   └── routers/
│       ├── auth.py       ← Login + JWT
│       ├── players.py    ← Player CRUD + standings
│       └── matches.py    ← Match CRUD + live updates
└── frontend/             ← React + Vite
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── .env.example
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── index.css
        ├── api/
        │   └── client.js  ← All API calls
        └── pages/
            ├── PublicPortal.jsx
            ├── AdminPortal.jsx
            └── AdminLogin.jsx
```

---

## Prerequisites

Make sure you have these installed:

- **Python 3.10+** → https://python.org
- **Node.js 18+** → https://nodejs.org
- **PostgreSQL 14+** → https://postgresql.org

---

## Step 1 — PostgreSQL Setup

### Option A: Local install
```bash
# Mac
brew install postgresql@14
brew services start postgresql@14

# Ubuntu/Debian
sudo apt install postgresql
sudo systemctl start postgresql
```

### Create the database
```bash
psql -U postgres
CREATE DATABASE tournament;
\q
```

### Option B: Free cloud PostgreSQL (recommended for sharing)
Use **Supabase** (free tier): https://supabase.com
1. Create a new project
2. Go to Settings → Database → copy the connection string
3. Use it as your `DATABASE_URL` in `.env`

---

## Step 2 — Backend Setup

```bash
cd tt-tournament/backend

# Create virtual environment
python -m venv venv

# Activate it
source venv/bin/activate        # Mac/Linux
venv\Scripts\activate           # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
```

### Edit `.env`:
```
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/tournament
ADMIN_PASSWORD=your_secure_password
SECRET_KEY=a_long_random_string_at_least_32_chars
```

> 💡 Generate a secret key: `python -c "import secrets; print(secrets.token_hex(32))"`

### Run the backend:
```bash
uvicorn main:app --reload --port 8000
```

Backend is now running at: **http://localhost:8000**
API docs available at: **http://localhost:8000/docs**

---

## Step 3 — Frontend Setup

```bash
cd tt-tournament/frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
```

### Edit `.env` (leave as-is for local dev):
```
VITE_API_URL=http://localhost:8000/api
```

### Run the frontend:
```bash
npm run dev
```

Frontend is now running at: **http://localhost:5173**

---

## Step 4 — Using the App

### 🌍 Public View
- Open **http://localhost:5173**
- Viewers see live scores, standings, schedule
- Auto-refreshes every 5 seconds

### 🔐 Admin Panel
- Click **"Admin"** button in the top right (or go to `#admin`)
- Enter your password from `.env`
- **Players tab** — register players (name + club)
- **Matches tab** — schedule matches, update scores, change status to Live/Done
- Changes appear instantly for all viewers

---

## Deployment Options (Go Live)

### Option A: Render.com (free, easiest)
1. Push your code to GitHub
2. Create a **Web Service** for the backend:
   - Build command: `pip install -r requirements.txt`
   - Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - Add environment variables from `.env`
3. Create a **Static Site** for the frontend:
   - Build command: `npm install && npm run build`
   - Publish directory: `dist`
   - Set `VITE_API_URL` to your backend URL

### Option B: Railway.app (simple, $5/month after trial)
1. Connect your GitHub repo
2. Add a PostgreSQL plugin
3. Deploy backend + frontend separately

### Option C: VPS (DigitalOcean, Hetzner, etc.)
Use **nginx** as a reverse proxy + **systemd** to keep both services running.

---

## Changing the Admin Password

Edit `backend/.env`:
```
ADMIN_PASSWORD=your_new_password
```
Restart the backend. That's it.

---

## API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | No | Get admin token |
| GET | `/api/players/` | No | List all players |
| POST | `/api/players/` | Admin | Add player |
| DELETE | `/api/players/{id}` | Admin | Remove player |
| GET | `/api/players/standings` | No | Get standings |
| GET | `/api/matches/` | No | List all matches |
| POST | `/api/matches/` | Admin | Schedule match |
| PATCH | `/api/matches/{id}` | Admin | Update score/status |
| DELETE | `/api/matches/{id}` | Admin | Remove match |

Full interactive docs: **http://localhost:8000/docs**

---

## Troubleshooting

**Backend can't connect to PostgreSQL**
→ Check `DATABASE_URL` in `.env` and that PostgreSQL is running

**CORS errors in browser**
→ Make sure backend CORS includes your frontend URL (edit `main.py`)

**Login not working**
→ Check `ADMIN_PASSWORD` in backend `.env` matches what you're typing

**Frontend not updating**
→ Polling runs every 5 seconds — wait a moment after admin saves

---

*Need to add bracket generation, player seeding, or export to PDF? Just ask!*
