// =========================================================
// === Core Constants and DOM Elements ===
// =========================================================

// Размер сетки
const SIZE = 20; 

// Константа скорости (мс между шагами)
const BASE_TICK_MS = 70; 

// Единая константа смены цвета / свечения
const COLOR_CHANGE_RATE = 3; 

// Параметры для эффекта Шепарда (12 полутонов)
const HALF_STEPS = [
    261.63, 277.18, 293.66, 311.13, 329.63, 349.23,
    369.99, 392.00, 415.30, 440.00, 466.16, 493.88 
]; // Частоты от C4 до B4
const SHEPARDS_OCTAVES = 3; // Количество октав, которые будут звучать одновременно

// Цвета неона
const NEON_COLORS = {
    2: { bg: '#00ffff', glow: '0 0 3px #00ffff', text: '#002020' },
    4: { bg: '#00ff7f', glow: '0 0 4px #00ff7f', text: '#002010' },
    8: { bg: '#ff00ff', glow: '0 0 5px #ff00ff', text: '#200020' },
    16: { bg: '#ff3366', glow: '0 0 7px #ff3366', text: '#20050c' },
    32: { bg: '#ffcc00', glow: '0 0 9px #ffcc00', text: '#201800' },
    64: { bg: '#ffff00', glow: '0 0 12px #ffff00', text: '#202000' },
    128: { bg: '#00ff99', glow: '0 0 14px #00ff99', text: '#002012' },
    256: { bg: '#9933ff', glow: '0 0 16px #9933ff', text: '#120520' },
    512: { bg: '#ff6600', glow: '0 0 18px #ff6600', text: '#200c00' },
    1024: { bg: '#ff0000', glow: '0 0 20px #ff0000', text: '#200000' },
    2048: { bg: '#ffe100ff', glow: '0 0 25px #ffffff', text: '#000000' },
};

const FALLBACK_COLOR = { bg: '#ff0000', glow: '0 0 15px #ff0000' };
const HEAD_COLOR_KEYS = Object.keys(NEON_COLORS).map(Number);

const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const game = document.getElementById("game");
const gridBg = document.querySelector(".grid-bg");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best-score");
const levelEl = document.getElementById("level"); 
const newGameBtn = document.getElementById("newgame");
const soundToggle = document.getElementById("sound-toggle");

// Overlay
const startOverlay = document.createElement('div'); 
startOverlay.id = 'start-overlay';
startOverlay.innerHTML = `
    <div id="start-card">
        <h2 id="start-title">SNAKE — CyberPunk</h2>
        <p id="start-score" style="margin-top: 10px; font-size: 20px; font-weight: bold; color: var(--color-gold);"></p>
        <p id="start-message"></p>
    </div>
`;
game.appendChild(startOverlay);

const startTitle = startOverlay.querySelector('#start-title');
const startMessage = startOverlay.querySelector('#start-message');
const startScore = startOverlay.querySelector('#start-score');

// =========================================================
// === Game State ===
// =========================================================

let snake = [];
let food = { x: 0, y: 0 };
let currentDirection = 'right';
let nextDirection = 'right';
let isGameStarted = false; 

let score = 0;
let level = 1;
let bestScore = parseInt(localStorage.getItem("snake_best") || "0", 10) || 0;
let soundOn = (localStorage.getItem("snake_sound") || "1") === "1"; 

let foodCountInCycle = 0; 

// Для rAF
let lastTime = 0;
let accumulator = 0;

// =========================================================
// === Layout & Rendering ===
// =========================================================

let cellSize = 0;
let cellGap = 0;
let gridPadLeft = 0;
let gridPadTop = 0;

function setupGridCells() {
    gridBg.style.gridTemplateColumns = `repeat(${SIZE}, 1fr)`;
    gridBg.style.gridTemplateRows = `repeat(${SIZE}, 1fr)`;
    gridBg.innerHTML = '';
    
    for (let i = 0; i < SIZE * SIZE; i++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.setAttribute("role", "gridcell");
        gridBg.appendChild(cell);
    }

    Array.from(game.children).forEach(child => {
        if (child.id !== 'start-overlay' && child.className !== 'grid-bg') {
            child.remove();
        }
    });
}
setupGridCells();

function getTilePosition(x, y) {
    const transformX = gridPadLeft + x * (cellSize + cellGap);
    const transformY = gridPadTop + y * (cellSize + cellGap);
    return `translate(${transformX}px, ${transformY}px)`;
}

