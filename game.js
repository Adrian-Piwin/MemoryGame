const VERSION = "1.3.0";

const ANIMALS = [
  "bear",
  "buffalo",
  "chick",
  "chicken",
  "cow",
  "crocodile",
  "dog",
  "duck",
  "elephant",
  "frog",
  "giraffe",
  "goat",
  "gorilla",
  "hippo",
  "horse",
  "monkey",
  "moose",
  "narwhal",
  "owl",
  "panda",
  "parrot",
  "penguin",
  "pig",
  "rabbit",
  "rhino",
  "sloth",
  "snake",
  "walrus",
  "whale",
  "zebra",
];

const MODES = {
  easy: { pairs: 6, cols: 3, label: "Easy", previewSeconds: 8 },
  medium: { pairs: 8, cols: 4, label: "Medium", previewSeconds: 4 },
  hard: { pairs: 12, cols: 6, label: "Hard", previewSeconds: 2 },
};

const CONFETTI_COLORS = [
  "#FF5DA2",
  "#FFD93D",
  "#5BCCFF",
  "#7DFFB3",
  "#FF9F45",
  "#C77DFF",
  "#FFF56B",
  "#FF6B6B",
  "#4ECDC4",
];

const setupEl = document.getElementById("setup");
const playEl = document.getElementById("play");
const boardEl = document.getElementById("board");
const boardShell = document.querySelector(".board-shell");
const movesEl = document.getElementById("moves");
const timerEl = document.getElementById("timer");
const pairsEl = document.getElementById("pairs");
const winModal = document.getElementById("win-modal");
const winSummary = document.getElementById("win-summary");
const previewBanner = document.getElementById("preview-banner");
const previewCount = document.getElementById("preview-count");
const muteBtn = document.getElementById("mute-btn");
const muteBtnPlay = document.getElementById("mute-btn-play");
const confettiCanvas = document.getElementById("confetti-canvas");
const startBtn = document.getElementById("start-btn");
const versionLabel = document.getElementById("version-label");

if (versionLabel) versionLabel.textContent = `v${VERSION}`;

const imageCache = new Map();
let assetsReady = null;

let selectedMode = "medium";
let deck = [];
let flipped = [];
let matchedCount = 0;
let moves = 0;
let lockBoard = false;
let previewing = false;
let timerId = null;
let previewTimeoutId = null;
let previewIntervalId = null;
let fitRaf = 0;
let lockedGrid = null; // keep cols/rows stable for the whole round
let seconds = 0;
let started = false;

/* ---------------- Sounds (Web Audio — no asset files) ---------------- */

const sfx = {
  ctx: null,
  muted: localStorage.getItem("animal-match-muted") === "1",

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  },

  tone(freq, start, dur, type = "sine", gain = 0.08) {
    if (this.muted || !this.ctx) return;
    const t0 = this.ctx.currentTime + start;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  },

  flip() {
    this.unlock();
    this.tone(520, 0, 0.06, "triangle", 0.045);
    this.tone(740, 0.03, 0.05, "sine", 0.03);
  },

  match() {
    this.unlock();
    // Bright cartoon "yay" arpeggio
    this.tone(523.25, 0, 0.1, "triangle", 0.09);
    this.tone(659.25, 0.07, 0.1, "triangle", 0.09);
    this.tone(783.99, 0.14, 0.12, "triangle", 0.1);
    this.tone(1046.5, 0.22, 0.18, "sine", 0.08);
    this.tone(1318.5, 0.28, 0.12, "square", 0.03);
  },

  miss() {
    this.unlock();
    this.tone(220, 0, 0.12, "triangle", 0.05);
    this.tone(180, 0.08, 0.14, "sine", 0.04);
  },

  win() {
    this.unlock();
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
    notes.forEach((freq, i) => {
      this.tone(freq, i * 0.09, 0.16, i % 2 ? "sine" : "triangle", 0.09);
    });
  },
};

function updateMuteButton() {
  const on = !sfx.muted;
  const label = on ? "Sound on" : "Sound off";
  const pressed = sfx.muted ? "true" : "false";
  const title = on ? "Mute sounds" : "Unmute sounds";
  [muteBtn, muteBtnPlay].forEach((btn) => {
    if (!btn) return;
    btn.setAttribute("aria-pressed", pressed);
    btn.textContent = label;
    btn.title = title;
    btn.classList.toggle("is-on", on);
    btn.classList.toggle("is-off", !on);
  });
}

