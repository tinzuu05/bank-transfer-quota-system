# 三銀行額度管理 PWA v6.0 — GitHub Secrets / Google 登入 / App Check 安全部署

> 此專案由 v5.1 更新。**不連銀行、不需銀行密碼**，只儲存你手動輸入的額度與交易紀錄。合庫第三類、中信一般戶、台新 Richart 第三類三個 Tab、提款與轉帳限額、國內／國外 ATM 使用額度、免費跨轉／跨提、JSON/CSV 與離線功能均保留。

## 先理解：這是「不提交至 Git」而非「瀏覽器完全看不見」

- `FIREBASE_WEB_CONFIG_JSON` 和 `FIREBASE_APPCHECK_SITE_KEY` 儲存在 **GitHub Repository Secrets**，**不會提交到 GitHub 原始碼或 Commit**。
- GitHub Actions 在執行時產生 `dist/firebase-config.js` 並把它部署到 GitHub Pages。**網站使用者仍可取得這個前端 Firebase Web Config 和 reCAPTCHA Enterprise *site key***，因為瀏覽器必須使用它們。這兩項不是後端私人金鑰。
- 需要真正保密的東西（Google 密碼、Firebase Admin SDK service account JSON、Private key、銀行資料備份）**絕不應上傳此 Repository 或 Secrets 以供前端產出**。
- 真正保護雲端交易資料的是 **Firestore UID 白名單規則**、Firebase Authentication 與 **App Check**。App Check 也不是取代 Rules 的權限系統。
- **GitHub Pages 的網站本身可以公開訪問**，即使只有你能存取 Firestore。未登入者仍可使用本機模式，不代表能讀你的雲端資料。

## 一、部署前備份與清理舊 GitHub 檔案

1. 在目前 v5.1 網頁按「備份全部 JSON」，把備份檔保存在你的私人裝置，**不要上傳到 GitHub**。
2. 在原 GitHub Repo 刪除原本有實際設定的 `firebase-config.js`，因為新版檔案是 **Actions 部署時才會產生**。刪除當前檔案 **不等於刪除 Git 歷史紀錄**；舊設定若已提交，仍可能在歷史中看見。Firebase Web API key 不是授權密鑰，若擔心濫用，先查 API 限制及用量、必要時依 Google Cloud 指引輪替（輪替之前確認不會使現有網站中斷）。
3. 用本 ZIP **資料夾內的所有檔案**取代 v5.1 的原始碼（不要把外層資料夾再包進 GitHub Repository）。上傳時請確認隱藏路徑 `.github/workflows/deploy-pages.yml` 也有提交。
4. 專案根目錄不應再有含真實值的 `firebase-config.js`。ZIP 裡只附 `firebase-config.example.js`（空白範例），`.gitignore` 會阻止日後誤提交真實設定。但 **`.gitignore` 不會自動解除已追蹤的舊檔案**，一定要手動從 Git 移除。
5. 不要上傳 `dist/`、`*.json` 個人備份、`.env`、任何服務帳戶私鑰。GitHub **Commit** 前檢查檔案清單。

## 二、準備 Firebase Google Authentication

1. 開啟 https://console.firebase.google.com/ ，選擇你已經建立的 Firebase 專案。Firebase **Project settings → General → Your apps → Web app → Config** 取得 **同一個 Web App** 的設定物件（不是 Admin service account）。
2. 到 **Build → Authentication → Sign-in method → Google**，確認 `Enabled` 且有支援電子郵件，儲存。
3. 到 **Authentication → Settings → Authorized domains**，新增 `你的Github帳號.github.io`；**不要加 `https://` 或 Repo 路徑**。例如網站 `https://zoe.github.io/three-bank-quota/`，只填 `zoe.github.io`。
4. 不要把 `authDomain` 改成 GitHub Pages 網域。對此 GitHub Pages 靜態網站，本專案優先用 `signInWithPopup()`，避免 Firebase `signInWithRedirect()` 在 Safari / Chrome 的第三方儲存空間相容性問題。瀏覽器若禁用彈出視窗，需要允許彈出；iPhone PWA 若遇到登入問題，請先在 Safari 的一般分頁登入，再回到 PWA（不同瀏覽器容器的登入狀態**不保證**自動共用）。
5. 你先前提供的設定中，`appId` 中的數字與 `messagingSenderId` 不相同。**不要根據其中一個手工改另一個**，應從**同一個** Firebase Web App 複製整組設定；新版部署腳本發現不一致會停止部署。

