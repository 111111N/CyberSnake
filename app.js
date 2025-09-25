// =========================================================
// === Core Constants and DOM Elements ===
// =========================================================

// Размер сетки 10x10
const SIZE = 10; 
const GAME_SPEED = 100; // Скорость 100мс для плавного движения

const DEFAULT_GAP = 14; 
const MIN_CELL_PX = 30; 

// Переменная для изменения количества съеденной еды для смены цвета.
const FOOD_COLOR_CHANGE_RATE = 3; 

// Цвета, взятые из стилей 2048
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

// Извлекаем цвета в массив для циклического использования еды
const FOOD_COLOR_CYCLE = Object.values(NEON_COLORS); 
// Цвет по умолчанию для конца цикла (красный)
const FALLBACK_COLOR = { bg: '#ff0000', glow: '0 0 15px #ff0000' };

// Ключи цветов головы/хвоста, которые будут циклически меняться
const HEAD_COLOR_KEYS = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048]; 

const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
// DOM Elements
const game = document.getElementById("game");
const gridBg = document.querySelector(".grid-bg");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best-score");
const levelEl = document.getElementById("level"); 
const newGameBtn = document.getElementById("newgame");
const soundToggle = document.getElementById("sound-toggle");

// Динамическое создание оверлеев
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
// === Game State (Snake Logic) ===
// =========================================================

let snake = [];
let food = { x: 0, y: 0 };
let currentDirection = 'right';
let nextDirection = 'right';
let gameLoopInterval = null;
let isGameStarted = false; 

let score = 0;
let level = 1;
let bestScore = parseInt(localStorage.getItem("snake_best") || "0", 10) || 0;
let soundOn = (localStorage.getItem("2048_sound") || "1") === "1";
let isAnimating = false;

let foodCountInCycle = 0; // Счётчик для свечения хвоста (1-4) и смены цвета еды/головы

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

// Пересчет размеров и позиций тайлов змейки/еды.
function recalcLayout() {
    const cs = getComputedStyle(gridBg);
    const pad = parseFloat(cs.paddingLeft);
    
    // Определяем cellSize по фактическому размеру ячейки CSS Grid, 
    // чтобы избежать ошибок округления при ресайзе/смене ориентации.
    const firstCell = gridBg.querySelector('.cell');
    if (!firstCell) return;

    // Используем фактический размер ячейки, округленный для надежности
    const cellRect = firstCell.getBoundingClientRect();
    cellSize = Math.round(cellRect.width); 
    
    // Читаем gap из CSS Grid
    const gap = parseFloat(cs.gap || DEFAULT_GAP);
    cellGap = gap;
    
    gridPadLeft = pad;
    gridPadTop = pad;

    // Возвращаем динамический border-radius
    const borderRadius = `${Math.max(4, Math.round(cellSize * 0.1))}px`; 

    // Обновляем размеры и положение ВСЕХ тайлов (змея и еда)
    const allTiles = game.querySelectorAll('.tile');
    allTiles.forEach(el => {
        el.style.width = el.style.height = `${cellSize}px`;
        el.style.borderRadius = borderRadius;
        
        // Читаем координаты из data-атрибута (x,y)
        const coords = el.dataset.coords ? el.dataset.coords.split(',').map(Number) : [0, 0];
        el.style.transform = getTilePosition(coords[0], coords[1]);
    });
}

// =========================================================
// === Audio and Helpers ===
// =========================================================
let audioCtx = null;
const getAudioContext = () => {
    if (!audioCtx) {
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    }
    return audioCtx;
};
const toneEat = 440; 
const toneGameOver = 220; 
function playBeep(frequency, duration = 0.08) {
    if (!soundOn || !frequency) return;
    const ctx = getAudioContext();
    if (!ctx || ctx.state === 'suspended') return;
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
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

function checkCollision(head) {
    if (head.x < 0 || head.x >= SIZE || head.y < 0 || head.y >= SIZE) { return true; }
    for (let i = 1; i < snake.length; i++) {
        if (head.x === snake[i].x && head.y === snake[i].y) { return true; }
    }
    return false;
}

function getGameSpeed() {
    const baseSpeed = GAME_SPEED;
    const speedDecrease = 5 * Math.floor(snake.length / 5); 
    return Math.max(80, baseSpeed - speedDecrease); 
}

function updateLevel() {
    const newLevel = Math.floor(snake.length / 5) + 1;
    if (newLevel !== level) {
        level = newLevel;
        if (gameLoopInterval) clearInterval(gameLoopInterval);
        gameLoopInterval = setInterval(gameLoop, getGameSpeed());
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
        const currentInnerGlow = Math.round(maxInnerGlowRadius * (glowLevel / 4)); 
        
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
    });

    game.appendChild(el);
    return { x, y, el };
}

