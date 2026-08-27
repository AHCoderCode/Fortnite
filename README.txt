SKYFALL ROYALE — browser battle royale (HTML + CSS + JavaScript + Three.js)
==========================================================================

HOW TO RUN
----------
1. Keep index.html, style.css and game.js in the same folder.
2. Double-click index.html (or drag it into Chrome / Edge / Firefox).
3. Click PLAY SOLO. Click the canvas once if the mouse does not capture.

No build step, no bundler, no local server required. An internet connection is
needed once, because Three.js r160 is loaded from the jsDelivr CDN and the UI
fonts come from Google Fonts. If you want to run fully offline, download
three.min.js next to index.html and change the <script src> to the local file.

CONTROLS
--------
W A S D ............ move
Shift .............. sprint
Space .............. jump
Mouse .............. look (Pointer Lock; hold-drag fallback if locking is blocked)
Left mouse ......... fire / swing pickaxe / place structure in build mode
Right mouse ........ aim down sight (zoom + tighter camera) / rotate piece in build mode
1 - 5 .............. select inventory slot (in build mode: 1 wood, 2 stone, 3 metal)
Mouse wheel ........ cycle weapons (build mode: cycle wall / floor / ramp)
Q or B ............. toggle build mode
R .................. reload (build mode: rotate the piece 90 degrees)
E .................. loot the highlighted pickup or chest
Esc ................ pause menu (resume, settings, leave match)

HOW A MATCH WORKS
-----------------
* 25 combatants drop onto a procedural ~2000 x 2000 island. You start with a
  pickaxe only, plus 130 wood / 50 stone. Everything else must be looted.
* You get a 25-second landing grace period; bots ignore you until it expires.
* Break trees, rocks and props with the pickaxe for wood / stone / metal
  (capped at 999 each). Structures cost 10 of the selected material.
* Health 100 + Shield 100. Shield absorbs damage first and never regenerates;
  health regenerates +2/s after 5 seconds without taking damage. Medkits heal
  to full over 3 seconds and are consumed.
* The storm starts covering the whole map, then shrinks in 5 phases toward
  random points, dealing 1 / 2 / 4 / 7 / 10 damage per second. Watch the storm
  timer and the purple ring on the minimap.
* Last one standing wins. Dying shows your placement with spectate / restart.

TECHNICAL NOTES
---------------
* Single classic <script> (no ES modules), wrapped in one IIFE with 'use strict'
  and a single central game-state object (W). No stray globals.
* Every asset is generated at runtime: terrain from layered value noise, houses
  with interiors / windows / doors, trees, rocks, loot, weapons and effects are
  all Three.js primitives. All sound effects are synthesized with the Web Audio
  API (oscillators + noise buffers). No external models, textures or audio.
* Performance: pooled particle sprites, a uniform spatial hash for collisions /
  loot / AI perception, shared materials and geometries, distance-culled bot
  logic and audio, raycast hit-scan bullets, capped structure count with
  recycling of the oldest pieces.
* Bots run a 7-state finite state machine (Patrol, Loot, Chase, Attack, Build,
  Flee, Heal) with line-of-sight checks, imperfect aim, cover use, ramp
  building for high ground, and difficulty that scales up as the lobby shrinks.
