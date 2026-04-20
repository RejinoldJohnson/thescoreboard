# TheScoreBoard

Live tournament scores for Table Tennis, Badminton, Cricket, Football and more.

## Quick Start

### Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your Supabase DATABASE_URL and SECRET_KEY
python run.py
```

API runs at `http://localhost:8000`. Docs at `http://localhost:8000/docs`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at `http://localhost:5173`.

### Database Migrations (Alembic)

```bash
cd backend

# Generate a migration after model changes
alembic revision --autogenerate -m "describe your change"

# Apply migrations
alembic upgrade head
```

## Architecture

```
User → Organization → Tournament → Event → Groups/Matches/Sets
```

- **User**: Organizer account (email/password auth)
- **Organization**: Club, school, or group that hosts tournaments
- **Tournament**: Top-level shareable entity (has poster, sponsors, slug URL)
- **Event**: A specific sport + format within a tournament (e.g., "TT Singles")
- **Match**: A game between two participants, with set-by-set scoring

## Adding a New Sport

1. Create `backend/app/sports/<sport_name>/`
2. Add `config.py` with defaults
3. Add `scoring.py` with a class inheriting from `BaseSport`
4. Register in `backend/app/sports/registry.py`

The rest of the app (routes, frontend) picks it up automatically.

## Deployment (Render)

- **Prod backend**: Deploy from `main` branch, start command: `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Prod frontend**: Static site from `frontend/`, build: `npm run build`, publish: `dist`
- **Dev**: Same setup from `dev` branch with separate Supabase project
