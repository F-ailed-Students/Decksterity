import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchCards,
  fetchCourses,
  getCardsByCourse,
  getCourse,
  rateCard,
} from '../store'
import { buildStudyQueue } from '../logic/scheduling'

export function useStudySession(id, limit) {
  const navigate = useNavigate()
  const [course, setCourse] = useState(null)
  const [queue, setQueue] = useState([])
  const [index, setIndex] = useState(0)
  const [done, setDone] = useState(false)
  const [studied, setStudied] = useState(0)
  const [againCount, setAgainCount] = useState(0)

  useEffect(() => {
    let active = true

    async function loadSession() {
      try {
        await fetchCourses()
        await fetchCards(id)
        if (!active) return

        const loadedCourse = getCourse(id)
        if (!loadedCourse) {
          navigate('/')
          return
        }

        const cards = buildStudyQueue(getCardsByCourse(id), limit)
        setCourse(loadedCourse)
        setQueue(cards)
        setIndex(0)
        setStudied(0)
        setAgainCount(0)
        setDone(cards.length === 0)
      } catch (err) {
        if (active) {
          console.error(err)
          navigate('/')
        }
      }
    }

    loadSession()
    return () => {
      active = false
    }
  }, [id, navigate, limit])

  function rate(rating) {
    const card = queue[index]
    if (!course || !card) return

    rateCard(course.id, card.id, rating)
    setStudied((count) => count + 1)
    if (rating === 0) setAgainCount((count) => count + 1)

    const next = index + 1
    if (next >= queue.length) {
      setDone(true)
    } else {
      setIndex(next)
    }
  }

  return { course, queue, index, done, studied, againCount, rate }
}
