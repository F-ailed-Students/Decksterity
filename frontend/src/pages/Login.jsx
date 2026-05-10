import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { LogIn, UserPlus2 } from 'lucide-react';
import { useAuth } from '../context/AuthProvider';

export default function Login() {
  const navigate = useNavigate();
  const { signIn, signUp, isAuthenticated, user } = useAuth();
  const [mode, setMode] = useState('signin');
  const [form, setForm] = useState({ name: '', email: '', password: '' });

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (mode === 'signup') {
      signUp({ name: form.name, email: form.email });
    } else {
      signIn({ name: form.name, email: form.email, password: form.password });
    }

    navigate('/');
  }

  return (
    <div className="auth-page">
      <main className="auth-simple">
        <section className="auth-card auth-card-compact">
          <div className="auth-card-header">
            <h2>{isAuthenticated ? `Welcome back, ${user?.name}` : mode === 'signup' ? 'Create your account' : 'Log in'}</h2>
            <button className="account-panel-link" type="button" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
              {mode === 'signup' ? 'Already have an account?' : 'Need an account?'}
            </button>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <label className="auth-field">
                <span>Full name</span>
                <input name="name" placeholder="Your name" value={form.name} onChange={handleChange} />
              </label>
            )}

            <label className="auth-field">
              <span>Email</span>
              <input name="email" type="email" placeholder="you@example.com" value={form.email} onChange={handleChange} />
            </label>

            <label className="auth-field">
              <span>Password</span>
              <input name="password" type="password" placeholder="Any password for this demo" value={form.password} onChange={handleChange} />
            </label>

            <button className="btn-primary auth-submit" type="submit">
              {mode === 'signup' ? <UserPlus2 size={14} /> : <LogIn size={14} />}
              {mode === 'signup' ? 'Create account' : 'Log in'}
            </button>
          </form>

          <button className="btn-secondary auth-secondary" type="button" onClick={() => navigate('/')}>
            Back to dashboard
          </button>
        </section>
      </main>
    </div>
  );
}
