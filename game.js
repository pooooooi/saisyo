import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

const canvas = document.getElementById("game");
const statusEl = document.getElementById("status");
const scoreEl = document.getElementById("score");
const difficultyEl = document.getElementById("difficulty");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd4ff);
scene.fog = new THREE.Fog(0x8fd4ff, 40, 220);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 6, 12);

const hemi = new THREE.HemisphereLight(0xffffff, 0x3d7a2b, 0.9);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff3dd, 1.1);
sun.position.set(30, 50, 15);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -70;
sun.shadow.camera.right = 70;
sun.shadow.camera.top = 70;
sun.shadow.camera.bottom = -70;
scene.add(sun);

const floorMat = new THREE.MeshStandardMaterial({ color: 0x4ea33a, roughness: 0.95 });
const wallMat = new THREE.MeshStandardMaterial({ color: 0xb06b3d, roughness: 0.85 });
const wallKickMat = new THREE.MeshStandardMaterial({ color: 0x2d6ccf, roughness: 0.55 });
const playerMat = new THREE.MeshStandardMaterial({ color: 0xd32727, roughness: 0.55 });
const starMat = new THREE.MeshStandardMaterial({ color: 0xffd035, emissive: 0x5a4608, emissiveIntensity: 0.35 });
const enemyMat = new THREE.MeshStandardMaterial({ color: 0x683518, roughness: 0.8 });
const goalMat = new THREE.MeshStandardMaterial({ color: 0x26cf52, roughness: 0.45, emissive: 0x10481f, emissiveIntensity: 0.25 });
const turretMat = new THREE.MeshStandardMaterial({ color: 0x4f2a8d, roughness: 0.55, emissive: 0x1d1038, emissiveIntensity: 0.3 });
const orbMat = new THREE.MeshStandardMaterial({ color: 0x7bd7ff, roughness: 0.25, emissive: 0x2e7da3, emissiveIntensity: 0.65 });

const colliders = [];
const stars = [];
const enemies = [];
const movingPlatforms = [];
const turrets = [];
const enemyOrbs = [];
const clearParticles = [];
const tempBoxA = new THREE.Box3();
const tempBoxB = new THREE.Box3();
const tempVecA = new THREE.Vector3();
const tempVecB = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const STAR_COUNT = 5;
const STAR_MIN_DISTANCE = 7;
const STAR_MAX_ZONE_Y = 12.5;
const ORB_LIFETIME = 6.5;
const CLEAR_PARTICLE_LIFETIME = 1.35;
const DIFFICULTY_SETTINGS = {
  easy: {
    label: "Easy",
    lives: 5,
    starGoal: 3,
    enemySpeedScale: 0.78,
    orbSpeed: 11,
    turretCooldownMin: 2.2,
    turretCooldownMax: 3.2,
    orbBurst: 1,
    moveSpeedScale: 1.05,
    jumpScale: 1.05,
  },
  normal: {
    label: "Normal",
    lives: 3,
    starGoal: 5,
    enemySpeedScale: 1.0,
    orbSpeed: 15,
    turretCooldownMin: 1.55,
    turretCooldownMax: 2.6,
    orbBurst: 1,
    moveSpeedScale: 1.0,
    jumpScale: 1.0,
  },
  hard: {
    label: "Hard",
    lives: 1,
    starGoal: 5,
    enemySpeedScale: 1.75,
    orbSpeed: 26,
    turretCooldownMin: 0.55,
    turretCooldownMax: 1.0,
    orbBurst: 2,
    moveSpeedScale: 1.0,
    jumpScale: 1.0,
  },
};

function overlapsStrict(a, b, eps = 0.0001) {
  return (
    a.max.x > b.min.x + eps &&
    a.min.x < b.max.x - eps &&
    a.max.y > b.min.y + eps &&
    a.min.y < b.max.y - eps &&
    a.max.z > b.min.z + eps &&
    a.min.z < b.max.z - eps
  );
}

function makeBox(w, h, d, x, y, z, material, collider = true, colliderMeta = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  scene.add(mesh);
  if (collider) {
    const box = new THREE.Box3().setFromObject(mesh);
    colliders.push({ mesh, box, ...(colliderMeta || {}) });
  }
  return mesh;
}

