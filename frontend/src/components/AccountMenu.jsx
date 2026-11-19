import { UserCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AccountMenu() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth() ?? {};
  const label = isAuthenticated ? user?.name || 'Account' : 'Log in';

  return (
    <div className="account-dock">
      <button className="account-trigger" onClick={() => navigate('/login')}>
        <span className="account-avatar">
          <UserCircle2 size={18} />
        </span>
        <strong className="account-trigger-label">{label}</strong>
      </button>
    </div>
  );
}