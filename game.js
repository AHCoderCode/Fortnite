/*
 SKYFALL ROYALE — Complete Overhaul Engine
 Features:
 1. 100% Reliable Raycast Hit Detection & Headshot Damage.
 2. Persistent Storage (Gold, Unlocked Weapons, Upgrades, Settings).
 3. Rivals-Style Shop & Upgrades (Primary, Secondary, Melee, Utility).
 4. Tactical Sliding ('C' key / Mobile Slide button) & Slide-Canceling.
 5. Multiple Game Modes (Battle Royale, Deathmatch FFA, 1v1 Duel, 3v3 Squads, Unlimited Sandbox).
 6. Secret Cheat Code System ("AHbest").
 7. Custom Crosshairs, FOV, FPS Recoil, and Touch Joystick.
*/
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;

  // ========================================================================
  // PERSISTENT PLAYER DATA & SAVE SYSTEM
  // ========================================================================
  const SAVE_KEY = "skyfall_save_v2";

  let PlayerData = {
    gold: 500,
    kills: 0,
    wins: 0,
    level: 1,
    xp: 0,
    unlockedWeapons: ["rifle", "shotgun", "pickaxe", "medkit"],
    upgrades: {
      damage: 0, // Level 0-5 (+12% each)
      fireRate: 0, // Level 0-5 (+12% each)
      armor: 0, // Level 0-5 (+20 Max Shield each)
      speed: 0, // Level 0-5 (+10% Move & Slide each)
      vampirism: 0, // Level 0-3 (+15 HP on kill)
      fastReload: 0, // Level 0-3 (-18% reload time)
    },
    loadout: {
      primary: "rifle",
      secondary: "shotgun",
      melee: "pickaxe",
      utility: "grenade",
      heal: "medkit",
    },
    settings: {
      sensitivity: 50,
      volume: 65,
      fov: 75,
      crossStyle: "cross",
      crossColor: "#38dfff",
      crossSize: 32,
    },
    godMode: false,
    selectedMode: "br",
  };

  function loadSave() {
    try {
      let data = localStorage.getItem(SAVE_KEY);
      if (data) {
        let parsed = JSON.parse(data);
        PlayerData = Object.assign(PlayerData, parsed);
      }
    } catch (_) {}
    updateGoldUI();
  }

  function saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(PlayerData));
    } catch (_) {}
    updateGoldUI();
  }

  function updateGoldUI() {
    if ($("#menuGold")) $("#menuGold").textContent = "💰 " + PlayerData.gold;
    if ($("#goldVal")) $("#goldVal").textContent = PlayerData.gold;
    if ($("#shopGoldDisplay")) $("#shopGoldDisplay").textContent = PlayerData.gold;
    if ($("#menuLevel")) $("#menuLevel").textContent = "LV. " + PlayerData.level;
  }

  // ========================================================================
  // WEAPONS DATABASE
  // ========================================================================
  const WEAPONS_DB = {
    // Primary
    rifle: {
      name: "ASSAULT RIFLE",
      slot: "primary",
      type: "rifle",
      dmg: 26,
      rate: 0.12,
      mag: 30,
      ammo: 180,
      range: 300,
      price: 0,
      icon: "▰",
      desc: "Balanced automatic rifle with steady recoil.",
    },
    heavy_ar: {
      name: "HEAVY AR",
      slot: "primary",
      type: "rifle",
      dmg: 42,
      rate: 0.22,
      mag: 24,
      ammo: 120,
      range: 360,
      price: 450,
      icon: "▰▰",
      desc: "High-impact rifle with heavy headshot multipliers.",
    },
    sniper: {
      name: "BOLT SNIPER",
      slot: "primary",
      type: "sniper",
      dmg: 115,
      rate: 1.25,
      mag: 1,
      ammo: 15,
      range: 700,
      price: 600,
      icon: "━",
      desc: "One-shot high-precision sniper rifle.",
    },
    plasma: {
      name: "PLASMA CANNON",
      slot: "primary",
      type: "plasma",
      dmg: 58,
      rate: 0.26,
      mag: 20,
      ammo: 80,
      range: 400,
      price: 1100,
      icon: "✹",
      desc: "Mythic rapid plasma projector.",
    },

    // Secondary
    shotgun: {
      name: "TACTICAL SHOTGUN",
      slot: "secondary",
      type: "shotgun",
      dmg: 80,
      rate: 0.75,
      mag: 8,
      ammo: 32,
      range: 65,
      price: 0,
      icon: "▮",
      desc: "Close-range spread burst weapon.",
    },
    pump: {
      name: "HAVOC PUMP",
      slot: "secondary",
      type: "shotgun",
      dmg: 110,
      rate: 1.05,
      mag: 5,
      ammo: 25,
      range: 50,
      price: 500,
      icon: "❚",
      desc: "Devastating close-range pump shotgun.",
    },
    deagle: {
      name: "HAND CANNON",
      slot: "secondary",
      type: "pistol",
      dmg: 60,
      rate: 0.42,
      mag: 7,
      ammo: 42,
      range: 240,
      price: 400,
      icon: "⌐",
      desc: "High-caliber precision sidearm.",
    },

    // Melee
    pickaxe: {
      name: "ENERGY PICKAXE",
      slot: "melee",
      type: "melee",
      dmg: 30,
      rate: 0.45,
      range: 5,
      price: 0,
      icon: "⛏",
      desc: "Harvests structures and materials efficiently.",
    },
    katana: {
      name: "CYBER KATANA",
      slot: "melee",
      type: "melee",
      dmg: 55,
      rate: 0.32,
      range: 6,
      price: 350,
      icon: "⚔",
      desc: "High-speed tactical melee blade.",
    },

    // Utility & Heals
    grenade: {
      name: "FRAG GRENADE",
      slot: "utility",
      type: "grenade",
      dmg: 100,
      rate: 0.9,
      uses: 3,
      price: 250,
      icon: "💣",
      desc: "High-explosive area blast.",
    },
    medkit: {
      name: "MEDKIT",
      slot: "heal",
      type: "heal",
      heal: 100,
      rate: 2.8,
      uses: 2,
      price: 150,
      icon: "✚",
      desc: "Restores full health over 3s.",
    },
    shield_pot: {
      name: "SHIELD POTION",
      slot: "heal",
      type: "shield",
      shield: 50,
      rate: 1.8,
      uses: 3,
      price: 120,
      icon: "🛡",
      desc: "Quickly restores 50 Shield points.",
    },
  };

  const UPGRADES_DB = {
    damage: { name: "Damage Amplifier", desc: "+12% damage to all weapons", cost: [200, 400, 700, 1100, 1800] },
    fireRate: { name: "Rapid Trigger", desc: "+12% faster fire rate", cost: [180, 380, 650, 1000, 1600] },
    armor: { name: "Nanotech Shield", desc: "+20 Max Shield capacity", cost: [150, 350, 600, 950, 1500] },
    speed: { name: "Kinetic Thrusters", desc: "+10% Move, Sprint & Slide speed", cost: [150, 300, 550, 850, 1350] },
    vampirism: { name: "Vampirism", desc: "+15 HP gained on elimination", cost: [300, 650, 1200] },
    fastReload: { name: "Quick Mag", desc: "-18% reload duration", cost: [200, 450, 800] },
  };

  // ========================================================================
  // CONFIG & ENGINE STATE
  // ========================================================================
  const CFG = {
    map: 2000,
    island: 920,
    gravity: 42,
    move: 28,
    sprint: 42,
    slideSpeed: 52,
    jump: 18,
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
    pitch: -0.08,
    firstPerson: false,
    mode: "br",
    storm: { phase: 0, radius: 1040, target: 1040, cx: 0, cz: 0, tx: 0, tz: 0, timer: 60, dps: 1 },
    audio: null,
  };

  let scene, camera, renderer, clock, player, terrain, stormWall, preview, raycaster, screenVec, MAT;

  const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  if (isTouchDevice) document.body.classList.add("is-touch");

  // ========================================================================
  // AUDIO SYNTHESIS
  // ========================================================================
  class AudioSys {
    constructor() {
      try {
        this.c = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.c.createGain();
        this.master.gain.value = 0.65;
        this.master.connect(this.c.destination);
      } catch (_) {
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
      g.gain.setValueAtTime(v * (PlayerData.settings.volume / 100), t);
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
      g.gain.setValueAtTime(v * (PlayerData.settings.volume / 100), this.c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.c.currentTime + d);
      s.connect(f).connect(g).connect(this.master);
      s.start();
    }
    play(k) {
      if (k === "rifle") {
        this.noise(0.08, 0.2, 2400);
        this.tone(190, 0.08, "sawtooth", 0.1, -90);
      } else if (k === "shotgun") {
        this.noise(0.25, 0.3, 850);
        this.tone(90, 0.18, "square", 0.15, -40);
      } else if (k === "sniper") {
        this.noise(0.38, 0.38, 1800);
        this.tone(280, 0.24, "sawtooth", 0.18, -190);
      } else if (k === "plasma") {
        this.tone(550, 0.12, "sine", 0.14, -300);
      } else if (k === "pickaxe" || k === "katana") {
        this.tone(320, 0.08, "triangle", 0.12, -100);
      } else if (k === "slide") {
        this.noise(0.4, 0.06, 350);
      } else if (k === "hit") {
        this.tone(980, 0.05, "sine", 0.1, 260);
      } else if (k === "crit") {
        this.tone(1450, 0.09, "triangle", 0.15, 450);
      } else if (k === "elim") {
        this.tone(480, 0.12, "triangle", 0.14, 220);
        setTimeout(() => this.tone(740, 0.24, "triangle", 0.14, 180), 110);
      } else if (k === "reload") {
        this.noise(0.08, 0.08, 2800);
      } else if (k === "step") {
        this.noise(0.04, 0.02, 450);
      } else if (k === "pickup" || k === "buy") {
        this.tone(850, 0.09, "sine", 0.1, 300);
      } else if (k === "cheat") {
        this.tone(500, 0.2, "triangle", 0.2, 200);
        setTimeout(() => this.tone(900, 0.3, "sine", 0.2, 400), 150);
      }
    }
  }

  // ========================================================================
  // PARTICLES & TRACERS
  // ========================================================================
  class ParticlePool {
    constructor() {
      this.pool = [];
      let g = new THREE.SphereGeometry(0.14, 4, 3);
      for (let i = 0; i < 120; i++) {
        let m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffd166 }));
        m.visible = false;
        scene.add(m);
        this.pool.push({ m, life: 0, v: new THREE.Vector3() });
      }
      this.tracers = [];
      let tg = new THREE.CylinderGeometry(0.04, 0.04, 1, 4);
      tg.rotateX(Math.PI / 2);
      for (let i = 0; i < 24; i++) {
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
      t.life = 0.08;
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
  // TERRAIN & PROCEDURAL GENERATION
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
      new THREE.MeshStandardMaterial({ color: 0x197ca8, transparent: true, opacity: 0.75, roughness: 0.2 }),
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
    let e = { type: "tree", mesh: root, parts: [root, crown], hp: 120, material: "wood", amount: 35, alive: true };
    root.userData = { owner: e, type: "resource" };
    crown.userData = { owner: e, type: "resource" };
    W.resources.push(e);
    addCollider(root, 3, 3, 10, "resource", e);
  }

  function makeRock(x, z) {
    let y = height(x, z);
    let m = geo("DodecahedronGeometry", [rnd(2.2, 4), 0], MAT.stone, [x, y + 2, z]);
    let e = { type: "rock", mesh: m, parts: [m], hp: 150, material: "stone", amount: 30, alive: true };
    m.userData = { owner: e, type: "resource" };
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
    spawnLoot(x + rnd(-5, 5), z + rnd(-5, 5), Math.random() < 0.4 ? "chest" : null);
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
  // 3D FLOATING HEALTH BAR SPRITES & CHARACTERS
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
    sprite.raycast = () => {}; // Never block bullet raycasts!
    return sprite;
  }

  function updateHealthBarSprite(sprite, hp, maxHp, shield, maxShield, name = "") {
    if (!sprite || !sprite.userData) return;
    let { canvas, ctx, texture } = sprite.userData;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(4, 10, 18, 0.85)";
    ctx.fillRect(4, 2, 120, 20);

    ctx.font = "bold 9px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText(name.slice(0, 12), 64, 10);

    let hpW = Math.max(0, (hp / maxHp) * 112);
    ctx.fillStyle = "#333333";
    ctx.fillRect(8, 12, 112, 4);
    ctx.fillStyle = "#38e060";
    ctx.fillRect(8, 12, hpW, 4);

    if (maxShield > 0) {
      let shW = Math.max(0, (shield / maxShield) * 112);
      ctx.fillStyle = "#2ba7ff";
      ctx.fillRect(8, 17, shW, 3);
    }
    texture.needsUpdate = true;
  }

  function makeCapsuleGeo(r, h, cap = 4, rad = 8) {
    if (THREE.CapsuleGeometry) return new THREE.CapsuleGeometry(r, h, cap, rad);
    return new THREE.CylinderGeometry(r, r, h + r * 2, rad);
  }

  function makeStylizedHumanoid(ownerEntity, themeColor = 0x24bde6) {
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

    // 1. Torso
    let torso = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.8, 0.9), suitMat);
    torso.position.y = 2.4;
    torso.castShadow = true;
    torso.userData = { owner: ownerEntity, type: "body" };
    group.add(torso);

    let vest = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.05), armorMat);
    vest.position.set(0, 2.4, 0);
    vest.castShadow = true;
    vest.userData = { owner: ownerEntity, type: "body" };
    group.add(vest);

    // 2. Head (Headshot Zone)
    let headGroup = new THREE.Group();
    headGroup.position.set(0, 3.8, 0);
    let head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), skinMat);
    head.castShadow = true;
    head.userData = { owner: ownerEntity, type: "head" };
    headGroup.add(head);

    let helmet = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 1.1), armorMat);
    helmet.position.set(0, 0.1, -0.05);
    helmet.castShadow = true;
    helmet.userData = { owner: ownerEntity, type: "head" };
    headGroup.add(helmet);

    let visor = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.35, 0.2), visorMat);
    visor.position.set(0, 0.1, 0.52);
    visor.userData = { owner: ownerEntity, type: "head" };
    headGroup.add(visor);
    group.add(headGroup);
    group.headMesh = headGroup;

    // 3. Backpack
    let pack = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, 0.5), MAT.metal);
    pack.position.set(0, 2.5, -0.65);
    pack.castShadow = true;
    pack.userData = { owner: ownerEntity, type: "body" };
    group.add(pack);

    // 4. Arms
    let rightArm = new THREE.Mesh(makeCapsuleGeo(0.22, 1.1, 4, 6), suitMat);
    rightArm.position.set(1.0, 2.3, 0.3);
    rightArm.rotation.x = -Math.PI / 4;
    rightArm.castShadow = true;
    rightArm.userData = { owner: ownerEntity, type: "body" };
    group.add(rightArm);

    let leftArm = new THREE.Mesh(makeCapsuleGeo(0.22, 1.1, 4, 6), suitMat);
    leftArm.position.set(-1.0, 2.3, 0.3);
    leftArm.rotation.x = -Math.PI / 4;
    leftArm.castShadow = true;
    leftArm.userData = { owner: ownerEntity, type: "body" };
    group.add(leftArm);

    // 5. Weapon Model in Hand
    let gun = new THREE.Group();
    gun.position.set(0.6, 2.2, 0.8);
    let gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.4, 1.8), armorMat);
    let gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 6), MAT.metal);
    gunBarrel.rotateX(Math.PI / 2);
    gunBarrel.position.set(0, 0.08, 1.1);
    gun.add(gunBody, gunBarrel);
    gun.castShadow = true;
    gun.userData = { owner: ownerEntity, type: "body" };
    gunBody.userData = { owner: ownerEntity, type: "body" };
    gunBarrel.userData = { owner: ownerEntity, type: "body" };
    group.add(gun);
    group.gunMesh = gun;

    // 6. Legs
    let leftLeg = new THREE.Mesh(makeCapsuleGeo(0.26, 1.4, 4, 6), armorMat);
    leftLeg.position.set(-0.45, 0.9, 0);
    leftLeg.castShadow = true;
    leftLeg.userData = { owner: ownerEntity, type: "body" };
    group.add(leftLeg);
    group.leftLeg = leftLeg;

    let rightLeg = new THREE.Mesh(makeCapsuleGeo(0.26, 1.4, 4, 6), armorMat);
    rightLeg.position.set(0.45, 0.9, 0);
    rightLeg.castShadow = true;
    rightLeg.userData = { owner: ownerEntity, type: "body" };
    group.add(rightLeg);
    group.rightLeg = rightLeg;

    // 7. Floating Overhead Health Bar
    let hpSprite = createHealthBarSprite();
    group.add(hpSprite);
    group.hpSprite = hpSprite;

    scene.add(group);
    return group;
  }

  // ========================================================================
  // LOOT SPAWNING
  // ========================================================================
  function spawnLoot(x, z, type = null) {
    type = type || ["rifle", "shotgun", "sniper", "medkit", "grenade"][Math.floor(Math.random() * 5)];
    let y = height(x, z) + 1.1;
    let def = WEAPONS_DB[type] || WEAPONS_DB.rifle;
    let m = geo(
      type === "chest" ? "BoxGeometry" : "OctahedronGeometry",
      type === "chest" ? [3, 2, 2] : [1.1, 0],
      new THREE.MeshStandardMaterial({ color: 0xffd448, emissive: 0x7a5200, emissiveIntensity: 0.6 }),
      [x, y, z],
    );
    let e = { type, mesh: m, def, alive: true };
    m.userData = { owner: e, type: "loot" };
    W.loot.push(e);
    return e;
  }

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

    div.style.left = `${x + rnd(-8, 8)}px`;
    div.style.top = `${y + rnd(-8, 8)}px`;
    container.appendChild(div);
    setTimeout(() => div.remove(), 850);
  }

  // ========================================================================
  // PLAYER CLASS
  // ========================================================================
  class Player {
    constructor() {
      this.health = 100;
      this.maxShield = 100 + (PlayerData.upgrades.armor || 0) * 20;
      this.shield = this.maxShield;
      this.mesh = makeStylizedHumanoid(this, 0x24bde6);
      this.mesh.position.set(CFG.spawn[0], height(CFG.spawn[0], CFG.spawn[1]) + 0.1, CFG.spawn[1]);
      this.vel = new THREE.Vector3();
      this.lastDamage = -99;
      this.grounded = false;
      this.radius = 1.3;
      this.materials = { wood: 150, stone: 50, metal: 0 };

      // 5-Slot Loadout
      this.inventory = [
        Object.assign({ owned: true }, WEAPONS_DB[PlayerData.loadout.primary] || WEAPONS_DB.rifle),
        Object.assign({ owned: true }, WEAPONS_DB[PlayerData.loadout.secondary] || WEAPONS_DB.shotgun),
        Object.assign({ owned: true }, WEAPONS_DB[PlayerData.loadout.melee] || WEAPONS_DB.pickaxe),
        Object.assign({ owned: true }, WEAPONS_DB[PlayerData.loadout.utility] || WEAPONS_DB.grenade),
        Object.assign({ owned: true }, WEAPONS_DB[PlayerData.loadout.heal] || WEAPONS_DB.medkit),
      ];
      this.inventory.forEach((w) => {
        if (w.mag) w.clip = w.mag;
      });

      this.slot = 0;
      this.cool = 0;
      this.reloading = 0;
      this.healing = 0;
      this.step = 0;
      this.walkCycle = 0;

      // Sliding physics
      this.sliding = false;
      this.slideTimer = 0;
      this.slideDir = new THREE.Vector3();
    }

    get weapon() {
      return this.inventory[this.slot];
    }

    startSlide() {
      if (this.sliding || !this.grounded) return;
      let f = new THREE.Vector3(-Math.sin(W.yaw), 0, -Math.cos(W.yaw)).normalize();
      this.sliding = true;
      this.slideTimer = 0.8;
      this.slideDir.copy(f);
      W.audio.play("slide");
      $("#slideIndicator").classList.remove("hidden");
    }

    stopSlide() {
      this.sliding = false;
      this.slideTimer = 0;
      $("#slideIndicator").classList.add("hidden");
    }

    damage(n, from = "Storm") {
      if (PlayerData.godMode) return;
      if (this.health <= 0) return;
      this.lastDamage = W.time;
      let s = Math.min(this.shield, n
