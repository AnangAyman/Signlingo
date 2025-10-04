        
document.querySelector('.create-button').addEventListener('click', function() {
    const age = document.getElementById('age').value;
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    if (!age || !email || !password) {
        alert('Please fill in all required fields');
        return;
    }
    
    alert('Account creation initiated');
});
        
document.querySelector('.question-mark').addEventListener('click', function() {
    alert('Age is required for account creation');
});

document.querySelectorAll('.social-button').forEach(button => {
    button.addEventListener('click', function() {
        const provider = this.textContent.trim();
        alert(`Sign in with ${provider} initiated`);
    });
});