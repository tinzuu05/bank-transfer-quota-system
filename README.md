# 三銀行額度管理系統· 

## 專案結構

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
