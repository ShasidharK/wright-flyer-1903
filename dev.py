#!/usr/bin/env python3
"""Dev server for the Wright Flyer page: serves this folder on http://localhost:8765, rebuilds index.html whenever
a source file changes, and tells open pages to reload (they poll /__version; see the snippet build.py adds).
   python dev.py"""
import http.server, json, os, subprocess, sys, threading, time
PORT = 8765
here = os.path.dirname(os.path.abspath(__file__))
SRC = lambda: ['build.py'] + [os.path.join('src', f) for f in sorted(os.listdir(os.path.join(here, 'src'))) if f.endswith(('.js', '.html'))]   # every source file counts
version = {'v': 0}

def watch():
    last = None
    while True:
        try: m = max(os.path.getmtime(os.path.join(here, f)) for f in SRC() if os.path.exists(os.path.join(here, f)))
        except ValueError: m = None
        if m != last:
            last = m
            r = subprocess.run([sys.executable, os.path.join(here, 'build.py')], capture_output=True, text=True)
            print(time.strftime('%H:%M:%S'), (r.stdout or r.stderr).strip(), flush=True)
            if r.returncode == 0: version['v'] = int(time.time() * 1000)
        time.sleep(0.4)

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=here, **k)
    def do_GET(self):
        if self.path.startswith('/__version'):
            body = json.dumps(version).encode(); self.send_response(200)
            self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body); return
        super().do_GET()
    def end_headers(self): self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def log_message(self, *a): pass

threading.Thread(target=watch, daemon=True).start()
print(f'serving http://localhost:{PORT}/', flush=True)
http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
