import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getCourse, getDueCards, getNewCards, getCardsByCourse } from '../store';
import Sidebar from '../components/Sidebar';
import { ArrowLeft, BookOpen } from 'lucide-react';

export default function CourseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [limit, setLimit] = useState(20);
  const [stats, setStats] = useState({ due: 0, new: 0, total: 0 });

  useEffect(() => {
    const c = getCourse(id);
    if (!c) { navigate('/'); return; }
    setCourse(c);
    setStats({
      due: getDueCards(id).length,
      new: getNewCards(id).length,
      total: getCardsByCourse(id).length,
    });
  }, [id, navigate]);

  if (!course) return null;

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <button className="btn-back" onClick={() => navigate('/')}>
          <ArrowLeft size={16} />
          Back to courses
        </button>

        <div className="course-detail-header" style={{ '--accent': course.color }}>
          <div className="course-detail-icon">
            <BookOpen size={28} />
          </div>
          <div>
            <h1 className="course-detail-name">{course.name}</h1>
            <p className="course-detail-desc">{course.description}</p>
          </div>
        </div>

        <div className="course-stats-row">
          <div className="detail-stat">
            <span className="detail-stat-value">{stats.due}</span>
            <span className="detail-stat-label">Cards due</span>
          </div>
          <div className="detail-stat">
            <span className="detail-stat-value">{stats.new}</span>
            <span className="detail-stat-label">New cards</span>
          </div>
          <div className="detail-stat">
            <span className="detail-stat-value">{stats.total}</span>
            <span className="detail-stat-label">Total cards</span>
          </div>
        </div>

        <div className="study-start-section">
          <h2 className="section-title">Start a study session</h2>
          <div className="limit-row">
            <label className="limit-label" htmlFor="card-limit">
              How many cards to study today?
            </label>
            <input
              id="card-limit"
              type="number"
              className="limit-input"
              value={limit}
              min={1}
              max={stats.due + stats.new}
              onChange={(e) => setLimit(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>
          <button
            className="btn-primary btn-start-study"
            onClick={() => navigate(`/study/${id}?limit=${limit}`)}
            disabled={stats.due === 0 && stats.new === 0}
          >
            {stats.due === 0 && stats.new === 0
              ? 'All caught up!'
              : `Start studying (${Math.min(limit, stats.due + stats.new)} cards)`}
          </button>

          <button
            className="btn-primary"
            onClick={() => navigate(`/courses/${id}/edit`)}
          >{'Edit your cards'}</button>
        </div>
      </main>
    </div>
  );
}
