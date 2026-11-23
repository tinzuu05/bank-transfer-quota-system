/**
 * Firebase Authentication / Firestore 同步（可選）。
 * 設計：未設定 Firebase 時，主計算器保持完全可用；登入後資料依 UID 隔離。
 * 同步採單一文件（users/{uid}/appData/calculator），以最後一筆成功提交為準。
 * 限制：同時在兩個裝置離線修改可能需要手動解決衝突；請定期備份 JSON。
 */

const CONFIG = window.BANK_FIREBASE_CONFIG || {};
const APP_CHECK_SITE_KEY = window.BANK_APP_CHECK_SITE_KEY || '';
const view = document.body.dataset.view || 'app';
const appStatus = document.getElementById('cloudStatus');
const indicator = document.getElementById('cloudIndicator');
const accountLink = document.getElementById('accountLink');
const signInButton = document.getElementById('googleSignIn');
const signOutButton = document.getElementById('googleSignOut');
const authMessage = document.getElementById('authMessage');
const authDebugReport = document.getElementById('authDebugReport');
const appCheckIndicator = document.getElementById('appCheckIndicator');
const copyAuthDebug = document.getElementById('copyAuthDebug');
let latestAuthErrorCode = '';
let latestAuthCheck = '尚未檢查';
const uploadButton = document.getElementById('cloudUpload');
const downloadButton = document.getElementById('cloudDownload');
const SYNC_PENDING = 'bank-quota-cloud-unsynced';
const SYNC_OWNER = 'bank-quota-sync-owner';
const LOCAL_KEY = 'three-bank-quota-calculator-v3';

let firebaseAuth = null;
let firebaseDb = null;
let activeUser = null;
let remoteDocument = null;
let syncReady = false;
let uploading = false;
let pendingTimer = null;
let unsubscribe = null;
let appSdk = null;
let authSdk = null;
let firestoreSdk = null;
let appCheckSdk = null;
let appCheckState = '尚未初始化';

function setAppCheckState(message) {
  appCheckState = message;
  if (appCheckIndicator) appCheckIndicator.textContent = `App Check：${message}`;
  updateAuthDiagnostics();
}

function status(message, cls = '') {
  if (appStatus) appStatus.textContent = message;
  if (authMessage) authMessage.textContent = message;
  if (indicator) indicator.className = `status-dot ${cls}`;
}

/**
 * 先檢查公開的 Web 設定，而非在設定不完整時直接呼叫 OAuth。
 * 不輸出 apiKey 原文，避免使用者誤將組態或其他資料貼到公開問題單。
 */
