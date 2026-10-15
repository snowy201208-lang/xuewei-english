/* ============================================================
   学位英语冲刺工作台 · 应用逻辑
   数据来源：window.XW_VOCAB / XW_PAPERS / XW_REAL / XW_SITUATION / XW_GRAMMAR / XW_WRITING
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 工具 ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.prototype.slice.call(el.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const stripOpt = s => String(s || '').replace(/^[A-D][.．、]\s*/, '');
  const LETTERS = ['A', 'B', 'C', 'D'];

  function toast(msg) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 1800);
  }

  /* ---------- 本地存储（file:// 下降级为内存存储，避免不可用崩溃） ---------- */
  const LS = (function () {
    try {
      const t = '__xw_probe__';
      window.localStorage.setItem(t, '1');
      window.localStorage.removeItem(t);
      return window.localStorage;
    } catch (e) {
      const mem = {};
      return {
        getItem: k => (k in mem ? mem[k] : null),
        setItem: (k, v) => { mem[k] = String(v); },
        removeItem: k => { delete mem[k]; }
      };
    }
  })();

  const store = {
    k: 'xw_workbench_v1',
    d: null,
    load() {
      if (this.d) return this.d;
      try { this.d = JSON.parse(LS.getItem(this.k)) || {}; } catch (e) { this.d = {}; }
      if (!this.d.mods) this.d.mods = {};
      if (!this.d.vocab) this.d.vocab = {};
      if (!this.d.wrong) this.d.wrong = [];
      if (!this.d.star) this.d.star = [];
      if (!this.d.exams) this.d.exams = [];
      if (!this.d.today) this.d.today = { date: today(), n: 0, right: 0 };
      if (this.d.today.date !== today()) this.d.today = { date: today(), n: 0, right: 0 };
      return this.d;
    },
    save() { try { LS.setItem(this.k, JSON.stringify(this.d)); } catch (e) { } },
    mod(m) { const d = this.load(); if (!d.mods[m]) d.mods[m] = { done: 0, right: 0, total: 0 }; return d.mods[m]; },
    hit(m, ok) {
      const d = this.load(); const s = this.mod(m);
      s.done++; if (ok) s.right++;
      d.today.n++; if (ok) d.today.right++;
      this.save();
    },
    setTotal(m, n) { this.mod(m).total = n; this.save(); },
    wrongAdd(item) {
      const d = this.load();
      if (!d.wrong.some(w => w.id === item.id)) { d.wrong.unshift(item); if (d.wrong.length > 500) d.wrong.pop(); this.save(); }
    },
    wrongDel(id) { const d = this.load(); d.wrong = d.wrong.filter(w => w.id !== id); this.save(); },
    starToggle(item) {
      const d = this.load(); const i = d.star.findIndex(s => s.id === item.id);
      if (i >= 0) { d.star.splice(i, 1); toast('已取消收藏'); } else { d.star.unshift(item); toast('已加入收藏'); }
      this.save();
    },
    isStar(id) { return this.load().star.some(s => s.id === id); },
    reset() { LS.removeItem(this.k); this.d = null; }
  };
  function today() { const x = new Date(); return x.getFullYear() + '-' + (x.getMonth() + 1) + '-' + x.getDate(); }

  /* ---------- 题库 ---------- */
  const Bank = { vocab: [], situation: [], choice: [], cloze: [], reading: [], translation: [], writing: [], real: [] };
  function buildBank() {
    (window.XW_VOCAB || []).forEach((w, i) => Bank.vocab.push(Object.assign({ id: 'v' + i }, w)));
    (window.XW_SITUATION || []).forEach((s, i) =>
      Bank.situation.push(Object.assign({ id: 's' + i }, s, { stem: s.dialogue || s.stem || '' })));
    (window.XW_PAPERS || []).forEach((p, pi) => {
      const t = p.title || ('模拟卷' + (pi + 1));
      (p.parts.choice || []).forEach((q, i) => Bank.choice.push(Object.assign({ id: 'c' + pi + '_' + i, paper: t }, q)));
      const cz = p.parts.cloze;
      if (cz) (cz.questions || []).forEach((q, i) => Bank.cloze.push(Object.assign({ id: 'z' + pi + '_' + i, paper: t, passage: cz.passage }, q)));
      (p.parts.reading || []).forEach((ps, si) => (ps.questions || []).forEach((q, i) =>
        Bank.reading.push(Object.assign({ id: 'r' + pi + '_' + si + '_' + i, paper: t, passage: ps.passage }, q))));
      (p.parts.translation || []).forEach((q, i) => Bank.translation.push(Object.assign({ id: 't' + pi + '_' + i, paper: t }, q)));
      const w = p.parts.writing;
      if (w) Bank.writing.push(Object.assign({ id: 'w' + pi, paper: t }, w));
    });
    (window.XW_GRAMMAR || []).forEach((q, i) =>
      Bank.choice.push(Object.assign({ id: 'g' + i, paper: '语法专项 · ' + (q.point || '语法'), grammar: true }, q)));
    // —— 历年真题：题目同时汇入各题型模块，并保留整卷结构
    (window.XW_REAL || []).forEach((p, pi) => {
      const t = p.title || ((p.year || '') + '年真题');
      const parts = p.parts || {};
      const vol = { year: p.year, title: t, source: p.source, dialogue: [], reading: [], choice: [], cloze: [], writing: null, total: 0 };
      (parts.dialogue || []).forEach((q, i) => {
        const it = Object.assign({ id: 'rd' + pi + 'd' + i, paper: t, real: true, year: p.year }, q);
        Bank.situation.push(it); vol.dialogue.push(it);
      });
      (parts.reading || []).forEach((ps, si) => (ps.questions || []).forEach((q, i) => {
        const it = Object.assign({ id: 'rd' + pi + 'r' + si + '_' + i, paper: t, passage: ps.passage, real: true, year: p.year }, q);
        Bank.reading.push(it); vol.reading.push(it);
      }));
      (parts.choice || []).forEach((q, i) => {
        const it = Object.assign({ id: 'rd' + pi + 'c' + i, paper: t, real: true, year: p.year }, q);
        Bank.choice.push(it); vol.choice.push(it);
      });
      const cz = parts.cloze;
      if (cz) (cz.questions || []).forEach((q, i) => {
        const it = Object.assign({ id: 'rd' + pi + 'z' + i, paper: t, passage: cz.passage, real: true, year: p.year }, q);
        Bank.cloze.push(it); vol.cloze.push(it);
      });
      const w = parts.writing;
      if (w) {
        const it = Object.assign({ id: 'rd' + pi + 'w', paper: t, real: true, year: p.year }, w);
        Bank.writing.push(it); vol.writing = it;
      }
      vol.total = vol.dialogue.length + vol.reading.length + vol.choice.length + vol.cloze.length + (w ? 1 : 0);
      Bank.real.push(vol);
    });
  }

  /* ---------- 应用状态 ---------- */
  const App = {
    route: 'home',
    mode: 'answer',
    paperIdx: 0,
    realIdx: 0,
    exam: null,
    cur: { vocab: 0, situation: 0, choice: 0, reading: 0, cloze: 0, translation: 0, writing: 0 }
  };

  const MODULES = [
    { key: 'vocab', name: '单词速记', ico: '📚', color: '#7c3aed', bg: '#f2ecfe', desc: '五星必考词 · 音标 · 发音' },
    { key: 'situation', name: '情景题', ico: '💬', color: '#0f766e', bg: '#e6f7f4', desc: '交际用语 · 对话补全' },
    { key: 'reading', name: '阅读题', ico: '📖', color: '#b45309', bg: '#fef4e6', desc: '篇章阅读 · 主旨细节' },
    { key: 'cloze', name: '完型填空', ico: '🧩', color: '#1d4ed8', bg: '#eaf1fe', desc: '上下文逻辑 · 词义辨析' },
    { key: 'choice', name: '选择题', ico: '🔤', color: '#be185d', bg: '#fdecf3', desc: '词汇语法 · 固定搭配' },
    { key: 'translation', name: '翻译题', ico: '✍️', color: '#c2410c', bg: '#fdece4', desc: '汉译英 · 参考译文' },
    { key: 'writing', name: '作文题', ico: '✒️', color: '#3f6212', bg: '#eef7dc', desc: '命题作文 · 模板框架' }
  ];
  const MODE_LABEL = { answer: '答题模式', memorize: '背题模式', explain: '解读模式' };

  /* ---------- 通用渲染 ---------- */
  function modeSwitch(key) {
    return `<div class="mode-switch" data-mode-switch="${key}">` +
      ['answer', 'memorize', 'explain'].map(m =>
        `<button class="${App.mode === m ? 'on' : ''}" data-mode="${m}">${MODE_LABEL[m]}</button>`).join('') + `</div>`;
  }

  function progressBar(done, total) {
    const p = total ? Math.min(100, Math.round(done / total * 100)) : 0;
    return `<div class="prog"><div class="prog-bar"><i style="width:${p}%"></i></div><span>${done}/${total}</span></div>`;
  }

  /** 渲染一道选择题（choice / situation / cloze / reading 通用） */
  function renderQ(item, opts) {
    opts = opts || {};
    const mode = App.mode;
    const ans = item.answer || '';
    const sel = opts.sel || State.sel[item.id];
    const revealed = mode === 'memorize' || mode === 'explain' || !!sel;
    const optHtml = (item.options || []).map((o, i) => {
      const L = LETTERS[i] || String.fromCharCode(65 + i);
      let cls = 'opt';
      if (sel === L) cls += ' sel';
      if (revealed) {
        if (L === ans) cls += ' right';
        else if (sel === L) cls += ' wrong';
        else cls += ' dim';
      }
      return `<div class="${cls}" data-opt="${L}" data-qid="${item.id}">
        <span class="opt-key">${L}</span><span class="opt-txt">${esc(stripOpt(o))}</span></div>`;
    }).join('');
    const showAnalysis = mode === 'explain' || mode === 'memorize' || (mode === 'answer' && sel);
    const star = store.isStar(item.id);
    return `
    <div class="q" data-q="${item.id}">
      <div class="q-head">
        <span class="q-no">${item.no || (opts.idx || '')}</span>
        ${item.point ? `<span class="point-tag">${esc(item.point)}</span>` : ''}
        ${item.paper ? `<span class="tiny">${esc(item.paper)}</span>` : ''}
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" data-star="${item.id}" title="收藏">${star ? '★ 已收藏' : '☆ 收藏'}</button>
      </div>
      <div class="q-stem">${renderStem(item.stem || '')}</div>
      <div class="opts">${optHtml}</div>
      ${showAnalysis ? `
      <div class="analysis">
        <div class="analysis-title">◆ 答案解析<span class="spacer"></span><span class="ans-key">正确答案 ${esc(ans)}</span></div>
        <div class="analysis-body">${esc(item.explain || '暂无解析')}</div>
      </div>` : ''}
    </div>`;
  }

  function renderStem(s) {
    return esc(s).replace(/_{3,}/g, '<span class="blank"></span>');
  }

  /** 完型文章：把 ___21___ 替换成编号块 */
  function renderClozePassage(text, answers, nums) {
    let h = esc(text);
    const mark = (n) => {
      const a = answers && answers[n];
      return `<span class="blank-num ${a ? 'filled' : ''}" data-blank="${n}">${n}</span>`;
    };
    // 模拟卷：空位写作 ___21___ 形式
    h = h.replace(/_+\s*(\d{1,2})\s*_+/g, function (m, n) {
      const k = parseInt(n, 10);
      if (!(k >= 21 && k <= 40)) return m;
      return mark(n);
    });
    // 真题：空位写作 __76 _ / 76 / 85 等形式，按本题空号逐个定位首个出现处
    (nums || []).forEach(n => {
      if (h.indexOf('data-blank="' + n + '"') >= 0) return;
      h = h.replace(new RegExp('_{0,}\\s*\\b' + n + '\\b\\s*_{0,}'), () => mark(n));
    });
    h = h.replace(/_{3,}/g, '<span class="blank"></span>');
    return h;
  }

  const State = { sel: {}, checked: {} };

  /* ============================================================
     视图
     ============================================================ */

  /* ---------- 首页 ---------- */
  function viewHome() {
    const d = store.load();
    const totalQ = Bank.choice.length + Bank.cloze.length + Bank.reading.length + Bank.situation.length + Bank.translation.length + Bank.writing.length;
    const correctRate = d.today.n ? Math.round(d.today.right / d.today.n * 100) : 0;
    const paperN = (window.XW_PAPERS || []).length;
    const grammarN = (window.XW_GRAMMAR || []).length;
    const cards = MODULES.map(m => {
      const s = d.mods[m.key] || { done: 0, right: 0 };
      const total = Bank[m.key].length;
      const p = total ? Math.min(100, Math.round(s.done / total * 100)) : 0;
      return `<div class="mod-card" data-go="${m.key}">
        <div class="mod-ico" style="background:${m.bg};color:${m.color}">${m.ico}</div>
        <div class="mod-name">${m.name}</div>
        <div class="mod-desc">${m.desc}</div>
        <div class="mod-foot"><div class="mod-bar"><i style="width:${p}%"></i></div><span class="tiny">${total} 题</span></div>
      </div>`;
    }).join('');
    return `
    <div class="stat-row" style="margin-bottom:20px">
      <div class="stat"><div class="stat-num">${totalQ}</div><div class="stat-label">已收录题目</div><div class="stat-delta tiny">模拟卷/真题 ${paperN} 套 · 语法专项 ${grammarN} 题</div></div>
      <div class="stat"><div class="stat-num">${Bank.vocab.length}</div><div class="stat-label">五星必考词汇</div><div class="stat-delta tiny">含音标 · 支持朗读</div></div>
      <div class="stat"><div class="stat-num">${d.today.n}</div><div class="stat-label">今日已练题数</div><div class="stat-delta tiny">正确率 ${correctRate}%</div></div>
      <div class="stat"><div class="stat-num">${d.wrong.length}</div><div class="stat-label">错题本</div><div class="stat-delta tiny">收藏 ${d.star.length} 题</div></div>
    </div>
    <div class="card card-pad" style="margin-bottom:20px;display:flex;align-items:center;gap:18px;flex-wrap:wrap">
      <div style="flex:1;min-width:240px">
        <div class="section-title" style="margin-bottom:6px">开始今日冲刺</div>
        <div class="muted" style="font-size:13px">按真实试卷结构组卷：情景对话 + 词汇语法 + 完型 + 阅读 + 翻译 + 写作，120 分钟限时。</div>
      </div>
      <button class="btn btn-primary" data-go="exam">🎯 进入考试模式</button>
      <button class="btn" data-go="vocab">📚 单词速记</button>
      <button class="btn" data-go="profile">📊 学习报告</button>
    </div>
    <div class="section-title">刷题模块</div>
    <div class="mod-grid">${cards}</div>`;
  }

  /* ---------- 单词速记 ---------- */
  function viewVocab() {
    const list = Bank.vocab;
    const d = store.load();
    const i = App.cur.vocab % list.length;
    const w = list[i];
    const flipped = !!State.vocabFlip;
    const st = d.vocab[w.word];
    const known = Object.values(d.vocab).filter(v => v === 'k').length;
    const card = flipped
      ? `<div class="vcard vcard-flip">
           <div class="vcard-meaning">${esc(w.meaning)}</div>
           <div class="vcard-hint">${esc(w.word)} ${esc(w.phonetic)}</div>
         </div>`
      : `<div class="vcard vcard-flip">
           <div class="vcard-word">${esc(w.word)}</div>
           <div class="vcard-phon">${esc(w.phonetic || '—')}</div>
           <div class="vcard-say"><button class="btn btn-sm" data-say="${esc(w.word)}">🔊 朗读</button></div>
           <div class="vcard-hint">点击「显示释义」或空格键翻转</div>
         </div>`;
    return `
    <div class="row" style="margin-bottom:14px">
      <span class="point-tag">第 ${i + 1} / ${list.length} 张</span>
      <span class="tiny">已掌握 ${known} 词${st ? ' · 上次标记：' + ({ k: '认识', f: '模糊', u: '不认识' }[st] || '') : ''}</span>
      <span class="spacer"></span>
      <button class="btn btn-sm" data-vocab-jump="random">🎲 随机</button>
      <button class="btn btn-sm" data-vocab-jump="unknown">↻ 只看未掌握</button>
    </div>
    <div class="vocab-stage">
      ${card}
      <div class="vocab-actions">
        <button class="vbtn vbtn-unk" data-vocab-mark="u">不认识<small>加入复习</small></button>
        <button class="vbtn vbtn-fuz" data-vocab-mark="f">模糊<small>稍后再看</small></button>
        <button class="vbtn vbtn-kno" data-vocab-mark="k">认识<small>下一张</small></button>
      </div>
      <div class="row" style="justify-content:center;margin-top:14px;gap:8px">
        <button class="btn btn-sm" data-vocab-nav="-1">← 上一张</button>
        <button class="btn btn-sm" data-vocab-shuffle>🔀 显示释义</button>
        <button class="btn btn-sm" data-vocab-nav="1">下一张 →</button>
      </div>
    </div>`;
  }

  /* ---------- 情景题 ---------- */
  function viewSituation() {
    const list = Bank.situation;
    const d = store.load();
    const items = list.map((it, i) => renderQ(it, { idx: i + 1 })).join('');
    return `
    <div class="row row-wrap" style="margin-bottom:16px">
      ${modeSwitch('situation')}
      <span class="tiny">共 ${list.length} 题 · 来自历年真题情景对话</span>
      <span class="spacer"></span>
      ${progressBar((d.mods.situation || {}).done || 0, list.length)}
    </div>
    <div class="q-list">${items}</div>`;
  }

  /* ---------- 选择题 ---------- */
  function viewChoice() {
    const list = Bank.choice;
    const d = store.load();
    const papers = [...new Set(list.map(q => q.paper))];
    const gCount = list.filter(q => q.grammar).length;
    const pCount = papers.filter(p => !p.startsWith('语法专项')).length;
    const items = list.map((it, i) => renderQ(it, { idx: i + 1 })).join('');
    return `
    <div class="row row-wrap" style="margin-bottom:16px">
      ${modeSwitch('choice')}
      <span class="tiny">共 ${list.length} 题 · ${pCount} 套模拟卷/真题 + 语法专项 ${gCount} 题</span>
      <span class="spacer"></span>
      <select id="choiceFilter" class="btn btn-sm" style="padding:5px 10px">
        <option value="">全部试卷</option>
        ${papers.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}
      </select>
      ${progressBar((d.mods.choice || {}).done || 0, list.length)}
    </div>
    <div class="q-list" id="choiceList">${items}</div>`;
  }

  /* ---------- 阅读题 ---------- */
  function viewReading() {
    const d = store.load();
    const groups = {};
    Bank.reading.forEach(q => { (groups[q.id.split('_').slice(0, 2).join('_')] = groups[q.id.split('_').slice(0, 2).join('_')] || []).push(q); });
    let html = '';
    let n = 0;
    Object.keys(groups).forEach(k => {
      const qs = groups[k];
      const pass = qs[0].passage || '';
      n += qs.length;
      html += `<div class="card card-pad" style="margin-bottom:16px">
        <div class="row" style="margin-bottom:12px">
          <span class="point-tag">篇章阅读</span>
          <span class="tiny">${esc(qs[0].paper || '')}</span>
        </div>
        <div class="passage passage-en">${esc(pass)}</div>
        ${qs.map((q, i) => renderQ(q, { idx: q.no })).join('')}
      </div>`;
    });
    return `
    <div class="row row-wrap" style="margin-bottom:16px">
      ${modeSwitch('reading')}
      <span class="tiny">共 ${Bank.reading.length} 题 · ${Object.keys(groups).length} 个篇章</span>
      <span class="spacer"></span>
      ${progressBar((d.mods.reading || {}).done || 0, Bank.reading.length)}
    </div>
    ${html}`;
  }

  /* ---------- 完型填空 ---------- */
  function viewCloze() {
    const d = store.load();
    const groups = {};
    Bank.cloze.forEach(q => { groups[q.paper] = groups[q.paper] || []; groups[q.paper].push(q); });
    let html = '';
    Object.keys(groups).forEach(k => {
      const qs = groups[k];
      const answers = {};
      qs.forEach(q => { if (State.sel[q.id]) answers[q.no] = 1; });
      html += `<div class="card card-pad" style="margin-bottom:16px">
        <div class="row" style="margin-bottom:12px"><span class="point-tag">完形填空</span><span class="tiny">${esc(k)}</span><span class="spacer"></span><span class="tiny">${qs.length} 空</span></div>
        <div class="passage cloze-passage passage-en">${renderClozePassage(qs[0].passage || '', answers, qs.map(q => q.no))}</div>
        <div class="q-list">${qs.map(q => renderQ(q, { idx: q.no })).join('')}</div>
      </div>`;
    });
    return `
    <div class="row row-wrap" style="margin-bottom:16px">
      ${modeSwitch('cloze')}
      <span class="tiny">共 ${Bank.cloze.length} 空 · ${Object.keys(groups).length} 套</span>
      <span class="spacer"></span>
      ${progressBar((d.mods.cloze || {}).done || 0, Bank.cloze.length)}
    </div>
    ${html}`;
  }

  /* ---------- 翻译题 ---------- */
  function viewTranslation() {
    const d = store.load();
    const list = Bank.translation;
    const items = list.map((it, i) => {
      const val = State.sel[it.id + '_txt'] || '';
      const show = App.mode !== 'answer' || !!State.checked[it.id];
      return `<div class="q">
        <div class="q-head"><span class="q-no">${it.no || i + 1}</span><span class="point-tag">汉译英</span>
          ${it.paper ? `<span class="tiny">${esc(it.paper)}</span>` : ''}<span class="spacer"></span>
          <button class="btn btn-ghost btn-sm" data-star="${it.id}">${store.isStar(it.id) ? '★' : '☆'} 收藏</button></div>
        <div class="q-stem">${esc(it.zh)}</div>
        <textarea class="editor" data-trans="${it.id}" placeholder="在此输入你的英文翻译…">${esc(val)}</textarea>
        <div class="row" style="margin-top:10px">
          <button class="btn btn-sm btn-primary" data-trans-check="${it.id}">提交并对照参考译文</button>
          <span class="tiny">建议先独立翻译，再对照答案</span>
        </div>
        ${show ? `<div class="analysis">
          <div class="analysis-title">◆ 参考译文与评分要点</div>
          <div class="ref-box">${esc(it.ref || '（暂无参考译文）')}</div>
          <div class="analysis-body" style="margin-top:10px">${esc(it.explain || '')}</div>
        </div>` : ''}
      </div>`;
    }).join('');
    return `
    <div class="row row-wrap" style="margin-bottom:16px">
      ${modeSwitch('translation')}
      <span class="tiny">共 ${list.length} 题 · 来自模拟卷「句子汉译英」</span>
      <span class="spacer"></span>${progressBar((d.mods.translation || {}).done || 0, list.length)}
    </div>
    <div class="q-list">${items}</div>`;
  }

  /* ---------- 作文题 ---------- */
  function viewWriting() {
    const d = store.load();
    const list = Bank.writing;
    const tpl = window.XW_WRITING || [];
    const items = list.map((it, i) => {
      const val = State.sel[it.id + '_txt'] || '';
      return `<div class="q">
        <div class="q-head"><span class="q-no">${i + 1}</span><span class="point-tag">写作</span>
          <span class="tiny">${esc(it.paper || '')}</span><span class="spacer"></span>
          <button class="btn btn-ghost btn-sm" data-star="${it.id}">${store.isStar(it.id) ? '★' : '☆'} 收藏</button></div>
        ${it.title ? `<div class="q-stem" style="font-weight:600;margin-bottom:6px">命题：${esc(it.title)}</div>` : ''}
        <div class="q-stem">${esc(it.directions || '')}</div>
        <div class="row" style="margin-bottom:8px"><span class="tiny">写作框架（三段式）</span></div>
        <div class="tpl">① 引入段：点明主题 + 背景/现象<br>② 主体段：2–3 个论点，每点 = 主题句 + 例证/说明<br>③ 结论段：总结观点 + 展望/建议</div>
        <textarea class="editor" style="min-height:150px;margin-top:12px" data-writing="${it.id}" placeholder="在此撰写你的作文（不少于 100 词）…">${esc(val)}</textarea>
        <div class="row" style="margin-top:10px"><span class="tiny" data-wordcount="${it.id}">词数：0</span></div>
        <div class="analysis">
          <div class="analysis-title">◆ 评分要点与提分建议</div>
          <div class="analysis-body">${esc(it.explain || '')}</div>
        </div>
      </div>`;
    }).join('');

    const materials = tpl.map(g => `
      <div class="card card-pad" style="margin-bottom:14px">
        <div class="section-title" style="font-size:14px;margin-bottom:10px">${esc(g.title.replace(/\.pdf$/, ''))} <span class="tiny" style="font-weight:400">（${g.items.length} 条）</span></div>
        <div class="q-list" style="gap:8px">${g.items.slice(0, 30).map(x => `<div class="tpl">${esc(x)}</div>`).join('')}</div>
        ${g.items.length > 30 ? `<div class="tiny" style="margin-top:8px">…仅展示前 30 条，完整素材见 data/writing_material.json</div>` : ''}
      </div>`).join('');

    const tplN = tpl.reduce((a, g) => a + g.items.length, 0);
    return `
    <div class="row row-wrap" style="margin-bottom:16px">
      ${modeSwitch('writing')}
      <span class="tiny">共 ${list.length} 个命题 · 含 ${tplN} 条万能模板素材</span>
      <span class="spacer"></span>${progressBar((d.mods.writing || {}).done || 0, list.length)}
    </div>
    <div class="section-title">命题作文</div>
    <div class="q-list" style="margin-bottom:24px">${items}</div>
    <div class="section-title">万能模板素材库</div>
    ${materials}`;
  }

  /* ---------- 历年真题：卷列表 ---------- */
  function viewReal() {
    const d = store.load();
    const s = d.mods.real || { done: 0, right: 0 };
    const totQ = Bank.real.reduce((a, v) => a + v.choice.length + v.cloze.length + v.reading.length + v.dialogue.length, 0);
    const cards = Bank.real.map((v, i) => {
      const c = v.choice.length, z = v.cloze.length, r = v.reading.length, dg = v.dialogue.length, w = v.writing ? 1 : 0;
      return `<div class="paper-card" data-real-open="${i}">
        <div class="paper-year">${esc(v.year)}<small>年</small></div>
        <div class="paper-mid">
          <div class="paper-title">${esc(v.title)}</div>
          <div class="paper-meta">
            <span class="pill pill-blue">客观题 ${c + z + r + dg}</span>
            <span class="pill">对话 ${dg}</span>
            <span class="pill">阅读 ${r}</span>
            <span class="pill">词汇 ${c}</span>
            <span class="pill">完型 ${z}</span>
            <span class="pill">写作 ${w}</span>
          </div>
        </div>
        <div class="paper-ops">
          <button class="btn btn-sm btn-primary" data-real-open="${i}">进入练习</button>
          <button class="btn btn-sm" data-real-exam="${i}">🎯 整卷考试</button>
        </div>
      </div>`;
    }).join('');
    return `
    <div class="stat-row" style="margin-bottom:18px">
      <div class="stat"><div class="stat-num">${Bank.real.length}</div><div class="stat-label">历年真题套数</div><div class="stat-delta tiny">2009 – 2023</div></div>
      <div class="stat"><div class="stat-num">${totQ}</div><div class="stat-label">真题客观题总量</div><div class="stat-delta tiny">每卷 85 题 · 逐题可判分</div></div>
      <div class="stat"><div class="stat-num">${Bank.real.filter(v => v.writing).length}</div><div class="stat-label">含写作命题</div><div class="stat-delta tiny">部分卷附参考范文</div></div>
      <div class="stat"><div class="stat-num">${s.done}</div><div class="stat-label">真题已练题数</div><div class="stat-delta tiny">来自真题模块</div></div>
    </div>
    <div class="card card-pad" style="margin-bottom:18px">
      <div class="section-title" style="margin-bottom:6px">江西学位英语历年真题</div>
      <div class="muted" style="font-size:13px">题库按真实试卷结构还原：Part I 对话交际 15 题 + Part II 阅读理解 20 题 + Part III 词汇与结构 40 题 + Part IV 完形填空 10 题 + Part V 写作 1 篇，客观题作答后即时判分。点「进入练习」逐套精读，点「整卷考试」按 120 分钟限时模考。</div>
    </div>
    <div class="paper-list">${cards}</div>`;
  }

  /* ---------- 历年真题：单卷浏览 ---------- */
  function viewRealPaper() {
    const v = Bank.real[App.realIdx] || Bank.real[0];
    if (!v) return viewReal();
    const i = App.realIdx;
    let html = '';
    if (v.dialogue.length) {
      html += `<div class="card card-pad" style="margin-bottom:16px">
        <div class="row" style="margin-bottom:12px"><span class="point-tag">Part I · 对话交际</span>
          <span class="tiny">${v.dialogue.length} 题</span></div>
        <div class="q-list">${v.dialogue.map(q => renderQ(q, { idx: q.no })).join('')}</div>
      </div>`;
    }
    if (v.reading.length) {
      const groups = {};
      v.reading.forEach(q => { const k = q.id.split('_')[0]; (groups[k] = groups[k] || []).push(q); });
      Object.keys(groups).forEach((k, pi) => {
        const qs = groups[k];
        html += `<div class="card card-pad" style="margin-bottom:16px">
          <div class="row" style="margin-bottom:12px"><span class="point-tag">Part II · 篇章阅读</span>
            <span class="tiny">第 ${pi + 1} 篇 · ${qs.length} 题</span></div>
          <div class="passage passage-en">${esc(qs[0].passage || '')}</div>
          ${qs.map(q => renderQ(q, { idx: q.no })).join('')}
        </div>`;
      });
    }
    if (v.choice.length) {
      html += `<div class="card card-pad" style="margin-bottom:16px">
        <div class="row" style="margin-bottom:12px"><span class="point-tag">Part III · 词汇与结构</span>
          <span class="tiny">${v.choice.length} 题</span></div>
        <div class="q-list">${v.choice.map(q => renderQ(q, { idx: q.no })).join('')}</div>
      </div>`;
    }
    if (v.cloze.length) {
      const answers = {};
      v.cloze.forEach(q => { if (State.sel[q.id]) answers[q.no] = 1; });
      html += `<div class="card card-pad" style="margin-bottom:16px">
        <div class="row" style="margin-bottom:12px"><span class="point-tag">Part IV · 完形填空</span>
          <span class="tiny">${v.cloze.length} 空</span></div>
        <div class="passage cloze-passage passage-en">${renderClozePassage(v.cloze[0].passage || '', answers, v.cloze.map(q => q.no))}</div>
        <div class="q-list">${v.cloze.map(q => renderQ(q, { idx: q.no })).join('')}</div>
      </div>`;
    }
    if (v.writing) {
      const w = v.writing;
      const val = State.sel[w.id + '_txt'] || '';
      html += `<div class="card card-pad" style="margin-bottom:16px">
        <div class="row" style="margin-bottom:12px"><span class="point-tag">Part V · 写作</span>
          <span class="spacer"></span>
          <button class="btn btn-ghost btn-sm" data-star="${w.id}">${store.isStar(w.id) ? '★ 已收藏' : '☆ 收藏'}</button></div>
        ${w.title ? `<div class="q-stem" style="font-weight:600;margin-bottom:6px">命题：${esc(w.title)}</div>` : ''}
        <div class="q-stem">${esc(w.directions || '')}</div>
        <div class="tpl" style="margin-top:10px">① 引入段：点明主题 + 背景<br>② 主体段：2–3 个论点 + 例证<br>③ 结论段：总结 + 建议</div>
        <textarea class="editor" style="min-height:150px;margin-top:12px" data-writing="${w.id}" placeholder="在此撰写你的作文（不少于 100 词）…">${esc(val)}</textarea>
        <div class="row" style="margin-top:10px"><span class="tiny" data-wordcount="${w.id}">词数：0</span></div>
        ${w.sample ? `<div class="analysis"><div class="analysis-title">◆ 参考范文</div>
          <div class="ref-box">${esc(w.sample)}</div></div>` : ''}
      </div>`;
    }
    const d = store.load();
    return `
    <div class="row row-wrap" style="margin-bottom:14px">
      ${modeSwitch('real')}
      <span class="point-tag">${esc(v.year)} 年真题</span>
      <span class="tiny">共 ${v.total} 题</span>
      <span class="spacer"></span>
      <button class="btn btn-sm" data-go="real">← 真题列表</button>
      <button class="btn btn-sm btn-primary" data-real-exam="${i}">🎯 整卷考试</button>
    </div>
    ${progressBar((d.mods.real || {}).done || 0, Bank.real.reduce((a, x) => a + x.total, 0))}
    <div style="height:14px"></div>
    ${html}`;
  }

  /** 可考卷目录：模拟卷 + 历年真题（真题排在后段，索引连续） */
  function allPapers() {
    const sim = (window.XW_PAPERS || []).map(p => ({ title: p.title, parts: p.parts || {}, kind: 'sim' }));
    const real = (window.XW_REAL || []).map(p => ({ title: p.title, parts: p.parts || {}, kind: 'real', year: p.year }));
    return sim.concat(real);
  }
  function simCount() { return (window.XW_PAPERS || []).length; }

  /* ---------- 考试模式 ---------- */
  function viewExamSetup() {
    const list = allPapers();
    const rows = list.map((p, i) => {
      const c = (p.parts.choice || []).length, z = ((p.parts.cloze || {}).questions || []).length,
        r = (p.parts.reading || []).reduce((a, x) => a + x.questions.length, 0),
        t = (p.parts.translation || []).length, w = p.parts.writing ? 1 : 0,
        dg = (p.parts.dialogue || []).length;
      return { i, title: p.title, kind: p.kind, total: c + z + r + t + w + dg };
    });
    const sims = rows.filter(x => x.kind === 'sim'), reals = rows.filter(x => x.kind === 'real');
    const d = store.load();
    const hist = d.exams.slice(0, 5);
    return `
    <div class="card card-pad" style="margin-bottom:20px">
      <div class="section-title">全真模拟考试</div>
      <div class="muted" style="font-size:13px;margin-bottom:14px">客观题作答后即时判分，主观题（翻译 / 写作）由你自评。模拟卷按「词汇语法 20 + 完形 20 + 阅读 8 + 翻译 5 + 写作 1」结构；历年真题按「对话 15 + 阅读 20 + 词汇 40 + 完型 10 + 写作 1」结构，客观题满分 85 分。</div>
      <div class="row row-wrap">
        <select id="paperSel" class="btn" style="padding:7px 12px;max-width:420px">
          <optgroup label="模拟卷（${sims.length} 套）">
            ${sims.map(p => `<option value="${p.i}">${esc(p.title)}（${p.total} 题）</option>`).join('')}
          </optgroup>
          <optgroup label="历年真题（${reals.length} 套）">
            ${reals.map(p => `<option value="${p.i}">${esc(p.title)}（${p.total} 题）</option>`).join('')}
          </optgroup>
        </select>
        <button class="btn btn-primary" data-start-exam>开始考试</button>
        <span class="tiny">限时 120 分钟，交卷后自动评分</span>
      </div>
    </div>
    ${hist.length ? `
    <div class="card card-pad">
      <div class="section-title" style="font-size:14px">最近考试记录</div>
      <table class="tbl"><thead><tr><th>试卷</th><th>得分</th><th>正确率</th><th>用时</th><th>时间</th></tr></thead><tbody>
      ${hist.map(h => `<tr><td>${esc(h.title)}</td><td><b>${h.score}</b> 分</td><td>${h.rate}%</td><td>${h.used}</td><td class="tiny">${h.at}</td></tr>`).join('')}
      </tbody></table>
    </div>` : ''}`;
  }

  function startExam(idx) {
    const p = allPapers()[idx];
    if (!p) return;
    const qs = [];
    let n = 0;
    const add = (arr, type, extra) => (arr || []).forEach(q =>
      qs.push(Object.assign({ id: 'ex' + (n++), type: type }, extra || {}, q)));
    add(p.parts.dialogue, 'choice');
    add(p.parts.choice, 'choice');
    const cz = p.parts.cloze;
    if (cz) add(cz.questions, 'choice', { cloze: true, passage: cz.passage });
    (p.parts.reading || []).forEach(ps => add(ps.questions, 'choice', { passage: ps.passage }));
    add(p.parts.translation, 'trans');
    if (p.parts.writing) qs.push(Object.assign({ id: 'ex' + (n++), type: 'write' }, p.parts.writing));
    App.exam = {
      title: p.title, qs, sel: {}, trans: {}, writing: '', idx: 0,
      left: 120 * 60, started: Date.now(), done: false,
      full: p.kind === 'real' ? 85 : 70
    };
    Bank._lastPaper = idx;
    go('exam');
    if (App._timer) clearInterval(App._timer);
    App._timer = setInterval(examTick, 1000);
  }

  function examTick() {
    const e = App.exam;
    if (!e || e.done) return;
    e.left--;
    if (e.left <= 0) { e.left = 0; submitExam(true); return; }
    const el = $('#examTimer');
    if (el) {
      el.textContent = fmtTime(e.left);
      el.className = 'timer' + (e.left < 300 ? ' danger' : e.left < 900 ? ' warn' : '');
    }
  }
  function fmtTime(s) {
    const m = Math.floor(s / 60), x = s % 60;
    return String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0');
  }

  function viewExamRun() {
    const e = App.exam;
    if (!e) return viewExamSetup();
    const objCount = e.qs.filter(q => q.type === 'choice').length;
    const doneCount = e.qs.filter(q => e.sel[q.id] || (q.type === 'trans' && e.trans[q.id]) || (q.type === 'write' && e.writing)).length;
    const cur = e.qs[e.idx];
    let body = '';
    if (cur.type === 'choice') {
      body = `<div class="q">
        <div class="q-head"><span class="q-no">第 ${e.idx + 1} 题</span>${cur.point ? '' : ''}<span class="spacer"></span><span class="tiny">${cur.cloze ? '完形填空' : '客观题'}</span></div>
        ${cur.cloze && cur.passage ? `<div class="passage cloze-passage passage-en" style="max-height:220px;overflow:auto">${renderClozePassage(cur.passage, null, e.qs.filter(x => x.cloze).map(x => x.no))}</div>` : ''}
        ${cur.stem ? `<div class="q-stem">${renderStem(cur.stem)}</div>` : ''}
        <div class="opts">${(cur.options || []).map((o, i) => {
          const L = LETTERS[i];
          return `<div class="opt ${e.sel[cur.id] === L ? 'sel' : ''}" data-exam-opt="${L}"><span class="opt-key">${L}</span><span class="opt-txt">${esc(stripOpt(o))}</span></div>`;
        }).join('')}</div>
      </div>`;
    } else if (cur.type === 'trans') {
      body = `<div class="q">
        <div class="q-head"><span class="q-no">第 ${e.idx + 1} 题</span><span class="point-tag">汉译英</span></div>
        <div class="q-stem">${esc(cur.zh)}</div>
        <textarea class="editor" data-exam-trans placeholder="输入英文翻译…">${esc(e.trans[cur.id] || '')}</textarea>
      </div>`;
    } else {
      body = `<div class="q">
        <div class="q-head"><span class="q-no">第 ${e.idx + 1} 题</span><span class="point-tag">写作</span></div>
        <div class="q-stem">${esc(cur.directions || '')}</div>
        <textarea class="editor" style="min-height:220px" data-exam-writing placeholder="撰写作文（不少于 100 词）…">${esc(e.writing)}</textarea>
      </div>`;
    }
    return `
    <div class="exam-bar">
      <span class="point-tag">${esc(e.title)}</span>
      <span class="tiny">已答 ${doneCount}/${e.qs.length}</span>
      <span class="spacer"></span>
      <span class="tiny">剩余时间</span><span class="timer" id="examTimer">${fmtTime(e.left)}</span>
      <button class="btn btn-sm btn-primary" data-submit-exam>交卷</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 250px;gap:18px" class="exam-grid">
      <div>
        ${body}
        <div class="row" style="margin-top:16px">
          <button class="btn" data-exam-nav="-1" ${e.idx === 0 ? 'disabled' : ''}>← 上一题</button>
          <button class="btn btn-primary" data-exam-nav="1" ${e.idx >= e.qs.length - 1 ? 'disabled' : ''}>下一题 →</button>
          <span class="spacer"></span>
          <span class="tiny">第 ${e.idx + 1} / ${e.qs.length} 题</span>
        </div>
      </div>
      <div class="card card-pad" style="height:fit-content;position:sticky;top:130px">
        <div class="section-title" style="font-size:13px;margin-bottom:10px">答题卡</div>
        <div class="answer-sheet">
          ${e.qs.map((q, i) => {
            const isDone = e.sel[q.id] || (q.type === 'trans' && e.trans[q.id]) || (q.type === 'write' && e.writing);
            return `<div class="sheet-cell ${isDone ? 'done' : ''} ${i === e.idx ? 'cur' : ''}" data-exam-jump="${i}">${i + 1}</div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
  }

  function submitExam(auto) {
    const e = App.exam;
    if (!e) return;
    if (!auto && !confirm('确定交卷吗？交卷后将无法修改。')) return;
    clearInterval(App._timer);
    let right = 0;
    e.qs.forEach(q => { if (q.type === 'choice' && e.sel[q.id] === q.answer) right++; });
    const score = Math.round(right / objCountSafe(e) * (e.full || 70));
    e.done = true;
    e.result = { right, objCount: objCountSafe(e), score, rate: Math.round(right / objCountSafe(e) * 100) };
    const d = store.load();
    d.exams.unshift({
      title: e.title, score, rate: e.result.rate,
      used: fmtTime(Math.round((Date.now() - e.started) / 1000)),
      at: new Date().toLocaleString('zh-CN', { hour12: false })
    });
    d.exams = d.exams.slice(0, 20);
    d.mods.exam = { done: (d.mods.exam ? d.mods.exam.done : 0) + 1, right: 0, total: 0 };
    d.today.n += objCountSafe(e); d.today.right += right;
    // 错题入库
    e.qs.forEach(q => { if (q.type === 'choice' && e.sel[q.id] && e.sel[q.id] !== q.answer) store.wrongAdd(slim(q)); });
    store.save();
    render();
    toast(auto ? '时间到，已自动交卷' : '交卷成功');
  }
  function objCountSafe(e) { const n = e.qs.filter(q => q.type === 'choice').length; return n || 1; }
  function slim(q) {
    return { id: q.id, no: q.no, stem: q.stem || q.zh || q.directions, options: q.options, answer: q.answer, explain: q.explain, point: q.point, paper: q.paper, type: q.type || 'choice' };
  }

  function viewExamResult() {
    const e = App.exam;
    if (!e || !e.done) return viewExamSetup();
    const r = e.result;
    const wrongs = e.qs.filter(q => q.type === 'choice' && e.sel[q.id] !== q.answer);
    return `
    <div class="card card-pad" style="margin-bottom:20px;text-align:center">
      <div class="score-ring" style="background:conic-gradient(${r.rate >= 60 ? '#16a34a' : '#dc2626'} ${r.rate * 3.6}deg, #eef1f5 0)">
        <div style="width:112px;height:112px;border-radius:50%;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center">
          <div class="n">${r.score}</div><div class="t">客观题得分（满分 70）</div>
        </div>
      </div>
      <div style="margin-top:16px" class="row" >
        <span class="pill pill-blue">客观题 ${r.right}/${r.objCount} 正确</span>
        <span class="pill ${r.rate >= 60 ? 'pill-green' : 'pill-red'}">正确率 ${r.rate}%</span>
        <span class="pill">用时 ${fmtTime(Math.round((Date.now() - e.started) / 1000))}</span>
        <span class="pill pill-amber">主观题请自评 30 分</span>
      </div>
      <div class="row" style="justify-content:center;margin-top:16px">
        <button class="btn" data-go="exam">← 返回考试首页</button>
        <button class="btn btn-primary" data-retry-exam>再考一次</button>
      </div>
    </div>
    ${wrongs.length ? `<div class="section-title">错题回顾（${wrongs.length} 题）</div>
      <div class="q-list">${wrongs.map(q => `
        <div class="q">
          <div class="q-head"><span class="q-no">${q.no || ''}</span>${q.point ? `<span class="point-tag">${esc(q.point)}</span>` : ''}<span class="spacer"></span><span class="pill pill-red">你选 ${esc(e.sel[q.id] || '未答')}</span></div>
          <div class="q-stem">${renderStem(q.stem || '')}</div>
          <div class="opts">${(q.options || []).map((o, i) => {
            const L = LETTERS[i];
            let cls = 'opt dim';
            if (L === q.answer) cls = 'opt right';
            else if (L === e.sel[q.id]) cls = 'opt wrong';
            return `<div class="${cls}"><span class="opt-key">${L}</span><span class="opt-txt">${esc(stripOpt(o))}</span></div>`;
          }).join('')}</div>
          <div class="analysis"><div class="analysis-title">◆ 解析<span class="spacer"></span><span class="ans-key">正确答案 ${esc(q.answer)}</span></div>
          <div class="analysis-body">${esc(q.explain || '')}</div></div>
        </div>`).join('')}</div>` : `<div class="empty"><div class="empty-ico">🎉</div>客观题全部答对，非常棒！</div>`}`;
  }

  /* ---------- 个人中心 ---------- */
  function viewProfile() {
    const d = store.load();
    const rows = MODULES.map(m => {
      const s = d.mods[m.key] || { done: 0, right: 0 };
      const rate = s.done ? Math.round(s.right / s.done * 100) : 0;
      return `<tr>
        <td><span style="color:${m.color}">${m.ico}</span> ${m.name}</td>
        <td>${s.done} / ${Bank[m.key].length}</td>
        <td>${s.done ? rate + '%' : '—'}</td>
        <td style="width:180px">${progressBar(s.done, Bank[m.key].length)}</td>
      </tr>`;
    }).join('');
    return `
    <div class="stat-row" style="margin-bottom:20px">
      <div class="stat"><div class="stat-num">${d.today.n}</div><div class="stat-label">今日练题</div></div>
      <div class="stat"><div class="stat-num">${d.today.n ? Math.round(d.today.right / d.today.n * 100) : 0}%</div><div class="stat-label">今日正确率</div></div>
      <div class="stat"><div class="stat-num">${d.wrong.length}</div><div class="stat-label">错题本</div></div>
      <div class="stat"><div class="stat-num">${d.star.length}</div><div class="stat-label">收藏题</div></div>
    </div>

    <div class="card card-pad" style="margin-bottom:20px">
      <div class="section-title" style="font-size:14px">各模块学习进度</div>
      <table class="tbl"><thead><tr><th>模块</th><th>已练 / 总量</th><th>正确率</th><th>进度</th></tr></thead><tbody>${rows}</tbody></table>
    </div>

    <div class="row row-wrap" style="margin-bottom:14px">
      <div class="section-title" style="margin:0;font-size:14px">错题本（${d.wrong.length}）</div>
      <span class="spacer"></span>
      ${d.wrong.length ? '<button class="btn btn-sm" data-clear-wrong>清空错题本</button>' : ''}
      <button class="btn btn-sm" data-export>导出学习数据</button>
      <button class="btn btn-sm" data-reset-app>重置全部进度</button>
    </div>
    ${d.wrong.length ? `<div class="q-list" style="margin-bottom:24px">
      ${d.wrong.map(w => `<div class="q">
        <div class="q-head"><span class="q-no">${w.no || ''}</span>${w.point ? `<span class="point-tag">${esc(w.point)}</span>` : ''}<span class="spacer"></span>
          <button class="btn btn-ghost btn-sm" data-wrong-del="${w.id}">移出错题本</button></div>
        <div class="q-stem">${renderStem(w.stem || '')}</div>
        <div class="opts">${(w.options || []).map((o, i) => {
          const L = LETTERS[i]; let cls = 'opt dim';
          if (L === w.answer) cls = 'opt right';
          return `<div class="${cls}"><span class="opt-key">${L}</span><span class="opt-txt">${esc(stripOpt(o))}</span></div>`;
        }).join('')}</div>
        <div class="analysis"><div class="analysis-title">◆ 解析<span class="spacer"></span><span class="ans-key">正确答案 ${esc(w.answer)}</span></div>
        <div class="analysis-body">${esc(w.explain || '')}</div></div>
      </div>`).join('')}
    </div>` : `<div class="empty"><div class="empty-ico">📝</div>还没有错题，继续保持！</div>`}

    <div class="section-title" style="font-size:14px">收藏夹（${d.star.length}）</div>
    ${d.star.length ? `<div class="q-list">${d.star.map(w => `<div class="q">
        <div class="q-head"><span class="q-no">${w.no || ''}</span><span class="spacer"></span><button class="btn btn-ghost btn-sm" data-star="${w.id}">★ 取消收藏</button></div>
        <div class="q-stem">${renderStem(w.stem || w.zh || w.word || '')}</div>
        ${w.options ? `<div class="opts">${w.options.map((o, i) => `<div class="opt dim"><span class="opt-key">${LETTERS[i]}</span><span class="opt-txt">${esc(stripOpt(o))}</span></div>`).join('')}</div>` : ''}
        ${w.explain ? `<div class="analysis"><div class="analysis-body">${esc(w.explain)}</div></div>` : ''}
      </div>`).join('')}</div>` : `<div class="empty"><div class="empty-ico">☆</div>还没有收藏内容</div>`}`;
  }

  /* ============================================================
     路由 & 事件
     ============================================================ */
  const TITLES = {
    home: ['学习总览', '学位英语冲刺工作台'], vocab: ['单词速记', '刷题模块'],
    situation: ['情景题', '刷题模块'], reading: ['阅读题', '刷题模块'], cloze: ['完型填空', '刷题模块'],
    choice: ['选择题', '刷题模块'], translation: ['翻译题', '刷题模块'], writing: ['作文题', '刷题模块'],
    real: ['历年真题', '真题精练与整卷模考'], realpaper: ['历年真题', '真题精练与整卷模考'],
    exam: ['考试模式', '专项训练'], profile: ['个人中心', '学习数据']
  };

  function render() {
    const nav = $('#nav');
    const mods = MODULES.map(m => `<button class="nav-item ${App.route === m.key ? 'active' : ''}" data-go="${m.key}">
        <span class="nav-ico">${m.ico}</span>${m.name}<span class="nav-badge">${Bank[m.key].length}</span></button>`).join('');
    nav.innerHTML = `
      <button class="nav-item ${App.route === 'home' ? 'active' : ''}" data-go="home"><span class="nav-ico">🏠</span>学习总览</button>
      <div class="nav-label">真题</div>
      <button class="nav-item ${App.route === 'real' || App.route === 'realpaper' ? 'active' : ''}" data-go="real"><span class="nav-ico">📄</span>历年真题<span class="nav-badge">${Bank.real.length}</span></button>
      <div class="nav-label">刷题模块</div>${mods}
      <div class="nav-label">专项</div>
      <button class="nav-item ${App.route === 'exam' ? 'active' : ''}" data-go="exam"><span class="nav-ico">🎯</span>考试模式</button>
      <button class="nav-item ${App.route === 'profile' ? 'active' : ''}" data-go="profile"><span class="nav-ico">📊</span>个人中心</button>`;

    const t = TITLES[App.route] || ['', ''];
    $('#topTitle').textContent = t[0];
    $('#topCrumb').textContent = (App.route === 'realpaper' && Bank.real[App.realIdx])
      ? Bank.real[App.realIdx].title : t[1];

    let html = '';
    switch (App.route) {
      case 'home': html = viewHome(); break;
      case 'vocab': html = viewVocab(); break;
      case 'situation': html = viewSituation(); break;
      case 'choice': html = viewChoice(); break;
      case 'reading': html = viewReading(); break;
      case 'cloze': html = viewCloze(); break;
      case 'translation': html = viewTranslation(); break;
      case 'writing': html = viewWriting(); break;
      case 'real': html = viewReal(); break;
      case 'realpaper': html = viewRealPaper(); break;
      case 'exam': html = (App.exam && App.exam.done) ? viewExamResult() : (App.exam ? viewExamRun() : viewExamSetup()); break;
      case 'profile': html = viewProfile(); break;
    }
    const c = $('#content');
    c.innerHTML = html;
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  function go(route) {
    if (App.route === 'exam' && route !== 'exam' && App.exam && !App.exam.done) {
      if (!confirm('考试尚未交卷，确定离开吗？')) return;
      clearInterval(App._timer);
    }
    App.route = route;
    if (route !== 'exam') App.exam = null;
    render();
  }

  /* ---------- 事件代理 ---------- */
  function bind() {
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-go]');
      if (el) { go(el.dataset.go); return; }
      const star = e.target.closest('[data-star]');
      if (star) { starById(star.dataset.star); return; }
      const del = e.target.closest('[data-wrong-del]');
      if (del) { store.wrongDel(del.dataset.wrongDel); render(); toast('已移出错题本'); return; }
      if (e.target.closest('[data-clear-wrong]')) { if (confirm('确定清空错题本？')) { store.load().wrong = []; store.save(); render(); } return; }
      if (e.target.closest('[data-reset-app]')) { if (confirm('确定重置全部学习进度？此操作不可撤销。')) { store.reset(); App.cur.vocab = 0; render(); toast('已重置'); } return; }
      if (e.target.closest('[data-export]')) { exportData(); return; }

      const mode = e.target.closest('[data-mode]');
      if (mode) { App.mode = mode.dataset.mode; render(); return; }

      // 历年真题：整卷考试 / 进入单卷练习（考试按钮先判，避免被外层卡片的 open 命中）
      const rexam = e.target.closest('[data-real-exam]');
      if (rexam) { Bank._lastPaper = simCount() + (Number(rexam.dataset.realExam) || 0); startExam(Bank._lastPaper); return; }
      const ropen = e.target.closest('[data-real-open]');
      if (ropen) { App.realIdx = Number(ropen.dataset.realOpen) || 0; go('realpaper'); return; }

      const say = e.target.closest('[data-say]');
      if (say) { speak(say.dataset.say); return; }

      // 单词
      if (e.target.closest('[data-vocab-shuffle]')) { State.vocabFlip = !State.vocabFlip; render(); return; }
      const vnav = e.target.closest('[data-vocab-nav]');
      if (vnav) { App.cur.vocab = (App.cur.vocab + Number(vnav.dataset.vocabNav) + Bank.vocab.length) % Bank.vocab.length; State.vocabFlip = false; render(); return; }
      const vjump = e.target.closest('[data-vocab-jump]');
      if (vjump) { vocabJump(vjump.dataset.vocabJump); return; }
      const vmark = e.target.closest('[data-vocab-mark]');
      if (vmark) { vocabMark(vmark.dataset.vocabMark); return; }

      // 客观题选项
      const opt = e.target.closest('[data-opt]');
      if (opt) { pickOption(opt.dataset.qid, opt.dataset.opt); return; }

      // 翻译提交
      const tc = e.target.closest('[data-trans-check]');
      if (tc) { State.checked[tc.dataset.transCheck] = true; store.hit('translation', true); render(); toast('已对照参考译文'); return; }

      // 考试
      if (e.target.closest('[data-start-exam]')) { startExam(Number(($('#paperSel') || {}).value || 0)); return; }
      if (e.target.closest('[data-submit-exam]')) { submitExam(false); return; }
      if (e.target.closest('[data-retry-exam]')) { const idx = Bank._lastPaper || 0; startExam(idx); return; }
      const eo = e.target.closest('[data-exam-opt]');
      if (eo) { App.exam.sel[App.exam.qs[App.exam.idx].id] = eo.dataset.examOpt; render(); return; }
      const en = e.target.closest('[data-exam-nav]');
      if (en) { App.exam.idx = Math.max(0, Math.min(App.exam.qs.length - 1, App.exam.idx + Number(en.dataset.examNav))); render(); return; }
      const ej = e.target.closest('[data-exam-jump]');
      if (ej) { App.exam.idx = Number(ej.dataset.examJump); render(); return; }
    });

    document.addEventListener('input', e => {
      const et = e.target;
      if (et.matches('[data-trans]')) { State.sel[et.dataset.trans + '_txt'] = et.value; return; }
      if (et.matches('[data-writing]')) {
        State.sel[et.dataset.writing + '_txt'] = et.value;
        const wc = $('[data-wordcount="' + et.dataset.writing + '"]');
        if (wc) wc.textContent = '词数：' + (et.value.trim() ? et.value.trim().split(/\s+/).length : 0);
        return;
      }
      if (et.matches('[data-exam-trans]')) { App.exam.trans[App.exam.qs[App.exam.idx].id] = et.value; return; }
      if (et.matches('[data-exam-writing]')) { App.exam.writing = et.value; return; }
    });

    document.addEventListener('change', e => {
      if (e.target.id === 'choiceFilter') {
        const v = e.target.value;
        $$('#choiceList .q').forEach((n, i) => {
          const item = Bank.choice[i];
          n.style.display = (!v || item.paper === v) ? '' : 'none';
        });
      }
      if (e.target.id === 'paperSel') { Bank._lastPaper = Number(e.target.value); }
    });

    document.addEventListener('keydown', e => {
      if (App.route === 'vocab') {
        if (e.code === 'Space') { e.preventDefault(); State.vocabFlip = !State.vocabFlip; render(); }
        if (e.key === '1') vocabMark('u');
        if (e.key === '2') vocabMark('f');
        if (e.key === '3') vocabMark('k');
      }
    });

    $('#menuBtn').addEventListener('click', e => {
      e.stopPropagation();
      $('#sidebar').classList.toggle('open');
    });
    // 移动端：点主内容区自动收起侧边栏
    document.addEventListener('click', e => {
      if (window.innerWidth > 860) return;
      const sb = $('#sidebar');
      if (sb.classList.contains('open') && !e.target.closest('#sidebar') && !e.target.closest('#menuBtn')) {
        sb.classList.remove('open');
      }
    });
  }

  function pickOption(qid, L) {
    if (App.mode !== 'answer') return;
    if (State.sel[qid]) return;
    State.sel[qid] = L;
    const find = arr => arr.find(x => x.id === qid);
    let item = find(Bank.choice) || find(Bank.situation) || find(Bank.reading) || find(Bank.cloze);
    const mod = find(Bank.choice) ? 'choice' : find(Bank.situation) ? 'situation' : find(Bank.reading) ? 'reading' : 'cloze';
    const ok = item && L === item.answer;
    store.hit(mod, ok);
    if (!ok && item) store.wrongAdd(slim(item));
    render();
  }

  function starById(id) {
    const all = [].concat(Bank.choice, Bank.situation, Bank.reading, Bank.cloze);
    let it = all.find(x => x.id === id);
    if (!it) it = Bank.translation.find(x => x.id === id) || Bank.writing.find(x => x.id === id);
    if (it) store.starToggle(slim(it));
    render();
  }

  function vocabMark(m) {
    const d = store.load();
    const w = Bank.vocab[App.cur.vocab % Bank.vocab.length];
    d.vocab[w.word] = m;
    if (App.cur._last !== w.word) { store.hit('vocab', m === 'k'); App.cur._last = w.word; }
    store.save();
    App.cur.vocab = (App.cur.vocab + 1) % Bank.vocab.length;
    State.vocabFlip = false;
    render();
  }

  function vocabJump(kind) {
    const d = store.load();
    if (kind === 'random') { App.cur.vocab = Math.floor(Math.random() * Bank.vocab.length); }
    else {
      const idx = Bank.vocab.findIndex((w, i) => i > App.cur.vocab && d.vocab[w.word] !== 'k');
      App.cur.vocab = idx >= 0 ? idx : Bank.vocab.findIndex(w => d.vocab[w.word] !== 'k');
      if (App.cur.vocab < 0) { toast('全部单词都已掌握！'); return; }
    }
    State.vocabFlip = false; render();
  }

  function speak(text) {
    try {
      if (!window.speechSynthesis) { toast('当前浏览器不支持语音朗读'); return; }
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = 0.9;
      speechSynthesis.speak(u);
    } catch (err) { toast('朗读失败'); }
  }

  function exportData() {
    const d = store.load();
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '学位英语学习数据_' + today() + '.json';
    a.click();
    toast('学习数据已导出');
  }

  /* ---------- 启动 ---------- */
  function init() {
    buildBank();
    MODULES.forEach(m => store.setTotal(m.key, Bank[m.key].length));
    bind();
    render();
    $('#loading').style.display = 'none';
  }
  document.addEventListener('DOMContentLoaded', init);
})();
