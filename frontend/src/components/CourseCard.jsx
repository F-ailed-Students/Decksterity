import { getCourseStatistics } from '../store';
import { useState, useEffect } from 'react';
import { Layers } from 'lucide-react';

export default function CourseCard({ course, onDetails, onStudy }) {
  const [due, setDue] = useState(0);
  const [newCount, setNewCount] = useState(0);

  useEffect(() => {
    getCourseStatistics(course)
      .then((data) => {
        setDue(data.due);
        setNewCount(data.new);
      })
      .catch(() => {
        setDue(0);
        setNewCount(0);
      });
  }, [course]);

  return (
    <div className="course-card" style={{ '--accent': course.color }} onClick={() => onDetails(course.id)}>
      <div className="course-card-accent" />
      <div className="course-card-body">
        <div className="course-icon">
          <Layers size={22} />
        </div>
        <h3 className="course-name">{course.name}</h3>
        <p className="course-desc">{course.description}</p>
        <div className="course-badges">
          {due > 0 && <span className="badge badge-due">{due} due</span>}
          {newCount > 0 && <span className="badge badge-new">{newCount} new</span>}
          {due === 0 && newCount === 0 && (
            <span className="badge badge-done">All caught up!</span>
          )}
        </div>
      </div>
      <button
        type="button"
        className="btn-study"
        onClick={(event) => {
          event.stopPropagation();
          onStudy(course.id);
        }}
        disabled={due === 0 && newCount === 0}
      >
        Study now
      </button>
    </div>
  );
}
