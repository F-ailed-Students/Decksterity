import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { LogIn, UserPlus2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function AuthField({ label, ...inputProps }) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      <input {...inputProps} />
    </label>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const { signIn, signUp, isAuthenticated, user } = useAuth();
  const [mode, setMode] = useState('signin');
  const [form, setForm] = useState({ name: '', email: '', password: '' });

  const isSignup = mode === 'signup';
  const title = isAuthenticated
    ? `Welcome back, ${user?.name}`
    : isSignup
      ? 'Create your account'
      : 'Log in';
  const SubmitIcon = isSignup ? UserPlus2 : LogIn;

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (isSignup) {
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
            <h2>{title}</h2>
            <button
              className="account-panel-link"
              type="button"
              onClick={() => setMode(isSignup ? 'signin' : 'signup')}
            >
              {isSignup ? 'Already have an account?' : 'Need an account?'}
            </button>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {isSignup && (
              <AuthField
                label="Full name"
                name="name"
                placeholder="Your name"
                value={form.name}
                onChange={handleChange}
              />
            )}

            <AuthField
              label="Email"
              name="email"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
            />

            <AuthField
              label="Password"
              name="password"
              type="password"
              placeholder="Any password for this demo"
              value={form.password}
              onChange={handleChange}
            />

            <button className="btn-primary auth-submit" type="submit">
              <SubmitIcon size={14} />
              {isSignup ? 'Create account' : 'Log in'}
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
