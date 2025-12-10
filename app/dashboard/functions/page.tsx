import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DashboardSidebar } from '../../../components/DashboardSidebar';
import { getUserFromSession } from '../../../lib/auth';

export default async function FunctionsPage() {
  const cookieStore = cookies();
  const session = cookieStore.get('session');
  const user = await getUserFromSession(session?.value);

  if (!user) {
    redirect('/');
  }

  return (
    <main className="dashboard-container">
      <div className="dashboard-body">
        <DashboardSidebar userEmail={user.email} />
        <div className="dashboard-content">
          <header className="dashboard-header">
            <div>
              <h1>Functions</h1>
              <p className="lead">Manage custom functions between templates</p>
            </div>
          </header>

          <div className="card">
            <h2>Temporarily hidden</h2>
            <p className="muted">
              Functions are currently hidden from the flow builder view. You can keep building
              flows and links; we will re-enable function editing here shortly.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
