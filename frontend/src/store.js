import { seedCourses, seedCards } from './seed';
import api from './api';
import { dev_makeid } from './utils/utils'

const COURSES_KEY = 'sr_courses';
const CARDS_KEY = 'sr_cards';
const MS_PER_DAY = 86400000;
const IS_DEV = import.meta.env.DEV

function load(key, fallback) {
  try {
    var raw = null;
    if (IS_DEV)
    {
      raw = JSON.parse(localStorage.getItem(key));
    }
    else
    {

    } 
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
    for (var c in coursesCache){
      await fetchCards(c.id)
    }
    return coursesCache;
  }

  // Deduplicate in-flight requests (e.g. two components mounting at once)
  if (fetchPromise) return fetchPromise;

  fetchPromise = api.get('/decks')
    .then((res) => {
      coursesCache = res.data; // already parsed, no .json() needed
      fetchPromise = null;
      return res.data;
    })
    .catch((err) => {
      fetchPromise = null; // allow retry on next call
      const status = err.response?.status;      // e.g. 404, 500
      const message = err.response?.data?.detail // FastAPI error detail
      throw new Error(`Failed to load decks: ${status} ${message}`);
    });

  return fetchPromise;
}

// Call this after resetData() to bust the cache
export function invalidateCoursesCache() {
  coursesCache = null;
}

// Fetch cards
let cardCache = {};
let cardFetchPromise = null;

export async function fetchCards(courseId) {
  if (IS_DEV)
  {
    cardCache[courseId] 
      = load(CARDS_KEY, seedCards).filter((c) => c.courseId === courseId)
    return cardCache[courseId];
  }

  // Deduplicate in-flight requests (e.g. two components mounting at once)
  if (cardFetchPromise) return cardFetchPromise;

  cardFetchPromise = api.get(`/decks/${courseId}/cards`)
    .then((res) => {
      cardCache[courseId] = res.data;
      cardFetchPromise = null;
      return cardCache[courseId];
    })
    .catch((err) => {
      cardFetchPromise = null; // allow retry on next call
      const status = err.response?.status;      // e.g. 404, 500
      const message = err.response?.data?.detail // FastAPI error detail
      throw new Error(`Failed to load: ${status} ${message}`);
    });

  return cardFetchPromise;
}


// ── Courses ──────────────────────────────────────────────────────────────────

export function getCourses() {
  return coursesCache;
}

export function getCourse(id) {
  console.log("LOADME:", id);
  console.log("THING:", getCourses());
  return getCourses().find((c) => c.id === id);
}

// ── Cards ────────────────────────────────────────────────────────────────────

export function getCardsByCourse(courseId) {
  return cardCache[courseId];
}

export function getDueCards(courseId) {
  const now = Date.now();
  console.log("THE CARDs:", getCardsByCourse(courseId))
  return getCardsByCourse(courseId).filter((c) => c.due <= now);
}

export function getNewCards(courseId) {
  return getCardsByCourse(courseId).filter((c) => c.new);
}

export function addCard(courseId, front, back) {
  if (IS_DEV) {
    const c = getCards();
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
    api.post(`review`, {
      deck_id: courseId,
      card_id: cardId,
      rating: rating
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

  card.due = Date.now() + card.interval * MS_PER_DAY;
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

export async function getCourseStatistics(course) {
  if (IS_DEV) {
    console.log("The course obj: ", course)
    console.log("Its id: ", course.id)
    fetchCards(course.id)
    const now = Date.now();
    return { 
      "due": getCardsByCourse(course.id).filter((c) => c.due <= now).length,
      "new": getCardsByCourse(course.id).filter((c) => c.new).length,
      "reviewedToday": 0
    };
  }
  return api.get(`/decks/${course.id}/stats`)
}

export async function fetchStats() {
  if (IS_DEV)
  {
    var all_stat = {"due": 0, "new": 0, "reviewedToday": 0}
    console.log("All courses:", getCourses())
    for (var c of getCourses())
    {
      console.log(c)
      var stat = await getCourseStatistics(c)
      for (var k in all_stat)
      {
        all_stat[k] += stat[k]
      }
    }
    return all_stat
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
