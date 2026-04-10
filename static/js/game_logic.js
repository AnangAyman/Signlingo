// --- Global Variables ---
let currentLessonQuestions = [];
let currentQuestionIndex = 0;
let correctAnswer = '';
let correctAnswersCount = 0;

const correctSound = document.getElementById('correct-sound');
const incorrectSound = document.getElementById('incorrect-sound');

// --- Sound Helpers ---
function playSound(soundElement) {
    if (soundElement) {
        soundElement.currentTime = 0;
        soundElement.play().catch(error => console.error("Error playing sound:", error));
    }
}

// --- Loading Spinner ---
function showLoadingState(isLoading) {
    const spinner = document.getElementById('loading-spinner');
    const image = document.getElementById('sign-image');
    
    // Safety check to prevent null errors
    if (spinner && image) {
        if (isLoading) {
            spinner.style.display = 'block';
            image.style.display = 'none';
        } else {
            spinner.style.display = 'none';
            image.style.display = 'block';
        }
    }
}

// --- Feedback Banner ---
function showFeedbackBanner(isCorrect, correctAns) {
    const banner = document.getElementById('feedback-banner');
    const feedbackText = document.getElementById('feedback');

    banner.classList.remove('correct', 'incorrect');
    if (isCorrect) {
        banner.classList.add('correct');
        feedbackText.innerText = 'Great job!';
    } else {
        banner.classList.add('incorrect');
        feedbackText.innerText = `Correct answer: ${correctAns}`;
        removeLife(); // Call backend to remove one life
    }
    banner.classList.add('show');
}

// --- Lives Logic ---
function removeLife() {
    fetch('/decrement_life', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const livesDisplay = document.querySelector('.lives-display');
            livesDisplay.classList.add('losing-life');
            
            setTimeout(() => {
                const livesCountElement = document.getElementById('lives-count');
                if (livesCountElement) livesCountElement.innerText = data.new_lives;
                
                if (data.new_lives <= 2 && data.new_lives > 0) {
                    livesDisplay.classList.add('low-lives');
                } else {
                    livesDisplay.classList.remove('low-lives');
                }
            }, 200);
            
            setTimeout(() => { livesDisplay.classList.remove('losing-life'); }, 800);

            if (data.new_lives <= 0) {
                setTimeout(() => { showOutOfLivesModal(); }, 900);
            }
        }
    })
    .catch(error => console.error('Error:', error));
}

function showOutOfLivesModal() {
    const modal = document.getElementById('out-of-lives-modal');
    modal.classList.add('show');
    const options = document.querySelectorAll('.option-button');
    options.forEach(opt => opt.disabled = true);
    document.getElementById('question').style.display = 'none';
    document.getElementById('choices').style.display = 'none';
}

function hideFeedbackBanner() {
    document.getElementById('feedback-banner').classList.remove('show');
}

// --- Initialization: Fetch all questions for this specific level ---
async function initializeQuiz() {
    const quizCardElement = document.querySelector('.quiz-card');
    const lessonKey = quizCardElement ? quizCardElement.dataset.lessonKey : null;
    
    if (!lessonKey || lessonKey === 'KEY_NOT_FOUND') {
        document.getElementById('question').innerText = 'Error: Lesson Key not found in HTML.';
        return;
    }

    try {
        showLoadingState(true);
        // Ping our new database API to get the exact questions for this level!
        const res = await fetch(`/api/lessons/${lessonKey}/questions`);
        if (!res.ok) throw new Error('Failed to fetch questions from database');
        
        currentLessonQuestions = await res.json();
        
        if (currentLessonQuestions.length === 0) {
            document.getElementById('question').innerText = 'No questions available for this level.';
            showLoadingState(false);
            return;
        }

        // Start the quiz!
        loadQuestion(); 
    } catch (error) {
        console.error(error);
        document.getElementById('question').innerText = 'Failed to load curriculum data.';
        showLoadingState(false);
    }
}

