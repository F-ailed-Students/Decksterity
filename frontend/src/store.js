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

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function apiError(prefix, error) {
  const status = error.response?.status ?? 'unknown';
  const message = error.response?.data?.detail ?? error.message;
  return new Error(`${prefix}: ${status} ${message}`);
}

let coursesCache = null;
let fetchPromise = null;

export async function fetchCourses() {
  if (IS_DEV) {
    coursesCache = load(COURSES_KEY, seedCourses);
    for (const course of coursesCache) {
      await fetchCards(course.id);
    }
    return coursesCache;
  }

  // Deduplicate in-flight requests (e.g. two components mounting at once)
  if (fetchPromise) return fetchPromise;

  fetchPromise = api.get('/decks')
    .then((res) => {
      coursesCache = res.data;
      return res.data;
    })
    .catch((error) => {
      throw apiError('Failed to load decks', error);
    })
    .finally(() => {
      fetchPromise = null;
    });

  return fetchPromise;
}

// Call this after resetData() to bust the cache
export function invalidateCoursesCache() {
  coursesCache = null;
}

let cardCache = {};
const cardFetchPromises = new Map();

export async function fetchCards(courseId) {
  if (IS_DEV) {
    cardCache[courseId] = load(CARDS_KEY, seedCards)
      .filter((card) => card.courseId === courseId);
    return cardCache[courseId];
  }

  // Deduplicate in-flight requests per course.
  if (cardFetchPromises.has(courseId)) return cardFetchPromises.get(courseId);

  const request = api.get(`/decks/${courseId}/cards`)
    .then((res) => {
      cardCache[courseId] = res.data;
      return cardCache[courseId];
    })
    .catch((error) => {
      throw apiError('Failed to load', error);
    })
    .finally(() => {
      cardFetchPromises.delete(courseId);
    });

  cardFetchPromises.set(courseId, request);
  return request;
}

export function getCourses() {
  return coursesCache;
}

export function getCourse(id) {
  return getCourses()?.find((course) => course.id === id);
}

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
    const cards = dev_getCards();
    cards.push({
      id: dev_makeid(10),
      courseId,
      front,
      back,
      interval: 1,
      ease: 2.5,
      due: Date.now(),
      lastReviewed: null,
      new: true,
    });
    save(CARDS_KEY, cards);
    return;
  }

  return api.post(`/decks/${courseId}/cards/add`, {
    front,
    back,
    is_public: false,
  });
}

export function rateCard(courseId, cardId, rating) {
  if (IS_DEV) {
    dev_rateCard(cardId, rating);
    return;
  }

  // The UI rates 0-3; the API expects 1-4.
  return api.post('/review', {
    deck_id: courseId,
    card_id: cardId,
    rating: toApiRating(rating),
  });
}

function dev_getCards() {
  return load(CARDS_KEY, seedCards);
}

function dev_rateCard(cardId, rating) {
  const cards = dev_getCards();
  const index = cards.findIndex((card) => card.id === cardId);
  if (index === -1) return;

  cards[index] = applyRating(cards[index], rating);
  save(CARDS_KEY, cards);
}

export function resetData() {
  save(COURSES_KEY, seedCourses);
  save(CARDS_KEY, seedCards);
}

export async function getCourseStatistics(course) {
  if (IS_DEV) {
    await fetchCards(course.id);
    return countCards(getCardsByCourse(course.id));
  }

  const res = await api.get(`/decks/${course.id}/stats`);
  return res.data;
}

export async function fetchStats() {
  if (IS_DEV) {
    const courses = getCourses() ?? [];
    const statistics = await Promise.all(courses.map(getCourseStatistics));

    return statistics.reduce((totals, stats) => ({
      due: totals.due + (stats.due ?? 0),
      new: totals.new + (stats.new ?? 0),
      reviewedToday: totals.reviewedToday + (stats.reviewedToday ?? 0),
    }), { due: 0, new: 0, reviewedToday: 0 });
  }

  try {
    const res = await api.get('/stats');
    return res.data;
  } catch (error) {
    throw apiError('Failed to get stats', error);
  }
}