function addMovingPlatform(x, y, z, w, d, axis, amplitude, speed, phase) {
  makeBox(w, 1.6, d, x, y, z, floorMat, true, { moving: true });
  const collider = colliders[colliders.length - 1];
  movingPlatforms.push({
    mesh: collider.mesh,
    collider,
    origin: new THREE.Vector3(x, y, z),
    axis,
    amplitude,
    speed,
    phase,
    delta: new THREE.Vector3(),
  });
  return collider.mesh;
}

function spawnEnemyOrb(origin, target, speed) {
  const dir = tempVecB.copy(target).sub(origin);
  dir.y *= 0.45;
  if (dir.lengthSq() < 0.001) dir.set(1, 0, 0);
  dir.normalize();
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.65, 14, 14), orbMat);
  orb.position.copy(origin);
  orb.castShadow = true;
  scene.add(orb);
  enemyOrbs.push({
    mesh: orb,
    velocity: dir.multiplyScalar(speed).clone(),
    life: ORB_LIFETIME,
  });
}

function spawnClearBurst(center) {
  for (let i = 0; i < 22; i++) {
    const c = new THREE.Color().setHSL(Math.random(), 0.85, 0.58);
    const mat = new THREE.MeshStandardMaterial({
      color: c,
      emissive: c.clone().multiplyScalar(0.35),
      roughness: 0.3,
    });
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), mat);
    p.position.copy(center);
    p.castShadow = false;
    scene.add(p);
    const dir = new THREE.Vector3(
      randRange(-1, 1),
      randRange(0.35, 1.25),
      randRange(-1, 1),
    ).normalize();
    const speed = randRange(5, 11);
    clearParticles.push({
      mesh: p,
      velocity: dir.multiplyScalar(speed),
      life: CLEAR_PARTICLE_LIFETIME,
    });
  }
}