## 三、建立 reCAPTCHA Enterprise Web Site Key / Firebase App Check

1. 選對同一 Google Cloud Project，打開 https://console.cloud.google.com/security/recaptcha ，或在 Google Cloud 的 **Google Cloud Fraud Defense → reCAPTCHA** 進入管理頁面。
2. 如果提示，啟用 reCAPTCHA Enterprise API。建立 Web 網站金鑰，選用**評分型（Score-based）**，不要勾選 `Use checkbox challenge`。
3. 允許網域填 `你的GitHub帳號.github.io`，若也有正式自訂網域再加入。**不要停用網域驗證、不要將 localhost 加入正式金鑰**。將產生的 **Site Key** 留作下一步 Secret（這個 Site Key 本質上也是公開識別值，不是 API Secret）。
4. 回到 Firebase Console → **Security → App Check → Apps** → 找到你的 Web App → Register → **reCAPTCHA Enterprise**，貼上相同的 Site Key，完成註冊。預設 TTL 一小時可先維持。
5. **先不要按 Enforce（強制驗證）**。等網站上線、登入與 Firestore 同步測試成功、App Check Metrics 顯示正常（Verified）後，再到 **App Check → APIs → Cloud Firestore → Enforce**；先只對 Firestore 開啟，確認可用後再考慮 Auth。若過早 Enforce，舊網站／手機快取或設定錯誤可能全面無法同步。啟用後可能需約 15 分鐘才完全生效。
6. App Check 會產生 reCAPTCHA 評估用量；官方目前有免費額度，超出或啟用較高級服務可能涉及費用。維持免費方案前，先確認 Firebase/Google Cloud 的計費畫面和配額。不要因畫面提示而不經確認就升級 Blaze。

官方：
- https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
- https://firebase.google.com/docs/app-check/enable-enforcement
- https://firebase.google.com/docs/app-check/recaptcha-keys

## 四、設定 GitHub Repository Secrets（不用再貼 Firebase 值到原始碼）

1. 進入原本的 GitHub Repository → **Settings → Secrets and variables → Actions**。
2. 點 **New repository secret**，Name: `FIREBASE_WEB_CONFIG_JSON`。Secret 貼上**你自己的 Firebase Web App config JSON 物件**；格式如下，注意每個值均為**同一個 Web App** 的真實值：

```json
{
  "apiKey": "YOUR_WEB_API_KEY",
  "authDomain": "YOUR_PROJECT_ID.firebaseapp.com",
  "projectId": "YOUR_PROJECT_ID",
  "appId": "1:YOUR_PROJECT_NUMBER:web:YOUR_APP_ID_SUFFIX",
  "messagingSenderId": "YOUR_PROJECT_NUMBER"
}
```

