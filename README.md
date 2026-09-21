# MonoTransfer // Production System

**MonoTransfer** is a minimalist, industrial playlist migration tool that transfers playlists from Spotify to YouTube Music. Engineered with a strict Nothing OS monochromatic aesthetic: zero color accents anywhere (including success, warning, and error states), heavy DotGothic16 digital typography, massive whitespace, and high-reliability background processing.

---

## 1. System Architecture

MonoTransfer requires four continuous processes coordinated through PostgreSQL and Redis:

```
┌─────────────────────────────────────────────────────────────┐
│                   MonoTransfer Frontend                     │
│         Next.js 15 (App Router, Tailwind, Framer)           │
└──────────────┬───────────────────────────────┬──────────────┘
               │ HTTP REST                     │ WebSocket (:3001)
               ▼                               ▼
┌──────────────────────────────┐ ┌────────────────────────────┐
│      Next.js API Server      │ │   WebSocket Server (Node)  │
│  - Auth (OAuth 2.0 PKCE)     │ │ - Scoped 2-min JWT auth    │
│  - Playlists & Track sync    │ │ - Subscribes Redis Pub/Sub │
│  - Transfers & Item actions  │ │ - Immediate snapshot push  │
└──────────────┬───────────────┘ └─────────────▲──────────────┘
               │                               │
               ▼ BullMQ                        │ Redis Pub/Sub
┌──────────────────────────────┐               │
│     BullMQ Redis Queue       │───────────────┤
│  - transfer-queue            │               │
│  - Concurrency: 5 transfers  │               │
└──────────────┬───────────────┘               │
               │                               │
               ▼                               │
┌──────────────────────────────┐               │
│    Transfer Worker Process   │───────────────┘
│  - Bounded 3-track semaphore │
│  - Matching engine scoring   │
│  - Cooperative cancellation  │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐ ┌────────────────────────────┐
│   ytmusic-service (:8000)    │ │   PostgreSQL Database      │
│  - Isolated FastAPI Python   │ │ - AES-256-GCM encrypted    │
│  - Public YT Music search    │ │   credentials at rest      │
└──────────────────────────────┘ └────────────────────────────┘
```

---

## 2. Key Features

- **Strict Nothing OS Monochromatic Design**: Black (#000000) and White (#FFFFFF) palette with zero colors. Success, warning, and error states are indicated via typography, weight, and geometric glyphs (`●`, `○`, `■`, `▲`, `✕`, `✓`).
- **10 Core Application Screens**:
  1. **Landing** (`/`): Centered monolithic title, Spotify & Google connect, Sandbox demo mode.
  2. **Dashboard** (`/dashboard`): Provider links, recent migrations, telemetry statistics.
  3. **Playlist Browser** (`/playlists`): Search, sort by name or track count, pagination, Spotify re-sync.
  4. **Playlist Preview** (`/playlists/[id]`): Detailed track table with duration and explicit tags.
  5. **Transfer Configuration** (`/transfers/new`): Create new vs append existing, 5 industrial directives, minimum confidence slider.
  6. **Transfer Progress** (`/transfers/[id]`): Full-screen focus mode, massive percentage readout, segmented progress bar, real-time WebSocket telemetry, cooperative cancellation.
  7. **Results** (`/transfers/[id]/results`): Matched/failed/skipped breakdown, YouTube Music link, CSV report export.
  8. **Failed Matches** (`/transfers/[id]/failures`): Review unmatched tracks, view top candidates scored by confidence, search again with custom query, manual selection, skip.
  9. **Transfer History** (`/transfers`): Chronological audit trail with duration, status badges, and direct report access.
  10. **Settings** (`/settings`): OAuth connections, monochrome theme toggle, transfer default preferences, danger zone account purge.
- **Confidence-Scored Matching Engine**:
  - Title similarity: 0.50 (Dice-coefficient with normalized titles stripping `feat.`, `(Official Video)`, remastered tags, etc.)
  - Artist similarity: 0.35 (normalized exact, substring, or Dice match)
  - Duration similarity: 0.15 (linear falloff: ≤2s diff = 1.0, ≥30s diff = 0.0)
  - Marker penalties: Live versions without opt-in (×0.15), Remix (×0.50), Cover (×0.20), Explicit mismatches (×0.65).
  - Secondary relaxed retry pass (`max(0.5, threshold - 0.15)`).
- **Security & Token Encryption**:
  - Native OAuth 2.0 PKCE flow (no third-party auth library).
  - All access and refresh tokens stored encrypted at rest with AES-256-GCM.
  - Transparent token refresh via `getValidAccessToken()` with 5-minute safety margin and audit logging.
  - Multi-provider user merging: linking Spotify and Google to one account.
  - Scoped 2-minute WebSocket JWTs.

---

## 3. Quick Start with Docker Compose

The fastest way to spin up all 6 services (Web, Worker, WS, ytmusic-service, Postgres, Redis):

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Start all services via Docker Compose
docker compose up -d

# 3. Apply Prisma database schema
docker compose exec web npx prisma db push
```

Access the application at: **http://localhost:3000**

---

## 4. Manual / Local Development Setup

### Prerequisites
- Node.js 20+ / 24+
- Python 3.10+ (for ytmusic-service)
- PostgreSQL running locally or in Docker
- Redis running locally or in Docker

### Step 1: Install Dependencies
```bash
# Install Node dependencies
npm install

# Generate Prisma Client
npx prisma generate
```

### Step 2: Configure Environment
Copy `.env.example` to `.env` and configure your credentials:
```bash
cp .env.example .env
```

### Step 3: Run the 4 Processes

Open 4 separate terminal windows:

**Terminal 1 — Next.js Web Application:**
```bash
npm run dev
# Running on http://localhost:3000
```

**Terminal 2 — BullMQ Transfer Worker:**
```bash
npm run worker
# Listening on BullMQ transfer-queue
```

**Terminal 3 — Standalone WebSocket Progress Server:**
```bash
npm run ws
# Listening on ws://localhost:3001
```

**Terminal 4 — Python ytmusicapi Microservice:**
```bash
cd ytmusic-service
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000
# Running on http://localhost:8000
```

---

## 5. External OAuth Credentials Setup

### Spotify Web API
1. Visit the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Create an App.
3. In App Settings, add the Redirect URI:
   `http://localhost:3000/api/auth/spotify/callback`
4. Copy `Client ID` and `Client Secret` into `.env`.

### Google Cloud / YouTube Data API v3
1. Visit the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a Project and enable **YouTube Data API v3**.
3. Under **APIs & Services > Credentials**, create an **OAuth 2.0 Client ID** (Web application).
4. Add Authorized Redirect URI:
   `http://localhost:3000/api/auth/google/callback`
5. Copy `Client ID` and `Client Secret` into `.env`.

### Instant Sandbox / Demo Mode
MonoTransfer contains an integrated **Sandbox Demo Mode**. Clicking **"ENTER SANDBOX DEMO MODE"** on the landing page instantly initializes a mock session pre-populated with sample Spotify playlists, mock Google connections, simulated tracks, and full matching engine evaluation, allowing immediate testing of the entire 10-screen lifecycle without external API keys.

---

## 6. Verification and Testing

MonoTransfer includes standalone tests verifying:
- Token encryption and decryption using AES-256-GCM.
- Dice-coefficient string similarity and title normalization.
- Matching engine penalty scoring and threshold relaxation.

Run the test suite:
```bash
npx tsx src/test/matcher.test.ts
```
