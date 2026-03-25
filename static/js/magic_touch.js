// Global Variables
const video = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const gameArea = document.getElementById('game-area');
const scoreValue = document.getElementById('score-value');
const livesContainer = document.getElementById('lives-container');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreEl = document.getElementById('final-score');
const startBtn = document.getElementById('start-game-btn');
const restartBtn = document.getElementById('restart-game-btn');
const popSound = document.getElementById('pop-sound');
const hurtSound = document.getElementById('hurt-sound');
const currentPredictionEl = document.getElementById('current-prediction');

let isPlaying = false;
let score = 0;
let lives = 3;
let enemies = [];
let spawnInterval;
let gameLoopRef;
let spawnRate = 4000;
let enemySpeed = 0.6;

// Debounce & Cooldown variables
let consecutiveFrames = 0;
let currentPredictedLetter = null;
let cooldownActive = false;
const DEBOUNCE_THRESHOLD = 2; // Must hold for 5 consecutive frames
const CONFIDENCE_THRESHOLD = 0.70;
const COOLDOWN_MS = 0;

// Webcam setup
if (startBtn) startBtn.disabled = true;
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            video.srcObject = stream;
            video.play();
            if (startBtn) {
                startBtn.disabled = false;
                startBtn.innerText = "Play Now";
            }
        })
        .catch(err => {
            console.error("Camera error", err);
            if (startBtn) startBtn.innerText = "Camera Access Denied";
        });
}

// Event Listeners
if (startBtn) startBtn.addEventListener('click', startGame);
if (restartBtn) restartBtn.addEventListener('click', startGame);

function startGame() {
    isPlaying = true;
    score = 0;
    lives = 3;
    enemies.forEach(e => { if (e.element) e.element.remove(); });
    enemies = [];
    spawnRate = 4000;
    enemySpeed = 0.6;

    updateScoreUI();
    updateLivesUI();

    startScreen.style.display = 'none';
    gameOverScreen.style.display = 'none';

    // Start Spawner
    scheduleSpawn();

    // Start Loops
    gameLoopRef = requestAnimationFrame(gameLoop);
    predictLoop(); // asynchronous loop
}

function stopGame() {
    isPlaying = false;
    clearTimeout(spawnInterval);
    cancelAnimationFrame(gameLoopRef);
    finalScoreEl.innerText = score;
    gameOverScreen.style.display = 'flex';
}

function scheduleSpawn() {
    if (!isPlaying) return;
    spawnInterval = setTimeout(() => {
        spawnEnemy();
        // Speed up over time to increase difficulty
        spawnRate = Math.max(800, spawnRate * 0.98);
        enemySpeed += 0.05;
        scheduleSpawn();
    }, spawnRate);
}

function spawnEnemy() {
    // Determine type: 80% Grunt (1 letter), 20% Boss (3 to 5 letters)
    let isBoss = Math.random() < 0.2;
    let wordLength = isBoss ? Math.floor(Math.random() * 3) + 3 : 1;
    let word = "";
    for (let i = 0; i < wordLength; i++) {
        // Random A-Z
        word += String.fromCharCode(65 + Math.floor(Math.random() * 26));
    }

    const enemyEl = document.createElement('div');
    enemyEl.classList.add('enemy');
    if (isBoss) enemyEl.classList.add('boss');

    const balloonContainer = document.createElement('div');
    balloonContainer.classList.add('balloon-container');

    let balloonEls = [];
    for (let i = 0; i < word.length; i++) {
        const b = document.createElement('div');
        b.classList.add('balloon');
        b.innerText = word[i];
        balloonContainer.appendChild(b);
        balloonEls.push({ letter: word[i], element: b });
    }

    const stringEl = document.createElement('div');
    stringEl.classList.add('string');

    const characterEl = document.createElement('div');
    characterEl.classList.add('enemy-character');

    enemyEl.appendChild(balloonContainer);
    enemyEl.appendChild(stringEl);
    enemyEl.appendChild(characterEl);

    // Pick a random X position within bounds (taking width into account)
    const randomX = Math.random() * 80 + 10;
    enemyEl.style.left = `${randomX}%`;
    enemyEl.style.top = `-100px`; // start above screen

    gameArea.appendChild(enemyEl);

    enemies.push({
        element: enemyEl,
        x: randomX,
        y: -100,
        speed: enemySpeed * (isBoss ? 0.7 : 1.0), // Bosses drop slightly slower
        word: word,
        balloons: balloonEls, // Array of remaining balloons
        isBoss: isBoss
    });
}

function gameLoop() {
    if (!isPlaying) return;

    // Update active enemies based on their y positions
    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];
        e.y += e.speed;
        e.element.style.top = `${e.y}px`;

        // Check ground collision
        const areaHeight = gameArea.clientHeight;
        if (e.y > areaHeight) {
            // Hit the bottom, deduct life if not defeated
            e.element.remove();
            enemies.splice(i, 1);
            if (!e.isDefeated) {
                loseLife();
            }
        }
    }

    gameLoopRef = requestAnimationFrame(gameLoop);
}

