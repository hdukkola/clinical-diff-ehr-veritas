"""Serve the editorial prototype and its comparison API on one loopback origin."""
import argparse
import os
from http.server import ThreadingHTTPServer
from pathlib import Path

from service import Handler

WEB_ROOT = Path(__file__).resolve().parent.parent / 'veritas-editorial'
ASSETS = {
    '/': ('index.html', 'text/html'),
    '/index.html': ('index.html', 'text/html'),
    '/note-extraction.js': ('note-extraction.js', 'application/javascript'),
}


RELOAD_SCRIPT = b"""
<script>
(async function watchPreview() {
  let current = null;
  setInterval(async () => {
    try {
      const response = await fetch('/__preview_version', {cache: 'no-store'});
      if (!response.ok) return;
      const next = await response.text();
      if (current !== null && next !== current) location.reload();
      current = next;
    } catch (_) {
      // Keep the current view if the preview temporarily disconnects.
    }
  }, 1000);
})();
</script>
"""


class EditorialHandler(Handler):
    watch = False

    def parse_request(self):
        if not super().parse_request():
            return False
        if self.headers.get('Host') != f'127.0.0.1:{self.server.server_port}':
            self.send_error(403, 'Use the printed loopback address.')
            return False
        return True

    def do_GET(self):
        if self.watch and self.path == '/__preview_version':
            stamps = [str((WEB_ROOT / name).stat().st_mtime_ns) for name, _ in set(ASSETS.values())]
            return self.send_asset(','.join(sorted(stamps)).encode(), 'text/plain')
        asset = ASSETS.get(self.path)
        if asset is None:
            return super().do_GET()
        name, content_type = asset
        body = (WEB_ROOT / name).read_bytes()
        if self.watch and content_type == 'text/html':
            body = body.replace(b'</body>', RELOAD_SCRIPT + b'</body>')
        self.send_asset(body, content_type)

    def send_asset(self, body, content_type):
        self.send_response(200)
        self.send_header('Content-Type', content_type + '; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8766)
    parser.add_argument('--replay', action='store_true', help='Use the fixed fictional example.')
    parser.add_argument('--watch', action='store_true', help='Refresh the browser when frontend files change.')
    args = parser.parse_args()
    os.environ['CLINICAL_DIFF_REPLAY'] = '1' if args.replay else '0'
    with ThreadingHTTPServer(('127.0.0.1', args.port), EditorialHandler) as server:
        url = f'http://127.0.0.1:{server.server_port}'
        EditorialHandler.allowed_origins = {url}
        EditorialHandler.watch = args.watch
        print(f'{url}/  ({"simulated replay" if args.replay else "local inference"})', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
