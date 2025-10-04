document.addEventListener('DOMContentLoaded', function() {
    const markButton = document.getElementById('mark-video-completed-btn');
    const feedbackDiv = document.getElementById('video-completion-feedback');
    // Ensure this selector matches the element where you set data-lesson-key
    const mainElementWithKey = document.querySelector('.main_wrapper'); // Or '.container', or '.main-content' - wherever data-lesson-key is

    // Add some initial console logs for debugging
    console.log("Video page JS: DOMContentLoaded fired.");
    console.log("Video page JS: Button element:", markButton);
    console.log("Video page JS: Main element for key:", mainElementWithKey);

    const lessonKey = mainElementWithKey ? mainElementWithKey.dataset.lessonKey : null;
    console.log("Video page JS: Retrieved lessonKey:", lessonKey);

    if (markButton) { // Check if button exists first
        if (lessonKey) { // Then check if lessonKey was found
            markButton.addEventListener('click', async function() {
                console.log("Video page JS: 'Mark as Completed' button clicked!");
                console.log("Video page JS: Sending lessonKey:", lessonKey);

                markButton.disabled = true;
                feedbackDiv.innerText = 'Saving...';

                try {
                    const response = await fetch('/mark-lesson-status', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            lesson_key: lessonKey,
                            status: 'completed'
                        })
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({error: 'Server error or non-JSON response'}));
                        console.error("Video page JS: Fetch error - Status:", response.status, "Data:", errorData);
                        feedbackDiv.innerText = `Failed to save: ${errorData.error || response.statusText}`;
                        markButton.disabled = false;
                        return;
                    }

                    const result = await response.json();
                    if (result.success) {
                        console.log("Video page JS: Success -", result.message);
                        feedbackDiv.innerText = 'Lesson marked as completed! Page will reload.';
                        setTimeout(() => window.location.reload(), 1500);
                    } else {
                        console.error("Video page JS: Save failed -", result.error);
                        feedbackDiv.innerText = `Failed: ${result.error || 'Unknown reason'}`;
                        markButton.disabled = false;
                    }
                } catch (error) {
                    console.error('Video page JS: Error marking video as complete:', error);
                    feedbackDiv.innerText = 'An error occurred while saving.';
                    markButton.disabled = false;
                }
            });
            console.log("Video page JS: Click listener attached to markButton.");
        } else {
            console.error("Video page JS: Lesson key not found. Ensure 'data-lesson-key' is set correctly on the element selected by querySelector (e.g., '.main_wrapper'). Button click will not work.");
            if(feedbackDiv) feedbackDiv.innerText = "Error: Lesson identifier missing. Cannot save progress.";
        }
    } else {
        console.error("Video page JS: 'Mark as completed' button (id='mark-video-completed-btn') not found.");
    }
});