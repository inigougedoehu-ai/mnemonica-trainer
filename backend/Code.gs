/**
 * Backend de Mnemónica Trainer para Google Apps Script.
 *
 * 1. Sustituye el texto de FIRST_RUN_API_SECRET por el código que te daremos.
 * 2. Ejecuta setupDatabase una sola vez desde el editor de Apps Script.
 * 3. Despliega como aplicación web: ejecutar como tú y acceso para cualquiera.
 */

const SPREADSHEET_ID = "1TBp4T0TSiqSuX3Q4wg5bsXtCrJcZfDaIO0PdWbcnQyw";
const FIRST_RUN_API_SECRET = "PEGA_AQUI_EL_CODIGO_SECRETO";
const STACK_ID = "mnemonica";

const MNEMONICA = [
  "4C", "2H", "7D", "3C", "4H", "6D", "AS", "5H", "9S", "2S",
  "QH", "3D", "QC", "8H", "6S", "5S", "9H", "KC", "2D", "JH",
  "3S", "8S", "6H", "10C", "5D", "KD", "2C", "3H", "8D", "5C",
  "KS", "JD", "8C", "10S", "KH", "JC", "7S", "10H", "AD", "4S",
  "7H", "4D", "AC", "9C", "JS", "QD", "7C", "QS", "10D", "6C",
  "AH", "9D",
];

const SHEETS = {
  Config: ["key", "value"],
  Stacks: ["stack_id", "position", "card_code", "label", "active"],
  Users: ["user_id", "email", "name", "created_at", "last_seen_at"],
  Settings: ["user_id", "stack_id", "range_start", "range_end", "mode", "answer_style", "updated_at"],
  Sessions: [
    "session_id", "user_id", "stack_id", "started_at", "ended_at", "mode",
    "answer_style", "range_start", "range_end", "total_questions",
    "correct_questions", "average_time_ms", "client_version",
  ],
  Answers: [
    "answer_id", "session_id", "user_id", "stack_id", "answered_at", "mode",
    "card_position", "card_code", "correct", "response_time_ms", "range_start",
    "range_end", "answer_style",
  ],
};

function setupDatabase() {
  if (!FIRST_RUN_API_SECRET || FIRST_RUN_API_SECRET === "PEGA_AQUI_EL_CODIGO_SECRETO") {
    throw new Error("Sustituye FIRST_RUN_API_SECRET antes de ejecutar setupDatabase.");
  }

  PropertiesService.getScriptProperties().setProperty("API_SECRET", FIRST_RUN_API_SECRET);
  const book = SpreadsheetApp.openById(SPREADSHEET_ID);

  Object.keys(SHEETS).forEach(function (name) {
    ensureSheet_(book, name, SHEETS[name]);
  });

  seedConfig_(book);
  seedStack_(book);
  SpreadsheetApp.flush();
  return "Base de datos preparada correctamente";
}

function doGet(event) {
  try {
    const params = (event && event.parameter) || {};
    if (!params.action) {
      return respond_({ ok: true, app: "mnemonica-trainer", version: "1.3.0" }, params.callback);
    }

    verifySecret_(params.secret);
    const user = normalizeUser_({ email: params.email, name: params.name });

    if (params.action === "get_progress") {
      touchUser_(user);
      return respond_({ ok: true, progress: getProgress_(user.email) }, params.callback);
    }

    if (params.action === "has_session") {
      return respond_({ ok: true, exists: sessionExists_(user.email, params.session_id) }, params.callback);
    }

    return respond_({ ok: false, error: "Acción no reconocida" }, params.callback);
  } catch (error) {
    const callback = event && event.parameter && event.parameter.callback;
    return respond_({ ok: false, error: String(error && error.message ? error.message : error) }, callback);
  }
}