function randomTurretCooldown() {
  return randRange(state.turretCooldownMin, state.turretCooldownMax);
}

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function placeStarsRandomly(spawnZones) {
  const placed = [];

  for (let i = 0; i < stars.length; i++) {
    let best = null;

    for (let attempt = 0; attempt < 80; attempt++) {
      const zone = spawnZones[Math.floor(Math.random() * spawnZones.length)];
      const candidate = new THREE.Vector3(
        randRange(zone.minX, zone.maxX),
        zone.y,
        randRange(zone.minZ, zone.maxZ),
      );

      let tooClose = false;
      for (const p of placed) {
        if (candidate.distanceTo(p) < STAR_MIN_DISTANCE) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      best = candidate;
      break;
    }

    if (!best) {
      const fallback = spawnZones[i % spawnZones.length];
      best = new THREE.Vector3(
        (fallback.minX + fallback.maxX) * 0.5,
        fallback.y,
        (fallback.minZ + fallback.maxZ) * 0.5,
      );
    }

    placed.push(best);
    stars[i].mesh.position.copy(best);
    stars[i].baseY = best.y;
    stars[i].taken = false;
    stars[i].mesh.visible = true;
  }
}

function buildWorld() {
  makeBox(220, 2, 120, 0, -1, 0, floorMat, true);

  const starSpawnZones = [];
  const addStarZoneForPlatform = (x, y, z, w, d) => {
    if (y > STAR_MAX_ZONE_Y) return;
    starSpawnZones.push({
      minX: x - Math.max(1, w * 0.32),
      maxX: x + Math.max(1, w * 0.32),
      minZ: z - Math.max(1, d * 0.32),
      maxZ: z + Math.max(1, d * 0.32),
      y: y + 1.2,
    });
  };

  for (let i = 0; i < 10; i++) {
    const x = 15 + i * 14;
    const y = i % 2 === 0 ? 1.5 : 4.5;
    const z = i % 2 === 0 ? -10 : 10;
    makeBox(8, 2, 8, x, y, z, wallMat, true);
    starSpawnZones.push({
      minX: x - 2.5,
      maxX: x + 2.5,
      minZ: z - 2.5,
      maxZ: z + 2.5,
      y: y + 2.2,
    });
  }

  makeBox(12, 2, 12, 35, 8, 0, wallMat, true);
  makeBox(10, 2, 10, 55, 12, 8, wallMat, true);
  makeBox(18, 2, 18, 84, 18, -6, wallMat, true);
  starSpawnZones.push({ minX: 30, maxX: 40, minZ: -5, maxZ: 5, y: 9.2 });

  // Athletic floating path (fixed jump pads).
  const floatPads = [
    { x: 16, y: 4.5, z: -18, w: 8, d: 8 },
    { x: 28, y: 6.5, z: -8, w: 8, d: 8 },
    { x: 40, y: 8.5, z: 2, w: 8, d: 8 },
    { x: 54, y: 10.5, z: -4, w: 8, d: 8 },
    { x: 68, y: 12.5, z: 8, w: 8, d: 8 },
    { x: 84, y: 14.5, z: 0, w: 9, d: 9 },
    { x: 102, y: 13.0, z: -10, w: 9, d: 9 },
    { x: 118, y: 11.5, z: 2, w: 10, d: 10 },
    { x: 132, y: 9.5, z: 10, w: 10, d: 10 },
  ];
  for (const p of floatPads) {
    makeBox(p.w, 1.8, p.d, p.x, p.y, p.z, wallMat, true);
    addStarZoneForPlatform(p.x, p.y, p.z, p.w, p.d);
  }

  // Athletic moving platforms (rideable).
  const movers = [
    { x: 22, y: 8.5, z: 14, w: 7, d: 7, axis: "x", amp: 7, speed: 0.95, phase: 0.0 },
    { x: 46, y: 12.5, z: 16, w: 7, d: 7, axis: "z", amp: 9, speed: 1.15, phase: 1.2 },
    { x: 72, y: 15.0, z: -16, w: 7, d: 7, axis: "x", amp: 8, speed: 1.35, phase: 0.5 },
    { x: 96, y: 12.0, z: 14, w: 7, d: 7, axis: "z", amp: 8, speed: 1.05, phase: 2.3 },
    { x: 124, y: 10.5, z: -6, w: 8, d: 8, axis: "x", amp: 10, speed: 0.85, phase: 1.9 },
  ];
  for (const m of movers) {
    addMovingPlatform(m.x, m.y, m.z, m.w, m.d, m.axis, m.amp, m.speed, m.phase);
    addStarZoneForPlatform(m.x, m.y, m.z, m.w, m.d);
  }

  makeBox(6, 10, 6, 26, 4, -28, wallMat, true);
  makeBox(6, 14, 6, 68, 6, 30, wallMat, true);
  makeBox(8, 20, 8, 118, 9, -24, wallMat, true);
  makeBox(2, 14, 12, 18, 6, 0, wallKickMat, true, { wallKick: true });
  makeBox(2, 18, 12, 52, 8, 0, wallKickMat, true, { wallKick: true });

  for (let i = 0; i < STAR_COUNT; i++) {
    const star = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), starMat);
    star.position.set(0, 2, 0);
    star.castShadow = true;
    scene.add(star);
    stars.push({ mesh: star, taken: false, baseY: 2 });
  }
  placeStarsRandomly(starSpawnZones);

  const enemyPads = [floatPads[1], floatPads[2], floatPads[4], floatPads[6], floatPads[7]];
  for (let i = 0; i < enemyPads.length; i++) {
    const pad = enemyPads[i];
    const enemy = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.2), enemyMat);
    const x = pad.x;
    const z = pad.z;
    enemy.position.set(x, pad.y + 2.0, z);
    enemy.castShadow = true;
    scene.add(enemy);
    const patrolMargin = 1.8;
    enemies.push({
      mesh: enemy,
      spawnX: x,
      spawnY: pad.y + 2.0,
      spawnZ: z,
      minX: x - Math.max(1.5, pad.w * 0.5 - patrolMargin),
      maxX: x + Math.max(1.5, pad.w * 0.5 - patrolMargin),
      dir: i % 2 === 0 ? 1 : -1,
      vy: 0,
      onGround: true,
      jumpCooldown: randRange(0.7, 1.8),
      alive: true,
    });
  }

  const turretSpawns = [
    { x: 32, y: 6.8, z: -18 },
    { x: 74, y: 11.8, z: 18 },
    { x: 116, y: 9.8, z: -14 },
  ];
  for (let i = 0; i < turretSpawns.length; i++) {
    const t = turretSpawns[i];
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.8, 16, 16), turretMat);
    body.position.set(t.x, t.y, t.z);
    body.castShadow = true;
    scene.add(body);
    turrets.push({
      mesh: body,
      cooldown: 1.2 + i * 0.45,
      hoverPhase: i * 1.7,
      baseY: t.y,
    });
  }

  const goalPole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 12, 12), new THREE.MeshStandardMaterial({ color: 0xd9d9d9 }));
  goalPole.position.set(150, 5, 0);
  goalPole.castShadow = true;
  scene.add(goalPole);

  const goalFlag = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 0.4), goalMat);
  goalFlag.position.set(151.8, 8.5, 0);
  goalFlag.castShadow = true;
  scene.add(goalFlag);

  const goalArea = new THREE.Box3(
    new THREE.Vector3(149.5, 1.5, -1.6),
    new THREE.Vector3(152.6, 9.8, 1.6),
  );

  return { goalArea, goalFlag, starSpawnZones };
}

