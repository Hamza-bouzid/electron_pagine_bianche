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
// Function to reject cookies if the button is visible
async function rejectCookies(page) {
    try {
        // Wait for the reject button to be visible and clickable
        const rejectButton = await page.locator('.ubl-cst__btn--reject');

        // Wait for the button to be visible and ready for interaction
        await rejectButton.waitFor({ state: 'visible', timeout: 5000 });

        // Check if the button is interactable and then click it
        if (await rejectButton.isVisible() && await rejectButton.isEnabled()) {
            await rejectButton.click();
            if (win) {
                win.webContents.send('scraping-progress', '🍪 Cookies rejected');
            }
        } else {
            console.log('Reject button is not clickable.');
        }
    } catch (e) {
        console.error('Error rejecting cookies:', e);
    }
}


async function loadMoreResults(page) {
    try {
        const loadMoreButton = await page.locator('.click-load-others');
        if (await loadMoreButton.isVisible()) {
            await loadMoreButton.click();
        }
    } catch (e) {
        console.log(`Error loading more results: ${e}`);
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

    await loadMoreResults(page);

    const cards = await page.locator('.list-element--free');
    for (let i = 0; i < await cards.count(); i++) {
        try {
            const name = await cards.nth(i).locator('.list-element__title').textContent();
            const address = await cards.nth(i).locator('.list-element__address').textContent();
            const phone = await extractPhoneNumber(cards.nth(i));

            results.push({ Nome: name, Telefono: phone, Indirizzo: address });

            // Send log for each contact found
            if (win) {
                win.webContents.send('scraping-progress', `📇 Found contact: ${name}`);
            }
        } catch (e) {
            console.error(`Error processing result ${i}:`, e);
        }
    }

    await browser.close();
    return results;
}

// Extract phone number from a card
async function extractPhoneNumber(card) {
    let phone = 'Non disponibile';

    try {
        // Locate the phone number button and wait for it to be visible
        const phoneButton = await card.locator('.phone-numbers__cloak.btn');

        // Wait for the phone button to be visible before clicking
        await phoneButton.waitFor({ state: 'visible', timeout: 5000 });

        // Click the phone button to reveal the phone number
        await phoneButton.click();

        // Locate the phone number element
        const phoneLocator = await card.locator('.tel');

        // Check if there are any phone numbers found and select the first one
        const phoneText = await phoneLocator.first().textContent();

        // If the phone number exists, assign it; otherwise, return "Non disponibile"
        phone = phoneText ? phoneText.trim() : 'N/A';
    } catch (e) {
        // If any error occurs, return 'Non disponibile'
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
        // Notify the renderer that scraping has started
        if (win) {
            win.webContents.send('scraping-progress', '🚀 Processo di scraping in corso...');
        }

        const data = await scrapeData(query, location);

        if (!data || data.length === 0) {
            throw new Error('No data found.');
        }

        const fileName = `${query}_${location}_${new Date().toISOString().replace(/[^\w\s]/gi, '')}`;
        const filePath = saveToCSV(data, fileName);

        // Notify progress that CSV is generated
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