function toggleMute() {
  sfx.muted = !sfx.muted;
  localStorage.setItem("animal-match-muted", sfx.muted ? "1" : "0");
  updateMuteButton();
  if (!sfx.muted) {
    sfx.unlock();
    sfx.flip();
  }
}

/* ---------------- Confetti (single canvas — cheap) ---------------- */

const confetti = {
  ctx: null,
  particles: [],
  raf: 0,
  dpr: 1,
  lastTs: 0,

  ensure() {
    if (!confettiCanvas || this.ctx) return;
    this.ctx = confettiCanvas.getContext("2d", { alpha: true });
    this.resize();
    window.addEventListener("resize", () => this.resize(), { passive: true });
  },

  resize() {
    if (!confettiCanvas || !this.ctx) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    confettiCanvas.width = Math.floor(w * this.dpr);
    confettiCanvas.height = Math.floor(h * this.dpr);
    confettiCanvas.style.width = `${w}px`;
    confettiCanvas.style.height = `${h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  },

  burst(x, y, amount = 70) {
    if (prefersReducedMotion()) return;
    this.ensure();
    for (let i = 0; i < amount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 11;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (2 + Math.random() * 5),
        g: 0.18 + Math.random() * 0.12,
        w: 5 + Math.random() * 8,
        h: 7 + Math.random() * 10,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.45,
        color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
        shape: (Math.random() * 3) | 0, // 0 rect, 1 circle, 2 ribbon
        life: 1,
        decay: 0.012 + Math.random() * 0.014,
      });
    }
    if (!this.raf) {
      this.lastTs = 0;
      this.raf = requestAnimationFrame((ts) => this.tick(ts));
    }
  },

  tick(ts) {
    if (!this.ctx) return;
    const dt = this.lastTs ? Math.min(32, ts - this.lastTs) / 16.67 : 1;
    this.lastTs = ts;

    const w = window.innerWidth;
    const h = window.innerHeight;
    this.ctx.clearRect(0, 0, w, h);

    const next = [];
    for (let i = 0; i < this.particles.length; i += 1) {
      const p = this.particles[i];
      p.vy += p.g * dt;
      p.vx *= 0.99;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0 || p.y > h + 40) continue;

      this.ctx.save();
      this.ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate(p.rot);
      this.ctx.fillStyle = p.color;

      if (p.shape === 1) {
        this.ctx.beginPath();
        this.ctx.arc(0, 0, p.w * 0.55, 0, Math.PI * 2);
        this.ctx.fill();
      } else if (p.shape === 2) {
        this.ctx.fillRect(-p.w * 0.2, -p.h * 0.6, p.w * 0.4, p.h);
      } else {
        this.ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      this.ctx.restore();
      next.push(p);
    }

    this.particles = next;
    if (this.particles.length) {
      this.raf = requestAnimationFrame((t) => this.tick(t));
    } else {
      this.ctx.clearRect(0, 0, w, h);
      this.raf = 0;
      this.lastTs = 0;
    }
  },
};

/* ---------------- Image preload / decode ---------------- */

function animalSrc(name) {
  return `assets/animals/${name}.png`;
}

function preloadAnimals(names = ANIMALS) {
  const jobs = names.map(async (name) => {
    if (imageCache.has(name)) return imageCache.get(name);
    const img = new Image();
    img.decoding = "async";
    img.src = animalSrc(name);
    try {
      await img.decode();
    } catch {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      }).catch(() => {});
    }
    imageCache.set(name, img);
    return img;
  });
  return Promise.all(jobs);
}

assetsReady = preloadAnimals();

/* ---------------- Game helpers ---------------- */

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickAnimals(count) {
  return shuffle(ANIMALS).slice(0, count);
}

function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = String(totalSeconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

function getCards() {
  return [...boardEl.querySelectorAll(".card")];
}

function updateHud() {
  const totalPairs = MODES[selectedMode].pairs;
  movesEl.textContent = String(moves);
  timerEl.textContent = formatTime(seconds);
  pairsEl.textContent = `${matchedCount}/${totalPairs}`;
}

function stopTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

function clearPreviewTimers() {
  if (previewTimeoutId) {
    clearTimeout(previewTimeoutId);
    previewTimeoutId = null;
  }
  if (previewIntervalId) {
    clearInterval(previewIntervalId);
    previewIntervalId = null;
  }
}

function startTimer() {
  stopTimer();
  timerId = setInterval(() => {
    seconds += 1;
    timerEl.textContent = formatTime(seconds);
  }, 1000);
}

function createCard(animal, index) {
  const button = document.createElement("button");
  button.className = "card";
  button.type = "button";
  button.dataset.animal = animal;
  button.dataset.index = String(index);
  button.setAttribute("aria-label", "Hidden animal card");

  const inner = document.createElement("div");
  inner.className = "card-inner";

  const back = document.createElement("div");
  back.className = "card-face card-back";
  back.setAttribute("aria-hidden", "true");

  const front = document.createElement("div");
  front.className = "card-face card-front";

  const img = document.createElement("img");
  img.alt = animal;
  img.draggable = false;
  img.decoding = "async";
  img.width = 128;
  img.height = 96;
  // Reuse decoded cache entry so the browser does not re-fetch/re-decode
  const cached = imageCache.get(animal);
  img.src = cached?.src || animalSrc(animal);

  front.appendChild(img);
  inner.append(back, front);
  button.appendChild(inner);
  button.addEventListener("click", () => onCardClick(button));
  return button;
}

const SHELL_INSET = 8;

function evenFactors(total) {
  const colsOptions = [];
  for (let cols = 1; cols <= total; cols += 1) {
    if (total % cols === 0) colsOptions.push(cols);
  }
  return colsOptions;
}

function gapFor(cols, rows, availableW, availableH) {
  return Math.max(4, Math.min(10, Math.round(Math.min(availableW / cols, availableH / rows) * 0.04)));
}

/** Prefer max square size; break ties with grids that match the shell aspect. */
function bestGrid(total, availableW, availableH) {
  const shellAspect = availableW / Math.max(availableH, 1);
  let best = null;

  evenFactors(total).forEach((cols) => {
    const rows = total / cols;
    const gap = gapFor(cols, rows, availableW, availableH);
    const size = Math.min(
      (availableW - gap * (cols - 1)) / cols,
      (availableH - gap * (rows - 1)) / rows
    );
    if (size < 28) return;

    const gridAspect = cols / rows;
    const aspectDelta = Math.abs(Math.log(gridAspect / shellAspect));
    const score = size * 1000 - aspectDelta * 50;

    if (!best || score > best.score) {
      best = { cols, rows, gap, size, score };
    }
  });

  if (best) return best;

  const fallbackCols = MODES[selectedMode].cols;
  return {
    cols: fallbackCols,
    rows: Math.ceil(total / fallbackCols),
    gap: 6,
    size: 40,
    score: 0,
  };
}

function cardSizeFor(cols, rows, availableW, availableH, gap) {
  let size = Math.floor(
    Math.min(
      (availableW - gap * (cols - 1)) / cols,
      (availableH - gap * (rows - 1)) / rows
    )
  );
  while (
    size > 28 &&
    (cols * size + gap * (cols - 1) > availableW || rows * size + gap * (rows - 1) > availableH)
  ) {
    size -= 1;
  }
  return Math.max(28, size);
}

/** @returns {boolean} true when the board was sized successfully */
function fitBoard({ relock = false } = {}) {
  if (playEl.classList.contains("is-hidden") || !boardShell || deck.length === 0) {
    return false;
  }

  const availableW = Math.floor(boardShell.clientWidth) - SHELL_INSET * 2;
  const availableH = Math.floor(boardShell.clientHeight) - SHELL_INSET * 2;
  if (availableW < 40 || availableH < 40) return false;

  if (relock || !lockedGrid) {
    const picked = bestGrid(deck.length, availableW, availableH);
    lockedGrid = { cols: picked.cols, rows: picked.rows };
  }

  const { cols, rows } = lockedGrid;
  const gap = gapFor(cols, rows, availableW, availableH);
  const cardSize = cardSizeFor(cols, rows, availableW, availableH, gap);
  const boardW = cols * cardSize + gap * (cols - 1);
  const boardH = rows * cardSize + gap * (rows - 1);

  boardEl.dataset.cols = String(cols);
  boardEl.style.setProperty("--cols", String(cols));
  boardEl.style.setProperty("--rows", String(rows));
  boardEl.style.setProperty("--board-gap", `${gap}px`);
  boardEl.style.setProperty("--card-size", `${cardSize}px`);
  boardEl.style.setProperty("--board-w", `${boardW}px`);
  boardEl.style.setProperty("--board-h", `${boardH}px`);
  return true;
}

function scheduleFitBoard({ relock = false } = {}) {
  if (fitRaf) cancelAnimationFrame(fitRaf);

  const run = (attemptsLeft, shouldRelock) => {
    fitRaf = requestAnimationFrame(() => {
      fitRaf = 0;
      const ok = fitBoard({ relock: shouldRelock });
      if (!ok && attemptsLeft > 0) {
        run(attemptsLeft - 1, shouldRelock);
      } else if (ok && shouldRelock) {
        // One settle pass after first successful lock (fonts/flex)
        fitRaf = requestAnimationFrame(() => {
          fitRaf = 0;
          fitBoard({ relock: false });
        });
      }
    });
  };

  run(12, relock);
}

function buildBoard() {
  const { pairs, cols } = MODES[selectedMode];
  const animals = pickAnimals(pairs);
  deck = shuffle([...animals, ...animals]);
  boardEl.replaceChildren();
  boardEl.dataset.cols = String(cols);
  boardEl.style.setProperty("--cols", String(cols));
  boardEl.style.setProperty("--rows", String(Math.ceil((pairs * 2) / cols)));

  const frag = document.createDocumentFragment();
  deck.forEach((animal, index) => {
    frag.appendChild(createCard(animal, index));
  });
  boardEl.appendChild(frag);
}

function revealAllCards() {
  getCards().forEach((card) => {
    card.classList.add("is-flipped");
    card.setAttribute("aria-label", `${card.dataset.animal} card`);
  });
}

function hideAllCards() {
  getCards().forEach((card) => {
    card.classList.remove("is-flipped");
    card.setAttribute("aria-label", "Hidden animal card");
  });
}

function endPreview() {
  clearPreviewTimers();
  previewing = false;
  lockBoard = false;
  boardEl.classList.remove("is-previewing");
  previewBanner.classList.add("is-hidden");
  hideAllCards();
  // Banner slot stays reserved — no reflow / no position change
}

function startPreview() {
  const { previewSeconds } = MODES[selectedMode];
  let remaining = previewSeconds;

  clearPreviewTimers();
  previewing = true;
  lockBoard = true;
  boardEl.classList.add("is-previewing");
  previewBanner.classList.remove("is-hidden");
  previewCount.textContent = String(remaining);
  revealAllCards();
  scheduleFitBoard({ relock: true });

  previewIntervalId = setInterval(() => {
    remaining -= 1;
    previewCount.textContent = String(Math.max(remaining, 0));
    if (remaining <= 0) {
      clearInterval(previewIntervalId);
      previewIntervalId = null;
    }
  }, 1000);

  previewTimeoutId = setTimeout(endPreview, previewSeconds * 1000);
}

function resetRoundState() {
  flipped = [];
  matchedCount = 0;
  moves = 0;
  lockBoard = false;
  previewing = false;
  seconds = 0;
  started = false;
  lockedGrid = null;
  stopTimer();
  clearPreviewTimers();
  boardEl.classList.remove("is-previewing");
  previewBanner.classList.add("is-hidden");
  updateHud();
}

function showPlay() {
  setupEl.classList.add("is-hidden");
  playEl.classList.remove("is-hidden");
  winModal.classList.add("is-hidden");
  document.body.classList.add("is-playing");
}

function showSetup() {
  playEl.classList.add("is-hidden");
  setupEl.classList.remove("is-hidden");
  winModal.classList.add("is-hidden");
  document.body.classList.remove("is-playing");
  stopTimer();
  clearPreviewTimers();
  previewing = false;
  boardEl.classList.remove("is-previewing");
  previewBanner.classList.add("is-hidden");
  startBtn.disabled = false;
  startBtn.textContent = "Start game";
}

async function startGame() {
  sfx.unlock();
  resetRoundState();
  startBtn.disabled = true;
  startBtn.textContent = "Loading…";

  try {
    await assetsReady;
  } catch {
    // Continue even if a couple images fail — cards still have src fallbacks
  }

  buildBoard();
  showPlay();
  startBtn.disabled = false;
  startBtn.textContent = "Start game";
  startPreview();
}

function celebrateMatch(first, second) {
  first.classList.add("is-matched", "is-match-pop");
  second.classList.add("is-matched", "is-match-pop");
  pairsEl.classList.remove("is-pair-pulse");
  void pairsEl.offsetWidth;
  pairsEl.classList.add("is-pair-pulse");

  sfx.match();

  const a = first.getBoundingClientRect();
  const b = second.getBoundingClientRect();
  const cx = (a.left + a.right + b.left + b.right) / 4;
  const cy = (a.top + a.bottom + b.top + b.bottom) / 4;
  confetti.burst(cx, cy, 80);

  const clearPop = () => {
    first.classList.remove("is-match-pop");
    second.classList.remove("is-match-pop");
  };
  first.addEventListener("animationend", clearPop, { once: true });
  setTimeout(clearPop, 550);
}

function onCardClick(card) {
  if (
    previewing ||
    lockBoard ||
    card.classList.contains("is-flipped") ||
    card.classList.contains("is-matched")
  ) {
    return;
  }

  if (!started) {
    started = true;
    startTimer();
  }

  sfx.flip();
  card.classList.add("is-flipped");
  card.setAttribute("aria-label", `${card.dataset.animal} card`);
  flipped.push(card);

  if (flipped.length < 2) return;

  moves += 1;
  updateHud();
  const [first, second] = flipped;

  if (first.dataset.animal === second.dataset.animal) {
    first.disabled = true;
    second.disabled = true;
    flipped = [];
    matchedCount += 1;
    updateHud();
    celebrateMatch(first, second);

    if (matchedCount === MODES[selectedMode].pairs) {
      stopTimer();
      winSummary.textContent = `${MODES[selectedMode].label} cleared in ${moves} moves · ${formatTime(seconds)}`;
      setTimeout(() => {
        confetti.burst(window.innerWidth / 2, window.innerHeight * 0.35, 140);
        sfx.win();
        winModal.classList.remove("is-hidden");
      }, 500);
    }
    return;
  }

  lockBoard = true;
  first.classList.add("is-mismatch");
  second.classList.add("is-mismatch");
  sfx.miss();

  setTimeout(() => {
    first.classList.remove("is-flipped", "is-mismatch");
    second.classList.remove("is-flipped", "is-mismatch");
    first.setAttribute("aria-label", "Hidden animal card");
    second.setAttribute("aria-label", "Hidden animal card");
    flipped = [];
    lockBoard = false;
  }, 550);
}

function setMode(mode) {
  selectedMode = mode;
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.mode === mode);
  });
}

document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

startBtn.addEventListener("click", () => {
  sfx.unlock();
  startGame();
});
document.getElementById("restart-btn").addEventListener("click", showSetup);
document.getElementById("play-again-btn").addEventListener("click", startGame);
document.getElementById("change-mode-btn").addEventListener("click", showSetup);

muteBtn?.addEventListener("click", toggleMute);
muteBtnPlay?.addEventListener("click", toggleMute);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !winModal.classList.contains("is-hidden")) {
    winModal.classList.add("is-hidden");
  }
});

window.addEventListener("resize", () => scheduleFitBoard({ relock: true }), { passive: true });
window.addEventListener("orientationchange", () => scheduleFitBoard({ relock: true }));
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => scheduleFitBoard({ relock: true }), {
    passive: true,
  });
}

if (boardShell && typeof ResizeObserver !== "undefined") {
  let lastShellKey = "";
  const shellObserver = new ResizeObserver(() => {
    if (playEl.classList.contains("is-hidden") || deck.length === 0) return;
    const key = `${boardShell.clientWidth}x${boardShell.clientHeight}`;
    if (key === lastShellKey) return;
    lastShellKey = key;
    scheduleFitBoard({ relock: true });
  });
  shellObserver.observe(boardShell);
}

// Unlock audio on first tap anywhere (mobile autoplay policies)
document.addEventListener(
  "pointerdown",
  () => {
    sfx.unlock();
  },
  { once: true, passive: true }
);

updateMuteButton();
confetti.ensure();
