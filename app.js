/* ============================================
   FOOD FIGHT ARENA – game.js
   Complete local multiplayer party shooter.
   ============================================ */

// -------------------- CONFIGURATION --------------------
const GAME_WIDTH  = 1920;       // virtual resolution (scaled to canvas)
const GAME_HEIGHT = 1080;
const PLAYER_SPEED = 320;
const PROJECTILE_GRAVITY = 0;   // top-down, no gravity
const FOOD_COOLDOWN_BASE = 0.6; // seconds
const MAX_POWERUP_DURATION = 10; // seconds

// Food weapon definitions (core data)
const FOOD_TYPES = {
  TOMATO:    { name: "Tomato",   damage: 25, speed: 700, splashRadius: 40,  special: "splash",   cooldown: 1.0,  icon: "🍅" },
  EGG:       { name: "Egg",      damage: 15, speed: 600, splashRadius: 0,    special: "blur",     cooldown: 0.8,  icon: "🥚" },
  BURGER:    { name: "Burger",   damage: 40, speed: 500, splashRadius: 0,    special: "heavy",    cooldown: 2.0,  icon: "🍔" },
  BANANA:    { name: "Banana",   damage: 10, speed: 650, splashRadius: 25,   special: "peel",     cooldown: 1.5,  icon: "🍌" },
  WATERMELON:{ name: "Watermelon",damage: 50, speed: 400, splashRadius: 80,   special: "megaSplash",cooldown: 3.0,  icon: "🍉" }
};

// Power-up definitions
const POWERUP_TYPES = {
  SPEED:    { name: "Speed Boost",   color: "#00d2ff", icon: "⚡", duration: 10 },
  SHIELD:   { name: "Shield",        color: "#a29bfe", icon: "🛡️", duration: 10 },
  RAPIDFIRE:{ name: "Rapid Fire",    color: "#ff9f43", icon: "🔥", duration: 8 },
  HEAL:     { name: "Healing Pizza", color: "#2ed573", icon: "🍕", instant: 30 },
  DOUBLEDMG:{ name: "Double Damage", color: "#ff6348", icon: "💥", duration: 15 },
  MAGNET:   { name: "Magnet",        color: "#ffd32a", icon: "🧲", duration: 10 }
};

// -------------------- GLOBALS --------------------
let canvas, ctx;
let minimapCanvas, minimapCtx;
let game;                      // current game instance
let currentScreen = "mainMenu";
let roomCode = "AAAA";
let gameSettings = { map: "School Cafeteria", players: 2, bots: 2 }; // local settings

// Input state
const keys = {};
const mouse = { x: 0, y: 0, down: false };
let touchJoystickActive = false;
let touchJoystickDir = { x: 0, y: 0 };
let touchShootPressed = false;

// UI references
const screens = {
  mainMenu:      document.getElementById("mainMenu"),
  profilePanel:  document.getElementById("profilePanel"),
  cosmeticsPanel:document.getElementById("cosmeticsPanel"),
  settingsPanel: document.getElementById("settingsPanel"),
  lobbyScreen:   document.getElementById("lobbyScreen"),
  gameHUD:       document.getElementById("gameHUD"),
  postMatchScreen:document.getElementById("postMatchScreen"),
  matchCountdown: document.getElementById("matchCountdown"),
  countdownNumber:document.getElementById("countdownNumber"),
  disconnectOverlay:document.getElementById("disconnectOverlay"),
  victoryBanner: document.getElementById("victoryBanner"),
  defeatBanner:  document.getElementById("defeatBanner"),
  spectatorBanner:document.getElementById("spectatorBanner"),
  emoteWheel:    document.getElementById("emoteWheel")
};

// -------------------- UI HELPER FUNCTIONS --------------------
function showScreen(screenName) {
  Object.values(screens).forEach(el => el?.classList?.remove("active"));
  if (screens[screenName]) screens[screenName].classList.add("active");
  currentScreen = screenName;
}

function hideAllScreens() {
  Object.values(screens).forEach(el => el?.classList?.remove("active"));
}

