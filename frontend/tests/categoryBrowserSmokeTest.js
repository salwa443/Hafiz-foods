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
const remoteDebuggingPort = 9333;
const userDataDir = path.join(os.tmpdir(), `qr-menu-browser-test-${Date.now()}`);
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
        };
        const email = await waitFor(() => document.querySelector('input[name="email"]'));
        const password = document.querySelector('input[name="password"]');
        setValue(email, 'auth.admin@example.com');
        setValue(password, 'StrongPassword123');
        document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitFor(() => location.pathname === '/admin');
        return { path: location.pathname, hasToken: Boolean(localStorage.getItem('staffToken')) };
      })()
    `);
    record('admin logs in through browser UI', loginResult.path === '/admin' && loginResult.hasToken, loginResult.path);

    await navigate(client, 'http://localhost:5173/admin/categories');
    const categoryResult = await runInPage(client, `
      (async () => {
        const testName = 'Browser Category ' + Date.now();
        const updatedName = testName + ' Updated';
        const waitFor = async (fn, timeout = 8000) => {
          const start = Date.now();
          while (Date.now() - start < timeout) {
            const value = fn();
            if (value) return value;
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          throw new Error('Timed out waiting for category UI.');
        };
        const setValue = (element, value) => {
          const descriptor = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value');
          descriptor.set.call(element, value);
          element.dispatchEvent(new Event('input', { bubbles: true }));
        };
        const clickButton = (root, text) => {
          const button = [...root.querySelectorAll('button')].find((item) => item.textContent.trim().startsWith(text));
          if (!button) throw new Error('Missing button: ' + text);
          button.click();
        };
        const rowByText = (text) => [...document.querySelectorAll('tbody tr')].find((row) => row.textContent.includes(text));

        await waitFor(() => document.querySelector('input[name="name"]'));
        setValue(document.querySelector('input[name="name"]'), testName);
        setValue(document.querySelector('textarea[name="description"]'), 'Created in browser smoke test.');
        setValue(document.querySelector('input[name="displayOrder"]'), '41');
        document.querySelector('.management-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitFor(() => rowByText(testName));
        const created = Boolean(rowByText(testName));

        clickButton(rowByText(testName), 'Edit');
        await waitFor(() => document.querySelector('.management-form h3')?.textContent.includes('Edit'));
        setValue(document.querySelector('input[name="name"]'), updatedName);
        setValue(document.querySelector('textarea[name="description"]'), 'Updated in browser smoke test.');
        setValue(document.querySelector('input[name="displayOrder"]'), '42');
        document.querySelector('.management-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitFor(() => rowByText(updatedName));
        const edited = Boolean(rowByText(updatedName));

        window.confirm = () => true;
        clickButton(rowByText(updatedName), 'Deactivate');
        await waitFor(() => rowByText(updatedName)?.textContent.includes('Inactive'));
        const deactivated = rowByText(updatedName)?.textContent.includes('Inactive');

        return { created, edited, deactivated };
      })()
    `);

    record('category creation works in browser', categoryResult.created);
    record('category editing works in browser', categoryResult.edited);
    record('category deactivation works in browser', categoryResult.deactivated);
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
