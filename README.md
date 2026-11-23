# 三銀行額度管理 PWA · v5.1

對應你的三個帳戶：**合庫第三類數位帳戶**、**中國信託臨櫃一般帳戶**、**台新 Richart 第三類數位帳戶**。

- 交易單筆、每日／每月限額獨立設定與檢查；每月跨轉／跨提優惠次數獨立計算。
- 國內與國外 ATM 提款在畫面分為兩個區塊，各自顯示當日與當月累計，但共用銀行每日提款額度；沒有額外創造海外提款上限。提醒合庫的海外提款每日次數控管。
- 備份／還原 JSON、CSV、離線 localStorage；可選用 Google 登入 + Firestore 跨裝置同步。
- 安裝為手機 PWA；響應式版面，無前端框架、無建置步驟。

## 一、先在本機使用

1. 解壓縮 ZIP，直接打開 `index.html`，就能**離線使用計算器**（不需要 Firebase）。
2. 資料存在這個瀏覽器的 `localStorage`。如果要保留先前 v3 的資料，建議先在 v3 匯出 JSON，使用新版「還原 JSON」匯入（即使換網址、資料夾，也不會遺失）。新版沿用 v3 同一儲存 key，但 `file://` 路徑或瀏覽器不同仍可能造成無法直接讀取。
3. **直接打開 file:// 不能啟用 Google OAuth／Service Worker／PWA 安裝**，必須先使用 HTTPS（如 GitHub Pages）或 localhost。

## 二、建立 Firebase 專案（需你自己的 Google 帳號）

登入 https://console.firebase.google.com/ ：

1. 選 **新增專案**，自訂專案名稱；這是你自己的雲端專案，程式碼無法代替你同意 Google 服務條款。
2. 點 **新增應用程式 → 網頁**，註冊 `three-bank-quota`，複製網頁應用程式設定（`firebaseConfig`）。
3. 編輯 `firebase-config.js`，貼入對應 `apiKey`、`authDomain`、`projectId`、`appId`、`messagingSenderId` 的值。這些是 Firebase Web app 的公開組態，不是密碼。**不要放服務帳號的私人金鑰、銀行密碼、Google 登入密碼或任何私密憑證。**
4. 左欄 **Authentication → Sign-in method → Google → 啟用**，設定必要的支援信箱並儲存。
5. **Authentication → Settings → Authorized domains** 加入 `你的GitHub帳號.github.io`（不包含 `https://` 或 `/repo`），若使用自訂網域也加入該網域。`localhost` 需要自行新增，部分新專案不預設包含它。
6. 左欄 **Firestore Database → 建立資料庫**，選 Standard edition；選擇適當的資料庫區域，並在 **Rules** 貼入 `firestore.rules` 全部內容，按發布。**不要用 `allow read, write: if true`。**
7. Firebase Console 可於 Authentication 的 Users 頁確認 Google 登入是否成功；Firestore 路徑為 `users/{uid}/appData/calculator`。使用者只能存取自己的資料。

如果額度不大，通常可以先使用 Firebase 免費額度，但依實際用量／服務版本為準；有可能需要同意相應計費服務。Google 登入與 Firestore 需要網路。

## 三、部署到 GitHub Pages（無建置步驟）

1. 在你的 GitHub 帳戶新增一個 repo，例：`three-bank-quota`。**建議使用 private repo** 儲存原始碼；若透過 GitHub Pages 對外發布，網站本身仍可能是公開可訪問的。請勿把銀行帳號、交易備份檔或任何秘密放入 repo。
2. 將此資料夾的所有檔案（包含 `index.html`、`app.js`、`styles.css`、`firebase-config.js`、`firebase-sync.js`、`service-worker.js`、`manifest.webmanifest`、`assets/`、`.nojekyll` 等）放到 repo **根目錄**。
3. GitHub → Repository **Settings → Pages → Build and deployment → Deploy from a branch** → Branch `main` / `/(root)` → Save。
4. 等 GitHub Pages 顯示網站 URL（約為 `https://你的帳號.github.io/three-bank-quota/`），用這個網址開啟網站。
5. 回 Firebase Authentication 確認 **Authorized domains** 已新增 `你的帳號.github.io`。網站右上點「Google 登入」→ 繼續登入。

### 不使用 Git 指令：透過 GitHub 網頁上傳

新增 repo 後選 **Add file → Upload files**，上傳解壓後的根目錄檔案並 Commit；建議確認 `assets` 子目錄與點檔 `.nojekyll` 均存在。

### 本機在 localhost 測試

在專案資料夾執行：

```bash
python3 -m http.server 8080
```

