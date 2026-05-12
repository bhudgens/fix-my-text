const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const { execFile } = require('child_process');
const {
  app: electronApp,
  BrowserWindow,
  clipboard,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  systemPreferences,
  Tray,
} = require('electron');
const { app: expressApp, port, host } = require('./server');

const execFileAsync = promisify(execFile);
const CONFIG_FILE_NAME = 'config.json';
const HOTKEY_EVENT = 'fix-my-text:hotkey-activated';
const APP_ICON_PATH = path.join(__dirname, 'assets', 'app-icon.png');
const WINDOWS_APP_ICON_PATH = path.join(__dirname, 'assets', 'app-icon-windows.png');
const WINDOWS_TRAY_ICON_PATH = path.join(__dirname, 'assets', 'tray-icon-windows.png');
const WINDOWS_TRAY_ICON_2X_PATH = path.join(__dirname, 'assets', 'tray-icon-windows@2x.png');
const MAC_TRAY_ICON_PATH = path.join(__dirname, 'assets', 'tray-iconTemplate.png');
const MAC_TRAY_ICON_2X_PATH = path.join(__dirname, 'assets', 'tray-iconTemplate@2x.png');
const WINDOWS_USER32_TYPE_DEFINITION = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class FixMyTextWin32 {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool IsWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
"@
`;

if (process.platform === 'linux') {
  electronApp.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal');
}

let mainWindow = null;
let pendingActivationPayload = null;
let registeredHotkey = '';
let lastHotkeyError = '';
let lastActivationTarget = null;
let lastActivationTargetError = '';
let serverStarted = false;
let tray = null;
let isQuitting = false;
let initialStartupVisibilityHandled = false;
let pendingShowSettings = false;

let appConfig = {
  hotkey: '',
  hasApiKey: false,
};

const commandAvailability = new Map();
const hasSingleInstanceLock = electronApp.requestSingleInstanceLock();

function getConfigPath() {
  return path.join(electronApp.getPath('userData'), CONFIG_FILE_NAME);
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf8');
    const parsed = JSON.parse(raw);

    if (typeof parsed?.hotkey === 'string' && parsed.hotkey.trim()) {
      appConfig.hotkey = normalizeAccelerator(parsed.hotkey);
    }

    if (typeof parsed?.hasApiKey === 'boolean') {
      appConfig.hasApiKey = parsed.hasApiKey;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Could not load app config:', error);
    }
  }
}

function saveConfig() {
  try {
    fs.mkdirSync(path.dirname(getConfigPath()), { recursive: true });
    fs.writeFileSync(getConfigPath(), JSON.stringify(appConfig, null, 2));
  } catch (error) {
    console.error('Could not save app config:', error);
  }
}

function normalizeAccelerator(value) {
  return String(value || '')
    .replace(/\s*\+\s*/g, '+')
    .trim();
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  const windowOptions = {
    width: 720,
    height: 620,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  };

  const appIconPath = process.platform === 'win32' && fs.existsSync(WINDOWS_APP_ICON_PATH)
    ? WINDOWS_APP_ICON_PATH
    : APP_ICON_PATH;

  if (fs.existsSync(appIconPath)) {
    windowOptions.icon = appIconPath;
  }

  mainWindow = new BrowserWindow(windowOptions);
  mainWindow.setMenu(null);

  mainWindow.loadURL(`http://${host}:${port}`);
  mainWindow.on('close', (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('fix-my-text:config', getRendererConfig());

    if (pendingShowSettings) {
      mainWindow.webContents.send('fix-my-text:show-settings');
      pendingShowSettings = false;
    }

    if (pendingActivationPayload) {
      mainWindow.webContents.send(HOTKEY_EVENT, pendingActivationPayload);
      pendingActivationPayload = null;
    }
  });

  return mainWindow;
}

function getRendererConfig() {
  return {
    version: electronApp.getVersion(),
    hotkey: appConfig.hotkey,
    hasApiKey: appConfig.hasApiKey,
    registeredHotkey,
    lastHotkeyError,
    platform: process.platform,
  };
}

function sendShowSettings() {
  const win = createWindow();

  if (win.webContents.isLoading()) {
    pendingShowSettings = true;
    return;
  }

  win.webContents.send('fix-my-text:show-settings');
}

function revealWindow(options = {}) {
  const { showSettings = false } = options;
  const win = createWindow();

  if (win.isMinimized()) {
    win.restore();
  }

  win.show();
  win.moveTop();
  win.setAlwaysOnTop(true);

  if (process.platform === 'darwin') {
    electronApp.show();
    electronApp.focus({ steal: true });
  }

  win.focus();

  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(false);
    }
  }, 400);

  if (showSettings) {
    sendShowSettings();
  }
}

