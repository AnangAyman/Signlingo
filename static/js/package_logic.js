const packageCards = document.querySelectorAll('.package-card');
const annualPriceSpan = document.getElementById('annualPrice');
const monthlyPriceSpan = document.getElementById('monthlyPrice');
const pricingInfo = document.getElementById('pricingInfo');

packageCards.forEach(card => {
    card.addEventListener('click', function() {
        // Remove selected class from all cards
        packageCards.forEach(c => {
            c.classList.remove('selected');
            const checkIcon = c.querySelector('.check-icon');
            if (checkIcon) {
                checkIcon.remove();
            }
        });

        // Add selected class to clicked card
        this.classList.add('selected');

        // Add check icon
        const checkIcon = document.createElement('div');
        checkIcon.className = 'check-icon';
        checkIcon.innerHTML = '<i class="fas fa-check"></i>';
        this.querySelector('.package-content').appendChild(checkIcon);

        // Update pricing info
        const plan = this.dataset.plan;
        const monthlyPrice = this.dataset.price.replace('RP ', '').replace(' / MO', '');
        const annualPrice = this.dataset.annual;

        if (plan === 'monthly') {
            pricingInfo.innerHTML = `7 day free trial, then Rp ${annualPrice} per month plus applicable taxes`;
        } else if (plan === 'family') {
            pricingInfo.innerHTML = `7 day free trial, then Rp 1.859.000,00 per year<br>(Rp ${monthlyPrice}/month, billed annually) plus applicable taxes`;
        } else {
            pricingInfo.innerHTML = `7 day free trial, then Rp ${annualPrice} per year<br>(Rp ${monthlyPrice}/month, billed annually) plus applicable taxes`;
        }
    });
});