瀏覽 `http://localhost:8080/`。使用 Google 登入前須在 Firebase 授權網域新增 `localhost`。

## 四、安裝到手機

**iPhone / Safari**：使用 Safari 開啟 GitHub Pages 網站 → 分享 → **加入主畫面**。

**Android / Chrome**：開啟 GitHub Pages 網站 → 選單 → **安裝應用程式** 或 **加到主畫面**；若瀏覽器支援，也可以使用網頁內的「安裝到手機／桌面」。

> 正確名稱是 **PWA**（Progressive Web App），不是 `pwd`，也不是 `.apk` 或 `.ipa` 安裝檔。PWA 必須先部署到可使用的 HTTPS 網址。安裝後離線仍可記錄本機資料；登入與雲端同步需要連網。

## 五、同步模式與資料安全

- 首次登入如果雲端沒有資料，會將目前本機紀錄傳上 Firestore。
- 雲端和本機**都已有不同資料**時，會詢問是否下載雲端資料；如果選擇保留本機，會暫停自動同步，讓你先備份後再按「上傳本機資料」。
- 登入後新增／編輯／刪除交易會自動嘗試同步；跨裝置雲端更新可同步到當前已開啟裝置。
- 離線可以繼續記錄在本機；恢復連線後嘗試上傳。如兩台裝置同時離線編輯，單文件的最後寫入可能發生衝突，**請不要把它當成銀行正式帳務系統**，並定期匯出 JSON。
- 登出頁面會清除目前裝置上的本機交易資料，避免共享設備洩漏隱私。登出前應先確認雲端同步成功或匯出備份。
- **FireStore 單文件上限**可能限制累積資料容量。當交易紀錄很大時請使用 JSON 備份、避免同時在多台裝置持續離線編輯。本工具不收集銀行密碼／卡號，建議備註欄不要輸入銀行帳號或敏感資料。
- Firebase Web Config 可公開，但 **Firestore Rules 一定要正式部署**，否則可能無法同步或暴露資料。

## 六、三家銀行國外提款規則與假設（截至 2026-11-23）

| 帳戶 | 國外提款單筆 | 國外提款每日 | 每月 |
|---|---|---|---|
| 合庫第三類 | 20,000 元（一般國際提款） | 與國內提款、一般轉帳共用每日 100,000 元 | 與一般提款、轉帳共用 200,000 元 |
| 中信一般戶 | 國外 ATM 機台為準；暫以 120,000 元作試算上限 | 與國內 ATM 共用預設 120,000 元 | 一般戶無提款月上限；工具可自設每月預算 |
| 台新 Richart 第三類 | 20,000 元（跨國提款）；還要符合當地 ATM 單筆限制 | 與國內 ATM 共用每日 100,000 元 | 未查到額外固定的提款月上限；工具可自設每月預算 |

**重要：** 國內與國外 ATM 的每日提款額度共用，不是分開各一份。畫面分別列出國內／國外「當日已用／當月已用」，在兩個區塊下方統一顯示當日提款共用上限與剩餘額度。合庫第三類還須計入同日一般轉帳占用的共用額度；對中信與台新，海外個人月預算（如設定）不是官方提款限額。

- 合庫官方國外提款頁明確說明：國內外合計每天 10 萬，當天國外提款第 3 次會停止國外提款服務，須解鎖。國外交易請先申請啟用。
- 中信官方說明：一般金融卡國內外 ATM 每日預設共用 12 萬，一般帳戶提款無固定月限額；境外 ATM 單筆依當地機台。
- 台新於 2025-09-23 生效的公告：第三類數位帳戶金融卡每筆 5 萬，每日 10 萬，自行 ATM 與他行合併計算。
- 免費跨行轉帳次數是使用者的個人設定，不保證所有同類銀行帳戶都有相同資格；海外提款不扣除「國內免費跨提次數」，海外 ATM 另外收取費用。

銀行官方來源：
- 合庫國外提款：https://www.tcb-bank.com.tw/personal-banking/digital-finance/services/card/withdraw-overseas
- 中信提款限額：https://service.ctbcbank.com/FAQ/Page01?kmid=10226
- 中信金融卡額度：https://service.ctbcbank.com/FAQ/Page01?kmid=22820
- 台新第三類提款公告：https://www.taishinbank.com.tw/TSB/personal/common/important-notice/TSBankImportantNotice-001359/
- Firebase 登入：https://firebase.google.com/docs/auth/web/google-signin
- Firebase Firestore Rules：https://firebase.google.com/docs/firestore/security/get-started

## 七、專案結構

