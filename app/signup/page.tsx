'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setStatus('');

    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, name }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.message ?? 'Unable to sign up');
      setLoading(false);
      return;
    }

    setStatus('Account created! Redirecting to login...');
    setLoading(false);
    setTimeout(() => {
      router.push('/');
    }, 2000);
  };

  return (
    <main className="container">
      <header>
        <h1>Create Account</h1>
        <p className="lead">Sign up to get started.</p>
      </header>

      <div className="card">
        <form onSubmit={handleSubmit}>
          <label>
            Name (optional)
            <input
              type="text"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </label>
          
          <label>
            Email
            <input
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </label>

          <button type="submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Sign up'}
          </button>

          {status && <div className="status">{status}</div>}
          {error && <div className="status error">{error}</div>}
        </form>

        <div className="link-row">
          <span>Already have an account?</span>
          <Link href="/" className="small-btn">
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}

