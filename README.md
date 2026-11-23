# 三銀行額度管理 PWA

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