function createFood(x, y) {
    const el = document.createElement("div");
    el.className = `tile food`;
    el.dataset.coords = `${x},${y}`; 
    
    const borderRadius = `${Math.max(4, Math.round(cellSize * 0.1))}px`;

    const snakeColorIndex = Math.floor(foodCountInCycle / FOOD_COLOR_CHANGE_RATE) % HEAD_COLOR_KEYS.length;
    const snakeColorKey = HEAD_COLOR_KEYS[snakeColorIndex];
    const snakeColorObj = NEON_COLORS[snakeColorKey];
    
    let baseIndex = FOOD_COLOR_CYCLE.findIndex(color => color.bg === snakeColorObj.bg);
    let nextColorIndex = (baseIndex + 1) % FOOD_COLOR_CYCLE.length;
    
    let colorObj = FOOD_COLOR_CYCLE[nextColorIndex];
    
    if (!colorObj) {
        colorObj = FALLBACK_COLOR;
    }
    
    const foodColor = colorObj.bg;
    const foodGlow = colorObj.glow;

    // >> ИСПРАВЛЕНИЕ: Гарантируем заполнение цветом
    Object.assign(el.style, {
        width: `${cellSize}px`,
        height: `${cellSize}px`,
        borderRadius: borderRadius, 
        left: '0px', 
        top: '0px',
        transform: getTilePosition(x, y), 
        zIndex: 1003,
        
        // 1. Устанавливаем фон как цвет неона
        backgroundColor: foodColor, 
        borderColor: foodColor, // Оставляем, чтобы избежать проблем с общим стилем .tile
        
        // 2. Усиливаем свечение с помощью внутреннего и внешнего свечения, чтобы подчеркнуть заполнение
        boxShadow: `0 0 10px ${foodColor}, ${foodGlow}, inset 0 0 20px ${foodColor}`, 
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
    
    const oldFood = game.querySelector('.tile.food');
    if (oldFood) oldFood.remove(); 
    
    food = newFood;
    food.el = createFood(food.x, food.y); 
}

// =========================================================
// === Game Logic ===
// =========================================================

function gameLoop() {
    if (isAnimating) return; 

    currentDirection = nextDirection;
    const newHead = { ...snake[0] };
    
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
        playBeep(toneEat);
        
        foodCountInCycle++; 
        
        placeFood(); 
        updateLevel();
        isEaten = true;
        
    } else {
        const tail = snake.pop();
        if (tail.el) tail.el.remove();
    }

    // Расчет параметров визуала
    const glowLevel = (foodCountInCycle % 4) + 1;
    const colorIndex = Math.floor(foodCountInCycle / FOOD_COLOR_CHANGE_RATE) % HEAD_COLOR_KEYS.length; 
    const headColorKey = HEAD_COLOR_KEYS[colorIndex];

    updateSnakeElements(isEaten, glowLevel, headColorKey); 
    updateHUD();
}

function updateSnakeElements(isEaten, glowLevel, headColorKey) {
    const color = NEON_COLORS[headColorKey].bg;
    
    // 1. Старая голова становится телом
    if (snake.length > 1 && snake[1].el) {
        const oldHeadEl = snake[1].el;
        
        oldHeadEl.classList.remove('snake-head');
        oldHeadEl.classList.add('snake-body');
        
        const maxInnerGlowRadius = 8; 
        const currentInnerGlow = Math.round(maxInnerGlowRadius * (glowLevel / 4)); 

        Object.assign(oldHeadEl.style, {
            backgroundColor: 'transparent', 
            borderColor: color, 
            boxShadow: `inset 0 0 ${currentInnerGlow}px ${color}`,
        });

        oldHeadEl.dataset.coords = `${snake[1].x},${snake[1].y}`;
    }
    
    // 2. Создается НОВЫЙ элемент для новой головы
    const newHeadEl = createSegment(snake[0].x, snake[0].y, true, glowLevel, headColorKey).el;
    snake[0].el = newHeadEl;
    
    // 3. Обновление позиций
    snake.forEach((segment, index) => {
        if (!segment.el) {
             segment.el = createSegment(segment.x, segment.y, index === 0, glowLevel, headColorKey).el;
        }
        segment.el.style.transform = getTilePosition(segment.x, segment.y);
        segment.el.dataset.coords = `${segment.x},${segment.y}`;
    });
}


// =========================================================
// === Main Game Loop & Overlays ===
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
    clearInterval(gameLoopInterval);
    gameLoopInterval = null; 
    
    showStartOverlay(true); 
    
    playBeep(toneGameOver, 0.4);
}