function doPost(event) {
  try {
    const body = JSON.parse((event && event.postData && event.postData.contents) || "{}");
    verifySecret_(body.secret);
    const user = normalizeUser_(body.user);

    if (body.action === "get_progress") {
      touchUser_(user);
      return json_({ ok: true, progress: getProgress_(user.email) });
    }

    if (body.action === "save_session") {
      const result = saveSession_(user, body.payload || {});
      return json_({ ok: true, result: result, progress: getProgress_(user.email) });
    }

    return json_({ ok: false, error: "Acción no reconocida" });
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function saveSession_(user, payload) {
  const session = payload.session || {};
  const answers = Array.isArray(payload.answers) ? payload.answers : [];
  if (!session.session_id || !answers.length) throw new Error("La sesión está incompleta");

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const book = SpreadsheetApp.openById(SPREADSHEET_ID);
    const userId = userId_(user.email);
    upsertUser_(book, userId, user);

    const sessionsSheet = book.getSheetByName("Sessions");
    if (!rowExists_(sessionsSheet, 1, session.session_id)) {
      sessionsSheet.appendRow([
        clean_(session.session_id), userId, STACK_ID, clean_(session.started_at),
        clean_(session.ended_at), clean_(session.mode), clean_(session.answer_style),
        number_(session.range_start, 1), number_(session.range_end, 52),
        number_(session.total_questions, answers.length), number_(session.correct_questions, 0),
        number_(session.average_time_ms, 0), clean_(session.client_version || "web-1"),
      ]);
    }

    const answersSheet = book.getSheetByName("Answers");
    const existingAnswerIds = new Set(columnValues_(answersSheet, 1));
    const rows = answers
      .filter(function (answer) { return answer.answer_id && !existingAnswerIds.has(answer.answer_id); })
      .map(function (answer) {
        return [
          clean_(answer.answer_id), clean_(session.session_id), userId, STACK_ID,
          clean_(answer.answered_at), clean_(answer.mode), number_(answer.card_position, 0),
          clean_(answer.card_code), answer.correct === true, number_(answer.response_time_ms, 0),
          number_(answer.range_start, 1), number_(answer.range_end, 52), clean_(answer.answer_style),
        ];
      });

    if (rows.length) {
      answersSheet.getRange(answersSheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }

    upsertSettings_(book, userId, payload.settings || session);
    SpreadsheetApp.flush();
    return { saved_answers: rows.length };
  } finally {
    lock.releaseLock();
  }
}

function sessionExists_(email, sessionId) {
  if (!sessionId) return false;
  const book = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = book.getSheetByName("Sessions");
  if (!sheet || sheet.getLastRow() <= 1) return false;
  const userId = userId_(email);
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  return values.some(function (row) {
    return String(row[0]) === String(sessionId) && String(row[1]) === userId;
  });
}

function getProgress_(email) {
  const book = SpreadsheetApp.openById(SPREADSHEET_ID);
  const userId = userId_(email);
  const answersSheet = book.getSheetByName("Answers");
  const values = answersSheet.getLastRow() > 1
    ? answersSheet.getRange(2, 1, answersSheet.getLastRow() - 1, SHEETS.Answers.length).getValues()
    : [];
  const mine = values.filter(function (row) { return row[2] === userId && row[3] === STACK_ID; });

  const cards = Array.from({ length: 52 }, function (_, index) {
    return {
      position: index + 1,
      total: 0,
      correct: 0,
      total_ms: 0,
      last_answered_at: "",
      last_answered_ms: 0,
      recent_attempts: [],
    };
  });

  const modeNames = ["card-position", "position-card", "previous", "next", "offset", "neighborhood", "sequence"];
  const modeTotals = {};
  modeNames.forEach(function (mode) {
    modeTotals[mode] = { mode: mode, total: 0, correct: 0, total_ms: 0 };
  });

  mine.forEach(function (row) {
    const position = Number(row[6]);
    if (position < 1 || position > 52) return;
    const card = cards[position - 1];
    card.total += 1;
    card.correct += row[8] === true ? 1 : 0;
    card.total_ms += Number(row[9]) || 0;
    const answeredMs = new Date(row[4]).getTime() || 0;
    card.recent_attempts.push({
      correct: row[8] === true,
      response_time_ms: Number(row[9]) || 0,
      answered_at: answeredMs ? new Date(answeredMs).toISOString() : "",
      answered_ms: answeredMs,
    });
    if (answeredMs > card.last_answered_ms) {
      card.last_answered_ms = answeredMs;
      card.last_answered_at = new Date(answeredMs).toISOString();
    }

    const mode = String(row[5] || "");
    if (modeTotals[mode]) {
      modeTotals[mode].total += 1;
      modeTotals[mode].correct += row[8] === true ? 1 : 0;
      modeTotals[mode].total_ms += Number(row[9]) || 0;
    }
  });

  let masteryTotal = 0;
  const cardProgress = cards.map(function (card) {
    const accuracy = card.total ? card.correct / card.total : 0;
    const average = card.total ? Math.round(card.total_ms / card.total) : 0;
    const recent = card.recent_attempts
      .sort(function (a, b) { return a.answered_ms - b.answered_ms; })
      .slice(-10);
    const recentCorrect = recent.filter(function (attempt) { return attempt.correct; }).length;
    const recentAccuracy = recent.length ? recentCorrect / recent.length : 0;
    const recentAverage = recent.length
      ? Math.round(recent.reduce(function (sum, attempt) { return sum + attempt.response_time_ms; }, 0) / recent.length)
      : 0;
    const lastThreeCorrect = recent.length >= 3 && recent.slice(-3).every(function (attempt) { return attempt.correct; });
    const confidence = Math.min(recent.length / 10, 1);
    const speed = recentAverage === 0 ? 0 : Math.max(0.35, Math.min(1, 3000 / recentAverage));
    const mastery = recentAccuracy * confidence * speed;
    const ageDays = card.last_answered_at
      ? Math.max(0, (Date.now() - new Date(card.last_answered_at).getTime()) / 86400000)
      : 30;
    const priority = card.total === 0 ? 1000 : Math.round(
      (1 - recentAccuracy) * 700
      + Math.min(recentAverage / 20, 220)
      + Math.min(ageDays, 30) * 5
      + Math.max(0, 10 - recent.length) * 25
      + (recent.length && !recent[recent.length - 1].correct ? 180 : 0)
    );
    masteryTotal += mastery;
    let status = "unseen";
    if (card.total > 0) {
      status = recent.length === 10 && recentCorrect >= 9 && lastThreeCorrect && recentAverage <= 3000
        ? "strong"
        : recentAccuracy >= 0.7 ? "learning" : "weak";
    }
    return {
      position: card.position,
      total: card.total,
      accuracy: Math.round(accuracy * 100),
      average_time_ms: average,
      last_answered_at: card.last_answered_at,
      review_priority: priority,
      recent_accuracy: Math.round(recentAccuracy * 100),
      recent_average_time_ms: recentAverage,
      recent_attempts: recent.map(function (attempt) {
        return {
          correct: attempt.correct,
          response_time_ms: attempt.response_time_ms,
          answered_at: attempt.answered_at,
        };
      }),
      status: status,
    };
  });

  const modeProgress = modeNames.map(function (mode) {
    const item = modeTotals[mode];
    return {
      mode: mode,
      total: item.total,
      accuracy: item.total ? Math.round((item.correct / item.total) * 100) : 0,
      average_time_ms: item.total ? Math.round(item.total_ms / item.total) : 0,
    };
  });

  const settings = readSettings_(book, userId);
  const totalCorrect = mine.filter(function (row) { return row[8] === true; }).length;
  const totalTime = mine.reduce(function (sum, row) { return sum + (Number(row[9]) || 0); }, 0);

  return {
    mastery_percent: Math.round((masteryTotal / 52) * 100),
    total_answers: mine.length,
    correct_answers: totalCorrect,
    average_time_ms: mine.length ? Math.round(totalTime / mine.length) : 0,
    range_start: settings.range_start,
    range_end: settings.range_end,
    cards: cardProgress,
    modes: modeProgress,
  };
}

function ensureSheet_(book, name, headers) {
  let sheet = book.getSheetByName(name);
  if (!sheet) sheet = book.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  const header = sheet.getRange(1, 1, 1, headers.length);
  header.setBackground("#102230").setFontColor("#ffffff").setFontWeight("bold");
  sheet.autoResizeColumns(1, headers.length);
  return sheet;
}

function seedConfig_(book) {
  const sheet = book.getSheetByName("Config");
  const existing = new Set(columnValues_(sheet, 1));
  const rows = [
    ["schema_version", "1"],
    ["default_stack", STACK_ID],
    ["created_at", new Date().toISOString()],
  ].filter(function (row) { return !existing.has(row[0]); });
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 2).setValues(rows);
}

function seedStack_(book) {
  const sheet = book.getSheetByName("Stacks");
  if (sheet.getLastRow() > 1) return;
  const rows = MNEMONICA.map(function (code, index) {
    return [STACK_ID, index + 1, code, cardLabel_(code), true];
  });
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

function touchUser_(user) {
  const book = SpreadsheetApp.openById(SPREADSHEET_ID);
  upsertUser_(book, userId_(user.email), user);
}

function upsertUser_(book, userId, user) {
  const sheet = book.getSheetByName("Users");
  const ids = columnValues_(sheet, 1);
  const index = ids.indexOf(userId);
  const now = new Date().toISOString();
  if (index === -1) {
    sheet.appendRow([userId, user.email, user.name, now, now]);
  } else {
    sheet.getRange(index + 2, 2, 1, 4).setValues([[user.email, user.name, sheet.getRange(index + 2, 4).getValue() || now, now]]);
  }
}

function upsertSettings_(book, userId, settings) {
  const sheet = book.getSheetByName("Settings");
  const ids = columnValues_(sheet, 1);
  const index = ids.indexOf(userId);
  const row = [
    userId, STACK_ID, number_(settings.range_start, 1), number_(settings.range_end, 10),
    clean_(settings.mode || "mixed"), clean_(settings.answer_style || "choices"), new Date().toISOString(),
  ];
  if (index === -1) sheet.appendRow(row);
  else sheet.getRange(index + 2, 1, 1, row.length).setValues([row]);
}

function readSettings_(book, userId) {
  const sheet = book.getSheetByName("Settings");
  if (sheet.getLastRow() <= 1) return { range_start: 1, range_end: 10 };
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, SHEETS.Settings.length).getValues();
  const row = values.find(function (item) { return item[0] === userId && item[1] === STACK_ID; });
  return row ? { range_start: Number(row[2]) || 1, range_end: Number(row[3]) || 10 } : { range_start: 1, range_end: 10 };
}

function verifySecret_(candidate) {
  const expected = PropertiesService.getScriptProperties().getProperty("API_SECRET");
  if (!expected || candidate !== expected) throw new Error("Acceso no autorizado");
}

function normalizeUser_(user) {
  const email = clean_(user && user.email).toLowerCase();
  if (!email || email.indexOf("@") === -1) throw new Error("Usuario no válido");
  return { email: email, name: clean_(user && user.name) || email };
}

function userId_(email) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email.toLowerCase());
  return bytes.map(function (byte) { return (byte + 256).toString(16).slice(-2); }).join("").slice(0, 24);
}

function rowExists_(sheet, column, value) {
  return columnValues_(sheet, column).indexOf(value) !== -1;
}

function columnValues_(sheet, column) {
  if (!sheet || sheet.getLastRow() <= 1) return [];
  return sheet.getRange(2, column, sheet.getLastRow() - 1, 1).getValues().flat().map(String);
}

function cardLabel_(code) {
  const suitNames = { S: "picas", H: "corazones", D: "diamantes", C: "tréboles" };
  const rankNames = { A: "As", J: "Jota", Q: "Reina", K: "Rey" };
  const suit = code.slice(-1);
  const rank = code.slice(0, -1);
  return (rankNames[rank] || rank) + " de " + suitNames[suit];
}

function clean_(value) {
  return String(value == null ? "" : value).slice(0, 500);
}

function number_(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function respond_(payload, callback) {
  const safeCallback = String(callback || "");
  if (/^[A-Za-z_$][0-9A-Za-z_$]{0,79}$/.test(safeCallback)) {
    return ContentService
      .createTextOutput(safeCallback + "(" + JSON.stringify(payload) + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json_(payload);
}
