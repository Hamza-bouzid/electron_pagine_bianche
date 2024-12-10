const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const playwright = require('playwright');
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
        const rejectButton = await page.locator('.ubl-cst__btn--reject');
        if (await rejectButton.isVisible()) {
            await rejectButton.click();
        }
    } catch (e) {
        console.error('Error rejecting cookies:', e);
    }
}

// Scrape data with Playwright
async function scrapeData(query, location) {
    const results = [];
    const browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`https://www.paginebianche.it/ricerca?qs=${query}&dv=${location}`);

    // Reject cookies
    await rejectCookies(page);

    const cards = await page.locator('.list-element--free');
    for (let i = 0; i < await cards.count(); i++) {
        try {
            const name = await cards.nth(i).locator('.list-element__title').textContent();
            const address = await cards.nth(i).locator('.list-element__address').textContent();
            const phone = await extractPhoneNumber(cards.nth(i));

            results.push({ Nome: name, Telefono: phone, Indirizzo: address });
        } catch (e) {
            console.error(`Error processing result ${i}:`, e);
        }
    }

    await browser.close();
    return results;
}

// Extract phone number from a card
async function extractPhoneNumber(card) {
    const phoneBtn = await card.locator('.phone-numbers__cloak.btn');
    try {
        await phoneBtn.waitFor({ state: 'visible', timeout: 5000 });
        await phoneBtn.click();
        const phoneLocator = await card.locator('.tel');
        const phone = phoneLocator.count() > 0 ? await phoneLocator.first().textContent() : 'N/A';
        return phone;
    } catch {
        return 'Non disponibile';
    }
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
        const data = await scrapeData(query, location);
        if (!data || data.length === 0) {
            throw new Error('No data found.');
        }
        const fileName = `${query}_${location}_${new Date().toISOString().replace(/[^\w\s]/gi, '')}`;
        const filePath = saveToCSV(data, fileName);
        return { success: true, filePath };
    } catch (error) {
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