// Update HUD elements during gameplay
function updateHUD() {
  if (!game || !game.localPlayer) return;
  const p = game.localPlayer;
  document.getElementById("healthBarFill").style.width = `${p.health}%`;
  document.getElementById("healthText").textContent = `${Math.round(p.health)} HP`;
  const weapon = FOOD_TYPES[p.currentFood] || FOOD_TYPES.TOMATO;
  document.querySelector("#currentWeapon .weapon-icon").textContent = weapon.icon;
  document.getElementById("weaponName").textContent = weapon.name;
  document.getElementById("matchTimer").textContent = formatTime(game.matchTime);
  document.getElementById("playersAlive").textContent = `👥 ${game.alivePlayers} left`;
  document.getElementById("pingDisplay").textContent = "🟢 32ms"; // fake
  document.getElementById("cooldownFill").style.height = `${(1 - p.cooldownTimer / weapon.cooldown) * 100}%`;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Kill feed
function addKillMessage(attackerName, victimName, weapon) {
  const feed = document.getElementById("killFeed");
  const entry = document.createElement("div");
  entry.className = "kill-entry";
  entry.textContent = `${attackerName} 🗡 ${victimName} (${weapon})`;
  feed.appendChild(entry);
  setTimeout(() => entry.remove(), 4000);
}

// -------------------- INPUT HANDLING --------------------
function setupInput() {
  window.addEventListener("keydown", e => keys[e.key] = true);
  window.addEventListener("keyup", e => keys[e.key] = false);
  canvas.addEventListener("mousemove", e => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = GAME_WIDTH / rect.width;
    const scaleY = GAME_HEIGHT / rect.height;
    mouse.x = (e.clientX - rect.left) * scaleX;
    mouse.y = (e.clientY - rect.top) * scaleY;
  });
  canvas.addEventListener("mousedown", e => { if (e.button === 0) mouse.down = true; });
  canvas.addEventListener("mouseup", e => { if (e.button === 0) mouse.down = false; });
  canvas.addEventListener("contextmenu", e => e.preventDefault());

  // Touch controls (mobile)
  canvas.addEventListener("touchstart", handleTouchStart);
  canvas.addEventListener("touchmove", handleTouchMove);
  canvas.addEventListener("touchend", handleTouchEnd);
}

function handleTouchStart(e) {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const scaleX = GAME_WIDTH / rect.width;
  const scaleY = GAME_HEIGHT / rect.height;
  for (let touch of e.changedTouches) {
    const tx = (touch.clientX - rect.left) * scaleX;
    const ty = (touch.clientY - rect.top) * scaleY;
    // Left half of screen = joystick area
    if (tx < GAME_WIDTH * 0.4) {
      touchJoystickActive = true;
      touchJoystickDir = { x: 0, y: 0 };
      // Store touch identifier (simplified)
    } else if (tx > GAME_WIDTH * 0.6 && ty > GAME_HEIGHT * 0.5) {
      // Right bottom = shoot button
      touchShootPressed = true;
    }
  }
}

function handleTouchMove(e) {
  e.preventDefault();
  if (!touchJoystickActive) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = GAME_WIDTH / rect.width;
  const scaleY = GAME_HEIGHT / rect.height;
  for (let touch of e.touches) {
    const tx = (touch.clientX - rect.left) * scaleX;
    const ty = (touch.clientY - rect.top) * scaleY;
    if (tx < GAME_WIDTH * 0.4) {
      const centerX = GAME_WIDTH * 0.2;
      const centerY = GAME_HEIGHT * 0.5;
      const dx = tx - centerX;
      const dy = ty - centerY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 10) {
        touchJoystickDir = { x: 0, y: 0 };
      } else {
        touchJoystickDir = { x: dx / dist, y: dy / dist };
      }
    }
  }
}

function handleTouchEnd(e) {
  e.preventDefault();
  touchJoystickActive = false;
  touchJoystickDir = { x: 0, y: 0 };
  touchShootPressed = false;
}

// -------------------- PLAYER CLASS --------------------
class Player {
  constructor(id, name, x, y, color, human = false) {
    this.id = id;
    this.name = name;
    this.x = x;
    this.y = y;
    this.color = color;
    this.human = human;
    this.radius = 20;
    this.health = 100;
    this.maxHealth = 100;
    this.alive = true;
    this.facingAngle = 0;        // radians
    this.currentFood = "TOMATO";
    this.cooldownTimer = 0;
    this.speedMultiplier = 1;
    this.damageMultiplier = 1;
    this.shieldActive = false;
    this.activeEffects = {};    // keyed by power-up type
    this.isSpectator = false;
  }

  update(dt) {
    if (!this.alive) return;
    // Cooldown
    const weapon = FOOD_TYPES[this.currentFood];
    if (this.cooldownTimer > 0) this.cooldownTimer -= dt;

    // Update power-up timers
    for (let key in this.activeEffects) {
      this.activeEffects[key] -= dt;
      if (this.activeEffects[key] <= 0) {
        delete this.activeEffects[key];
        this.recalculateModifiers();
      }
    }
  }