function updateExpectedLetter() {
    let lowestEnemy = null;
    let highestY = -Infinity;

    // The enemy furthest down the screen with at least one balloon left
    for (const e of enemies) {
        if (e.y > highestY && e.balloons.length > 0) {
            highestY = e.y;
            lowestEnemy = e;
        }
    }

    if (lowestEnemy) {
        currentExpectedLetter = lowestEnemy.balloons[0].letter;
    } else {
        currentExpectedLetter = null;
    }
}

function playSound(audioEl) {
    if (audioEl) {
        audioEl.currentTime = 0;
        audioEl.play().catch(e => console.log(e));
    }
}

function loseLife() {
    playSound(hurtSound);
    lives--;
    updateLivesUI();

    // CSS visual feedback for life lost
    livesContainer.classList.remove('pulse');
    void livesContainer.offsetWidth; // trigger reflow
    livesContainer.classList.add('pulse');

    if (lives <= 0) {
        stopGame();
        // Server integration removed temporarily to decouple from main app lives
        // fetch('/decrement_life', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
        //    .catch(err => console.error(err));
    }
}

function updateScoreUI() {
    scoreValue.innerText = score;
}

function updateLivesUI() {
    livesContainer.innerHTML = '';
    for (let i = 0; i < 3; i++) {
        const icon = document.createElement('i');
        icon.className = i < lives ? 'fa-solid fa-heart life-icon' : 'fa-regular fa-heart life-icon';
        livesContainer.appendChild(icon);
    }
}

// --- Frame by Frame AI Processing Loop ---
async function predictLoop() {
    if (!isPlaying) return;

    // Draw the current video frame into a canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));

    if (!blob) {
        requestAnimationFrame(predictLoop);
        return;
    }

    const formData = new FormData();
    formData.append('image', blob, 'snapshot.jpg');

    try {
        const res = await fetch('/predict', { method: 'POST', body: formData });
        if (res.ok) {
            const data = await res.json();
            handlePrediction(data.result, data.confidence);
        }
    } catch (e) {
        console.error("Prediction error", e);
    }

    // Add a tiny delay between requests to avoid overloading but keep it "real-time"
    setTimeout(predictLoop, 50);
}

function handlePrediction(letter, confidence) {
    // Present visual feedback of the current guess inside the webcam corner widget
    const cfPercent = Math.round(confidence * 100);
    currentPredictionEl.innerText = `${letter} (${cfPercent}%)`;

    if (confidence > CONFIDENCE_THRESHOLD) {
        currentPredictionEl.classList.add('confident');
    } else {
        currentPredictionEl.classList.remove('confident');
    }

    // AI Game Logic:

    // 1. If we recently popped an item, ignore inputs during transition cooldown
    if (cooldownActive) return;

    // 2. Find if the currently predicted letter matches the first balloon of ANY enemy
    let targetEnemy = null;
    let highestY = -Infinity;

    for (let i = 0; i < enemies.length; i++) {
        let e = enemies[i];
        if (e.balloons.length > 0 && e.balloons[0].letter === letter) {
            if (e.y > highestY) {
                highestY = e.y;
                targetEnemy = e;
            }
        }
    }

    // 3. Debouncing Logic
    if (targetEnemy && confidence > CONFIDENCE_THRESHOLD) {
        if (letter === currentPredictedLetter) {
            consecutiveFrames++;
        } else {
            currentPredictedLetter = letter;
            consecutiveFrames = 1;
        }

        if (consecutiveFrames >= DEBOUNCE_THRESHOLD) {
            // Detected solidly! Register attack.
            registerHit(targetEnemy);

            // Immediately reset frame tracking
            consecutiveFrames = 0;
            currentPredictedLetter = null;

            // Set cooldown to give player time to switch hands to the next sign
            cooldownActive = true;
            setTimeout(() => {
                cooldownActive = false;
            }, COOLDOWN_MS);
        }
    } else {
        // Immediate reset on wrong guess or low confidence
        consecutiveFrames = 0;
        currentPredictedLetter = null;
    }
}

function registerHit(targetEnemy) {
    playSound(popSound);

    let poppedBalloon = targetEnemy.balloons.shift(); // take the first balloon out

    // CSS pop class applies a zoom-out fade animation
    poppedBalloon.element.classList.add('popping');
    setTimeout(() => {
        if (poppedBalloon.element.parentNode) {
            poppedBalloon.element.parentNode.removeChild(poppedBalloon.element);
        }
    }, 200);

    // Award point for the pop
    score += 10;
    updateScoreUI();

    // If that was their last balloon, enemy drops
    if (targetEnemy.balloons.length === 0) {
        targetEnemy.element.classList.add('falling');
        // Give them extreme dropping speed so they fall off map, giving score
        targetEnemy.speed += 15;
        targetEnemy.isDefeated = true;

        // Bonus points for fully defeating enemy (bosses give more)
        score += targetEnemy.isBoss ? 50 : 10;
        updateScoreUI();
    }
}