// --- Load Next Question from Array ---
function loadQuestion() {
    if (currentQuestionIndex >= currentLessonQuestions.length) {
        const quizCardElement = document.querySelector('.quiz-card');
        const lessonKey = quizCardElement ? quizCardElement.dataset.lessonKey : null;
        quizCompleted(lessonKey);
        return;
    }

    showLoadingState(true);
    hideFeedbackBanner();

    const qData = currentLessonQuestions[currentQuestionIndex];
    correctAnswer = qData.answer;
    document.getElementById('question').innerText = qData.prompt;

    const signImage = document.getElementById('sign-image');
    if (signImage) {
        signImage.onload = () => showLoadingState(false);
        signImage.onerror = () => showLoadingState(false); // Failsafe if image doesn't load
        // Pull the image from the static folder using the path from the database
        signImage.src = qData.image ? `/static/${qData.image}` : '/static/Assets/logo.png';
    } else {
        showLoadingState(false);
    }

    const choicesDiv = document.getElementById('choices');
    choicesDiv.innerHTML = '';
    
    qData.choices.forEach(choice => {
        const btn = document.createElement('button');
        btn.className = 'option-button';
        btn.innerText = choice;
        btn.onclick = () => checkAnswer(choice, btn);
        choicesDiv.appendChild(btn);
    });

    updateProgress();
}

// --- Check Answer ---
async function checkAnswer(selected, buttonElement) {
    const options = document.querySelectorAll('.option-button');
    options.forEach(opt => opt.disabled = true);

    try {
        // Still ping the backend so the user is awarded their XP points
        await fetch('/check-answer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selected: selected, correct: correctAnswer })
        });
        
        const isCorrect = (selected === correctAnswer);
        showFeedbackBanner(isCorrect, correctAnswer);

        if (isCorrect) {
            correctAnswersCount++;
            buttonElement.style.background = 'var(--correct-bg)';
            buttonElement.style.borderColor = 'var(--correct-text)';
            playSound(correctSound);
        } else {
            buttonElement.style.background = 'var(--incorrect-bg)';
            buttonElement.style.borderColor = 'var(--incorrect-text)';
            playSound(incorrectSound);
            options.forEach(opt => {
                if (opt.innerText === correctAnswer) {
                    opt.style.background = 'var(--correct-bg)';
                    opt.style.borderColor = 'var(--correct-text)';
                }
            });
        }

        currentQuestionIndex++; // Advance the tracker

        setTimeout(() => {
            loadQuestion(); // Load the next question directly
        }, 2000);
        
    } catch (error) {
        console.error("Error in checkAnswer:", error);
        alert('Could not check answer due to a network error.');
        options.forEach(opt => opt.disabled = false);
    }
}

// --- Progress Bar ---
function updateProgress() {
    const total = currentLessonQuestions.length || 1;
    const percent = (currentQuestionIndex / total) * 100;
    document.getElementById('progress-bar').style.width = percent + '%';
}

// --- Quiz Completion ---
async function quizCompleted(lessonKeyForThisQuiz) {
    document.querySelector('.quiz-visual-area').style.display = 'none';
    document.getElementById('question').innerText = 'Quiz Complete!';
    document.getElementById('question').classList.add('quiz-complete-title');
    document.getElementById('choices').style.display = 'none';

    const total = currentLessonQuestions.length || 1;
    const xpGained = correctAnswersCount * 10;
    const accuracy = (correctAnswersCount / total) * 100;

    try {
        await fetch('/save-session-results', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'game', xp: xpGained, accuracy: accuracy, skipped: false })
        });
    } catch (error) { console.error('Failed to save game results:', error); }

    if (lessonKeyForThisQuiz && lessonKeyForThisQuiz !== 'KEY_NOT_FOUND') {
        try {
            await fetch('/mark-lesson-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lesson_key: lessonKeyForThisQuiz, status: 'completed' })
            });
        } catch (err) { console.error('Error marking lesson complete:', err); }
    }

    // Move to next step (ML Practice)
    window.location.href = '/ml-game';
}

// --- Event Setup ---
document.addEventListener('DOMContentLoaded', () => {
    const livesCountElement = document.getElementById('lives-count');
    if (livesCountElement) {
        const initialLives = parseInt(livesCountElement.innerText, 10);
        if (initialLives <= 0) {
            showOutOfLivesModal();
            return; 
        }
    }

    // Call the new initialization function!
    initializeQuiz();

    // Setup for Skip Modal
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
                    body: JSON.stringify({ type: 'game', xp: 0, accuracy: 0, skipped: true })
                });
            } catch (error) { console.error('Failed to mark game as skipped:', error); }
            window.location.href = '/ml-game';
        });

        skipModal.addEventListener('click', (e) => {
            if (e.target === skipModal) skipModal.classList.remove('show');
        });
    }
});