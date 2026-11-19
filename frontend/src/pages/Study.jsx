import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import FlashCard from '../components/FlashCard';
import StudyHeader from '../components/StudyHeader';
import StudySummary from '../components/StudySummary';
import { useStudySession } from '../hooks/useStudySession';
import { useTheme } from '../context/ThemeContext';

export default function Study() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { dark, toggle } = useTheme();
  const [searchParams] = useSearchParams();
  const limit = parseInt(searchParams.get('limit')) || 20;
  const { course, queue, index, done, studied, againCount, rate } = useStudySession(id, limit);

  if (!course) return null;

  if (done) {
    return (
      <StudySummary
        courseName={course.name}
        studied={studied}
        againCount={againCount}
        onBackToCourse={() => navigate(`/courses/${id}`)}
        onAllCourses={() => navigate('/')}
      />
    );
  }

  const card = queue[index];

  return (
    <div className="app-shell">
      <main className="main-content study-main study-centered">
        <StudyHeader
          courseName={course.name}
          index={index}
          total={queue.length}
          dark={dark}
          onToggleTheme={toggle}
          onBack={() => navigate('/')}
        />

        {card && (
          <FlashCard key={card.id + index} card={card} onRate={rate} />
        )}
      </main>
    </div>
  );
}
