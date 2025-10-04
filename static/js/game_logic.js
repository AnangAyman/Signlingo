let correctAnswer = '';
let questionsAsked = 0;
const TOTAL_QUESTIONS = 10;

const correctSound = document.getElementById('correct-sound');
const incorrectSound = document.getElementById('incorrect-sound');

function playSound(soundElement) {
    if (soundElement) {
        soundElement.currentTime = 0; // Rewind to the start
        soundElement.play().catch(error => console.error("Error playing sound:", error)); // Play and catch potential errors
    }
}

async function loadQuestion() {
    if (questionsAsked >= TOTAL_QUESTIONS) {
        const quizCardElement = document.querySelector('.quiz-card');
        const lessonKey = quizCardElement ? quizCardElement.dataset.lessonKey : null;
        quizCompleted(lessonKey); 
        return; 
    }

    try {
        const res = await fetch('/get-question');
        if (!res.ok) {
            console.error("Failed to fetch question. Status:", res.status);
            let errorMsg = 'Error loading question.';
            if (res.status === 401) {
                errorMsg += ' Please ensure you are logged in.';
            } else {
                const serverError = await res.text();
                errorMsg += ` Server responded with: ${res.status}. ${serverError}`;
            }
            document.getElementById('question').innerText = errorMsg;
            document.getElementById('choices').innerHTML = ''; 
            return; 
        }
        const data = await res.json();

        correctAnswer = data.answer;
        document.getElementById('question').innerText = data.question;
        document.getElementById('sign-image').src = data.image || '/static/placeholder.png';

        const choicesDiv = document.getElementById('choices');
        choicesDiv.innerHTML = ''; 
        data.choices.forEach(choice => {
            const btn = document.createElement('div');
            btn.className = 'option-button';
            btn.innerText = choice;
            btn.onclick = () => checkAnswer(choice, btn); 
            choicesDiv.appendChild(btn);
        });

        document.getElementById('feedback').innerText = ''; 
        questionsAsked++;
        updateProgress();

    } catch (error) {
        console.error("Error in loadQuestion fetch or processing:", error);
        document.getElementById('question').innerText = 'Could not load question due to a network or script error.';
        document.getElementById('choices').innerHTML = '';
    }
}

async function checkAnswer(selected, buttonElement) {
    const options = document.querySelectorAll('.option-button');
    options.forEach(opt => {
        opt.style.pointerEvents = 'none';
        opt.style.opacity = '0.6';
    });

    try {
        const res = await fetch('/check-answer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selected: selected, correct: correctAnswer })
        });

        if (!res.ok) {
            console.error("Failed to check answer. Status:", res.status);
            document.getElementById('feedback').innerText = 'Error checking answer. Please try again.';
            options.forEach(opt => {
                opt.style.pointerEvents = 'auto';
                opt.style.opacity = '1';
            });
            return;
        }
        const result = await res.json();

        document.getElementById('feedback').innerText = result.result ? '✅ Correct!' : `❌ Wrong!`;

        // Highlight correct/incorrect and PLAY SOUNDS
        if (result.result) {
            buttonElement.style.background = 'var(--correct)';
            buttonElement.style.color = '#fff';
            playSound(correctSound); // *** Play correct sound ***
        } else {
            buttonElement.style.background = 'var(--incorrect)';
            buttonElement.style.color = '#fff';
            playSound(incorrectSound); // *** Play incorrect sound ***
            options.forEach(opt => {
                if (opt.innerText === correctAnswer) {
                }
            });
        }

        setTimeout(loadQuestion, 1500);

    } catch (error) {
        console.error("Error in checkAnswer fetch or processing:", error);
        document.getElementById('feedback').innerText = 'Could not check answer due to a network or script error.';
        options.forEach(opt => {
            opt.style.pointerEvents = 'auto';
            opt.style.opacity = '1';
        });
    }
}

function updateProgress() {
    const percent = (questionsAsked / TOTAL_QUESTIONS) * 100;
    const progressBarFill = document.getElementById('progress-bar');
    if (progressBarFill) {
        progressBarFill.style.width = percent + '%';
    }
}

async function quizCompleted(lessonKeyForThisQuiz) {
    document.getElementById('question').innerText = '🎉 Quiz Complete!';
    document.getElementById('choices').innerHTML = '';
    document.getElementById('sign-image').src = '/static/Assets/great_job.png';
    document.getElementById('feedback').innerText = 'Saving progress...';


    if (!lessonKeyForThisQuiz) {
        console.error("Lesson key is missing, cannot save quiz completion status.");
        document.getElementById('feedback').innerText = 'Quiz complete! Status not saved (no lesson key).';
        return;
    }

    try {
        const response = await fetch('/mark-lesson-status', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                lesson_key: lessonKeyForThisQuiz,
                status: 'completed'
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Server error, unable to parse details.' }));
            console.error('Failed to mark lesson status. Status:', response.status, 'Error:', errorData.error);
            document.getElementById('feedback').innerText = `Quiz complete, but progress could not be saved: ${errorData.error || response.statusText}.`;
            return; 
        }

        const result = await response.json();
        if (result.success) {
            console.log('Quiz status updated successfully.');
            document.getElementById('feedback').innerText = 'Quiz complete and progress saved!';
            setTimeout(() => window.location.reload(), 1500); 
        } else {
            console.error('Failed to update quiz status (server indicated failure):', result.error);
            document.getElementById('feedback').innerText = `Quiz complete, but progress could not be saved: ${result.error || 'Unknown reason'}.`;
        }
    } catch (error) {
        console.error('Error sending quiz completion status:', error);
        document.getElementById('feedback').innerText = 'Quiz complete, but an error occurred while saving progress.';
    }
}

window.onload = loadQuestion;