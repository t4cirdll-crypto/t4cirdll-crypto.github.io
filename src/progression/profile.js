// Ники и локальный зал славы. Данные из localStorage считаются недоверенными.
export const NICK_KEY = 'nightwatch.nick';
export const LEGENDS_KEY = 'nightwatch.legends.v1';
export const CHAMPION = 'Sharrowkin';
export const NICK_MAX = 18;

/** Буквы любых алфавитов, цифры, пробел, _ . - ; не длиннее NICK_MAX. */
export function cleanNick(value) {
  return String(value ?? '').normalize('NFC')
    .replace(/[^\p{L}\p{N} _.\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, NICK_MAX).trim();
}
export const isChampion = nick => cleanNick(nick).toLowerCase() === CHAMPION.toLowerCase();
// Локальный игровой чит, не авторизация к серверу или чужим данным.
export const isAdminNick = nick => cleanNick(nick).toLowerCase() === 'killdev';

const count = (n, max) => Number.isSafeInteger(n) && n >= 0 ? Math.min(n, max) : 0;
function normalizeLegend(v) {
  if (!v || typeof v !== 'object') return null;
  return { nick: cleanNick(v.nick), wins: count(v.wins, 1e6), eaten: count(v.eaten, 1e7),
    deepest: count(v.deepest, 1e6), x3: v.x3 === true };
}

export class Profile {
  constructor(storage) {
    try { this.storage = storage === undefined ? globalThis.localStorage : storage; } catch { this.storage = null; }
    this.revision = 0; this.nick = ''; this.legends = [];
    try { this.nick = cleanNick(this.storage?.getItem(NICK_KEY) || ''); } catch { /* недоступно */ }
    try {
      const raw = JSON.parse(this.storage?.getItem(LEGENDS_KEY) || '[]');
      if (Array.isArray(raw)) this.legends = raw.slice(0, 50).map(normalizeLegend).filter(Boolean);
    } catch { this.legends = []; }
  }

  get difficulty() { return isChampion(this.nick) ? 3 : 1; }
  get isAdmin() { return isAdminNick(this.nick); }
  get display() { return this.nick || 'Безымянный сторож'; }

  setNick(value) {
    const nick = cleanNick(value);
    if (nick === this.nick) return false;
    this.nick = nick; this.revision++;
    try { this.storage?.setItem(NICK_KEY, nick); } catch { /* ник живёт до закрытия страницы */ }
    return true;
  }

  /** Победа: depth — номер пройденной ночи (6 + круг бесконечного дозора). */
  record(depth, eaten) {
    const x3 = this.difficulty > 1;
    let entry = this.legends.find(l => l.nick === this.nick && l.x3 === x3);
    if (!entry) { entry = { nick: this.nick, wins: 0, eaten: 0, deepest: 0, x3 }; this.legends.push(entry); }
    entry.wins++; entry.eaten += Math.max(0, Math.floor(eaten) || 0);
    entry.deepest = Math.max(entry.deepest, depth);
    this.legends.sort((a, b) => b.deepest - a.deepest || b.eaten - a.eaten);
    this.legends = this.legends.slice(0, 50); this.revision++;
    try { this.storage?.setItem(LEGENDS_KEY, JSON.stringify(this.legends)); } catch { /* не мешает победе */ }
  }

  top(n = 5) { return this.legends.slice(0, n); }
}
