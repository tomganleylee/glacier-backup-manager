import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Glacier Backup Manager',
  description: 'NAS backup management for AWS S3 Glacier Deep Archive',
};

function NavLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white rounded-lg transition-colors"
    >
      <span className="text-lg">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white">
        <div className="flex h-screen">
          {/* Sidebar */}
          <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
            <div className="p-4 border-b border-gray-800">
              <h1 className="text-lg font-bold text-blue-400">Glacier Backup</h1>
              <p className="text-xs text-gray-500">NAS Backup Manager</p>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              <NavLink href="/" label="Dashboard" icon="&#x1F4CA;" />
              <NavLink href="/files" label="File Browser" icon="&#x1F4C1;" />
              <NavLink href="/shows" label="Shows" icon="&#x1F4FA;" />
              <NavLink href="/transcode" label="Transcode" icon="&#x1F3AC;" />
              <NavLink href="/manifest" label="Manifest" icon="&#x1F4CB;" />
              <NavLink href="/settings" label="Settings" icon="&#x2699;" />
            </nav>
            <div className="p-4 border-t border-gray-800 text-xs text-gray-600">
              <p>v0.1.0</p>
            </div>
          </aside>
          {/* Main content */}
          <main className="flex-1 overflow-auto">
            <div className="p-6 max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