function recalcLayout() {
    const cs = getComputedStyle(gridBg);
    const pad = parseFloat(cs.paddingLeft);
    const firstCell = gridBg.querySelector('.cell');
    if (!firstCell) return;
    const cellRect = firstCell.getBoundingClientRect();
    cellSize = Math.round(cellRect.width); 
    cellGap = parseFloat(cs.gap || 14); 
    gridPadLeft = pad;
    gridPadTop = pad;

    const borderRadius = `${Math.max(4, Math.round(cellSize * 0.1))}px`; 
    const allTiles = game.querySelectorAll('.tile');
    allTiles.forEach(el => {
        el.style.width = el.style.height = `${cellSize}px`;
        el.style.borderRadius = borderRadius;
        const coords = el.dataset.coords ? el.dataset.coords.split(',').map(Number) : [0, 0];
        el.style.transform = getTilePosition(coords[0], coords[1]);
    });
}

// =========================================================
// === Audio ===
// =========================================================
let audioCtx = null;
const getAudioContext = () => {
    if (!audioCtx) {
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    }
    return audioCtx;
};

// Функция для проигрывания одиночного тона (для Game Over)
function playBeep(frequency, duration = 0.4) {
    if (!soundOn || !frequency) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const now = ctx.currentTime;
    o.type = 'sine';
    o.frequency.setValueAtTime(frequency, now);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.2, now + 0.01);
    g.gain.linearRampToValueAtTime(0, now + duration * 0.8);
    o.connect(g).connect(ctx.destination);
    o.start(now);
    o.stop(now + duration);
}

// Новая функция для проигрывания тона Шепарда
function playShepardTone(stepIndex, duration = 0.08) {
    if (!soundOn) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    for (let i = 0; i < SHEPARDS_OCTAVES; i++) {
        // Вычисляем абсолютный индекс в 12-ступенчатом цикле
        const absoluteIndex = (stepIndex + i * HALF_STEPS.length) % HALF_STEPS.length; 
        const baseFreq = HALF_STEPS[absoluteIndex];
        const frequency = baseFreq * Math.pow(2, i); // Частота для текущей октавы

        // Вычисляем громкость (амплитуду) в зависимости от положения в цикле
        // Чем ближе к '0' или '11' (высокий), тем тише. Чем ближе к середине, тем громче.
        const positionInCycle = (stepIndex + i * HALF_STEPS.length) % (SHEPARDS_OCTAVES * HALF_STEPS.length);
        const relativePosition = positionInCycle / (SHEPARDS_OCTAVES * HALF_STEPS.length - 1); // 0 до 1
        const amplitude = 0.15 * Math.sin(relativePosition * Math.PI) * Math.sin(relativePosition * Math.PI); // Квадратичная кривая

        if (amplitude > 0.001) {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sawtooth'; // Пилообразная волна для более насыщенного звука
            o.frequency.setValueAtTime(frequency, now);

            g.gain.setValueAtTime(0, now);
            g.gain.linearRampToValueAtTime(amplitude, now + 0.01);
            g.gain.linearRampToValueAtTime(0, now + duration * 0.9);
            
            o.connect(g).connect(ctx.destination);
            o.start(now);
            o.stop(now + duration);
        }
    }
}

const toneGameOver = 220; 

// =========================================================
// === Snake Logic ===
// =========================================================

function checkCollision(head) {
    if (head.x < 0 || head.x >= SIZE || head.y < 0 || head.y >= SIZE) return true;
    for (let i = 1; i < snake.length; i++) {
        if (head.x === snake[i].x && head.y === snake[i].y) return true;
    }
    return false;
}

function updateLevel() {
    const newLevel = Math.floor(snake.length / 5) + 1;
    if (newLevel !== level) {
        level = newLevel;
    }
}

// =========================================================
// === Tile Management ===
// =========================================================

