export const MS_PER_DAY = 86400000

const EASE_DELTA = [-0.3, -0.15, 0, 0.15]
const NEW_INTERVALS = [1, 2, 4, 7]

export function getDueTime(card) {
  return card.due ?? card.dueDate
}

export function isNewCard(card) {
  return Boolean(card.new)
}

export function isDueCard(card, now = Date.now()) {
  // New cards belong to the new-card queue, not the due queue.
  if (isNewCard(card)) return false
  const due = getDueTime(card)
  return due != null && due <= now
}

function isToday(timestamp, now) {
  if (timestamp == null) return false
  const date = new Date(timestamp)
  const today = new Date(now)
  if (Number.isNaN(date.getTime())) return false

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  )
}

export function countCards(cards, now = Date.now()) {
  return cards.reduce(
    (counts, card) => {
      if (isDueCard(card, now)) counts.due += 1
      if (isNewCard(card)) counts.new += 1
      if (isToday(card.lastReviewed, now)) counts.reviewedToday += 1
      return counts
    },
    { due: 0, new: 0, reviewedToday: 0 },
  )
}

export function applyRating(card, rating, now = Date.now()) {
  const next = {
    ...card,
    ease: Math.max(1.3, card.ease + EASE_DELTA[rating]),
  }

  if (rating === 0) {
    next.interval = 1
    next.new = false
  } else {
    const baseInterval = NEW_INTERVALS[rating] * card.interval
    next.interval = Math.max(
      1,
      Math.min(365, Math.round(baseInterval * (next.ease / 2.5))),
    )
    if (next.new) {
      next.new = false
      next.interval = NEW_INTERVALS[rating]
    }
  }

  next.due = now + next.interval * MS_PER_DAY
  next.lastReviewed = now
  return next
}

export function buildStudyQueue(cards, limit, random = Math.random) {
  const now = Date.now()
  const maxCards = Math.max(0, limit)
  const due = cards.filter((card) => isDueCard(card, now))
  const newCards = cards
    .filter((card) => isNewCard(card))
    .slice(0, Math.max(0, maxCards - due.length))
  const queue = [...due, ...newCards]

  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[queue[i], queue[j]] = [queue[j], queue[i]]
  }

  return queue.slice(0, maxCards)
}

export function toApiRating(rating) {
  return rating + 1
}
