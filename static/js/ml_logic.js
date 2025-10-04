// static/ml_logic.js

const video = document.getElementById('webcam');
const canvas = document.getElementById('canvas'); // Used for snapshot, might be hidden
const countdownEl = document.getElementById('countdown');
const resultEl = document.getElementById('result'); // Shows prediction (e.g., "You showed: A")
const startBtn = document.getElementById('start-btn');
const questionEl = document.getElementById('question'); // Displays "Show Bisindo Letter X"
const feedbackEl = document.getElementById('feedback'); // Displays Correct/Incorrect after prediction
const progressBarFill = document.getElementById('progress-bar'); // For overall quiz progress

let questionsAsked = 0;
const TOTAL_QUESTIONS = 10; // Number of signs to practice for one session
let correctAnswer; // The letter the user is supposed to sign
let currentPrediction; // Stores the latest prediction from the model

// --- Webcam Setup ---
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            video.srcObject = stream;
            video.play(); // Ensure video plays
        })
        .catch(err => {
            console.error('Webcam error:', err);
            questionEl.innerText = 'Could not access webcam. Please allow camera access and refresh.';
            if (startBtn) startBtn.disabled = true;
        });
} else {
    console.error('getUserMedia not supported on this browser.');
    questionEl.innerText = 'Webcam not supported on this browser.';
    if (startBtn) startBtn.disabled = true;
}

// --- Lesson Completion Logic ---
async function mlGameSessionCompleted(lessonKeyForThisMlGame) {
    if (questionEl) questionEl.innerText = '🎉 ML Practice Complete!';
    if (startBtn) startBtn.style.display = 'none';
    if (countdownEl) countdownEl.textContent = '';
    // resultEl might have the last prediction, clear it or set a final message
    if (resultEl) resultEl.textContent = 'Session finished.';
    if (feedbackEl) feedbackEl.innerText = 'Saving progress...';


    if (!lessonKeyForThisMlGame) {
        console.error("ML Logic: Lesson key is missing, cannot save ML game completion status.");
        if (feedbackEl) feedbackEl.innerText = 'ML Practice complete! Status not saved (no lesson key).';
        return;
    }

    try {
        const response = await fetch('/mark-lesson-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lesson_key: lessonKeyForThisMlGame,
                status: 'completed'
                // score: your_ml_game_score // If you implement scoring
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Server error or non-JSON response' }));
            console.error('ML Logic: Failed to mark lesson status. Status:', response.status, 'Error:', errorData.error);
            if (feedbackEl) feedbackEl.innerText = `ML Practice complete, but progress could not be saved: ${errorData.error || response.statusText}.`;
            return;
        }

        const result = await response.json();
        if (result.success) {
            console.log('ML Logic: ML game status updated successfully.');
            if (feedbackEl) feedbackEl.innerText = 'ML Practice complete and progress saved!';
            setTimeout(() => window.location.reload(), 1500); // Reload to update sidebar
        } else {
            console.error('ML Logic: Failed to update ML game status (server indicated failure):', result.error);
            if (feedbackEl) feedbackEl.innerText = `ML Practice complete, but progress could not be saved: ${result.error || 'Unknown reason'}.`;
        }
    } catch (error) {
        console.error('ML Logic: Error sending ML game completion status:', error);
        if (feedbackEl) feedbackEl.innerText = 'ML Practice complete, but an error occurred while saving progress.';
    }
}

// --- Core ML Game Logic ---
async function loadQuestion() {
    if (questionsAsked >= TOTAL_QUESTIONS) {
        // Determine the lesson key from the HTML (e.g., from a data-* attribute)
        const gameContainerElement = document.querySelector('.quiz-card'); // Or your main ML game container
        const lessonKey = gameContainerElement ? gameContainerElement.dataset.lessonKey : null;
        mlGameSessionCompleted(lessonKey);
        if (startBtn) startBtn.disabled = true;
        return;
    }

    try {
        const res = await fetch('/get-question-ml');
        if (!res.ok) {
            console.error("ML Logic: Failed to fetch ML question. Status:", res.status);
            let errorMsg = 'Error loading ML challenge.';
             if (res.status === 401) {
                errorMsg += ' Please ensure you are logged in.';
            } else {
                const serverError = await res.text();
                errorMsg += ` Server responded with: ${res.status}. ${serverError}`;
            }
            if (questionEl) questionEl.innerText = errorMsg;
            if (startBtn) startBtn.disabled = true;
            return;
        }
        const data = await res.json();

        correctAnswer = data.answer; // e.g., "A"
        if (questionEl) questionEl.innerText = data.question; // e.g., "Show Bisindo Letter A"
        if (resultEl) resultEl.textContent = ''; // Clear previous prediction result
        if (feedbackEl) feedbackEl.innerText = ''; // Clear previous correct/incorrect feedback
        
        questionsAsked++; // Increment for the question about to be attempted
        updateProgress();

        if (startBtn) {
            startBtn.disabled = false;
            startBtn.textContent = 'Start Pose Capture';
            startBtn.style.background = ''; // Reset button style
            startBtn.style.color = '';
            startBtn.onclick = startQuiz; // Set or reset the click handler
        }
    } catch (error) {
        console.error("ML Logic: Error in loadQuestion fetch or processing:", error);
        if (questionEl) questionEl.innerText = 'Could not load ML challenge due to a script error.';
        if (startBtn) startBtn.disabled = true;
    }
}