```
index.html              主要計算器與三銀行分頁
login.html              Google 登入頁
logout.html             Google 登出確認頁
styles.css              RWD 樣式
app.js                  交易、額度池、優惠、匯入匯出及離線邏輯
firebase-sync.js        Firebase Authentication + Firestore 同步邏輯
firebase-config.js      由使用者填入 Firebase 網頁應用程式公開設定
firestore.rules         使用者 UID 隔離的 Firestore 安全規則
manifest.webmanifest    PWA 安裝設定
service-worker.js       本機資源離線快取
assets/                 PWA app icon (SVG/PNG)
.nojekyll               GitHub Pages 專案設定
.gitignore              Git 排除規則
README.md               安裝部署與額度規則
```

## v5.0 修正摘要（2026-11-23）

- 原 v4 海外卡片容易令人以為有一份獨立的每日／每月提款上限；v5 改為國內／國外分項統計 + 每日共用上限，合庫跨提款與轉帳也反映在剩餘額度。
- 合庫一般國際提款單筆由 30,000 修正為 20,000 元；台新第三類海外單筆由 50,000 修正為 20,000 元。
- 保留現有 localStorage 儲存鍵、v3／v4 的 JSON 備份相容性，原有 Firebase/PWA 結構不變。
- 說明來源：合庫 https://www.tcb-bank.com.tw/personal-banking/digital-finance/services/card/atm-card 及 https://www.tcb-bank.com.tw/personal-banking/digital-finance/services/card/withdraw-overseas；台新 https://www.taishinbank.com.tw/TSB/personal/deposit/debit-card/overseas-withdraw-cash-and-payment/TSBankGridPage-000054/；中信 https://service.ctbcbank.com/FAQ/Page01?kmid=10226。

## v5.1 Google 登入疑難排解（2026-11-23）

1. 網址必須是 `https://<github-username>.github.io/<repo>/login.html`；不要使用 `file://` 開啟。
2. Firebase → Authentication → Sign-in method，確認 Google 已啟用，且選好支援電子郵件。
3. Firebase → Authentication → Settings → Authorized domains，輸入 `<github-username>.github.io`；**不要**包含 `https://` 或儲存庫路徑。
4. Firebase → Project settings → Your apps → Web App，重新複製 **該 Web App** 的設定值。`firebase-config.js` 必須是 `window.BANK_FIREBASE_CONFIG = {...};`。v5.1 會擋下例如「你的Firebase_apiKey」之類尚未替換的教學占位字。
5. 到 GitHub 的 `firebase-config.js` 直接檢查是否更新成功；GitHub Pages 網址 `/firebase-config.js` 不應是空設定。**請勿將 API key、登入 Token、銀行帳號貼到公開 issue 或聊天。**
6. Google 登入頁展開「無法登入？」可檢視站台、SDK 狀態和錯誤代碼，並複製**不含金鑰**的診斷資訊。
7. 若 Google 登入成功，Firestore 卻提示 `permission-denied`，檢查是否已在 Firebase Console 的 Firestore → Rules 實際發布 `firestore.rules`；**不等於把檔案上傳到 GitHub**。
8. GitHub Pages 更新後若仍是舊畫面，重新整理兩次、清除該網站的快取或 Service Worker；v5.1 已變更快取名稱。

### 公開 Firebase 設定安全注意

Firebase 官方把 Web App `apiKey`、`authDomain`、`projectId`、`appId` 設計為可公開的用戶端識別資訊，不是用來授權讀寫 Firestore 的秘密。保護資料必須靠 Firestore Security Rules；在 Google Cloud Credentials 也要確認該 API key 僅允許 Firebase 相關 API，避免被拿去呼叫不相干的計費 API。別把 Firebase Admin service account 私鑰、Google OAuth Client Secret、銀行密碼、交易 JSON 備份放在 GitHub。

**僅限個人使用（進階，可選）**：登入成功後，在 Firebase Authentication → Users 複製自己的 UID，參考附檔 `firestore.owner-only.rules.example` 將 `PASTE_YOUR_UID` 替換成 UID，然後到 Firestore → Rules 發布。不要把 UID 寫成電子郵件，也不要把未替換的範例規則直接發布。Firebase 的 Authorized domains 只限制網站來源，**不限制哪些 Google 帳號可以登入**；限制使用者必須由規則負責。

**注意：** v5.1 改進設定檢查與診斷，無法代替你在 Firebase Console 啟用 Google 登入、正確設定 Authorized domains 或部署 Firestore Rules。GitHub Pages 的 Google Popup 登入在手機 PWA 上仍可能受瀏覽器限制，先在桌面 Chrome 透過 HTTPS 測試。
