import threading
import time
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

# Stdlib-based mock server (no external dependencies like Flask)
# Mimics RapidAPI endpoint locally using only Python standard library

# Module-level state for cumulative, non-decreasing stats per fixture
# This prevents oscillating values that could cause sync issues for multi-stat AND conditions
# Simulates realistic match progression (stats only increase or stabilize)
_fixture_progress = {}

# Mock fixtures with real team names (6 matches)
MOCK_FIXTURES = [
    {"fixture_id": 1001, "home_team": "Manchester City", "away_team": "Liverpool"},
    {"fixture_id": 1002, "home_team": "Real Madrid", "away_team": "Barcelona"},
    {"fixture_id": 1003, "home_team": "Bayern Munich", "away_team": "Borussia Dortmund"},
    {"fixture_id": 1004, "home_team": "Paris Saint-Germain", "away_team": "Marseille"},
    {"fixture_id": 1005, "home_team": "Juventus", "away_team": "AC Milan"},
    {"fixture_id": 1006, "home_team": "Arsenal", "away_team": "Chelsea"}
]


def get_mock_fixtures():
    """Return the list of mock fixtures with real team names."""
    return list(MOCK_FIXTURES)


def _get_fixture_teams(fixture_id):
    """Resolve fixture team names from the mock fixture list."""
    fixture_id = str(fixture_id)
    for fixture in MOCK_FIXTURES:
        if str(fixture["fixture_id"]) == fixture_id:
            return fixture["home_team"], fixture["away_team"]
    return "Home Team", "Away Team"

