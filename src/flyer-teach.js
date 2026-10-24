// What the teaching modes say. WF_HOW: the steps of each component's isolated mechanism demo in the workshop (parts map
// onto demos through WF_DEMO_OF). WF_LESSONS: the wind tunnel lessons; each sets the tunnel, may sweep one setting, and may
// set a goal.
const WF_DEMO_OF = { upperWing: 'wings', lowerWing: 'wings', struts: 'struts', elevator: 'elevator', rudder: 'rudder', cradle: 'controls', pilot: 'controls',
  engine: 'engine', chains: 'chains', propL: 'prop', propR: 'prop', radiator: 'cooling', tank: 'fuel', skids: 'skids', anemometer: 'anemometer' };

const WF_HOW = {
  wings: { title: 'Wings and wing warping', steps: [
    ['A cambered wing', 'Each wing is curved like a shallow arch, about 1 in 20. Air over the curved top speeds up and its pressure drops; air underneath is slowed and turned down. The difference in pressure is lift. Follow the smoke lines round the section beside the tip.'],
    ['Lift grows with speed squared', 'Lift = ½ ρ V² S C<sub>L</sub>. Double the airspeed and lift is four times as great. Move the airspeed slider and watch the arrows.'],
    ['Inside the wing', 'Under the muslin are two spruce spars and ash ribs steamed to the camber. See-through shows them.'],
    ['Wing warping', 'Twisting the tips in opposite directions gives one tip a steeper angle to the air (more lift) and the other a shallower one (less), so the Flyer rolls toward the low side. It is the idea behind every aileron since.'] ] },
  struts: { title: 'The truss: uprights and wires', steps: [
    ['A box girder', 'Two wings, uprights and crossed wires make a deep truss, like a bridge laid on its side: stiff for its weight.'],
    ['Wires in tension', 'In flight the lift pushes the wings up and the diagonal wires carry that load in tension. Steel wire is very strong for its weight. Raise the load to see them light up.'],
    ['Uprights in compression', 'The spruce uprights are squeezed between the wings and hold them apart.'],
    ['Free to warp', 'The rear of the truss can shear a little, which lets the tips be warped.'] ] },
  elevator: { title: 'The forward elevator', steps: [
    ['A canard', 'The elevator sits ahead of the wings. Tilted up it lifts more and raises the nose; tilted down it lowers the nose.'],
    ['Two surfaces', 'Like the wings it is a biplane: two cambered surfaces joined by struts, with two half-moon vanes between them. It pivots on brackets at the end of the outriggers.'],
    ['Sensitive pitch', 'A forward elevator makes an aircraft very responsive and hard to hold steady; on the first flight Orville\'s path rose and dipped again and again.'] ] },
  rudder: { title: 'The twin rudder', steps: [
    ['Two vertical surfaces', 'The two rudders turn together on a centre post, pushing the tail sideways so the nose yaws the other way.'],
    ['Adverse yaw', 'When the wings are warped, the tip with more lift also has more drag and is pulled back, swinging the nose the wrong way.'],
    ['Linked to the cradle', 'From 1902 the rudder turned with the warping and cancelled that adverse yaw: roll and yaw together, a coordinated turn.'] ] },
  controls: { title: 'The control system', steps: [
    ['Lying prone', 'The pilot lay flat on the lower wing with his hips in the cradle, which kept his drag low.'],
    ['Hips steer', 'Sliding the hips left or right pulls the cables (lit) that warp the wingtips and turn the rudder at the same time.'],
    ['Left hand pitches', 'A lever in the left hand tilts the forward elevator.'],
    ['Three-axis control', 'Pitch, roll and yaw, each under the pilot\'s control: the Wrights\' key invention, and still how aircraft are flown.'] ] },
  engine: { title: 'The engine: a four-stroke cycle', steps: [
    ['Four cylinders in a row', 'A water-cooled inline four with an aluminium crankcase, about 12 horsepower. It lies on its side with the crankshaft running fore and aft.'],
    ['Intake', 'The piston moves away from the head and draws in the fuel and air mixture.'],
    ['Compression', 'The valves are closed and the piston squeezes the mixture.'],
    ['Power', 'A spark ignites it; the expanding gas drives the piston and turns the crankshaft. The piston on its power stroke glows.'],
    ['Exhaust', 'The piston pushes the burnt gas out. Each cylinder fires once every two turns, so with four there is a power stroke every half turn (shown with a typical 1-3-4-2 order).'],
    ['Flywheel and sprockets', 'The heavy flywheel at the front smooths the pulses; the two sprockets at the back drive the chains.'] ] },
  chains: { title: 'The chain drive', steps: [
    ['Bicycle chains', 'The brothers built bicycles, and ordinary roller chains carry the power back to the propellers, running inside guide tubes.'],
    ['Gear reduction', 'Small sprockets on the engine drive large ones on the propeller shafts, so the propellers turn about a third as fast as the engine.'],
    ['One chain crossed', 'The left chain is crossed in a figure eight, so the two propellers turn in opposite directions.'],
    ['Why counter-rotate', 'Opposite rotation cancels the twisting reaction of the propellers on the airframe.'] ] },
  prop: { title: 'The propellers', steps: [
    ['A rotating wing', 'Each blade is a small wing moving in a spiral: its speed round the hub (ω·r) plus the aircraft\'s forward speed (V) make the relative wind it meets.'],
    ['Twist', 'Near the hub the blade moves slowly, so it is set steeply; near the tip it moves fast and is set flatter, so each section meets the air at a similar angle.'],
    ['Thrust', 'The blades\' lift points along the shaft. These are pushers: they push the Flyer from behind.'],
    ['Designed from theory', 'With no data for air propellers, the brothers worked out their own theory; their propellers were far more efficient than the marine-style designs others used.'] ] },
  cooling: { title: 'Cooling', steps: [
    ['Water jacket', 'Water around the cylinders carries the heat away.'],
    ['Radiator', 'The water circulates from the jacket through the radiator and back; air flowing past the radiator tubes cools it.'] ] },
  fuel: { title: 'Fuel', steps: [
    ['Gravity feed', 'Fuel runs down from the tank by gravity; there is no pump.'],
    ['No carburettor', 'It drips into a heated chamber, vaporises and mixes with air before it is drawn into the cylinders.'] ] },
  skids: { title: 'Skids and the launching truck', steps: [
    ['No wheels', 'Wheels would sink in soft sand; long wooden skids spread the load.'],
    ['The launching truck', 'For take-off the skids rested on a small truck that ran along the 60-ft rail and was left behind as the Flyer lifted off.'],
    ['Landing', 'The Flyer landed on its skids. The fourth flight ended with a hard landing that broke the elevator\'s supports.'] ] },
  anemometer: { title: 'Measuring the air', steps: [
    ['Air distance', 'A small vane turns in the airflow; counting its turns gives the distance travelled through the air.'],
    ['With a stopwatch', 'Air distance divided by time is airspeed; with the engine revolution counter it showed how hard the propellers were working.'] ] },
};