function shouldStartInBackground() {
  return Boolean(registeredHotkey && appConfig.hasApiKey);
}

function handleInitialStartupVisibility() {
  if (initialStartupVisibilityHandled) {
    return;
  }

  initialStartupVisibilityHandled = true;

  if (!shouldStartInBackground()) {
    revealWindow({ showSettings: true });
  }
}

function createTrayImage() {
  if (process.platform === 'darwin') {
    const macTrayImage = nativeImage.createEmpty();

    if (fs.existsSync(MAC_TRAY_ICON_PATH)) {
      macTrayImage.addRepresentation({
        scaleFactor: 1,
        dataURL: `data:image/png;base64,${fs.readFileSync(MAC_TRAY_ICON_PATH).toString('base64')}`,
      });
    }

    if (fs.existsSync(MAC_TRAY_ICON_2X_PATH)) {
      macTrayImage.addRepresentation({
        scaleFactor: 2,
        dataURL: `data:image/png;base64,${fs.readFileSync(MAC_TRAY_ICON_2X_PATH).toString('base64')}`,
      });
    }

    if (!macTrayImage.isEmpty()) {
      macTrayImage.setTemplateImage(true);
      return macTrayImage;
    }

    const fallbackImage = nativeImage.createFromNamedImage('NSActionTemplate');

    if (!fallbackImage.isEmpty()) {
      fallbackImage.setTemplateImage(true);
      return fallbackImage;
    }
  }

  if (process.platform === 'win32') {
    const windowsTrayImage = nativeImage.createEmpty();

    if (fs.existsSync(WINDOWS_TRAY_ICON_PATH)) {
      windowsTrayImage.addRepresentation({
        scaleFactor: 1,
        dataURL: `data:image/png;base64,${fs.readFileSync(WINDOWS_TRAY_ICON_PATH).toString('base64')}`,
      });
    }

    if (fs.existsSync(WINDOWS_TRAY_ICON_2X_PATH)) {
      windowsTrayImage.addRepresentation({
        scaleFactor: 2,
        dataURL: `data:image/png;base64,${fs.readFileSync(WINDOWS_TRAY_ICON_2X_PATH).toString('base64')}`,
      });
    }

    if (!windowsTrayImage.isEmpty()) {
      return windowsTrayImage;
    }
  }

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect x="6" y="5" width="20" height="22" rx="5" fill="#000000"/>
  <path d="M11 11h10M16 11v11M11 22h10" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
  const image = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
  return image;
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Open',
      click: () => revealWindow(),
    },
    {
      label: 'Settings',
      click: () => revealWindow({ showSettings: true }),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        electronApp.quit();
      },
    },
  ]);
}

function createTray() {
  if (tray && !tray.isDestroyed()) {
    return tray;
  }

  tray = new Tray(createTrayImage());
  tray.setToolTip('Fix My Text');

  tray.setContextMenu(buildTrayMenu());

  if (process.platform !== 'darwin') {
    tray.on('click', () => revealWindow());
  }

  return tray;
}

function unregisterCurrentHotkey() {
  if (!registeredHotkey) {
    return;
  }

  globalShortcut.unregister(registeredHotkey);
  registeredHotkey = '';
}

function registerGlobalHotkey(rawAccelerator) {
  const nextHotkey = normalizeAccelerator(rawAccelerator);

  if (!nextHotkey) {
    unregisterCurrentHotkey();
    appConfig.hotkey = '';
    lastHotkeyError = '';
    saveConfig();

    return {
      ok: true,
      hotkey: '',
      cleared: true,
    };
  }

  if (registeredHotkey === nextHotkey) {
    lastHotkeyError = '';
    return {
      ok: true,
      hotkey: registeredHotkey,
    };
  }

  const previousHotkey = registeredHotkey;
  unregisterCurrentHotkey();

  try {
    const didRegister = globalShortcut.register(nextHotkey, () => {
      void handleGlobalActivation();
    });

    if (!didRegister) {
      registeredHotkey = '';
      lastHotkeyError = `Could not register "${nextHotkey}". It is likely reserved by the OS or already in use.`;

      if (previousHotkey) {
        const restored = globalShortcut.register(previousHotkey, () => {
          void handleGlobalActivation();
        });

        if (restored) {
          registeredHotkey = previousHotkey;
        }
      }

      return {
        ok: false,
        error: lastHotkeyError,
        hotkey: registeredHotkey,
      };
    }

    registeredHotkey = nextHotkey;
    appConfig.hotkey = nextHotkey;
    lastHotkeyError = '';
    saveConfig();

    return {
      ok: true,
      hotkey: registeredHotkey,
    };
  } catch (error) {
    lastHotkeyError = `Invalid accelerator "${nextHotkey}": ${error.message}`;

    if (previousHotkey) {
      try {
        const restored = globalShortcut.register(previousHotkey, () => {
          void handleGlobalActivation();
        });

        if (restored) {
          registeredHotkey = previousHotkey;
        }
      } catch (restoreError) {
        console.error('Could not restore previous hotkey:', restoreError);
      }
    }

    return {
      ok: false,
      error: lastHotkeyError,
      hotkey: registeredHotkey,
    };
  }
}

