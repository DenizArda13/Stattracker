# Football Alert Dashboard

A modern web dashboard for tracking live football match statistics using a local mock server. Features a responsive Next.js frontend with real-time updates and session history viewing.

## Overview

This project provides a web-based dashboard for monitoring football match statistics. It consists of:
- **Mock Server**: A Python stdlib-based server that simulates football match data
- **Web Dashboard**: A Next.js React application with Tailwind CSS for the UI

## Setup

### Prerequisites

- Python 3.x (for the mock server)
- Node.js and npm (for the web dashboard)

### 1. Install Dashboard Dependencies

```bash
cd dashboard
npm install
```

No Python package installation is required - the mock server uses only the Python standard library.

## Running the Application

### Step 1: Start the Mock Server

The mock server binds to `0.0.0.0:5000` (all interfaces) to allow both local and container communication:

```bash
python3 -m football_alert.mock_server
```

You should see: `Starting local mock server on http://0.0.0.0:5000 (Ctrl+C to stop)`

The server accepts connections from:
- localhost / 127.0.0.1 (for local development)
- Any network interface (for container deployments)

### Step 2: Start the Web Dashboard

In a new terminal:

```bash
cd dashboard
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Container Deployment

When running in containers, ensure the mock server container exposes port 5000 and is accessible from the dashboard container. The mock server binds to `0.0.0.0:5000` which allows connections from any interface.

For Docker deployments, you may need to map port 5000:

```bash
docker run -p 5000:5000 mock-server-image
```

## Mock Server API Endpoints

The mock server provides the following endpoints:

- `GET /fixtures/statistics?fixture=<id>` - Get statistics for a specific fixture
- `GET /api/fixtures` - List all available fixtures (6 mock matches)
- `GET /api/history` - Get session history from `history.json`

## Available Fixtures

| ID | Match |
|----|-------|
| 1001 | Manchester City vs Liverpool |
| 1002 | Real Madrid vs Barcelona |
| 1003 | Bayern Munich vs Borussia Dortmund |
| 1004 | Paris Saint-Germain vs Marseille |
| 1005 | Juventus vs AC Milan |
| 1006 | Arsenal vs Chelsea |

## Trackable Statistics

- Corners
- Total Shots
- Goals
- Shots on Target
- Fouls Committed
- Offsides
- Possession %
- Pass Accuracy %
- Yellow Cards
- Red Cards
- Tackles
- Interceptions

## Web Dashboard Features

- **Live Match Tracking**: Real-time statistics with 2-second polling
- **Fixture Selection**: Choose from 6 available matches
- **Session History**: View past monitoring sessions
- **Responsive Design**: Dark mode UI built with Tailwind CSS
- **Container Support**: Configurable API endpoint via environment variables

## Project Structure

```
football-alert-cli/
├── dashboard/              # Next.js web dashboard
│   ├── src/app/page.tsx   # Main dashboard component
│   └── package.json       # Node dependencies
├── football_alert/
│   ├── mock_server.py     # Python stdlib mock server
│   └── __init__.py
└── README.md
```

## Development

### Mock Server

The mock server uses Python's `http.server` from the standard library. It simulates cumulative match statistics that increase over time (capped at 90 minutes).

Key features:
- No external dependencies
- Binds to `0.0.0.0:5000` for container compatibility
- CORS enabled for web dashboard access
- Thread-safe state management

### Dashboard

The dashboard is built with:
- Next.js 14+ (App Router)
- React 18+
- TypeScript
- Tailwind CSS
- Lucide React icons

The dashboard connects to `http://localhost:5000` for the mock server API.

## License

MIT