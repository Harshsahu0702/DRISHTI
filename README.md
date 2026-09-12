# DRISHTI — City-Wide Visual Intelligence for Vehicle Tracking & Mobility Analysis

**Smart India Hackathon (SIH) 2026 — Problem Statement 26127**  
*City-Wide AI Engine for Multi-Camera ANPR Trajectory Tracking and Urban Traffic Analytics*

DRISHTI is an enterprise-grade visual intelligence platform delivering multi-camera vehicle detection, high-accuracy automatic number-plate recognition (ANPR), cross-camera trajectory reconstruction, real-time blacklist alerts, and GIS mobility analytics for smart cities.

---

## 🏛️ System Architecture

```
                       CCTV VIDEO STREAMS (4 Nodes)
                                    │
                                    ▼
                         Intelligent Frame Sampling
                                    │
                                    ▼
                        YOLOv8 Vehicle Detection
                                    │
                                    ▼
                     Plate Crop & Image Enhancement
             (CLAHE + Bilateral Denoising + Unsharp Masking)
                                    │
                                    ▼
                       OCR Inference & Normalization
                                    │
                                    ▼
                    Temporal Aggregation & Confidence
                                    │
                                    ▼
                 MySQL 8.0 Persistence (6 Core Tables)
                                    │
                                    ▼
                   FastAPI High-Performance REST APIs
                                    │
                                    ▼
                     React 18 + Vite Cyber Dashboard
       (Surveillance Grid • GIS Journey Map • Mobility Analytics • System Validation)
```

---

## 📊 Technical Benchmarks (Empirically Validated)

- **OCR Exact Match Accuracy**: **90.97%** (131 / 144 verified plate crops) — *Meets SIH >90% Requirement*
- **Character-Level Accuracy**: **98.27%**
- **Average OCR Confidence**: **90.6%**
- **Pipeline Latency**: **450.1 ms** (YOLO: 221.0 ms, Plate Detection: 202.5 ms, OCR: 9.4 ms, DB: 1.2 ms)
- **Active CCTV Nodes**: 4 Cameras across 2 Junctions (Vivekananda Sarani & Kanyapur Link Road)
- **Indexed Detections**: 144 License Plates in MySQL Database

---

## 🚀 Setup & Execution Guide

### 1. Prerequisites
- Python 3.10+
- Node.js 18+ and npm
- MySQL Server 8.0 running on `localhost:3306`

### 2. Environment Configuration
Copy `.env.example` to `.env`:
```bash
# Windows PowerShell
Copy-Item .env.example .env

# Linux / macOS
cp .env.example .env
```
Ensure credentials match your local MySQL configuration:
```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=sih_traffic_intelligence
```

### 3. Setup Python Backend Environment
```bash
python -m venv .venv
# Activate virtual environment:
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# Linux / macOS:
source .venv/bin/activate

pip install -r requirements.txt
```

### 4. Initialize Database
```bash
# Initialize relational schema
python scripts/init_database.py

# Ingest camera topology and detection metadata
python scripts/migrate_json_to_mysql.py
```

### 5. Start Backend REST API
```bash
uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
```
Interactive Swagger API documentation: `http://127.0.0.1:8000/docs`

### 6. Start Frontend Dashboard
```bash
cd frontend
npm install
npm run dev
```
Open browser at: `http://localhost:5173/`

---

## 🧪 Benchmark & Test Commands

### Run Full Automated Test Suite (39 Tests)
```bash
# Comprehensive SIH pipeline test suite (10 tests)
python tests/test_sih_pipeline.py

# API endpoints test suite (14 tests)
python tests/test_api_endpoints.py

# MySQL relational database test suite (15 tests)
python tests/test_mysql_database.py
```

### Reproduce ANPR Accuracy Benchmark
```bash
python evaluation/evaluate_ocr.py
```
Outputs validation report to `evaluation/evaluation_report.json`.

### Reproduce Throughput & Latency Benchmark
```bash
python benchmark/benchmark_pipeline.py
```
Outputs performance report to `benchmark/benchmark_report.json`.

---

## 📁 Repository Structure

```
sih/
├── ai/                      # YOLO and OCR model interfaces
├── backend/                 # FastAPI server, services, and database connection
│   ├── app.py               # REST API endpoints
│   ├── database/            # SQLAlchemy models & MySQL connection pool
│   └── services/            # Analytics, search, anomaly, and blacklist services
├── benchmark/               # Performance and latency benchmark suite
│   ├── benchmark_pipeline.py
│   └── benchmark_report.json
├── dataset/                 # Real MP4 CCTV feeds & ground-truth metadata
├── evaluation/              # OCR evaluation module (>90% accuracy benchmark)
│   ├── crops/               # Extracted plate crops from CCTV footage
│   ├── extract_plate_crops.py
│   ├── ground_truth.csv     # 144 annotated samples
│   ├── evaluate_ocr.py
│   └── evaluation_report.json
├── frontend/                # React 18 + Vite command center
│   └── src/
│       ├── components/      # CameraGrid, MapView, SystemValidationPage, etc.
│       └── services/api.js  # REST API client
├── static/                  # Evidence crops and media assets
├── tests/                   # Automated verification test suites
├── SIH_READINESS.md         # Full PS 26127 compliance matrix
└── README.md                # System documentation and instructions
```
