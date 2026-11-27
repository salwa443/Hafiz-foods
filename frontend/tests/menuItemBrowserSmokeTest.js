/* global process */

import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const browserPaths = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const browserPath = browserPaths.find((candidate) => fs.existsSync(candidate));
const remoteDebuggingPort = 9334;
const userDataDir = path.join(os.tmpdir(), `qr-menu-item-browser-test-${Date.now()}`);
const results = [];

function record(test, passed, detail = '') {
  results.push({ test, status: passed ? 'PASS' : 'FAIL', detail });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForBrowser() {
  for (let index = 0; index < 50; index += 1) {
    try {
      const response = await fetch(`http://localhost:${remoteDebuggingPort}/json/version`);
      if (response.ok) {
        return response.json();
      }
    } catch {
      await delay(100);
    }
  }

  throw new Error('Browser debugging endpoint did not become available.');
}

async function createPageTarget() {
  const response = await fetch(`http://localhost:${remoteDebuggingPort}/json/new?about:blank`, {
    method: 'PUT',
  });

  if (!response.ok) {
    throw new Error('Could not create a browser page target.');
  }

  return response.json();
}

function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  let nextId = 1;
  const pending = new Map();

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const callback = pending.get(message.id);

    if (!callback) {
      return;
    }

    pending.delete(message.id);

    if (message.error) {
      callback.reject(new Error(message.error.message));
      return;
    }

    callback.resolve(message.result);
  });

  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => {
      resolve({
        send(method, params = {}) {
          const id = nextId;
          nextId += 1;

          const payload = { id, method, params };
          const promise = new Promise((resolveMessage, rejectMessage) => {
            pending.set(id, { resolve: resolveMessage, reject: rejectMessage });
          });

          socket.send(JSON.stringify(payload));
          return promise;
        },
        close() {
          socket.close();
        },
      });
    });

    socket.addEventListener('error', () => {
      reject(new Error('Could not connect to browser debugging socket.'));
    });
  });
}

async function runInPage(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Browser evaluation failed.');
  }

  return result.result.value;
}

async function navigate(client, url) {
  await client.send('Page.navigate', { url });
  await delay(1000);
}

