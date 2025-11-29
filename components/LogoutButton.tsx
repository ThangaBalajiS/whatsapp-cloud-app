'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    await fetch('/api/logout', { method: 'POST' });
    router.replace('/');
    router.refresh();
  };

  return (
    <button className="small-btn" onClick={handleSignOut} disabled={loading}>
      {loading ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