const world = buildWorld();

const player = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, 1.5, 4, 8), playerMat);
player.position.set(0, 1.5, 0);
player.castShadow = true;
scene.add(player);

const state = {
  difficulty: "normal",
  velocity: new THREE.Vector3(),
  onGround: false,
  groundCollider: null,
  jumpsRemaining: 2,
  wallKickTimer: 0,
  wallNormal: new THREE.Vector3(),
  lives: 3,
  score: 0,
  stars: 0,
  won: false,
  gameOver: false,
  deadCooldown: 0,
  clearTimer: 0,
  clearBurstCooldown: 0,
  livesMax: 3,
  starGoal: 5,
  enemySpeedScale: 1.0,
  orbSpeed: 15,
  turretCooldownMin: 1.55,
  turretCooldownMax: 2.6,
  orbBurst: 1,
  moveSpeedScale: 1.0,
  jumpScale: 1.0,
};

const input = {
  forward: false,
  back: false,
  left: false,
  right: false,
  jump: false,
  jumpPressed: false,
  sprint: false,
};

const cameraControl = {
  yaw: -0.5,
  pitch: 0.42,
  distance: 12,
  dragging: false,
  prevX: 0,
  prevY: 0,
};

function updateScore() {
  scoreEl.textContent = `SCORE: ${state.score} | LIFE: ${state.lives} | STARS: ${state.stars}/${state.starGoal}`;
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

function applyDifficulty(level, resetGame = true) {
  const next = DIFFICULTY_SETTINGS[level] ? level : "normal";
  const cfg = DIFFICULTY_SETTINGS[next];
  state.difficulty = next;
  state.livesMax = cfg.lives;
  state.starGoal = Math.min(cfg.starGoal, STAR_COUNT);
  state.enemySpeedScale = cfg.enemySpeedScale;
  state.orbSpeed = cfg.orbSpeed;
  state.turretCooldownMin = cfg.turretCooldownMin;
  state.turretCooldownMax = cfg.turretCooldownMax;
  state.orbBurst = cfg.orbBurst;
  state.moveSpeedScale = cfg.moveSpeedScale;
  state.jumpScale = cfg.jumpScale;
  if (difficultyEl && difficultyEl.value !== next) {
    difficultyEl.value = next;
  }
  if (resetGame) {
    resetPlayer(true);
  } else {
    updateScore();
    setStatus(`Difficulty: ${cfg.label} | Collect ${state.starGoal} stars and reach the goal!`);
  }
}

function resetPlayer(resetAll) {
  player.position.set(0, 1.5, 0);
  state.velocity.set(0, 0, 0);
  state.onGround = false;
  state.groundCollider = null;
  state.jumpsRemaining = 2;
  state.wallKickTimer = 0;
  state.wallNormal.set(0, 0, 0);
  state.won = false;
  state.gameOver = false;
  state.deadCooldown = 0;
  state.clearTimer = 0;
  state.clearBurstCooldown = 0;

  if (resetAll) {
    state.lives = state.livesMax;
    state.score = 0;
    state.stars = 0;
    placeStarsRandomly(world.starSpawnZones);
    for (const enemy of enemies) {
      enemy.alive = true;
      enemy.mesh.visible = true;
      enemy.mesh.position.set(enemy.spawnX, enemy.spawnY, enemy.spawnZ);
      enemy.vy = 0;
      enemy.onGround = true;
      enemy.jumpCooldown = randRange(0.7, 1.8);
    }
    for (const orb of enemyOrbs) {
      scene.remove(orb.mesh);
    }
    enemyOrbs.length = 0;
    for (const p of clearParticles) {
      scene.remove(p.mesh);
    }
    clearParticles.length = 0;
    for (let i = 0; i < turrets.length; i++) {
      turrets[i].cooldown = randomTurretCooldown() + i * 0.2;
    }
    setStatus(`Collect ${state.starGoal} stars and reach the goal!`);
  } else {
    setStatus(state.lives > 0 ? "Miss! Keep going" : "Game Over! Press R to retry");
  }
  updateScore();
}

function playerAABB(pos = player.position) {
  tempBoxA.min.set(pos.x - 0.75, pos.y - 1.5, pos.z - 0.75);
  tempBoxA.max.set(pos.x + 0.75, pos.y + 1.6, pos.z + 0.75);
  return tempBoxA;
}

function solveAxis(axis, delta) {
  if (delta === 0) return;

  player.position[axis] += delta;
  const box = playerAABB();

  for (const c of colliders) {
    tempBoxB.copy(c.box);
    if (!overlapsStrict(box, tempBoxB)) continue;

    if (axis === "y") {
      if (delta > 0) {
        player.position.y = tempBoxB.min.y - 1.6;
      } else {
        player.position.y = tempBoxB.max.y + 1.5;
        state.onGround = true;
        state.groundCollider = c;
      }
      state.velocity.y = 0;
    } else if (axis === "x") {
      player.position.x = delta > 0 ? tempBoxB.min.x - 0.75 : tempBoxB.max.x + 0.75;
      state.velocity.x = 0;
      if (!state.onGround && c.wallKick) {
        state.wallKickTimer = 0.16;
        state.wallNormal.set(delta > 0 ? -1 : 1, 0, 0);
      }
    } else {
      player.position.z = delta > 0 ? tempBoxB.min.z - 0.75 : tempBoxB.max.z + 0.75;
      state.velocity.z = 0;
      if (!state.onGround && c.wallKick) {
        state.wallKickTimer = 0.16;
        state.wallNormal.set(0, 0, delta > 0 ? -1 : 1);
      }
    }

    playerAABB();
  }
}

function loseLife(hitMessage) {
  if (state.gameOver || state.deadCooldown > 0) return;
  state.lives = Math.max(0, state.lives - 1);
  state.deadCooldown = 0.75;
  if (state.lives <= 0) {
    setStatus("Game Over! Press R to retry");
  } else {
    setStatus(hitMessage);
  }
  updateScore();
}

function updatePlayer(dt) {
  if (state.won || state.gameOver) return;

  if (state.deadCooldown > 0) {
    state.deadCooldown -= dt;
    if (state.deadCooldown <= 0) {
      if (state.lives > 0) {
        resetPlayer(false);
      } else {
        state.gameOver = true;
        setStatus("Game Over! Press R to retry");
      }
    }
    return;
  }

  state.wallKickTimer = Math.max(0, state.wallKickTimer - dt);

  const moveAxis = new THREE.Vector2(
    Number(input.right) - Number(input.left),
    Number(input.forward) - Number(input.back),
  );
  if (moveAxis.lengthSq() > 0) moveAxis.normalize();

  const speed = (input.sprint ? 17 : 11) * state.moveSpeedScale;
  const yaw = cameraControl.yaw;
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const right = new THREE.Vector3().crossVectors(forward, up).normalize().multiplyScalar(-1);

  const desired = new THREE.Vector3()
    .addScaledVector(forward, moveAxis.y)
    .addScaledVector(right, moveAxis.x);

  if (desired.lengthSq() > 0) {
    desired.normalize().multiplyScalar(speed);
    state.velocity.x = THREE.MathUtils.lerp(state.velocity.x, desired.x, 0.15);
    state.velocity.z = THREE.MathUtils.lerp(state.velocity.z, desired.z, 0.15);
    const look = player.position.clone().add(desired);
    player.lookAt(look.x, player.position.y, look.z);
  } else {
    state.velocity.x *= 0.82;
    state.velocity.z *= 0.82;
  }

  if (state.onGround) {
    state.jumpsRemaining = 2;
  }

  if (input.jumpPressed) {
    if (state.onGround && state.jumpsRemaining > 0) {
      state.velocity.y = 12.5 * state.jumpScale;
      state.onGround = false;
      state.jumpsRemaining -= 1;
    } else if (state.wallKickTimer > 0) {
      state.velocity.y = 13.2 * state.jumpScale;
      state.velocity.x = state.wallNormal.x * 10;
      state.velocity.z = state.wallNormal.z * 10;
      state.wallKickTimer = 0;
      state.jumpsRemaining = Math.max(state.jumpsRemaining, 1);
      setStatus("Wall kick!");
    } else if (state.jumpsRemaining > 0) {
      state.velocity.y = 12.5 * state.jumpScale;
      state.onGround = false;
      state.jumpsRemaining -= 1;
    }
  }
  input.jumpPressed = false;

  state.velocity.y -= 30 * dt;
  state.onGround = false;
  state.groundCollider = null;

  solveAxis("x", state.velocity.x * dt);
  solveAxis("z", state.velocity.z * dt);
  solveAxis("y", state.velocity.y * dt);

  if (player.position.y < -20) {
    loseLife("Fell off!");
  }
}

function updateStars(t) {
  for (const star of stars) {
    if (star.taken) continue;

    star.mesh.rotation.y += 0.03;
    star.mesh.position.y = star.baseY + Math.sin(t * 2.5 + star.mesh.position.x * 0.1) * 0.35;

    if (star.mesh.position.distanceTo(player.position) < 2) {
      star.taken = true;
      star.mesh.visible = false;
      state.stars += 1;
      state.score += 100;
      setStatus(state.stars < state.starGoal ? "Star collected!" : "All stars collected! Head to the goal!");
      updateScore();
    }
  }
}

function updateMovingPlatforms(t) {
  for (const p of movingPlatforms) {
    const prev = tempVecA.copy(p.mesh.position);
    const shift = Math.sin(t * p.speed + p.phase) * p.amplitude;
    if (p.axis === "x") {
      p.mesh.position.x = p.origin.x + shift;
      p.mesh.position.z = p.origin.z;
    } else {
      p.mesh.position.z = p.origin.z + shift;
      p.mesh.position.x = p.origin.x;
    }
    p.delta.copy(p.mesh.position).sub(prev);
    p.collider.box.setFromObject(p.mesh);
  }

  if (!state.onGround || !state.groundCollider) return;
  for (const p of movingPlatforms) {
    if (p.collider !== state.groundCollider) continue;
    player.position.add(p.delta);
    break;
  }
}

function updateEnemies(dt) {
  if (state.won || state.gameOver || state.deadCooldown > 0) return;

  for (const enemy of enemies) {
    if (!enemy.alive) continue;

    enemy.mesh.position.x += enemy.dir * dt * 4.8 * state.enemySpeedScale;
    if (enemy.mesh.position.x < enemy.minX || enemy.mesh.position.x > enemy.maxX) {
      enemy.dir *= -1;
      enemy.mesh.position.x = THREE.MathUtils.clamp(enemy.mesh.position.x, enemy.minX, enemy.maxX);
    }
    enemy.mesh.rotation.y += dt * 3 * enemy.dir;

    enemy.jumpCooldown -= dt;
    if (enemy.onGround && enemy.jumpCooldown <= 0) {
      enemy.vy = randRange(6.8, 9.2);
      enemy.onGround = false;
      enemy.jumpCooldown = randRange(0.9, 2.4);
    }
    enemy.vy -= 26 * dt;
    enemy.mesh.position.y += enemy.vy * dt;
    if (enemy.mesh.position.y <= enemy.spawnY) {
      enemy.mesh.position.y = enemy.spawnY;
      enemy.vy = 0;
      enemy.onGround = true;
    }

    const d = enemy.mesh.position.distanceTo(player.position);
    if (d > 1.8) continue;

    const stomp = state.velocity.y < -3 && player.position.y > enemy.mesh.position.y + 1;
    if (stomp) {
      enemy.alive = false;
      enemy.mesh.visible = false;
      state.velocity.y = 9;
      state.score += 150;
      setStatus("Enemy stomped!");
      updateScore();
    } else {
      loseLife("Hit by enemy!");
    }
  }
}

function updateTurretsAndOrbs(dt, t) {
  if (state.won || state.gameOver || state.deadCooldown > 0) return;

  for (const turret of turrets) {
    turret.mesh.position.y = turret.baseY + Math.sin(t * 2 + turret.hoverPhase) * 0.42;
    turret.mesh.rotation.y += dt * 1.9;
    turret.cooldown -= dt;
    if (turret.cooldown > 0) continue;

    const d = turret.mesh.position.distanceTo(player.position);
    if (d < 68) {
      const origin = turret.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0));
      const aimBase = player.position.clone().add(new THREE.Vector3(0, 1.0, 0));
      const side = new THREE.Vector3(Math.cos(turret.mesh.rotation.y), 0, -Math.sin(turret.mesh.rotation.y));
      for (let j = 0; j < state.orbBurst; j++) {
        const spread = (j - (state.orbBurst - 1) * 0.5) * 1.4;
        const target = aimBase.clone().addScaledVector(side, spread);
        spawnEnemyOrb(origin, target, state.orbSpeed);
      }
    }
    turret.cooldown = randomTurretCooldown();
  }

  for (let i = enemyOrbs.length - 1; i >= 0; i--) {
    const orb = enemyOrbs[i];
    orb.mesh.position.addScaledVector(orb.velocity, dt);
    orb.mesh.rotation.y += dt * 5;
    orb.life -= dt;

    if (orb.life <= 0) {
      scene.remove(orb.mesh);
      enemyOrbs.splice(i, 1);
      continue;
    }

    if (orb.mesh.position.distanceTo(player.position) < 1.35) {
      loseLife("Hit by floating orb!");
      scene.remove(orb.mesh);
      enemyOrbs.splice(i, 1);
      continue;
    }

    const p = orb.mesh.position;
    if (Math.abs(p.x) > 210 || p.y < -12 || p.y > 60 || Math.abs(p.z) > 120) {
      scene.remove(orb.mesh);
      enemyOrbs.splice(i, 1);
    }
  }
}

