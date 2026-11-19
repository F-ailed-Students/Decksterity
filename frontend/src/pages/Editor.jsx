import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getCourse, fetchCourses, addCard } from '../store';
import Sidebar from '../components/Sidebar';
import { ArrowLeft, BookOpen } from 'lucide-react';

export default function Editor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);

  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');

  useEffect(() => {
    fetchCourses()
        .then(() => {
            const c = getCourse(id);
            if (!c) { navigate('/'); return; }
            setCourse(c);
        })
  }, [id, navigate]);

  if (!course) return null; // or a loading spinner

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <button className="btn-back" onClick={() => navigate(`/courses/${id}`)}>
          <ArrowLeft size={16} />
          Back to course details
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

        <div className="study-start-section">
          <h2 className="section-title">Add new card</h2>

          <textarea
            className="answer-input"
            placeholder="Question"
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            rows={3}
          />

          <textarea
            className="answer-input"
            placeholder="Answer"
            value={newAnswer}
            onChange={(e) => setNewAnswer(e.target.value)}
            rows={5}
          />

          <button
            className="btn-primary"
            onClick={() => {
              addCard(course.id, newQuestion, newAnswer);
              setNewQuestion("");
              setNewAnswer("");
            }}
          >{'Save'}</button>
        </div>
      </main>
    </div>
  );
}
