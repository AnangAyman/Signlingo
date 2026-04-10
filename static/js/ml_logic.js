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

// FIX 3: Dynamic Question Arrays
let currentLessonQuestions = [];
let currentQuestionIndex = 0;
let correctAnswersCount = 0;
let correctAnswer = '';

const correctSound = document.getElementById('correct-sound');
const incorrectSound = document.getElementById('incorrect-sound');

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

    const total = currentLessonQuestions.length || 1;
    const accuracy = (correctAnswersCount / total) * 100;
    const xpGained = correctAnswersCount * 10;

    try {
        await fetch('/save-session-results', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'ml', xp: xpGained, accuracy: accuracy, skipped: false })
        });
    } catch (error) { console.error('Failed to save ML results:', error); }

    if (lessonKey && lessonKey !== 'KEY_NOT_FOUND') {
        try {
            await fetch('/mark-lesson-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lesson_key: lessonKey, status: 'completed' })
            });
        } catch (error) { console.error('ML Logic: Error marking lesson complete:', error); }
    }

    // Redirect to Magic Touch or Result Summary depending on the flow
    window.location.href = '/result-summary';
}

// --- Initialization: Fetch all questions ---
async function initializeQuiz() {
    const gameContainer = document.querySelector('.quiz-card');
    const lessonKey = gameContainer ? gameContainer.dataset.lessonKey : null;

    if (!lessonKey || lessonKey === 'KEY_NOT_FOUND') {
        questionEl.innerText = 'Error: Lesson Key not found in HTML.';
        return;
    }

    try {
        const res = await fetch(`/api/lessons/${lessonKey}/questions`);
        if (!res.ok) throw new Error('Failed to fetch questions from database');
        
        currentLessonQuestions = await res.json();
        
        if (currentLessonQuestions.length === 0) {
            questionEl.innerText = 'No questions available for this level.';
            return;
        }

        loadQuestion(); 
    } catch (error) {
        console.error(error);
        questionEl.innerText = 'Failed to load curriculum data.';
    }
}

// --- Load Question ---
function loadQuestion() {
    if (currentQuestionIndex >= currentLessonQuestions.length) {
        const gameContainer = document.querySelector('.quiz-card');
        const lessonKey = gameContainer ? gameContainer.dataset.lessonKey : null;
        mlGameSessionCompleted(lessonKey);
        return;
    }

    hideFeedbackBanner();

    const qData = currentLessonQuestions[currentQuestionIndex];
    correctAnswer = qData.answer;
    questionEl.innerText = qData.prompt;
    resultEl.textContent = '';

    updateProgress();

    startBtn.disabled = false;
    startBtn.style.display = 'block';
    startBtn.textContent = 'Start Pose Capture';
    startBtn.onclick = startCountdown;
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
function captureAndSend() {
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
    const isCorrect = (predictedLetter === correctAnswer);
    if (isCorrect) {
        correctAnswersCount++;
        playSound(correctSound);
        
        // Add Session XP for correct answers
        let sessionXP = parseInt(sessionStorage.getItem('levelXP') || 0);
        sessionXP += 10;
        sessionStorage.setItem('levelXP', sessionXP);
        const xpCount = document.getElementById('xp-count');
        if (xpCount) xpCount.innerText = sessionXP + ' XP';

    } else {
        playSound(incorrectSound);
    }

    showFeedbackBanner(isCorrect, correctAnswer);

    // Advance to the next question
    currentQuestionIndex++;
    setTimeout(loadQuestion, 2000);
}

// --- Update Progress ---
function updateProgress() {
    const total = currentLessonQuestions.length || 1;
    const percent = (currentQuestionIndex / total) * 100;
    progressBarFill.style.width = percent + '%';
}

// --- Init on Load ---
window.onload = initializeQuiz;

// --- Skip Logic ---
const skipButton = document.getElementById('skip-button');
const skipModal = document.getElementById('skip-modal');
const cancelSkip = document.getElementById('cancel-skip');
const confirmSkip = document.getElementById('confirm-skip');

if (skipButton && skipModal && cancelSkip && confirmSkip) {
    skipButton.addEventListener('click', () => { skipModal.classList.add('show'); });
    cancelSkip.addEventListener('click', () => { skipModal.classList.remove('show'); });

    confirmSkip.addEventListener('click', async () => {
        try {
            await fetch('/save-session-results', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'ml', xp: 0, accuracy: 0, skipped: true })
            });
        } catch (error) { console.error('Failed to mark ML as skipped:', error); }

        window.location.href = '/result-summary';
    });

    skipModal.addEventListener('click', (e) => {
        if (e.target === skipModal) skipModal.classList.remove('show');
    });
}