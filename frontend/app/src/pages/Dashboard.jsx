import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import CourseCard from '../components/CourseCard';
import { getCourses, resetData } from '../store';
import { useState, useEffect } from 'react';

export default function Dashboard() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);

  useEffect(() => {
    setCourses(getCourses());
  }, []);

  function handleStudy(courseId) {
    navigate(`/study/${courseId}`);
  }

  function handleReset() {
    if (window.confirm('Clear all memory and reset all cards?')) {
      resetData();
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

        <div className="course-grid">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} onStudy={handleStudy} />
          ))}
        </div>
      </main>
    </div>
  );
}
