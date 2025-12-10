'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { LogoutButton } from './LogoutButton';

type TemplateButton = {
  type?: string;
  text?: string;
  url?: string;
  phone_number?: string;
};

type TemplateComponent = {
  type: string;
  text?: string;
  buttons?: TemplateButton[];
};

type Template = {
  name: string;
  status: string;
  category: string;
  language: string;
  components?: TemplateComponent[];
};

type Props = {
  userEmail: string;
  userId: string;
  hasWhatsAppAccount: boolean;
};

type ConnectionMap = Record<string, string>;

const readBodyText = (components?: TemplateComponent[]) => {
  const header = components?.find((c) => c.type === 'HEADER')?.text;
  const body = components?.find((c) => c.type === 'BODY')?.text;
  return header ? `${header}\n\n${body || ''}` : body || '';
};

const extractButtons = (components?: TemplateComponent[]) =>
  components
    ?.filter((c) => c.type === 'BUTTONS')
    .flatMap((c) => c.buttons?.map((button) => button) || []) || [];

const buildButtonKey = (templateName: string, button: TemplateButton, index: number) => {
  const label = button.text || button.type || `button-${index}`;
  return `${templateName}::${label}`;
};

export default function FlowBuilderClient({
  userEmail,
  userId,
  hasWhatsAppAccount,
}: Props) {
  const storageKey = useMemo(() => `flow-builder-connections-${userId}`, [userId]);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [connections, setConnections] = useState<ConnectionMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load saved connections
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setConnections(JSON.parse(saved));
      }
    } catch (err) {
      console.error('Failed to read saved connections', err);
    }
  }, [storageKey]);

  // Persist connections
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(connections));
    } catch (err) {
      console.error('Failed to persist connections', err);
    }
  }, [connections, storageKey]);

  useEffect(() => {
    if (!hasWhatsAppAccount) {
      setLoading(false);
      return;
    }
    fetchTemplates();
  }, [hasWhatsAppAccount]);

  const fetchTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/whatsapp/templates');
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || 'Failed to load templates');
      }

      setTemplates(data.templates || []);
    } catch (err: any) {
      setError(err.message || 'Unable to fetch templates');
    } finally {
      setLoading(false);
    }
  };

  const handleConnectionChange = (key: string, targetTemplate: string) => {
    setConnections((prev) => {
      if (!targetTemplate) {
        const { [key]: _remove, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: targetTemplate };
    });
  };

  const resetConnections = () => {
    setConnections({});
  };

  const connectionList = Object.entries(connections).map(([key, target]) => {
    const [source, button] = key.split('::');
    return { source, button, target };
  });

  if (!hasWhatsAppAccount) {
    return (
      <main className="dashboard-container">
        <header className="dashboard-header">
          <div>
            <h1>Flow Builder</h1>
            <p className="lead">Signed in as {userEmail}</p>
          </div>
          <div className="header-actions">
            <Link href="/dashboard/settings" className="small-btn">
              Settings
            </Link>
            <LogoutButton />
          </div>
        </header>
        <div className="card setup-prompt">
          <h2>Connect WhatsApp first</h2>
          <p>Configure your WhatsApp Cloud API credentials to pull templates.</p>
          <Link href="/dashboard/settings" className="btn-primary">
            Go to Settings →
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-container">
      <header className="dashboard-header">
        <div>
          <h1>Flow Builder</h1>
          <p className="lead">Signed in as {userEmail}</p>
        </div>
        <div className="header-actions">
          <Link href="/dashboard" className="small-btn">
            Inbox
          </Link>
          <Link href="/dashboard/settings" className="small-btn">
            Settings
          </Link>
          <LogoutButton />
        </div>
      </header>

      <div className="builder-actions">
        <div className="pill">
          {loading ? 'Loading templates…' : `${templates.length} templates`}
        </div>
        <div className="builder-action-buttons">
          <button className="ghost-btn" onClick={fetchTemplates} disabled={loading}>
            Refresh
          </button>
          <button className="ghost-btn" onClick={resetConnections} disabled={!connectionList.length}>
            Clear links
          </button>
        </div>
      </div>

      <div className="flow-builder">
        <section className="flow-column template-column">
          <div className="column-header">
            <h2>Templates</h2>
            <p className="muted">Map quick-reply buttons to next steps.</p>
          </div>

          {error && <div className="status error">{error}</div>}

          {loading ? (
            <div className="loading-templates">Loading templates…</div>
          ) : templates.length === 0 ? (
            <div className="empty-state">
              <p>No templates found for this account.</p>
              <span className="muted">
                Create templates in Meta and refresh to see them here.
              </span>
            </div>
          ) : (
            <div className="template-grid">
              {templates.map((template) => {
                const bodyText = readBodyText(template.components);
                const buttons = extractButtons(template.components);

                return (
                  <div key={template.name} className="template-card card">
                    <div className="template-card-header">
                      <div>
                        <div className="template-name">{template.name}</div>
                        <div className="template-meta">
                          <span className="pill small">{template.category}</span>
                          <span className="pill small">{template.language}</span>
                        </div>
                      </div>
                      <span
                        className={`status-indicator ${template.status === 'APPROVED' ? 'connected' : 'disconnected'}`}
                      >
                        <span className="status-dot" />
                        {template.status.toLowerCase()}
                      </span>
                    </div>

                    {bodyText && (
                      <pre className="template-body" aria-label="Template body">
                        {bodyText}
                      </pre>
                    )}

                    {buttons.length > 0 ? (
                      <div className="button-links">
                        <div className="button-links-title">Buttons</div>
                        {buttons.map((button, index) => {
                          const key = buildButtonKey(template.name, button, index);
                          const value = connections[key] || '';
                          return (
                            <div key={key} className="button-link-row">
                              <div className="button-chip">
                                {button.text || button.type || 'Button'}
                              </div>
                              <select
                                value={value}
                                onChange={(e) => handleConnectionChange(key, e.target.value)}
                              >
                                <option value="">Not connected</option>
                                {templates
                                  .filter((t) => t.name !== template.name)
                                  .map((t) => (
                                    <option key={t.name} value={t.name}>
                                      {t.name}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="muted small-text">No buttons in this template.</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="flow-column connections-column card">
          <div className="column-header">
            <h2>Connections</h2>
            <p className="muted">Visual map of how buttons route to templates.</p>
          </div>

          {connectionList.length === 0 ? (
            <div className="empty-state">
              <p>No connections yet</p>
              <span className="muted">Select a target template for any button to create a link.</span>
            </div>
          ) : (
            <div className="connections-board">
              {connectionList.map((conn) => (
                <div key={`${conn.source}-${conn.button}`} className="connection-card">
                  <div className="flow-node">
                    <div className="node-title">{conn.source}</div>
                    <div className="node-subtitle">button: {conn.button}</div>
                  </div>
                  <div className="flow-arrow">→</div>
                  <div className="flow-node target">
                    <div className="node-title">{conn.target}</div>
                    <div className="node-subtitle">opens on reply</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}