function validateConfig() {
  for (const key of ['apiKey', 'authDomain', 'projectId', 'appId']) {
    const value = CONFIG[key];
    if (typeof value !== 'string' || !value.trim()) return `GitHub Actions 未產生 Firebase 設定（缺少 ${key}）`;
    if (/^(你的|請填|YOUR_|REPLACE_|TODO|<|\{)/i.test(value.trim()) || value.includes('你的')) {
      return `GitHub Secrets 的 ${key} 仍是範例文字`;
    }
  }
  if (!CONFIG.authDomain.includes('.') || CONFIG.authDomain.includes('://') || CONFIG.authDomain.includes('/')) {
    return 'authDomain 格式錯誤：只能填入網域，不要包含 https:// 或路徑';
  }
  if (!/^1:(\d+):web:[a-f0-9]+$/i.test(CONFIG.appId) || CONFIG.appId.split(':')[1] !== CONFIG.messagingSenderId) {
    return 'Firebase appId 與 messagingSenderId 不一致，請從同一個 Web App 重新複製（工作流程也會檢查）';
  }
  if (typeof APP_CHECK_SITE_KEY !== 'string' || !APP_CHECK_SITE_KEY.trim()) {
    return 'GitHub Actions 尚未產生 App Check 網站金鑰，請檢查 Repository Secret';
  }
  if (/\s/.test(CONFIG.projectId) || /\s/.test(CONFIG.apiKey)) {
    return 'Firebase 設定值包含空白，請重新從 Firebase Console 複製';
  }
  return '';
}

/** 回報只含公開站台資訊、設定檢查結果及 Firebase 錯誤代碼的診斷文字。 */
function updateAuthDiagnostics() {
  if (!authDebugReport) return;
  authDebugReport.textContent = [
    `站台網域：${location.hostname || '(本機檔案)'}`,
    `傳輸協定：${location.protocol}`,
    `Firebase Web 設定：${latestAuthCheck}`,
    `Firebase 授權網域待確認：${location.hostname || '(尚未部署)'}`,
    `Google 登入：請確認 Authentication > Sign-in method > Google 已啟用`,
    `App Check：${appCheckState}`,
    `最近錯誤代碼：${latestAuthErrorCode || '無'}`,
    '本診斷不包含 API Key、登入 Token 或銀行資料。'
  ].join('\n');
}


function waitForQuotaApp() {
  if (window.BankQuotaStore) return Promise.resolve();
  return new Promise((resolve) => window.addEventListener('bank-quota-app-ready', resolve, { once: true }));
}

/** 初始化 Google 登入，絕不在設定缺失時嘗試網路連線。 */
async function setup() {
  const configIssue = validateConfig();
  latestAuthCheck = configIssue || '已填寫必要欄位（尚未驗證是否正確）';
  updateAuthDiagnostics();
  if (configIssue) {
    status(`${configIssue}；請檢查 GitHub Repository Secrets，重新執行 Actions 部署。`, 'warn');
    if (signInButton) signInButton.disabled = true;
    if (signOutButton) signOutButton.disabled = true;
    return;
  }
  if (location.protocol === 'file:') {
    status('Google 登入需要 HTTPS 或 localhost。請部署至 GitHub Pages；本機 HTML 仍可離線試算。', 'warn');
    latestAuthErrorCode = 'insecure-context';
    updateAuthDiagnostics();
    if (signInButton) signInButton.disabled = true;
    if (signOutButton) signOutButton.disabled = true;
    return;
  }
  status('正在連線 Google 登入服務…');
  try {
    const version = '11.10.0';
    [appSdk, authSdk, firestoreSdk, appCheckSdk] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-firestore.js`),
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-app-check.js`)
    ]);
    const firebaseApp = appSdk.initializeApp(CONFIG);
    // Firebase App Check MUST initialize before accessing Firestore.
    const appCheck = appCheckSdk.initializeAppCheck(firebaseApp, {
      provider: new appCheckSdk.ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: true
    });
    setAppCheckState('已啟用驗證，正在取得 Token…');
    // Do not block the Google sign-in button while reCAPTCHA Enterprise responds.
    // The provider is already installed, so Firebase requests will attach tokens.
    void appCheckSdk.getToken(appCheck, false).then(() => {
      setAppCheckState('有效 Token 已取得');
    }).catch((error) => {
      setAppCheckState('取得 Token 失敗，雲端同步可能被拒絕');
      latestAuthErrorCode = error?.code || 'appcheck/token-failed';
      updateAuthDiagnostics();
    });
    firebaseAuth = authSdk.getAuth(firebaseApp);
    firebaseDb = firestoreSdk.getFirestore(firebaseApp);
    try {
      await authSdk.setPersistence(firebaseAuth, authSdk.browserLocalPersistence);
    } catch {
      // Safari privacy modes may disallow local persistence. Auth still attempts to work.
      status('瀏覽器限制登入狀態儲存，請使用一般 Safari／Chrome 視窗登入。', 'warn');
    }
    if (signInButton) signInButton.disabled = false;
    if (signOutButton) signOutButton.disabled = false;
    latestAuthCheck = 'Firebase SDK 初始化成功';
    updateAuthDiagnostics();
    authSdk.onAuthStateChanged(firebaseAuth, async (user) => {
      try { await handleUserChange(user); } catch (error) { status(`連線異常：${friendlyError(error)}`, 'warn'); }
    });
  } catch (error) {
    latestAuthErrorCode = error?.code || error?.name || 'sdk-load-failed';
    updateAuthDiagnostics();
    status(`Firebase 初始化失敗 [${latestAuthErrorCode}]：${friendlyError(error)}。可先使用離線模式。`, 'warn');
  }
}