async function commandExists(command) {
  if (commandAvailability.has(command)) {
    return commandAvailability.get(command);
  }

  try {
    await execFileAsync('which', [command]);
    commandAvailability.set(command, true);
    return true;
  } catch {
    commandAvailability.set(command, false);
    return false;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasUsableText(text) {
  return typeof text === 'string' && text.trim().length > 0;
}

function toPowerShellString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function runWindowsPowerShell(script, options = {}) {
  const encodedCommand = Buffer.from(script, 'utf16le').toString('base64');

  return execFileAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-STA',
    '-EncodedCommand',
    encodedCommand,
  ], {
    ...options,
    windowsHide: true,
  });
}

async function sendWindowsKeys(keys) {
  await runWindowsPowerShell(`
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait(${toPowerShellString(keys)})
  `);
}

function getMacAccessibilityPermissionMessage(action) {
  return `macOS Accessibility permission is required to ${action}. Open System Settings > Privacy & Security > Accessibility, remove Fix My Text if it is already listed, add or enable /Applications/Fix My Text.app again, then quit and reopen Fix My Text. Unsigned app updates can make macOS treat a previous Accessibility approval as stale.`;
}

function openMacAccessibilitySettings() {
  if (process.platform !== 'darwin') {
    return;
  }

  const accessibilityUrl = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility';
  const settingsAppPaths = [
    '/System/Applications/System Settings.app',
    '/System/Applications/System Preferences.app',
  ];

  shell.openExternal(accessibilityUrl).catch((error) => {
    console.error('Could not open macOS Accessibility settings via Electron:', error);
  });

  execFile('/usr/bin/open', [accessibilityUrl], (error) => {
    if (!error) {
      return;
    }

    console.error('Could not open macOS Accessibility settings via open URL:', error);

    const settingsAppPath = settingsAppPaths.find((candidate) => fs.existsSync(candidate));
    if (settingsAppPath) {
      execFile('/usr/bin/open', [settingsAppPath], (fallbackError) => {
        if (fallbackError) {
          console.error('Could not open macOS System Settings app:', fallbackError);
        }
      });
    }
  });
}

function normalizeMacAutomationError(error, action) {
  const message = error?.message || String(error || '');

  if (/not allowed to send keystrokes|not authorized|not permitted|not allowed/i.test(message)) {
    openMacAccessibilitySettings();
    return getMacAccessibilityPermissionMessage(action);
  }

  return message;
}

function ensureMacAccessibilityTrust(action) {
  if (process.platform !== 'darwin') {
    return {
      ok: true,
    };
  }

  if (systemPreferences.isTrustedAccessibilityClient(true)) {
    return {
      ok: true,
    };
  }

  openMacAccessibilitySettings();

  return {
    ok: false,
    error: getMacAccessibilityPermissionMessage(action),
  };
}

function snapshotClipboardText() {
  try {
    return clipboard.readText();
  } catch {
    return '';
  }
}

function restoreClipboardText(text) {
  try {
    clipboard.writeText(text || '');
  } catch (error) {
    console.error('Could not restore clipboard text:', error);
  }
}