function createSegment(x, y, isHead = false, glowLevel = 1, headColorKey = HEAD_COLOR_KEYS[0]) {
    const el = document.createElement("div");
    el.className = `tile`;
    el.dataset.coords = `${x},${y}`; 
    
    const borderRadius = `${Math.max(4, Math.round(cellSize * 0.1))}px`;
    const color = NEON_COLORS[headColorKey].bg;
    
    if (isHead) {
        const headGlow = NEON_COLORS[headColorKey].glow;
        el.classList.add('snake-head');
        Object.assign(el.style, {
            backgroundColor: 'transparent', 
            borderColor: color,
            boxShadow: `${headGlow}, inset 0 0 14px ${color}`, 
        });
    } else {
        const maxInnerGlowRadius = 8; 
        const currentInnerGlow = Math.round(maxInnerGlowRadius * (glowLevel / COLOR_CHANGE_RATE)); 
        el.classList.add('snake-body');
        Object.assign(el.style, {
            backgroundColor: 'transparent', 
            borderColor: color, 
            boxShadow: `inset 0 0 ${currentInnerGlow}px ${color}`,
        });
    }

    Object.assign(el.style, {
        width: `${cellSize}px`,
        height: `${cellSize}px`,
        borderRadius: borderRadius, 
        left: '0px', 
        top: '0px',
        transform: getTilePosition(x, y), 
        transition: "transform 0.1s ease-out, box-shadow 0.25s ease-in-out"
    });

    game.appendChild(el);
    return { x, y, el };
}

function createFood(x, y) {
    const el = document.createElement("div");
    el.className = `tile food`;
    el.dataset.coords = `${x},${y}`; 
    const borderRadius = `${Math.max(4, Math.round(cellSize * 0.1))}px`;
    const colorIndex = Math.floor(foodCountInCycle / COLOR_CHANGE_RATE) % HEAD_COLOR_KEYS.length;
    const snakeColorKey = HEAD_COLOR_KEYS[colorIndex];
    const colorObj = NEON_COLORS[snakeColorKey] || FALLBACK_COLOR;
    
    Object.assign(el.style, {
        width: `${cellSize}px`,
        height: `${cellSize}px`,
        borderRadius: borderRadius, 
        left: '0px', 
        top: '0px',
        transform: getTilePosition(x, y), 
        zIndex: 1003,
        backgroundColor: colorObj.bg, 
        borderColor: colorObj.bg,
        boxShadow: `0 0 16px ${colorObj.bg},0 0 56px ${colorObj.bg}, ${colorObj.glow}, inset 0 0 20px ${colorObj.bg}`, 
        animation: 'pulse 1s infinite alternate',
    });
    
    game.appendChild(el);
    return el;
}

function placeFood() {
    let newFood;
    do {
        newFood = { 
            x: Math.floor(Math.random() * SIZE), 
            y: Math.floor(Math.random() * SIZE) 
        };
    } while (snake.some(segment => segment.x === newFood.x && segment.y === newFood.y));
    
    food = newFood;
    food.el = createFood(food.x, food.y); 
}

// =========================================================
// === Game Loop ===
// =========================================================

function createBurstEffect(x, y, color) {
    const burstEl = document.createElement("div");
    burstEl.className = `data-burst`;
    
    // Рассчитываем абсолютную позицию в пикселях вручную
    const posX = gridPadLeft + x * (cellSize + cellGap);
    const posY = gridPadTop + y * (cellSize + cellGap);

    // Применяем позицию через left/top, а transform оставляем для анимации
    Object.assign(burstEl.style, {
        left: `${posX}px`,
        top: `${posY}px`,
        width: `${cellSize}px`,
        height: `${cellSize}px`,
    });
    
    // Устанавливаем цвет через CSS-переменную
    burstEl.style.setProperty('--burst-color', color);
    
    game.appendChild(burstEl);
    
    // Удаляем элемент после завершения анимации (350 мс)
    setTimeout(() => {
        burstEl.remove();
    }, 350);
}

