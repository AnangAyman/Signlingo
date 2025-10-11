// Show/hide card details based on payment method selection
const paymentRadios = document.querySelectorAll('input[name="payment"]');
const cardDetails = document.getElementById('cardDetails');

paymentRadios.forEach(radio => {
    radio.addEventListener('change', function() {
        if (this.id === 'card') {
            cardDetails.classList.add('active');
        } else {
            cardDetails.classList.remove('active');
        }
    });
});

// Format card number input
const cardNumberInput = document.querySelector('input[placeholder="1234 5678 9012 3456"]');
if (cardNumberInput) {
    cardNumberInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\s/g, '');
        let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
        e.target.value = formattedValue;
    });
}

// Format expiration date
const expiryInput = document.querySelector('input[placeholder="MM / YY"]');
if (expiryInput) {
    expiryInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\s/g, '').replace(/\//g, '');
        if (value.length >= 2) {
            value = value.substring(0, 2) + ' / ' + value.substring(2, 4);
        }
        e.target.value = value;
    });
}