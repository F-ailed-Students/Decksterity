import { seedCourses, seedCards } from './seed';

const COURSES_KEY = 'sr_courses';
const CARDS_KEY = 'sr_cards';
const MS_PER_DAY = 86400000;

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

// ── Courses ──────────────────────────────────────────────────────────────────

export function getCourses() {
  return load(COURSES_KEY, seedCourses);
}

export function getCourse(id) {
  return getCourses().find((c) => c.id === id);
}

// ── Cards ────────────────────────────────────────────────────────────────────

export function getCards() {
  return load(CARDS_KEY, seedCards);
}

export function getCardsByCourse(courseId) {
  return getCards().filter((c) => c.courseId === courseId);
}

export function getDueCards(courseId) {
  const now = Date.now();
  return getCardsByCourse(courseId).filter((c) => c.dueDate <= now);
}

export function getNewCards(courseId) {
  return getCardsByCourse(courseId).filter((c) => c.new);
}

// ── SM-2 Simplified ─────────────────────────────────────────────────────────
// rating: 0 = Again, 1 = Hard, 2 = Good, 3 = Easy

export function rateCard(cardId, rating) {
  const cards = getCards();
  const idx = cards.findIndex((c) => c.id === cardId);
  if (idx === -1) return;

  const card = { ...cards[idx] };

  // Adjust ease factor
  const easeDelta = [-0.3, -0.15, +0.0, +0.15][rating];
  card.ease = Math.max(1.3, card.ease + easeDelta);

  // Adjust interval
  if (rating === 0) {
    // Again: reset to 1 day
    card.interval = 1;
    card.new = false;
  } else {
    const baseInterval = [1, 2, 4, 7][rating] * card.interval;
    card.interval = Math.max(1, Math.min(365, Math.round(baseInterval * (card.ease / 2.5))));
    if (card.new) {
      card.new = false;
      card.interval = [1, 2, 4, 7][rating];
    }
  }

  card.dueDate = Date.now() + card.interval * MS_PER_DAY;
  card.lastReviewed = Date.now();

  cards[idx] = card;
  save(CARDS_KEY, cards);
}

// ── Seed / Reset ─────────────────────────────────────────────────────────────

export function resetData() {
  save(COURSES_KEY, seedCourses);
  save(CARDS_KEY, seedCards);
}

// ── Stats ────────────────────────────────────────────────────────────────────

export function getStats() {
  const cards = getCards();
  const now = Date.now();
  const due = cards.filter((c) => c.dueDate <= now).length;
  const newCount = cards.filter((c) => c.new).length;
  const reviewedToday = cards.filter(
    (c) => c.lastReviewed && c.lastReviewed > now - MS_PER_DAY
  ).length;
  return { due, new: newCount, reviewedToday };
}
