'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function HomePage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setStatus('');

    const res = await fetch('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.message ?? 'Unable to sign in');
      setLoading(false);
      return;
    }

    setStatus('Signed in. Redirecting to dashboard...');
    setLoading(false);
    router.push('/dashboard');
  };

  return (
    <main className="container">
      <header>
        <h1>WhatsApp Cloud App</h1>
        <p className="lead">Sign in to your account to continue.</p>
      </header>

      <div className="card">
        <form onSubmit={handleSubmit}>
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
              autoComplete="current-password"
            />
          </label>

          <button type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          {status && <div className="status">{status}</div>}
          {error && <div className="status error">{error}</div>}
        </form>

        <div className="link-row">
          <span>Don&apos;t have an account?</span>
          <Link href="/signup" className="small-btn">
            Sign up
          </Link>
        </div>
      </div>
    </main>
  );
}