function updateGoal(t) {
  world.goalFlag.position.y = 8.1 + Math.sin(t * 2.3) * 0.25;
  if (state.won || state.gameOver || state.stars < state.starGoal || state.deadCooldown > 0) return;

  if (world.goalArea.containsPoint(player.position)) {
    state.won = true;
    state.clearTimer = 0;
    state.clearBurstCooldown = 0;
    state.score += 1000;
    setStatus("Course Clear! Press R to replay");
    updateScore();
  }
}

function updateClearEffects(dt) {
  if (!state.won) return;

  state.clearTimer += dt;
  state.clearBurstCooldown -= dt;

  if (state.clearBurstCooldown <= 0) {
    const center = world.goalFlag.position.clone().add(new THREE.Vector3(-1.4, 0.8, 0));
    spawnClearBurst(center);
    state.clearBurstCooldown = 0.24;
  }

  for (let i = clearParticles.length - 1; i >= 0; i--) {
    const p = clearParticles[i];
    p.life -= dt;
    p.velocity.y -= 9.8 * dt * 0.65;
    p.mesh.position.addScaledVector(p.velocity, dt);
    p.mesh.scale.setScalar(Math.max(0.05, p.life / CLEAR_PARTICLE_LIFETIME));
    if (p.life <= 0) {
      scene.remove(p.mesh);
      p.mesh.material.dispose();
      clearParticles.splice(i, 1);
    }
  }
}

