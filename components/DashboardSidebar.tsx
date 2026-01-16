'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoutButton } from './LogoutButton';

type NavItem = {
  label: string;
  href: string;
};

const navItems: NavItem[] = [
  { label: 'Inbox', href: '/dashboard' },
  { label: 'Appointments', href: '/dashboard/appointments' },
  { label: 'Flow Builder', href: '/dashboard/flows' },
  { label: 'Custom Messages', href: '/dashboard/custom-messages' },
  { label: 'Functions', href: '/dashboard/functions' },
  { label: 'Settings', href: '/dashboard/settings' },
];

export function DashboardSidebar({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  return (
    <aside className="dashboard-sidebar">
      <div className="sidebar-top">
        <div className="sidebar-brand">
          <div className="brand-dot" />
          <div>
            <div className="brand-title">WhatsApp Cloud</div>
            {userEmail ? <div className="brand-subtitle">{userEmail}</div> : null}
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="Dashboard navigation">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${isActive(item.href) ? 'active' : ''}`}
            >
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
      <div className="sidebar-footer">
        <LogoutButton />
      </div>
    </aside>
  );
}