def generate_mock_stats(fixture_id):
    """
    Generates simulated statistics similar to the original mock.
    Uses cumulative progression for demo purposes to simulate changing (non-decreasing) stats.
    Ensures multi-stat conditions can reliably be met over time without stuck loops.
    Now includes elapsed minute for alerts (advances ~5 min per poll for quick demo; caps at 90).
    """
    # Normalize fixture_id to str for consistent dict keys in progress tracking.
    # Fixes bug: CLI passes int (e.g., 123), query_parse gives str (e.g., '123');
    # mismatched keys caused stalled progress in multi-fixture/non-mock cases,
    # leading to infinite loops after first alert.
    # Ensures true per-fixture independence across threads/modes.
    fixture_id = str(fixture_id)

    # Increment progress for this fixture (persistent across calls/polls)
    # _fixture_progress is module-level but now key-consistent (thread-safe for increments)
    if fixture_id not in _fixture_progress:
        _fixture_progress[fixture_id] = 0
    _fixture_progress[fixture_id] += 1
    progress = _fixture_progress[fixture_id]

    # base_val ramps up to 15 then stabilizes (ensures >= typical targets like 1-10)
    # Non-decreasing guarantees eventual all-met for AND in same poll
    base_val = min(progress, 15)

    # Elapsed minute: simulates match time progression (e.g., 5 min per poll for demo)
    # This enables reporting the minute when all thresholds are reached in alerts
    # Caps at 90 for realistic full match
    elapsed = min(progress * 5, 90)

    home_team, away_team = _get_fixture_teams(fixture_id)

    # Calculate possession to ensure it sums to 100 and is never negative
    home_possession = min(100, max(0, base_val * 5 + 30))
    away_possession = 100 - home_possession

    stats = [
        {
            "team": {"name": home_team},
            "statistics": [
                {"type": "Corners", "value": base_val},
                {"type": "Total Shots", "value": base_val + 2},
                {"type": "Goals", "value": base_val // 3},
                {"type": "Shots on Target", "value": base_val + 1},
                {"type": "Fouls Committed", "value": base_val * 2},
                {"type": "Offsides", "value": max(0, base_val - 2)},
                {"type": "Possession %", "value": home_possession},
                {"type": "Pass Accuracy %", "value": min(100, base_val * 3 + 60)},
                {"type": "Yellow Cards", "value": base_val // 4},
                {"type": "Red Cards", "value": max(0, base_val // 8)},
                {"type": "Tackles", "value": base_val * 2 + 5},
                {"type": "Interceptions", "value": base_val + 3}
            ]
        },
        {
            "team": {"name": away_team},
            "statistics": [
                {"type": "Corners", "value": max(0, base_val - 1)},
                {"type": "Total Shots", "value": base_val + 1},
                {"type": "Goals", "value": base_val // 4},
                {"type": "Shots on Target", "value": base_val},
                {"type": "Fouls Committed", "value": base_val * 2 + 1},
                {"type": "Offsides", "value": max(0, base_val - 3)},
                {"type": "Possession %", "value": away_possession},
                {"type": "Pass Accuracy %", "value": min(100, base_val * 3 + 55)},
                {"type": "Yellow Cards", "value": base_val // 5},
                {"type": "Red Cards", "value": max(0, base_val // 10)},
                {"type": "Tackles", "value": base_val * 2 + 3},
                {"type": "Interceptions", "value": base_val + 2}
            ]
        }
    ]
    return stats, elapsed


class MockAPIHandler(BaseHTTPRequestHandler):
    """
    Custom HTTP handler for mocking the RapidAPI endpoint using stdlib only.
    Handles GET /fixtures/statistics?fixture=XXX
    Returns JSON with simulated stats; silent logging.
    """

    def _set_headers(self):
        """Set CORS headers for cross-origin requests from the Next.js frontend."""
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        """Handle GET requests to the mock endpoint.
        Now includes 'elapsed' minute in top-level response for match time tracking.
        Updated: /api/fixtures and /api/history for web dashboard.
        """
        # Parse path for endpoint and query params
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        
        if path == '/fixtures/statistics':
            query_components = parse_qs(parsed_path.query)
            fixture_id = query_components.get('fixture', ['default'])[0]
            # Generate response mimicking API-Football structure
            stats, elapsed = generate_mock_stats(fixture_id)
            response_data = {
                "get": "fixtures/statistics",
                "parameters": {"fixture": fixture_id},
                "response": stats,
                "elapsed": elapsed
            }
            self._set_headers()
            self.wfile.write(json.dumps(response_data).encode('utf-8'))
        elif path == '/api/fixtures':
            response_data = {
                "results": len(MOCK_FIXTURES),
                "response": MOCK_FIXTURES
            }
            self._set_headers()
            self.wfile.write(json.dumps(response_data).encode('utf-8'))
        elif path == '/api/history':
            import os
            history_file = "history.json"
            if os.path.exists(history_file):
                try:
                    with open(history_file, "r") as f:
                        history = json.load(f)
                except Exception:
                    history = []
            else:
                history = []
            
            response_data = {
                "results": len(history),
                "response": history
            }
            self._set_headers()
            self.wfile.write(json.dumps(response_data).encode('utf-8'))
        else:
            self.send_error(404, "Endpoint not found in mock server")

    def log_message(self, format, *args):
        """Override to suppress server logs for cleaner CLI output."""
        return  # Silent - no external dep logging noise

def _is_server_running(host='127.0.0.1', port=5000):
    """
    Check if mock server is already listening on the port using stdlib socket.
    Non-intrusive test connect. Note: Connects to 127.0.0.1 even though server binds to 0.0.0.0
    because you cannot connect to 0.0.0.0 as a client.
    """
    import socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(1)
    result = sock.connect_ex((host, port))
    sock.close()
    return result == 0  # 0 means success/connectable


def start_mock_server(host='0.0.0.0', port=5000, daemon=True):
    """
    Starts the stdlib-based mock server in a background thread ONLY if not already running.
    Uses HTTPServer + BaseHTTPRequestHandler for the local API mock.
    Returns the thread object or None if already running. Server runs silently.
    This ensures no external network dependencies or third-party libs, and idempotent starts.
    """
    # Check if server is running by connecting to 127.0.0.1 (even though server binds to 0.0.0.0)
    if _is_server_running('127.0.0.1', port):
        # Server already active (e.g., from previous call or standalone)
        return None

    def run_server():
        """Inner func to run the server."""
        server = HTTPServer((host, port), MockAPIHandler)
        # HTTPServer logs "Serving HTTP on ..." to stderr minimally; acceptable for stdlib.
        # Handler overrides log_message to silence request logs.
        # No external deps for logging control.
        server.serve_forever()

    server_thread = threading.Thread(target=run_server)
    server_thread.daemon = daemon
    server_thread.start()
    # Give server a moment to bind/start
    time.sleep(1)
    # Re-check using 127.0.0.1 for connection test
    if not _is_server_running('127.0.0.1', port):
        print(f"Warning: Failed to start mock server on {host}:{port}")
    return server_thread


if __name__ == '__main__':
    # For standalone: python -m football_alert.mock_server
    print("Starting local mock server on http://0.0.0.0:5000 (Ctrl+C to stop)")
    start_mock_server(daemon=True)
    # Keep main thread alive to run server
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nMock server stopped.")