function startQuiz() {
    if (startBtn) startBtn.disabled = true;
    if (resultEl) resultEl.textContent = '';
    if (feedbackEl) feedbackEl.innerText = '';
    let count = 3; // 3-second countdown
    if (countdownEl) countdownEl.textContent = count;

    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            if (countdownEl) countdownEl.textContent = count;
        } else if (count === 0) {
            captureAndSend()
                .then(prediction => {
                    if (prediction !== null) { // Check if prediction was successful
                        checkAnswer(prediction);
                    } else {
                        // Handle case where captureAndSend failed (error already logged within it)
                        if (feedbackEl) feedbackEl.innerText = 'Capture or prediction failed. Try again.';
                        // Re-enable start button to allow another attempt for the same question
                        if (startBtn) {
                             startBtn.disabled = false;
                             startBtn.textContent = 'Try Again';
                        }
                    }
                })
                .catch(error => { // Should be caught within captureAndSend, but as a fallback
                    console.error("ML Logic: Error in capture/send promise chain:", error);
                    if (feedbackEl) feedbackEl.innerText = 'An error occurred during capture.';
                    if (startBtn) startBtn.disabled = false; // Re-enable
                });
            clearInterval(interval);
            setTimeout(() => { if (countdownEl) countdownEl.textContent = ''; }, 1000); // Clear "Capture!" after a bit
        }
    }, 1000);
}

async function captureAndSend() {
    if (!canvas || !video) {
        console.error("ML Logic: Canvas or video element not found for capture.");
        return null; // Indicate failure
    }
    const ctx = canvas.getContext('2d');
    // Ensure canvas is the desired model input size if not already
    canvas.width = 224; 
    canvas.height = 224;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert canvas to Blob
    return new Promise((resolve) => {
        canvas.toBlob(async blob => {
            if (!blob) {
                console.error("ML Logic: Failed to create blob from canvas.");
                resolve(null); // Indicate failure
                return;
            }
            const formData = new FormData();
            formData.append('image', blob, 'snapshot.jpg');

            try {
                const res = await fetch('/predict', { method: 'POST', body: formData });
                if (!res.ok) {
                    console.error("ML Logic: Prediction request failed. Status:", res.status);
                    const errorText = await res.text();
                    console.error("ML Logic: Server response for prediction failure:", errorText);
                    if (resultEl) resultEl.textContent = `Prediction error: ${res.status}.`;
                    resolve(null); // Indicate failure
                    return;
                }
                const data = await res.json();
                currentPrediction = data.result; // Store the prediction
                // Debug URLs are available in data.debug_crop_url, data.debug_overlay_url if needed
                resolve(data.result); // Resolve with the predicted letter
            } catch (err) {
                console.error("ML Logic: Error during prediction fetch:", err);
                if (resultEl) resultEl.textContent = 'Prediction fetch error.';
                resolve(null); // Indicate failure
            }
        }, 'image/jpeg');
    });
}

function checkAnswer(predictedLetter) { // predictedLetter is the result from captureAndSend
    const originalBackground = startBtn ? startBtn.style.background : '';
    const originalColor = startBtn ? startBtn.style.color : '';

    if (predictedLetter === correctAnswer) {
        if (feedbackEl) feedbackEl.innerText = '✅ Correct!';
        if (resultEl) resultEl.textContent = `You showed: ${predictedLetter}`; // Show what was predicted
        if (startBtn) {
            startBtn.style.background = 'var(--correct)'; // Assumes CSS variable
            startBtn.style.color = '#fff';
        }
    } else {
        if (feedbackEl) feedbackEl.innerText = `❌ Wrong! Aim for ${correctAnswer}.`;
        if (resultEl) resultEl.textContent = `You showed: ${predictedLetter}`; // Show what was predicted
        if (startBtn) {
            startBtn.style.background = 'var(--incorrect)'; // Assumes CSS variable
            startBtn.style.color = '#fff';
        }
    }

    // Load a new question or complete session after a short delay
    setTimeout(() => {
        if (startBtn) { // Reset button for next question (if not quiz completion)
            startBtn.style.background = originalBackground;
            startBtn.style.color = originalColor;
            // startBtn.textContent will be set by loadQuestion
        }
        loadQuestion(); // This will either load the next question or trigger completion
    }, 2000); // Delay to show feedback
}

function updateProgress() {
    if (!progressBarFill) return;
    // questionsAsked is incremented before this is called for the *upcoming* question.
    // So, if TOTAL_QUESTIONS is 10, progress bar shows progress for questions 1 through 10.
    // If questionsAsked = 1, it's 10%. If questionsAsked = 10, it's 100%.
    const currentProgress = Math.min(questionsAsked, TOTAL_QUESTIONS); // Cap at total for display
    const percent = (currentProgress / TOTAL_QUESTIONS) * 100;
    progressBarFill.style.width = percent + '%';
}

// Start loading the first question when the page loads
window.onload = loadQuestion;