async function captureActiveWindowTarget() {
  if (process.platform === 'darwin') {
    const permission = ensureMacAccessibilityTrust('identify the calling app');
    if (!permission.ok) {
      lastActivationTargetError = permission.error;
      return null;
    }

    try {
      const { stdout } = await execFileAsync('/usr/bin/osascript', ['-e', `
tell application "System Events"
  set frontApp to first application process whose frontmost is true
  set appName to name of frontApp
  set appPid to unix id of frontApp
  try
    set appBundle to bundle identifier of frontApp
  on error
    set appBundle to ""
  end try
  return appName & linefeed & appPid & linefeed & appBundle
end tell
      `]);
      const [appName = '', pidText = '', bundleId = ''] = stdout.trimEnd().split(/\r?\n/);
      const pid = Number(pidText);

      if (appName && pid !== process.pid) {
        lastActivationTargetError = '';
        return {
          platform: 'darwin',
          appName,
          bundleId,
          pid: Number.isFinite(pid) ? pid : null,
          source: 'system-events',
        };
      }

      lastActivationTargetError = 'No macOS calling app was active when the hotkey fired.';
      return null;
    } catch (error) {
      lastActivationTargetError = `macOS active app lookup failed: ${normalizeMacAutomationError(error, 'identify the calling app')}`;
      console.error('Could not capture active app target:', lastActivationTargetError);
      return null;
    }
  }

  if (process.platform === 'win32') {
    try {
      const { stdout } = await runWindowsPowerShell(`
$ErrorActionPreference = "Stop"
${WINDOWS_USER32_TYPE_DEFINITION}

$handle = [FixMyTextWin32]::GetForegroundWindow()
if ($handle -eq [IntPtr]::Zero -or -not [FixMyTextWin32]::IsWindow($handle)) {
  throw "No foreground window was available when the hotkey fired."
}

[uint32]$processId = 0
[FixMyTextWin32]::GetWindowThreadProcessId($handle, [ref]$processId) | Out-Null

$titleBuilder = New-Object System.Text.StringBuilder 512
[FixMyTextWin32]::GetWindowText($handle, $titleBuilder, $titleBuilder.Capacity) | Out-Null

$processName = ""
try {
  $processName = (Get-Process -Id ([int]$processId) -ErrorAction Stop).ProcessName
} catch {}

[pscustomobject]@{
  hwnd = $handle.ToInt64()
  pid = [int64]$processId
  title = $titleBuilder.ToString()
  processName = $processName
} | ConvertTo-Json -Compress
      `);
      const target = JSON.parse(stdout.trim());
      const pid = Number(target.pid);
      const hwnd = String(target.hwnd || '');

      if (hwnd && pid !== process.pid) {
        lastActivationTargetError = '';
        return {
          platform: 'win32',
          hwnd,
          pid: Number.isFinite(pid) ? pid : null,
          title: target.title || '',
          processName: target.processName || '',
          source: 'win32-foreground-window',
        };
      }

      lastActivationTargetError = 'No Windows calling app was active when the hotkey fired.';
      return null;
    } catch (error) {
      lastActivationTargetError = `Windows active window lookup failed: ${error.message}`;
      console.error('Could not capture Windows active window target:', lastActivationTargetError);
      return null;
    }
  }

  if (process.platform !== 'linux') {
    lastActivationTargetError = '';
    return null;
  }

  const errors = [];
  const hasXdotool = await commandExists('xdotool');

  if (hasXdotool) {
    try {
      const { stdout } = await execFileAsync('xdotool', ['getactivewindow']);
      const windowId = stdout.trim();

      if (windowId) {
        lastActivationTargetError = '';
        return {
          platform: 'linux',
          windowId,
          source: 'xdotool',
        };
      }

      errors.push('xdotool did not return an active window.');
    } catch (error) {
      errors.push(`xdotool active window lookup failed: ${error.message}`);
    }
  }

  const hasXprop = await commandExists('xprop');
  if (!hasXprop) {
    errors.push('xprop is not installed.');
    lastActivationTargetError = errors.join(' ');
    return null;
  }

  try {
    const { stdout } = await execFileAsync('xprop', ['-root', '_NET_ACTIVE_WINDOW']);
    const windowId = stdout.match(/0x[0-9a-f]+/i)?.[0] || '';

    if (windowId && windowId !== '0x0') {
      lastActivationTargetError = '';
      return {
        platform: 'linux',
        windowId,
        source: 'xprop',
      };
    }

    errors.push('xprop did not return an active window.');
  } catch (error) {
    errors.push(`xprop active window lookup failed: ${error.message}`);
  }

  lastActivationTargetError = errors.join(' ');
  console.error('Could not capture active window target:', lastActivationTargetError);
  return null;
}

function readLinuxPrimarySelection() {
  try {
    const selectedText = clipboard.readText('selection');
    return hasUsableText(selectedText) ? selectedText : '';
  } catch {
    return '';
  }
}

