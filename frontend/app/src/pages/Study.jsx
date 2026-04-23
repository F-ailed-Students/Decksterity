import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import FlashCard from '../components/FlashCard';
import { getCourse, getDueCards, getNewCards, rateCard } from '../store';
import { ArrowLeft, CheckCircle, Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeProvider';

export default function Study() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { dark, toggle } = useTheme();
  const [searchParams] = useSearchParams();
  const limit = parseInt(searchParams.get('limit')) || 20;

  const [course, setCourse] = useState(null);
  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [studied, setStudied] = useState(0);
  const [againCount, setAgainCount] = useState(0);

  useEffect(() => {
    const c = getCourse(id);
    if (!c) { navigate('/'); return; }
    setCourse(c);

    // Build queue: due cards first, then new cards, shuffled
    const due = getDueCards(id);
    const newC = getNewCards(id).slice(0, Math.max(0, limit - due.length));
    const all = [...due, ...newC];
    // Fisher-Yates shuffle
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    setQueue(all.slice(0, limit));
    setIndex(0);
  }, [id, navigate, limit]);

  const handleRate = useCallback((rating, userAnswer) => {
    const card = queue[index];
    rateCard(card.id, rating);
    setStudied((s) => s + 1);
    if (rating === 0) setAgainCount((a) => a + 1);

    const next = index + 1;
    if (next >= queue.length) {
      setDone(true);
    } else {
      setIndex(next);
    }
  }, [queue, index]);

  if (!course) return null;

  if (done) {
    return (
      <div className="app-shell">
        <main className="main-content">
          <div className="done-screen">
            <div className="done-icon">
              <CheckCircle size={56} />
            </div>
            <h1 className="done-title">Session complete!</h1>
            <p className="done-subtitle">
              You studied <strong>{studied}</strong> cards from {course.name}
            </p>
            <div className="done-stats">
              <div className="done-stat">
                <span className="done-stat-value">{studied - againCount}</span>
                <span className="done-stat-label">remembered</span>
              </div>
              <div className="done-stat">
                <span className="done-stat-value">{againCount}</span>
                <span className="done-stat-label">need review</span>
              </div>
            </div>
            <div className="done-actions">
              <button className="btn-primary" onClick={() => navigate(`/courses/${id}`)}>
                Back to course
              </button>
              <button className="btn-secondary" onClick={() => navigate('/')}>
                All courses
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const card = queue[index];

  return (
    <div className="app-shell">
      <main className="main-content study-main study-centered">
        {/* Study header */}
        <div className="study-header">
          <button className="btn-back btn-back-study" onClick={() => navigate('/')}>
            <ArrowLeft size={16} />
          </button>
          <span className="study-course-name">{course.name}</span>
          <button className="theme-toggle-study" onClick={toggle}>
            {dark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <span className="study-counter">
            {index + 1} / {queue.length}
          </span>
        </div>

        {/* Progress bar */}
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${((index) / queue.length) * 100}%` }}
          />
        </div>

        {/* Card */}
        {card && (
          <FlashCard key={card.id + index} card={card} onRate={handleRate} />
        )}
      </main>
    </div>
  );
}