  applyPowerUp(type) {
    const def = POWERUP_TYPES[type];
    if (def.instant) {
      this.health = Math.min(this.maxHealth, this.health + def.instant);
    } else {
      this.activeEffects[type] = (this.activeEffects[type] || 0) + def.duration;
      this.recalculateModifiers();
    }
  }

  recalculateModifiers() {
    this.speedMultiplier = this.activeEffects["SPEED"] ? 1.5 : 1;
    this.damageMultiplier = this.activeEffects["DOUBLEDMG"] ? 2 : 1;
    this.shieldActive = !!this.activeEffects["SHIELD"];
  }

  takeDamage(amount, attacker) {
    if (this.shieldActive) amount *= 0.5;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      return true; // eliminated
    }
    return false;
  }

  getSpeed() {
    return PLAYER_SPEED * this.speedMultiplier;
  }
}

// -------------------- PROJECTILE CLASS --------------------
class Projectile {
  constructor(owner, x, y, angle, foodType) {
    this.owner = owner;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.foodType = foodType;
    const data = FOOD_TYPES[foodType];
    this.speed = data.speed;
    this.damage = data.damage * (owner.damageMultiplier || 1);
    this.splashRadius = data.splashRadius || 0;
    this.special = data.special;
    this.alive = true;
    this.radius = 8;
    this.trail = [];
  }

  update(dt) {
    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;
    // Check map boundaries
    if (this.x < 0 || this.x > GAME_WIDTH || this.y < 0 || this.y > GAME_HEIGHT) {
      this.alive = false;
    }
    // Trail for visual
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 5) this.trail.shift();
  }
}

// -------------------- POWER-UP PICKUP CLASS --------------------
class PowerUpPickup {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.radius = 16;
    this.collected = false;
  }
}

// -------------------- GAME CLASS --------------------
class Game {
  constructor(settings) {
    this.settings = settings;
    this.players = [];
    this.projectiles = [];
    this.powerUps = [];
    this.matchTime = 180; // 3 minutes
    this.matchOver = false;
    this.localPlayerId = null;
    this.alivePlayers = 0;
    this.powerUpSpawnTimer = 0;
    this.mapName = settings.map;
  }

  init() {
    // Create players: P1 human, P2 human (if local), plus bots
    const humanCount = this.settings.players; // 2 for local multiplayer
    this.players = [];
    let id = 1;
    // Player 1
    this.players.push(new Player(id, "Player 1", 400, 540, "#ff6b6b", true));
    id++;
    // Player 2
    if (humanCount >= 2) {
      this.players.push(new Player(id, "Player 2", 1520, 540, "#54a0ff", true));
      id++;
    }
    // Bots
    const botNames = ["Bot Tom", "Bot Jerry", "Bot Spud"];
    for (let i = 0; i < this.settings.bots; i++) {
      const spawnX = 300 + Math.random() * 1300;
      const spawnY = 200 + Math.random() * 600;
      this.players.push(new Player(id, botNames[i % botNames.length], spawnX, spawnY, "#feca57", false));
      id++;
    }
    this.localPlayerId = 1; // assume Player 1 is local (for HUD)
    this.alivePlayers = this.players.length;
  }

  update(dt) {
    if (this.matchOver) return;
    this.matchTime -= dt;
    if (this.matchTime <= 0) {
      this.matchTime = 0;
      this.endMatch();
      return;
    }

    // Update players (movement, cooldowns)
    this.players.forEach(p => p.update(dt));

    // Handle input for human players
    this.handleHumanInput(dt);

    // AI movement
    this.updateAI(dt);

    // Update projectiles and collisions
    this.projectiles.forEach(p => p.update(dt));
    this.checkProjectileHits();

    // Remove dead projectiles
    this.projectiles = this.projectiles.filter(p => p.alive);

    // Spawn power-ups
    this.powerUpSpawnTimer -= dt;
    if (this.powerUpSpawnTimer <= 0) {
      this.spawnRandomPowerUp();
      this.powerUpSpawnTimer = 8 + Math.random() * 5; // 8-13s
    }

    // Check power-up pickups
    this.checkPowerUpCollisions();

    // Update alive count
    this.alivePlayers = this.players.filter(p => p.alive).length;
    if (this.alivePlayers <= 1) this.endMatch();

    // Update HUD if local player exists
    if (this.localPlayerId) updateHUD();
  }