async function captureViaLinuxClipboardCopy() {
  const hasXdotool = await commandExists('xdotool');

  if (!hasXdotool) {
    return {
      text: '',
      method: 'linux-clipboard-copy',
      error: 'xdotool is not installed, so clipboard copy fallback is unavailable.',
    };
  }

  const previousClipboard = snapshotClipboardText();

  try {
    await execFileAsync('xdotool', ['key', '--clearmodifiers', 'ctrl+c']);
    await wait(180);

    const copiedText = snapshotClipboardText();
    if (hasUsableText(copiedText) && copiedText !== previousClipboard) {
      return {
        text: copiedText,
        method: 'linux-clipboard-copy',
      };
    }

    return {
      text: '',
      method: 'linux-clipboard-copy',
      error: 'Clipboard copy fallback did not produce new text.',
    };
  } catch (error) {
    return {
      text: '',
      method: 'linux-clipboard-copy',
      error: `xdotool copy fallback failed: ${error.message}`,
    };
  } finally {
    restoreClipboardText(previousClipboard);
  }
}

async function captureSelectedTextLinux() {
  const primarySelection = readLinuxPrimarySelection();
  if (primarySelection) {
    return {
      text: primarySelection,
      method: 'linux-primary-selection',
    };
  }

  return captureViaLinuxClipboardCopy();
}

async function captureSelectedTextWindows() {
  const previousClipboard = snapshotClipboardText();
  const sentinel = `__fix_my_text_copy_sentinel_${process.pid}_${Date.now()}__`;
  const sentinelToken = 'fix_my_text_copy_sentinel';
  let copiedText = '';

  try {
    clipboard.writeText(sentinel);
    await sendWindowsKeys('^c');
    await wait(220);

    copiedText = snapshotClipboardText();
    if (hasUsableText(copiedText) && copiedText !== sentinel && !copiedText.includes(sentinelToken)) {
      return {
        text: copiedText,
        method: 'windows-sendkeys-copy',
      };
    }

    return {
      text: '',
      method: 'windows-sendkeys-copy',
      error: 'Clipboard copy fallback did not produce new text.',
    };
  } catch (error) {
    return {
      text: '',
      method: 'windows-sendkeys-copy',
      error: `Windows copy fallback failed: ${error.message}`,
    };
  } finally {
    if (previousClipboard.includes(sentinelToken)) {
      restoreClipboardText(copiedText.includes(sentinelToken) ? '' : copiedText);
    } else {
      restoreClipboardText(previousClipboard);
    }
  }
}

async function captureSelectedTextDarwin() {
  const permission = ensureMacAccessibilityTrust('copy selected text');
  if (!permission.ok) {
    return {
      text: '',
      method: 'macos-clipboard-copy',
      error: permission.error,
    };
  }

  const previousClipboard = snapshotClipboardText();
  const sentinel = `__fix_my_text_copy_sentinel_${process.pid}_${Date.now()}__`;
  const sentinelToken = 'fix_my_text_copy_sentinel';
  let copiedText = '';

  try {
    clipboard.writeText(sentinel);
    await execFileAsync('/usr/bin/osascript', [
      '-e',
      'tell application "System Events" to keystroke "c" using command down',
    ]);
    await wait(240);

    copiedText = snapshotClipboardText();
    if (hasUsableText(copiedText) && copiedText !== sentinel && !copiedText.includes(sentinelToken)) {
      return {
        text: copiedText,
        method: 'macos-clipboard-copy',
      };
    }

    return {
      text: '',
      method: 'macos-clipboard-copy',
      error: 'Clipboard copy fallback did not produce selected text. macOS may need Accessibility permission for Fix My Text.',
    };
  } catch (error) {
    return {
      text: '',
      method: 'macos-clipboard-copy',
      error: `macOS copy fallback failed: ${normalizeMacAutomationError(error, 'copy selected text')}`,
    };
  } finally {
    if (previousClipboard.includes(sentinelToken)) {
      restoreClipboardText(copiedText.includes(sentinelToken) ? '' : copiedText);
    } else {
      restoreClipboardText(previousClipboard);
    }
  }
}

async function captureSelectedText() {
  if (process.platform === 'linux') {
    return captureSelectedTextLinux();
  }

  if (process.platform === 'win32') {
    return captureSelectedTextWindows();
  }

  if (process.platform === 'darwin') {
    return captureSelectedTextDarwin();
  }

  return {
    text: '',
    method: 'unsupported',
    error: `Selection capture is not implemented for ${process.platform} yet.`,
  };
}

