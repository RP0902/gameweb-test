const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const hudDistance = document.getElementById('distance');
const hudSpeed = document.getElementById('speed');
const hudCruise = document.getElementById('cruise');

const config = {
  segmentLength: 80,
  viewDistance: 2200,
  maxSlope: 0.24,
  slopeChange: 0.045,
  maxHeight: 220,
  minHeight: -180,
  wheelBase: 120,
  wheelRadius: 20,
  bodyLift: 16,
  maxSpeed: 55,
  cruiseSpeed: 32,
  acceleration: 18,
  brake: 28,
  friction: 12,
  tiltSpeed: 1.6,
  tiltReturn: 2.8
};

let roadSegments = [];
let sceneryObjects = [];
let currentSlope = 0;
let carX = 0;
let distanceTravelled = 0;
let speed = 0;
let targetSpeed = 0;
let cruiseMode = false;
let bodyTilt = 0;
let lastTimestamp = 0;
let baseHeight = 0;

const keys = {
  up: false,
  down: false,
  left: false,
  right: false
};

const backgroundLayers = Array.from({ length: 3 }).map((_, idx) => ({
  color: idx === 0 ? 'rgba(104, 154, 205, 0.55)' : idx === 1 ? 'rgba(86, 139, 184, 0.55)' : 'rgba(68, 119, 160, 0.5)',
  amplitude: 80 + idx * 30,
  frequency: 0.0012 + idx * 0.0004,
  parallax: 0.18 + idx * 0.14,
  baseFactor: 0.55 + idx * 0.08,
  seed: Math.random() * 1000
}));

const cloudTufts = Array.from({ length: 8 }).map(() => ({
  x: Math.random() * 2000,
  y: Math.random() * 120 + 40,
  scale: 0.6 + Math.random() * 0.7
}));

