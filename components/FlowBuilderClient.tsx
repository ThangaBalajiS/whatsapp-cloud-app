'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DashboardSidebar } from './DashboardSidebar';

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

type ConnectionTarget = {
  targetType: 'template' | 'function';
  target: string;
};

type ConnectionMap = Record<string, ConnectionTarget>;

type FlowFunction = {
  name: string;
  description?: string;
  code: string;
  inputKey: string;
  timeoutMs: number;
  nextTemplate?: string;
};

type FlowConnectionDto = {
  sourceTemplate: string;
  button: string;
  targetType: 'template' | 'function';
  target: string;
};

const migrateConnections = (raw: unknown): ConnectionMap => {
  if (!raw || typeof raw !== 'object') return {};
  const result: ConnectionMap = {};
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    if (typeof value === 'string') {
      result[key] = { targetType: 'template', target: value };
    } else if (
      value &&
      typeof value === 'object' &&
      'targetType' in value &&
      'target' in value
    ) {
      const target = value as ConnectionTarget;
      result[key] = {
        targetType: target.targetType,
        target: target.target,
      };
    }
  });
  return result;
};

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

const defaultFunctionCode = `module.exports = async ({ input, context }) => {
  // input: value captured from the customer
  // context: helper info like userId
  return {
    processedValue: input,
    echo: true,
    user: context.userId,
  };
};`;