function initGame() {
    if (gameLoopInterval) clearInterval(gameLoopInterval);
    gameLoopInterval = null;
    isGameStarted = false; 

    // Вызываем пересчет перед созданием элементов
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
    
    if (gameLoopInterval) clearInterval(gameLoopInterval);
    gameLoopInterval = setInterval(gameLoop, getGameSpeed());
}

// =========================================================
// === Event Listeners (с адаптацией под мобильные) ===
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
    
    if (!isGameStarted || !gameLoopInterval) return;

    const keyMap = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
    const newDir = keyMap[e.key];

    if (newDir) {
        e.preventDefault();
        const isOpposite = (currentDirection === 'up' && newDir === 'down') ||
                           (currentDirection === 'down' && newDir === 'up') ||
                           (currentDirection === 'left' && newDir === 'right') ||
                           (currentDirection === 'right' && newDir === 'left');
        
        if (!isOpposite) {
            nextDirection = newDir;
        }
    }
});

let touchStart = null;

startOverlay.addEventListener("click", () => {
    if (startOverlay.classList.contains('visible')) {
        if (gameLoopInterval === null) {
            initGame();
        }
        startGame();
    }
});


game.addEventListener("touchstart", (e) => {
    if (e.touches.length > 1) return;
    
    if (!isGameStarted && !startOverlay.classList.contains('visible')) {
        if (gameLoopInterval === null) {
            initGame();
        }
        startGame();
        return;
    }
    
    if (startOverlay.classList.contains('visible')) return;
    
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    e.preventDefault();
}, { passive: false });

window.addEventListener("touchend", (e) => {
    if (!touchStart || !isGameStarted || !gameLoopInterval) return;
    const touchEnd = e.changedTouches[0];
    const dx = touchEnd.clientX - touchStart.x;
    const dy = touchEnd.clientY - touchStart.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (Math.max(absX, absY) > 20) { 
        let newDir = null;
        if (absX > absY) {
            newDir = dx > 0 ? "right" : "left";
        } else {
            newDir = dy > 0 ? "down" : "up";
        }
        const isOpposite = (currentDirection === 'up' && newDir === 'down') ||
                           (currentDirection === 'down' && newDir === 'up') ||
                           (currentDirection === 'left' && newDir === 'right') ||
                           (currentDirection === 'right' && newDir === 'left');
        
        if (newDir && !isOpposite) {
            nextDirection = newDir;
        }
    }
    touchStart = null;
    e.preventDefault();
}, { passive: false });

newGameBtn?.addEventListener("click", () => {
    initGame(); 
    showStartOverlay(); 
});

const soundOnSVG = `
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <path d="M5 9v6h4l5 5V4l-5 5H5z" stroke="#E455AE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M17 9 A3 3 0 0 1 17 15" stroke="#E455AE" stroke-width="2" stroke-linecap="round" fill="none"/>
  </svg>`;

const soundOffSVG = `
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
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
    localStorage.setItem("2048_sound", soundOn ? "1" : "0");
    updateSoundIcon();
});

// Увеличен таймаут для надежного ресайза на мобильных
window.addEventListener("resize", () => setTimeout(recalcLayout, 300));
window.addEventListener("orientationchange", () => setTimeout(recalcLayout, 350));

window.addEventListener('load', () => {
    recalcLayout();
    initGame(); 
    showStartOverlay(); 
    updateSoundIcon();
});