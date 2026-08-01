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
  easy: { pairs: 6, cols: 3, label: "Easy" },
  medium: { pairs: 8, cols: 4, label: "Medium" },
  hard: { pairs: 12, cols: 6, label: "Hard" },
};

const setupEl = document.getElementById("setup");
const playEl = document.getElementById("play");
const boardEl = document.getElementById("board");
const movesEl = document.getElementById("moves");
const timerEl = document.getElementById("timer");
const pairsEl = document.getElementById("pairs");
const winModal = document.getElementById("win-modal");
const winSummary = document.getElementById("win-summary");

let selectedMode = "medium";
let deck = [];
let flipped = [];
let matchedCount = 0;
let moves = 0;
let lockBoard = false;
let timerId = null;
let seconds = 0;
let started = false;

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
  button.innerHTML = `
    <span class="card-inner">
      <span class="card-face card-back" aria-hidden="true"></span>
      <span class="card-face card-front">
        <img src="assets/animals/${animal}.png" alt="${animal}" draggable="false" />
      </span>
    </span>
  `;
  button.addEventListener("click", () => onCardClick(button));
  return button;
}

function buildBoard() {
  const { pairs, cols } = MODES[selectedMode];
  const animals = pickAnimals(pairs);
  deck = shuffle([...animals, ...animals]);
  boardEl.innerHTML = "";
  boardEl.dataset.cols = String(cols);
  deck.forEach((animal, index) => {
    boardEl.appendChild(createCard(animal, index));
  });
}

function resetRoundState() {
  flipped = [];
  matchedCount = 0;
  moves = 0;
  lockBoard = false;
  seconds = 0;
  started = false;
  stopTimer();
  updateHud();
}

function showPlay() {
  setupEl.classList.add("is-hidden");
  playEl.classList.remove("is-hidden");
  winModal.classList.add("is-hidden");
}

function showSetup() {
  playEl.classList.add("is-hidden");
  setupEl.classList.remove("is-hidden");
  winModal.classList.add("is-hidden");
  stopTimer();
}

function startGame() {
  resetRoundState();
  buildBoard();
  showPlay();
}

function onCardClick(card) {
  if (lockBoard || card.classList.contains("is-flipped") || card.classList.contains("is-matched")) {
    return;
  }

  if (!started) {
    started = true;
    startTimer();
  }

  card.classList.add("is-flipped");
  card.setAttribute("aria-label", `${card.dataset.animal} card`);
  flipped.push(card);

  if (flipped.length < 2) return;

  moves += 1;
  updateHud();
  const [first, second] = flipped;

  if (first.dataset.animal === second.dataset.animal) {
    first.classList.add("is-matched");
    second.classList.add("is-matched");
    first.disabled = true;
    second.disabled = true;
    flipped = [];
    matchedCount += 1;
    updateHud();

    if (matchedCount === MODES[selectedMode].pairs) {
      stopTimer();
      winSummary.textContent = `${MODES[selectedMode].label} cleared in ${moves} moves · ${formatTime(seconds)}`;
      winModal.classList.remove("is-hidden");
    }
    return;
  }

  lockBoard = true;
  first.classList.add("is-mismatch");
  second.classList.add("is-mismatch");

  setTimeout(() => {
    first.classList.remove("is-flipped", "is-mismatch");
    second.classList.remove("is-flipped", "is-mismatch");
    first.setAttribute("aria-label", "Hidden animal card");
    second.setAttribute("aria-label", "Hidden animal card");
    flipped = [];
    lockBoard = false;
  }, 700);
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

document.getElementById("start-btn").addEventListener("click", startGame);
document.getElementById("restart-btn").addEventListener("click", showSetup);
document.getElementById("play-again-btn").addEventListener("click", startGame);
document.getElementById("change-mode-btn").addEventListener("click", showSetup);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !winModal.classList.contains("is-hidden")) {
    winModal.classList.add("is-hidden");
  }
});
