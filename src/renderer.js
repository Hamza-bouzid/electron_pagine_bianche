const { ipcRenderer } = require('electron');

const queryInput = document.getElementById('query');
const locationInput = document.getElementById('location');
const startButton = document.getElementById('start-button');
const progressMessage = document.getElementById('progress-message');
const resultContainer = document.getElementById('result-container');
const loading = document.getElementById('loading');

// Listen for progress updates from the main process
ipcRenderer.on('scraping-progress', (event, log) => {
    console.log({log});
    progressMessage.textContent = log;
});

startButton.addEventListener('click', async () => {
    const query = queryInput.value.trim();
    const location = locationInput.value.trim();

    if (!query || !location) {
        updateProgress('⚠️ Entrambi i campi devono essere compilati!');
        return;
    }

    startButton.disabled = true;
    startButton.textContent = 'Scraping in corso...';
    loading.classList.remove('hidden');

    updateProgress('🚀 Scraping in corso...');

    const { success, filePath, error } = await ipcRenderer.invoke('start-scraping', query, location);

    if (success) {
        updateProgress(`✅ Scraping completato! CSV generato: ${filePath}`);
        setTimeout(clearAll, 5000);
    } else {
        updateProgress(`❌ Errore: ${error}`);
    }

    startButton.disabled = false;
    startButton.textContent = 'Inizia Scraping';
    loading.classList.add('hidden');
});

function updateProgress(text) {
    progressMessage.textContent = text;
}

function clearAll() {
    queryInput.value = '';
    locationInput.value = '';
    progressMessage.textContent = '';
    resultContainer.innerHTML = '';
}
