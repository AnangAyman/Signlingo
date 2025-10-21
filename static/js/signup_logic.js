document.addEventListener('DOMContentLoaded', function () {
    const signupForm = document.getElementById('signup-form');
    const successMessage = document.querySelector('.success-message');
    if (successMessage) {
        document.getElementById('signup-form').reset();
    }
    
    if (signupForm) {
        signupForm.addEventListener('submit', function(event) {
            event.preventDefault();

            const name = document.getElementById('name').value.trim();
            const age = document.getElementById('age').value.trim();
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirm-password').value;
            
            // Get the main error container and the <p> tag inside it
            const errorContainer = document.getElementById('client-error-message');
            const errorTextElement = errorContainer.querySelector('.error');
            let errors = [];

            // --- Validation Rules ---
            if (!name || !age || !email || !password || !confirmPassword) {
                errors.push('All fields are required.');
            }
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (email && !emailRegex.test(email)) {
                errors.push('Please enter a valid email address.');
            }
            if (age && (isNaN(age) || parseInt(age) <= 0)) {
                errors.push('Please enter a valid age.');
            }
            if (password && password.length < 8) {
                errors.push('Password must be at least 8 characters long.');
            }
            if (password && confirmPassword && password !== confirmPassword) {
                errors.push('Passwords do not match.');
            }

            // --- Display errors or submit the form ---
            if (errors.length > 0) {
                // MODIFIED: Only update the text of the <p> tag
                errorTextElement.innerHTML = errors.join('<br>');
                errorContainer.style.display = 'flex';
            } else {
                errorContainer.style.display = 'none';
                // alert('Account creation initiated'); // Optional success message
                signupForm.submit();
            }
        });
    }

    document.querySelectorAll('.social-button').forEach(button => {
        button.addEventListener('click', function() {
            const provider = this.textContent.trim();
            alert(`Sign in with ${provider} initiated`);
        });
    });
});