function gameLoop() {
    currentDirection = nextDirection;
    const newHead = { ...snake[0], el: null }; 
    switch (currentDirection) {
        case 'up': newHead.y -= 1; break;
        case 'down': newHead.y += 1; break;
        case 'left': newHead.x -= 1; break;
        case 'right': newHead.x += 1; break;
    }

    if (checkCollision(newHead)) {
        gameOver();
        return;
    }

    snake.unshift(newHead);

    let isEaten = false;
    if (newHead.x === food.x && newHead.y === food.y) {
        score += 10;
        
        // --- НОВАЯ ЛОГИКА МЕЛОДИИ ШЕПАРДА ---
        // Используем foodCountInCycle для шага по 12 полутонам
        foodCountInCycle++; 
        const shepardStep = (foodCountInCycle - 1) % HALF_STEPS.length;
        playShepardTone(shepardStep); 
        // ------------------------------

        const colorIndex = Math.floor(foodCountInCycle / COLOR_CHANGE_RATE) % HEAD_COLOR_KEYS.length;
        const headColorKey = HEAD_COLOR_KEYS[colorIndex];
        const colorObj = NEON_COLORS[headColorKey] || FALLBACK_COLOR;
        
        // 1. Создаем вспышку на координатах съеденной еды
        createBurstEffect(food.x, food.y, colorObj.bg);

        // 2. Удаляем DOM-элемент еды явно
        const oldFood = game.querySelector('.tile.food');
        if (oldFood) oldFood.remove(); 
        
        placeFood(); 
        updateLevel();
        isEaten = true;
    } else {
        const tail = snake.pop();
        if (tail.el) tail.el.remove();
    }

    const glowLevel = (foodCountInCycle % COLOR_CHANGE_RATE) + 1;
    const colorIndex = Math.floor(foodCountInCycle / COLOR_CHANGE_RATE) % HEAD_COLOR_KEYS.length; 
    const headColorKey = HEAD_COLOR_KEYS[colorIndex];

    updateSnakeElements(isEaten, glowLevel, headColorKey); 
    updateHUD();
}

function updateSnakeElements(isEaten, glowLevel, headColorKey) {
    const color = NEON_COLORS[headColorKey].bg;

    snake.forEach((segment, index) => {
        if (!segment.el) {
            // создаём новый DOM только для тех, у кого нет
            segment.el = createSegment(segment.x, segment.y, index === 0, glowLevel, headColorKey).el;
        }

        segment.el.dataset.coords = `${segment.x},${segment.y}`;
        segment.el.style.transform = getTilePosition(segment.x, segment.y);

        if (index === 0) {
            // голова
            segment.el.className = "tile snake-head";
            segment.el.style.boxShadow = `${NEON_COLORS[headColorKey].glow}, inset 0 0 14px ${color}`;
        } else {
            // тело
            segment.el.className = "tile snake-body";
            const maxInnerGlowRadius = 8; 
            const currentInnerGlow = Math.round(maxInnerGlowRadius * (glowLevel / COLOR_CHANGE_RATE));
            segment.el.style.boxShadow = `inset 0 0 ${currentInnerGlow}px ${color}`;
        }
    });

    if (isEaten) {
        // при росте у хвоста может не быть el
        const tail = snake[snake.length - 1];
        if (!tail.el) {
            tail.el = createSegment(tail.x, tail.y, false, glowLevel, headColorKey).el;
        }
    }
}

// =========================================================
// === HUD & Overlay ===
// =========================================================

function updateHUD() {
    scoreEl.textContent = score;
    levelEl.textContent = level;
    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem("snake_best", String(bestScore));
    }
    bestEl.textContent = bestScore;
}

function showStartOverlay(isGameOver = false) {
    startOverlay.classList.add('visible');
    game.style.pointerEvents = "none";
    if (isGameOver) {
        startTitle.textContent = "ИГРА ОКОНЧЕНА";
        startMessage.textContent = isMobile ? 'Нажмите, чтобы начать заново' : 'Нажмите Enter, чтобы начать заново';
        startScore.textContent = `Ваш счёт: ${score}`;
        startOverlay.classList.add('gameover');
    } else {
        startTitle.textContent = "SNAKE — CyberPunk";
        startMessage.textContent = isMobile ? 'Нажмите, чтобы начать' : 'Нажмите Enter, чтобы начать';
        startScore.textContent = "";
        startOverlay.classList.remove('gameover');
    }
}
function hideStartOverlay() {
    startOverlay.classList.remove('visible');
    game.style.pointerEvents = "";
}
function gameOver() {
    isGameStarted = false; 
    showStartOverlay(true); 
    playBeep(toneGameOver, 0.4); // Используем playBeep для одиночного тона Game Over
}

// =========================================================
// === Init & Loop ===
// =========================================================

function initGame() {
    isGameStarted = false; 
    recalcLayout(); 
    game.querySelectorAll('.tile').forEach(el => el.remove());
    snake = [
        { x: Math.floor(SIZE / 2), y: Math.floor(SIZE / 2), el: null }, 
        { x: Math.floor(SIZE / 2) - 1, y: Math.floor(SIZE / 2), el: null }
    ];
    currentDirection = 'right';
    nextDirection = 'right';
    score = 0;
    level = 1;
    foodCountInCycle = 0; 
    const initialGlowLevel = 1;
    const initialHeadColorKey = HEAD_COLOR_KEYS[0];
    snake.forEach((segment, index) => {
        segment.el = createSegment(segment.x, segment.y, index === 0, initialGlowLevel, initialHeadColorKey).el;
    });
    placeFood(); 
    updateHUD();
}

