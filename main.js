const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const hudDistance = document.getElementById('distance');
const hudSpeed = document.getElementById('speed');
const hudCruise = document.getElementById('cruise');

const config = {
  segmentLength: 80,
  totalSegments: 1200,
  roadWidth: 36,
  fieldOfView: 80,
  drawDistance: 220,
  cameraHeight: 950,
  cameraDistance: 1.6,
  maxSpeed: 62,
  cruiseSpeed: 32,
  acceleration: 20,
  brake: 28,
  friction: 16,
  steerSpeed: 1.9,
  steerReturn: 2.8,
  leanSpeed: 3.8,
  leanReturn: 4.5,
  leanLimit: 0.25,
  curveDrift: 0.9,
  playerLaneLimit: 1.8,
  rumbleLength: 3,
  horizon: 0.56
};

const backgroundLayers = Array.from({ length: 3 }).map((_, idx) => ({
  color: idx === 0 ? 'rgba(116, 182, 255, 0.45)' : idx === 1 ? 'rgba(94, 164, 238, 0.45)' : 'rgba(74, 142, 216, 0.4)',
  amplitude: 180 + idx * 90,
  frequency: 0.0008 + idx * 0.00035,
  parallax: 0.18 + idx * 0.14,
  baseFactor: 0.55 + idx * 0.08,
  seed: Math.random() * 1000
}));

const cloudTufts = Array.from({ length: 8 }).map(() => ({
  x: Math.random() * 2000,
  y: Math.random() * 140 + 40,
  scale: 0.7 + Math.random() * 0.8
}));

const colors = [
  { grass: '#58b368', road: '#545d73', shoulder: '#f59f3e', lane: '#f8fafc' },
  { grass: '#4ca65b', road: '#4f586c', shoulder: '#e9822a', lane: '#e2e8f0' }
];

const keys = {
  up: false,
  down: false,
  left: false,
  right: false
};

let segments = [];
let trackLength = 0;
let lastY = 0;

let position = 0;
let speed = 0;
let targetSpeed = 0;
let distanceTravelled = 0;
let playerX = 0;
let bodyLean = 0;
let cruiseMode = false;
let lastTimestamp = 0;

let screenWidth = 0;
let screenHeight = 0;
let halfWidth = 0;
let horizonY = 0;
let cameraDepth = 1 / Math.tan((config.fieldOfView / 2) * Math.PI / 180);

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  screenWidth = cssWidth;
  screenHeight = cssHeight;
  halfWidth = screenWidth / 2;
  horizonY = screenHeight * config.horizon;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function easeIn(a, b, t) {
  const v = t * t;
  return a + (b - a) * v;
}

function easeOut(a, b, t) {
  const inv = 1 - (1 - t) * (1 - t);
  return a + (b - a) * inv;
}

function easeInOut(a, b, t) {
  return a + (b - a) * (-Math.cos(Math.PI * t) + 1) / 2;
}

function addSegment(curve, nextY) {
  const clampedY = clamp(nextY, -520, 520);
  const index = segments.length;
  const z = index * config.segmentLength;
  const segment = {
    index,
    curve,
    world: {
      startY: lastY,
      endY: clampedY,
      startZ: z,
      endZ: z + config.segmentLength
    },
    projected: {
      p1: createProjectPoint(),
      p2: createProjectPoint()
    },
    sprites: []
  };
  segments.push(segment);
  lastY = clampedY;
}

function createProjectPoint() {
  return {
    world: { x: 0, y: 0, z: 0 },
    camera: { x: 0, y: 0, z: 0 },
    screen: { x: 0, y: 0, w: 0, scale: 1 }
  };
}

function addRoad(total, curve, elevation) {
  const enter = Math.floor(total * 0.25);
  const hold = Math.floor(total * 0.5);
  const leave = total - enter - hold;
  const startY = lastY;
  const endY = startY + elevation;
  let step = 0;
  const computeY = (offset) => {
    const percent = clamp((step + offset) / Math.max(1, total), 0, 1);
    return easeInOut(startY, endY, percent);
  };

  for (let i = 0; i < enter; i += 1) {
    const curveValue = easeIn(0, curve, (i + 1) / Math.max(1, enter));
    step += 1;
    addSegment(curveValue, computeY(0));
  }
  for (let i = 0; i < hold; i += 1) {
    step += 1;
    addSegment(curve, computeY(0));
  }
  for (let i = 0; i < leave; i += 1) {
    const curveValue = easeOut(curve, 0, (i + 1) / Math.max(1, leave));
    step += 1;
    addSegment(curveValue, computeY(0));
  }
}

