// --- Global Variables ---
const video = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const countdownEl = document.getElementById('countdown');
const resultEl = document.getElementById('result');
const startBtn = document.getElementById('start-btn');
const questionEl = document.getElementById('question');
const progressBarFill = document.getElementById('progress-bar');
const visualArea = document.querySelector('.quiz-visual-area');
const controlsContainer = document.getElementById('ml-controls');

let questionsAsked = 0;
let correctAnswersCount = 0;
const TOTAL_QUESTIONS = 10;
let correctAnswer;

const correctSound = document.getElementById('correct-sound');
const incorrectSound = document.getElementById('incorrect-sound');

let currentXP = parseInt(sessionStorage.getItem('levelXP') || 0);
document.getElementById('xp-count').innerText = currentXP + ' XP';

// --- Webcam Setup ---
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            video.srcObject = stream;
            video.play();
        })
        .catch(err => {
            console.error('Webcam error:', err);
            questionEl.innerText = 'Could not access webcam. Please allow camera access and refresh.';
            if (startBtn) startBtn.disabled = true;
        });
}

// --- Sound Helper ---
function playSound(soundElement) {
    if (soundElement) {
        soundElement.currentTime = 0;
        soundElement.play().catch(error => console.error("Error playing sound:", error));
    }
}

// --- Feedback Banner Logic ---
function showFeedbackBanner(isCorrect, correctAns) {
    const banner = document.getElementById('feedback-banner');
    const feedbackText = banner.querySelector('.feedback-text');

    banner.classList.remove('correct', 'incorrect');
    if (isCorrect) {
        banner.classList.add('correct');
        feedbackText.innerText = 'Great job!';
    } else {
        banner.classList.add('incorrect');
        feedbackText.innerText = `Incorrect!`;
    }
    banner.classList.add('show');
}

function hideFeedbackBanner() {
    document.getElementById('feedback-banner').classList.remove('show');
}

// --- Session Completion ---
async function mlGameSessionCompleted(lessonKey) {
    hideFeedbackBanner();
    visualArea.style.display = 'none';
    const disclaimer = document.querySelector('.webcam-disclaimer');
    if (disclaimer) disclaimer.style.display = 'none';

    questionEl.innerText = 'Practice Complete!';
    questionEl.classList.add('quiz-complete-title');

    const accuracy = (correctAnswersCount / TOTAL_QUESTIONS) * 100;
    const xpGained = correctAnswersCount * 10; // 10 XP per correct answer

    // --- Save ML results for summary ---
    try {
        await fetch('/save-session-results', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'ml',
                xp: xpGained,
                accuracy: accuracy,
                skipped: false
            })
        });
    } catch (error) {
        console.error('Failed to save ML results:', error);
    }

    // --- Mark lesson as complete for tracking ---
    if (lessonKey) {
        try {
            await fetch('/mark-lesson-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lesson_key: lessonKey, status: 'completed' })
            });
        } catch (error) {
            console.error('ML Logic: Error marking lesson complete:', error);
        }
    }

    // --- Redirect immediately to unified result summary ---
    window.location.href = '/result-summary';
}

// --- Load Question ---
async function loadQuestion() {
    if (questionsAsked >= TOTAL_QUESTIONS) {
        const gameContainer = document.querySelector('.quiz-card');
        const lessonKey = gameContainer ? gameContainer.dataset.lessonKey : null;
        mlGameSessionCompleted(lessonKey);
        return;
    }

    hideFeedbackBanner();

    try {
        const res = await fetch('/get-question-ml');
        if (!res.ok) throw new Error('Failed to fetch ML question.');

        const data = await res.json();
        correctAnswer = data.answer;
        questionEl.innerText = data.question;
        resultEl.textContent = '';

        questionsAsked++;
        updateProgress();

        startBtn.disabled = false;
        startBtn.style.display = 'block';
        startBtn.textContent = 'Start Pose Capture';
        startBtn.onclick = startCountdown;
    } catch (error) {
        console.error("ML Logic: Error loading question:", error);
        questionEl.innerText = 'Could not load ML challenge.';
        startBtn.disabled = true;
    }
}

// --- Countdown before capture ---
function startCountdown() {
    startBtn.disabled = true;
    resultEl.textContent = '';
    let count = 3;
    countdownEl.textContent = count;

    const interval = setInterval(() => {
        count--;
        countdownEl.textContent = count;
        if (count === 0) {
            clearInterval(interval);
            captureAndSend();
        }
    }, 1000);
}

// --- Capture Webcam Frame and Send for Prediction ---
async function captureAndSend() {
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async blob => {
        if (!blob) {
            console.error("ML Logic: Failed to create blob.");
            return;
        }

        const formData = new FormData();
        formData.append('image', blob, 'snapshot.jpg');

        try {
            const res = await fetch('/predict', { method: 'POST', body: formData });
            if (!res.ok) throw new Error('Prediction request failed.');

            const data = await res.json();
            checkAnswer(data.result);
        } catch (err) {
            console.error("ML Logic: Error during prediction:", err);
            showFeedbackBanner(false, correctAnswer);
            startBtn.disabled = false;
            startBtn.textContent = 'Try Again';
        } finally {
            setTimeout(() => { countdownEl.textContent = ''; }, 1000);
        }
    }, 'image/jpeg');
}

// --- Check Model Answer ---
function checkAnswer(predictedLetter) {
    const isCorrect = predictedLetter === correctAnswer;
    if (isCorrect) {
        correctAnswersCount++;
        let sessionXP = parseInt(sessionStorage.getItem('levelXP') || 0);
        sessionXP += 10;
        sessionStorage.setItem('levelXP', sessionXP);
        document.getElementById('xp-count').innerText = sessionXP + ' XP';

        // Optional: Add a quick pop animation to the badge
        const xpBadge = document.querySelector('.xp-display');
        xpBadge.style.transform = 'scale(1.1)';
        setTimeout(() => xpBadge.style.transform = 'scale(1)', 200);
    }

    showFeedbackBanner(isCorrect, correctAnswer);
    setTimeout(loadQuestion, 2000);
}

// --- Update Progress ---
function updateProgress() {
    const percent = (questionsAsked / TOTAL_QUESTIONS) * 100;
    progressBarFill.style.width = percent + '%';
}

// --- Init on Load ---
window.onload = loadQuestion;

// --- Skip Logic ---
const skipButton = document.getElementById('skip-button');
const skipModal = document.getElementById('skip-modal');
const cancelSkip = document.getElementById('cancel-skip');
const confirmSkip = document.getElementById('confirm-skip');

skipButton.addEventListener('click', () => {
    skipModal.classList.add('show');
});

cancelSkip.addEventListener('click', () => {
    skipModal.classList.remove('show');
});

confirmSkip.addEventListener('click', async () => {
    try {
        await fetch('/save-session-results', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'ml',
                xp: 0,
                accuracy: 0,
                skipped: true
            })
        });
    } catch (error) {
        console.error('Failed to mark ML as skipped:', error);
    }

    window.location.href = '/result-summary';
});

// --- Close modal when clicking outside ---
skipModal.addEventListener('click', (e) => {
    if (e.target === skipModal) {
        skipModal.classList.remove('show');
    }
});
