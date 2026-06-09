import { Bell, BookOpen, Clock, CheckCircle, Sun, Moon } from 'lucide-react';
import { fetchStats } from '../store';
import { useTheme } from '../context/ThemeProvider';
import { useState, useEffect } from 'react';

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
        <div className="stat-card">
          <div className="stat-icon due">
            <Clock size={18} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats.due}</span>
            <span className="stat-label">Due today</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon new">
            <BookOpen size={18} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats.new}</span>
            <span className="stat-label">New cards</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon done">
            <CheckCircle size={18} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats.reviewedToday}</span>
            <span className="stat-label">Reviewed today</span>
          </div>
        </div>
      </nav>

      <div className="sidebar-notifications">
        <div className="sidebar-section-label">Notifications</div>
        <div className="notif-item">
          <Bell size={14} />
          <span>No new notifications</span>
        </div>
      </div>

      <button className="theme-toggle" onClick={toggle} title={dark ? 'Light mode' : 'Dark mode'}>
        {dark ? <Sun size={16} /> : <Moon size={16} />}
        <span>{dark ? 'Light mode' : 'Dark mode'}</span>
      </button>
    </aside>
  );
}
