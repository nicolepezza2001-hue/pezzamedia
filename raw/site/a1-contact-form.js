// Sends the contact form to Formspree without leaving the page, then shows /thanks/.
// Without JavaScript the form still posts normally to Formspree.
const form = document.getElementById('contact-form');
if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const error = form.querySelector('.form-error');
    button.disabled = true;
    error.hidden = true;
    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(response.status);
      window.location.href = '/thanks/';
    } catch {
      error.hidden = false;
      button.disabled = false;
    }
  });
}
