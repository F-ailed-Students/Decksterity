import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import CourseCard from '../components/CourseCard';
import { fetchCourses, resetData, invalidateCoursesCache } from '../store';
import { useState, useEffect } from 'react';

export default function Dashboard() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchCourses()
      .then(setCourses)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function handleStudy(courseId) {
    navigate(`/study/${courseId}`);
  }

  function handleReset() {
    if (window.confirm('Clear all memory and reset all cards?')) {
      resetData();
      invalidateCoursesCache();
      window.location.reload();
    }
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Your Courses</h1>
          {import.meta.env.DEV && (
            <button className="btn-dev-reset" onClick={handleReset}>
              Clear all memory
            </button>
          )}
        </div>

        {loading && <div className="loading-indicator">Loading courses…</div>}
        {error && <div className="error-message">⚠ {error}</div>}

        {!loading && !error && (
          <div className="course-grid">
            {courses.map((course) => (
              <CourseCard key={course.id} course={course} onStudy={handleStudy} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}