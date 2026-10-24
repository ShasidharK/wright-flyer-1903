# Wright Flyer 1903, an interactive 3D model

**Live demo:** https://shasidhark.github.io/wright-flyer-1903/

A browser-playable 3D model of the Wright brothers' 1903 Flyer, the first powered, controlled, sustained flight aircraft. It runs in any modern browser, on a desktop or a phone, with no install. The page is a single HTML file that uses [three.js](https://threejs.org) for the 3D.

The project is built to learn from. Each of the three modes covers a different question about the aeroplane:

| Mode | What it teaches | What you do |
| --- | --- | --- |
| **Workshop** | What each part of the Flyer is and how it works | Take the aeroplane apart, see inside the wings, and open up 12 component demos (wings, struts, elevator, rudder, hip cradle, engine, chains, propellers, cooling, fuel, skids and rail, anemometer) |
| **Wind tunnel** | The physics of flight | Work through 10 guided lessons on lift, weight, thrust and drag, stall, and wing warping. Change the airspeed, angle of attack and bank, and watch the forces and the smoke |
| **Kitty Hawk** | Flying the aeroplane | Fly it on the 1903 field, with wind and gusts, a flight log, autopilot, click-to-fly, and a walk around on foot |

## Using it

**Desktop:** click or tap a part in the Workshop to read about it. Double-click it, or press ▶ in the Components list, to see it working on its own.

**Keyboard:**

- `1`, `2`, `3`: switch to the Workshop, Wind tunnel or Kitty Hawk
- `?`: the mode guide. `H`: hide the panels. `[` `]` `-` `=`: orbit and zoom
- **Workshop:** `E` exploded view, `X` see-through, `Enter` or `I` open the demo, `←` `→` step through it, `Space` play, `R` turntable, `G` labels, `Esc` back
- **Wind tunnel:** `←` `→` lessons, `↑` `↓` angle of attack, `W` `S` airspeed, `Space` sweep
- **Kitty Hawk:** `W` `S` throttle, `A` `D` bank, `↑` `↓` nose up and down, `Shift` full power, `Space` autopilot, `V` walk on foot or climb back aboard, `C` camera, `B` behind the aircraft, `O` forces, `P` flight path, `0` reset, `G` labels

**Phone and tablet:** the on-screen stick steers and the strip on the right sets the throttle. The header has buttons for full screen and for portrait or landscape. In landscape, the panels slide out from the right.

## Running it locally

You need Python 3 and an internet connection (three.js loads from jsDelivr).

```bash
python dev.py
```

Then open http://localhost:8765. The server rebuilds `index.html` whenever a source file in `src/` changes, and the open page reloads by itself.

To build the page once without the server:

```bash
python build.py
```

## How it's put together

```
index.html         the built page: this is what GitHub Pages serves
build.py           joins the template and the source files into index.html
dev.py             local server with rebuild and live reload
src/
  template.html    page shell: renderer, materials, themes, panels
  anim.js          silhouette outline, crease lines and contact lines
  flyer-app.js     the three modes, the UI, camera and input
  flyer-screen.js  full screen, portrait and landscape handling
  flyer-model.js   the aeroplane, built part by part
  flyer-physics.js flight model: arcade and historic settings
  flyer-studio.js  the workshop studio and the component demos
  flyer-tunnel.js  the wind tunnel and its airflow
  flyer-world.js   the 1903 Kitty Hawk field
  flyer-look.js    textures and colour themes
  flyer-fx.js      force arrows and labels
  flyer-teach.js   component explanations and the tunnel lessons
  flyer-data.js    names, facts and specifications
  flyer-bots.js    the touch and tap controller
```

The look is a line drawing with glowing live parts. Lift, weight, thrust and drag are drawn as arrows, and the Flyer's parts are colour-coded so you can follow them through the views.

## Notes on accuracy

- The flight model is a simplified simulation for learning, not a validated aerodynamic model. The **Arcade** setting gives forgiving handling, and the **Historic** setting uses figures close to the original machine's (low power, skids that drag in sand). The Flyer's dimensions and performance figures are approximate, from published sources.
- The phone landscape layout was tested in a browser emulator. Full screen and screen-orientation locking depend on the browser; where they aren't available, the page turns itself to landscape instead.