  handleHumanInput(dt) {
    this.players.forEach(player => {
      if (!player.human || !player.alive) return;
      let moveX = 0, moveY = 0;
      let shoot = false;
      let aimX, aimY;

      if (player.id === 1) {
        // WASD + mouse / touch
        if (keys["w"] || keys["ArrowUp"]) moveY -= 1;
        if (keys["s"] || keys["ArrowDown"]) moveY += 1;
        if (keys["a"] || keys["ArrowLeft"]) moveX -= 1;
        if (keys["d"] || keys["ArrowRight"]) moveX += 1;
        aimX = mouse.x;
        aimY = mouse.y;
        shoot = mouse.down || touchShootPressed;
      } else if (player.id === 2) {
        // Arrow keys + Space (facing based on movement)
        if (keys["ArrowUp"]) moveY -= 1;
        if (keys["ArrowDown"]) moveY += 1;
        if (keys["ArrowLeft"]) moveX -= 1;
        if (keys["ArrowRight"]) moveX += 1;
        if (moveX !== 0 || moveY !== 0) {
          player.facingAngle = Math.atan2(moveY, moveX);
        }
        aimX = player.x + Math.cos(player.facingAngle) * 100;
        aimY = player.y + Math.sin(player.facingAngle) * 100;
        shoot = keys[" "]; // space
      }

      // Normalize movement
      if (moveX !== 0 || moveY !== 0) {
        const len = Math.sqrt(moveX * moveX + moveY * moveY);
        moveX /= len;
        moveY /= len;
      }
      player.x += moveX * player.getSpeed() * dt;
      player.y += moveY * player.getSpeed() * dt;
      // Clamp to arena
      player.x = Math.max(player.radius, Math.min(GAME_WIDTH - player.radius, player.x));
      player.y = Math.max(player.radius, Math.min(GAME_HEIGHT - player.radius, player.y));

      // Aim angle from mouse position for P1, or using facing for P2
      if (player.id === 1) {
        player.facingAngle = Math.atan2(aimY - player.y, aimX - player.x);
      }

      // Shoot if cooldown finished
      if (shoot && player.cooldownTimer <= 0) {
        this.spawnProjectile(player);
      }
    });
  }

  updateAI(dt) {
    this.players.forEach(bot => {
      if (bot.human || !bot.alive) return;
      // Simple AI: move toward nearest enemy
      const target = this.findNearestEnemy(bot);
      if (target) {
        const dx = target.x - bot.x;
        const dy = target.y - bot.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > 200) {
          const moveX = dx / dist;
          const moveY = dy / dist;
          bot.x += moveX * bot.getSpeed() * dt;
          bot.y += moveY * bot.getSpeed() * dt;
        }
        bot.facingAngle = Math.atan2(dy, dx);
      }
      // Shoot occasionally
      bot.cooldownTimer -= dt;
      if (bot.cooldownTimer <= 0 && Math.random() < 0.02) { // ~2% chance per frame
        this.spawnProjectile(bot);
      }
      // Clamp
      bot.x = Math.max(bot.radius, Math.min(GAME_WIDTH - bot.radius, bot.x));
      bot.y = Math.max(bot.radius, Math.min(GAME_HEIGHT - bot.radius, bot.y));
    });
  }

  findNearestEnemy(player) {
    let nearest = null, minDist = Infinity;
    this.players.forEach(other => {
      if (other === player || !other.alive) return;
      const d = Math.hypot(other.x - player.x, other.y - player.y);
      if (d < minDist) {
        minDist = d;
        nearest = other;
      }
    });
    return nearest;
  }

  spawnProjectile(shooter) {
    const food = shooter.currentFood;
    const data = FOOD_TYPES[food];
    const angle = shooter.facingAngle;
    const proj = new Projectile(shooter, shooter.x, shooter.y, angle, food);
    this.projectiles.push(proj);
    shooter.cooldownTimer = data.cooldown;
  }

  checkProjectileHits() {
    for (let proj of this.projectiles) {
      if (!proj.alive) continue;
      for (let target of this.players) {
        if (target === proj.owner || !target.alive) continue;
        const d = Math.hypot(proj.x - target.x, proj.y - target.y);
        const hitRadius = target.radius + (proj.splashRadius || proj.radius);
        if (d < hitRadius) {
          // Hit!
          let damage = proj.damage;
          if (proj.splashRadius > 0 && d > proj.radius) {
            damage *= (1 - (d - proj.radius) / proj.splashRadius);
          }
          const eliminated = target.takeDamage(damage, proj.owner);
          proj.alive = false;
          addKillMessage(proj.owner.name, target.name, FOOD_TYPES[proj.foodType].icon);
          if (eliminated) {
            target.alive = false;
          }
          break; // projectile disappears on first hit
        }
      }
    }
  }

  spawnRandomPowerUp() {
    const types = Object.keys(POWERUP_TYPES);
    const type = types[Math.floor(Math.random() * types.length)];
    const x = 100 + Math.random() * (GAME_WIDTH - 200);
    const y = 100 + Math.random() * (GAME_HEIGHT - 200);
    this.powerUps.push(new PowerUpPickup(x, y, type));
  }

  checkPowerUpCollisions() {
    for (let i = this.powerUps.length-1; i >= 0; i--) {
      const pu = this.powerUps[i];
      for (let player of this.players) {
        if (!player.alive) continue;
        if (Math.hypot(player.x - pu.x, player.y - pu.y) < player.radius + pu.radius) {
          player.applyPowerUp(pu.type);
          pu.collected = true;
          this.powerUps.splice(i,1);
          break;
        }
      }
    }
  }

  endMatch() {
    this.matchOver = true;
    const winner = this.players.find(p => p.alive);
    const localWon = this.localPlayerId && winner && winner.id === this.localPlayerId;
    showScreen("gameHUD");
    if (localWon) {
      screens.victoryBanner.classList.remove("hidden");
    } else {
      screens.defeatBanner.classList.remove("hidden");
    }
    setTimeout(() => {
      screens.victoryBanner.classList.add("hidden");
      screens.defeatBanner.classList.add("hidden");
      showPostMatch(winner, this.localPlayerId);
    }, 2000);
  }
}