async function insertRewriteInCallingAppDarwin(text) {
  const permission = ensureMacAccessibilityTrust('insert the rewrite');
  if (!permission.ok) {
    return {
      ok: false,
      error: permission.error,
    };
  }

  if (lastActivationTarget?.platform !== 'darwin') {
    return {
      ok: false,
      error: lastActivationTargetError || 'No calling app is available yet. Trigger Fix My Text from highlighted text first.',
    };
  }

  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }

    clipboard.writeText(text);
    await wait(100);

    await execFileAsync('/usr/bin/osascript', ['-e', `
set targetPidText to system attribute "FIX_MY_TEXT_TARGET_PID"
set targetBundle to system attribute "FIX_MY_TEXT_TARGET_BUNDLE_ID"
set targetName to system attribute "FIX_MY_TEXT_TARGET_APP_NAME"

tell application "System Events"
  set matchingProcesses to {}

  if targetPidText is not "" then
    try
      set targetPid to targetPidText as integer
      set matchingProcesses to application processes whose unix id is targetPid
    end try
  end if

  if (count of matchingProcesses) = 0 and targetBundle is not "" then
    set matchingProcesses to application processes whose bundle identifier is targetBundle
  end if

  if (count of matchingProcesses) = 0 and targetName is not "" then
    set matchingProcesses to application processes whose name is targetName
  end if

  if (count of matchingProcesses) = 0 then
    error "Could not find the calling app to activate."
  end if

  set frontmost of item 1 of matchingProcesses to true
end tell

delay 0.18
tell application "System Events" to keystroke "v" using command down
    `], {
      env: {
        ...process.env,
        FIX_MY_TEXT_TARGET_APP_NAME: lastActivationTarget.appName || '',
        FIX_MY_TEXT_TARGET_BUNDLE_ID: lastActivationTarget.bundleId || '',
        FIX_MY_TEXT_TARGET_PID: lastActivationTarget.pid ? String(lastActivationTarget.pid) : '',
      },
    });
    await wait(220);

    return {
      ok: true,
      method: 'macos-system-events-paste',
    };
  } catch (error) {
    revealWindow();

    return {
      ok: false,
      error: `Insert failed: ${normalizeMacAutomationError(error, 'insert the rewrite')}`,
    };
  }
}

async function insertRewriteInCallingAppWindows(text) {
  if (lastActivationTarget?.platform !== 'win32' || !lastActivationTarget.hwnd) {
    return {
      ok: false,
      error: lastActivationTargetError || 'No calling app is available yet. Trigger Fix My Text from highlighted text first.',
    };
  }

  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }

    clipboard.writeText(text);
    await wait(100);

    await runWindowsPowerShell(`
$ErrorActionPreference = "Stop"
${WINDOWS_USER32_TYPE_DEFINITION}

$hwndText = [Environment]::GetEnvironmentVariable("FIX_MY_TEXT_TARGET_HWND")
if ([string]::IsNullOrWhiteSpace($hwndText)) {
  throw "Missing calling window handle."
}

$hwnd = [IntPtr]::new([int64]$hwndText)
if ($hwnd -eq [IntPtr]::Zero -or -not [FixMyTextWin32]::IsWindow($hwnd)) {
  throw "The calling window is no longer available."
}

if ([FixMyTextWin32]::IsIconic($hwnd)) {
  [FixMyTextWin32]::ShowWindowAsync($hwnd, 9) | Out-Null
} else {
  [FixMyTextWin32]::ShowWindowAsync($hwnd, 5) | Out-Null
}

Start-Sleep -Milliseconds 120
[FixMyTextWin32]::SetForegroundWindow($hwnd) | Out-Null
Start-Sleep -Milliseconds 140

if ([FixMyTextWin32]::GetForegroundWindow().ToInt64() -ne $hwnd.ToInt64()) {
  $pidText = [Environment]::GetEnvironmentVariable("FIX_MY_TEXT_TARGET_PID")
  if (-not [string]::IsNullOrWhiteSpace($pidText)) {
    try {
      $shell = New-Object -ComObject WScript.Shell
      $shell.AppActivate([int]$pidText) | Out-Null
      Start-Sleep -Milliseconds 140
      [FixMyTextWin32]::SetForegroundWindow($hwnd) | Out-Null
      Start-Sleep -Milliseconds 80
    } catch {}
  }
}

if ([FixMyTextWin32]::GetForegroundWindow().ToInt64() -ne $hwnd.ToInt64()) {
  throw "Could not activate the calling window."
}

Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("^v")
      `, {
      env: {
        ...process.env,
        FIX_MY_TEXT_TARGET_HWND: lastActivationTarget.hwnd,
        FIX_MY_TEXT_TARGET_PID: lastActivationTarget.pid ? String(lastActivationTarget.pid) : '',
      },
    });
    await wait(220);

    return {
      ok: true,
      method: 'windows-sendkeys-paste',
    };
  } catch (error) {
    revealWindow();

    return {
      ok: false,
      error: `Insert failed: ${error.message}`,
    };
  }
}

