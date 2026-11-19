import { Bell, BookOpen, Clock, CheckCircle, Sun, Moon } from 'lucide-react';
import { fetchStats } from '../store';
import { useTheme } from '../context/ThemeContext';
import { useState, useEffect } from 'react';

const STATS = [
  { key: 'due', label: 'Due today', className: 'due', icon: <Clock size={18} /> },
  { key: 'new', label: 'New cards', className: 'new', icon: <BookOpen size={18} /> },
  { key: 'reviewedToday', label: 'Reviewed today', className: 'done', icon: <CheckCircle size={18} /> },
];

export default function Sidebar() {
  const { dark, toggle } = useTheme();
  const [stats, setStats] = useState({ due: 0, new: 0, reviewedToday: 0 });

  useEffect(() => {
    fetchStats().then(setStats)
      .catch(console.error);
  }, []);

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <BookOpen size={22} />
        <span>Spaced Repetition</span>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Overview</div>
        {STATS.map(({ key, label, className, icon }) => (
          <div className="stat-card" key={key}>
            <div className={`stat-icon ${className}`}>
              {icon}
            </div>
            <div className="stat-info">
              <span className="stat-value">{stats[key]}</span>
              <span className="stat-label">{label}</span>
            </div>
          </div>
        ))}
      </nav>

      <div className="sidebar-notifications">
        <div className="sidebar-section-label">Notifications</div>
        <div className="notif-item">
          <Bell size={14} />
          <span>No new notifications</span>
        </div>
      </div>

      <button
        type="button"
        className="theme-toggle"
        onClick={toggle}
        title={dark ? 'Light mode' : 'Dark mode'}
      >
        {dark ? <Sun size={16} /> : <Moon size={16} />}
        <span>{dark ? 'Light mode' : 'Dark mode'}</span>
      </button>
    </aside>
  );
}