> 切勿連同 `const firebaseConfig =`、```javascript 區塊標記或尾端分號一起貼入 Secret；Secret 必須是 **純 JSON**，不是 JavaScript 語法。以 Firebase Console 真實值代入，不要自行猜測。

3. 再點 **New repository secret**，Name: `FIREBASE_APPCHECK_SITE_KEY`，Value 貼入第三階段建立的 reCAPTCHA Enterprise **Web Site Key**。
4. GitHub 只應顯示這**兩個 Secret 名稱**，不會回顯已保存的內容。**不要在 Issues、Commit message、PR 或 README 貼入真實值。**
5. `OWNER_UID` **不需要**放到前端設定。你的 UID 會放在 Firestore 規則（見下節）而非 JavaScript；UID 本身不是登入密碼。

## 五、改用 GitHub Actions 部署 GitHub Pages

1. 確認根目錄有 `.github/workflows/deploy-pages.yml` 和 `scripts/build-site.mjs`，**不要**在根目錄提交真實 `firebase-config.js`。
2. Repository → **Settings → Pages → Build and deployment → Source** 改選 **GitHub Actions**（不再選 `Deploy from a branch`）。
3. 回 Repository → **Actions** → 選 **Build and deploy bank quota PWA** → **Run workflow** → `main` → **Run workflow**。若剛才推送到 `main`，也會自動觸發部署。
4. 兩個 Job 應依序通過：`build` 及 `deploy`，GitHub Pages 網址格式 `https://你的帳號.github.io/你的Repo名稱/`。查看 `Actions` 的結果即可；**不要在 Actions Logs 印出 Secret**。
5. 新版 build 腳本會在部署時檢查：缺少兩個 Secrets、Config JSON 格式錯誤、App ID 與 Sender ID 不一致、不是同一個 Firebase Project 等情況。若錯誤，它會**停止**部署並顯示哪項設定需修正，不會印出 Key 原文。
6. 到 Repository 的 **Code** 分頁，應該看得到 `firebase-config.example.js`，**但看不到 `firebase-config.js`**；到 GitHub Pages 網頁，瀏覽器仍可載入 Actions 產出的 `firebase-config.js`，這是預期行為。

GitHub Actions 工作流程使用 `actions/configure-pages@v5`、`actions/upload-pages-artifact@v4`、`actions/deploy-pages@v4`。來源：https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

## 六、UID 白名單：只讓你的 Google 帳號操作 Firestore

1. 進 Firebase Console → **Firestore Database**，確認已建立 `(default)` 資料庫，並先不要用 `allow read, write: if true` 這種測試規則。
2. 第一次登入時**即使 Firestore 顯示 permission-denied 也正常**：你需要先成功 Google 登入，讓 Firebase Authentication 建立你的 User 紀錄。
3. 到 Firebase Console → **Authentication → Users**，找到你的 Google 帳號，複製最右側的 **User UID**（不是 Email、不是 App ID、不是 Project ID）。
4. 開啟 ZIP 內的 `firestore.rules`，將 `'REPLACE_WITH_YOUR_FIREBASE_AUTH_UID'` 替換成你自己的 UID（保留單引號）。
5. 到 Firebase Console → **Firestore Database → Rules**，貼上**已替換 UID** 的全部規則，按 **Publish**。這是雲端正式規則，**GitHub Actions 不會幫你發布 Firestore Rules**。
6. 切回網站重新登入並重新載入，從測試交易開始確認雲端同步。Firestore Data 應看到 `users / <你的 UID> / appData / calculator`，而不是所有人共用 `calculator`。
7. 使用另一個 Google 帳號測試，應該**不能讀／寫**你的 Firestore 資料（可能可以在 Firebase Authentication 登入，但必須看到 `permission-denied` 或無存取權限）。

**注意：** 本專案 `firestore.rules` 在替換前是 **fail-closed**：寫死不可能符合的佔位 UID，所有人均無權讀寫。如果需要回復，請先確認自己登入的 UID，再修改同一個規則。這個規則只保護 Firestore，不會讓已在瀏覽器本機 `localStorage` 的資料自動消失。

## 七、登入診斷與 PWA 安裝

在 `https://你的帳號.github.io/你的Repo/login.html` 點 **使用 Google 帳號登入**：

- `auth/unauthorized-domain`：Authentication → Authorized domains 加上 `你的帳號.github.io`（不是完整 URL）。
- `auth/invalid-api-key` 或 `API_KEY_SERVICE_BLOCKED`：重複確認 `FIREBASE_WEB_CONFIG_JSON`，以及 Google Cloud Web API Key 的 Firebase API 限制，**不能限制掉 Authentication 必要 API**。
- Actions `appId project number and messagingSenderId disagree`：你的兩個欄位不是同一個 Firebase Web App 設定，重新複製完整 Config。
- `auth/operation-not-allowed`：Authentication → Google 啟用。
- `auth/popup-blocked`：允許彈出視窗；手機先以 Safari / Chrome 一般分頁測試，再安裝 PWA。
- App Check Token 失敗：檢查 reCAPTCHA Enterprise 的網域、Firebase App Check 註冊 Site Key、網路連線和瀏覽器防追蹤限制。
- `permission-denied`：UID 白名單尚未發布，或 Firestore App Check 已 Enforce 但裝置沒有有效 Token。

