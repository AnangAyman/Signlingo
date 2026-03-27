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
let lives = 5;
let enemies = [];
let spawnInterval;
let gameLoopRef;

// Progression Variables
let spawnRate = 4000;         // Stays firmly at 4 seconds
let enemySpeed = 0.15;        // Starts falling very slowly
let waveCount = 0;            // Tracks progression phase
let difficultyMultiplier = 1.0; 

// Debounce & Cooldown variables
let consecutiveFrames = 0;
let currentPredictedLetter = null;
let cooldownActive = false;
const DEBOUNCE_THRESHOLD = 2; 
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
    lives = 5;
    enemies.forEach(e => { if (e.element) e.element.remove(); });
    enemies = [];
    
    // Reset Progression
    spawnRate = 4000;
    enemySpeed = 0.15;
    waveCount = 0;
    difficultyMultiplier = 1.0;

    updateScoreUI();
    updateLivesUI();

    startScreen.style.display = 'none';
    gameOverScreen.style.display = 'none';

    scheduleSpawn();

    gameLoopRef = requestAnimationFrame(gameLoop);
    predictLoop();
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
        waveCount++;
        
        let enemiesToSpawn = 1;
        
        // Much slower and gentler ramp-up for multiple enemies
        if (waveCount > 15) {
            // After wave 15, 50% chance to spawn 2 enemies instead of 1
            enemiesToSpawn = Math.random() > 0.5 ? 2 : 1; 
        }
        if (waveCount > 30) {
            // After wave 30, small chance for 3 enemies, mostly 1 or 2
            let roll = Math.random();
            if (roll > 0.85) enemiesToSpawn = 3; // Only 15% chance for 3
            else if (roll > 0.4) enemiesToSpawn = 2;
            else enemiesToSpawn = 1;
        }
        
        for (let i = 0; i < enemiesToSpawn; i++) {
            // Increased stagger from 800ms to 1200ms so they drop further apart vertically
            setTimeout(() => {
                if (isPlaying) {
                    let safeX = getValidSpawnX();
                    spawnEnemy(safeX);
                }
            }, i * 1200); 
        }
        
        difficultyMultiplier += 0.05; 
        // Slightly slower speed acceleration
        enemySpeed = Math.min(2.0, enemySpeed + 0.015);

        scheduleSpawn();
    }, spawnRate);
}

// --- ANTI-OVERLAP LOGIC ---
function getValidSpawnX() {
    let attempts = 0;
    let minDistance = 18; 

    while (attempts < 20) {
        let testX = Math.random() * 70 + 15; 
        let hasConflict = false;

        for (let e of enemies) {
            if (e.y < 300) { 
                if (Math.abs(e.x - testX) < minDistance) {
                    hasConflict = true;
                    break;
                }
            }
        }

        if (!hasConflict) {
            return testX;
        }
        attempts++;
    }
    
    return Math.random() * 70 + 15; 
}

function spawnEnemy(startX) {
    let bossChance = waveCount > 5 ? Math.min(0.25, (waveCount - 5) * 0.02) : 0;
    let isBoss = Math.random() < bossChance;
    
    let wordLength = isBoss ? Math.floor(Math.random() * 3) + 2 : 1;
    let word = "";
    const allowedLetters = "ABCDEFHIJLMOPQRSTUVWXZ"; 
    for (let i = 0; i < wordLength; i++) {
        word += allowedLetters.charAt(Math.floor(Math.random() * allowedLetters.length));
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

    enemyEl.style.left = `${startX}%`;
    enemyEl.style.top = `-100px`; 

    gameArea.appendChild(enemyEl);

    enemies.push({
        element: enemyEl,
        x: startX, 
        y: -100,
        speed: enemySpeed * (isBoss ? 0.7 : 1.0), 
        word: word,
        balloons: balloonEls, 
        isBoss: isBoss,
        pointValueMultiplier: difficultyMultiplier 
    });
}

function gameLoop() {
    if (!isPlaying) return;

    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];
        e.y += e.speed;
        e.element.style.top = `${e.y}px`;

        const areaHeight = gameArea.clientHeight;
        if (e.y > areaHeight) {
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

    livesContainer.classList.remove('pulse');
    void livesContainer.offsetWidth; 
    livesContainer.classList.add('pulse');

    if (lives <= 0) {
        stopGame();
    }
}

function updateScoreUI() {
    scoreValue.innerText = score;
}

function updateLivesUI() {
    livesContainer.innerHTML = '';
    for (let i = 0; i < 5; i++) {
        const icon = document.createElement('i');
        icon.className = i < lives ? 'fa-solid fa-heart life-icon' : 'fa-regular fa-heart life-icon';
        livesContainer.appendChild(icon);
    }
}

// --- Frame by Frame AI Processing Loop ---
async function predictLoop() {
    if (!isPlaying) return;

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

    setTimeout(predictLoop, 50);
}

function handlePrediction(letter, confidence) {
    const cfPercent = Math.round(confidence * 100);
    if (currentPredictionEl) {
        currentPredictionEl.innerText = `${letter} (${cfPercent}%)`;
        
        if (confidence > CONFIDENCE_THRESHOLD) {
            currentPredictionEl.classList.add('confident');
        } else {
            currentPredictionEl.classList.remove('confident');
        }
    }

    if (cooldownActive) return;

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

    if (targetEnemy && confidence > CONFIDENCE_THRESHOLD) {
        if (letter === currentPredictedLetter) {
            consecutiveFrames++;
        } else {
            currentPredictedLetter = letter;
            consecutiveFrames = 1;
        }

        if (consecutiveFrames >= DEBOUNCE_THRESHOLD) {
            registerHit(targetEnemy);

            consecutiveFrames = 0;
            currentPredictedLetter = null;

            cooldownActive = true;
            setTimeout(() => {
                cooldownActive = false;
            }, COOLDOWN_MS);
        }
    } else {
        consecutiveFrames = 0;
        currentPredictedLetter = null;
    }
}

function registerHit(targetEnemy) {
    playSound(popSound);

    let poppedBalloon = targetEnemy.balloons.shift(); 

    poppedBalloon.element.classList.add('popping');
    setTimeout(() => {
        if (poppedBalloon.element.parentNode) {
            poppedBalloon.element.parentNode.removeChild(poppedBalloon.element);
        }
    }, 200);

    let pointsEarned = Math.floor(10 * targetEnemy.pointValueMultiplier);
    score += pointsEarned;
    updateScoreUI();

    if (targetEnemy.balloons.length === 0) {
        targetEnemy.element.classList.add('falling');
        targetEnemy.speed += 15;
        targetEnemy.isDefeated = true;

        let baseBonus = targetEnemy.isBoss ? 50 : 10;
        let bonusEarned = Math.floor(baseBonus * targetEnemy.pointValueMultiplier);
        score += bonusEarned;
        
        updateScoreUI();
    }
}