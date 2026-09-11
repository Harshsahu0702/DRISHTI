# SIH 2026 — City-Wide Traffic Intelligence & Journey Reconstruction Platform

An enterprise AI-assisted city-wide traffic monitoring, ANPR plate search, and vehicle journey reconstruction system powered by FastAPI, MySQL 8.0, and React 18 + Vite.

---

## 🏗️ Project Architecture

- **`backend/`**: FastAPI REST API services, MySQL connection pooling, SQLAlchemy ORM models, and analytics engine.
- **`frontend/`**: Modern cyber-themed React dashboard (Leaflet GIS mapping, CCTV grid, ANPR search, blacklist alert management).
- **`database/`**: Database schemas and topology configurations.
- **`scripts/`**: Automated MySQL initialization and JSON data migration scripts.
- **`docs/`**: Setup guides and architecture documentation.
- **`tests/`**: Automated test suites for MySQL validation and API endpoints.
- **`dataset/metadata/`**: Camera nodes and detection metadata for initialization and offline fallback.

---

## 🚀 Setup & Run Instructions (For Collaborators)

### 1. Clone the Repository
```bash
git clone <YOUR_REPO_URL>
cd sih
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
# Windows PowerShell
Copy-Item .env.example .env

# Linux / macOS
cp .env.example .env
```
Edit `.env` with your MySQL credentials:
```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=sih_traffic_intelligence
```

### 3. Setup Python Backend Environment
```bash
python -m venv .venv
# Activate venv:
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# Linux / macOS:
source .venv/bin/activate

pip install -r requirements.txt
```

### 4. Setup MySQL Database
Ensure MySQL Server is running on your machine, then run:
```bash
# 1. Initialize MySQL database tables & topology:
python scripts/init_database.py

# 2. Ingest metadata & detections into MySQL:
python scripts/migrate_json_to_mysql.py
```

### 5. Run the Backend API
```bash
uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
```
API Documentation will be available at: `http://127.0.0.1:8000/docs`

### 6. Run the Frontend Dashboard
In a new terminal:
```bash
cd frontend
npm install
npm run dev
```
Open your browser at: `http://localhost:5173`

---

## 🧪 Running Tests
```bash
python test_api_backend.py
python -m unittest discover -s tests
```