function friendlyError(error) {
  if (error?.code === 'auth/unauthorized-domain') return '請將 GitHub Pages 的網域加入 Firebase 授權網域';
  if (error?.code === 'auth/popup-blocked') return '瀏覽器封鎖 Google 登入視窗，請允許彈出視窗';
  if (error?.code === 'auth/popup-closed-by-user') return '你已關閉登入視窗';
  if (error?.code === 'auth/invalid-api-key' || error?.code === 'auth/api-key-not-valid.-please-pass-a-valid-api-key') return 'Firebase Web API Key 無效，請從 Firebase Console 的 Web App 設定重新複製';
  if (error?.code === 'auth/operation-not-allowed') return 'Firebase Authentication 尚未啟用 Google 登入方式';
  if (error?.code === 'auth/configuration-not-found') return '此 Firebase 專案尚未完成 Authentication 設定，請確認 Google 供應商已啟用';
  if (error?.code === 'auth/network-request-failed') return '網路連線失敗，請檢查網路或瀏覽器阻擋的請求';
  if (error?.code === 'auth/cancelled-popup-request') return '登入視窗請求被取消，請稍後重新點擊一次';
  if (error?.code === 'auth/web-storage-unsupported') return '此瀏覽器禁止登入所需的儲存空間';
  if (error?.code === 'auth/invalid-app-credential') return 'Google 驗證憑證無效，請檢查 Web App 設定和已授權網域';
  if (error?.code === 'permission-denied') return 'Firestore 拒絕讀寫：請檢查 Rules 已發布、登入的 UID 是否為唯一白名單，並確認 App Check';
  if (String(error?.code || '').startsWith('appCheck/') || String(error?.code || '').startsWith('app-check/')) return 'App Check 失敗：確認 reCAPTCHA Enterprise 金鑰的網域與 Firebase 註冊、是否已啟用強制驗證';
  return error?.code ? `代碼：${error.code}` : '未知錯誤（可開啟登入診斷查看代碼）';
}

async function handleUserChange(user) {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  activeUser = user;
  syncReady = false;
  remoteDocument = user ? firestoreSdk.doc(firebaseDb, 'users', user.uid, 'appData', 'calculator') : null;
  if (!user) {
    if (view === 'app') {
      status('本機模式 · 尚未使用 Google 登入', 'warn');
      if (accountLink) { accountLink.textContent = 'Google 登入'; accountLink.href = 'login.html'; }
      if (uploadButton) uploadButton.hidden = true;
      if (downloadButton) downloadButton.hidden = true;
    } else if (view === 'login') status('請使用 Google 帳號登入，登入後可同步交易紀錄。');
    else if (view === 'logout') status('目前尚未登入。');
    return;
  }
  if (view === 'login') {
    status(`已登入 ${user.email || 'Google'}，即將開啟額度計算器。`, 'online');
    location.replace('./index.html');
    return;
  }
  if (view === 'logout') {
    status(`目前登入：${user.email || 'Google 帳號'}。確認後將從本機登出並清除本機記錄。`, 'online');
    return;
  }
  if (accountLink) { accountLink.textContent = '登出 Google'; accountLink.href = 'logout.html'; }
  if (uploadButton) uploadButton.hidden = false;
  if (downloadButton) downloadButton.hidden = false;
  await waitForQuotaApp();
  await initCloudState(user);
}