async function runTest() {
  if (!browserPath) {
    throw new Error('No Chrome or Edge browser binary was found.');
  }

  const browser = spawn(browserPath, [
    '--headless=new',
    `--remote-debugging-port=${remoteDebuggingPort}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-first-run',
    'about:blank',
  ]);

  let client;

  try {
    await waitForBrowser();
    const pageInfo = await createPageTarget();
    client = await createCdpClient(pageInfo.webSocketDebuggerUrl);
    await client.send('Page.enable');
    await client.send('Runtime.enable');

    await navigate(client, 'http://localhost:5173/staff/login');
    const loginResult = await runInPage(client, `
      (async () => {
        const waitFor = async (fn, timeout = 6000) => {
          const start = Date.now();
          while (Date.now() - start < timeout) {
            const value = fn();
            if (value) return value;
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          throw new Error('Timed out waiting for login page.');
        };
        const setValue = (element, value) => {
          const descriptor = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value');
          descriptor.set.call(element, value);
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        };
        const email = await waitFor(() => document.querySelector('input[name="email"]'));
        const password = document.querySelector('input[name="password"]');
        setValue(email, 'auth.admin@example.com');
        setValue(password, 'StrongPassword123');
        document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitFor(() => location.pathname === '/admin');
        return { path: location.pathname, hasToken: Boolean(sessionStorage.getItem('staffToken')) };
      })()
    `);
    record('admin logs in through browser UI', loginResult.path === '/admin' && loginResult.hasToken, loginResult.path);

    const dashboardResult = await runInPage(client, `
      (async () => {
        const waitFor = async (fn, timeout = 8000) => {
          const start = Date.now();
          while (Date.now() - start < timeout) {
            const value = fn();
            if (value) return value;
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          throw new Error('Timed out waiting for admin dashboard.');
        };
        await waitFor(() => document.querySelectorAll('.summary-card strong').length === 4);
        const token = sessionStorage.getItem('staffToken');
        const response = await fetch('http://localhost:5000/api/admin/categories/summary', {
          headers: { Authorization: 'Bearer ' + token },
        });
        const json = await response.json();
        const displayedCounts = [...document.querySelectorAll('.summary-card strong')].map((item) => Number(item.textContent.trim()));
        const apiCounts = [
          json.data.active_categories,
          json.data.active_menu_items,
          json.data.available_menu_items,
          json.data.unavailable_menu_items,
        ];
        return {
          cardsVisible: displayedCounts.length === 4,
          countsMatch: displayedCounts.every((count, index) => count === apiCounts[index]),
        };
      })()
    `);
    record(
      'admin dashboard displays correct summary counts',
      dashboardResult.cardsVisible && dashboardResult.countsMatch
    );

    const setupResult = await runInPage(client, `
      (async () => {
        const token = sessionStorage.getItem('staffToken');
        const name = 'Browser Menu Category ' + Date.now();
        const response = await fetch('http://localhost:5000/api/admin/categories', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name,
            description: 'Temporary category for menu item browser smoke test.',
            displayOrder: 90,
          }),
        });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.message || 'Could not create test category.');
        }
        return { categoryId: json.data.category.id, categoryName: json.data.category.name };
      })()
    `);
    record('active category is available for menu item form', Boolean(setupResult.categoryId), setupResult.categoryName);

    await navigate(client, 'http://localhost:5173/admin/menu-items');
    const menuResult = await runInPage(client, `
      (async () => {
        const testName = 'Browser Menu Item ' + Date.now();
        const updatedName = testName + ' Updated';
        const firstPngBytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='), (char) => char.charCodeAt(0));
        const secondPngBytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (char) => char.charCodeAt(0));

        const waitFor = async (fn, timeout = 10000) => {
          const start = Date.now();
          while (Date.now() - start < timeout) {
            const value = fn();
            if (value) return value;
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          throw new Error('Timed out waiting for menu item UI.');
        };
        const setValue = (element, value) => {
          const descriptor = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value');
          descriptor.set.call(element, value);
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        };
        const setFile = (input, filename, bytes) => {
          const file = new File([bytes], filename, { type: 'image/png' });
          const transfer = new DataTransfer();
          transfer.items.add(file);
          input.files = transfer.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        };
        const clickButton = (root, text) => {
          const button = [...root.querySelectorAll('button')].find((item) => item.textContent.trim().startsWith(text));
          if (!button) throw new Error('Missing button: ' + text);
          button.click();
        };
        const rowByText = (text) => [...document.querySelectorAll('tbody tr')].find((row) => row.textContent.includes(text));

        await waitFor(() => document.querySelector('select[name="categoryId"] option[value="${setupResult.categoryId}"]'));
        setValue(document.querySelector('select[name="categoryId"]'), '${setupResult.categoryId}');
        setValue(document.querySelector('input[name="name"]'), testName);
        setValue(document.querySelector('textarea[name="description"]'), 'Created in menu item browser smoke test.');
        setValue(document.querySelector('input[name="price"]'), '12.50');
        setFile(document.querySelector('input[name="image"]'), 'first-menu-test.png', firstPngBytes);
        await waitFor(() => document.querySelector('.image-preview img[src^="blob:"]'));
        const previewedUpload = Boolean(document.querySelector('.image-preview img[src^="blob:"]'));
        document.querySelector('.management-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitFor(() => rowByText(testName));
        const createdRow = rowByText(testName);
        const created = Boolean(createdRow);
        const firstImageSrc = createdRow.querySelector('img')?.src || '';

        clickButton(createdRow, 'Edit');
        await waitFor(() => document.querySelector('.management-form h3')?.textContent.includes('Edit'));
        const displayedExistingImage = Boolean(document.querySelector('.image-preview img[src*="/uploads/menu/"]'));
        setValue(document.querySelector('input[name="name"]'), updatedName);
        setValue(document.querySelector('textarea[name="description"]'), 'Updated in menu item browser smoke test.');
        setValue(document.querySelector('input[name="price"]'), '14.75');
        setFile(document.querySelector('input[name="image"]'), 'second-menu-test.png', secondPngBytes);
        await waitFor(() => document.querySelector('.image-preview img[src^="blob:"]'));
        const previewedReplacement = Boolean(document.querySelector('.image-preview img[src^="blob:"]'));
        document.querySelector('.management-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitFor(() => rowByText(updatedName));
        const updatedRow = rowByText(updatedName);
        const edited = Boolean(updatedRow?.textContent.includes(updatedName));
        const secondImageSrc = updatedRow.querySelector('img')?.src || '';
        const replacedImage = Boolean(firstImageSrc && secondImageSrc && firstImageSrc !== secondImageSrc);

        clickButton(updatedRow, 'Mark Unavailable');
        await waitFor(() => rowByText(updatedName)?.children[4]?.textContent.trim() === 'Unavailable');
        const availabilityToggled = rowByText(updatedName)?.children[4]?.textContent.trim() === 'Unavailable';

        window.confirm = () => true;
        await waitFor(() => [...rowByText(updatedName).querySelectorAll('button')].some((button) => button.textContent.trim().startsWith('Deactivate')));
        clickButton(rowByText(updatedName), 'Deactivate');
        await waitFor(() => rowByText(updatedName)?.textContent.includes('Inactive'));
        const deactivated = rowByText(updatedName)?.textContent.includes('Inactive');

        return {
          availabilityToggled,
          created,
          deactivated,
          displayedExistingImage,
          edited,
          previewedReplacement,
          previewedUpload,
          replacedImage,
        };
      })()
    `);

    record('menu item image preview works before creation', menuResult.previewedUpload);
    record('menu item creation with uploaded image works in browser', menuResult.created);
    record('existing image displays while editing', menuResult.displayedExistingImage);
    record('menu item editing works in browser', menuResult.edited);
    record('replacement image preview works', menuResult.previewedReplacement);
    record('menu item image replacement works in browser', menuResult.replacedImage);
    record('availability toggle works in browser', menuResult.availabilityToggled);
    record('menu item deactivation works in browser', menuResult.deactivated);
  } finally {
    if (client) {
      client.close();
    }

    browser.kill();
  }
}

runTest()
  .catch((error) => {
    record('browser smoke test runner', false, error.message);
  })
  .finally(() => {
    console.table(results);
    const failed = results.filter((result) => result.status === 'FAIL');

    if (failed.length > 0) {
      process.exitCode = 1;
    }
  });