function startGame() {
    if (isGameStarted) return;
    isGameStarted = true;
    hideStartOverlay(); 
    lastTime = 0;
    accumulator = 0;
    requestAnimationFrame(loop);
}

function loop(timestamp) {
    if (!isGameStarted) return;
    if (!lastTime) lastTime = timestamp;
    const delta = timestamp - lastTime;
    lastTime = timestamp;
    accumulator += delta;
    // Частота обновления игры
    while (accumulator >= BASE_TICK_MS) {
        gameLoop();
        accumulator -= BASE_TICK_MS;
    }
    requestAnimationFrame(loop);
}

// =========================================================
// === Controls ===
// =========================================================

document.addEventListener("keydown", (e) => {
    if (!isGameStarted && e.key === 'Enter') {
        e.preventDefault();
        if (startOverlay.classList.contains('visible')) {
             initGame();
        }
        startGame();
        return;
    }
    if (!isGameStarted) return;
    const keyMap = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
    const newDir = keyMap[e.key];
    if (newDir) {
        e.preventDefault();
        const isOpposite = (currentDirection === 'up' && newDir === 'down') ||
                           (currentDirection === 'down' && newDir === 'up') ||
                           (currentDirection === 'left' && newDir === 'right') ||
                           (currentDirection === 'right' && newDir === 'left');
        if (!isOpposite) nextDirection = newDir;
    }
});

let touchStart = null;
startOverlay.addEventListener("click", () => {
    if (startOverlay.classList.contains('visible')) {
        initGame();
        startGame();
    }
});
game.addEventListener("touchstart", (e) => {
    if (e.touches.length > 1) return;
    if (!isGameStarted && !startOverlay.classList.contains('visible')) {
        initGame(); startGame(); return;
    }
    if (startOverlay.classList.contains('visible')) return;
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    e.preventDefault();
}, { passive: false });
window.addEventListener("touchend", (e) => {
    if (!touchStart || !isGameStarted) return;
    const touchEnd = e.changedTouches[0];
    const dx = touchEnd.clientX - touchStart.x;
    const dy = touchEnd.clientY - touchStart.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (Math.max(absX, absY) > 20) { 
        let newDir = null;
        if (absX > absY) newDir = dx > 0 ? "right" : "left";
        else newDir = dy > 0 ? "down" : "up";
        const isOpposite = (currentDirection === 'up' && newDir === 'down') ||
                           (currentDirection === 'down' && newDir === 'up') ||
                           (currentDirection === 'left' && newDir === 'right') ||
                           (currentDirection === 'right' && newDir === 'left');
        if (newDir && !isOpposite) nextDirection = newDir;
    }
    touchStart = null;
    e.preventDefault();
}, { passive: false });

newGameBtn?.addEventListener("click", () => {
    initGame(); 
    showStartOverlay(); 
});

const soundOnSVG = `
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M5 9v6h4l5 5V4l-5 5H5z" stroke="#E455AE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M17 9 A3 3 0 0 1 17 15" stroke="#E455AE" stroke-width="2" stroke-linecap="round" fill="none"/>
  </svg>`;
const soundOffSVG = `
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M5 9v6h4l5 5V4l-5 5H5z" stroke="#E455AE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
function updateSoundIcon() {
    if (soundOn) {
        soundToggle.innerHTML = soundOnSVG;
        soundToggle.setAttribute('aria-pressed', 'true');
    } else {
        soundToggle.innerHTML = soundOffSVG;
        soundToggle.setAttribute('aria-pressed', 'false');
    }
}
soundToggle.addEventListener("click", () => {
    soundOn = !soundOn;
    localStorage.setItem("snake_sound", soundOn ? "1" : "0");
    updateSoundIcon();
});

// Resize handlers
window.addEventListener("resize", () => setTimeout(recalcLayout, 300));
window.addEventListener("orientationchange", () => setTimeout(recalcLayout, 350));
window.addEventListener('load', () => {
    recalcLayout();
    initGame(); 
    showStartOverlay(); 
    updateSoundIcon();
});