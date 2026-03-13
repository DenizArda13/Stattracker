import threading
import time
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
from datetime import datetime

# Stdlib-based mock server (no external dependencies like Flask)
# Mimics RapidAPI endpoint locally using only Python standard library

# Module-level state for cumulative, non-decreasing stats per fixture
# This prevents oscillating values that could cause sync issues for multi-stat AND conditions
# Simulates realistic match progression (stats only increase or stabilize)
_fixture_progress = {}

# Notification history storage (single source of truth)
_history_notifications = []
_history_file = "toast_history.json"

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


def _load_history_notifications():
    """Load notification history from file."""
    global _history_notifications
    if os.path.exists(_history_file):
        try:
            with open(_history_file, "r") as f:
                _history_notifications = json.load(f)
        except Exception:
            _history_notifications = []
    else:
        _history_notifications = []


def _save_history_notifications():
    """Save notification history to file."""
    try:
        with open(_history_file, "w") as f:
            json.dump(_history_notifications, f, indent=2)
    except Exception as e:
        print(f"Error saving notification history: {e}")


def add_history_notification(title, message, fixture_id=None, match_name=None):
    """Add a new notification to history and save to file."""
    global _history_notifications
    notification = {
        "id": int(time.time() * 1000),  # Simple timestamp-based ID
        "timestamp": datetime.now().isoformat(),
        "title": title,
        "message": message,
        "fixture_id": fixture_id,
        "match_name": match_name,
        "type": "toast_notification"
    }
    _history_notifications.append(notification)
    # Keep only last 100 notifications to prevent file bloat
    if len(_history_notifications) > 100:
        _history_notifications = _history_notifications[-100:]
    _save_history_notifications()
    return notification


def delete_history_notification(notification_id):
    """Delete a notification from history by ID and save to file."""
    global _history_notifications
    _load_history_notifications()
    original_length = len(_history_notifications)
    _history_notifications = [n for n in _history_notifications if n["id"] != notification_id]
    deleted = len(_history_notifications) < original_length
    if deleted:
        _save_history_notifications()
    return deleted


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
    
    # Use fixture_id to create deterministic variation between matches
    # This prevents all matches from having identical stats
    fid = int(fixture_id)
    v1 = fid % 3
    v2 = fid % 4
    v3 = fid % 2
    v4 = (fid + 1) % 3

    # Calculate possession to ensure it sums to 100 and is never negative
    # Vary possession based on fixture_id
    home_possession = min(100, max(0, base_val * 5 + 30 + (v1 * 5)))
    away_possession = 100 - home_possession

    stats = [
        {
            "team": {"name": home_team},
            "statistics": [
                {"type": "Corners", "value": base_val + v1},
                {"type": "Total Shots", "value": base_val + 2 + v2},
                {"type": "Goals", "value": (base_val + v3) // 3},
                {"type": "Shots on Target", "value": base_val + 1 + v1},
                {"type": "Fouls Committed", "value": base_val * 2 + v2},
                {"type": "Offsides", "value": max(0, base_val - 2 + v3)},
                {"type": "Possession %", "value": home_possession},
                {"type": "Pass Accuracy %", "value": min(100, base_val * 3 + 60 + v4)},
                {"type": "Yellow Cards", "value": (base_val + v2) // 4},
                {"type": "Red Cards", "value": max(0, (base_val) // 12)},
                {"type": "Tackles", "value": base_val * 2 + 5 + v1},
                {"type": "Interceptions", "value": base_val + 3 + v2}
            ]
        },
        {
            "team": {"name": away_team},
            "statistics": [
                {"type": "Corners", "value": max(0, base_val - 1 + v2)},
                {"type": "Total Shots", "value": base_val + 1 + v3},
                {"type": "Goals", "value": (base_val + v4) // 4},
                {"type": "Shots on Target", "value": base_val + v2},
                {"type": "Fouls Committed", "value": base_val * 2 + 1 + v1},
                {"type": "Offsides", "value": max(0, base_val - 3 + v2)},
                {"type": "Possession %", "value": away_possession},
                {"type": "Pass Accuracy %", "value": min(100, base_val * 3 + 55 - v3)},
                {"type": "Yellow Cards", "value": (base_val + v1) // 5},
                {"type": "Red Cards", "value": max(0, (base_val) // 15)},
                {"type": "Tackles", "value": base_val * 2 + 3 + v4},
                {"type": "Interceptions", "value": base_val + 2 + v3}
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
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        """Handle GET requests to the mock endpoint.
        Now includes 'elapsed' minute in top-level response for match time tracking.
        Updated: /api/fixtures and /api/history for web dashboard.
        Updated: /api/history as the unified notification history endpoint.
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
            # Unified history endpoint
            _load_history_notifications()
            response_data = {
                "results": len(_history_notifications),
                "response": _history_notifications
            }
            self._set_headers()
            self.wfile.write(json.dumps(response_data).encode('utf-8'))
        else:
            self.send_error(404, "Endpoint not found in mock server")

    def do_POST(self):
        """Handle POST requests for logging history notifications."""
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        
        if path == '/api/history':
            # Read the request body
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                title = data.get('title', 'Notification')
                message = data.get('message', '')
                fixture_id = data.get('fixture_id')
                match_name = data.get('match_name')
                
                # Add the history notification
                notification = add_history_notification(
                    title=title,
                    message=message,
                    fixture_id=fixture_id,
                    match_name=match_name
                )
                
                self._set_headers()
                response_data = {
                    "success": True,
                    "message": "History notification logged",
                    "notification": notification
                }
                self.wfile.write(json.dumps(response_data).encode('utf-8'))
            except Exception as e:
                self.send_error(400, f"Invalid request data: {str(e)}")
        else:
            self.send_error(404, "Endpoint not found in mock server")

    def do_DELETE(self):
        """Handle DELETE requests for removing history notifications."""
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        
        if path.startswith('/api/history/'):
            # Extract notification ID from path: /api/history/{id}
            try:
                notification_id = int(path.split('/')[-1])
                deleted = delete_history_notification(notification_id)
                
                if deleted:
                    self._set_headers()
                    response_data = {
                        "success": True,
                        "message": "Notification deleted successfully"
                    }
                    self.wfile.write(json.dumps(response_data).encode('utf-8'))
                else:
                    self.send_error(404, "Notification not found")
            except (ValueError, IndexError):
                self.send_error(400, "Invalid notification ID")
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