// -------------------- RENDERING --------------------
function drawGame() {
  if (!game || !ctx) return;
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  // Draw arena background
  ctx.fillStyle = "#2d3436";
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  // Grid lines
  ctx.strokeStyle = "#636e72";
  ctx.lineWidth = 1;
  for (let x = 0; x < GAME_WIDTH; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, GAME_HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y < GAME_HEIGHT; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(GAME_WIDTH, y);
    ctx.stroke();
  }

  // Draw power-ups
  game.powerUps.forEach(pu => {
    ctx.fillStyle = POWERUP_TYPES[pu.type].color;
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, pu.radius, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.font = "20px Arial";
    ctx.textAlign = "center";
    ctx.fillText(POWERUP_TYPES[pu.type].icon, pu.x, pu.y+8);
  });

  // Draw projectiles
  game.projectiles.forEach(proj => {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = "black";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(FOOD_TYPES[proj.foodType].icon, proj.x, proj.y+4);
  });

  // Draw players
  game.players.forEach(player => {
    if (!player.alive) return;
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI*2);
   ctx.fill();
    // Eyes direction indicator
    const eyeX = player.x + Math.cos(player.facingAngle) * 10;
    const eyeY = player.y + Math.sin(player.facingAngle) * 10;
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, 5, 0, Math.PI*2);
    ctx.fill();
    // Name label
    ctx.fillStyle = "#fff";
    ctx.font = "14px Nunito";
    ctx.textAlign = "center";
    ctx.fillText(player.name, player.x, player.y - 25);
    // Health bar
    const barWidth = 40;
    const barY = player.y - 15;
    ctx.fillStyle = "red";
    ctx.fillRect(player.x - barWidth/2, barY, barWidth, 4);
    ctx.fillStyle = "#2ed573";
    ctx.fillRect(player.x - barWidth/2, barY, barWidth * (player.health/100), 4);
  });

  // Minimap
  if (minimapCtx) {
    minimapCtx.clearRect(0, 0, 120, 120);
    minimapCtx.fillStyle = "rgba(0,0,0,0.5)";
    minimapCtx.fillRect(0, 0, 120, 120);
    game.players.forEach(p => {
      if (p.alive) {
        const mx = (p.x / GAME_WIDTH) * 120;
        const my = (p.y / GAME_HEIGHT) * 120;
        minimapCtx.fillStyle = p.color;
        minimapCtx.beginPath();
        minimapCtx.arc(mx, my, 3, 0, Math.PI*2);
        minimapCtx.fill();
      }
    });
  }
}

// -------------------- GAME LOOP --------------------
let lastTime = 0;
function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // cap delta
  lastTime = timestamp;

  if (game && !game.matchOver) {
    game.update(dt);
  }
  drawGame();

  requestAnimationFrame(gameLoop);
}