async function handleGlobalActivation() {
  lastActivationTarget = await captureActiveWindowTarget();
  const captureResult = await captureSelectedText();
  const payload = {
    hotkey: registeredHotkey,
    text: captureResult.text || '',
    method: captureResult.method,
    error: captureResult.error || '',
    capturedAt: Date.now(),
    canInsert: Boolean(lastActivationTarget),
    insertTargetError: lastActivationTarget ? '' : lastActivationTargetError,
  };

  revealWindow();

  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send(HOTKEY_EVENT, payload);
  } else {
    pendingActivationPayload = payload;
  }
}

async function insertRewriteInCallingApp(text) {
  if (!hasUsableText(text)) {
    return {
      ok: false,
      error: 'There is no rewrite to insert yet.',
    };
  }

  if (process.platform === 'darwin') {
    return insertRewriteInCallingAppDarwin(text);
  }

  if (process.platform === 'win32') {
    return insertRewriteInCallingAppWindows(text);
  }

  if (process.platform !== 'linux') {
    return {
      ok: false,
      error: `Insert is not implemented for ${process.platform} yet.`,
    };
  }

  if (!lastActivationTarget?.windowId) {
    return {
      ok: false,
      error: lastActivationTargetError || 'No calling app is available yet. Trigger Fix My Text from highlighted text first.',
    };
  }

  const hasXdotool = await commandExists('xdotool');

  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }

    clipboard.writeText(text);
    clipboard.writeText(text, 'selection');
    await wait(80);

    if (hasXdotool) {
      await execFileAsync('xdotool', ['windowactivate', '--sync', lastActivationTarget.windowId]);
      await wait(80);
      await execFileAsync('xdotool', ['key', '--clearmodifiers', 'ctrl+v']);
      await wait(220);

      return {
        ok: true,
        method: 'linux-xdotool-paste',
      };
    }

    const hasPython = await commandExists('python3');
    if (!hasPython) {
      return {
        ok: false,
        error: 'Insert needs either xdotool or python3 with X11 libraries to paste back into the calling app.',
      };
    }

    await execFileAsync('python3', ['-c', `
import ctypes
import os
import sys
import time

target = int(os.environ["FIX_MY_TEXT_TARGET_WINDOW"], 0)
x11 = ctypes.CDLL("libX11.so.6")
xtst = ctypes.CDLL("libXtst.so.6")

ClientMessage = 33
SubstructureNotifyMask = 1 << 19
SubstructureRedirectMask = 1 << 20

class XClientMessageEvent(ctypes.Structure):
    _fields_ = [
        ("type", ctypes.c_int),
        ("serial", ctypes.c_ulong),
        ("send_event", ctypes.c_int),
        ("display", ctypes.c_void_p),
        ("window", ctypes.c_ulong),
        ("message_type", ctypes.c_ulong),
        ("format", ctypes.c_int),
        ("data", ctypes.c_long * 5),
    ]

class XEvent(ctypes.Union):
    _fields_ = [
        ("xclient", XClientMessageEvent),
        ("pad", ctypes.c_long * 24),
    ]

x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
x11.XDefaultRootWindow.restype = ctypes.c_ulong
x11.XInternAtom.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]
x11.XInternAtom.restype = ctypes.c_ulong
x11.XSendEvent.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_long, ctypes.POINTER(XEvent)]
x11.XMapRaised.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XRaiseWindow.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XSetInputFocus.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XKeysymToKeycode.restype = ctypes.c_uint
x11.XFlush.argtypes = [ctypes.c_void_p]
x11.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]
xtst.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]

display_name = os.environ.get("DISPLAY")
display = x11.XOpenDisplay(display_name.encode() if display_name else None)
if not display:
    sys.exit("Could not open X display.")

root = x11.XDefaultRootWindow(display)
active_window_atom = x11.XInternAtom(display, b"_NET_ACTIVE_WINDOW", 0)
if active_window_atom:
    event = XEvent()
    event.xclient.type = ClientMessage
    event.xclient.display = display
    event.xclient.window = target
    event.xclient.message_type = active_window_atom
    event.xclient.format = 32
    event.xclient.data[0] = 2
    event.xclient.data[1] = 0
    event.xclient.data[2] = 0
    event.xclient.data[3] = 0
    event.xclient.data[4] = 0
    x11.XSendEvent(display, root, 0, SubstructureRedirectMask | SubstructureNotifyMask, ctypes.byref(event))

x11.XMapRaised(display, target)
x11.XRaiseWindow(display, target)
x11.XFlush(display)
time.sleep(0.35)

x11.XSetInputFocus(display, target, 2, 0)
x11.XFlush(display)
time.sleep(0.08)

ctrl = x11.XKeysymToKeycode(display, 0xffe3)
v = x11.XKeysymToKeycode(display, ord("v"))
if not ctrl or not v:
    sys.exit("Could not resolve Ctrl+V keycodes.")

xtst.XTestFakeKeyEvent(display, ctrl, 1, 0)
xtst.XTestFakeKeyEvent(display, v, 1, 0)
xtst.XTestFakeKeyEvent(display, v, 0, 0)
xtst.XTestFakeKeyEvent(display, ctrl, 0, 0)
x11.XSync(display, 0)
      `], {
        env: {
          ...process.env,
          FIX_MY_TEXT_TARGET_WINDOW: lastActivationTarget.windowId,
        },
      });
    await wait(220);

    return {
      ok: true,
      method: 'linux-x11-paste',
    };
  } catch (error) {
    revealWindow();

    return {
      ok: false,
      error: `Insert failed: ${error.message}`,
    };
  }
}

