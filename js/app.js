(function () {
  const L = window.SignLogic;
  const app = document.getElementById("app");
  const VIEWER_KEY = "sign-viewer";

  let config = L.defaultConfig();
  let checks = {};
  let viewerId = localStorage.getItem(VIEWER_KEY) || "";
  let screen = viewerId ? "today" : "pick";
  let cursor = startOfToday();
  let watchedKey = "";
  let dayUnsub = function () {};
  let modal = null;
  let writing = false;
  const draft = {
    personName: "",
    personGroup: "g1",
    vacPerson: "",
    vacStart: L.dateKey(startOfToday()),
    vacDays: "1",
  };

  const store = createStore();

  let started = false;
  document.addEventListener("DOMContentLoaded", boot);
  if (document.readyState !== "loading") boot();

  function boot() {
    if (started) return;
    started = true;
    app.addEventListener("click", onClick);
    app.addEventListener("change", onChange);
    app.addEventListener("focusout", onBlur);
    app.addEventListener("input", onInput);
    app.innerHTML = '<div class="card empty">جاري التحميل…</div>';
    store.init().then(function () {
      store.subscribeConfig(function (next) {
        config = L.normalize(next);
        if (!draft.personGroup || !config.groups.some(function (group) { return group.id === draft.personGroup; })) {
          draft.personGroup = config.groups[0] ? config.groups[0].id : "head";
        }
        if (viewerId && !L.personById(config, viewerId)) {
          viewerId = "";
          localStorage.removeItem(VIEWER_KEY);
          screen = "pick";
        }
        ensureDayWatch();
        render();
      });
    });
  }

  function startOfToday() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function viewedDate() {
    return new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
  }

  function viewedKey() {
    return L.dateKey(viewedDate());
  }

  function ensureDayWatch() {
    const key = viewedKey();
    if (key === watchedKey) return;
    watchedKey = key;
    dayUnsub();
    dayUnsub = store.subscribeDay(key, function (next) {
      if (watchedKey !== key) return;
      checks = next || {};
      render();
    });
  }

  function viewer() {
    return L.personById(config, viewerId);
  }

  function toast(message) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2800);
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function namesCount(n) {
    if (n === 1) return "اسم واحد";
    if (n === 2) return "اسمين";
    return n + " أسماء";
  }

  function daysLabel(n) {
    n = Number(n) || 0;
    if (n === 1) return "يوم واحد";
    if (n === 2) return "يومين";
    return n + " أيام";
  }

  function bannerFor(state, person) {
    if (!person) return null;
    const dayWord = state.key === L.dateKey(startOfToday()) ? "النهاردة" : "اليوم ده";
    if (L.vacationOn(config, person.id, state.key)) {
      return { kind: "warn", text: "إنت متسجل إجازة " + dayWord + ". حصتك متوزعة على النازلين، وتقدر برضو تعلّم." };
    }
    const exception = L.exceptionOn(config, person.id, state.key);
    if (exception === "evening") {
      return { kind: "warn", text: "إنت متسجل مسائي " + dayWord + ". حصتك اتوزعت، وتقدر تعلّم لو هتمضي." };
    }
    if (exception === "absent") {
      return { kind: "warn", text: "إنت متسجل مش موجود " + dayWord + ". حصتك اتوزعت على الباقيين." };
    }
    if (!state.signers.length) {
      return { kind: "info", text: "مفيش حد نازل فعلي اليوم ده. القائمة كلها متاحة للتعليم." };
    }
    const scheduled = (person.dutyDays || []).includes(state.jsDay);
    if (!scheduled) {
      return { kind: "info", text: dayWord + " مش يومك. تقدر برضو تعلّم إنك مضيت لأي حد." };
    }
    if (L.isHead(person)) return null;
    const count = (state.assignments[person.id] || []).length;
    return { kind: "ok", text: "إنت نازل " + dayWord + ". حصتك " + namesCount(count) + " باللون العادي." };
  }

  function render() {
    const scroll = document.scrollingElement ? document.scrollingElement.scrollTop : 0;
    if (screen === "settings") app.innerHTML = renderSettings();
    else if (screen === "pick" || !viewer()) app.innerHTML = renderPick();
    else app.innerHTML = renderToday();
    if (document.scrollingElement) document.scrollingElement.scrollTop = scroll;
  }

  function topbar(subtitle, backAction, switchUser) {
    const subtitleHtml = switchUser
      ? '<p class="who"><span>' + esc(subtitle) + '</span><button type="button" class="switch-btn" data-action="switch-user" aria-label="تغيير الاسم">تغيير</button></p>'
      : '<p>' + esc(subtitle) + '</p>';
    return (
      '<header class="topbar">' +
        '<div class="brand">' +
          '<img src="icon.svg" alt="">' +
          '<div><h1>دفتر الإمضاء</h1>' + subtitleHtml + '</div>' +
        '</div>' +
        (backAction
          ? '<button class="ghost" data-action="' + backAction + '">رجوع</button>'
          : '<button class="ghost" data-action="open-settings">الإعدادات</button>') +
      "</header>"
    );
  }

  function localBanner() {
    if (store.mode === "firebase" && !store.problem) return "";
    const text = store.problem
      ? store.problem
      : "البيانات على الموبايل ده بس. عشان التشيك يوصل لكل الموبايلات، اربط Firebase من ملف README.";
    return '<div class="banner local">' + esc(text) + "</div>";
  }

  function renderPick() {
    const groups = config.groups || [];
    let body = "";
    groups.forEach(function (group) {
      const members = (config.people || []).filter(function (person) {
        return person.groupId === group.id && person.role !== "head";
      });
      if (!members.length) return;
      body += '<h2 class="group-title">' + esc(group.name) + "</h2>";
      members.forEach(function (person) {
        body += personButton(person, group.name);
      });
    });
    const heads = (config.people || []).filter(L.isHead);
    if (heads.length) {
      body += '<h2 class="group-title">رئيس القسم</h2>';
      heads.forEach(function (person) {
        body += personButton(person, "رئيس القسم");
      });
    }
    if (!body) body = '<div class="card empty">لسه مفيش أسماء. ضيفها من الإعدادات.</div>';
    return topbar("اختار اسمك") + localBanner() + body;
  }

  function personButton(person, label) {
    return (
      '<button class="person-btn" data-action="pick-person" data-id="' + esc(person.id) + '">' +
        "<strong>" + esc(person.name) + "</strong><span>" + esc(label) + "</span>" +
      "</button>"
    );
  }

  function renderToday() {
    const person = viewer();
    const state = L.analyzeDay(config, viewedKey());
    const rows = L.rowsFor(config, state, person.id);
    const banner = bannerFor(state, person);
    const isToday = viewedKey() === L.dateKey(startOfToday());
    const normal = rows.filter(function (row) { return row.tone === "normal"; });
    const gray = rows.filter(function (row) { return row.tone === "gray"; });
    const left = normal.filter(function (row) { return !checks[row.person.id]; }).length;

    let chips = state.present.filter(function (item) {
      return !L.isHead(item);
    }).map(function (item) {
      return '<span class="chip">' + esc(item.name) + "</span>";
    }).join("");
    Object.keys(config.exceptions[state.key] || {}).forEach(function (id) {
      const away = L.personById(config, id);
      if (!away || L.isHead(away)) return;
      const kind = config.exceptions[state.key][id] === "evening" ? "مسائي" : "غياب";
      chips += '<span class="chip away">' + esc(away.name) + " · " + kind + "</span>";
    });

    let list = "";
    if (!rows.length) {
      list = '<div class="card empty">مفيش أسماء تانية في الفريق.</div>';
    } else if (!state.signers.length) {
      list = '<h2 class="section-label">الفريق</h2>' + rows.map(rowHtml).join("");
    } else {
      list += '<h2 class="section-label">تمضي لهم</h2>';
      list += normal.length
        ? normal.map(rowHtml).join("") + '<p class="sub">فاضل ' + left + " من " + normal.length + "</p>"
        : '<div class="card empty">مفيش حصة متوزعة عليك اليوم ده.</div>';
      list += '<h2 class="section-label">باقي الفريق</h2>';
      list += gray.length ? gray.map(rowHtml).join("") : '<div class="card empty">مفيش أسماء زيادة.</div>';
    }

    return (
      topbar(person.name, null, true) +
      localBanner() +
      '<div class="date-bar">' +
        '<button class="icon-btn" data-action="prev-day" aria-label="اليوم السابق">›</button>' +
        '<div><strong>' + esc(L.formatLong(viewedDate())) + "</strong>" +
          (isToday ? "" : '<button class="today-link" data-action="go-today">النهاردة</button>') +
        "</div>" +
        '<button class="icon-btn" data-action="next-day" aria-label="اليوم التالي">‹</button>' +
      "</div>" +
      (banner ? '<div class="banner ' + banner.kind + '">' + esc(banner.text) + "</div>" : "") +
      '<div class="card"><strong>النازلين</strong><div class="chips">' + (chips || '<span class="chip">مفيش</span>') + "</div></div>" +
      list +
      '<p class="sub">اللون العادي حصتك. الرمادي باقي الفريق، وتقدر تعلّم عليه برضو. العلامة تظهر عند الكل.</p>' +
      '<button class="primary" data-action="open-away">مسائي أو غياب</button>' +
      modalHtml(state)
    );
  }

  function rowHtml(row) {
    const mark = checks[row.person.id];
    const signer = mark ? L.personById(config, mark.by) : null;
    const meta = [row.tag, mark ? ("مضى " + (signer ? signer.name : "حد")) : ""].filter(Boolean).join(" · ");
    return (
      '<button class="row ' + row.tone + (mark ? " is-checked" : "") + '" data-action="toggle-check" data-id="' + esc(row.person.id) + '" aria-pressed="' + (mark ? "true" : "false") + '">' +
        '<span class="box" aria-hidden="true"></span>' +
        '<span class="row-text"><span class="row-name">' + esc(row.person.name) + "</span>" +
          (meta ? '<span class="row-meta' + (mark ? " signed" : "") + '">' + esc(meta) + "</span>" : "") +
        "</span>" +
      "</button>"
    );
  }

  function renderSettings() {
    const warnings = L.scheduleWarnings(config);
    const people = (config.people || []).slice().sort(function (a, b) {
      return L.comparePeople(config, a, b);
    });
    return (
      topbar("الإعدادات", "close-settings") +
      localBanner() +
      '<section class="card"><h2 class="settings-title">المجموعات</h2>' +
        config.groups.map(function (group) {
          const used = (config.people || []).some(function (person) { return person.groupId === group.id; });
          return (
            '<div class="inline" style="margin-bottom:8px">' +
              '<input class="text-input" data-action="rename-group" data-id="' + esc(group.id) + '" value="' + esc(group.name) + '">' +
              (used ? "" : '<button class="danger" data-action="delete-group" data-id="' + esc(group.id) + '">حذف</button>') +
            "</div>"
          );
        }).join("") +
        '<button class="choice" data-action="add-group">إضافة مجموعة</button>' +
      "</section>" +
      '<section class="card"><h2 class="settings-title">الأسماء</h2>' +
        people.map(personEditor).join("") +
        '<input class="text-input" id="new-person-name" placeholder="اسم جديد" value="' + esc(draft.personName) + '">' +
        '<div class="inline" style="margin-top:8px">' +
          '<select class="select" id="new-person-group">' + groupOptions(draft.personGroup) + "</select>" +
          '<button class="primary" data-action="add-person">إضافة</button>' +
        "</div>" +
      "</section>" +
      '<section class="card"><h2 class="settings-title">جدول الأسبوع</h2>' +
        '<p class="sub">كل خانة تفتح وتقفل يوم نزول. الجدول يتكرر كل أسبوع.</p>' +
        rosterTable(people) +
        (warnings.length
          ? '<ul class="warn-list">' + warnings.map(function (item) { return "<li>" + esc(item) + "</li>"; }).join("") + "</ul>"
          : '<p class="sub">الجدول متظبط: كل شخص 3 أيام، ومفيش مجموعة نازل منها أكتر من واحد في نفس اليوم.</p>') +
      "</section>" +
      '<section class="card"><h2 class="settings-title">الإجازات</h2>' +
        '<div class="stack">' +
          '<select class="select" id="vac-person">' +
            '<option value="">اختار الشخص</option>' +
            (config.people || []).map(function (person) {
              return '<option value="' + esc(person.id) + '"' + (draft.vacPerson === person.id ? " selected" : "") + ">" + esc(person.name) + "</option>";
            }).join("") +
          "</select>" +
          '<input class="field" id="vac-start" type="date" value="' + esc(draft.vacStart) + '">' +
          '<input class="field" id="vac-days" type="number" min="1" inputmode="numeric" value="' + esc(draft.vacDays) + '" placeholder="عدد الأيام">' +
          '<button class="primary" data-action="add-vacation">تسجيل الإجازة</button>' +
        "</div>" +
        vacationList() +
      "</section>" +
      '<section class="card"><h2 class="settings-title">غياب أو مسائي</h2>' +
        exceptionList() +
      "</section>"
    );
  }

  function groupOptions(selected) {
    let html = (config.groups || []).map(function (group) {
      return '<option value="' + esc(group.id) + '"' + (selected === group.id ? " selected" : "") + ">" + esc(group.name) + "</option>";
    }).join("");
    html += '<option value="head"' + (selected === "head" ? " selected" : "") + ">رئيس القسم</option>";
    return html;
  }

  function personEditor(person) {
    const selected = person.role === "head" ? "head" : person.groupId;
    return (
      '<div class="person-card">' +
        '<input class="text-input" data-action="rename-person" data-id="' + esc(person.id) + '" value="' + esc(person.name) + '">' +
        '<div class="inline">' +
          '<select class="select" data-action="person-role" data-id="' + esc(person.id) + '">' + groupOptions(selected) + "</select>" +
          '<button class="danger" data-action="delete-person" data-id="' + esc(person.id) + '">حذف</button>' +
        "</div>" +
      "</div>"
    );
  }

  function rosterTable(people) {
    const head = "<tr><th></th>" + L.WEEKDAYS.map(function (day) {
      return "<th>" + day.label + "</th>";
    }).join("") + "</tr>";
    const body = people.map(function (person) {
      const cells = L.WEEKDAYS.map(function (day) {
        const on = (person.dutyDays || []).includes(day.js);
        return '<td><button class="cell' + (on ? " on" : "") + '" data-action="toggle-duty" data-id="' + esc(person.id) + '" data-day="' + day.js + '" aria-label="' + esc(person.name + " " + day.label) + '"></button></td>';
      }).join("");
      return '<tr><th class="name">' + esc(person.name) + "</th>" + cells + "</tr>";
    }).join("");
    return '<div class="grid-scroll"><table class="roster"><thead>' + head + "</thead><tbody>" + body + "</tbody></table></div>";
  }

  function vacationList() {
    if (!config.vacations.length) return '<p class="sub">مفيش إجازات متسجلة.</p>';
    return config.vacations.map(function (vacation) {
      const person = L.personById(config, vacation.personId);
      const start = L.parseKey(vacation.start);
      const last = L.addDays(start, (Number(vacation.days) || 1) - 1);
      return (
        '<div class="vac-card"><strong>' + esc(person ? person.name : "شخص محذوف") + "</strong>" +
          '<p class="sub">من ' + esc(L.formatLong(start)) + " إلى " + esc(L.formatLong(last)) + " (" + daysLabel(vacation.days) + ")</p>" +
          '<button class="danger" data-action="delete-vacation" data-id="' + esc(vacation.id) + '">إلغاء الإجازة</button></div>'
      );
    }).join("");
  }

  function exceptionList() {
    const items = [];
    Object.keys(config.exceptions || {}).sort().forEach(function (key) {
      const day = config.exceptions[key] || {};
      Object.keys(day).forEach(function (personId) {
        const person = L.personById(config, personId);
        items.push({ key: key, personId: personId, person: person, kind: day[personId] });
      });
    });
    if (!items.length) return '<p class="sub">مفيش غياب أو مسائي متسجل. يتسجل من صفحة اليوم.</p>';
    return items.map(function (item) {
      const kind = item.kind === "evening" ? "مسائي" : "مش موجود";
      return (
        '<div class="vac-card"><strong>' + esc(item.person ? item.person.name : "شخص محذوف") + "</strong>" +
          '<p class="sub">' + esc(L.formatLong(L.parseKey(item.key))) + " · " + kind + "</p>" +
          '<button class="danger" data-action="delete-exception" data-date="' + esc(item.key) + '" data-id="' + esc(item.personId) + '">إلغاء</button></div>'
      );
    }).join("");
  }

  function modalHtml(state) {
    if (!modal || modal.type !== "away") return "";
    const people = L.scheduledPeople(config, state);
    let body = "";
    if (!people.length) body = '<p>مفيش حد متسجل نزوله اليوم ده.</p>';
    people.forEach(function (person) {
      const exception = L.exceptionOn(config, person.id, state.key);
      body += '<div class="away-person"><strong>' + esc(person.name) + "</strong>";
      if (exception) {
        body += '<button class="choice" data-action="clear-away" data-id="' + esc(person.id) + '">إلغاء ' + (exception === "evening" ? "المسائي" : "الغياب") + "</button>";
      } else {
        body += '<div class="inline">' +
          '<button class="choice" data-action="set-away" data-id="' + esc(person.id) + '" data-kind="evening">مسائي</button>' +
          '<button class="choice" data-action="set-away" data-id="' + esc(person.id) + '" data-kind="absent">مش موجود</button>' +
        "</div>";
      }
      body += "</div>";
    });
    return (
      '<div class="modal-back">' +
        '<div class="modal" role="dialog" aria-modal="true">' +
          "<h3>مسائي أو غياب</h3>" +
          "<p>حصته هتتوزع على النازلين من المجموعات التانية، واسمه نفسه هيحتاج حد يمضيله.</p>" +
          body +
          '<button class="ghost" data-action="close-modal">إغلاق</button>' +
        "</div>" +
      "</div>"
    );
  }

  function readDraft() {
    const name = document.getElementById("new-person-name");
    const group = document.getElementById("new-person-group");
    const vacPerson = document.getElementById("vac-person");
    const vacStart = document.getElementById("vac-start");
    const vacDays = document.getElementById("vac-days");
    if (name) draft.personName = name.value;
    if (group) draft.personGroup = group.value;
    if (vacPerson) draft.vacPerson = vacPerson.value;
    if (vacStart) draft.vacStart = vacStart.value;
    if (vacDays) draft.vacDays = vacDays.value;
  }

  async function onClick(event) {
    const backdrop = event.target.classList && event.target.classList.contains("modal-back");
    if (backdrop) {
      modal = null;
      render();
      return;
    }
    const button = event.target.closest("[data-action]");
    if (!button || writing) return;
    const action = button.dataset.action;
    try {
      if (action === "pick-person") {
        viewerId = button.dataset.id;
        localStorage.setItem(VIEWER_KEY, viewerId);
        screen = "today";
        render();
      } else if (action === "switch-user") {
        viewerId = "";
        localStorage.removeItem(VIEWER_KEY);
        screen = "pick";
        render();
      } else if (action === "open-settings") {
        screen = "settings";
        render();
      } else if (action === "close-settings") {
        screen = viewerId ? "today" : "pick";
        render();
      } else if (action === "prev-day" || action === "next-day" || action === "go-today") {
        if (action === "go-today") cursor = startOfToday();
        else {
          cursor = L.addDays(cursor, action === "next-day" ? 1 : -1);
        }
        modal = null;
        ensureDayWatch();
        render();
      } else if (action === "open-away") {
        modal = { type: "away" };
        render();
      } else if (action === "close-modal") {
        modal = null;
        render();
      } else if (action === "toggle-check") {
        writing = true;
        await store.toggleCheck(viewedKey(), button.dataset.id, viewerId);
      } else if (action === "set-away" || action === "clear-away") {
        const personId = button.dataset.id;
        const kind = button.dataset.kind;
        const key = viewedKey();
        writing = true;
        await store.updateConfig(function (cfg) {
          cfg.exceptions = cfg.exceptions || {};
          cfg.exceptions[key] = Object.assign({}, cfg.exceptions[key] || {});
          if (action === "clear-away") delete cfg.exceptions[key][personId];
          else cfg.exceptions[key][personId] = kind;
          if (!Object.keys(cfg.exceptions[key]).length) delete cfg.exceptions[key];
          return cfg;
        });
      } else if (action === "add-group") {
        writing = true;
        await store.updateConfig(function (cfg) {
          cfg.groups.push({ id: "g" + Date.now().toString(36), name: "مجموعة جديدة" });
          return cfg;
        });
      } else if (action === "delete-group") {
        const id = button.dataset.id;
        writing = true;
        await store.updateConfig(function (cfg) {
          cfg.groups = cfg.groups.filter(function (group) { return group.id !== id; });
          return cfg;
        });
      } else if (action === "add-person") {
        readDraft();
        const name = draft.personName.trim();
        if (!name) return toast("اكتب الاسم");
        const groupValue = draft.personGroup;
        draft.personName = "";
        writing = true;
        await store.updateConfig(function (cfg) {
          const person = {
            id: "p" + Date.now().toString(36),
            name: name,
            groupId: groupValue === "head" ? null : groupValue,
            role: groupValue === "head" ? "head" : "member",
            dutyDays: [],
          };
          if (person.role === "head") demoteHeads(cfg, person.id, cfg.groups[0] ? cfg.groups[0].id : null);
          cfg.people.push(person);
          return cfg;
        });
      } else if (action === "delete-person") {
        const id = button.dataset.id;
        writing = true;
        await store.updateConfig(function (cfg) {
          cfg.people = cfg.people.filter(function (person) { return person.id !== id; });
          cfg.vacations = cfg.vacations.filter(function (vacation) { return vacation.personId !== id; });
          Object.keys(cfg.exceptions || {}).forEach(function (key) {
            if (cfg.exceptions[key]) delete cfg.exceptions[key][id];
            if (cfg.exceptions[key] && !Object.keys(cfg.exceptions[key]).length) delete cfg.exceptions[key];
          });
          return cfg;
        });
      } else if (action === "toggle-duty") {
        const id = button.dataset.id;
        const day = Number(button.dataset.day);
        writing = true;
        await store.updateConfig(function (cfg) {
          const person = cfg.people.find(function (item) { return item.id === id; });
          if (!person) return cfg;
          const days = person.dutyDays || [];
          person.dutyDays = days.includes(day) ? days.filter(function (item) { return item !== day; }) : days.concat(day);
          person.dutyDays.sort(function (a, b) { return a - b; });
          return cfg;
        });
      } else if (action === "add-vacation") {
        readDraft();
        const personId = draft.vacPerson;
        const start = draft.vacStart;
        const days = Number(draft.vacDays);
        if (!personId) return toast("اختار الشخص");
        if (!start) return toast("اختار تاريخ البداية");
        if (!days || days < 1) return toast("اكتب عدد الأيام");
        draft.vacPerson = "";
        draft.vacDays = "1";
        writing = true;
        await store.updateConfig(function (cfg) {
          cfg.vacations.push({
            id: "v" + Date.now().toString(36),
            personId: personId,
            start: start,
            days: days,
          });
          return cfg;
        });
      } else if (action === "delete-vacation") {
        const id = button.dataset.id;
        writing = true;
        await store.updateConfig(function (cfg) {
          cfg.vacations = cfg.vacations.filter(function (vacation) { return vacation.id !== id; });
          return cfg;
        });
      } else if (action === "delete-exception") {
        const key = button.dataset.date;
        const personId = button.dataset.id;
        writing = true;
        await store.updateConfig(function (cfg) {
          if (cfg.exceptions && cfg.exceptions[key]) {
            delete cfg.exceptions[key][personId];
            if (!Object.keys(cfg.exceptions[key]).length) delete cfg.exceptions[key];
          }
          return cfg;
        });
      }
    } catch (error) {
      toast("حصل خطأ، حاول تاني");
      console.error(error);
    } finally {
      writing = false;
      if (store.mode === "firebase") render();
    }
  }

  function onChange(event) {
    const select = event.target.closest("[data-action='person-role']");
    if (!select) return;
    const id = select.dataset.id;
    const value = select.value;
    store.updateConfig(function (cfg) {
      const person = cfg.people.find(function (item) { return item.id === id; });
      if (!person) return cfg;
      if (value === "head") {
        const fallback = person.groupId || (cfg.groups[0] ? cfg.groups[0].id : null);
        demoteHeads(cfg, person.id, fallback);
        person.role = "head";
        person.groupId = null;
      } else {
        person.role = "member";
        person.groupId = value;
      }
      return cfg;
    }).catch(function () { toast("حصل خطأ، حاول تاني"); });
  }

  function onBlur(event) {
    const input = event.target;
    if (!input.dataset) return;
    if (input.dataset.action === "rename-person") {
      const name = input.value.trim();
      const id = input.dataset.id;
      const current = L.personById(config, id);
      if (!current || !name || name === current.name) return;
      store.updateConfig(function (cfg) {
        const person = cfg.people.find(function (item) { return item.id === id; });
        if (person) person.name = name;
        return cfg;
      }).catch(function () { toast("حصل خطأ، حاول تاني"); });
    }
    if (input.dataset.action === "rename-group") {
      const name = input.value.trim();
      const id = input.dataset.id;
      const current = (config.groups || []).find(function (group) { return group.id === id; });
      if (!current || !name || name === current.name) return;
      store.updateConfig(function (cfg) {
        const group = cfg.groups.find(function (item) { return item.id === id; });
        if (group) group.name = name;
        return cfg;
      }).catch(function () { toast("حصل خطأ، حاول تاني"); });
    }
  }

  function onInput(event) {
    const id = event.target.id;
    if (id === "new-person-name") draft.personName = event.target.value;
    if (id === "new-person-group") draft.personGroup = event.target.value;
    if (id === "vac-person") draft.vacPerson = event.target.value;
    if (id === "vac-start") draft.vacStart = event.target.value;
    if (id === "vac-days") draft.vacDays = event.target.value;
  }

  function demoteHeads(cfg, keepId, fallbackGroup) {
    cfg.people.forEach(function (person) {
      if (person.id !== keepId && person.role === "head") {
        person.role = "member";
        person.groupId = fallbackGroup;
      }
    });
  }

  function canUseFirebase() {
    const cfg = window.FIREBASE_CONFIG;
    if (typeof firebase === "undefined" || !firebase.database || !cfg || !cfg.apiKey || !cfg.databaseURL) return false;
    const key = String(cfg.apiKey);
    const url = String(cfg.databaseURL);
    return key.indexOf("YOUR_") === -1 && url.indexOf("YOUR_") === -1;
  }

  function createStore() {
    const listeners = new Set();
    let mode = "local";
    let problem = "";
    let db = null;
    let queue = Promise.resolve();
    const localDays = {};

    function emit(next) {
      config = L.normalize(next);
      listeners.forEach(function (cb) { cb(config); });
    }

    function loadLocal() {
      try {
        const raw = localStorage.getItem("sign-config");
        if (raw) return L.normalize(JSON.parse(raw));
      } catch (error) {
        console.error(error);
      }
      const fresh = L.defaultConfig();
      localStorage.setItem("sign-config", JSON.stringify(fresh));
      return fresh;
    }

    function loadDay(key) {
      if (localDays[key]) return localDays[key];
      try {
        const raw = localStorage.getItem("sign-day-" + key);
        localDays[key] = raw ? JSON.parse(raw) : {};
      } catch (error) {
        localDays[key] = {};
      }
      return localDays[key];
    }

    function enqueue(job) {
      queue = queue.then(job, job);
      return queue;
    }

    async function init() {
      if (!canUseFirebase()) {
        mode = "local";
        return;
      }
      try {
        if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
        db = firebase.database();
        const ref = db.ref("config/main");
        await ref.transaction(function (current) {
          if (current) return;
          return L.defaultConfig();
        });
        mode = "firebase";
        await new Promise(function (resolve, reject) {
          let settled = false;
          ref.on("value", function (snap) {
            const value = snap.val();
            emit(value ? value : L.defaultConfig());
            if (!settled) {
              settled = true;
              resolve();
            }
          }, function (error) {
            console.error(error);
            if (!settled) {
              mode = "local";
              problem = "متقدرش توصل لـ Firebase. البيانات على الموبايل ده بس.";
              reject(error);
            }
          });
        });
      } catch (error) {
        console.error(error);
        mode = "local";
        if (!problem) problem = "متقدرش توصل لـ Firebase. البيانات على الموبايل ده بس.";
      }
    }

    function subscribeConfig(cb) {
      listeners.add(cb);
      cb(mode === "firebase" ? config : loadLocal());
      return function () { listeners.delete(cb); };
    }

    function subscribeDay(key, cb) {
      if (mode === "firebase" && db) {
        const ref = db.ref("days/" + key + "/checks");
        const onValue = function (snap) {
          cb(snap.val() || {});
        };
        ref.on("value", onValue, function (error) {
          console.error(error);
          cb(loadDay(key));
        });
        return function () { ref.off("value", onValue); };
      }
      cb(loadDay(key));
      return function () {};
    }

    function updateConfig(mutator) {
      return enqueue(async function () {
        if (mode === "firebase" && db) {
          const ref = db.ref("config/main");
          await ref.transaction(function (current) {
            const base = L.normalize(current || L.defaultConfig());
            return mutator(JSON.parse(JSON.stringify(base)));
          });
          return;
        }
        const next = mutator(JSON.parse(JSON.stringify(loadLocal())));
        localStorage.setItem("sign-config", JSON.stringify(next));
        emit(next);
      });
    }

    function toggleCheck(key, targetId, by) {
      return enqueue(async function () {
        if (mode === "firebase" && db) {
          const ref = db.ref("days/" + key + "/checks");
          await ref.transaction(function (current) {
            const next = Object.assign({}, current || {});
            if (next[targetId]) delete next[targetId];
            else next[targetId] = { by: by, at: new Date().toISOString() };
            return next;
          });
          return;
        }
        const current = Object.assign({}, loadDay(key));
        if (current[targetId]) delete current[targetId];
        else current[targetId] = { by: by, at: new Date().toISOString() };
        localDays[key] = current;
        localStorage.setItem("sign-day-" + key, JSON.stringify(current));
        if (key === watchedKey) {
          checks = current;
          render();
        }
      });
    }

    return {
      init: init,
      subscribeConfig: subscribeConfig,
      subscribeDay: subscribeDay,
      updateConfig: updateConfig,
      toggleCheck: toggleCheck,
      get mode() { return mode; },
      get problem() { return problem; },
    };
  }

})();