function updateCamera(dt) {
  if (state.won) {
    const focus = world.goalFlag.position.clone().add(new THREE.Vector3(-1.0, 1.6, 0));
    const angle = state.clearTimer * 0.9;
    const radius = 10;
    const desired = new THREE.Vector3(
      focus.x + Math.cos(angle) * radius,
      focus.y + 3.2 + Math.sin(state.clearTimer * 2.0) * 0.7,
      focus.z + Math.sin(angle) * radius,
    );
    camera.position.lerp(desired, 1 - Math.exp(-5.5 * dt));
    camera.lookAt(focus);
    return;
  }

  const target = player.position.clone().add(new THREE.Vector3(0, 2.6, 0));
  const offset = new THREE.Vector3(
    Math.sin(cameraControl.yaw) * Math.cos(cameraControl.pitch),
    Math.sin(cameraControl.pitch),
    Math.cos(cameraControl.yaw) * Math.cos(cameraControl.pitch),
  ).multiplyScalar(cameraControl.distance);
  const desired = target.clone().add(offset);

  camera.position.lerp(desired, 1 - Math.exp(-7 * dt));
  camera.lookAt(target);
}

const clock = new THREE.Clock();
function animate() {
  const dt = Math.min(clock.getDelta(), 1 / 30);
  const t = clock.elapsedTime;

  updateMovingPlatforms(t);
  updatePlayer(dt);
  updateStars(t);
  updateEnemies(dt);
  updateTurretsAndOrbs(dt, t);
  updateGoal(t);
  updateClearEffects(dt);
  updateCamera(dt);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyW" || e.code === "ArrowDown") input.forward = true;
  if (e.code === "KeyS" || e.code === "ArrowUp") input.back = true;
  if (e.code === "KeyA" || e.code === "ArrowLeft") input.left = true;
  if (e.code === "KeyD" || e.code === "ArrowRight") input.right = true;
  if (e.code === "Space") {
    if (!e.repeat) {
      input.jump = true;
      input.jumpPressed = true;
    }
    e.preventDefault();
  }
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") input.sprint = true;
  if (e.code === "KeyR") resetPlayer(true);
});

