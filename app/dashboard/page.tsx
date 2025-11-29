import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { LogoutButton } from '../../components/LogoutButton';
import { getUserFromSession } from '../../lib/auth';

export default async function DashboardPage() {
  const cookieStore = cookies();
  const session = cookieStore.get('session');
  const user = await getUserFromSession(session?.value);

  if (!user) {
    redirect('/');
  }

  return (
    <main className="container">
      <header>
        <h1>Dashboard</h1>
        <p className="lead">Signed in as {user.email}</p>
      </header>

      <div className="card">
        <div className="status">You are authenticated. This page is protected.</div>

        <div className="link-row">
          <Link href="/">Back to login</Link>
          <LogoutButton />
        </div>
      </div>
    </main>
  );
}
