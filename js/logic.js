(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SignLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const WEEKDAYS = [
    { js: 6, label: "السبت" },
    { js: 0, label: "الأحد" },
    { js: 1, label: "الاثنين" },
    { js: 2, label: "الثلاثاء" },
    { js: 3, label: "الأربعاء" },
    { js: 4, label: "الخميس" },
    { js: 5, label: "الجمعة" },
  ];

  function defaultConfig() {
    return {
      groups: [
        { id: "g1", name: "المجموعة الأولى" },
        { id: "g2", name: "المجموعة الثانية" },
        { id: "g3", name: "المجموعة الثالثة" },
      ],
      people: [
        { id: "islam", name: "د اسلام", groupId: "g1", role: "member", dutyDays: [6, 0, 4] },
        { id: "abdelrahman", name: "د عبد الرحمن", groupId: "g1", role: "member", dutyDays: [1, 2, 3] },
        { id: "samaa", name: "د سماء", groupId: "g2", role: "member", dutyDays: [6, 3, 4] },
        { id: "radwa", name: "د رضوي", groupId: "g2", role: "member", dutyDays: [0, 1, 2] },
        { id: "nada", name: "د ندى", groupId: "g3", role: "member", dutyDays: [0, 1, 4] },
        { id: "alaa", name: "د آلاء", groupId: "g3", role: "member", dutyDays: [6, 2, 3] },
        { id: "abanoub", name: "د أبانوب", groupId: null, role: "head", dutyDays: [0, 2, 4] },
      ],
      vacations: [],
      exceptions: {},
    };
  }

  function normalize(config) {
    const cfg = config || defaultConfig();
    cfg.groups = Array.isArray(cfg.groups) ? cfg.groups : [];
    cfg.people = Array.isArray(cfg.people) ? cfg.people : [];
    cfg.vacations = Array.isArray(cfg.vacations) ? cfg.vacations : [];
    cfg.exceptions = cfg.exceptions && typeof cfg.exceptions === "object" ? cfg.exceptions : {};
    cfg.people.forEach(function (person) {
      person.dutyDays = Array.isArray(person.dutyDays) ? person.dutyDays.map(Number) : [];
      person.role = person.role === "head" ? "head" : "member";
      if (person.role === "head") person.groupId = null;
    });
    return cfg;
  }

  function dateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function parseKey(key) {
    const parts = String(key).split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function addDays(date, n) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    next.setDate(next.getDate() + n);
    return next;
  }

  function coerceKey(date) {
    return typeof date === "string" ? date : dateKey(date);
  }

  function hashString(value) {
    let h = 2166136261;
    const text = String(value);
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function isHead(person) {
    return !!person && person.role === "head";
  }

  function vacationOn(config, personId, key) {
    return (config.vacations || []).some(function (vacation) {
      if (vacation.personId !== personId) return false;
      const start = parseKey(vacation.start);
      const target = parseKey(key);
      const end = addDays(start, Number(vacation.days) || 0);
      return target >= start && target < end;
    });
  }

  function exceptionOn(config, personId, key) {
    const day = (config.exceptions || {})[key] || {};
    return day[personId] || null;
  }

  function groupIndex(config, groupId) {
    const index = (config.groups || []).findIndex(function (group) {
      return group.id === groupId;
    });
    return index === -1 ? 999 : index;
  }

  function comparePeople(config, a, b) {
    const groupOrder = groupIndex(config, a.groupId) - groupIndex(config, b.groupId);
    if (groupOrder !== 0) return groupOrder;
    return String(a.name).localeCompare(String(b.name), "ar");
  }

  function personById(config, id) {
    return (config.people || []).find(function (person) {
      return person.id === id;
    }) || null;
  }

  function weekdayLabel(jsDay) {
    const found = WEEKDAYS.find(function (day) {
      return day.js === jsDay;
    });
    return found ? found.label : "";
  }

  function formatLong(date) {
    return date.toLocaleDateString("ar-EG", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function analyzeDay(config, date) {
    const key = coerceKey(date);
    const jsDay = parseKey(key).getDay();
    const people = config.people || [];
    const present = people.filter(function (person) {
      const scheduled = (person.dutyDays || []).includes(jsDay);
      const away = vacationOn(config, person.id, key) || exceptionOn(config, person.id, key);
      return scheduled && !away;
    }).sort(function (a, b) {
      return comparePeople(config, a, b);
    });
    const presentIds = {};
    present.forEach(function (person) {
      presentIds[person.id] = true;
    });
    const signers = present.filter(function (person) {
      return !isHead(person);
    });
    const needs = people.filter(function (person) {
      return !presentIds[person.id];
    }).sort(function (a, b) {
      return comparePeople(config, a, b);
    });

    const assignments = {};
    signers.forEach(function (signer) {
      assignments[signer.id] = [];
    });
    const assignedTo = {};

    function assign(signer, person) {
      if (!signer || assignedTo[person.id]) return;
      assignments[signer.id].push(person.id);
      assignedTo[person.id] = signer.id;
    }

    if (signers.length) {
      signers.forEach(function (signer) {
        needs.forEach(function (person) {
          if (person.groupId && person.groupId === signer.groupId) assign(signer, person);
        });
      });
      const start = hashString(key) % signers.length;
      needs.forEach(function (person) {
        if (assignedTo[person.id]) return;
        let best = null;
        let bestCount = Infinity;
        for (let i = 0; i < signers.length; i++) {
          const signer = signers[(start + i) % signers.length];
          const count = assignments[signer.id].length;
          if (count < bestCount) {
            best = signer;
            bestCount = count;
          }
        }
        assign(best, person);
      });
    }

    return {
      key: key,
      jsDay: jsDay,
      present: present,
      presentIds: presentIds,
      signers: signers,
      needs: needs,
      assignments: assignments,
      assignedTo: assignedTo,
    };
  }

  function rowsFor(config, state, viewerId) {
    const mine = {};
    (state.assignments[viewerId] || []).forEach(function (id) {
      mine[id] = true;
    });
    const noSigners = state.signers.length === 0;
    const rows = [];
    (config.people || []).forEach(function (person) {
      if (person.id === viewerId) return;
      const owner = state.assignedTo[person.id] ? personById(config, state.assignedTo[person.id]) : null;
      const bits = [];
      if (state.presentIds[person.id]) bits.push("مناوب");
      else if (vacationOn(config, person.id, state.key)) bits.push("إجازة");
      else if (exceptionOn(config, person.id, state.key) === "evening") bits.push("مسائي");
      else if (exceptionOn(config, person.id, state.key) === "absent") bits.push("غياب");
      if (owner && owner.id !== viewerId) bits.push("عند " + owner.name);
      rows.push({
        person: person,
        tone: noSigners || mine[person.id] ? "normal" : "gray",
        tag: bits.join(" · "),
      });
    });
    rows.sort(function (a, b) {
      if (a.tone !== b.tone) return a.tone === "normal" ? -1 : 1;
      return comparePeople(config, a.person, b.person);
    });
    return rows;
  }

  function scheduleWarnings(config) {
    const warnings = [];
    (config.people || []).forEach(function (person) {
      const count = (person.dutyDays || []).length;
      if (count !== 3) warnings.push(person.name + ": " + count + " أيام في الأسبوع، والمعتاد 3");
    });
    (config.groups || []).forEach(function (group) {
      WEEKDAYS.forEach(function (day) {
        const names = (config.people || []).filter(function (person) {
          return person.groupId === group.id && !isHead(person) && (person.dutyDays || []).includes(day.js);
        });
        if (names.length > 1) {
          warnings.push(group.name + " / " + day.label + ": نازل " + names.length + " (" + names.map(function (person) {
            return person.name;
          }).join("، ") + ")");
        }
      });
    });
    return warnings;
  }

  function scheduledPeople(config, state) {
    const jsDay = state.jsDay;
    return (config.people || []).filter(function (person) {
      return (person.dutyDays || []).includes(jsDay) && !vacationOn(config, person.id, state.key);
    }).sort(function (a, b) {
      return comparePeople(config, a, b);
    });
  }

  return {
    WEEKDAYS: WEEKDAYS,
    defaultConfig: defaultConfig,
    normalize: normalize,
    dateKey: dateKey,
    parseKey: parseKey,
    addDays: addDays,
    analyzeDay: analyzeDay,
    rowsFor: rowsFor,
    scheduleWarnings: scheduleWarnings,
    scheduledPeople: scheduledPeople,
    weekdayLabel: weekdayLabel,
    formatLong: formatLong,
    vacationOn: vacationOn,
    exceptionOn: exceptionOn,
    personById: personById,
    isHead: isHead,
    comparePeople: comparePeople,
  };
});