PWA 安裝：
- **iPhone**：Safari 開啟你的 Pages 網址 → 分享 → **加入主畫面**（若有「開啟為網頁 App」請啟用）。
- **Android**：Chrome 開啟網址 → 選單 → **安裝應用程式**／**加到主畫面**。
- 安裝後應能離線操作已快取的計算器；**Google 登入、App Check 及雲端同步需要網路**。iPhone PWA 的登入容器不一定與 Safari 分享登入狀態；若 PWA 無法彈出 Google 登入，需重新在支援的瀏覽器環境測試，這不是僅改 Secrets 可以解決的問題。
- 部署更新後可能先看到舊版 Service Worker 快取畫面，重新關閉／開啟 PWA 並重新載入；**清除網站儲存資料前先備份 JSON**，否則本機交易紀錄可能被刪除。

## 八、最後驗收清單

- [ ] GitHub Code 分頁**沒有**含實際值的 `firebase-config.js`，也沒有銀行備份。
- [ ] GitHub Actions 的 `build` 和 `deploy` 都成功，網站為 HTTPS。
- [ ] Firebase Auth 已啟用 Google；GitHub Pages 網域在 Authorized domains。
- [ ] reCAPTCHA Enterprise 網站金鑰網域正確、已在 Firebase App Check Web App 註冊。
- [ ] 首次登入後複製 Firebase Authentication UID，正式發布 owner-only Firestore Rules。
- [ ] App Check SDK 取得 Token，Firestore 可以讀／寫自己的文件，其他 UID 被拒絕。
- [ ] App Check Metrics 正常後才 Enforce Firestore，先不要 Enforce Auth。
- [ ] 手機安裝 PWA，測試離線交易與回線同步，再匯出 JSON 備份。

## 九、主要檔案與程式變更

| 檔案 | 功能 |
|---|---|
| `.github/workflows/deploy-pages.yml` | GitHub Actions：從 Secrets 建置，部署 Pages |
| `scripts/build-site.mjs` | 檢查 Firebase Web 設定一致性，只輸出公開靜態檔案到 `dist/` |
| `.gitignore` | 阻止 `firebase-config.js`、`dist/`、`.env`、私鑰誤提交 |
| `firebase-config.example.js` | 空白示例，不含真實 Firebase 值 |
| `firebase-sync.js` | Google Popup 登入、App Check 初始化、Firestore 雲端同步與診斷 |
| `firestore.rules` | UID 白名單，只允許特定 UID 的單一文件讀寫 |
| `login.html` / `styles.css` | Google 登入失敗訊息與 App Check 狀態 |
| `service-worker.js` | 新版離線快取；對 Firebase 設定使用網路優先策略 |
| `index.html` | v6 版本標記，原三銀行頁面保留 |
| `app.js` | 保留 v5.1 原本的三銀行額度計算，不更動交易規則 |

**資料安全提示：** 前端 GitHub Pages 的 JavaScript 是公開的。本工具適合個人銀行額度手動計算，但不是銀行正式帳務系統，不保證交易額度為即時官方值；不要把完整銀行帳號、卡號、登入密碼或身分證資料放進交易備註或雲端。同步模型仍是一份 Firestore 文件，同時在兩台裝置離線編輯可能發生覆蓋，請定期備份 JSON。

官方參考：
- https://firebase.google.com/docs/projects/api-keys
- https://firebase.google.com/docs/auth/web/google-signin
- https://firebase.google.com/docs/auth/web/redirect-best-practices
- https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
- https://firebase.google.com/docs/app-check/enable-enforcement
- https://firebase.google.com/docs/firestore/security/get-started
- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
