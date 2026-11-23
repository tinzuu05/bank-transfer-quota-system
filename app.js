(() => {
  'use strict';

  // ===== 初始化：帳戶與交易規則 =====
  const STORAGE_KEY = 'three-bank-quota-calculator-v3';
  const LEGACY_KEY = 'tcb-quota-calculator-v1';
  const BANKS = Object.freeze({
    tcb: {
      title: '合作金庫', subtitle: '第三類數位存款帳戶', tag: 'TAIWAN COOPERATIVE BANK', short: '合庫',
      description: '第三類數位帳戶：國內／國外提款共用每日限額，並受一般提款及轉帳的日／月共用上限約束。國外提款當日達第 3 次會停止服務，需解鎖；轉非本人另有子額度。免費跨轉次數請依實際優惠調整。',
      feeNote: '跨轉優惠只扣「合庫作為轉出銀行」的跨行轉帳。轉到中信／台新會扣合庫次數，但不會扣收款銀行次數。跨行 ATM 提款只扣跨提優惠。',
      mainPool: 'sharedMonth', dayPool: 'sharedDay',
      pools: {
        sharedDay: { label: '一般提款＋轉帳 · 當日共用', unit: 'day', defaultLimit: 100000 },
        sharedMonth: { label: '一般提款＋轉帳 · 本月共用', unit: 'month', defaultLimit: 200000 },
        nonDay: { label: '轉非本人 · 當日子額度', unit: 'day', defaultLimit: 30000 },
        nonMonth: { label: '轉非本人 · 本月子額度', unit: 'month', defaultLimit: 50000 },
        specialDay: { label: '核准特殊轉帳 · 當日額度', unit: 'day', defaultLimit: 0 }
      },
      types: {
        atmOwn: { label: '合庫 ATM 提款', fee: 'withdraw', crossDefault: false, pools: ['sharedDay', 'sharedMonth'], defaultSingle: 30000 },
        atmOther: { label: '他行 ATM 提款', fee: 'withdraw', crossDefault: true, pools: ['sharedDay', 'sharedMonth'], defaultSingle: 20000 },
        atmOverseas: { label: '國外 ATM 提款（折算新臺幣）', fee: 'overseas', crossDefault: false, pools: ['sharedDay', 'sharedMonth'], defaultSingle: 20000, overseas: true },
        toCtbc: { label: '轉本人中國信託（已約定）', fee: 'transfer', crossDefault: true, pools: ['sharedDay', 'sharedMonth'], defaultSingle: 50000 },
        toTaishin: { label: '轉本人台新（已約定）', fee: 'transfer', crossDefault: true, pools: ['sharedDay', 'sharedMonth'], defaultSingle: 50000 },
        ownOther: { label: '轉其他本人同 ID 帳戶', fee: 'transfer', crossDefault: true, pools: ['sharedDay', 'sharedMonth'], defaultSingle: 50000 },
        nonOwner: { label: '轉非本人帳戶（符合開通條件）', fee: 'transfer', crossDefault: true, pools: ['sharedDay', 'sharedMonth', 'nonDay', 'nonMonth'], defaultSingle: 10000 },
        specialCtbc: { label: '已核准特殊轉本人中信', fee: 'transfer', crossDefault: true, pools: ['specialDay'], defaultSingle: 0, requiresFlag: 'specialEnabled' },
        specialTaishin: { label: '已核准特殊轉本人台新', fee: 'transfer', crossDefault: true, pools: ['specialDay'], defaultSingle: 0, requiresFlag: 'specialEnabled' },
        legacyAtm: { label: '舊版 ATM（通路待確認）', fee: 'withdraw', crossDefault: false, pools: ['sharedDay', 'sharedMonth'], defaultSingle: 30000, legacy: true },
        legacyOther: { label: '舊版其他轉帳（收款人待確認）', fee: 'transfer', crossDefault: true, pools: ['sharedDay', 'sharedMonth'], defaultSingle: 50000, legacy: true }
      },
      defaults: { transfers: 16, withdrawals: 8, flags: { specialEnabled: false } }
    },
    ctbc: {
      title: '中國信託', subtitle: '臨櫃開立的一般存款帳戶', tag: 'CTBC BANK', short: '中信',
      description: '一般存款帳戶：非約定網銀轉帳預設 5／10／20 萬，可在中信 APP 符合條件後升級到 10／20／50 萬；臨櫃約定跨轉每日通常最高 200 萬，實際依帳戶核准。ATM 國內／國外每日共用預設 12 萬，一般帳戶未公告提款每月限額。',
      feeNote: '每月 1 次免費跨轉是你提供的個人優惠，非所有中信一般戶的通用承諾。請依中信 APP 所顯示的剩餘優惠次數調整。約定轉帳不等於免手續費。',
      mainPool: 'nonMonth', dayPool: 'nonDay',
      pools: {
        nonDay: { label: '網銀非約定轉帳 · 當日', unit: 'day', defaultLimit: 100000 },
        nonMonth: { label: '網銀非約定轉帳 · 本月', unit: 'month', defaultLimit: 200000 },
        agreedDay: { label: '網銀約定轉帳 · 當日', unit: 'day', defaultLimit: 2000000 },
        atmDay: { label: 'ATM 提款 · 當日', unit: 'day', defaultLimit: 120000 },
        overseasMonth: { label: '海外 ATM 提款個人月預算（0 表示不設定；非銀行限額）', unit: 'month', defaultLimit: 0, optional: true }
      },
      types: {
        atmBranch: { label: '中信分行／7-11 存提款機', fee: 'withdraw', crossDefault: false, pools: ['atmDay'], defaultSingle: 120000 },
        atmConvenience: { label: '中信 7-11 提款機', fee: 'withdraw', crossDefault: false, pools: ['atmDay'], defaultSingle: 30000 },
        atmOther: { label: '其他銀行 ATM 提款', fee: 'withdraw', crossDefault: true, pools: ['atmDay'], defaultSingle: 20000 },
        atmOverseas: { label: '國外 ATM 提款（折算新臺幣）', fee: 'overseas', crossDefault: false, pools: ['atmDay', 'overseasMonth'], defaultSingle: 120000, overseas: true },
        nonAgreed: { label: '網銀非約定轉帳', fee: 'transfer', crossDefault: true, pools: ['nonDay', 'nonMonth'], defaultSingle: 50000 },
        agreed: { label: '網銀約定帳戶轉帳', fee: 'transfer', crossDefault: true, pools: ['agreedDay'], defaultSingle: 2000000 }
      },
      defaults: { transfers: 1, withdrawals: 0, flags: { nonAgreedUpgraded: false } }
    },
    taishin: {
      title: '台新銀行', subtitle: 'Richart 第三類數位存款帳戶', tag: 'TAISHIN RICHART', short: '台新',
      description: 'Richart 第三類：國內 ATM 一般單筆 5 萬元、每日 10 萬元；國外 ATM 一般單筆等值 2 萬元、國內外共用每日 10 萬元。你已升級的轉帳給他人仍按每筆 5 萬、每日 10 萬、每月 20 萬元計算。',
      feeNote: 'Richart 主帳戶目前每月跨行轉帳免費 5 次、跨行提款免費 5 次，兩類分開計算。轉到他行本人帳戶也屬跨轉；台新帳戶內互轉不算。',
      mainPool: 'nonMonth', dayPool: 'nonDay',
      pools: {
        nonDay: { label: '一般／線上約定轉帳 · 當日', unit: 'day', defaultLimit: 100000 },
        nonMonth: { label: '一般／線上約定轉帳 · 本月', unit: 'month', defaultLimit: 200000 },
        atmDay: { label: 'ATM 提款 · 當日', unit: 'day', defaultLimit: 100000 },
        branchDay: { label: '已核准臨櫃約定轉帳 · 當日', unit: 'day', defaultLimit: 3000000 },
        overseasMonth: { label: '海外 ATM 提款個人月預算（0 表示不設定；非銀行限額）', unit: 'month', defaultLimit: 0, optional: true }
      },
      types: {
        atmOwn: { label: '台新 ATM 提款（第三類預設）', fee: 'withdraw', crossDefault: false, pools: ['atmDay'], defaultSingle: 50000 },
        atmOther: { label: '他行 ATM 提款', fee: 'withdraw', crossDefault: true, pools: ['atmDay'], defaultSingle: 20000 },
        atmOverseas: { label: '國外 ATM 提款（折算新臺幣）', fee: 'overseas', crossDefault: false, pools: ['atmDay', 'overseasMonth'], defaultSingle: 20000, overseas: true },
        transferOther: { label: '轉帳給他人（已升級）', fee: 'transfer', crossDefault: true, pools: ['nonDay', 'nonMonth'], defaultSingle: 50000 },
        transferOwn: { label: '轉本人其他銀行', fee: 'transfer', crossDefault: true, pools: ['nonDay', 'nonMonth'], defaultSingle: 50000 },
        onlineAgreed: { label: '線上設定約定帳戶轉帳', fee: 'transfer', crossDefault: true, pools: ['nonDay', 'nonMonth'], defaultSingle: 50000 },
        branchAgreed: { label: '已核准臨櫃約定大額轉帳', fee: 'transfer', crossDefault: true, pools: ['branchDay'], defaultSingle: 2000000, requiresFlag: 'branchEnabled' }
      },
      defaults: { transfers: 5, withdrawals: 5, flags: { branchEnabled: false } }
    }
  });
  const $ = (id) => document.getElementById(id);
  const BANK_IDS = Object.keys(BANKS);
  const now = new Date();
  const currentDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const currentMonth = currentDate.slice(0, 7);
  const numberText = (n) => Number(n || 0).toLocaleString('zh-TW');
  const money = (n) => `${numberText(Math.max(0, n))} 元`;
  const validInt = (n, zero = false) => Number.isSafeInteger(Number(n)) && Number(n) >= (zero ? 0 : 1) && n !== '' && n !== null && n !== undefined;
  const remaining = (limit, used) => Math.max(0, limit - used);
  const monthsMatch = (date, month) => date.slice(0, 7) === month;
  const newId = () => globalThis.crypto?.randomUUID?.() || `tx-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const safeText = (value) => String(value ?? '').slice(0, 120);
  const dateValid = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  const addText = (parent, tag, textValue, cls = '') => {
    const el = document.createElement(tag);
    el.textContent = String(textValue);
    if (cls) el.className = cls;
    parent.appendChild(el);
    return el;
  };

  /** 依每家銀行的規則產生獨立初始設定。 */
  function defaultsFor(bankId) {
    const config = BANKS[bankId];
    return {
      freeTransfers: config.defaults.transfers,
      freeWithdrawals: config.defaults.withdrawals,
      flags: { ...config.defaults.flags },
      singles: Object.fromEntries(Object.entries(config.types).map(([typeId, type]) => [typeId, type.defaultSingle])),
      pools: Object.fromEntries(Object.entries(config.pools).map(([poolId, pool]) => [poolId, pool.defaultLimit]))
    };
  }

  /** 僅接受本工具認識的交易，避免備份內容破壞統計結果。 */
  function cleanTransaction(tx) {
    if (!tx || !BANKS[tx.bank] || !BANKS[tx.bank].types[tx.type] || !dateValid(tx.date) || !validInt(tx.amount)) return null;
    return {
      id: typeof tx.id === 'string' && tx.id.length < 130 ? tx.id : newId(),
      bank: tx.bank, date: tx.date, type: tx.type, amount: Number(tx.amount),
      note: safeText(tx.note), crossBank: Boolean(tx.crossBank), exempt: Boolean(tx.exempt),
      createdAt: Number.isSafeInteger(tx.createdAt) && tx.createdAt > 0 ? tx.createdAt : Date.now()
    };
  }

  /**  合庫舊紀錄映射到合庫分頁；無法辨識的舊分類標示待確認。 */
  function migrateLegacy() {
    let old;
    try { old = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null'); } catch { return null; }
    if (!old || !Array.isArray(old.transactions)) return null;
    const next = { version: 3, settings: Object.fromEntries(BANK_IDS.map((id) => [id, defaultsFor(id)])), transactions: [], usedOffsets: {} };
    const typeMap = { atmTcb: 'atmOwn', atmOther: 'atmOther', ctbc: 'toCtbc', taishin: 'toTaishin', otherOwn: 'ownOther', otherNon: 'nonOwner', atm: 'legacyAtm', other: 'legacyOther' };
    next.transactions = old.transactions.map((tx) => {
      const type = tx.special && tx.type === 'ctbc' ? 'specialCtbc' : tx.special && tx.type === 'taishin' ? 'specialTaishin' : typeMap[tx.type];
      if (!type) return null;
      return cleanTransaction({ id: tx.id, bank: 'tcb', type, date: tx.date, amount: tx.amount, note: tx.note, crossBank: tx.type !== 'atmTcb' && tx.type !== 'atm', exempt: false });
    }).filter(Boolean);
    const previous = old.limits || {};
    if (validInt(previous.daily)) next.settings.tcb.pools.sharedDay = Math.min(100000, Number(previous.daily));
    if (validInt(previous.monthly)) next.settings.tcb.pools.sharedMonth = Math.min(200000, Number(previous.monthly));
    Object.keys(typeMap).forEach((oldType) => {
      const mapped = typeMap[oldType];
      if (mapped && validInt(previous.singles?.[oldType])) next.settings.tcb.singles[mapped] = Math.min(next.settings.tcb.singles[mapped], Number(previous.singles[oldType]));
    });
    if (validInt(previous.specialSingles?.ctbc)) next.settings.tcb.singles.specialCtbc = Number(previous.specialSingles.ctbc);
    if (validInt(previous.specialSingles?.taishin)) next.settings.tcb.singles.specialTaishin = Number(previous.specialSingles.taishin);
    if (validInt(previous.specialDaily)) next.settings.tcb.pools.specialDay = Number(previous.specialDaily);
    if (next.transactions.some((tx) => tx.type.startsWith('special'))) next.settings.tcb.flags.specialEnabled = true;
    return next;
  }

  /** 載入新版資料，未找到時才試著轉換舊版合庫資料。 */
  function loadState() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { raw = null; }
    if (!raw) raw = migrateLegacy();
    const fresh = { version: 4, settings: Object.fromEntries(BANK_IDS.map((id) => [id, defaultsFor(id)])), transactions: [], usedOffsets: {} };
    if (!raw || !Array.isArray(raw.transactions)) return fresh;
    for (const bankId of BANK_IDS) {
      const saved = raw.settings?.[bankId] || {};
      const target = fresh.settings[bankId];
      if (validInt(saved.freeTransfers, true)) target.freeTransfers = Math.min(1000, Number(saved.freeTransfers));
      if (validInt(saved.freeWithdrawals, true)) target.freeWithdrawals = Math.min(1000, Number(saved.freeWithdrawals));
      for (const key of Object.keys(target.flags)) target.flags[key] = Boolean(saved.flags?.[key]);
      for (const key of Object.keys(target.singles)) {
        if (validInt(saved.singles?.[key], true)) {
          const entered = Number(saved.singles[key]);
          target.singles[key] = key === 'atmOverseas' && ['tcb', 'taishin'].includes(bankId)
            ? Math.min(20000, entered) : entered;
        }
      }
      for (const key of Object.keys(target.pools)) {
        if (validInt(saved.pools?.[key], true)) target.pools[key] = Number(saved.pools[key]);
      }
    }
    fresh.transactions = raw.transactions.map(cleanTransaction).filter(Boolean).slice(0, 10000);
    if (raw.usedOffsets && typeof raw.usedOffsets === 'object') {
      for (const bankId of BANK_IDS) {
        fresh.usedOffsets[bankId] = {};
        const offsets = raw.usedOffsets[bankId];
        if (!offsets || typeof offsets !== 'object') continue;
        for (const [month, value] of Object.entries(offsets)) {
          if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !value || typeof value !== 'object') continue;
          fresh.usedOffsets[bankId][month] = {
            transfer: validInt(value.transfer, true) ? Math.min(1000, Number(value.transfer)) : 0,
            withdraw: validInt(value.withdraw, true) ? Math.min(1000, Number(value.withdraw)) : 0
          };
        }
      }
    }
    return fresh;
  }

  let state = loadState();
  let activeBank = 'tcb';
  let editId = null;
  let warningShown = false;
  const monthValue = () => $('viewMonth').value;
  const bankConfig = () => BANKS[activeBank];
  const bankSettings = () => state.settings[activeBank];
  const currentTypes = () => bankConfig().types;
  const selectedType = () => currentTypes()[$('txType').value];
  const monthTransactions = () => state.transactions.filter((tx) => tx.bank === activeBank && monthsMatch(tx.date, monthValue()));

  /** 寫入本地，避免瀏覽器禁止 file:// storage 時無提示。 */
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      localStorage.setItem('bank-quota-cloud-unsynced', '1');
      window.dispatchEvent(new Event('bank-quota-state-changed'));
      warningShown = false;
    }
    catch {
      if (!warningShown) { window.alert('無法儲存在這個瀏覽器；請使用 JSON 備份功能保存資料。'); warningShown = true; }
    }
  }

  /** 依帳戶升級條件計算有效限額（中信一般非約轉可選升級）。 */
  function effectiveLimit(bankId, poolId) {
    const settings = state.settings[bankId];
    if (bankId === 'ctbc') {
      if (settings.flags.nonAgreedUpgraded) {
        if (poolId === 'nonDay' && settings.pools.nonDay === 100000) return 200000;
        if (poolId === 'nonMonth' && settings.pools.nonMonth === 200000) return 500000;
      } else {
        if (poolId === 'nonDay') return Math.min(100000, settings.pools.nonDay);
        if (poolId === 'nonMonth') return Math.min(200000, settings.pools.nonMonth);
      }
    }
    return settings.pools[poolId];
  }

  function effectiveSingle(bankId, typeId) {
    const settings = state.settings[bankId];
    if (bankId === 'ctbc' && typeId === 'nonAgreed') {
      if (settings.flags.nonAgreedUpgraded && settings.singles.nonAgreed === 50000) return 100000;
      if (!settings.flags.nonAgreedUpgraded) return Math.min(50000, settings.singles.nonAgreed);
    }
    return settings.singles[typeId];
  }

  /** 統計特定額度池使用量，編輯時可排除原本那筆。 */
  function poolUsed(bankId, poolId, date, excludeId = null) {
    const pool = BANKS[bankId].pools[poolId];
    return state.transactions.filter((tx) => tx.id !== excludeId && tx.bank === bankId &&
      BANKS[bankId].types[tx.type].pools.includes(poolId) &&
      (pool.unit === 'day' ? tx.date === date : monthsMatch(tx.date, date.slice(0, 7))))
      .reduce((sum, tx) => sum + tx.amount, 0);
  }

  /** 指定交易類型的實際單筆剩餘量，取各額度池最小值。 */
  function allowedAmount(bankId, typeId, date, excludeId = null) {
    const type = BANKS[bankId].types[typeId];
    if (!type || !dateValid(date)) return 0;
    if (type.requiresFlag && !state.settings[bankId].flags[type.requiresFlag]) return 0;
    const values = [effectiveSingle(bankId, typeId)];
    for (const poolId of type.pools) {
      const pool = BANKS[bankId].pools[poolId];
      const cap = effectiveLimit(bankId, poolId);
      if (pool.optional && cap === 0) continue;
      values.push(remaining(cap, poolUsed(bankId, poolId, date, excludeId)));
    }
    if (bankId === 'tcb' && type.overseas && overseasTransactionCount(bankId, date, excludeId) >= 2) return 0;
    return Math.max(0, Math.min(...values));
  }

  /** 國外提款次數：合庫當日第三筆會停止國外提款服務。 */
  function overseasTransactionCount(bankId, date, excludeId = null) {
    return state.transactions.filter((tx) => tx.id !== excludeId && tx.bank === bankId && tx.date === date && BANKS[bankId].types[tx.type]?.overseas).length;
  }

  function freeUsage(bankId, kind, month) {
    const usedFromRecords = state.transactions.filter((tx) => {
      if (tx.bank !== bankId || !monthsMatch(tx.date, month) || !tx.crossBank || tx.exempt) return false;
      return BANKS[bankId].types[tx.type].fee === kind;
    }).length;
    const base = state.usedOffsets[bankId]?.[month]?.[kind === 'transfer' ? 'transfer' : 'withdraw'] || 0;
    const limit = kind === 'transfer' ? state.settings[bankId].freeTransfers : state.settings[bankId].freeWithdrawals;
    return { recorded: usedFromRecords, base, total: usedFromRecords + base, limit, left: remaining(limit, usedFromRecords + base), extra: Math.max(0, usedFromRecords + base - limit) };
  }

  function createLabelInput(label, id, value, extras = {}) {
    const wrap = document.createElement('label'); wrap.className = 'field';
    addText(wrap, 'span', label);
    const input = document.createElement('input'); input.type = 'number'; input.min = String(extras.min ?? 0); input.max = String(extras.max ?? 999999999); input.step = '1'; input.id = id; input.value = String(value);
    if (extras.dataset) Object.assign(input.dataset, extras.dataset);
    wrap.appendChild(input);
    return wrap;
  }

  function createOption(value, label, disabled = false) {
    const option = document.createElement('option'); option.value = value; option.textContent = label; option.disabled = disabled;
    return option;
  }

  // ===== 使用者介面與互動事件 =====
  function switchBank(nextBank) {
    if (!BANKS[nextBank]) return;
    activeBank = nextBank;
    editId = null;
    document.querySelectorAll('.bank-tab').forEach((button) => {
      const active = button.dataset.bank === nextBank;
      button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    });
    $('bank-panel').setAttribute('aria-labelledby', `tab-${nextBank}`);
    $('bankTag').textContent = bankConfig().tag;
    $('bankName').textContent = bankConfig().title;
    $('bankDescription').textContent = bankConfig().subtitle;
    $('bankNotice').textContent = bankConfig().description;
    $('feeNote').textContent = bankConfig().feeNote;
    $('formBankLabel').textContent = bankConfig().short;
    $('txType').replaceChildren();
    for (const [typeId, type] of Object.entries(currentTypes())) {
      if (!type.legacy) $('txType').appendChild(createOption(typeId, type.label));
    }
    renderSettings(); resetForm(); render();
  }

  function updateFeeRow() {
    const type = selectedType();
    const isTransfer = type?.fee === 'transfer';
    const isWithdraw = type?.fee === 'withdraw';
    $('crossBankRow').hidden = !type || Boolean(type.overseas);
    $('exemptRow').hidden = !type || (!$('txCrossBank').checked) || (!isTransfer && !isWithdraw);
    $('txLimitHint').classList.remove('alert');
    if (!type) return;
    const permitted = allowedAmount(activeBank, $('txType').value, $('txDate').value, editId);
    const single = effectiveSingle(activeBank, $('txType').value);
    let message = `單筆上限：${money(single)}；依當日／當月已記錄交易，目前最多可用：${money(permitted)}。`;
    if (type.requiresFlag && !bankSettings().flags[type.requiresFlag]) message = '此類型尚未啟用：請先在額度設定勾選「已由銀行核准」，並設定專屬額度。';
    if (type.legacy) message = '此為舊版匯入分類；請改選正確交易類型後再儲存。';
    if (type.overseas) message += ' 國外提款請輸入實際扣款的「新臺幣等值」，不扣國內免費跨提次數。國外 ATM 另有自身單筆上限／匯率／手續費。';
    if (type.overseas && activeBank === 'tcb') message += ` 合庫當天已記錄國外提款 ${overseasTransactionCount(activeBank, $('txDate').value, editId)} 次，第三次可能觸發鎖定。`;
    if (permitted === 0) $('txLimitHint').classList.add('alert');
    $('txLimitHint').textContent = message;
  }

  function resetForm() {
    editId = null;
    $('transactionForm').reset();
    const oldOption = $('txType').querySelector('option[data-legacy]');
    oldOption?.remove();
    $('txType').value = Object.keys(currentTypes()).find((key) => !currentTypes()[key].legacy);
    $('txDate').value = monthValue() === currentMonth ? currentDate : `${monthValue()}-01`;
    $('txAmount').value = '';
    $('txCrossBank').checked = Boolean(selectedType()?.crossDefault);
    $('txExempt').checked = false;
    $('formTitle').textContent = '新增一筆交易';
    $('saveTx').textContent = '新增交易';
    $('cancelEdit').hidden = true;
    $('formError').hidden = true;
    updateFeeRow();
  }

  function transactionError(tx) {
    if (!dateValid(tx.date)) return '請輸入有效的交易日期。';
    if (!validInt(tx.amount)) return '金額必須為大於 0 的整數。';
    const type = BANKS[tx.bank]?.types[tx.type];
    if (!type || type.legacy) return '請選擇新版的正確交易類型。';
    if (type.requiresFlag && !state.settings[tx.bank].flags[type.requiresFlag]) return '請先確認銀行核准，並開啟這個特殊交易類型。';
    const single = effectiveSingle(tx.bank, tx.type);
    if (!validInt(single) || tx.amount > single) return `超過這種交易的單筆限額：${money(single)}。`;
    if (tx.bank === 'tcb' && type.overseas && overseasTransactionCount(tx.bank, tx.date, tx.id) >= 2) return '合庫當日已有 2 次國外提款，官方表示第 3 次會停止服務，請勿繼續操作。';
    for (const poolId of type.pools) {
      const pool = BANKS[tx.bank].pools[poolId];
      const cap = effectiveLimit(tx.bank, poolId);
      if (pool.optional && cap === 0) continue;
      if (!validInt(cap) || poolUsed(tx.bank, poolId, tx.date, tx.id) + tx.amount > cap) return `超過「${pool.label}」上限：${money(cap)}。`;
    }
    return '';
  }

  function showError(textValue) { $('formError').textContent = textValue; $('formError').hidden = false; }

  $('transactionForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const type = selectedType();
    const tx = { id: editId || newId(), bank: activeBank, date: $('txDate').value, type: $('txType').value, amount: Number($('txAmount').value), note: $('txNote').value.trim(), crossBank: type?.overseas ? false : $('txCrossBank').checked, exempt: type?.overseas ? false : $('txExempt').checked, createdAt: state.transactions.find((row) => row.id === editId)?.createdAt || Date.now() };
    const error = transactionError(tx);
    if (error) { showError(error); return; }
    if (type?.requiresFlag && !window.confirm('這筆交易將使用「已核准特殊約定額度」。請確認銀行已經開通對應交易權限、且核准限額正確，是否繼續？')) return;
    const found = state.transactions.findIndex((row) => row.id === tx.id);
    if (found < 0) state.transactions.push(tx); else state.transactions[found] = tx;
    $('viewMonth').value = tx.date.slice(0, 7);
    $('inspectDate').value = tx.date;
    persist(); resetForm(); render();
  });

  $('txType').addEventListener('change', () => {
    $('txCrossBank').checked = Boolean(selectedType()?.crossDefault);
    $('txExempt').checked = false;
    updateFeeRow();
  });
  $('txCrossBank').addEventListener('change', () => {
    if (!$('txCrossBank').checked) $('txExempt').checked = false;
    updateFeeRow();
  });
  $('txDate').addEventListener('change', updateFeeRow);
  $('txAmount').addEventListener('input', () => { $('formError').hidden = true; updateFeeRow(); });
  $('cancelEdit').addEventListener('click', resetForm);
  $('viewMonth').addEventListener('change', () => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthValue())) return;
    $('inspectDate').value = monthValue() === currentMonth ? currentDate : `${monthValue()}-01`;
    renderSettings(); resetForm(); render();
  });
  $('inspectDate').addEventListener('change', () => {
    if (!dateValid($('inspectDate').value)) return;
    $('viewMonth').value = $('inspectDate').value.slice(0, 7);
    renderSettings(); resetForm(); render();
  });

  document.querySelectorAll('.bank-tab').forEach((button, idx, all) => {
    button.addEventListener('click', () => switchBank(button.dataset.bank));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let index = idx;
      if (event.key === 'ArrowRight') index = (idx + 1) % all.length;
      if (event.key === 'ArrowLeft') index = (idx - 1 + all.length) % all.length;
      if (event.key === 'Home') index = 0;
      if (event.key === 'End') index = all.length - 1;
      all[index].focus(); switchBank(all[index].dataset.bank);
    });
  });

  function renderSettings() {
    const settings = bankSettings();
    $('freeTransferLimit').value = settings.freeTransfers;
    $('freeWithdrawLimit').value = settings.freeWithdrawals;
    const offsets = state.usedOffsets[activeBank]?.[monthValue()];
    $('manualFreeTransfers').value = offsets?.transfer || 0;
    $('manualFreeWithdrawals').value = offsets?.withdraw || 0;
    const toggles = $('bankToggles'); toggles.replaceChildren();
    const names = { specialEnabled: '我已向合庫確認：特殊大額同戶名約定轉帳獲核准、可獨立計算', nonAgreedUpgraded: '我已在中信 APP 開通「提高非約轉額度」到 10／20／50 萬', branchEnabled: '我已向台新分行申請並獲核准臨櫃約定大額轉帳' };
    for (const [flag, checked] of Object.entries(settings.flags)) {
      const label = document.createElement('label'); label.className = 'check-row';
      const check = document.createElement('input'); check.type = 'checkbox'; check.checked = checked; check.dataset.flag = flag;
      label.append(check); addText(label, 'span', names[flag] || flag); toggles.appendChild(label);
    }
    const typesWrap = $('typeLimitSettings'); typesWrap.replaceChildren();
    for (const [typeId, type] of Object.entries(currentTypes())) {
      if (type.legacy) continue;
      const effective = effectiveSingle(activeBank, typeId);
      const label = createLabelInput(type.label + (type.overseas && activeBank !== 'taishin' ? '（試算值，依銀行／機台調整）' : ''), `single-${typeId}`, effective, { dataset: { typeId } });
      typesWrap.appendChild(label);
    }
    const poolsWrap = $('poolLimitSettings'); poolsWrap.replaceChildren();
    for (const [poolId, pool] of Object.entries(bankConfig().pools)) {
      const effective = effectiveLimit(activeBank, poolId);
      poolsWrap.appendChild(createLabelInput(pool.label + (pool.optional ? '（輸入 0 表示不設預算）' : ''), `pool-${poolId}`, effective, { dataset: { poolId } }));
    }
    $('settingsWarning').textContent = activeBank === 'tcb'
      ? '合庫第三類一般額度不可因自行輸入就提高；一般額度欄位只允許調低。ATM 國內與海外共用每日額度；海外提款單筆 2 萬元。16 次免費跨轉取決於新戶優惠期或你的薪轉方案，請向銀行確認。'
      : activeBank === 'ctbc'
        ? '中信網銀非約轉如已升級，預設值自動改為單筆 10 萬、每日 20 萬、每月 50 萬。提款與約轉額度依你實際核准和 ATM 機型調整。'
        : '台新已升級的一般轉帳預設 5／10／20 萬；Richart 第三類國內 ATM 單筆最高 5 萬，但國外 ATM 通常每筆等值 2 萬。國內外每日提款共用 10 萬。未核准時不要啟用大額約定轉帳。';
  }

  function updateSettingCount(field, value) {
    if (!validInt(value, true) || Number(value) > 1000) { window.alert('免費次數必須介於 0 至 1000。'); renderSettings(); return; }
    bankSettings()[field] = Number(value); persist(); render();
  }
  $('freeTransferLimit').addEventListener('change', (event) => updateSettingCount('freeTransfers', event.target.value));
  $('freeWithdrawLimit').addEventListener('change', (event) => updateSettingCount('freeWithdrawals', event.target.value));
  for (const [inputId, key] of [['manualFreeTransfers', 'transfer'], ['manualFreeWithdrawals', 'withdraw']]) {
    $(inputId).addEventListener('change', (event) => {
      if (!validInt(event.target.value, true) || Number(event.target.value) > 1000) { window.alert('補記次數須介於 0 至 1000。'); renderSettings(); return; }
      state.usedOffsets[activeBank] ||= {};
      state.usedOffsets[activeBank][monthValue()] ||= { transfer: 0, withdraw: 0 };
      state.usedOffsets[activeBank][monthValue()][key] = Number(event.target.value);
      persist(); render();
    });
  }
  $('bankToggles').addEventListener('change', (event) => {
    const flag = event.target.dataset.flag;
    if (!flag || !Object.hasOwn(bankSettings().flags, flag)) return;
    bankSettings().flags[flag] = event.target.checked;
    persist(); renderSettings(); render(); updateFeeRow();
  });
  $('typeLimitSettings').addEventListener('change', (event) => {
    const typeId = event.target.dataset.typeId;
    if (!currentTypes()[typeId]) return;
    const inputValue = Number(event.target.value);
    const original = currentTypes()[typeId].defaultSingle;
    const fixedOverseasCap = typeId === 'atmOverseas' && ['tcb', 'taishin'].includes(activeBank);
    const max = fixedOverseasCap || (activeBank === 'tcb' && !currentTypes()[typeId].requiresFlag) ? original : 999999999;
    if (!validInt(event.target.value, true) || inputValue > max) {
      window.alert(`這一類的額度必須介於 0 與 ${money(max)} 之間。`); event.target.value = String(effectiveSingle(activeBank, typeId)); return;
    }
    bankSettings().singles[typeId] = inputValue;
    persist(); render();
  });
  $('poolLimitSettings').addEventListener('change', (event) => {
    const poolId = event.target.dataset.poolId;
    if (!bankConfig().pools[poolId]) return;
    const inputValue = Number(event.target.value);
    const original = bankConfig().pools[poolId].defaultLimit;
    const max = activeBank === 'tcb' && poolId !== 'specialDay' ? original : 999999999;
    if (!validInt(event.target.value, true) || inputValue > max) {
      window.alert(`這個額度必須介於 0 與 ${money(max)} 之間。`); event.target.value = String(effectiveLimit(activeBank, poolId)); return;
    }
    bankSettings().pools[poolId] = inputValue;
    persist(); render();
  });
  $('restoreDefaults').addEventListener('click', () => {
    if (!window.confirm(`確定將「${bankConfig().title}」的額度與每月優惠次數回復預設值？原有交易紀錄與補記次數會保留。`)) return;
    state.settings[activeBank] = defaultsFor(activeBank);
    persist(); renderSettings(); render();
  });

  // ===== 統計摘要與交易紀錄 =====
  function render() {
    const bank = bankConfig(); const date = dateValid($('inspectDate').value) ? $('inspectDate').value : currentDate;
    const mainLimit = effectiveLimit(activeBank, bank.mainPool);
    const mainUsed = poolUsed(activeBank, bank.mainPool, date);
    const dayLimit = effectiveLimit(activeBank, bank.dayPool);
    const dayUsed = poolUsed(activeBank, bank.dayPool, date);
    $('mainMetricTitle').textContent = activeBank === 'tcb' ? '提款＋一般轉帳共用額度' : '網銀非約定轉帳額度';
    $('mainRemaining').textContent = money(remaining(mainLimit, mainUsed));
    $('mainDetail').textContent = `已使用 ${money(mainUsed)} ／ 上限 ${money(mainLimit)}`;
    $('mainProgress').style.width = `${mainLimit ? Math.min(100, (mainUsed / mainLimit) * 100) : 0}%`;
    $('mainMetricLabel').textContent = '本月剩餘';
    $('dailyRemaining').textContent = money(remaining(dayLimit, dayUsed));
    $('dailyDetail').textContent = `${date} · 已使用 ${money(dayUsed)}`;
    const transfers = freeUsage(activeBank, 'transfer', monthValue());
    const withdrawals = freeUsage(activeBank, 'withdraw', monthValue());
    $('freeTransferRemaining').textContent = `${transfers.left} 次`;
    $('freeTransferDetail').textContent = `本月 ${transfers.limit} 次；已占用 ${Math.min(transfers.total, transfers.limit)} 次，超出 ${transfers.extra} 筆`;
    $('freeWithdrawRemaining').textContent = `${withdrawals.left} 次`;
    $('freeWithdrawDetail').textContent = `本月 ${withdrawals.limit} 次；已占用 ${Math.min(withdrawals.total, withdrawals.limit)} 次，超出 ${withdrawals.extra} 筆`;
    const breakdown = $('poolBreakdown'); breakdown.replaceChildren();
    for (const [poolId, pool] of Object.entries(bank.pools)) {
      const limit = effectiveLimit(activeBank, poolId);
      const used = poolUsed(activeBank, poolId, date);
      const row = document.createElement('div'); row.className = 'pool-line';
      const caption = document.createElement('div'); addText(caption, 'span', pool.label);
      addText(caption, 'small', pool.optional && limit === 0 ? `本月已用 ${money(used)}（銀行未公布額外月上限）` : `已用 ${money(used)}／上限 ${money(limit)}`);
      row.appendChild(caption); addText(row, 'strong', pool.optional && limit === 0 ? '不另設月上限' : money(remaining(limit, used)));
      breakdown.appendChild(row);
    }
    renderAtmOverview(date);
    $('legacyWarning').hidden = !(activeBank === 'tcb' && state.transactions.some((tx) => tx.bank === 'tcb' && (currentTypes()[tx.type]?.legacy || tx.type.startsWith('special'))));
    renderTransactions(); updateFeeRow();
  }

  /** ATM 提款呈現：國內與海外分項統計，但每家銀行的每日提款額度共用。 */
  function renderAtmOverview(date) {
    const bankId = activeBank;
    const types = BANKS[bankId].types;
    const month = date.slice(0, 7);
    const domestic = (tx) => tx.bank === bankId && types[tx.type]?.fee === 'withdraw';
    const overseas = (tx) => tx.bank === bankId && Boolean(types[tx.type]?.overseas);
    const total = (predicate, monthOnly = false) => state.transactions
      .filter((tx) => predicate(tx) && (monthOnly ? monthsMatch(tx.date, month) : tx.date === date))
      .reduce((sum, tx) => sum + tx.amount, 0);
    const domesticDay = total(domestic);
    const domesticMonth = total(domestic, true);
    const overseasDay = total(overseas);
    const overseasMonth = total(overseas, true);
    const atmDailyPool = bankId === 'tcb' ? 'sharedDay' : 'atmDay';
    const cap = effectiveLimit(bankId, atmDailyPool);
    const capUsed = poolUsed(bankId, atmDailyPool, date);
    const pureAtmUsed = domesticDay + overseasDay;
    const sharedDayRemaining = remaining(cap, capUsed);
    const hasTcbLock = bankId === 'tcb' && overseasTransactionCount(bankId, date) >= 2;

    $('domesticDayUsed').textContent = money(domesticDay);
    $('domesticMonthUsed').textContent = money(domesticMonth);
    $('overseasDayUsed').textContent = money(overseasDay);
    $('overseasMonthUsed').textContent = money(overseasMonth);
    $('withdrawDailyLimit').textContent = money(cap);
    $('withdrawDailyUsed').textContent = money(pureAtmUsed);
    $('withdrawDailyRemain').textContent = money(sharedDayRemaining);
    $('withdrawProgress').style.width = `${cap ? Math.min(100, (capUsed / cap) * 100) : 0}%`;

    $('withdrawDetailHint').textContent = bankId === 'tcb'
      ? `合庫第三類：今日共用池已用 ${money(capUsed)}（含其他一般轉帳），因此實際剩餘需同時計入轉帳。海外提款另外受到每日次數控管。`
      : `今日 ATM 提款：國內 ${money(domesticDay)} ＋ 國外 ${money(overseasDay)}。海外提款不會得到額外一份每日額度。`;
    $('overseasCount').textContent = bankId === 'tcb'
      ? `今日已記錄 ${overseasTransactionCount(bankId, date)} 筆海外提款；達第 3 次會鎖住海外提款功能${hasTcbLock ? '（已達提醒門檻）' : ''}。海外單筆一般以 2 萬元試算。`
      : bankId === 'taishin'
        ? 'Richart 第三類海外單筆一般等值 2 萬元，並受當地 ATM 限制。'
        : '單筆依海外 ATM 所屬機構限制；每日與國內 ATM 共用。';

    const notice = $('withdrawMonthNotice');
    if (bankId === 'tcb') {
      const monthCap = effectiveLimit(bankId, 'sharedMonth');
      const used = poolUsed(bankId, 'sharedMonth', date);
      notice.textContent = `本月共用額度：提款＋一般轉帳合計已用 ${money(used)}／上限 ${money(monthCap)}；剩餘 ${money(remaining(monthCap, used))}。這不是國外提款專有的月額度。`;
    } else {
      const personalBudget = effectiveLimit(bankId, 'overseasMonth');
      notice.textContent = personalBudget > 0
        ? `國外提款個人月預算：已用 ${money(overseasMonth)}／自行設定 ${money(personalBudget)}，剩餘 ${money(remaining(personalBudget, overseasMonth))}。這是自訂預算，非銀行官方月限額。`
        : '目前未查到本帳戶海外 ATM 另有固定月上限；本月國內與海外提款金額僅作累計紀錄，沒有另外一份「每月可領額度」。';
    }
  }

  function renderTransactions() {
    const rows = monthTransactions().slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    $('recordCount').textContent = `${rows.length} 筆`;
    const table = $('transactionsBody'); table.replaceChildren();
    $('emptyState').hidden = rows.length > 0;
    const txAsc = rows.slice().reverse();
    const ordinalMap = new Map();
    let countTransfer = state.usedOffsets[activeBank]?.[monthValue()]?.transfer || 0;
    let countWithdraw = state.usedOffsets[activeBank]?.[monthValue()]?.withdraw || 0;
    for (const tx of txAsc) {
      if (!tx.crossBank || tx.exempt) continue;
      const kind = currentTypes()[tx.type]?.fee;
      if (kind === 'transfer') ordinalMap.set(tx.id, ++countTransfer <= bankSettings().freeTransfers ? '使用跨轉優惠' : '超出免費次數');
      if (kind === 'withdraw') ordinalMap.set(tx.id, ++countWithdraw <= bankSettings().freeWithdrawals ? '使用跨提優惠' : '超出免費次數');
    }
    for (const tx of rows) {
      const tr = document.createElement('tr');
      addText(tr, 'td', tx.date);
      addText(tr, 'td', currentTypes()[tx.type]?.label || tx.type);
      addText(tr, 'td', money(tx.amount), 'amount');
      const feeCell = document.createElement('td');
      const feeLabel = currentTypes()[tx.type]?.overseas ? '海外 ATM（不計國內跨提）' : tx.exempt ? '其他免手續費' : !tx.crossBank ? '非跨行' : ordinalMap.get(tx.id) || '未計入';
      addText(feeCell, 'span', feeLabel, `tag${feeLabel === '超出免費次數' ? ' paid' : tx.exempt || !tx.crossBank ? ' no' : ''}`);
      tr.appendChild(feeCell);
      addText(tr, 'td', tx.note || '—', 'notes');
      const actions = document.createElement('td');
      const edit = addText(actions, 'button', '編輯', 'small-btn'); edit.type = 'button'; edit.addEventListener('click', () => editTransaction(tx.id));
      const remove = addText(actions, 'button', '刪除', 'small-btn delete'); remove.type = 'button'; remove.addEventListener('click', () => deleteTransaction(tx.id));
      tr.appendChild(actions); table.appendChild(tr);
    }
  }

  function editTransaction(id) {
    const tx = state.transactions.find((row) => row.id === id && row.bank === activeBank);
    if (!tx) return;
    editId = id;
    if (currentTypes()[tx.type].legacy) {
      const option = createOption(tx.type, currentTypes()[tx.type].label, true); option.dataset.legacy = 'true'; $('txType').prepend(option);
    }
    $('txDate').value = tx.date;
    $('txType').value = tx.type;
    $('txAmount').value = tx.amount;
    $('txNote').value = tx.note;
    $('txCrossBank').checked = tx.crossBank;
    $('txExempt').checked = tx.exempt;
    $('formTitle').textContent = '編輯交易'; $('saveTx').textContent = '儲存修改'; $('cancelEdit').hidden = false; $('formError').hidden = true;
    updateFeeRow();
    document.querySelector('.form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function deleteTransaction(id) {
    if (!window.confirm('確定刪除這筆交易？此操作無法復原。')) return;
    state.transactions = state.transactions.filter((tx) => tx.id !== id);
    if (editId === id) resetForm();
    persist(); render();
  }
  $('clearMonth').addEventListener('click', () => {
    const rows = monthTransactions();
    if (!rows.length) { window.alert('這個月沒有交易紀錄。'); return; }
    if (!window.confirm(`確定只刪除「${bankConfig().title}」${monthValue()} 的 ${rows.length} 筆交易？其他銀行及月份不受影響。`)) return;
    const idSet = new Set(rows.map((tx) => tx.id));
    state.transactions = state.transactions.filter((tx) => !idSet.has(tx.id));
    persist(); resetForm(); render();
  });

  /** CSV 值跳脫與公式注入防護，Excel 可正確顯示繁體中文。 */
  function csvCell(value) {
    const source = String(value ?? '');
    const guarded = /^[\s]*[=+@\-\t\r]/.test(source) ? `'${source}` : source;
    return `"${guarded.replaceAll('"', '""')}"`;
  }
  function downloadText(name, body, mime) {
    const url = URL.createObjectURL(new Blob([body], { type: mime }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('downloadCsv').addEventListener('click', () => {
    const data = [['轉出銀行', '日期', '交易類型', '金額（元）', '跨行', '其他免手續費', '備註']];
    monthTransactions().slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((tx) => {
      data.push([bankConfig().title, tx.date, currentTypes()[tx.type].label, tx.amount, tx.crossBank ? '是' : '否', tx.exempt ? '是' : '否', tx.note]);
    });
    downloadText(`${bankConfig().short}_交易紀錄_${monthValue()}.csv`, '\uFEFF' + data.map((row) => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  });

  // ===== 匯出與還原：資料跨裝置備份 =====
  $('downloadBackup').addEventListener('click', () => downloadText(`三銀行額度計算器_全部備份_${currentDate}.json`, JSON.stringify(state, null, 2), 'application/json;charset=utf-8'));
  $('loadBackup').addEventListener('click', () => $('backupFile').click());
  $('backupFile').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 2_000_000) { window.alert('備份檔超過 2 MB，請確認是否選對檔案。'); return; }
    try {
      const parsed = JSON.parse(await file.text());
      if (![3, 4].includes(parsed?.version) || !Array.isArray(parsed.transactions) || !parsed.settings || typeof parsed.settings !== 'object') throw new Error('格式不符');
      if (!window.confirm('還原備份將覆蓋目前三家銀行的全部設定、紀錄和補記次數。請確認已先備份現有資料。是否繼續？')) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      state = loadState();
      switchBank(activeBank); persist();
      window.alert('備份還原完成。');
    } catch { window.alert('讀取失敗。請選擇此工具匯出的有效 JSON 備份檔。'); }
  });

  /** Firebase 模組使用的匯出介面；匯入需經過原有的白名單與數值驗證。 */
  window.BankQuotaStore = Object.freeze({
    getState: () => JSON.parse(JSON.stringify(state)),
    hasData: () => state.transactions.length > 0,
    replaceState: (nextState, source = 'cloud') => {
      if (!nextState || !Array.isArray(nextState.transactions) || !nextState.settings) throw new Error('資料格式不正確');
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
      state = loadState();
      editId = null;
      switchBank(activeBank);
      if (source === 'cloud') localStorage.removeItem('bank-quota-cloud-unsynced');
      else persist();
    }
  });

  // ===== 啟動 =====
  $('viewMonth').value = currentMonth;
  $('inspectDate').value = currentDate;
  switchBank('tcb');
  window.dispatchEvent(new Event('bank-quota-app-ready'));
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker?.register('./service-worker.js').catch(() => {});
  }
})();
