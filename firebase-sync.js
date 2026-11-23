/**
 * Firebase Authentication / Firestore 同步（可選）。
 * 設計：未設定 Firebase 時，主計算器保持完全可用；登入後資料依 UID 隔離。
 * 同步採單一文件（users/{uid}/appData/calculator），以最後一筆成功提交為準。
 * 限制：同時在兩個裝置離線修改可能需要手動解決衝突；請定期備份 JSON。
 * 修改者：OpenAI｜日期：2026-11-23｜頁面：index/login/logout
 */

const CONFIG = window.BANK_FIREBASE_CONFIG || {};
const view = document.body.dataset.view || 'app';
const appStatus = document.getElementById('cloudStatus');
const indicator = document.getElementById('cloudIndicator');
const accountLink = document.getElementById('accountLink');
const signInButton = document.getElementById('googleSignIn');
const signOutButton = document.getElementById('googleSignOut');
const authMessage = document.getElementById('authMessage');
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

function status(message, cls = '') {
  if (appStatus) appStatus.textContent = message;
  if (authMessage) authMessage.textContent = message;
  if (indicator) indicator.className = `status-dot ${cls}`;
}

function configured() {
  return ['apiKey', 'authDomain', 'projectId', 'appId'].every((key) => {
    const value = CONFIG[key];
    return typeof value === 'string' && value.trim() && !value.includes('請填') && !value.includes('YOUR_');
  });
}

function waitForQuotaApp() {
  if (window.BankQuotaStore) return Promise.resolve();
  return new Promise((resolve) => window.addEventListener('bank-quota-app-ready', resolve, { once: true }));
}

/** 初始化 Google 登入，絕不在設定缺失時嘗試網路連線。 */
async function setup() {
  if (!configured()) {
    status('尚未設定 Firebase；交易紀錄儲存在本機。', 'warn');
    if (signInButton) signInButton.disabled = true;
    if (signOutButton) signOutButton.disabled = true;
    return;
  }
  if (location.protocol === 'file:') {
    status('Google 登入需要 HTTPS 或 localhost。請部署至 GitHub Pages；本機 HTML 仍可離線試算。', 'warn');
    if (signInButton) signInButton.disabled = true;
    if (signOutButton) signOutButton.disabled = true;
    return;
  }
  status('正在連線 Google 登入服務…');
  try {
    const version = '11.10.0';
    [appSdk, authSdk, firestoreSdk] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-firestore.js`)
    ]);
    const firebaseApp = appSdk.initializeApp(CONFIG);
    firebaseAuth = authSdk.getAuth(firebaseApp);
    firebaseDb = firestoreSdk.getFirestore(firebaseApp);
    authSdk.onAuthStateChanged(firebaseAuth, async (user) => {
      try { await handleUserChange(user); } catch (error) { status(`連線異常：${friendlyError(error)}`, 'warn'); }
    });
  } catch (error) {
    status(`Firebase 尚未連線：${friendlyError(error)}。可先使用離線模式。`, 'warn');
  }
}

function friendlyError(error) {
  if (error?.code === 'auth/unauthorized-domain') return '請將 GitHub Pages 的網域加入 Firebase 授權網域';
  if (error?.code === 'auth/popup-blocked') return '瀏覽器封鎖 Google 登入視窗，請允許彈出視窗';
  if (error?.code === 'auth/popup-closed-by-user') return '你已關閉登入視窗';
  if (error?.code === 'permission-denied') return 'Firestore 安全規則拒絕存取，請部署 firestore.rules';
  return error?.message || '未知錯誤';
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
    await authSdk.signInWithPopup(firebaseAuth, new authSdk.GoogleAuthProvider());
  } catch (error) {
    status(`登入失敗：${friendlyError(error)}`, 'warn');
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