window.addEventListener("keyup", (e) => {
  if (e.code === "KeyW" || e.code === "ArrowDown") input.forward = false;
  if (e.code === "KeyS" || e.code === "ArrowUp") input.back = false;
  if (e.code === "KeyA" || e.code === "ArrowLeft") input.left = false;
  if (e.code === "KeyD" || e.code === "ArrowRight") input.right = false;
  if (e.code === "Space") input.jump = false;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") input.sprint = false;
});

if (difficultyEl) {
  difficultyEl.addEventListener("change", (e) => {
    const level = e.target.value;
    applyDifficulty(level, true);
  });
}

canvas.addEventListener("mousedown", (e) => {
  cameraControl.dragging = true;
  cameraControl.prevX = e.clientX;
  cameraControl.prevY = e.clientY;
});

window.addEventListener("mouseup", () => {
  cameraControl.dragging = false;
});

window.addEventListener("mousemove", (e) => {
  if (!cameraControl.dragging) return;

  const dx = e.clientX - cameraControl.prevX;
  const dy = e.clientY - cameraControl.prevY;
  cameraControl.prevX = e.clientX;
  cameraControl.prevY = e.clientY;

  cameraControl.yaw -= dx * 0.0055;
  cameraControl.pitch = THREE.MathUtils.clamp(cameraControl.pitch - dy * 0.0035, 0.1, 1.1);
});

canvas.addEventListener("wheel", (e) => {
  cameraControl.distance = THREE.MathUtils.clamp(cameraControl.distance + e.deltaY * 0.01, 5, 20);
});

applyDifficulty("normal", false);
resetPlayer(true);
animate();