const WF_LESSONS = [
  { title: 'The four forces', set: { mph: 30, aoa: 4, thr: 0.6, bank: 0, warp: 0, flat: false, link: true },
    text: 'Weight pulls the Flyer down and lift from the wings holds it up. Thrust from the propellers drives it forward and drag from the air holds it back. In steady, level flight lift equals weight and thrust equals drag.' },
  { title: 'Lift and airspeed', set: { mph: 10, aoa: 5, thr: 0.5, bank: 0, warp: 0, flat: false }, sweep: ['mph', 10, 44, 7],
    text: 'Lift grows with the square of airspeed. Watch the green arrow: at twice the speed it is four times as long.' },
  { title: 'Angle of attack', set: { mph: 30, aoa: -2, thr: 0.5, bank: 0, warp: 0, flat: false }, sweep: ['aoa', -2, 12, 7],
    text: 'Tilting the wing to meet the air more steeply increases lift, almost in a straight line: follow the dot along the lift curve.' },
  { title: 'Stall', set: { mph: 30, aoa: 6, thr: 0.5, bank: 0, warp: 0, flat: false }, sweep: ['aoa', 6, 24, 7],
    text: 'Past about 10 to 15 degrees the air can no longer follow the curved top. It breaks away, lift collapses and drag soars. Watch the smoke tumble behind the wing.' },
  { title: 'Camber', set: { mph: 30, aoa: 0, thr: 0.5, bank: 0, warp: 0, flat: true }, toggle: 'flat',
    text: 'In 1901 the brothers tested about 200 wing shapes in their own wind tunnel. A cambered wing lifts even at zero angle; a flat plate does not. Switch between Cambered and Flat and compare the curves.' },
  { title: 'Drag and efficiency', set: { mph: 30, aoa: 0, thr: 0.5, bank: 0, warp: 0, flat: false }, sweep: ['aoa', 0, 12, 7],
    text: 'Lift always comes with drag. The lift-to-drag ratio says how far the Flyer can glide. All those struts and wires add drag even where the wings make none.' },
  { title: 'Thrust', set: { mph: 30, aoa: 4, thr: 0, bank: 0, warp: 0, flat: false }, sweep: ['thr', 0, 1, 5],
    text: 'The propellers make thrust. At full power it only just beats the drag: the Flyer had very little to spare.' },
  { title: 'Balance it', set: { mph: 18, aoa: 2, thr: 0.6, bank: 0, warp: 0, flat: false }, goal: 'balance',
    text: 'Your turn. Set the airspeed and angle of attack so that lift balances weight. The check lights up when you are within 3 percent.' },
  { title: 'Turning: bank the lift', set: { mph: 32, aoa: 5, thr: 0.7, bank: 0, warp: 0, flat: false }, sweep: ['bank', 0, 35, 6],
    text: 'To turn, an aircraft banks. Lift tilts with the wings; its sideways part pulls the Flyer round the turn, so the wings must make more lift to stay up.' },
  { title: 'Wing warping and adverse yaw', set: { mph: 30, aoa: 5, thr: 0.5, bank: 0, warp: 0, flat: false, link: false }, sweep: ['warp', -1, 1, 6],
    text: 'Warping gives one tip more lift than the other and rolls the Flyer. The tip with more lift also has more drag and yaws the nose the wrong way: adverse yaw. Turn on the rudder link to cancel it.' },
];