async function initCloudState(user) {
  status(`已登入 ${user.email || 'Google'} · 正在檢查雲端資料…`);
  const snapshot = await firestoreSdk.getDoc(remoteDocument);
  const remoteData = snapshot.exists() ? snapshot.data()?.payload : null;
  let localData = window.BankQuotaStore.getState();
  const localChanged = localStorage.getItem(SYNC_PENDING) === '1';
  const localOwner = localStorage.getItem(SYNC_OWNER);
  if (localOwner && localOwner !== user.uid) {
    // 絕不把另一 Google 帳號的暫存交易自動上傳到目前帳號。
    window.BankQuotaStore.replaceState({ version: 4, settings: {}, transactions: [], usedOffsets: {} }, 'cloud');
    localData = window.BankQuotaStore.getState();
  }
  if (remoteData && Array.isArray(remoteData.transactions)) {
    const different = JSON.stringify(remoteData) !== JSON.stringify(localData);
    if (different && localChanged && localData.transactions.length > 0) {
      // 同時存在本機與雲端資料時，不擅自覆蓋任何一邊。
      if (!window.confirm('本機與雲端資料不同。\n\n「確定」：改用雲端資料（建議先手動備份本機 JSON）。\n「取消」：保留本機資料並暫停自動同步，可按「上傳本機資料」決定是否覆蓋雲端。')) {
        status('資料有衝突 · 已保留本機，暫停同步。請備份後選擇上傳／下載。', 'warn');
        return;
      }
    }
    if (different) window.BankQuotaStore.replaceState(remoteData, 'cloud');
  } else if (!snapshot.exists()) {
    // 首次登入沒有雲端資料時，將舊版已存在的本機紀錄帶到帳戶。
    await firestoreSdk.setDoc(remoteDocument, { payload: localData, updatedAt: firestoreSdk.serverTimestamp() });
  }
  localStorage.setItem(SYNC_OWNER, user.uid);
  localStorage.removeItem(SYNC_PENDING);
  syncReady = true;
  listenToChanges();
  status(`已登入 ${user.email || 'Google'} · 雲端同步已啟用`, 'online');
  if (localOwner && localOwner !== user.uid) status('注意：你已切換 Google 帳號，已載入新帳號雲端資料。', 'warn');
}

/** 設定更改會由原本 app.js 發出事件，延遲合併成一次寫入。 */
window.addEventListener('bank-quota-state-changed', () => {
  if (!syncReady || !activeUser || view !== 'app') return;
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => { void saveCloud(); }, 700);
});

async function saveCloud() {
  if (!remoteDocument || !syncReady || !activeUser || uploading) return;
  uploading = true;
  const payload = window.BankQuotaStore.getState();
  status('正在同步至 Google 雲端…');
  try {
    await firestoreSdk.setDoc(remoteDocument, { payload, updatedAt: firestoreSdk.serverTimestamp() });
    // 新交易可能在上傳進行途中又修改，不能直接當作已同步。
    if (JSON.stringify(payload) === JSON.stringify(window.BankQuotaStore.getState())) localStorage.removeItem(SYNC_PENDING);
    status(`已同步至 Google 雲端 · ${activeUser.email || ''}`, 'online');
  } catch (error) {
    status(`雲端寫入失敗，本機資料仍保留：${friendlyError(error)}`, 'warn');
    syncReady = false;
  } finally {
    uploading = false;
    if (localStorage.getItem(SYNC_PENDING) === '1' && navigator.onLine && syncReady) {
      clearTimeout(pendingTimer);
      pendingTimer = setTimeout(() => { void saveCloud(); }, 3000);
    }
  }
}

function listenToChanges() {
  if (unsubscribe) unsubscribe();
  unsubscribe = firestoreSdk.onSnapshot(remoteDocument, { includeMetadataChanges: false }, (snapshot) => {
    if (!syncReady || !snapshot.exists() || snapshot.metadata.hasPendingWrites || uploading) return;
    if (localStorage.getItem(SYNC_PENDING) === '1') return; // 不覆蓋正在編輯的本機資料
    const data = snapshot.data()?.payload;
    if (data && JSON.stringify(data) !== JSON.stringify(window.BankQuotaStore.getState())) {
      window.BankQuotaStore.replaceState(data, 'cloud');
      status('已收到其他裝置更新，雲端資料同步完成。', 'online');
    }
  }, (error) => status(`雲端監聽失敗：${friendlyError(error)}`, 'warn'));
}

