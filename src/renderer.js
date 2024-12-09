const { ipcRenderer } = require('electron');

const queryInput = document.getElementById('query');
const locationInput = document.getElementById('location');
const startButton = document.getElementById('start-button');
const message = document.getElementById('message');

startButton.addEventListener('click', async () => {
    const query = queryInput.value;
    const location = locationInput.value;

    if (!query) {
        updateMessage('Ragione Sociale non può essere vuota!');
        return;
    }

    if (!location) {
        updateMessage('Località non può essere vuota!');
        return;
    }

    startButton.disabled = true;
    startButton.textContent = 'Scraping in corso...';

    const { success, filePath, error } = await ipcRenderer.invoke('start-scraping', query, location);

    if (success) {
        updateMessage(`Scraping completato! File salvato in: ${filePath}`);
    } else {
        updateMessage(`Errore: ${error}`);
    }

    startButton.disabled = false;
    startButton.textContent = 'Inizia Scraping';
});

function updateMessage(text) {
    message.textContent = text;
}
