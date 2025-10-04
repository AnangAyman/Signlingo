document.querySelector('.login-button').addEventListener('click', function(e) {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    if (!(email && password)) {
        e.preventDefault();
        const errorMsg = document.getElementById('error-message');
        errorMsg.style.display = 'flex';
        errorMsg.querySelector('.error').textContent = 'Please fill in all fields';
    }
});

document.querySelectorAll('.social-button').forEach(button => {
    button.addEventListener('click', function(e) {
        e.preventDefault();
        const provider = this.getAttribute('data-provider');
        alert(provider.toUpperCase() + ' login selected');
    });
});