export default function FlowBuilderClient({
  userEmail,
  userId,
  hasWhatsAppAccount,
}: Props) {
  const storageKey = useMemo(() => `flow-builder-connections-${userId}`, [userId]);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [connections, setConnections] = useState<ConnectionMap>({});
  const [functions, setFunctions] = useState<FlowFunction[]>([]);
  const [flowName, setFlowName] = useState('Default Flow');
  const [savingFlow, setSavingFlow] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [functionForm, setFunctionForm] = useState<FlowFunction>({
    name: '',
    description: '',
    code: defaultFunctionCode,
    inputKey: 'input',
    timeoutMs: 5000,
    nextTemplate: '',
  });
  const [testInput, setTestInput] = useState('');
  const [testFunctionName, setTestFunctionName] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Load saved connections
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.connections) {
          setConnections(migrateConnections(parsed.connections));
        }
        if (parsed.functions) {
          setFunctions(parsed.functions);
        }
        if (parsed.flowName) {
          setFlowName(parsed.flowName);
        }
      }
    } catch (err) {
      console.error('Failed to read saved connections', err);
    }
  }, [storageKey]);

  // Persist connections
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ connections, functions, flowName })
      );
    } catch (err) {
      console.error('Failed to persist connections', err);
    }
  }, [connections, functions, flowName, storageKey]);

  useEffect(() => {
    if (!hasWhatsAppAccount) {
      setLoading(false);
      return;
    }
    fetchTemplates();
    fetchFlow();
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

  const fetchFlow = async () => {
    try {
      const res = await fetch('/api/flows', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        if (data?.message) {
          setError(data.message);
        }
        return;
      }
      if (data.flow) {
        const flow = data.flow;
        setFlowName(flow.name || 'Default Flow');
        setConnections(connectionsFromDto(flow.connections || []));
        setFunctions(flow.functions || []);
      }
    } catch (err: any) {
      setError(err.message || 'Unable to load flow');
    }
  };

  const handleConnectionChange = (key: string, value: string) => {
    if (!value) {
      setConnections((prev) => {
        const { [key]: _remove, ...rest } = prev;
        return rest;
      });
      return;
    }

    const [targetType, target] = value.split('::');
    if (targetType !== 'template' && targetType !== 'function') {
      return;
    }

    setConnections((prev) => {
      return { ...prev, [key]: { targetType, target } };
    });
  };

  const resetConnections = () => {
    setConnections({});
  };

  const connectionList = Object.entries(connections).map(([key, target]) => {
    const [source, button] = key.split('::');
    return { source, button, target };
  });

  const connectionsFromDto = (list: FlowConnectionDto[]): ConnectionMap =>
    list.reduce((acc, conn) => {
      const key = buildButtonKey(conn.sourceTemplate, { text: conn.button }, 0);
      acc[key] = { targetType: conn.targetType, target: conn.target };
      return acc;
    }, {} as ConnectionMap);

  const connectionsToDto = (): FlowConnectionDto[] =>
    Object.entries(connections).map(([key, target]) => {
      const [sourceTemplate, button] = key.split('::');
      return {
        sourceTemplate,
        button,
        targetType: target.targetType,
        target: target.target,
      };
    });

  const addFunction = () => {
    const name = functionForm.name.trim();
    if (!name) {
      setError('Function name is required.');
      return;
    }
    if (!functionForm.code.trim()) {
      setError('Function code cannot be empty.');
      return;
    }
    setError(null);
    setFunctions((prev) => {
      const filtered = prev.filter((fn) => fn.name !== name);
      return [
        ...filtered,
        {
          ...functionForm,
          timeoutMs: Number(functionForm.timeoutMs) || 5000,
        },
      ];
    });
    setFunctionForm({
      name: '',
      description: '',
      code: defaultFunctionCode,
      inputKey: 'input',
      timeoutMs: 5000,
      nextTemplate: '',
    });
  };

  const removeFunction = (name: string) => {
    setFunctions((prev) => prev.filter((fn) => fn.name !== name));
    setConnections((prev) => {
      const next: ConnectionMap = {};
      Object.entries(prev).forEach(([key, target]) => {
        if (target.targetType === 'function' && target.target === name) {
          return;
        }
        next[key] = target;
      });
      return next;
    });
  };

  const saveFlow = async () => {
    setSavingFlow(true);
    setSaveStatus('Saving…');
    setError(null);
    try {
      const payload = {
        name: flowName,
        connections: connectionsToDto(),
        functions,
      };
      const res = await fetch('/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || 'Failed to save flow');
      }
      if (data.flow) {
        setConnections(connectionsFromDto(data.flow.connections || []));
        setFunctions(data.flow.functions || []);
        setFlowName(data.flow.name || flowName);
      }
      setSaveStatus('Saved');
    } catch (err: any) {
      setError(err.message || 'Unable to save flow');
      setSaveStatus(null);
    } finally {
      setSavingFlow(false);
    }
  };

  const testFunction = async () => {
    setTestError(null);
    setTestResult(null);
    if (!testFunctionName) {
      setTestError('Pick a function to test.');
      return;
    }
    try {
      const res = await fetch('/api/flows/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          functionName: testFunctionName,
          input: testInput,
          context: { preview: true },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || 'Failed to run function');
      }
      setTestResult(JSON.stringify(data.result, null, 2));
    } catch (err: any) {
      setTestError(err.message || 'Function test failed');
    }
  };

  if (!hasWhatsAppAccount) {
    return (
      <main className="dashboard-container">
        <div className="dashboard-body">
          <DashboardSidebar userEmail={userEmail} />
          <div className="dashboard-content">
            <header className="dashboard-header">
              <div>
                <h1>Flow Builder</h1>
                <p className="lead">Signed in as {userEmail}</p>
              </div>
            </header>
            <div className="card setup-prompt">
              <h2>Connect WhatsApp first</h2>
              <p>Configure your WhatsApp Cloud API credentials to pull templates.</p>
              <Link href="/dashboard/settings" className="btn-primary">
                Go to Settings →
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-container">
      <div className="dashboard-body">
        <DashboardSidebar userEmail={userEmail} />
        <div className="dashboard-content">
          <header className="dashboard-header">
            <div>
              <h1>Flow Builder</h1>
              <p className="lead">Signed in as {userEmail}</p>
            </div>
          </header>

          <div className="builder-actions">
            <div className="pill">
              {loading ? 'Loading templates…' : `${templates.length} templates`}
            </div>
            <div className="builder-action-buttons">
              <input
                value={flowName}
                onChange={(e) => setFlowName(e.target.value)}
                placeholder="Flow name"
                className="small-input"
              />
              <button className="ghost-btn" onClick={fetchTemplates} disabled={loading}>
                Refresh
              </button>
              <button className="ghost-btn" onClick={resetConnections} disabled={!connectionList.length}>
                Clear links
              </button>
              <button className="btn-primary" onClick={saveFlow} disabled={savingFlow}>
                {savingFlow ? 'Saving…' : 'Save flow'}
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
                          const selected = connections[key];
                          const value = selected ? `${selected.targetType}::${selected.target}` : '';
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
                                    <option key={t.name} value={`template::${t.name}`}>
                                      {t.name}
                                    </option>
                                  ))}
                                {functions.map((fn) => (
                                  <option key={fn.name} value={`function::${fn.name}`}>
                                    Function: {fn.name}
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
                  {connectionList.map((conn) => {
                    const functionTarget = functions.find((fn) => fn.name === conn.target.target);
                    return (
                      <div key={`${conn.source}-${conn.button}`} className="connection-card vertical">
                        <div className="flow-node">
                          <div className="node-title">{conn.source}</div>
                          <div className="node-subtitle">button: {conn.button}</div>
                        </div>
                        <div className="flow-arrow vertical">↓</div>
                        {conn.target.targetType === 'function' ? (
                          <>
                            <div className="flow-node target">
                              <div className="node-title">fn: {conn.target.target}</div>
                              <div className="node-subtitle">runs with input</div>
                            </div>
                            {functionTarget?.nextTemplate ? (
                              <>
                                <div className="flow-arrow vertical">↓</div>
                                <div className="flow-node target">
                                  <div className="node-title">{functionTarget.nextTemplate}</div>
                                  <div className="node-subtitle">next template</div>
                                </div>
                              </>
                            ) : null}
                          </>
                        ) : (
                          <div className="flow-node target">
                            <div className="node-title">{conn.target.target}</div>
                            <div className="node-subtitle">opens on reply</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Functions UI hidden for now */}
          </div>

          {saveStatus && <div className="status success">{saveStatus}</div>}
        </div>
      </div>
    </main>
  );
}


