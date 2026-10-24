#!/usr/bin/env python3
"""Build index.html, the Wright Flyer page, from the sources in src/.

   python build.py        (dev.py runs this whenever a source file changes)

The page is one self-contained HTML file: the template and the iso-glow figure code, then the Flyer modules in the order
they depend on each other. three.js loads from jsDelivr through the template's import map."""
import io, os
here = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(here, 'src')
read = lambda p: io.open(p, encoding='utf-8').read()
MODULES = ['flyer-screen.js', 'flyer-bots.js', 'flyer-data.js', 'flyer-teach.js', 'flyer-model.js', 'flyer-look.js', 'flyer-fx.js',
           'flyer-physics.js', 'flyer-world.js', 'flyer-studio.js', 'flyer-tunnel.js', 'flyer-app.js']
page = read(os.path.join(src, 'template.html'))
code = '\n'.join(read(os.path.join(src, f)) for f in ['anim.js'] + MODULES)
# served by dev.py on localhost: reload when a rebuild lands (opened from disk, this does nothing)
live = (r'<script>if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) { let v = null; setInterval(async () => { try { '
        r'const j = await (await fetch("/__version", { cache: "no-store" })).json(); if (v !== null && j.v !== v) location.reload(); v = j.v; } catch (e) {} }, 1000); }</script>')
for a, b in [('/* paste 3D figure modules here */', code), ('<title>No LAG</title>', '<title>Wright Flyer 1903</title>'), ('</body>', live + '\n</body>')]:
    assert a in page, a; page = page.replace(a, b, 1)
out = os.path.join(here, 'index.html')
io.open(out, 'w', encoding='utf-8').write(page)
print('wrote', os.path.basename(out), len(page) // 1024, 'KB')