function registerIpcHandlers() {
  ipcMain.handle('fix-my-text:get-config', () => getRendererConfig());
  ipcMain.handle('fix-my-text:set-hotkey', (_event, accelerator) => {
    const result = registerGlobalHotkey(accelerator);

    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
      mainWindow.webContents.send('fix-my-text:config', getRendererConfig());
    }

    return result;
  });
  ipcMain.handle('fix-my-text:insert-rewrite', (_event, text) => insertRewriteInCallingApp(text));
  ipcMain.handle('fix-my-text:open-accessibility-settings', () => {
    openMacAccessibilitySettings();

    return {
      ok: true,
    };
  });
  ipcMain.handle('fix-my-text:set-settings-state', (_event, state) => {
    if (typeof state?.hasApiKey === 'boolean') {
      appConfig.hasApiKey = state.hasApiKey;
      saveConfig();
    }

    handleInitialStartupVisibility();

    return {
      ok: true,
    };
  });
  ipcMain.handle('fix-my-text:resize-to-content', (_event, height) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return {
        ok: false,
        error: 'Window unavailable.',
      };
    }

    const desiredHeight = Number(height);
    if (!Number.isFinite(desiredHeight) || desiredHeight <= 0) {
      return {
        ok: false,
        error: 'Invalid height.',
      };
    }

    const [width, currentHeight] = mainWindow.getContentSize();
    const display = screen.getDisplayMatching(mainWindow.getBounds());
    const maxHeight = Math.max(420, display.workArea.height - 80);
    const nextHeight = Math.max(420, Math.min(maxHeight, Math.round(desiredHeight)));

    if (Math.abs(currentHeight - nextHeight) > 4) {
      mainWindow.setContentSize(width, nextHeight);
    }

    return {
      ok: true,
      height: nextHeight,
    };
  });
}

function startElectronApp() {
  if (serverStarted) {
    return;
  }

  serverStarted = true;
  registerIpcHandlers();

  expressApp.listen(port, host, () => {
    console.log(`Serving Fix My Text at http://${host}:${port}`);

    electronApp.whenReady().then(() => {
      Menu.setApplicationMenu(null);
      loadConfig();
      createTray();

      if (process.platform === 'darwin') {
        electronApp.setActivationPolicy('accessory');
      }

      if (appConfig.hotkey) {
        registerGlobalHotkey(appConfig.hotkey);
      }
      createWindow();
      setTimeout(handleInitialStartupVisibility, 1500);

      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
        mainWindow.webContents.send('fix-my-text:config', getRendererConfig());
      }
    });
  });
}

if (!hasSingleInstanceLock) {
  electronApp.quit();
} else {
  electronApp.on('second-instance', () => {
    revealWindow({ showSettings: true });
  });

  startElectronApp();

  electronApp.on('before-quit', () => {
    isQuitting = true;
  });

  electronApp.on('window-all-closed', () => {});

  electronApp.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      revealWindow();
    }
  });

  electronApp.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
}
