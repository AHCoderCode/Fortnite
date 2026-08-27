/*
 SKYFALL ROYALE — 3D Battle Royale Engine
 Features: First-Person (FPS) / Third-Person (TPS) cameras, Stylized Combatants,
 3D Floating Health Bars & Damage Feedback, Responsive Bot AI, Touch Virtual Joystick.
*/
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;

  const CFG = {
    map: 2000,
    island: 920,
    gravity: 40,
    move: 28,
    sprint: 42,
    jump: 17,
    bots: 24,
    eye: 4.2,
    spawn: [0, 100],
    maxStructures: 280,
  };

  const W = {
    phase: "loading",
    time: 0,
    paused: false,
    started: false,
    build: false,
    buildType: 0, // 0: wall, 1: floor, 2: ramp
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
    damageTexts: [],
    keys: {},
    yaw: 0,
    pitch: -0.1,
    sensitivity: 0.0022,
    firstPerson: false, // FPS / TPS toggle
    fov: 75,
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
    screenVec = new THREE.Vector3();

  // Detect Touch / Mobile
  const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  if (isTouchDevice) document.body.classList.add("is-touch");

  // Materials & Shaders
  const MAT = {
    grass: new THREE.MeshStandardMaterial({ color: 0x3f8f50, roughness: 0.95, vertexColors: true }),
    wood: new THREE.MeshStandardMaterial({ color: 0x8b532d, roughness: 0.85 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x247444, roughness: 0.9, flatShading: true }),
    stone: new THREE.MeshStandardMaterial({ color: 0x6e7d87, roughness: 0.95, flatShading: true }),
    metal: new THREE.MeshStandardMaterial({ color: 0x638997, metalness: 0.6, roughness: 0.35 }),
    wall: new THREE.MeshStandardMaterial({ color: 0xc48655, roughness: 0.8 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x2d4363, roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x73d7e8,
      transparent: true,
      opacity: 0.45,
      roughness: 0.1,
    }),
    tracer: new THREE.MeshBasicMaterial({ color: 0xfff275, transparent: true, opacity: 0.9 }),
  };

  // ========================================================================
  // TERRAIN HEIGHTMAP
  // ========================================================================
  function noise(x, z) {
    return (
      Math.sin(x * 0.007) * Math.cos(z * 0.006) * 18 +
      Math.sin((x + z) * 0.014) * 8 +
      Math.cos(Math.sqrt(x * x + z * z) * 0.018) * 5
    );
  }

  function height(x, z) {
    let d = Math.sqrt(x * x + z * z);
    let edge = clamp((CFG.island - d) / 120, 0, 1);
    return (-8 + noise(x, z) + 22 * edge) * edge - 7 * (1 - edge);
  }

  // ========================================================================
  // AUDIO SYNTHESIZER
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
        this.noise(0.09, 0.18, 2200);
        this.tone(180, 0.08, "sawtooth", 0.08, -90);
      } else if (k === "shotgun") {
        this.noise(0.24, 0.28, 850);
        this.tone(90, 0.18, "square", 0.14, -40);
      } else if (k === "sniper") {
        this.noise(0.38, 0.35, 1600);
        this.tone(260, 0.22, "sawtooth", 0.15, -180);
      } else if (k === "pickaxe") {
        this.tone(300, 0.08, "triangle", 0.1, -90);
      } else if (k === "build") {
        this.noise(0.08, 0.07, 2400);
        this.tone(540, 0.08, "triangle", 0.08, 160);
      } else if (k === "hit") {
        this.tone(980, 0.05, "sine", 0.08, 250);
      } else if (k === "crit") {
        this.tone(1400, 0.08, "triangle", 0.12, 400);
      } else if (k === "elim") {
        this.tone(480, 0.12, "triangle", 0.12, 220);
        setTimeout(() => this.tone(720, 0.22, "triangle", 0.12, 180), 100);
      } else if (k === "reload") {
        this.noise(0.08, 0.06, 2600);
      } else if (k === "step") {
        this.noise(0.04, 0.02, 450);
      } else if (k === "pickup") {
        this.tone(750, 0.08, "sine", 0.08, 280);
      }
    }
  }

  // ========================================================================
  // PARTICLES & BULLET TRACERS
  // ========================================================================
  class ParticlePool {
    constructor() {
      this.pool = [];
      let g = new THREE.SphereGeometry(0.14, 4, 3);
      for (let i = 0; i < 110; i++) {
        let m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffd166 }));
        m.visible = false;
        scene.add(m);
        this.pool.push({ m, life: 0, v: new THREE.Vector3() });
      }
      this.tracers = [];
      let tg = new THREE.CylinderGeometry(0.04, 0.04, 1, 4);
      tg.rotateX(Math.PI / 2);
      for (let i = 0; i < 20; i++) {
        let tm = new THREE.Mesh(tg, MAT.tracer);
        tm.visible = false;
        scene.add(tm);
        this.tracers.push({ m: tm, life: 0 });
      }
    }
    burst(p, color = 0xffd166, n = 6) {
      for (let i = 0; i < n; i++) {
        let q = this.pool.find((x) => x.life <= 0);
        if (!q) break;
        q.life = rnd(0.2, 0.6);
        q.m.visible = true;
        q.m.material.color.setHex(color);
        q.m.position.copy(p);
        q.v.set(rnd(-6, 6), rnd(2, 9), rnd(-6, 6));
      }
    }
    tracer(start, end) {
      let t = this.tracers.find((x) => x.life <= 0);
      if (!t) return;
      t.life = 0.09;
      t.m.visible = true;
      let mid = start.clone().add(end).multiplyScalar(0.5);
      let dist = start.distanceTo(end);
      t.m.position.copy(mid);
      t.m.scale.set(1, 1, Math.max(1, dist));
      t.m.lookAt(end);
    }
    update(dt) {
      for (const q of this.pool) {
        if (q.life > 0) {
          q.life -= dt;
          q.v.y -= 18 * dt;
          q.m.position.addScaledVector(q.v, dt);
          q.m.scale.setScalar(Math.max(0.12, q.life * 2.2));
          if (q.life <= 0) q.m.visible = false;
        }
      }
      for (const t of this.tracers) {
        if (t.life > 0) {
          t.life -= dt;
          if (t.life <= 0) t.m.visible = false;
        }
      }
    }
  }

  // ========================================================================
  // SPATIAL GRID FOR COLLISION & BOT TARGETING
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
      let k = this.key(e.mesh.position.x, e.mesh.position.z);
      let a = this.cells.get(k);
      if (!a) this.cells.set(k, (a = []));
      a.push(e);
    }
    near(x, z, r = 160) {
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
  // 3D FLOATING HEALTH BAR COMPONENT
  // ========================================================================
  function createHealthBarSprite() {
    let canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 24;
    let ctx = canvas.getContext("2d");
    let texture = new THREE.CanvasTexture(canvas);
    let material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false });
    let sprite = new THREE.Sprite(material);
    sprite.scale.set(4.5, 0.85, 1);
    sprite.position.y = 5.2;
    sprite.userData = { canvas, ctx, texture };
    return sprite;
  }

  function updateHealthBarSprite(sprite, hp, maxHp, shield, maxShield, name = "") {
    if (!sprite || !sprite.userData) return;
    let { canvas, ctx, texture } = sprite.userData;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background pill
    ctx.fillStyle = "rgba(4, 10, 18, 0.85)";
    ctx.beginPath();
    ctx.roundRect(4, 2, 120, 20, 6);
    ctx.fill();

    // Name text
    ctx.font = "bold 9px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText(name.slice(0, 12), 64, 10);

    // Health Bar (Green)
    let hpW = Math.max(0, (hp / maxHp) * 112);
    ctx.fillStyle = "#333333";
    ctx.fillRect(8, 12, 112, 4);
    ctx.fillStyle = "#38e060";
    ctx.fillRect(8, 12, hpW, 4);

    // Shield Bar (Blue)
    if (maxShield > 0) {
      let shW = Math.max(0, (shield / maxShield) * 112);
      ctx.fillStyle = "#2ba7ff";
      ctx.fillRect(8, 17, shW, 3);
    }
    texture.needsUpdate = true;
  }

  // ========================================================================
  // STYLIZED HUMANOID CHARACTER BUILDER
  // ========================================================================
  function makeStylizedHumanoid(themeColor = 0x24bde6, isPlayer = false) {
    let group = new THREE.Group();
    let skinMat = new THREE.MeshStandardMaterial({ color: 0xf3ba90, roughness: 0.8 });
    let suitMat = new THREE.MeshStandardMaterial({ color: themeColor, roughness: 0.6 });
    let armorMat = new THREE.MeshStandardMaterial({ color: 0x1a2634, metalness: 0.3, roughness: 0.4 });
    let visorMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00a0b0,
      emissiveIntensity: 0.7,
      roughness: 0.2,
    });

    // 1. Torso & Vest
    let torso = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.8, 0.9), suitMat);
    torso.position.y = 2.4;
    torso.castShadow = true;
    group.add(torso);

    let vest = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.05), armorMat);
    vest.position.set(0, 2.4, 0);
    vest.castShadow = true;
    group.add(vest);

    // 2. Head & Visor (Headshot Box)
    let headGroup = new THREE.Group();
    headGroup.position.set(0, 3.8, 0);
    let head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), skinMat);
    head.castShadow = true;
    headGroup.add(head);

    let helmet = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 1.1), armorMat);
    helmet.position.set(0, 0.1, -0.05);
    helmet.castShadow = true;
    headGroup.add(helmet);

    let visor = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.35, 0.2), visorMat);
    visor.position.set(0, 0.1, 0.52);
    headGroup.add(visor);
    group.add(headGroup);
    group.headMesh = headGroup; // tagged for headshot detection

    // 3. Backpack
    let pack = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, 0.5), MAT.metal);
    pack.position.set(0, 2.5, -0.65);
    pack.castShadow = true;
    group.add(pack);

    // 4. Arms & Hands holding weapon
    let rightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.1, 4, 6), suitMat);
    rightArm.position.set(1.0, 2.3, 0.3);
    rightArm.rotation.x = -Math.PI / 4;
    rightArm.castShadow = true;
    group.add(rightArm);
    group.rightArm = rightArm;

    let leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.1, 4, 6), suitMat);
    leftArm.position.set(-1.0, 2.3, 0.3);
    leftArm.rotation.x = -Math.PI / 4;
    leftArm.castShadow = true;
    group.add(leftArm);

    // 5. Stylized Weapon Mesh held in hands
    let gun = new THREE.Group();
    gun.position.set(0.6, 2.2, 0.8);
    let gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.4, 1.8), armorMat);
    let gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 6), MAT.metal);
    gunBarrel.rotateX(Math.PI / 2);
    gunBarrel.position.set(0, 0.08, 1.1);
    gun.add(gunBody, gunBarrel);
    gun.castShadow = true;
    group.add(gun);
    group.gunMesh = gun;

    // 6. Legs
    let leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 1.4, 4, 6), armorMat);
    leftLeg.position.set(-0.45, 0.9, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);
    group.leftLeg = leftLeg;

    let rightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 1.4, 4, 6), armorMat);
    rightLeg.position.set(0.45, 0.9, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);
    group.rightLeg = rightLeg;

    // 7. Overhead Floating Health Bar (for bots and 3rd person)
    let hpSprite = createHealthBarSprite();
    group.add(hpSprite);
    group.hpSprite = hpSprite;

    scene.add(group);
    return group;
  }

  // ========================================================================
  // MAP GENERATION & PROPS
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
        c[i * 3] = 0.65;
        c[i * 3 + 1] = 0.58;
        c[i * 3 + 2] = 0.38;
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
        opacity: 0.75,
        roughness: 0.2,
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
    let y = height(x, z);
    let root = geo("CylinderGeometry", [1.2, 1.8, 9, 7], MAT.wood, [x, y + 4.5, z]);
    let crown = geo("ConeGeometry", [5.5, 12, 7], MAT.leaf, [x, y + 13, z]);
    crown.castShadow = true;
    let e = { type: "tree", mesh: root, parts: [root, crown], hp: 120, material: "wood", amount: 35, alive: true };
    W.resources.push(e);
    addCollider(root, 3, 3, 10, "resource", e);
  }

  function makeRock(x, z) {
    let y = height(x, z);
    let m = geo("DodecahedronGeometry", [rnd(2.2, 4), 0], MAT.stone, [x, y + 2, z]);
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

    addCollider({ position: new THREE.Vector3(x, y + 5, z) }, 22 * scale, 18 * scale, 10, "building");
    spawnLoot(x + rnd(-6, 6), z + rnd(-5, 5), Math.random() < 0.4 ? "chest" : null);
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
      ["PLEASANT PARK", 380, -280],
      ["RETAIL ROW", -380, 260],
      ["LAZY LAKE", 300, 360],
      ["CRAGGY CLIFFS", -360, -360],
    ];
    for (const p of pois) {
      for (let i = 0; i < (p[0] === "TILTED TOWERS" ? 8 : 4); i++) {
        makeHouse(
          p[1] + rnd(-60, 60),
          p[2] + rnd(-60, 60),
          [0xe0c296, 0x9fc5d8, 0xcda3b7, 0xb7cf93][i % 4],
          p[0] === "TILTED TOWERS" && i < 2 ? 1.3 : 1,
        );
      }
    }
    W.pois = pois;
  }

  // ========================================================================
  // LOOT DEFINITIONS & SPAWNING
  // ========================================================================
  const lootDefs = {
    rifle: { icon: "▰", name: "ASSAULT RIFLE", color: 0x48a9ff },
    shotgun: { icon: "⌁", name: "TACTICAL SHOTGUN", color: 0xa66cff },
    sniper: { icon: "━", name: "BOLT SNIPER", color: 0xffc93c },
    medkit: { icon: "✚", name: "MEDKIT", color: 0xff596d },
    ammo: { icon: "▥", name: "AMMO BOX", color: 0xe7b85c },
    materials: { icon: "◆", name: "MATERIAL CACHE", color: 0xc99562 },
    chest: { icon: "◇", name: "SUPPLY CHEST", color: 0xffd348 },
  };

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
          emissiveIntensity: 0.6,
          roughness: 0.35,
        }),
        [x, y, z],
      );
    let e = { type, mesh: m, def, alive: true };
    W.loot.push(e);
    return e;
  }

  // ========================================================================
  // FLOATING COMBAT DAMAGE TEXT POPUPS
  // ========================================================================
  function popDamageNumber(pos, amount, isCrit = false, isShield = false) {
    let container = $("#damageOverlay");
    if (!container) return;
    let div = document.createElement("div");
    div.className = `dmg-num ${isCrit ? "crit" : ""} ${isShield ? "shield-hit" : ""}`;
    div.textContent = (isCrit ? "CRIT! " : "") + Math.round(amount);

    screenVec.copy(pos);
    screenVec.project(camera);

    let x = (screenVec.x * 0.5 + 0.5) * window.innerWidth;
    let y = (-(screenVec.y * 0.5) + 0.5) * window.innerHeight;

    div.style.left = `${x + rnd(-10, 10)}px`;
    div.style.top = `${y + rnd(-10, 10)}px`;
    container.appendChild(div);

    setTimeout(() => div.remove(), 850);
  }

  // ========================================================================
  // PLAYER CLASS (FPS / TPS DUAL CAMERA)
  // ========================================================================
  class Player {
    constructor() {
      this.mesh = makeStylizedHumanoid(0x24bde6, true);
      this.mesh.position.set(CFG.spawn[0], height(CFG.spawn[0], CFG.spawn[1]) + 0.1, CFG.spawn[1]);
      this.vel = new THREE.Vector3();
      this.health = 100;
      this.shield = 100;
      this.lastDamage = -99;
      this.grounded = false;
      this.radius = 1.3;
      this.materials = { wood: 150, stone: 50, metal: 0 };
      this.inventory = [
        { type: "pickaxe", name: "PICKAXE", icon: "⛏", ammo: Infinity, clip: Infinity, owned: true },
        { type: "rifle", name: "ASSAULT RIFLE", icon: "▰", ammo: 90, clip: 30, max: 30, owned: true },
        { type: "shotgun", name: "SHOTGUN", icon: "▮", ammo: 24, clip: 8, max: 8, owned: false },
        { type: "sniper", name: "SNIPER", icon: "━", ammo: 8, clip: 1, max: 1, owned: false },
        { type: "medkit", name: "MEDKIT", icon: "✚", uses: 1, owned: false },
      ];
      this.slot = 1;
      this.cool = 0;
      this.reloading = 0;
      this.healing = 0;
      this.step = 0;
      this.walkCycle = 0;
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
      popDamageNumber(this.mesh.position.clone().add(new THREE.Vector3(0, 3, 0)), n, false, s > 0);
      if (this.health <= 0) this.die();
    }

    die() {
      this.health = 0;
      endGame(false);
    }

    update(dt) {
      if (this.health <= 0) return;

      // Movement vector calculation
      let f = new THREE.Vector3(Math.sin(W.yaw), 0, Math.cos(W.yaw));
      let r = new THREE.Vector3(f.z, 0, -f.x);
      let wish = new THREE.Vector3();

      if (W.keys.KeyW) wish.addScaledVector(f, -1);
      if (W.keys.KeyS) wish.add(f);
      if (W.keys.KeyA) wish.addScaledVector(r, -1);
      if (W.keys.KeyD) wish.add(r);

      // Virtual Joystick touch input add-on
      if (touchMovement.active) {
        wish.addScaledVector(f, -touchMovement.y);
        wish.addScaledVector(r, touchMovement.x);
      }

      let isSprinting = W.keys.ShiftLeft || touchMovement.sprint;
      let speed = isSprinting ? CFG.sprint : CFG.move;

      if (wish.lengthSq() > 0.001) {
        wish.normalize().multiplyScalar(speed);
        this.walkCycle += dt * (isSprinting ? 14 : 9);
      }

      let accel = this.grounded ? 14 : 4;
      this.vel.x += (wish.x - this.vel.x) * Math.min(1, accel * dt);
      this.vel.z += (wish.z - this.vel.z) * Math.min(1, accel * dt);
      this.vel.y -= CFG.gravity * dt;

      if ((W.keys.Space || touchJumpTrigger) && this.grounded) {
        this.vel.y = CFG.jump;
        this.grounded = false;
        touchJumpTrigger = false;
        W.audio.tone(200, 0.08, "triangle", 0.06, 120);
      }

      let old = this.mesh.position.clone();
      this.mesh.position.addScaledVector(this.vel, dt);

      let gy = height(this.mesh.position.x, this.mesh.position.z);
      if (this.mesh.position.y <= gy) {
        this.mesh.position.y = gy;
        this.vel.y = 0;
        this.grounded = true;
      }

      // Collisions
      for (const c of W.colliders) {
        if (!c.owner || c.owner.alive !== false) {
          let p = c.mesh.position;
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

      // Island borders
      if (Math.hypot(this.mesh.position.x, this.mesh.position.z) > 900) {
        this.mesh.position.x = old.x;
        this.mesh.position.z = old.z;
      }

      // Footstep sound & limb walk animation
      if (wish.lengthSq() > 0.01 && this.grounded) {
        this.step -= dt;
        if (this.step <= 0) {
          W.audio.play("step");
          this.step = isSprinting ? 0.28 : 0.38;
        }
        if (this.mesh.leftLeg && this.mesh.rightLeg) {
          this.mesh.leftLeg.rotation.x = Math.sin(this.walkCycle) * 0.7;
          this.mesh.rightLeg.rotation.x = -Math.sin(this.walkCycle) * 0.7;
        }
      } else if (this.mesh.leftLeg && this.mesh.rightLeg) {
        this.mesh.leftLeg.rotation.x *= 0.8;
        this.mesh.rightLeg.rotation.x *= 0.8;
      }

      this.mesh.rotation.y = W.yaw + Math.PI;

      // Gun recoil & timers
      if (this.cool > 0) this.cool -= dt;
      if (this.reloading > 0) {
        this.reloading -= dt;
        if (this.reloading <= 0) this.finishReload();
      }
      if (this.healing > 0) {
        this.healing -= dt;
        if (this.healing <= 0) {
          this.health = 100;
          this.inventory[this.slot] = { type: "empty", name: "EMPTY", icon: "·", owned: false };
          toast("HEALED TO 100 HP");
        }
      }

      // Auto shield-regen slowly over time
      if (W.time - this.lastDamage > 6 && this.health < 100) {
        this.health = Math.min(100, this.health + 3 * dt);
      }

      // Update Player Health Sprite
      updateHealthBarSprite(this.mesh.hpSprite, this.health, 100, this.shield, 100, "YOU");
      this.mesh.hpSprite.visible = !W.firstPerson; // hide overhead sprite in FPS mode

      this.updateCamera(dt);
      this.nearLoot();
      this.updateStorm(dt);
    }

    updateCamera(dt) {
      if (W.firstPerson) {
        // FPS View: Camera locked to player's eye level with head bob
        let bob = Math.sin(this.walkCycle * 2) * 0.06;
        let eyePos = this.mesh.position.clone().add(new THREE.Vector3(0, CFG.eye + bob, 0));
        camera.position.copy(eyePos);

        let lookTarget = eyePos.clone().add(
          new THREE.Vector3(
            -Math.sin(W.yaw) * Math.cos(W.pitch),
            Math.sin(W.pitch),
            -Math.cos(W.yaw) * Math.cos(W.pitch),
          ),
        );
        camera.lookAt(lookTarget);

        // Hide full character mesh in FPS so it doesn't clip, keep gun visible in view
        this.mesh.visible = true;
        if (this.mesh.headMesh) this.mesh.headMesh.visible = false;
        if (this.mesh.gunMesh) {
          this.mesh.gunMesh.position.set(0.4, 3.7 + bob, 0.7);
          this.mesh.gunMesh.rotation.x = W.pitch;
        }
      } else {
        // TPS View: Over-the-shoulder Fortnite camera
        if (this.mesh.headMesh) this.mesh.headMesh.visible = true;
        this.mesh.visible = true;
        if (this.mesh.gunMesh) {
          this.mesh.gunMesh.position.set(0.6, 2.2, 0.8);
          this.mesh.gunMesh.rotation.x = 0;
        }

        let shoulder = new THREE.Vector3(Math.cos(W.yaw), 0, -Math.sin(W.yaw)).multiplyScalar(
          W.keys.MouseRight || touchAiming ? 2.2 : 2.6,
        );
        let focus = this.mesh.position.clone().add(new THREE.Vector3(0, CFG.eye, 0)).add(shoulder);
        let dist = W.keys.MouseRight || touchAiming ? 8 : 14;
        let off = new THREE.Vector3(
          Math.sin(W.yaw) * Math.cos(W.pitch) * dist,
          Math.sin(-W.pitch) * dist + 2.5,
          Math.cos(W.yaw) * Math.cos(W.pitch) * dist,
        );
        let desired = focus.clone().add(off);
        camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
        camera.lookAt(focus);
      }
    }

    nearLoot() {
      let best = null,
        bd = 6;
      for (const l of W.loot) {
        if (l.alive) {
          l.mesh.rotation.y += 0.025;
          l.mesh.position.y =
            height(l.mesh.position.x, l.mesh.position.z) +
            1.2 +
            Math.sin(W.time * 3 + l.mesh.position.x) * 0.25;
          let d = l.mesh.position.distanceTo(this.mesh.position);
          if (d < bd) {
            bd = d;
            best = l;
          }
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
        if (Math.random() < dt * 4)
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
          toast("USING MEDKIT (3s)...");
          W.audio.tone(380, 0.4, "sine", 0.06, 200);
        }
        return;
      }
      if (w.type !== "pickaxe" && w.clip <= 0) {
        this.reload();
        return;
      }

      let cfg = {
        pickaxe: [28, 0.45, 5],
        rifle: [25, 0.12, 280],
        shotgun: [75, 0.75, 70],
        sniper: [105, 1.15, 600],
      }[w.type];
      if (!cfg) return;

      this.cool = cfg[1];
      if (w.clip !== Infinity) w.clip--;
      W.audio.play(w.type);

      let origin = camera.position.clone();
      let dir = new THREE.Vector3();
      camera.getWorldDirection(dir);

      let spread =
        w.type === "shotgun" ? 0.055 : w.type === "rifle" ? 0.01 : w.type === "sniper" ? 0.001 : 0.04;

      if (w.type === "shotgun") {
        for (let i = 0; i < 6; i++) {
          let spreadDir = dir
            .clone()
            .add(new THREE.Vector3(rnd(-spread, spread), rnd(-spread, spread), rnd(-spread, spread)))
            .normalize();
          this.ray(origin, spreadDir, cfg[0] / 6, cfg[2]);
        }
      } else {
        let spreadDir = dir
          .clone()
          .add(new THREE.Vector3(rnd(-spread, spread), rnd(-spread, spread), rnd(-spread, spread)))
          .normalize();
        this.ray(origin, spreadDir, cfg[0], cfg[2]);
      }

      // Muzzle burst
      particles.burst(origin.clone().add(dir.multiplyScalar(2)), 0xffe070, 3);
    }

    ray(origin, dir, damage, range) {
      raycaster.set(origin, dir);
      raycaster.far = range;

      let targets = [];
      for (const b of W.bots) if (b.alive) targets.push(...b.mesh.children);
      for (const r of W.resources) if (r.alive) targets.push(...r.parts);
      for (const s of W.structures) if (s.alive) targets.push(s.mesh);

      let hits = raycaster.intersectObjects(targets, true);
      let hitEnd = origin.clone().add(dir.clone().multiplyScalar(range));

      if (hits.length) {
        let h = hits[0];
        hitEnd = h.point;
        let ent = findOwner(h.object);
        let isHeadshot = false;

        if (ent) {
          // Headshot detection!
          if (ent instanceof Bot && isChildOf(h.object, ent.mesh.headMesh)) {
            damage *= 1.75;
            isHeadshot = true;
          }
          damageEntity(ent, damage, "YOU", isHeadshot);
          hitmark(isHeadshot);
        }
        particles.burst(h.point, isHeadshot ? 0xffd348 : 0xffe09b, 5);
      }

      particles.tracer(origin.clone().add(new THREE.Vector3(0, -0.3, 0)), hitEnd);
    }

    reload() {
      let w = this.weapon;
      if (!w || !w.owned || !w.max || w.clip >= w.max || w.ammo <= 0 || this.reloading) return;
      this.reloading = w.type === "sniper" ? 2.2 : w.type === "shotgun" ? 1.8 : 1.4;
      toast("RELOADING...");
      W.audio.play("reload");
    }

    finishReload() {
      let w = this.weapon;
      let needed = w.max - w.clip;
      let n = Math.min(needed, w.ammo);
      w.clip += n;
      w.ammo -= n;
      W.audio.play("reload");
    }

    pickup() {
      let l = W.nearLoot;
      if (!l) return;
      if (["rifle", "shotgun", "sniper"].includes(l.type)) {
        let i = { rifle: 1, shotgun: 2, sniper: 3 }[l.type];
        let w = this.inventory[i];
        w.owned = true;
        w.ammo += l.type === "rifle" ? 60 : l.type === "shotgun" ? 18 : 6;
        if (w.clip <= 0) {
          let take = Math.min(w.max, w.ammo);
          w.clip = take;
          w.ammo -= take;
        }
        this.slot = i;
      } else if (l.type === "medkit") {
        this.inventory[4] = { type: "medkit", name: "MEDKIT", icon: "✚", uses: 1, owned: true };
        this.slot = 4;
      } else if (l.type === "ammo") {
        for (let i = 1; i < 4; i++) if (this.inventory[i].owned) this.inventory[i].ammo += 25;
      } else if (l.type === "materials") {
        for (const k in this.materials) this.materials[k] = Math.min(999, this.materials[k] + 100);
      } else if (l.type === "chest") {
        for (let i = 0; i < 3; i++) spawnLoot(l.mesh.position.x + rnd(-3, 3), l.mesh.position.z + rnd(-3, 3));
        this.materials.wood = Math.min(999, this.materials.wood + 80);
      }
      l.alive = false;
      l.mesh.removeFromParent();
      W.audio.play("pickup");
      toast("PICKED UP " + l.def.name);
      updateHotbar();
    }
  }

  function isChildOf(obj, parent) {
    if (!parent) return false;
    let cur = obj;
    while (cur) {
      if (cur === parent) return true;
      cur = cur.parent;
    }
    return false;
  }

  // ========================================================================
  // COMBAT & DAMAGE RESOLUTION
  // ========================================================================
  function findOwner(obj) {
    for (const b of W.bots) {
      if (isChildOf(obj, b.mesh)) return b;
    }
    for (const r of W.resources) {
      if (r.parts.includes(obj) || isChildOf(obj, r.mesh)) return r;
    }
    for (const s of W.structures) {
      if (s.mesh === obj) return s;
    }
    return null;
  }

  function damageEntity(e, n, who, isHeadshot = false) {
    if (!e.alive) return;
    let shieldHit = false;

    if (e instanceof Bot) {
      let s = Math.min(e.shield, n);
      e.shield -= s;
      e.hp -= n - s;
      shieldHit = s > 0;
      e.lastHit = W.time;
      popDamageNumber(e.mesh.position.clone().add(new THREE.Vector3(0, 3.5, 0)), n, isHeadshot, shieldHit);
    } else {
      e.hp -= n;
    }

    if (e.hp <= 0) {
      e.alive = false;
      if (e.parts) e.parts.forEach((x) => x.removeFromParent());
      else if (e.mesh) e.mesh.removeFromParent();

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
        } else {
          feed(who + " eliminated " + e.name);
        }
        spawnLoot(e.mesh.position.x, e.mesh.position.z, Math.random() < 0.6 ? "rifle" : "medkit");
        if (W.remaining <= 1 && player.health > 0) endGame(true);
      }
    }
  }

  // ========================================================================
  // COMPETITIVE BOT AI
  // ========================================================================
  class Bot {
    constructor(i) {
      this.name =
        ["Phantom", "Viper", "Apex", "Razor", "Ghost", "Titan", "Specter", "Blitz", "Havoc", "Blaze"][
          i % 10
        ] +
        "#" +
        (i + 1);

      // Choose bot colors
      let botColors = [0xef476f, 0xff9f43, 0xa55eea, 0x20bf6b, 0xeb3b5a, 0xfa8231];
      this.mesh = makeStylizedHumanoid(botColors[i % botColors.length]);

      // Spawn bots strategically across island POIs and terrain
      let a = (i / CFG.bots) * TAU + rnd(-0.2, 0.2);
      let r = rnd(80, 580);
      let x = Math.cos(a) * r;
      let z = Math.sin(a) * r;

      this.mesh.position.set(x, height(x, z), z);
      this.hp = 100;
      this.shield = 50;
      this.state = "Patrol";
      this.alive = true;
      this.target = null;
      this.goal = new THREE.Vector3(x + rnd(-40, 40), 0, z + rnd(-40, 40));
      this.cool = rnd(0.5, 1.8);
      this.think = rnd(0.1, 0.4);
      this.lastHit = -99;
      this.buildCool = 0;
      this.speed = rnd(14, 20);
      this.mats = 80;
      this.medkits = 1;
      this.strafe = Math.random() < 0.5 ? 1 : -1;
      this.walkCycle = 0;
    }

    damage(n, from) {
      damageEntity(this, n, from);
    }

    thinkAI() {
      if (!this.alive) return;
      let s = W.storm;
      let dStorm = Math.hypot(this.mesh.position.x - s.cx, this.mesh.position.z - s.cz);
      if (dStorm > s.radius - 30) {
        this.state = "Flee";
        this.goal.set(s.cx, 0, s.cz);
        return;
      }

      if (this.hp < 35 && this.medkits > 0 && Math.random() < 0.7) {
        this.state = "Heal";
        this.medkits--;
        return;
      }

      // Check nearby candidates
      let candidates = grid
        .near(this.mesh.position.x, this.mesh.position.z, 240)
        .filter((x) => x !== this && x.alive);
      candidates.push({ mesh: player.mesh, alive: player.health > 0, name: "YOU", isPlayer: true });

      let best = null,
        bd = 180;
      for (const x of candidates) {
        let d = x.mesh.position.distanceTo(this.mesh.position);
        if (d < bd && this.canSee(x)) {
          best = x;
          bd = d;
        }
      }

      if (best) {
        this.target = best;
        this.state = bd < 80 ? "Attack" : "Chase";
      } else {
        let loot = W.loot.find((l) => l.alive && l.mesh.position.distanceTo(this.mesh.position) < 90);
        if (loot) {
          this.state = "Loot";
          this.goal.copy(loot.mesh.position);
        } else if (this.goal.distanceTo(this.mesh.position) < 10 || Math.random() < 0.1) {
          this.state = "Patrol";
          this.goal.set(rnd(-600, 600), 0, rnd(-600, 600));
        }
      }

      // Build tactical cover under fire
      if (W.time - this.lastHit < 1.4 && this.buildCool <= 0 && this.mats >= 10) {
        this.state = "Build";
        this.buildCool = rnd(4, 7);
      }
    }

    canSee(t) {
      let o = this.mesh.position.clone().add(new THREE.Vector3(0, 3, 0));
      let d = t.mesh.position.clone().sub(o);
      let len = d.length();
      raycaster.set(o, d.normalize());
      raycaster.far = len;
      return !raycaster.intersectObjects(losBlockers, false).length;
    }

    update(dt) {
      if (!this.alive) return;
      this.cool -= dt;
      this.think -= dt;
      this.buildCool -= dt;

      if (this.think <= 0) {
        this.think = rnd(0.25, 0.5);
        this.thinkAI();
      }

      let targetPos = null;
      if (this.state === "Attack" && this.target && this.target.alive !== false) {
        targetPos = this.target.mesh.position;
        this.shoot();
      } else if (this.state === "Chase" && this.target) {
        targetPos = this.target.mesh.position;
      } else if (["Patrol", "Loot", "Flee"].includes(this.state)) {
        targetPos = this.goal;
      } else if (this.state === "Build") {
        placeBotBuild(this);
        this.state = "Attack";
      } else if (this.state === "Heal") {
        this.hp = Math.min(100, this.hp + 25 * dt);
        if (this.hp >= 80) this.state = "Patrol";
      }

      if (targetPos) {
        let d = targetPos.clone().sub(this.mesh.position);
        d.y = 0;
        let dist = d.length();

        if (dist > 3) {
          d.normalize();
          let move = new THREE.Vector3();
          if (this.state === "Attack") {
            if (dist > 45) move.copy(d);
            else if (dist < 18) move.copy(d).negate();
            move.add(new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(this.strafe * 0.75));
            if (Math.random() < 0.02) this.strafe *= -1;
          } else {
            move.copy(d);
          }

          if (move.lengthSq() > 0.001) {
            move.normalize();
            this.mesh.position.addScaledVector(move, this.speed * (this.state === "Attack" ? 0.7 : 1) * dt);
            this.walkCycle += dt * 10;
          }
          this.mesh.rotation.y = Math.atan2(d.x, d.z);
          this.mesh.position.y = height(this.mesh.position.x, this.mesh.position.z);
        }
      }

      // Animate bot legs
      if (this.mesh.leftLeg && this.mesh.rightLeg) {
        this.mesh.leftLeg.rotation.x = Math.sin(this.walkCycle) * 0.6;
        this.mesh.rightLeg.rotation.x = -Math.sin(this.walkCycle) * 0.6;
      }

      // Update Overhead Health Bar Sprite
      updateHealthBarSprite(this.mesh.hpSprite, this.hp, 100, this.shield, 100, this.name);

      // Storm damage to bots
      let s = W.storm;
      if (Math.hypot(this.mesh.position.x - s.cx, this.mesh.position.z - s.cz) > s.radius) {
        this.hp -= s.dps * dt;
        if (this.hp <= 0) damageEntity(this, 999, "STORM");
      }
    }

    shoot() {
      if (this.cool > 0 || !this.target) return;
      let difficulty = 1 - W.remaining / (CFG.bots + 1);
      this.cool = rnd(0.7, 1.4) - difficulty * 0.25;

      let dist = this.mesh.position.distanceTo(this.target.mesh.position);
      let chance = clamp(0.55 - dist / 450, 0.1, 0.65);

      if (this.mesh.position.distanceTo(player.mesh.position) < 220) {
        W.audio.noise(0.06, 0.03, 900);
      }

      let fromPos = this.mesh.position.clone().add(new THREE.Vector3(0, 2.5, 0));
      let toPos = this.target.mesh.position.clone().add(new THREE.Vector3(0, 2.5, 0));
      particles.tracer(fromPos, toPos);

      if (Math.random() < chance) {
        let dmg = rnd(8, 16);
        if (this.target.isPlayer) player.damage(dmg, this.name);
        else this.target.damage(dmg, this.name);
      }
    }
  }

  let losBlockers = [],
    blockerTimer = 0;
  function refreshBlockers(dt) {
    blockerTimer -= dt;
    if (blockerTimer > 0) return;
    blockerTimer = 0.35;
    losBlockers.length = 0;
    for (const s of W.structures) if (s.alive) losBlockers.push(s.mesh);
    for (const c of W.colliders) if (c.kind === "solid" && c.mesh) losBlockers.push(c.mesh);
  }

  function placeBotBuild(b) {
    if (b.mats < 10) return;
    let dir = b.target
      ? b.target.mesh.position.clone().sub(b.mesh.position).normalize()
      : new THREE.Vector3(0, 0, 1);
    let p = b.mesh.position.clone().add(dir.clone().multiplyScalar(4));
    b.mats -= 10;
    makeStructure("wall", p, Math.atan2(dir.x, dir.z), false);
    W.audio.play("build");
  }

  // ========================================================================
  // BUILDING SYSTEM
  // ========================================================================
  const BSZ = 9;
  const MAT_HP = { wood: 1, stone: 1.45, metal: 1.9 };
  const MAT_MESH = { wood: MAT.wall, stone: MAT.stone, metal: MAT.metal };

  function makeStructure(type, p, rot = 0, owned = true, matKind = owned ? W.buildMat : "metal") {
    let mat = MAT_MESH[matKind] || MAT.wall,
      m;
    if (type === "wall") {
      m = geo("BoxGeometry", [BSZ, 8, 0.7], mat, [p.x, height(p.x, p.z) + 4, p.z], [0, rot, 0]);
    } else if (type === "floor") {
      m = geo("BoxGeometry", [BSZ, 0.6, BSZ], mat, [p.x, height(p.x, p.z) + 0.4, p.z], [0, rot, 0]);
    } else {
      m = geo("BoxGeometry", [BSZ, 0.55, BSZ], mat, [p.x, height(p.x, p.z) + 3.1, p.z], [-0.52, rot, 0]);
    }

    let e = {
      type: "structure",
      subtype: type,
      material: null,
      mesh: m,
      hp: Math.round((type === "wall" ? 220 : 180) * (MAT_HP[matKind] || 1)),
      alive: true,
    };
    W.structures.push(e);
    addCollider(m, BSZ, type === "wall" ? 1 : BSZ, 8, "structure", e);

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
  // BOOTSTRAP & SCENE INIT
  // ========================================================================
  let particles;

  function init() {
    try {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x78b7df);
      scene.fog = new THREE.Fog(0x78b7df, 240, 1050);

      camera = new THREE.PerspectiveCamera(W.fov, innerWidth / innerHeight, 0.1, 1600);
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      renderer.setSize(innerWidth, innerHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      $("#game").appendChild(renderer.domElement);

      scene.add(new THREE.HemisphereLight(0xd5ecff, 0x49683b, 2.2));
      let sun = new THREE.DirectionalLight(0xfff0cf, 3);
      sun.position.set(-220, 320, 180);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      scene.add(sun);

      makeTerrain();
      worldObjects();

      for (let i = 0; i < 45; i++) {
        let a = rnd(0, TAU),
          r = rnd(40, 750);
        spawnLoot(Math.cos(a) * r, Math.sin(a) * r);
      }

      // Starter loot around landing pad
      spawnLoot(CFG.spawn[0] + 6, CFG.spawn[1] - 5, "shotgun");
      spawnLoot(CFG.spawn[0] - 8, CFG.spawn[1] - 3, "ammo");
      spawnLoot(CFG.spawn[0] + 4, CFG.spawn[1] + 8, "medkit");
      spawnLoot(CFG.spawn[0] - 5, CFG.spawn[1] + 10, "chest");

      player = new Player();

      // Spawn 24 enemy combatants immediately
      for (let i = 0; i < CFG.bots; i++) {
        W.bots.push(new Bot(i));
      }
      W.entities = W.bots;

      W.audio = new AudioSys();
      particles = new ParticlePool();

      initStorm();
      initPreview();
      bindInput();
      bindMobileJoystick();

      clock = new THREE.Clock();
      updateHotbar();

      setTimeout(() => {
        $("#loading").classList.add("hidden");
        $("#menu").classList.remove("hidden");
        W.phase = "menu";
      }, 400);

      loop();
    } catch (e) {
      console.error(e);
      $("#loadText").textContent = "Unable to start: " + e.message;
    }
  }

  // ========================================================================
  // STORM CONTROLLER
  // ========================================================================
  function initStorm() {
    let mat = new THREE.MeshBasicMaterial({
      color: 0x7a50e8,
      transparent: true,
      opacity: 0.2,
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
      s.target = [760, 540, 360, 200, 60][s.phase - 1];
      let maxShift = Math.max(0, s.radius - s.target);
      let a = rnd(0, TAU);
      let r = rnd(0, maxShift * 0.65);
      s.tx = s.cx + Math.cos(a) * r;
      s.tz = s.cz + Math.sin(a) * r;
      s.timer = [55, 50, 45, 40, 35][s.phase - 1];
      s.dps = [1, 2, 4, 7, 12][s.phase - 1];
      toast("STORM PHASE " + s.phase + " SHRINKING!");
    }
    if (s.radius > s.target) {
      s.radius += (s.target - s.radius) * dt * 0.05;
      s.cx += (s.tx - s.cx) * dt * 0.04;
      s.cz += (s.tz - s.cz) * dt * 0.04;
    }
    stormWall.scale.set(s.radius, 1, s.radius);
    stormWall.position.x = s.cx;
    stormWall.position.z = s.cz;
  }

  // ========================================================================
  // INPUT & CONTROLS (MOUSE, KEYBOARD & TOUCH)
  // ========================================================================
  let touchMovement = { active: false, x: 0, y: 0, sprint: false };
  let touchAiming = false;
  let touchJumpTrigger = false;

  function togglePerspective() {
    W.firstPerson = !W.firstPerson;
    $("#viewModeLabel").textContent = W.firstPerson ? "FIRST PERSON" : "THIRD PERSON";
    $("#povBadge").textContent = W.firstPerson ? "FPS [V]" : "TPS [V]";
    toast(W.firstPerson ? "FIRST PERSON VIEW" : "THIRD PERSON VIEW");
  }

  function bindInput() {
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
          W.buildMat = ["wood", "stone", "metal"][n - 1];
          $("#buildMat").textContent = W.buildMat.toUpperCase();
        } else {
          player.slot = n - 1;
          updateHotbar();
        }
      }
      if (e.code === "KeyV") togglePerspective();
      if (e.code === "KeyE") player.pickup();
      if (e.code === "KeyQ" || e.code === "KeyB") toggleBuild();
      if (e.code === "KeyR") {
        if (W.build) W.buildRot = (W.buildRot + 1) % 4;
        else player.reload();
      }
      if (e.code === "Escape") togglePause();
    });

    window.addEventListener("keyup", (e) => (W.keys[e.code] = false));

    renderer.domElement.addEventListener("mousedown", (e) => {
      if (!W.started || W.paused) return;
      W.audio.resume();

      if (document.pointerLockElement !== renderer.domElement && !isTouchDevice) {
        renderer.domElement.requestPointerLock?.();
      }
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
        W.pitch = clamp(W.pitch - e.movementY * W.sensitivity, -0.85, 0.65);
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

    // UI Buttons
    $("#playBtn").onclick = start;
    $("#restartBtn").onclick = () => location.reload();
    $("#resumeBtn").onclick = togglePause;
    $("#toggleFpsBtn").onclick = () => {
      togglePerspective();
      togglePause();
    };
    $("#quitBtn").onclick = () => location.reload();
    $("#settingsBtn").onclick = () => showSettings("menu");
    $("#pauseSettings").onclick = () => showSettings("pause");
    $("#settingsBack").onclick = closeSettings;

    $("#sensitivity").oninput = (e) => {
      $("#sensOut").textContent = e.target.value + "%";
      W.sensitivity = 0.0006 + e.target.value * 0.000035;
    };
    $("#volume").oninput = (e) => {
      $("#volOut").textContent = e.target.value + "%";
      if (W.audio) W.audio.master.gain.value = e.target.value / 100;
    };
    $("#fovSlider").oninput = (e) => {
      $("#fovOut").textContent = e.target.value;
      W.fov = +e.target.value;
      camera.fov = W.fov;
      camera.updateProjectionMatrix();
    };

    // Hotbar item click selection
    $("#hotbar").addEventListener("click", (e) => {
      let slotEl = e.target.closest(".slot");
      if (slotEl) {
        let idx = +slotEl.dataset.idx;
        player.slot = idx;
        updateHotbar();
      }
    });
  }

  // ========================================================================
  // MOBILE JOYSTICK & TOUCH BUTTON SYSTEM
  // ========================================================================
  function bindMobileJoystick() {
    let joystickZone = $("#joystickZone");
    let joystickThumb = $("#joystickThumb");
    let joyTouchId = null;
    let startX = 0,
      startY = 0;
    const maxDist = 48;

    joystickZone.addEventListener("touchstart", (e) => {
      let t = e.changedTouches[0];
      joyTouchId = t.identifier;
      let rect = joystickZone.getBoundingClientRect();
      startX = rect.left + rect.width / 2;
      startY = rect.top + rect.height / 2;
      touchMovement.active = true;
      e.preventDefault();
    });

    window.addEventListener("touchmove", (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        let t = e.changedTouches[i];
        if (t.identifier === joyTouchId) {
          let dx = t.clientX - startX;
          let dy = t.clientY - startY;
          let dist = Math.hypot(dx, dy);
          if (dist > maxDist) {
            dx = (dx / dist) * maxDist;
            dy = (dy / dist) * maxDist;
          }
          joystickThumb.style.transform = `translate(${dx}px, ${dy}px)`;
          touchMovement.x = dx / maxDist;
          touchMovement.y = -dy / maxDist;
          touchMovement.sprint = dist > maxDist * 0.85;
          e.preventDefault();
        }
      }
    });

    const resetJoy = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joyTouchId) {
          joyTouchId = null;
          touchMovement.active = false;
          touchMovement.x = 0;
          touchMovement.y = 0;
          touchMovement.sprint = false;
          joystickThumb.style.transform = `translate(0px, 0px)`;
        }
      }
    };
    window.add
