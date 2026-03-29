// --- Global Variables ---
let correctAnswer = '';
let questionsAsked = 0;
let correctAnswersCount = 0;
const TOTAL_QUESTIONS = 10;

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
    if (isLoading) {
        spinner.style.display = 'block';
        image.style.display = 'none';
    } else {
        spinner.style.display = 'none';
        image.style.display = 'block';
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
        
        // Call the backend to remove one life
        removeLife();
    }
    banner.classList.add('show');
}

// New function to handle the API call and UI update
function removeLife() {
    fetch('/decrement_life', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Add losing life animation
            const livesDisplay = document.querySelector('.lives-display');
            livesDisplay.classList.add('losing-life');
            
            // Update the lives count with a slight delay for drama
            setTimeout(() => {
                const livesCountElement = document.getElementById('lives-count');
                if (livesCountElement) {
                    livesCountElement.innerText = data.new_lives;
                }
                
                // Add low-lives warning state if 2 or fewer lives
                if (data.new_lives <= 2 && data.new_lives > 0) {
                    livesDisplay.classList.add('low-lives');
                } else {
                    livesDisplay.classList.remove('low-lives');
                }
            }, 200);
            
            // Remove animation class after completion
            setTimeout(() => {
                livesDisplay.classList.remove('losing-life');
            }, 800);

            // Check if the user is out of lives
            if (data.new_lives <= 0) {
                setTimeout(() => {
                    showOutOfLivesModal();
                }, 900);
            }
        } else {
            console.error('Failed to decrement life:', data.error);
        }
    })
    .catch(error => console.error('Error:', error));
}

// Show out of lives modal
function showOutOfLivesModal() {
    const modal = document.getElementById('out-of-lives-modal');
    modal.classList.add('show');
    
    // Disable all quiz interactions
    const options = document.querySelectorAll('.option-button');
    options.forEach(opt => opt.disabled = true);
    // Also hide the main quiz card content to prevent interaction
    document.getElementById('question').style.display = 'none';
    document.getElementById('choices').style.display = 'none';
}

function hideFeedbackBanner() {
    document.getElementById('feedback-banner').classList.remove('show');
}

// --- Load Next Question ---
async function loadQuestion() {
    if (questionsAsked >= TOTAL_QUESTIONS) {
        const quizCardElement = document.querySelector('.quiz-card');
        const lessonKey = quizCardElement ? quizCardElement.dataset.lessonKey : null;
        quizCompleted(lessonKey);
        return;
    }

    showLoadingState(true);
    hideFeedbackBanner();

    try {
        const res = await fetch('/get-question');
        if (!res.ok) throw new Error(`Failed to fetch question. Status: ${res.status}`);
        const data = await res.json();

        correctAnswer = data.answer;
        document.getElementById('question').innerText = data.question;

        const signImage = document.getElementById('sign-image');
        signImage.onload = () => showLoadingState(false);
        signImage.src = data.image || '/static/placeholder.png';

        const choicesDiv = document.getElementById('choices');
        choicesDiv.innerHTML = '';
        data.choices.forEach(choice => {
            const btn = document.createElement('button');
            btn.className = 'option-button';
            btn.innerText = choice;
            btn.onclick = () => checkAnswer(choice, btn);
            choicesDiv.appendChild(btn);
        });

        questionsAsked++;
        updateProgress();

    } catch (error) {
        console.error("Error in loadQuestion:", error);
        document.getElementById('question').innerText = 'Could not load question. Please try refreshing.';
        showLoadingState(false);
    }
}

// --- Check Answer ---
async function checkAnswer(selected, buttonElement) {
    const options = document.querySelectorAll('.option-button');
    options.forEach(opt => opt.disabled = true);

    try {
        const res = await fetch('/check-answer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selected: selected, correct: correctAnswer })
        });
        if (!res.ok) throw new Error('Failed to check answer.');

        const result = await res.json();
        showFeedbackBanner(result.result, correctAnswer);

        if (result.result) {
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

        setTimeout(loadQuestion, 2000);
    } catch (error) {
        console.error("Error in checkAnswer:", error);
        alert('Could not check answer due to a network error.');
        options.forEach(opt => opt.disabled = false);
    }
}

// --- Progress Bar ---
function updateProgress() {
    const percent = (questionsAsked / TOTAL_QUESTIONS) * 100;
    document.getElementById('progress-bar').style.width = percent + '%';
}

// --- Quiz Completion ---
async function quizCompleted(lessonKeyForThisQuiz) {
    // Hide visuals
    document.querySelector('.quiz-visual-area').style.display = 'none';
    document.getElementById('question').innerText = 'Quiz Complete!';
    document.getElementById('question').classList.add('quiz-complete-title');

    // Calculate performance
    const xpGained = correctAnswersCount * 10;
    const accuracy = (correctAnswersCount / TOTAL_QUESTIONS) * 100;

    // --- Save results for summary ---
    try {
        await fetch('/save-session-results', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'game',
                xp: xpGained,
                accuracy: accuracy,
                skipped: false
            })
        });
    } catch (error) {
        console.error('Failed to save game results:', error);
    }

    // --- Mark lesson complete ---
    if (lessonKeyForThisQuiz && lessonKeyForThisQuiz !== 'KEY_NOT_FOUND') {
        try {
            await fetch('/mark-lesson-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lesson_key: lessonKeyForThisQuiz, status: 'completed' })
            });
        } catch (err) {
            console.error('Error marking lesson complete:', err);
        }
    }

    // --- Redirect immediately to ML practice ---
    window.location.href = '/ml-game';
}


// --- Event Setup ---
document.addEventListener('DOMContentLoaded', () => {
    // Check initial lives when the page loads
    const livesCountElement = document.getElementById('lives-count');
    if (livesCountElement) {
        const initialLives = parseInt(livesCountElement.innerText, 10);
        if (initialLives <= 0) {
            // If out of lives, show modal and stop everything else
            showOutOfLivesModal();
            return; 
        }
    }

    // If the user has lives, proceed to load the first question
    loadQuestion();

    // Setup for Skip Modal
    const skipButton = document.getElementById('skip-button');
    const skipModal = document.getElementById('skip-modal');
    const cancelSkip = document.getElementById('cancel-skip');
    const confirmSkip = document.getElementById('confirm-skip');

    if (skipButton && skipModal && cancelSkip && confirmSkip) {
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
                        type: 'game',
                        xp: 0,
                        accuracy: 0,
                        skipped: true
                    })
                });
            } catch (error) {
                console.error('Failed to mark game as skipped:', error);
            }
            window.location.href = '/ml-game';
        });

        // Close modal when clicking outside
        skipModal.addEventListener('click', (e) => {
            if (e.target === skipModal) {
                skipModal.classList.remove('show');
            }
        });
    }
});