function addStraight(length) {
  for (let i = 0; i < length; i += 1) {
    addSegment(0, lastY);
  }
}

function buildRoad() {
  segments = [];
  lastY = 0;

  addStraight(20);
  while (segments.length < config.totalSegments) {
    const pick = Math.random();
    const length = 40 + Math.floor(Math.random() * 40);
    if (pick < 0.25) {
      addRoad(length, 0, Math.random() * 260 - 130);
    } else if (pick < 0.58) {
      const curve = (Math.random() * 2 - 1) * 0.0013;
      addRoad(length, curve, Math.random() * 220 - 110);
    } else {
      const curve = (Math.random() * 2 - 1) * 0.0016;
      addRoad(length, curve, 0);
    }
    addStraight(8 + Math.floor(Math.random() * 8));
  }

  trackLength = segments.length * config.segmentLength;
  scatterScenery();
}

function scatterScenery() {
  for (const segment of segments) {
    segment.sprites = [];
  }
  for (let i = 12; i < segments.length; i += 1) {
    if (Math.random() < 0.18) {
      segments[i].sprites.push(createSprite());
    }
    if (Math.random() < 0.1) {
      const sprite = createSprite();
      sprite.offset *= -1;
      segments[i].sprites.push(sprite);
    }
  }
}

function createSprite() {
  const pick = Math.random();
  if (pick > 0.75) {
    return { type: 'pine', offset: 1.6 + Math.random() * 1.6, size: 0.75, aspect: 1.8 };
  }
  if (pick > 0.5) {
    return { type: 'rock', offset: 1.4 + Math.random() * 1.4, size: 0.55, aspect: 0.7 };
  }
  if (pick > 0.25) {
    return { type: 'bush', offset: 1.3 + Math.random() * 1.5, size: 0.6, aspect: 0.6 };
  }
  return { type: 'tree', offset: 1.5 + Math.random() * 1.4, size: 0.68, aspect: 1.5 };
}

function getSegment(z) {
  return segments[Math.floor(z / config.segmentLength) % segments.length];
}

function getHeight(z) {
  const segmentIndex = Math.floor(z / config.segmentLength) % segments.length;
  const segment = segments[segmentIndex];
  const percent = (z % config.segmentLength) / config.segmentLength;
  return segment.world.startY + (segment.world.endY - segment.world.startY) * percent;
}

function handleInput(dt) {
  if (cruiseMode) {
    targetSpeed = config.cruiseSpeed;
  }
  if (keys.up) {
    targetSpeed = clamp(targetSpeed + config.acceleration * dt, 0, config.maxSpeed);
  }
  if (keys.down) {
    targetSpeed = clamp(targetSpeed - config.brake * dt, 0, config.maxSpeed);
  }
  if (!keys.up && !keys.down && !cruiseMode) {
    const decay = config.friction * dt;
    if (targetSpeed > decay) {
      targetSpeed -= decay;
    } else {
      targetSpeed = 0;
    }
  }

  const steerFactor = speed / config.maxSpeed;
  if (keys.left) {
    playerX -= config.steerSpeed * dt * (0.5 + steerFactor);
    bodyLean = clamp(bodyLean - config.leanSpeed * dt, -config.leanLimit, config.leanLimit);
  } else if (keys.right) {
    playerX += config.steerSpeed * dt * (0.5 + steerFactor);
    bodyLean = clamp(bodyLean + config.leanSpeed * dt, -config.leanLimit, config.leanLimit);
  } else {
    playerX *= Math.max(0, 1 - config.steerReturn * dt);
    bodyLean *= Math.max(0, 1 - config.leanReturn * dt);
  }
  playerX = clamp(playerX, -config.playerLaneLimit, config.playerLaneLimit);
}

