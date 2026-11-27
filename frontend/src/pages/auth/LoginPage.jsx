import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';

const roleHomePaths = {
  admin: '/admin',
  kitchen: '/kitchen',
  waiter: '/waiter',
};

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const user = await login(formData);
      const requestedPath = location.state?.from?.pathname;
      navigate(requestedPath || roleHomePaths[user.role] || '/', { replace: true });
    } catch (error) {
      setErrorMessage(
        error.response?.data?.message || 'Login failed. Please check your credentials.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-panel" aria-labelledby="login-title">
      <div>
        <p className="eyebrow">Hafiz Foods Staff</p>
        <h2 id="login-title">Staff Login</h2>
        <p>Admin, kitchen staff and waiters use this page to access their dashboards.</p>
      </div>

      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          Email
          <input
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            autoComplete="email"
            required
          />
        </label>

        <div className="staff-password-field">
          <label htmlFor="staff-password">Password</label>
          <div className="staff-password-input">
            <input
              id="staff-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={handleChange}
              autoComplete="current-password"
              minLength={8}
              required
            />
            <button
              type="button"
              className="staff-password-toggle"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((visible) => !visible)}
            >
              {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </button>
          </div>
        </div>

        {errorMessage && <p className="form-error">{errorMessage}</p>}

        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </section>
  );
}

export default LoginPage;
