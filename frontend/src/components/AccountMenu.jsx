import { UserCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function AccountMenu() {
  const navigate = useNavigate();

  return (
    <div className="account-dock">
      <button className="account-trigger" onClick={() => navigate('/login')}>
        <span className="account-avatar">
          <UserCircle2 size={18} />
        </span>
        <strong className="account-trigger-label">Log in</strong>
      </button>
    </div>
  );
}