if (signInButton) signInButton.addEventListener('click', async () => {
  if (!firebaseAuth) return;
  signInButton.disabled = true;
  try {
    // Popup is the officially documented alternative for GitHub Pages to avoid
    // redirect cross-origin storage issues in Safari/Chrome. Call directly on click.
    const provider = new authSdk.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await authSdk.signInWithPopup(firebaseAuth, provider);
  } catch (error) {
    latestAuthErrorCode = error?.code || error?.name || 'unknown';
    updateAuthDiagnostics();
    const extra = ['auth/popup-blocked','auth/popup-closed-by-user','auth/web-storage-unsupported'].includes(latestAuthErrorCode)
      ? '請先在 Safari／Chrome 一般分頁登入、允許彈出視窗，再回到手機主畫面 App。' : '';
    status(`登入失敗 [${latestAuthErrorCode}]：${friendlyError(error)}。${extra}`, 'warn');
  } finally { signInButton.disabled = false; }
});

if (signOutButton) signOutButton.addEventListener('click', async () => {
  if (!firebaseAuth) return;
  if (!window.confirm('確定要登出？本機交易紀錄將清除以保護隱私；請先確認已同步或已備份。')) return;
  if (localStorage.getItem(SYNC_PENDING) === '1' && !window.confirm('警告：本機還有未確認已同步的修改！登出會清除本機資料，可能造成紀錄遺失。請先返回計算器下載 JSON 備份。仍要強制登出嗎？')) return;
  signOutButton.disabled = true;
  try {
    await authSdk.signOut(firebaseAuth);
    localStorage.removeItem(LOCAL_KEY);
    localStorage.removeItem(SYNC_OWNER);
    localStorage.removeItem(SYNC_PENDING);
    location.replace('./login.html');
  } catch (error) {
    status(`登出失敗：${friendlyError(error)}`, 'warn');
    signOutButton.disabled = false;
  }
});

if (uploadButton) uploadButton.addEventListener('click', async () => {
  if (!activeUser || !remoteDocument) return;
  if (!window.confirm('確定使用目前本機全部資料覆蓋此 Google 帳號的雲端紀錄嗎？建議先備份 JSON。')) return;
  syncReady = true;
  localStorage.setItem(SYNC_OWNER, activeUser.uid);
  localStorage.setItem(SYNC_PENDING, '1');
  await saveCloud();
  if (!unsubscribe) listenToChanges();
});
if (downloadButton) downloadButton.addEventListener('click', async () => {
  if (!activeUser || !remoteDocument) return;
  if (!window.confirm('確定從 Google 雲端下載並覆蓋本機全部資料嗎？建議先備份本機 JSON。')) return;
  try {
    const snapshot = await firestoreSdk.getDocFromServer(remoteDocument);
    if (!snapshot.exists() || !snapshot.data()?.payload) { status('雲端尚無交易紀錄。', 'warn'); return; }
    window.BankQuotaStore.replaceState(snapshot.data().payload, 'cloud');
    localStorage.setItem(SYNC_OWNER, activeUser.uid);
    syncReady = true;
    if (!unsubscribe) listenToChanges();
    status('雲端資料下載成功。', 'online');
  } catch (error) { status(`下載失敗：${friendlyError(error)}`, 'warn'); }
});

if (copyAuthDebug) copyAuthDebug.addEventListener('click', async () => {
  if (!authDebugReport) return;
  try {
    await navigator.clipboard.writeText(authDebugReport.textContent);
    copyAuthDebug.textContent = '診斷資訊已複製';
  } catch {
    copyAuthDebug.textContent = '複製失敗，請手動選取上方文字';
  }
});

window.addEventListener('online', () => {
  if (syncReady && localStorage.getItem(SYNC_PENDING) === '1') void saveCloud();
});

// PWA 安裝（Chrome/Edge）；iOS Safari 手動使用「分享 → 加入主畫面」。
const installButton = document.getElementById('installPwa');
let pendingInstall = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  pendingInstall = event;
  if (installButton) installButton.hidden = false;
});
if (installButton) installButton.addEventListener('click', async () => {
  if (!pendingInstall) return;
  pendingInstall.prompt();
  await pendingInstall.userChoice;
  pendingInstall = null;
  installButton.hidden = true;
});

void setup();