function resize() {
  canvas.width = canvas.clientWidth * window.devicePixelRatio;
  canvas.height = canvas.clientHeight * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  baseHeight = canvas.clientHeight * 0.75;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function initRoad() {
  roadSegments = [];
  sceneryObjects = [];
  currentSlope = 0;
  const startX = -config.segmentLength * 14;
  let lastPoint = { x: startX, y: 0 };
  roadSegments.push(lastPoint);

  for (let i = 0; i < 220; i += 1) {
    lastPoint = generateSegment(lastPoint);
  }
}

function generateSegment(prev) {
  const deltaSlope = (Math.random() - 0.5) * config.slopeChange;
  currentSlope = clamp(currentSlope + deltaSlope, -config.maxSlope, config.maxSlope);
  let nextY = prev.y + currentSlope * config.segmentLength;
  if (nextY > config.maxHeight) {
    nextY = config.maxHeight;
    currentSlope = Math.min(currentSlope, -0.08);
  }
  if (nextY < config.minHeight) {
    nextY = config.minHeight;
    currentSlope = Math.max(currentSlope, 0.08);
  }
  const nextPoint = {
    x: prev.x + config.segmentLength,
    y: nextY
  };
  roadSegments.push(nextPoint);
  maybeAddScenery(prev.x, nextPoint.x);
  return nextPoint;
}

function maybeAddScenery(x1, x2) {
  const span = x2 - x1;
  const count = Math.floor(Math.random() * 2);
  for (let i = 0; i < count; i += 1) {
    const posX = x1 + Math.random() * span;
    const pick = Math.random();
    let type = 'tree';
    if (pick > 0.87) {
      type = 'lake';
    } else if (pick > 0.67) {
      type = 'flowers';
    } else if (pick > 0.47) {
      type = 'pine';
    } else if (pick > 0.3) {
      type = 'bush';
    }
    const item = {
      x: posX,
      type,
      scale: 0.8 + Math.random() * 0.8,
      flip: Math.random() > 0.5,
      seed: Math.random() * 1000
    };

    if (type === 'flowers') {
      const palettes = [
        ['#f472b6', '#facc15', '#fb7185', '#a855f7'],
        ['#f97316', '#fbbf24', '#fca5a5', '#f472b6'],
        ['#38bdf8', '#a3e635', '#f9a8d4', '#facc15']
      ];
      item.palette = palettes[Math.floor(Math.random() * palettes.length)];
      item.count = 4 + Math.floor(Math.random() * 3);
    }

    if (type === 'lake') {
      item.width = 70 + Math.random() * 60;
      item.height = 18 + Math.random() * 12;
    }

    sceneryObjects.push(item);
  }
}

function ensureRoadCoverage(targetX) {
  while (roadSegments[roadSegments.length - 1].x < targetX + config.viewDistance) {
    const last = roadSegments[roadSegments.length - 1];
    generateSegment(last);
  }
}

function pruneRoad(cameraX) {
  while (roadSegments.length > 2 && roadSegments[1].x < cameraX - config.viewDistance * 0.6) {
    roadSegments.shift();
  }
  sceneryObjects = sceneryObjects.filter(obj => obj.x > cameraX - config.viewDistance * 0.7);
}

function getHeight(worldX) {
  ensureRoadCoverage(worldX);
  for (let i = 1; i < roadSegments.length; i += 1) {
    const a = roadSegments[i - 1];
    const b = roadSegments[i];
    if (worldX <= b.x) {
      const t = (worldX - a.x) / (b.x - a.x);
      return a.y + (b.y - a.y) * t;
    }
  }
  const last = roadSegments[roadSegments.length - 1];
  return last.y;
}

function getSlope(worldX) {
  const eps = 2;
  const h1 = getHeight(worldX - eps);
  const h2 = getHeight(worldX + eps);
  return (h2 - h1) / (eps * 2);
}

function worldToScreenX(worldX, cameraX) {
  return (worldX - cameraX) + canvas.clientWidth / 2;
}

function worldToScreenY(worldY) {
  return baseHeight - worldY;
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

function handleInput(dt) {
  if (cruiseMode) {
    targetSpeed = config.cruiseSpeed;
  }
  if (keys.up) {
    targetSpeed = clamp(targetSpeed + config.acceleration * dt, 0, config.maxSpeed);
  }
  if (keys.down) {
    targetSpeed = clamp(targetSpeed - config.brake * dt, -8, config.maxSpeed);
  }
  if (!keys.up && !keys.down && !cruiseMode) {
    const decay = Math.sign(targetSpeed) * config.friction * dt;
    if (Math.abs(decay) > Math.abs(targetSpeed)) {
      targetSpeed = 0;
    } else {
      targetSpeed -= decay;
    }
  }

  if (keys.left) {
    bodyTilt -= config.tiltSpeed * dt;
  } else if (keys.right) {
    bodyTilt += config.tiltSpeed * dt;
  } else {
    bodyTilt *= Math.max(0, 1 - config.tiltReturn * dt);
  }
  bodyTilt = clamp(bodyTilt, -0.4, 0.4);
  targetSpeed = clamp(targetSpeed, -8, config.maxSpeed);
}

function drawBackground(cameraX) {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight);
  gradient.addColorStop(0, '#8ec5ff');
  gradient.addColorStop(0.5, '#c9e9ff');
  gradient.addColorStop(1, '#f5fcff');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  for (const cloud of cloudTufts) {
    const offsetX = (cloud.x - cameraX * 0.3) % (canvas.clientWidth + 400);
    const drawX = offsetX < 0 ? offsetX + canvas.clientWidth + 400 : offsetX;
    ctx.beginPath();
    ctx.ellipse(drawX - 200, cloud.y, 60 * cloud.scale, 24 * cloud.scale, 0, 0, Math.PI * 2);
    ctx.ellipse(drawX - 160, cloud.y + 10, 50 * cloud.scale, 20 * cloud.scale, 0, 0, Math.PI * 2);
    ctx.ellipse(drawX - 120, cloud.y, 70 * cloud.scale, 28 * cloud.scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  backgroundLayers.forEach(layer => {
    ctx.beginPath();
    ctx.moveTo(0, canvas.clientHeight);
    for (let x = 0; x <= canvas.clientWidth + 80; x += 40) {
      const worldX = cameraX * layer.parallax + x;
      const y = canvas.clientHeight * layer.baseFactor - (
        Math.sin(worldX * layer.frequency + layer.seed) * layer.amplitude +
        Math.cos(worldX * layer.frequency * 0.6 + layer.seed * 0.6) * (layer.amplitude * 0.5)
      );
      ctx.lineTo(x, y);
    }
    ctx.lineTo(canvas.clientWidth + 80, canvas.clientHeight);
    ctx.closePath();
    ctx.fillStyle = layer.color;
    ctx.fill();
  });
}

function drawGround(cameraX) {
  ctx.beginPath();
  const startSegment = roadSegments[0];
  ctx.moveTo(worldToScreenX(startSegment.x, cameraX), canvas.clientHeight);
  for (const segment of roadSegments) {
    const sx = worldToScreenX(segment.x, cameraX);
    const sy = worldToScreenY(segment.y);
    ctx.lineTo(sx, sy);
  }
  const last = roadSegments[roadSegments.length - 1];
  ctx.lineTo(worldToScreenX(last.x, cameraX), canvas.clientHeight);
  ctx.closePath();

  const gradient = ctx.createLinearGradient(0, baseHeight, 0, canvas.clientHeight);
  gradient.addColorStop(0, '#88d087');
  gradient.addColorStop(1, '#3e9138');
  ctx.fillStyle = gradient;
  ctx.fill();
}

function drawRoadLine(cameraX) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.strokeStyle = '#4f5d75';
  ctx.lineWidth = 32;
  ctx.beginPath();
  let started = false;
  for (const segment of roadSegments) {
    const sx = worldToScreenX(segment.x, cameraX);
    const sy = worldToScreenY(segment.y);
    if (!started) {
      ctx.moveTo(sx, sy);
      started = true;
    } else {
      ctx.lineTo(sx, sy);
    }
  }
  ctx.stroke();

  ctx.setLineDash([40, 28]);
  ctx.strokeStyle = '#f5f5f5';
  ctx.lineWidth = 4;
  ctx.beginPath();
  started = false;
  for (const segment of roadSegments) {
    const sx = worldToScreenX(segment.x, cameraX);
    const sy = worldToScreenY(segment.y);
    if (!started) {
      ctx.moveTo(sx, sy);
      started = true;
    } else {
      ctx.lineTo(sx, sy);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawScenery(cameraX) {
  for (const obj of sceneryObjects) {
    const sx = worldToScreenX(obj.x, cameraX);
    if (sx < -200 || sx > canvas.clientWidth + 200) continue;
    const groundY = worldToScreenY(getHeight(obj.x));
    const scale = obj.scale;
    switch (obj.type) {
      case 'tree':
        drawTree(sx, groundY, scale);
        break;
      case 'pine':
        drawPine(sx, groundY, scale);
        break;
      case 'bush':
        drawBush(sx, groundY, scale, obj.flip);
        break;
      case 'flowers':
        drawFlowers(sx, groundY, scale, obj);
        break;
      case 'lake':
        drawLake(sx, groundY, scale, obj);
        break;
      default:
        break;
    }
  }
}

function drawTree(x, groundY, scale) {
  const height = 90 * scale;
  ctx.fillStyle = '#8b5a2b';
  ctx.fillRect(x - 6 * scale, groundY - height, 12 * scale, height);
  ctx.beginPath();
  ctx.fillStyle = '#3ca36c';
  ctx.arc(x, groundY - height, 28 * scale, 0, Math.PI * 2);
  ctx.arc(x - 18 * scale, groundY - height + 20 * scale, 24 * scale, 0, Math.PI * 2);
  ctx.arc(x + 18 * scale, groundY - height + 22 * scale, 24 * scale, 0, Math.PI * 2);
  ctx.fill();
}

function drawPine(x, groundY, scale) {
  const height = 110 * scale;
  ctx.fillStyle = '#4d6f43';
  ctx.beginPath();
  ctx.moveTo(x, groundY - height);
  ctx.lineTo(x + 45 * scale, groundY);
  ctx.lineTo(x - 45 * scale, groundY);
  ctx.closePath();
  ctx.fill();
}

function drawBush(x, groundY, scale, flip) {
  ctx.beginPath();
  ctx.fillStyle = '#58b368';
  const direction = flip ? -1 : 1;
  ctx.ellipse(x + 16 * scale * direction, groundY - 12 * scale, 30 * scale, 18 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(x - 10 * scale * direction, groundY - 14 * scale, 26 * scale, 20 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawFlowers(x, groundY, scale, obj) {
  const colors = obj.palette || ['#f472b6', '#facc15', '#fb7185', '#a855f7'];
  const count = obj.count || 5;
  for (let i = 0; i < count; i += 1) {
    const offset = (i - (count - 1) / 2) * 12 * scale;
    const color = colors[i % colors.length];
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(x + offset, groundY - 6 * scale, 5 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#7c3aed';
  ctx.fillRect(x - 3 * scale, groundY - 16 * scale, 6 * scale, 16 * scale);
}

function drawLake(x, groundY, scale, obj) {
  const width = (obj?.width || 80) * scale;
  const height = (obj?.height || 24) * scale;
  ctx.beginPath();
  ctx.fillStyle = 'rgba(59, 130, 246, 0.35)';
  ctx.ellipse(x, groundY + 12 * scale, width, height, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.55)';
  ctx.lineWidth = 2;
  ctx.ellipse(x, groundY + 12 * scale, width * 0.95, height * 0.85, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawCar(cameraX) {
  const halfWheelBase = config.wheelBase / 2;
  const frontX = carX + halfWheelBase;
  const rearX = carX - halfWheelBase;
  const frontY = getHeight(frontX);
  const rearY = getHeight(rearX);
  const carAngle = Math.atan2(frontY - rearY, config.wheelBase) + bodyTilt;

  const frontWheelY = frontY + config.wheelRadius;
  const rearWheelY = rearY + config.wheelRadius;
  const carCenterY = (frontWheelY + rearWheelY) / 2 + config.bodyLift;

  const carScreenX = worldToScreenX(carX, cameraX);
  const carScreenY = worldToScreenY(carCenterY);

  const cos = Math.cos(carAngle);
  const sin = Math.sin(carAngle);

  const frontWheel = {
    x: carScreenX + cos * halfWheelBase,
    y: carScreenY + sin * halfWheelBase
  };
  const rearWheel = {
    x: carScreenX - cos * halfWheelBase,
    y: carScreenY - sin * halfWheelBase
  };

  // Wheels
  ctx.fillStyle = '#1f2937';
  [frontWheel, rearWheel].forEach(wheel => {
    ctx.beginPath();
    ctx.arc(wheel.x, wheel.y, config.wheelRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = '#f1f5f9';
    ctx.arc(wheel.x, wheel.y, config.wheelRadius * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1f2937';
  });

  // Body
  ctx.save();
  ctx.translate(carScreenX, carScreenY);
  ctx.rotate(carAngle);
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.moveTo(-56, 10);
  ctx.lineTo(64, 10);
  ctx.lineTo(80, -8);
  ctx.lineTo(60, -28);
  ctx.lineTo(-20, -36);
  ctx.lineTo(-60, -18);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#1f2937';
  ctx.fillRect(-42, -34, 60, 18);
  ctx.fillStyle = 'rgba(96, 165, 250, 0.7)';
  ctx.fillRect(-30, -32, 40, 14);

  ctx.restore();
}

function update(timestamp) {
  if (!lastTimestamp) lastTimestamp = timestamp;
  const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.05);
  lastTimestamp = timestamp;

  handleInput(dt);

  const speedDiff = targetSpeed - speed;
  const acceleration = clamp(speedDiff, -config.brake * dt, config.acceleration * dt);
  speed += acceleration;
  speed = clamp(speed, -8, config.maxSpeed);

  carX += speed * dt;
  if (carX < 0) carX = 0;
  distanceTravelled = Math.max(distanceTravelled, carX);

  const desiredCarScreen = canvas.clientWidth * 0.35;
  const cameraX = carX - (desiredCarScreen - canvas.clientWidth / 2);

  pruneRoad(cameraX);
  ensureRoadCoverage(cameraX + config.viewDistance);

  drawBackground(cameraX);
  drawGround(cameraX);
  drawScenery(cameraX);
  drawRoadLine(cameraX);
  drawCar(cameraX);

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
      break;
    case 'ArrowRight':
    case 'KeyD':
      keys.right = true;
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
initRoad();
requestAnimationFrame(update);

window.addEventListener('resize', () => {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  resize();
});
