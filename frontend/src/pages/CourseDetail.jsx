import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getCourse, getDueCards, getNewCards, getCardsByCourse, fetchCards, fetchCourses } from '../store';
import PageLayout from '../components/PageLayout';
import BackButton from '../components/BackButton';
import CourseHeader from '../components/CourseHeader';
import CourseStats from '../components/CourseStats';
import LoadingWaiter from '../components/LoadingWaiter';

export default function CourseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [limit, setLimit] = useState(20);
  const [stats, setStats] = useState({ due: 0, new: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    fetchCourses()
      .then(() => fetchCards(id))
      .then(() => {
        if (!active) return;

        const loadedCourse = getCourse(id);
        if (!loadedCourse) {
          setError('Course not found');
          return;
        }

        setCourse(loadedCourse);
        setStats({
          due: getDueCards(id).length,
          new: getNewCards(id).length,
          total: getCardsByCourse(id).length,
        });
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  if (!course) {
    return (
      <PageLayout>
        <BackButton label="Back to courses" onClick={() => navigate('/')} />
        <LoadingWaiter loading={loading} error={error} />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <BackButton label="Back to courses" onClick={() => navigate('/')} />
      <CourseHeader course={course} />

      <LoadingWaiter loading={loading} error={error}>
        <CourseStats stats={stats} />

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
          >
            Edit your cards
          </button>
        </div>
      </LoadingWaiter>
    </PageLayout>
  );
}
