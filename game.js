/*
 SKYFALL ROYALE — Open index.html directly. No build step or server required.
 Controls: WASD move, Shift sprint, Space jump, mouse look, LMB use/fire, RMB aim/build rotate,
 1–5 select, E loot, Q/B build mode, wheel cycle structure/weapon, R reload/rotate, Esc pause.
 All art, terrain, particles, characters and sounds are generated at runtime with Three.js/Web Audio.
*/
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s),
    clamp = (v, a, b) => Math.max(a, Math.min(b, v)),
    rnd = (a, b) => a + Math.random() * (b - a),
    TAU = Math.PI * 2;
  const CFG = {
    map: 2000,
    island: 920,
    gravity: 42,
    move: 28,
    sprint: 42,
    jump: 17,
    bots: 24,
    eye: 4.2,
    spawn: [0, 150], // player landing point (x, z)
    grace: 25, // seconds before bots start hunting the player
    maxStructures: 260, // hard cap; the oldest structure is recycled past this
  };
  const W = {
    phase: "loading",
    time: 0,
    paused: false,
    started: false,
    build: false,
    buildType: 0,
    buildRot: 0,
    buildMat: "wood",
    kills: 0,
    remaining: 25,
    entities: [],
    bots: [],
    loot: [],
    colliders: [],
    structures: [],
    resources: [],
    particles: [],
    keys: {},
    yaw: 0,
    pitch: -0.18,
    sensitivity: 0.0022,
    storm: { phase: 0, radius: 1040, target: 1040, cx: 0, cz: 0, tx: 0, tz: 0, timer: 60, dps: 1 },
    audio: null,
  };
  let scene,
    camera,
    renderer,
    clock,
    player,
    terrain,
    stormWall,
    preview,
    raycaster = new THREE.Raycaster(),
    tmpV = new THREE.Vector3(),
    tmpV2 = new THREE.Vector3();
  const MAT = {
    grass: new THREE.MeshStandardMaterial({ color: 0x3f8f50, roughness: 1, vertexColors: true }),
    wood: new THREE.MeshStandardMaterial({ color: 0x9b5d35, roughness: 0.9 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x287447, roughness: 1, flatShading: true }),
    stone: new THREE.MeshStandardMaterial({ color: 0x72818b, roughness: 1, flatShading: true }),
    metal: new THREE.MeshStandardMaterial({ color: 0x648a98, metalness: 0.55, roughness: 0.45 }),
    wall: new THREE.MeshStandardMaterial({ color: 0xc88957, roughness: 0.8 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x344b6a, roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x73d7e8,
      transparent: true,
      opacity: 0.38,
      roughness: 0.15,
    }),
    loot: new THREE.MeshStandardMaterial({ color: 0xffd448, emissive: 0x7a5200, emissiveIntensity: 0.8 }),
    bot: new THREE.MeshStandardMaterial({ color: 0xef476f, roughness: 0.7 }),
  };

  // ========================================================================
  // TERRAIN: value-noise heightmap + island falloff
  // ========================================================================
  function noise(x, z) {
    return (
      Math.sin(x * 0.007) * Math.cos(z * 0.006) * 18 +
      Math.sin((x + z) * 0.014) * 8 +
      Math.cos(Math.sqrt(x * x + z * z) * 0.018) * 5
    );
  }
  function height(x, z) {
    let d = Math.sqrt(x * x + z * z),
      edge = clamp((CFG.island - d) / 120, 0, 1);
    return (-8 + noise(x, z) + 22 * edge) * edge - 7 * (1 - edge);
  }

  // ========================================================================
  // AUDIO: all SFX synthesised at runtime with the Web Audio API
  // ========================================================================
  class AudioSys {
    constructor() {
      try {
        this.c = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.c.createGain();
        this.master.gain.value = 0.65;
        this.master.connect(this.c.destination);
      } catch (e) {
        this.c = null;
      }
    }
    resume() {
      this.c && this.c.resume();
    }
    tone(f, d = 0.1, type = "square", v = 0.1, slide = 0) {
      if (!this.c) return;
      let o = this.c.createOscillator(),
        g = this.c.createGain(),
        t = this.c.currentTime;
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + d);
    }
    noise(d = 0.12, v = 0.08, filter = 900) {
      if (!this.c) return;
      let n = this.c.sampleRate * d,
        b = this.c.createBuffer(1, n, this.c.sampleRate),
        a = b.getChannelData(0);
      for (let i = 0; i < n; i++) a[i] = Math.random() * 2 - 1;
      let s = this.c.createBufferSource(),
        g = this.c.createGain(),
        f = this.c.createBiquadFilter();
      s.buffer = b;
      f.type = "lowpass";
      f.frequency.value = filter;
      g.gain.setValueAtTime(v, this.c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.c.currentTime + d);
      s.connect(f).connect(g).connect(this.master);
      s.start();
    }
    play(k) {
      if (k === "rifle") {
        this.noise(0.1, 0.16, 1800);
        this.tone(150, 0.08, "sawtooth", 0.07, -80);
      } else if (k === "shotgun") {
        this.noise(0.22, 0.25, 900);
        this.tone(90, 0.18, "square", 0.12, -40);
      } else if (k === "sniper") {
        this.noise(0.35, 0.28, 1400);
        this.tone(220, 0.2, "sawtooth", 0.12, -150);
      } else if (k === "pickaxe") {
        this.tone(270, 0.08, "triangle", 0.1, -80);
      } else if (k === "build") {
        this.noise(0.1, 0.06, 2500);
        this.tone(520, 0.08, "triangle", 0.08, 180);
      } else if (k === "hit") {
        this.tone(900, 0.05, "sine", 0.07, 300);
      } else if (k === "elim") {
        this.tone(440, 0.12, "triangle", 0.1, 220);
        setTimeout(() => this.tone(660, 0.2, "triangle", 0.1, 200), 100);
      } else if (k === "reload") {
        this.noise(0.08, 0.05, 2400);
      } else if (k === "step") {
        this.noise(0.04, 0.018, 400);
      } else if (k === "pickup") {
        this.tone(700, 0.08, "sine", 0.07, 250);
      }
    }
  }

  // ========================================================================
  // PARTICLES: fixed-size pool, zero allocation during play
  // ========================================================================
  class ParticlePool {
    constructor() {
      this.pool = [];
      let g = new THREE.SphereGeometry(0.12, 4, 3);
      for (let i = 0; i < 90; i++) {
        let m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffd166 }));
        m.visible = false;
        scene.add(m);
        this.pool.push({ m, life: 0, v: new THREE.Vector3() });
      }
    }
    burst(p, color = 0xffd166, n = 6) {
      for (let i = 0; i < n; i++) {
        let q = this.pool.find((x) => x.life <= 0);
        if (!q) break;
        q.life = rnd(0.2, 0.65);
        q.m.visible = true;
        q.m.material.color.setHex(color);
        q.m.position.copy(p);
        q.v.set(rnd(-6, 6), rnd(1, 9), rnd(-6, 6));
      }
    }
    update(dt) {
      for (const q of this.pool)
        if (q.life > 0) {
          q.life -= dt;
          q.v.y -= 18 * dt;
          q.m.position.addScaledVector(q.v, dt);
          q.m.scale.setScalar(Math.max(0.15, q.life * 2));
          if (q.life <= 0) q.m.visible = false;
        }
    }
  }

  // ========================================================================
  // SPATIAL GRID: broad-phase for collisions, loot and bot perception
  // ========================================================================
  class SpatialGrid {
    constructor(size = 80) {
      this.size = size;
      this.cells = new Map();
    }
    key(x, z) {
      return Math.floor(x / this.size) + "," + Math.floor(z / this.size);
    }
    clear() {
      this.cells.clear();
    }
    add(e) {
      let k = this.key(e.mesh.position.x, e.mesh.position.z),
        a = this.cells.get(k);
      if (!a) this.cells.set(k, (a = []));
      a.push(e);
    }
    near(x, z, r = 120) {
      let out = [],
        n = Math.ceil(r / this.size),
        cx = Math.floor(x / this.size),
        cz = Math.floor(z / this.size);
      for (let i = -n; i <= n; i++)
        for (let j = -n; j <= n; j++) {
          let a = this.cells.get(cx + i + "," + (cz + j));
          if (a) out.push(...a);
        }
      return out;
    }
  }
  const grid = new SpatialGrid();

  // ========================================================================
  // PROCEDURAL WORLD: terrain mesh, trees, rocks, houses, POIs
  // ========================================================================
  function geo(type, args, mat, pos, rot) {
    let g = new THREE[type](...args),
      m = new THREE.Mesh(g, mat);
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }
  function makeTerrain() {
    let g = new THREE.PlaneGeometry(CFG.map, CFG.map, 120, 120);
    g.rotateX(-Math.PI / 2);
    let p = g.attributes.position,
      c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i),
        z = p.getZ(i),
        y = height(x, z);
      p.setY(i, y);
      let h = clamp((y + 10) / 45, 0, 1),
        d = Math.hypot(x, z);
      c[i * 3] = 0.16 + h * 0.18;
      c[i * 3 + 1] = 0.35 + h * 0.28;
      c[i * 3 + 2] = 0.18 + h * 0.1;
      if (d > 840) {
        c[i * 3] = 0.62;
        c[i * 3 + 1] = 0.56;
        c[i * 3 + 2] = 0.35;
      }
    }
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    g.computeVertexNormals();
    terrain = new THREE.Mesh(g, MAT.grass);
    terrain.receiveShadow = true;
    scene.add(terrain);
    let water = geo(
      "CylinderGeometry",
      [1100, 1100, 8, 96],
      new THREE.MeshStandardMaterial({
        color: 0x197ca8,
        transparent: true,
        opacity: 0.72,
        roughness: 0.25,
        metalness: 0.1,
      }),
      [0, -10, 0],
    );
    water.receiveShadow = true;
  }
  function addCollider(mesh, w, d, h = 20, kind = "solid", owner = null) {
    let c = { mesh, w, d, h, kind, owner };
    W.colliders.push(c);
    return c;
  }
  function makeTree(x, z) {
    let y = height(x, z),
      root = geo("CylinderGeometry", [1.2, 1.7, 9, 7], MAT.wood, [x, y + 4.5, z]);
    let crown = geo("ConeGeometry", [5.5, 12, 7], MAT.leaf, [x, y + 13, z]);
    crown.castShadow = true;
    let e = {
      type: "tree",
      mesh: root,
      parts: [root, crown],
      hp: 120,
      material: "wood",
      amount: 35,
      alive: true,
    };
    W.resources.push(e);
    addCollider(root, 3, 3, 10, "resource", e);
  }
  function makeRock(x, z) {
    let y = height(x, z),
      m = geo("DodecahedronGeometry", [rnd(2.2, 4), 0], MAT.stone, [x, y + 2, z]);
    m.scale.set(1, rnd(0.6, 1), rnd(0.7, 1.3));
    m.rotation.set(rnd(0, 1), rnd(0, TAU), 0);
    let e = { type: "rock", mesh: m, parts: [m], hp: 150, material: "stone", amount: 30, alive: true };
    W.resources.push(e);
    addCollider(m, 5, 5, 6, "resource", e);
  }
  function makeHouse(x, z, col = 0xe0c296, scale = 1) {
    let y = height(x, z),
      group = new THREE.Group();
    group.position.set(x, y, z);
    scene.add(group);
    let wallMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.85 });
    const part = (sx, sy, sz, px, py, pz, mat = wallMat) => {
      let m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      m.position.set(px, py, pz);
      m.castShadow = m.receiveShadow = true;
      group.add(m);
      return m;
    };
    part(22 * scale, 1, 18 * scale, 0, 0.5, 0, new THREE.MeshStandardMaterial({ color: 0x78644f }));
    part(22 * scale, 9, 1, 0, 5, -9 * scale);
    part(22 * scale, 9, 1, 0, 5, 9 * scale);
    part(1, 9, 18 * scale, -11 * scale, 5, 0);
    part(1, 9, 18 * scale, 11 * scale, 5, 0);
    part(24 * scale, 1, 21 * scale, 0, 10, 0, MAT.roof);
    part(5, 7, 0.25, 0, 4, 9.55 * scale, MAT.wood);
    for (let s of [-1, 1]) part(4, 3, 0.2, s * 6, 5, 9.65 * scale, MAT.glass);
    addCollider({ position: new THREE.Vector3(x, y + 5, z - 9 * scale) }, 22 * scale, 1, 10, "building");
    addCollider({ position: new THREE.Vector3(x, y + 5, z + 9 * scale) }, 7 * scale, 1, 10, "building");
    addCollider(
      { position: new THREE.Vector3(x - 8 * scale, y + 5, z + 9 * scale) },
      6 * scale,
      1,
      10,
      "building",
    );
    addCollider(
      { position: new THREE.Vector3(x + 8 * scale, y + 5, z + 9 * scale) },
      6 * scale,
      1,
      10,
      "building",
    );
    addCollider({ position: new THREE.Vector3(x - 11 * scale, y + 5, z) }, 1, 18 * scale, 10, "building");
    addCollider({ position: new THREE.Vector3(x + 11 * scale, y + 5, z) }, 1, 18 * scale, 10, "building");
    spawnLoot(x + rnd(-6, 6), z + rnd(-5, 5), Math.random() < 0.35 ? "chest" : null);
  }
  function worldObjects() {
    for (let i = 0; i < 150; i++) {
      let a = rnd(0, TAU),
        r = Math.sqrt(Math.random()) * 820,
        x = Math.cos(a) * r,
        z = Math.sin(a) * r;
      if (Math.abs(x) < 140 && Math.abs(z) < 140) continue;
      (Math.random() < 0.72 ? makeTree : makeRock)(x, z);
    }
    let pois = [
      ["TILTED TOWERS", 0, 0],
      ["PLEASANT PARK", 430, -300],
      ["RETAIL ROW", -420, 270],
      ["LAZY LAKE", 320, 410],
      ["CRAGGY CLIFFS", -400, -390],
    ];
    for (const p of pois) {
      for (let i = 0; i < (p[0] === "TILTED TOWERS" ? 9 : 5); i++)
        makeHouse(
          p[1] + rnd(-70, 70),
          p[2] + rnd(-70, 70),
          [0xe0c296, 0x9fc5d8, 0xcda3b7, 0xb7cf93][i % 4],
          p[0] === "TILTED TOWERS" && i < 3 ? 1.35 : 1,
        );
    }
    W.pois = pois;
  }
  const lootDefs = {
    rifle: { icon: "▰", name: "ASSAULT RIFLE", color: 0x48a9ff },
    shotgun: { icon: "⌁", name: "TACTICAL SHOTGUN", color: 0xa66cff },
    sniper: { icon: "━", name: "BOLT SNIPER", color: 0xffc93c },
    medkit: { icon: "✚", name: "MEDKIT", color: 0xff596d },
    ammo: { icon: "▥", name: "AMMO BOX", color: 0xe7b85c },
    materials: { icon: "◆", name: "MATERIAL CACHE", color: 0xc99562 },
    chest: { icon: "◇", name: "SUPPLY CHEST", color: 0xffd348 },
  };

  // ========================================================================
  // LOOT: weapons, ammo, medkits and materials on the ground / in chests
  // ========================================================================
  function spawnLoot(x, z, type = null) {
    type =
      type || ["rifle", "shotgun", "sniper", "medkit", "ammo", "materials"][Math.floor(Math.random() * 6)];
    let y = height(x, z) + 1.1,
      def = lootDefs[type],
      m = geo(
        type === "chest" ? "BoxGeometry" : "OctahedronGeometry",
        type === "chest" ? [3, 2, 2] : [1.1, 0],
        new THREE.MeshStandardMaterial({
          color: def.color,
          emissive: def.color,
          emissiveIntensity: 0.55,
          roughness: 0.4,
        }),
        [x, y, z],
      );
    let e = { type, mesh: m, def, alive: true };
    W.loot.push(e);
    return e;
  }
  function makeCharacter(color = 0x31b8ef) {
    let g = new THREE.Group(),
      body = new THREE.Mesh(
        new THREE.CapsuleGeometry(1.15, 2.3, 5, 8),
        new THREE.MeshStandardMaterial({ color, roughness: 0.65 }),
      );
    body.position.y = 2.1;
    body.castShadow = true;
    g.add(body);
    let head = new THREE.Mesh(
      new THREE.SphereGeometry(0.72, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xf1b58f }),
    );
    head.position.y = 4.4;
    head.castShadow = true;
    g.add(head);
    let pack = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.8, 0.65), MAT.metal);
    pack.position.set(0, 2.7, 0.9);
    g.add(pack);
    scene.add(g);
    return g;
  }

  // ========================================================================
  // PLAYER: movement, camera, inventory, weapons, harvesting, building
  // ========================================================================
  class Player {
    constructor() {
      this.mesh = makeCharacter(0x24bde6);
      this.mesh.position.set(CFG.spawn[0], height(CFG.spawn[0], CFG.spawn[1]) + 0.1, CFG.spawn[1]);
      this.vel = new THREE.Vector3();
      this.health = 100;
      this.shield = 100;
      this.lastDamage = -99;
      this.grounded = false;
      this.radius = 1.3;
      this.materials = { wood: 150, stone: 50, metal: 0 };
      // Slot 1 (pickaxe) is always owned; the rest start empty and must be looted.
      this.inventory = [
        { type: "pickaxe", name: "PICKAXE", icon: "⛏", ammo: Infinity, clip: Infinity, owned: true },
        { type: "rifle", name: "ASSAULT RIFLE", icon: "▰", ammo: 0, clip: 0, max: 30, owned: false },
        { type: "shotgun", name: "SHOTGUN", icon: "▮", ammo: 0, clip: 0, max: 8, owned: false },
        { type: "sniper", name: "SNIPER", icon: "━", ammo: 0, clip: 0, max: 1, owned: false },
        { type: "medkit", name: "MEDKIT", icon: "✚", uses: 0, owned: false },
      ];
      this.slot = 0;
      this.cool = 0;
      this.reloading = 0;
      this.healing = 0;
      this.step = 0;
    }
    get weapon() {
      return this.inventory[this.slot];
    }
    damage(n, from = "Storm") {
      if (this.health <= 0) return;
      this.lastDamage = W.time;
      let s = Math.min(this.shield, n);
      this.shield -= s;
      this.health -= n - s;
      toast(from + " hit you for " + Math.round(n));
      if (this.health <= 0) this.die();
    }
    die() {
      this.health = 0;
      endGame(false);
    }
    update(dt) {
      if (this.health <= 0) return;
      let f = new THREE.Vector3(Math.sin(W.yaw), 0, Math.cos(W.yaw)),
        r = new THREE.Vector3(f.z, 0, -f.x),
        wish = new THREE.Vector3();
      if (W.keys.KeyW) wish.addScaledVector(f, -1);
      if (W.keys.KeyS) wish.add(f);
      if (W.keys.KeyA) wish.addScaledVector(r, -1);
      if (W.keys.KeyD) wish.add(r);
      let speed = W.keys.ShiftLeft ? CFG.sprint : CFG.move;
      if (wish.lengthSq()) wish.normalize().multiplyScalar(speed);
      let accel = this.grounded ? 12 : 4;
      this.vel.x += (wish.x - this.vel.x) * Math.min(1, accel * dt);
      this.vel.z += (wish.z - this.vel.z) * Math.min(1, accel * dt);
      this.vel.y -= CFG.gravity * dt;
      if (W.keys.Space && this.grounded) {
        this.vel.y = CFG.jump;
        this.grounded = false;
        W.audio.tone(180, 0.08, "triangle", 0.05, 100);
      }
      let old = this.mesh.position.clone();
      this.mesh.position.addScaledVector(this.vel, dt);
      let gy = height(this.mesh.position.x, this.mesh.position.z);
      if (this.mesh.position.y <= gy) {
        this.mesh.position.y = gy;
        this.vel.y = 0;
        this.grounded = true;
      }
      for (const c of W.colliders) {
        if (!c.owner || c.owner.alive !== false) {
          let p = c.mesh.position;
          if (c.mesh.type === "Group") p = c.mesh.position;
          let dx = this.mesh.position.x - p.x,
            dz = this.mesh.position.z - p.z;
          if (
            Math.abs(dx) < c.w / 2 + this.radius &&
            Math.abs(dz) < c.d / 2 + this.radius &&
            Math.abs(this.mesh.position.y - p.y) < c.h
          ) {
            this.mesh.position.x = old.x;
            this.mesh.position.z = old.z;
            break;
          }
        }
      }
      if (Math.hypot(this.mesh.position.x, this.mesh.position.z) > 900) {
        this.mesh.position.x = old.x;
        this.mesh.position.z = old.z;
      }
      if (wish.lengthSq() && this.grounded) {
        this.step -= dt;
        if (this.step <= 0) {
          W.audio.play("step");
          this.step = 0.34;
        }
      }
      this.mesh.rotation.y = W.yaw + Math.PI;
      if (this.cool > 0) this.cool -= dt;
      if (this.reloading > 0) {
        this.reloading -= dt;
        if (this.reloading <= 0) this.finishReload();
      }
      if (this.healing > 0) {
        this.healing -= dt;
        if (this.healing <= 0) {
          this.health = 100;
          this.weapon.uses = 0;
          this.inventory[this.slot] = { type: "empty", name: "EMPTY", icon: "·" };
          toast("HEALED TO 100");
        }
      }
      if (W.time - this.lastDamage > 5 && this.health < 100)
        this.health = Math.min(100, this.health + 2 * dt);
      this.camera(dt);
      this.nearLoot();
      this.updateStorm(dt);
    }
    camera(dt) {
      // Over-the-shoulder offset keeps the avatar out from under the crosshair.
      let shoulder = new THREE.Vector3(Math.cos(W.yaw), 0, -Math.sin(W.yaw)).multiplyScalar(
        W.keys.MouseRight ? 3.2 : 2.4,
      );
      let focus = this.mesh.position.clone().add(new THREE.Vector3(0, CFG.eye, 0)).add(shoulder),
        dist = W.keys.MouseRight ? 9 : 16,
        off = new THREE.Vector3(
          Math.sin(W.yaw) * Math.cos(W.pitch) * dist,
          Math.sin(-W.pitch) * dist + 3,
          Math.cos(W.yaw) * Math.cos(W.pitch) * dist,
        );
      let desired = focus.clone().add(off);
      camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
      camera.lookAt(focus);
    }
    nearLoot() {
      let best = null,
        bd = 5;
      for (const l of W.loot)
        if (l.alive) {
          l.mesh.rotation.y += 0.02;
          l.mesh.position.y =
            height(l.mesh.position.x, l.mesh.position.z) +
            1.2 +
            Math.sin(W.time * 2 + l.mesh.position.x) * 0.25;
          let d = l.mesh.position.distanceTo(this.mesh.position);
          if (d < bd) {
            bd = d;
            best = l;
          }
        }
      W.nearLoot = best;
      $("#interact").classList.toggle("hidden", !best);
      if (best) $("#interact span").textContent = "Pick up " + best.def.name;
    }
    updateStorm(dt) {
      let s = W.storm,
        d = Math.hypot(this.mesh.position.x - s.cx, this.mesh.position.z - s.cz);
      if (d > s.radius) {
        this.damage(s.dps * dt, "Storm");
        if (Math.random() < dt * 3)
          particles.burst(this.mesh.position.clone().add(new THREE.Vector3(0, 2, 0)), 0x8b5cf6, 1);
      }
    }
    attack() {
      if (this.healing || this.reloading || this.cool > 0) return;
      let w = this.weapon;
      if (!w || w.type === "empty") return;
      if (!w.owned) {
        toast("SLOT EMPTY — LOOT A WEAPON (E)");
        return;
      }
      if (w.type === "medkit") {
        if (w.uses && this.health < 100) {
          this.healing = 3;
          toast("USING MEDKIT — 3s");
          W.audio.tone(380, 0.4, "sine", 0.05, 200);
        }
        return;
      }
      if (w.type !== "pickaxe" && w.clip <= 0) {
        this.reload();
        return;
      }
      let cfg = {
        pickaxe: [25, 0.55, 4],
        rifle: [23, 0.11, 260],
        shotgun: [72, 0.8, 65],
        sniper: [95, 1.15, 500],
      }[w.type];
      if (!cfg) return;
      this.cool = cfg[1];
      if (w.clip !== Infinity) w.clip--;
      W.audio.play(w.type);
      let origin = camera.position.clone(),
        dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      let spread =
        w.type === "shotgun" ? 0.065 : w.type === "rifle" ? 0.012 : w.type === "sniper" ? 0.002 : 0.04;
      if (w.type === "shotgun") {
        for (let i = 0; i < 6; i++)
          this.ray(
            origin,
            dir
              .clone()
              .add(new THREE.Vector3(rnd(-spread, spread), rnd(-spread, spread), rnd(-spread, spread)))
              .normalize(),
            cfg[0] / 6,
            cfg[2],
          );
      } else this.ray(origin, dir, cfg[0], cfg[2]);
      particles.burst(origin.clone().add(dir.multiplyScalar(2)), 0xffd05a, 3);
    }
    ray(origin, dir, damage, range) {
      raycaster.set(origin, dir);
      raycaster.far = range;
      let targets = [];
      for (const b of W.bots) if (b.alive) targets.push(...b.mesh.children);
      for (const r of W.resources) if (r.alive) targets.push(...r.parts);
      for (const s of W.structures) if (s.alive) targets.push(s.mesh);
      let hits = raycaster.intersectObjects(targets, true);
      if (hits.length) {
        let h = hits[0],
          ent = findOwner(h.object);
        if (ent) {
          damageEntity(ent, damage, "YOU");
          hitmark();
        }
        particles.burst(h.point, 0xffe09b, 5);
      } else particles.burst(origin.clone().add(dir.multiplyScalar(Math.min(range, 80))), 0xeeeeee, 2);
    }
    reload() {
      let w = this.weapon;
      if (!w || !w.owned || !w.max || w.clip >= w.max || w.ammo <= 0 || this.reloading) return;
      this.reloading = w.type === "sniper" ? 2.4 : w.type === "shotgun" ? 2 : 1.5;
      toast("RELOADING");
      W.audio.play("reload");
    }
    finishReload() {
      let w = this.weapon,
        n = Math.min(w.max - w.clip, w.ammo);
      w.clip += n;
      w.ammo -= n;
      W.audio.play("reload");
    }
    pickup() {
      let l = W.nearLoot;
      if (!l) return;
      if (["rifle", "shotgun", "sniper"].includes(l.type)) {
        let i = { rifle: 1, shotgun: 2, sniper: 3 }[l.type],
          w = this.inventory[i];
        w.owned = true;
        w.ammo += l.type === "rifle" ? 60 : l.type === "shotgun" ? 16 : 6;
        if (w.clip <= 0) {
          // free first magazine so a fresh pickup is immediately usable
          let take = Math.min(w.max, w.ammo);
          w.clip = take;
          w.ammo -= take;
        }
        this.slot = i;
      } else if (l.type === "medkit") {
        this.inventory[4] = { type: "medkit", name: "MEDKIT", icon: "✚", uses: 1, owned: true };
        this.slot = 4;
      } else if (l.type === "ammo") {
        for (let i = 1; i < 4; i++) if (this.inventory[i].owned) this.inventory[i].ammo += 20;
      } else if (l.type === "materials") {
        for (const k in this.materials) this.materials[k] = Math.min(999, this.materials[k] + 100);
      } else if (l.type === "chest") {
        for (let i = 0; i < 3; i++) spawnLoot(l.mesh.position.x + rnd(-3, 3), l.mesh.position.z + rnd(-3, 3));
        this.materials.wood = Math.min(999, this.materials.wood + 60);
      }
      l.alive = false;
      l.mesh.removeFromParent();
      W.audio.play("pickup");
      toast("PICKED UP " + l.def.name);
      updateHotbar();
    }
  }

  // ========================================================================
  // COMBAT: damage resolution, shields, eliminations
  // ========================================================================
  function findOwner(obj) {
    for (const b of W.bots) if (b.mesh.children.includes(obj) || obj.parent === b.mesh) return b;
    for (const r of W.resources) if (r.parts.includes(obj)) return r;
    for (const s of W.structures) if (s.mesh === obj) return s;
    return null;
  }
  function damageEntity(e, n, who) {
    if (!e.alive) return;
    e.hp -= n;
    if (e instanceof Bot) e.lastHit = W.time;
    if (e.hp <= 0) {
      e.alive = false;
      e.parts ? e.parts.forEach((x) => x.removeFromParent()) : e.mesh.removeFromParent();
      if (e.material) {
        player.materials[e.material] = Math.min(999, player.materials[e.material] + e.amount);
        toast("+" + e.amount + " " + e.material.toUpperCase());
      }
      if (e instanceof Bot) {
        W.remaining--;
        if (who === "YOU") {
          W.kills++;
          W.audio.play("elim");
          feed("YOU eliminated " + e.name);
        } else feed(who + " eliminated " + e.name);
        if (Math.random() < 0.7) spawnLoot(e.mesh.position.x, e.mesh.position.z);
        if (W.remaining <= 1 && player.health > 0) endGame(true);
      }
    }
  }

  // ========================================================================
  // BOT AI: finite state machine (Patrol / Loot / Chase / Attack / Build / Flee / Heal)
  // ========================================================================
  class Bot {
    constructor(i) {
      this.name =
        ["RiftFox", "Nova", "Brick", "Mako", "Viper", "Orbit", "Cinder", "Echo", "Rook", "Blitz"][i % 10] +
        (i + 1);
      this.mesh = makeCharacter([0xf05d7a, 0xff9f43, 0x9b6bdb, 0x46c2a8][i % 4]);
      // Spread bots over the island, but never inside the player's landing area.
      let a,
        r,
        x,
        z,
        tries = 0;
      do {
        a = rnd(0, TAU);
        r = rnd(170, 780);
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
        tries++;
      } while (Math.hypot(x - CFG.spawn[0], z - CFG.spawn[1]) < 260 && tries < 40);
      this.mesh.position.set(x, 0, z);
      this.mesh.position.y = height(this.mesh.position.x, this.mesh.position.z);
      this.hp = 100;
      this.shield = rnd(0, 100);
      this.state = "Patrol";
      this.alive = true;
      this.target = null;
      this.goal = new THREE.Vector3();
      this.cool = rnd(0, 2);
      this.think = 0;
      this.lastHit = -99;
      this.buildCool = 0;
      this.accuracy = 0.08;
      this.speed = rnd(12, 18);
      this.mats = Math.floor(rnd(40, 140)); // bots must own materials to build
      this.medkits = Math.random() < 0.6 ? 1 : 0;
      this.strafe = Math.random() < 0.5 ? 1 : -1;
    }
    damage(n, from) {
      let s = Math.min(this.shield, n);
      this.shield -= s;
      this.hp -= n - s;
      this.lastHit = W.time;
      if (this.hp <= 0) damageEntity(this, 999, from);
    }
    thinkAI() {
      if (!this.alive) return;
      let s = W.storm,
        dStorm = Math.hypot(this.mesh.position.x - s.cx, this.mesh.position.z - s.cz);
      if (dStorm > s.radius - 35) {
        this.state = "Flee";
        this.goal.set(s.cx, 0, s.cz);
        return;
      }
      if (this.hp < 28 && this.medkits > 0 && Math.random() < 0.5) {
        this.state = "Heal";
        this.medkits--;
        return;
      }
      let candidates = grid
        .near(this.mesh.position.x, this.mesh.position.z, 220)
        .filter((x) => x !== this && x.alive);
      // Landing grace: for the first seconds bots fight each other, not the player.
      if (W.time > CFG.grace)
        candidates.push({ mesh: player.mesh, alive: player.health > 0, name: "YOU", isPlayer: true });
      let best = null,
        bd = 160; // perception range in world units
      for (const x of candidates) {
        let d = x.mesh.position.distanceTo(this.mesh.position);
        if (d < bd && this.canSee(x)) {
          best = x;
          bd = d;
        }
      }
      if (best) {
        this.target = best;
        this.state = bd < 70 ? "Attack" : "Chase";
      } else {
        let loot = W.loot.find((l) => l.alive && l.mesh.position.distanceTo(this.mesh.position) < 80);
        if (loot) {
          this.state = "Loot";
          this.goal.copy(loot.mesh.position);
        } else if (this.goal.distanceTo(this.mesh.position) < 10 || Math.random() < 0.08) {
          this.state = "Patrol";
          this.goal.set(rnd(-750, 750), 0, rnd(-750, 750));
        }
      }
      // Under fire (or hurt) and holding materials -> throw up cover / a ramp for high ground
      if (W.time - this.lastHit < 1.5 && this.buildCool <= 0 && this.mats >= 10) {
        this.state = "Build";
        // difficulty scaling: fewer players left -> faster rebuilds
        let difficulty = 1 - W.remaining / CFG.bots;
        this.buildCool = rnd(5, 9) - difficulty * 3.5;
      }
    }
    canSee(t) {
      let o = this.mesh.position.clone().add(new THREE.Vector3(0, 3, 0)),
        d = t.mesh.position.clone().sub(o),
        len = d.length();
      raycaster.set(o, d.normalize());
      raycaster.far = len;
      // Line of sight is blocked by player/bot structures and by world buildings.
      // The blocker list is cached (see refreshBlockers) so perception stays cheap.
      return !raycaster.intersectObjects(losBlockers, false).length;
    }
    update(dt) {
      if (!this.alive) return;
      this.cool -= dt;
      this.think -= dt;
      this.buildCool -= dt;
      if (this.think <= 0) {
        this.think = rnd(0.35, 0.75);
        this.thinkAI();
      }
      let targetPos = null;
      if (this.state === "Attack" && this.target && this.target.alive !== false) {
        targetPos = this.target.mesh.position;
        this.shoot();
      } else if (this.state === "Chase" && this.target) targetPos = this.target.mesh.position;
      else if (["Patrol", "Loot", "Flee"].includes(this.state)) targetPos = this.goal;
      else if (this.state === "Build") {
        placeBotBuild(this);
        this.state = "Flee";
        if (this.target)
          this.goal
            .copy(this.mesh.position)
            .add(this.mesh.position.clone().sub(this.target.mesh.position).normalize().multiplyScalar(40));
      } else if (this.state === "Heal") {
        this.hp = Math.min(100, this.hp + 18 * dt);
        if (this.hp > 70) this.state = "Patrol";
      }
      if (targetPos) {
        let d = targetPos.clone().sub(this.mesh.position);
        d.y = 0;
        let dist = d.length();
        if (dist > 2) {
          d.normalize();
          let move = new THREE.Vector3();
          if (this.state === "Attack") {
            // hold an engagement range and strafe sideways instead of standing still
            if (dist > 55) move.copy(d);
            else if (dist < 22) move.copy(d).negate();
            move.add(new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(this.strafe * 0.8));
            if (Math.random() < 0.01 * (dt * 60)) this.strafe *= -1;
          } else move.copy(d);
          if (move.lengthSq() > 0.0001) {
            move.normalize();
            this.mesh.position.addScaledVector(move, this.speed * (this.state === "Attack" ? 0.6 : 1) * dt);
          }
          this.mesh.rotation.y = Math.atan2(d.x, d.z); // always face the target/goal
          this.mesh.position.y = height(this.mesh.position.x, this.mesh.position.z);
        }
      }
      let s = W.storm;
      if (Math.hypot(this.mesh.position.x - s.cx, this.mesh.position.z - s.cz) > s.radius)
        this.damage(s.dps * dt, "STORM");
      if (this.state === "Loot" && this.mesh.position.distanceTo(this.goal) < 4) {
        let l = W.loot.find((x) => x.alive && x.mesh.position.distanceTo(this.mesh.position) < 6);
        if (l) {
          l.alive = false;
          l.mesh.removeFromParent();
          if (l.type === "medkit") this.medkits++;
          else if (l.type === "materials") this.mats = Math.min(999, this.mats + 100);
          else this.shield = Math.min(100, this.shield + 25);
        }
        this.state = "Patrol";
      }
    }
    shoot() {
      if (this.cool > 0 || !this.target) return;
      // Difficulty scaling: the fewer players remain, the faster and sharper bots get.
      let difficulty = 1 - W.remaining / (CFG.bots + 1);
      this.cool = rnd(0.9, 1.8) - difficulty * 0.35;
      this.accuracy = 0.12 - difficulty * 0.08; // lower value == better aim
      let dist = this.mesh.position.distanceTo(this.target.mesh.position),
        chance = clamp(0.46 - dist / 520 - this.accuracy, 0.05, 0.52);
      // Only play a shot for nearby fights so distant duels don't spam the mix.
      if (this.mesh.position.distanceTo(player.mesh.position) < 220) W.audio.noise(0.06, 0.025, 900);
      if (Math.random() < chance) {
        let dmg = rnd(6, 14);
        if (this.target.isPlayer) player.damage(dmg, this.name);
        else this.target.damage(dmg, this.name);
        particles.burst(this.target.mesh.position.clone().add(new THREE.Vector3(0, 2, 0)), 0xff7755, 2);
      }
    }
  }
  // Cached list of opaque meshes used for bot line-of-sight tests. Rebuilt a few
  // times per second instead of per query, which keeps 24 bots' perception cheap.
  let losBlockers = [],
    blockerTimer = 0;
  function refreshBlockers(dt) {
    blockerTimer -= dt;
    if (blockerTimer > 0) return;
    blockerTimer = 0.4;
    losBlockers.length = 0;
    for (const s of W.structures) if (s.alive) losBlockers.push(s.mesh);
    for (const c of W.colliders) if (c.kind === "solid" && c.mesh) losBlockers.push(c.mesh);
  }
  function placeBotBuild(b) {
    if (b.mats < 10) return;
    let dir = b.target
        ? b.target.mesh.position.clone().sub(b.mesh.position).normalize()
        : new THREE.Vector3(0, 0, 1),
      p = b.mesh.position.clone().add(dir.clone().multiplyScalar(4));
    b.mats -= 10;
    // A wall for cover; sometimes a ramp behind it to take the high ground.
    makeStructure("wall", p, Math.atan2(dir.x, dir.z), false);
    if (b.mats >= 10 && Math.random() < 0.45) {
      b.mats -= 10;
      makeStructure(
        "ramp",
        b.mesh.position.clone().sub(dir.clone().multiplyScalar(5)),
        Math.atan2(dir.x, dir.z),
        false,
      );
    }
    W.audio.play("build");
  }

  // ========================================================================
  // BUILDING: grid-snapped walls, floors and ramps with destructible health
  // ========================================================================
  // Structure toughness depends on the material spent on it.
  const BSZ = 9; // build grid cell: structures are BSZ wide so pieces tile without overlapping
  const MAT_HP = { wood: 1, stone: 1.45, metal: 1.9 };
  const MAT_MESH = { wood: MAT.wall, stone: MAT.stone, metal: MAT.metal };
  function makeStructure(type, p, rot = 0, owned = true, matKind = owned ? W.buildMat : "metal") {
    let mat = MAT_MESH[matKind] || MAT.wall,
      m;
    if (type === "wall")
      m = geo("BoxGeometry", [BSZ, 8, 0.7], mat, [p.x, height(p.x, p.z) + 4, p.z], [0, rot, 0]);
    else if (type === "floor")
      m = geo("BoxGeometry", [BSZ, 0.6, BSZ], mat, [p.x, height(p.x, p.z) + 0.4, p.z], [0, rot, 0]);
    else m = geo("BoxGeometry", [BSZ, 0.55, BSZ], mat, [p.x, height(p.x, p.z) + 3.1, p.z], [-0.52, rot, 0]);
    let e = {
      type: "structure",
      subtype: type,
      material: null, // structures do not drop resources when broken
      mesh: m,
      hp: Math.round((type === "wall" ? 220 : 180) * (MAT_HP[matKind] || 1)),
      alive: true,
    };
    W.structures.push(e);
    addCollider(m, BSZ, type === "wall" ? 1 : BSZ, 8, "structure", e);
    // Recycle the oldest structure once the cap is hit, keeping draw calls bounded.
    if (W.structures.length > CFG.maxStructures) {
      let old = W.structures.shift();
      old.alive = false;
      old.mesh.geometry.dispose();
      old.mesh.removeFromParent();
      let ci = W.colliders.findIndex((c) => c.owner === old);
      if (ci >= 0) W.colliders.splice(ci, 1);
    }
    return e;
  }
  function initPreview() {
    preview = new THREE.Mesh(
      new THREE.BoxGeometry(BSZ, 8, 0.7),
      new THREE.MeshBasicMaterial({ color: 0x55ffb0, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    preview.visible = false;
    scene.add(preview);
  }
  function updatePreview() {
    if (!W.build) return;
    let dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    let p = player.mesh.position.clone().add(dir.multiplyScalar(8));
    p.x = Math.round(p.x / BSZ) * BSZ;
    p.z = Math.round(p.z / BSZ) * BSZ;
    let t = ["wall", "floor", "ramp"][W.buildType];
    preview.geometry.dispose();
    preview.geometry =
      t === "wall"
        ? new THREE.BoxGeometry(BSZ, 8, 0.7)
        : t === "floor"
          ? new THREE.BoxGeometry(BSZ, 0.6, BSZ)
          : new THREE.BoxGeometry(BSZ, 0.55, BSZ);
    preview.position.set(p.x, height(p.x, p.z) + (t === "wall" ? 4 : t === "ramp" ? 3.1 : 0.4), p.z);
    preview.rotation.set(t === "ramp" ? -0.52 : 0, (W.buildRot * Math.PI) / 2, 0);
    preview.visible = true;
    W.previewPos = p;
  }
  function placeBuild() {
    if (!W.previewPos) updatePreview();
    if (!W.previewPos) return;
    let mat = W.buildMat,
      cost = 10;
    if (player.materials[mat] < cost) {
      toast("NOT ENOUGH " + mat.toUpperCase());
      return;
    }
    player.materials[mat] -= cost;
    makeStructure(
      ["wall", "floor", "ramp"][W.buildType],
      W.previewPos,
      (W.buildRot * Math.PI) / 2,
      true,
      mat,
    );
    W.audio.play("build");
    particles.burst(preview.position, 0xd18b52, 8);
  }

  // ========================================================================
  // BOOTSTRAP: scene, camera, renderer, lighting, world generation
  // ========================================================================
  function init() {
    try {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x78b7df);
      scene.fog = new THREE.Fog(0x78b7df, 260, 980);
      camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.1, 1600);
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.35));
      renderer.setSize(innerWidth, innerHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      $("#game").appendChild(renderer.domElement);
      scene.add(new THREE.HemisphereLight(0xc9e8ff, 0x49683b, 2.1));
      let sun = new THREE.DirectionalLight(0xfff0cf, 3);
      sun.position.set(-220, 320, 180);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.left = sun.shadow.camera.bottom = -400;
      sun.shadow.camera.right = sun.shadow.camera.top = 400;
      scene.add(sun);
      makeTerrain();
      worldObjects();
      for (let i = 0; i < 45; i++) {
        let a = rnd(0, TAU),
          r = rnd(60, 800);
        spawnLoot(Math.cos(a) * r, Math.sin(a) * r);
      }
      // Guaranteed starter loot inside the landing zone so the drop is never dead.
      spawnLoot(CFG.spawn[0] + 9, CFG.spawn[1] - 6, "rifle");
      spawnLoot(CFG.spawn[0] - 11, CFG.spawn[1] - 3, "ammo");
      spawnLoot(CFG.spawn[0] + 4, CFG.spawn[1] + 12, "medkit");
      spawnLoot(CFG.spawn[0] - 6, CFG.spawn[1] + 14, "chest");
      player = new Player();
      for (let i = 0; i < CFG.bots; i++) W.bots.push(new Bot(i));
      W.entities = W.bots;
      W.audio = new AudioSys();
      particles = new ParticlePool();
      initStorm();
      initPreview();
      bind();
      clock = new THREE.Clock();
      updateHotbar();
      setTimeout(() => {
        $("#loading").classList.add("hidden");
        $("#menu").classList.remove("hidden");
        W.phase = "menu";
      }, 500);
      loop();
    } catch (e) {
      console.error(e);
      $("#loadText").textContent = "Unable to start: " + e.message;
    }
  }
  let particles;

  // ========================================================================
  // STORM: five shrinking phases with escalating damage per second
  // ========================================================================
  function initStorm() {
    let mat = new THREE.MeshBasicMaterial({
      color: 0x7254d8,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    stormWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 180, 96, 1, true), mat);
    stormWall.position.y = 60;
    scene.add(stormWall);
  }
  function updateStorm(dt) {
    let s = W.storm;
    s.timer -= dt;
    if (s.timer <= 0 && s.phase < 5) {
      s.phase++;
      s.target = [760, 560, 370, 210, 75][s.phase - 1];
      let maxShift = Math.max(0, s.radius - s.target),
        a = rnd(0, TAU),
        r = rnd(0, maxShift * 0.65);
      s.tx = s.cx + Math.cos(a) * r;
      s.tz = s.cz + Math.sin(a) * r;
      s.timer = [55, 50, 45, 40, 35][s.phase - 1];
      s.dps = [1, 2, 4, 7, 10][s.phase - 1];
      toast("STORM PHASE " + s.phase + " — MOVE!");
    }
    if (s.radius > s.target) {
      s.radius += (s.target - s.radius) * dt * 0.045;
      s.cx += (s.tx - s.cx) * dt * 0.04;
      s.cz += (s.tz - s.cz) * dt * 0.04;
    }
    stormWall.scale.set(s.radius, 1, s.radius);
    stormWall.position.x = s.cx;
    stormWall.position.z = s.cz;
  }

  // ========================================================================
  // INPUT: keyboard, mouse, pointer lock, settings
  // ========================================================================
  function bind() {
    window.addEventListener("resize", () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });
    window.addEventListener("keydown", (e) => {
      W.keys[e.code] = true;
      if (!W.started) return;
      if (/^Digit[1-5]$/.test(e.code)) {
        let n = +e.code.slice(-1);
        if (W.build && n <= 3) {
          // In build mode 1/2/3 pick the material to spend
          W.buildMat = ["wood", "stone", "metal"][n - 1];
          $("#buildMat").textContent = W.buildMat.toUpperCase();
        } else {
          player.slot = n - 1;
          updateHotbar();
        }
      }
      if (e.code === "KeyE") player.pickup();
      if (e.code === "KeyQ" || e.code === "KeyB") toggleBuild();
      if (e.code === "KeyR") {
        if (W.build) {
          W.buildRot = (W.buildRot + 1) % 4;
        } else player.reload();
      }
      if (e.code === "Escape") togglePause();
    });
    window.addEventListener("keyup", (e) => (W.keys[e.code] = false));
    renderer.domElement.addEventListener("mousedown", (e) => {
      if (!W.started || W.paused) return;
      W.audio.resume();
      if (document.pointerLockElement !== renderer.domElement)
        try {
          let q = renderer.domElement.requestPointerLock?.();
          q && q.catch && q.catch(() => {});
        } catch (_) {}
      if (e.button === 0) {
        if (W.build) placeBuild();
        else player.attack();
      }
      if (e.button === 2 && W.build) W.buildRot = (W.buildRot + 1) % 4;
    });
    renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("mousemove", (e) => {
      if (!W.started || W.paused) return;
      if (document.pointerLockElement === renderer.domElement || e.buttons) {
        W.yaw -= e.movementX * W.sensitivity;
        W.pitch = clamp(W.pitch - e.movementY * W.sensitivity, -0.85, 0.5);
      }
    });
    renderer.domElement.addEventListener(
      "wheel",
      (e) => {
        if (W.build) {
          W.buildType = (W.buildType + (e.deltaY > 0 ? 1 : 2)) % 3;
          $("#buildType").textContent = ["WALL", "FLOOR", "RAMP"][W.buildType];
        } else {
          player.slot = (player.slot + (e.deltaY > 0 ? 1 : 4)) % 5;
          updateHotbar();
        }
      },
      { passive: true },
    );
    $("#playBtn").onclick = start;
    $("#restartBtn").onclick = () => location.reload();
    $("#resumeBtn").onclick = togglePause;
    $("#quitBtn").onclick = () => location.reload();
    $("#spectateBtn").onclick = () => {
      $("#end").classList.add("hidden");
      W.phase = "spectate";
    };
    $("#settingsBtn").onclick = () => showSettings("menu");
    $("#pauseSettings").onclick = () => showSettings("pause");
    $("#settingsBack").onclick = closeSettings;
    $("#sensitivity").oninput = (e) => {
      $("#sensOut").textContent = e.target.value + "%";
      W.sensitivity = 0.0007 + e.target.value * 0.00003;
    };
    $("#volume").oninput = (e) => {
      $("#volOut").textContent = e.target.value + "%";
      if (W.audio) W.audio.master.gain.value = e.target.value / 100;
    };
    window.addEventListener("blur", () => {
      if (W.started && !W.paused) togglePause();
    });
  }
  let settingsFrom = "menu";
  function showSettings(from) {
    settingsFrom = from;
    $("#menu").classList.add("hidden");
    $("#pause").classList.add("hidden");
    $("#settings").classList.remove("hidden");
  }
  function closeSettings() {
    $("#settings").classList.add("hidden");
    $(settingsFrom === "menu" ? "#menu" : "#pause").classList.remove("hidden");
  }

  // ========================================================================
  // GAME FLOW: start, pause, build toggle, end screens
  // ========================================================================
  function start() {
    $("#menu").classList.add("hidden");
    $("#hud").classList.remove("hidden");
    W.started = true;
    W.phase = "playing";
    W.audio.resume();
    try {
      let q = renderer.domElement.requestPointerLock?.();
      q && q.catch && q.catch(() => {});
    } catch (_) {}
    toast("DROPPED IN — LOOT FAST, 25 PLAYERS LEFT");
  }
  function togglePause() {
    if (!W.started || W.phase === "ended") return;
    W.paused = !W.paused;
    $("#pause").classList.toggle("hidden", !W.paused);
    if (W.paused) document.exitPointerLock?.();
  }
  function toggleBuild() {
    W.build = !W.build;
    preview.visible = W.build;
    $("#buildInfo").classList.toggle("hidden", !W.build);
    $("#ammo").classList.toggle("hidden", W.build);
    toast(W.build ? "BUILD MODE" : "COMBAT MODE");
  }

  // ========================================================================
  // HUD & UI: hotbar, bars, toasts, kill feed, hit markers
  // ========================================================================
  function updateHotbar() {
    let h = $("#hotbar");
    h.innerHTML = "";
    player.inventory.forEach((w, i) => {
      let d = document.createElement("div");
      d.className = "slot " + (i === player.slot ? "active " : "") + (w.owned ? "" : "empty");
      d.innerHTML =
        "<b>" +
        (i + 1) +
        "</b><span>" +
        (w.owned ? w.icon : "·") +
        "</span><small>" +
        (!w.owned ? "" : w.uses != null ? w.uses : w.ammo === Infinity ? "∞" : w.ammo || "") +
        "</small>";
      h.appendChild(d);
    });
    let w = player.weapon;
    $("#ammo").innerHTML = w.owned
      ? "<b>" +
        (w.clip === Infinity ? "∞" : w.clip != null ? w.clip : "—") +
        "</b><span>" +
        w.name +
        (w.ammo != null && w.ammo !== Infinity ? " · " + w.ammo : "") +
        "</span>"
      : "<b>—</b><span>EMPTY SLOT</span>";
  }
  function hitmark() {
    $("#hitmarker").classList.add("show");
    W.audio.play("hit");
    setTimeout(() => $("#hitmarker").classList.remove("show"), 100);
  }
  function toast(t) {
    let e = $("#toast");
    e.textContent = t;
    e.className = "toast";
    void e.offsetWidth;
    e.className = "toast";
  }
  function feed(t) {
    let d = document.createElement("div");
    d.className = "feedline";
    d.textContent = t;
    $("#feed").prepend(d);
    setTimeout(() => d.remove(), 5000);
  }
  function endGame(win) {
    W.phase = "ended";
    W.paused = true;
    document.exitPointerLock?.();
    $("#end").classList.remove("hidden");
    $("#endEyebrow").textContent = win ? "VICTORY ROYALE" : "ELIMINATED";
    $("#endTitle").textContent = win ? "YOU OWNED THE STORM" : "YOU PLACED #" + W.remaining;
    $("#endKills").textContent = W.kills;
    $("#survived").textContent = formatTime(W.time);
    if (win) {
      W.audio.play("elim");
      $("#endTitle").style.color = "var(--lime)";
    }
  }
  function formatTime(t) {
    return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(Math.floor(t % 60)).padStart(2, "0");
  }
  function updateHUD() {
    if (!W.started) return;
    $("#healthFill").style.width = player.health + "%";
    $("#shieldFill").style.width = player.shield + "%";
    $("#healthVal").textContent = Math.ceil(player.health);
    $("#shieldVal").textContent = Math.ceil(player.shield);
    $("#remaining").textContent = W.remaining;
    $("#kills").textContent = W.kills;
    for (const k of ["wood", "stone", "metal"]) $("#" + k).textContent = Math.floor(player.materials[k]);
    $("#stormTimer").textContent = formatTime(Math.max(0, W.storm.timer));
    updateHotbar();
    drawMap();
  }

  // ========================================================================
  // MINIMAP: canvas radar with storm ring and nearby contacts
  // ========================================================================
  function drawMap() {
    let c = $("#minimap"),
      x = c.getContext("2d"),
      S = c.width;
    x.clearRect(0, 0, S, S);
    x.fillStyle = "#1f5f47";
    x.beginPath();
    x.arc(S / 2, S / 2, S * 0.46, 0, TAU);
    x.fill();
    // POI markers so the whole-map radar reads as a real island map.
    if (W.pois) {
      x.font = "bold 6px Inter, sans-serif";
      x.textAlign = "center";
      for (const p of W.pois) {
        let px = S / 2 + (p[1] / CFG.map) * S,
          pz = S / 2 + (p[2] / CFG.map) * S;
        x.fillStyle = "rgba(255,255,255,0.55)";
        x.fillRect(px - 2, pz - 2, 4, 4);
        x.fillStyle = "rgba(255,255,255,0.72)";
        x.fillText(p[0].split(" ")[0], px, pz - 5);
      }
    }
    x.strokeStyle = "#7c5ce0";
    x.lineWidth = 3;
    x.beginPath();
    x.arc(
      S / 2 + (W.storm.cx / CFG.map) * S,
      S / 2 + (W.storm.cz / CFG.map) * S,
      (W.storm.radius / CFG.map) * S,
      0,
      TAU,
    );
    x.stroke();
    for (const b of W.bots)
      if (b.alive && b.mesh.position.distanceTo(player.mesh.position) < 240) {
        x.fillStyle = "#ff4d68";
        x.beginPath();
        x.arc(
          S / 2 + (b.mesh.position.x / CFG.map) * S,
          S / 2 + (b.mesh.position.z / CFG.map) * S,
          2.5,
          0,
          TAU,
        );
        x.fill();
      }
    x.save();
    x.translate(
      S / 2 + (player.mesh.position.x / CFG.map) * S,
      S / 2 + (player.mesh.position.z / CFG.map) * S,
    );
    x.rotate(-W.yaw);
    x.fillStyle = "white";
    x.beginPath();
    x.moveTo(0, -7);
    x.lineTo(5, 6);
    x.lineTo(-5, 6);
    x.closePath();
    x.fill();
    x.restore();
  }
  let frames = 0,
    lastFps = performance.now();

  // ========================================================================
  // MAIN LOOP: fixed-order update then render
  // ========================================================================
  function loop() {
    requestAnimationFrame(loop);
    let dt = Math.min(clock.getDelta(), 0.05);
    if (W.started && !W.paused) {
      W.time += dt;
      player.update(dt);
      refreshBlockers(dt);
      grid.clear();
      for (const b of W.bots) if (b.alive) grid.add(b);
      for (const b of W.bots) b.update(dt);
      updateStorm(dt);
      particles.update(dt);
      updatePreview();
      updateHUD();
    }
    renderer.info.reset();
    renderer.render(scene, camera);
    frames++;
    let n = performance.now();
    if (n - lastFps > 1000) {
      let fps = (frames * 1000) / (n - lastFps);
      $("#debug").innerHTML =
        "FPS: " +
        fps.toFixed(0) +
        "<br>Draw: " +
        renderer.info.render.calls +
        "<br>Tri: " +
        Math.round(renderer.info.render.triangles / 1000) +
        "k";
      frames = 0;
      lastFps = n;
    }
  }
  window.render_game_to_text = () =>
    JSON.stringify({
      coordinateSystem: "x east, z south, y up; map center origin",
      phase: W.phase,
      player: player
        ? {
            x: +player.mesh.position.x.toFixed(1),
            y: +player.mesh.position.y.toFixed(1),
            z: +player.mesh.position.z.toFixed(1),
            health: +player.health.toFixed(1),
            shield: +player.shield.toFixed(1),
            weapon: player.weapon.type,
            slot: player.slot,
            build: W.build,
          }
        : null,
      storm: {
        phase: W.storm.phase,
        radius: +W.storm.radius.toFixed(1),
        timer: +W.storm.timer.toFixed(1),
        dps: W.storm.dps,
      },
      remaining: W.remaining,
      kills: W.kills,
      botsNear: player
        ? W.bots
            .filter((b) => b.alive && b.mesh.position.distanceTo(player.mesh.position) < 150)
            .map((b) => ({
              name: b.name,
              state: b.state,
              hp: +b.hp.toFixed(0),
              distance: +b.mesh.position.distanceTo(player.mesh.position).toFixed(0),
            }))
        : [],
      lootNear: W.nearLoot?.type || null,
      // extra diagnostics (also used by the automated QA harness)
      materials: player ? { ...player.materials } : null,
      inventory: player
        ? player.inventory.map((s) => (s.owned ? s.type + ":" + (s.uses != null ? s.uses : s.clip) : null))
        : null,
      structures: W.structures.length,
      lootRemaining: W.loot.length,
      botStates: W.bots.reduce((a, b) => {
        if (b.alive) a[b.state] = (a[b.state] || 0) + 1;
        return a;
      }, {}),
    });
  window.advanceTime = (ms) => {
    let steps = Math.max(1, Math.round(ms / 16.67));
    for (let i = 0; i < steps; i++) {
      let dt = 1 / 60;
      if (W.started && !W.paused) {
        W.time += dt;
        player.update(dt);
        refreshBlockers(dt);
        grid.clear();
        for (const b of W.bots) if (b.alive) grid.add(b);
        for (const b of W.bots) b.update(dt);
        updateStorm(dt);
        particles.update(dt);
      }
    }
    renderer.render(scene, camera);
  };
  window.simulateInput = (code, down = true) => {
    W.keys[code] = down;
  };
  if (typeof THREE === "undefined") {
    $("#loadText").textContent = "Three.js could not load. Check your internet connection.";
    console.error("Three.js CDN unavailable");
  } else init();
})();
