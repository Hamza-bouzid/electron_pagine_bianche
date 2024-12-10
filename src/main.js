const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const puppeteer = require('puppeteer');
const fs = require('fs');
const { createObjectCsvWriter } = require('csv-writer');
const os = require('os');

let win;

function createWindow() {
    win = new BrowserWindow({
        width: 500,
        height: 300,
        resizable: false,
        webPreferences: {
            preload: path.join(__dirname, 'renderer.js'), // Loads the renderer.js
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    win.loadFile('src/index.html'); // Load the HTML for the UI
}

// Function to reject cookies if the button is visible
async function rejectCookies(page) {
    try {
        const rejectButton = await page.$('.ubl-cst__btn--reject');
        if (rejectButton) {
            await rejectButton.click();
            if (win) {
                win.webContents.send('scraping-progress', '🍪 Cookies rejected');
            }
        }
    } catch (e) {
        console.error('Error rejecting cookies:', e);
    }
}

// Function to load more results
async function loadMoreResults(page) {
    try {
        const loadMoreButton = await page.$('.click-load-others');
        if (loadMoreButton) {
            await loadMoreButton.click();
            await page.waitForTimeout(2000); // Allow time for results to load
        }
    } catch (e) {
        console.log(`Error loading more results: ${e}`);
    }
}

// Scrape data with Puppeteer
async function scrapeData(query, location) {
    const results = [];
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`https://www.paginebianche.it/ricerca?qs=${query}&dv=${location}`);

    // Reject cookies
    await rejectCookies(page);

    // Load more results if available
    await loadMoreResults(page);

    const cards = await page.$$('.list-element--free');
    for (const card of cards) {
        try {
            const name = await card.$eval('.list-element__title', el => el.textContent.trim());
            const address = await card.$eval('.list-element__address', el => el.textContent.trim());
            const phone = await extractPhoneNumber(card);

            results.push({ Nome: name, Telefono: phone, Indirizzo: address });

            // Send log for each contact found
            if (win) {
                win.webContents.send('scraping-progress', `Contatto trovato: ${name}`);
            }
        } catch (e) {
            console.error('Error processing card:', e);
        }
    }

    await browser.close();
    return results;
}

// Extract phone number from a card
async function extractPhoneNumber(card) {
    let phone = 'Non disponibile';
    try {
        const phoneButton = await card.$('.phone-numbers__cloak.btn');
        if (phoneButton) {
            await phoneButton.click();
            const phoneElement = await card.$('.tel');
            if (phoneElement) {
                phone = await phoneElement.evaluate(el => el.textContent.trim());
            }
        }
    } catch (e) {
        console.log(`Error extracting phone number: ${e}`);
    }
    return phone;
}

// Save results to CSV
function saveToCSV(data, fileName) {
    const desktopDir = os.platform() === 'win32'
        ? 'C:\\Users\\User\\Desktop\\'
        : path.join(os.homedir(), 'Desktop');
    const outputFolder = path.join(desktopDir, 'csv');

    if (!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder);
    }

    const filePath = path.join(outputFolder, `${fileName}.csv`);

    const csvWriter = createObjectCsvWriter({
        path: filePath,
        header: [
            { id: 'Nome', title: 'Nome' },
            { id: 'Telefono', title: 'Telefono' },
            { id: 'Indirizzo', title: 'Indirizzo' },
        ],
    });

    csvWriter.writeRecords(data);
    return filePath;
}

// Handle scraping and file saving via IPC
ipcMain.handle('start-scraping', async (_, query, location) => {
    try {
        if (win) {
            win.webContents.send('scraping-progress', '🚀 Processo di scraping in corso...');
        }

        const data = await scrapeData(query, location);

        if (!data || data.length === 0) {
            throw new Error('No data found.');
        }

        const fileName = `${query}_${location}_${new Date().toISOString().replace(/[^\w\s]/gi, '')}`;
        const filePath = saveToCSV(data, fileName);

        if (win) {
            win.webContents.send('scraping-progress', `📝 CSV generato: ${filePath}`);
        }

        return { success: true, filePath };
    } catch (error) {
        console.error('Scraping Error:', error);
        if (win) {
            win.webContents.send('scraping-progress', `❌ Errore: ${error.message}`);
        }
        return { success: false, error: error.message };
    }
});

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