// -------------------- UI SCREEN ACTIONS --------------------
function startMatchWithSettings() {
  hideAllScreens();
  game = new Game(gameSettings);
  game.init();
  showScreen("gameHUD");
  // Countdown
  screens.matchCountdown.classList.remove("hidden");
  let count = 3;
  screens.countdownNumber.textContent = count;
  const countdownInterval = setInterval(() => {
    count--;
    if (count > 0) {
      screens.countdownNumber.textContent = count;
    } else {
      clearInterval(countdownInterval);
      screens.matchCountdown.classList.add("hidden");
      // game starts (already running)
    }
  }, 1000);
}

function showPostMatch(winner, localPlayerId) {
  hideAllScreens();
  showScreen("postMatchScreen");
  document.getElementById("resultTitle").textContent = winner ? `${winner.name} Wins!` : "Draw!";
  // fake stats
  document.getElementById("resultElims").textContent = winner ? 3 : 0;
  document.getElementById("resultDamage").textContent = winner ? 850 : 200;
  document.getElementById("resultXP").textContent = "250";
  document.getElementById("resultCoins").textContent = "80";
}

// -------------------- SETUP & EVENT BINDINGS --------------------
window.addEventListener("load", () => {
  canvas = document.getElementById("gameCanvas");
  ctx = canvas.getContext("2d");
  canvas.width = GAME_WIDTH;
  canvas.height = GAME_HEIGHT;
  minimapCanvas = document.getElementById("minimapCanvas");
  minimapCtx = minimapCanvas.getContext("2d");

  setupInput();

  // Main menu buttons
  document.getElementById("playBtn").addEventListener("click", () => {
    document.getElementById("modeSubmenu").classList.toggle("hidden");
  });
  document.getElementById("quickMatchBtn").addEventListener("click", () => {
    showScreen("lobbyScreen");
    updateLobby();
  });
  document.getElementById("createRoomBtn").addEventListener("click", () => {
    showScreen("lobbyScreen");
    updateLobby();
  });
  document.getElementById("joinRoomBtn").addEventListener("click", () => {
    showScreen("lobbyScreen");
    updateLobby();
  });

  // Profile / Cosmetics / Settings (simple)
  document.getElementById("profileBtn").addEventListener("click", () => showScreen("profilePanel"));
  document.getElementById("cosmeticsBtn").addEventListener("click", () => showScreen("cosmeticsPanel"));
  document.getElementById("settingsBtn").addEventListener("click", () => showScreen("settingsPanel"));
  document.querySelectorAll(".btn-back").forEach(btn => btn.addEventListener("click", () => showScreen("mainMenu")));
  document.getElementById("logoutBtn").addEventListener("click", () => showScreen("mainMenu"));

  // Lobby start
  document.getElementById("startMatchBtn").addEventListener("click", startMatchWithSettings);
  document.getElementById("leaveLobbyBtn").addEventListener("click", () => showScreen("mainMenu"));
  document.getElementById("copyRoomBtn").addEventListener("click", () => alert("Room code copied!"));

  // Post-match
  document.getElementById("playAgainBtn").addEventListener("click", startMatchWithSettings);
  document.getElementById("backToMenuBtn").addEventListener("click", () => showScreen("mainMenu"));

  // Initially show menu
  showScreen("mainMenu");

  // Start game loop
  requestAnimationFrame(gameLoop);
});

function updateLobby() {
  document.getElementById("roomCodeDisplay").textContent = "#" + Math.random().toString(36).substr(2,4).toUpperCase();
  const list = document.getElementById("playerList");
  list.innerHTML = "";
  // Show two human players
  const p1 = document.createElement("div"); p1.className = "player-slot";
  p1.innerHTML = `<span class="avatar">😎</span> You (Host) <span class="ready-badge">✔</span>`;
  list.appendChild(p1);
  const p2 = document.createElement("div"); p2.className = "player-slot";
  p2.innerHTML = `<span class="avatar">🕹️</span> Player 2 <span class="ready-badge">✔</span>`;
  list.appendChild(p2);
  // Maybe bot slots
  for (let i = 0; i < 2; i++) {
    const bot = document.createElement("div"); bot.className = "player-slot";
    bot.innerHTML = `<span class="avatar">🤖</span> Bot ${i+1} <span class="ready-badge">✔</span>`;
    list.appendChild(bot);
  }
}