function updateHUD() {
  if (distanceTravelled < 1000) {
    hudDistance.textContent = `${distanceTravelled.toFixed(0)} m`;
  } else {
    hudDistance.textContent = `${(distanceTravelled / 1000).toFixed(2)} km`;
  }
  hudSpeed.textContent = `${(speed * 3.6).toFixed(0)} km/h`;
  hudCruise.textContent = cruiseMode ? '开启' : '关闭';
}

function drawBackground(cameraX) {
  const gradient = ctx.createLinearGradient(0, 0, 0, screenHeight);
  gradient.addColorStop(0, '#8ec5ff');
  gradient.addColorStop(0.4, '#cde9ff');
  gradient.addColorStop(1, '#f5fcff');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, screenWidth, screenHeight);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  for (const cloud of cloudTufts) {
    const offsetX = (cloud.x - cameraX * 0.2) % (screenWidth + 400);
    const drawX = offsetX < 0 ? offsetX + screenWidth + 400 : offsetX;
    ctx.beginPath();
    ctx.ellipse(drawX - 200, cloud.y, 60 * cloud.scale, 24 * cloud.scale, 0, 0, Math.PI * 2);
    ctx.ellipse(drawX - 160, cloud.y + 10, 50 * cloud.scale, 20 * cloud.scale, 0, 0, Math.PI * 2);
    ctx.ellipse(drawX - 120, cloud.y, 70 * cloud.scale, 28 * cloud.scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  backgroundLayers.forEach(layer => {
    ctx.beginPath();
    ctx.moveTo(0, screenHeight);
    const baseY = screenHeight * layer.baseFactor;
    for (let x = -80; x <= screenWidth + 160; x += 40) {
      const worldX = cameraX * layer.parallax + x;
      const y = baseY - (
        Math.sin(worldX * layer.frequency + layer.seed) * layer.amplitude +
        Math.cos(worldX * layer.frequency * 0.6 + layer.seed * 0.6) * (layer.amplitude * 0.5)
      );
      ctx.lineTo(x, y);
    }
    ctx.lineTo(screenWidth + 160, screenHeight);
    ctx.closePath();
    ctx.fillStyle = layer.color;
    ctx.fill();
  });
}

function project(point, cameraX, cameraY, cameraZ) {
  point.camera.x = point.world.x - cameraX;
  point.camera.y = point.world.y - cameraY;
  point.camera.z = point.world.z - cameraZ;

  const scale = cameraDepth / point.camera.z;
  point.screen.scale = scale;
  point.screen.x = halfWidth + scale * point.camera.x * halfWidth;
  point.screen.y = horizonY - scale * point.camera.y * screenHeight * 0.9;
  point.screen.w = scale * config.roadWidth * halfWidth;
}

function drawPolygon(points, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawRoad(cameraX, cameraY, cameraZ, baseIndex, basePercent) {
  const visibleSegments = [];
  let maxY = screenHeight;
  let x = 0;
  let dx = -segments[baseIndex].curve * basePercent;

  for (let n = 0; n < config.drawDistance; n += 1) {
    const index = (baseIndex + n) % segments.length;
    const segment = segments[index];
    const looped = baseIndex + n >= segments.length;
    const p1 = segment.projected.p1;
    const p2 = segment.projected.p2;

    p1.world.x = x;
    p1.world.y = segment.world.startY;
    p1.world.z = segment.world.startZ + (looped ? trackLength : 0);
    project(p1, cameraX, cameraY, cameraZ);

    x += dx;
    dx += segment.curve;

    p2.world.x = x;
    p2.world.y = segment.world.endY;
    p2.world.z = segment.world.endZ + (looped ? trackLength : 0);
    project(p2, cameraX, cameraY, cameraZ);

    if (p1.camera.z <= 0 || p2.camera.z <= 0) {
      continue;
    }

    if (p1.screen.y <= p2.screen.y) {
      continue;
    }

    if (p2.screen.y >= maxY) {
      continue;
    }

    const colorIndex = Math.floor(segment.index / config.rumbleLength) % colors.length;
    const color = colors[colorIndex];

    const grassTop = Math.max(p2.screen.y, 0);
    ctx.fillStyle = color.grass;
    ctx.fillRect(0, grassTop, screenWidth, Math.max(0, maxY - grassTop));

    const r1 = p1.screen.w * 1.15;
    const r2 = p2.screen.w * 1.15;
    drawPolygon([
      { x: p1.screen.x - r1, y: p1.screen.y },
      { x: p2.screen.x - r2, y: p2.screen.y },
      { x: p2.screen.x + r2, y: p2.screen.y },
      { x: p1.screen.x + r1, y: p1.screen.y }
    ], color.shoulder);

    drawPolygon([
      { x: p1.screen.x - p1.screen.w, y: p1.screen.y },
      { x: p2.screen.x - p2.screen.w, y: p2.screen.y },
      { x: p2.screen.x + p2.screen.w, y: p2.screen.y },
      { x: p1.screen.x + p1.screen.w, y: p1.screen.y }
    ], color.road);

    const laneWidth1 = p1.screen.w * 0.07;
    const laneWidth2 = p2.screen.w * 0.07;
    drawPolygon([
      { x: p1.screen.x - laneWidth1, y: p1.screen.y },
      { x: p2.screen.x - laneWidth2, y: p2.screen.y },
      { x: p2.screen.x + laneWidth2, y: p2.screen.y },
      { x: p1.screen.x + laneWidth1, y: p1.screen.y }
    ], color.lane);

    maxY = p2.screen.y;
    visibleSegments.push({ segment, p1, p2 });
  }

  return visibleSegments;
}

function drawSprite(type, x, y, width, height) {
  switch (type) {
    case 'tree': {
      const trunkWidth = width * 0.18;
      const trunkHeight = height * 0.32;
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(x - trunkWidth / 2, y - trunkHeight, trunkWidth, trunkHeight);
      ctx.beginPath();
      ctx.fillStyle = '#3ca36c';
      ctx.ellipse(x, y - trunkHeight - height * 0.4, width * 0.55, height * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'pine': {
      ctx.fillStyle = '#2f855a';
      ctx.beginPath();
      ctx.moveTo(x, y - height);
      ctx.lineTo(x + width * 0.55, y);
      ctx.lineTo(x - width * 0.55, y);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'rock': {
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.moveTo(x - width * 0.5, y);
      ctx.lineTo(x, y - height * 0.8);
      ctx.lineTo(x + width * 0.5, y);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'bush': {
      ctx.fillStyle = '#4caf50';
      ctx.beginPath();
      ctx.ellipse(x - width * 0.2, y - height * 0.4, width * 0.4, height * 0.5, 0, 0, Math.PI * 2);
      ctx.ellipse(x + width * 0.2, y - height * 0.3, width * 0.45, height * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    default:
      break;
  }
}

function drawScenery(visibleSegments) {
  for (let i = visibleSegments.length - 1; i >= 0; i -= 1) {
    const { segment, p1, p2 } = visibleSegments[i];
    if (!segment.sprites.length) continue;
    const roadHalf = (p1.screen.w + p2.screen.w) / 2;
    const baseX = (p1.screen.x + p2.screen.x) / 2;
    const baseY = p2.screen.y;

    for (const sprite of segment.sprites) {
      const spriteX = baseX + sprite.offset * roadHalf;
      const spriteWidth = roadHalf * sprite.size;
      const spriteHeight = spriteWidth * sprite.aspect;
      drawSprite(sprite.type, spriteX, baseY, spriteWidth, spriteHeight);
    }
  }
}

function drawPlayerCar(visibleSegments) {
  if (!visibleSegments.length) return;
  const nearest = visibleSegments[0];
  const roadHalf = nearest.p1.screen.w;
  const roadCenter = nearest.p1.screen.x;
  const carWidth = roadHalf * 0.65;
  const carHeight = carWidth * 0.48;
  const carX = roadCenter + playerX * roadHalf;
  const carY = Math.min(screenHeight * 0.9, nearest.p1.screen.y + carHeight * 0.3);

  ctx.save();
  ctx.translate(carX, carY);
  ctx.rotate(bodyLean * 0.6);

  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.moveTo(-carWidth * 0.55, carHeight * 0.3);
  ctx.lineTo(carWidth * 0.55, carHeight * 0.3);
  ctx.lineTo(carWidth * 0.68, -carHeight * 0.1);
  ctx.lineTo(carWidth * 0.4, -carHeight * 0.9);
  ctx.lineTo(-carWidth * 0.35, -carHeight * 0.95);
  ctx.lineTo(-carWidth * 0.68, -carHeight * 0.2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#1f2937';
  ctx.fillRect(-carWidth * 0.42, -carHeight * 0.82, carWidth * 0.58, carHeight * 0.32);
  ctx.fillStyle = 'rgba(96, 165, 250, 0.8)';
  ctx.fillRect(-carWidth * 0.32, -carHeight * 0.78, carWidth * 0.46, carHeight * 0.24);

  const wheelRadius = carHeight * 0.36;
  ctx.fillStyle = '#111827';
  ctx.beginPath();
  ctx.ellipse(-carWidth * 0.4, carHeight * 0.32, wheelRadius * 0.9, wheelRadius, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(carWidth * 0.4, carHeight * 0.32, wheelRadius * 0.9, wheelRadius, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function update(timestamp) {
  if (!lastTimestamp) lastTimestamp = timestamp;
  const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.05);
  lastTimestamp = timestamp;

  handleInput(dt);

  const speedDiff = targetSpeed - speed;
  const accel = clamp(speedDiff, -config.brake * dt, config.acceleration * dt);
  speed = clamp(speed + accel, 0, config.maxSpeed);

  position = (position + speed * dt) % trackLength;
  distanceTravelled += speed * dt;

  const segment = getSegment(position);
  const percent = (position % config.segmentLength) / config.segmentLength;
  const cameraY = getHeight(position) + config.cameraHeight;
  const cameraCurve = segment.curve;
  const cameraX = playerX * config.roadWidth;
  const cameraZRaw = position - config.segmentLength * config.cameraDistance;
  let cameraZ = cameraZRaw;
  if (cameraZ < 0) cameraZ += trackLength;

  playerX -= cameraCurve * speed * dt * config.curveDrift;
  playerX = clamp(playerX, -config.playerLaneLimit, config.playerLaneLimit);

  drawBackground(position);
  const visibleSegments = drawRoad(cameraX, cameraY, cameraZ, Math.floor(position / config.segmentLength), percent);
  drawScenery(visibleSegments);
  drawPlayerCar(visibleSegments);
  updateHUD();

  requestAnimationFrame(update);
}

window.addEventListener('keydown', (event) => {
  switch (event.code) {
    case 'ArrowUp':
    case 'KeyW':
      keys.up = true;
      event.preventDefault();
      break;
    case 'ArrowDown':
    case 'KeyS':
      keys.down = true;
      event.preventDefault();
      break;
    case 'ArrowLeft':
    case 'KeyA':
      keys.left = true;
      event.preventDefault();
      break;
    case 'ArrowRight':
    case 'KeyD':
      keys.right = true;
      event.preventDefault();
      break;
    case 'Space':
      cruiseMode = !cruiseMode;
      if (!cruiseMode) {
        targetSpeed = speed;
      }
      hudCruise.textContent = cruiseMode ? '开启' : '关闭';
      event.preventDefault();
      break;
    default:
      break;
  }
});

window.addEventListener('keyup', (event) => {
  switch (event.code) {
    case 'ArrowUp':
    case 'KeyW':
      keys.up = false;
      break;
    case 'ArrowDown':
    case 'KeyS':
      keys.down = false;
      break;
    case 'ArrowLeft':
    case 'KeyA':
      keys.left = false;
      break;
    case 'ArrowRight':
    case 'KeyD':
      keys.right = false;
      break;
    default:
      break;
  }
});

window.addEventListener('blur', () => {
  keys.up = keys.down = keys.left = keys.right = false;
});

resize();
buildRoad();
requestAnimationFrame(update);

window.addEventListener('resize', () => {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  resize();
});
