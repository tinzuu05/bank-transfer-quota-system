# 三銀行額度管理 PWA

**Version 6.0.0** · Progressive Web App · HTML / CSS / JavaScript

個人銀行提款與轉帳額度管理工具，支援合作金庫第三類數位帳戶、中國信託一般帳戶及台新 Richart 第三類數位帳戶。交易資料由使用者手動登錄；不連接銀行系統，也不要求銀行登入憑證。

## 功能

- 三銀行獨立分頁、交易紀錄與額度設定
- 依交易類型計算單筆、當日及當月剩餘額度
- 國內／國外 ATM 提款分別統計，依設定檢查共用額度
- 免費跨行轉帳及提款次數統計
- 交易紀錄新增、編輯、刪除，以及 CSV / JSON 匯出與備份
- Firebase Google 登入、登出及 Firestore 雲端同步
- PWA 安裝、響應式版面與已快取頁面的離線使用

> 額度及優惠次數為可調整的參考設定，並非銀行即時資料。實際限制以各銀行公告及帳戶核准條件為準。

## 技術架構

| 類別 | 技術 |
| --- | --- |
| 前端 | HTML、CSS、JavaScript |
| 身分驗證 | Firebase Authentication（Google） |
| 資料同步 | Cloud Firestore |
| 應用程式驗證 | Firebase App Check（reCAPTCHA Enterprise） |
| 部署 | GitHub Actions、GitHub Pages |
| 離線支援 | Service Worker、Web App Manifest、Local Storage |

## 部署

### 1. Firebase

1. 在 [Firebase Console](https://console.firebase.google.com/) 建立或選擇專案，註冊 Web App。
2. 在 **Authentication → Sign-in method** 啟用 Google，並於 **Authorized domains** 加入 GitHub Pages 主機名稱，例如 `example.github.io`。
3. 建立 Cloud Firestore 資料庫。正式存取規則於下方「存取控制」設定。
4. 在同一 Google Cloud 專案建立 [reCAPTCHA Enterprise](https://console.cloud.google.com/security/recaptcha) 的 **Web / Score-based** Site Key；允許 GitHub Pages 主機名稱，並在 **Firebase → App Check** 註冊相同金鑰。
5. 確認登入、App Check Token 與 Firestore 同步正常後，再評估啟用 **App Check Enforcement**。

### 2. GitHub Secrets

於 **Repository → Settings → Secrets and variables → Actions** 建立：

| Secret | 內容 |
| --- | --- |
| `FIREBASE_WEB_CONFIG_JSON` | Firebase Web App 的完整設定物件（純 JSON） |
| `FIREBASE_APPCHECK_SITE_KEY` | reCAPTCHA Enterprise Web Site Key |

`FIREBASE_WEB_CONFIG_JSON` 格式：

```json
{
  "apiKey": "FIREBASE_WEB_API_KEY",
  "authDomain": "PROJECT_ID.firebaseapp.com",
  "projectId": "PROJECT_ID",
  "appId": "1:PROJECT_NUMBER:web:APP_ID",
  "messagingSenderId": "PROJECT_NUMBER"
}
```

所有值應取自同一 Firebase Web App。範例值不得直接用於正式部署。

### 3. GitHub Pages

1. 提交專案至 Repository，確認包含 `.github/workflows/deploy-pages.yml`、`scripts/build-site.mjs` 與根目錄的 `.nojekyll`。
2. 於 **Settings → Pages → Build and deployment**，將 Source 設為 **GitHub Actions**。
3. 於 **Actions → Build and deploy bank quota PWA** 執行工作流程，或推送至 `main` 觸發部署。
4. 確認 `build`、`deploy` 均成功後，開啟 `https://ACCOUNT.github.io/REPOSITORY/`。

部署期間由 GitHub Actions 產生 `dist/firebase-config.js`；實際設定不需提交至原始碼 Repository。

### 4. Firestore 存取控制

正式 Firestore 規則採單一 Firebase Authentication UID 白名單：

1. 完成 Google 登入後，於 **Firebase → Authentication → Users** 取得 UID。
2. 以 `firestore.rules` 為範本，在 **Firestore Database → Rules** 將 `REPLACE_WITH_YOUR_FIREBASE_AUTH_UID` 替換為正式 UID，並發布規則。
3. 確認指定 UID 可操作 `users/{uid}/appData/calculator`，其他 UID 無法存取。

UID 不需提交至 GitHub；GitHub Pages 工作流程也不會自動發布 Firestore 規則。未替換 UID 的範例規則預設拒絕存取。

## PWA 安裝

- **iOS / iPadOS：** Safari 開啟部署網址 → 分享 → 加入主畫面。
- **Android：** Chrome 開啟部署網址 → 選單 → 安裝應用程式／加到主畫面。

離線功能依已快取內容運作；Google 登入、App Check 驗證與雲端同步需網路連線。行動裝置的 Google 彈出式登入可能受到瀏覽器或獨立 PWA 視窗限制。

## 專案結構

```text
.github/workflows/deploy-pages.yml  # GitHub Pages 部署流程
scripts/build-site.mjs             # 建置與設定驗證
index.html                         # 銀行額度管理主畫面
login.html                         # Google 登入
logout.html                        # 登出
app.js                             # 額度與交易計算
styles.css                         # 介面樣式
firebase-sync.js                   # Firebase Auth / Firestore / App Check
firebase-config.example.js         # 前端設定範例（不含實際值）
firestore.rules                    # Firestore UID 白名單規則範本
manifest.webmanifest               # PWA 設定
service-worker.js                  # 離線快取
.nojekyll                          # 略過 GitHub Pages Jekyll 處理
```

## 安全與資料限制

- GitHub Secrets 避免 Firebase Web Config 出現在原始碼提交紀錄，但**部署後的前端設定與 reCAPTCHA Site Key 仍可由瀏覽器取得**；這些值不是伺服器私密憑證。
- Firestore 資料權限由 Authentication、Security Rules 及 App Check 共同管理；App Check 不能取代存取規則。
- 不應將銀行密碼、完整帳號、卡號、服務帳戶私鑰或交易備份提交至公開 Repository。
- 交易資料以單一 Firestore 文件同步，多裝置同時離線編輯可能產生覆蓋；建議定期匯出 JSON 備份。
- 此工具不是金融機構正式服務，不保證額度資訊即時或適用於所有帳戶。

## 版本紀錄

| 版本 | 變更 |
| --- | --- |
| **6.0.0** | GitHub Actions + Secrets 部署、Google 登入診斷、UID 白名單及 App Check 整合 |
| 5.1 | 改善 Firebase 設定檢查與登入錯誤提示 |
| 5.0 | 修正國內／國外提款統計與共用額度呈現 |
| 4.0 | 加入 Firebase 同步、Google 登入與 PWA 支援 |
| 3.0 | 整合合庫、中信及台新三銀行分頁 |

## 參考文件

- [Firebase Authentication — Google Sign-In](https://firebase.google.com/docs/auth/web/google-signin)
- [Firebase App Check — reCAPTCHA Enterprise](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider)
- [Cloud Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [GitHub Pages — Custom Workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
