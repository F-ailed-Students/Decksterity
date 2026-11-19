import { seedCourses, seedCards } from './seed';
import api from './api';
import { dev_makeid } from './utils/utils'
import { applyRating, countCards, isDueCard, isNewCard, toApiRating } from './logic/scheduling'

const COURSES_KEY = 'sr_courses';
const CARDS_KEY = 'sr_cards';
const IS_DEV = import.meta.env.DEV

function load(key, fallback) {
  if (!IS_DEV) return fallback;

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

// ── Async loadsave ──────────────────────────────────────────────────────────────────

// In-memory cache
let coursesCache = null;
let fetchPromise = null;

export async function fetchCourses() {
  if (IS_DEV)
  {
    coursesCache = load(COURSES_KEY, seedCourses)
    for (const course of coursesCache) {
      await fetchCards(course.id)
    }
    return coursesCache;
  }

  // Deduplicate in-flight requests (e.g. two components mounting at once)
  if (fetchPromise) return fetchPromise;

  fetchPromise = api.get('/decks')
    .then((res) => {
      coursesCache = res.data; // already parsed, no .json() needed
      return res.data;
    })
    .catch((err) => {
      const status = err.response?.status;      // e.g. 404, 500
      const message = err.response?.data?.detail // FastAPI error detail
      throw new Error(`Failed to load decks: ${status} ${message}`);
    })
    .finally(() => {
      fetchPromise = null; // allow retry on next call
    });

  return fetchPromise;
}

// Call this after resetData() to bust the cache
export function invalidateCoursesCache() {
  coursesCache = null;
}

// Fetch cards
let cardCache = {};
const cardFetchPromises = new Map();

export async function fetchCards(courseId) {
  if (IS_DEV)
  {
    cardCache[courseId] 
      = load(CARDS_KEY, seedCards).filter((c) => c.courseId === courseId)
    return cardCache[courseId];
  }

  // Deduplicate in-flight requests per course.
  if (cardFetchPromises.has(courseId)) return cardFetchPromises.get(courseId);

  const request = api.get(`/decks/${courseId}/cards`)
    .then((res) => {
      cardCache[courseId] = res.data;
      return cardCache[courseId];
    })
    .catch((err) => {
      const status = err.response?.status;      // e.g. 404, 500
      const message = err.response?.data?.detail // FastAPI error detail
      throw new Error(`Failed to load: ${status} ${message}`);
    })
    .finally(() => {
      cardFetchPromises.delete(courseId); // allow retry on next call
    });

  cardFetchPromises.set(courseId, request);
  return request;
}


// ── Courses ──────────────────────────────────────────────────────────────────

export function getCourses() {
  return coursesCache;
}

export function getCourse(id) {
  return getCourses()?.find((c) => c.id === id);
}

// ── Cards ────────────────────────────────────────────────────────────────────

export function getCardsByCourse(courseId) {
  return cardCache[courseId] ?? [];
}

export function getDueCards(courseId) {
  const now = Date.now();
  return getCardsByCourse(courseId).filter((card) => isDueCard(card, now));
}

export function getNewCards(courseId) {
  return getCardsByCourse(courseId).filter(isNewCard);
}

export function addCard(courseId, front, back) {
  if (IS_DEV) {
    const c = dev_getCards();
    c.push({
      id: dev_makeid(10),
      courseId: courseId,
      front: front,
      back: back,
      interval: 1,
      ease: 2.5,
      due: Date.now(),
      lastReviewed: null,
      new: true,
    });
    save(CARDS_KEY, c);
  }
  else {
    api.post(`decks/${courseId}/cards/add`, {
      front: front,
      back: back,
      is_public: false
    })
  }
}


// ── SM-2 Simplified ─────────────────────────────────────────────────────────
// rating: 0 = Again, 1 = Hard, 2 = Good, 3 = Easy

export function rateCard(courseId, cardId, rating) {
  if (IS_DEV) dev_rateCard(cardId, rating)
  else {
    // The UI rates 0-3; the API expects 1-4.
    api.post(`review`, {
      deck_id: courseId,
      card_id: cardId,
      rating: toApiRating(rating)
    })
  }
}

function dev_getCards() {
  return load(CARDS_KEY, seedCards);
}

function dev_rateCard(cardId, rating) {
  const cards = dev_getCards();
  const idx = cards.findIndex((c) => c.id === cardId);
  if (idx === -1) return;

  cards[idx] = applyRating(cards[idx], rating);
  save(CARDS_KEY, cards);
}

// ── Seed / Reset ─────────────────────────────────────────────────────────────

export function resetData() {
  save(COURSES_KEY, seedCourses);
  save(CARDS_KEY, seedCards);
}

// ── Stats ────────────────────────────────────────────────────────────────────

export async function getCourseStatistics(course) {
  if (IS_DEV) {
    await fetchCards(course.id)
    return countCards(getCardsByCourse(course.id))
  }

  const res = await api.get(`/decks/${course.id}/stats`)
  return res.data
}

export async function fetchStats() {
  if (IS_DEV)
  {
    const allStat = { due: 0, new: 0, reviewedToday: 0 }
    for (const course of getCourses() ?? [])
    {
      const stat = await getCourseStatistics(course)
      for (const key in allStat)
      {
        allStat[key] += stat[key] ?? 0
      }
    }
      
    return allStat
  }

  try {
    const res = await api.get(`/stats`);
    return res.data;
  } catch (err) {
    const status = err.response?.status; // e.g. 404, 500
    const message = err.response?.data?.detail; // FastAPI error detail
    throw new Error(`Failed to get stats: ${status} ${message}`);
  }
}
