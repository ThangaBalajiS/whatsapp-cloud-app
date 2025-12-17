'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DashboardSidebar } from './DashboardSidebar';

type TriggerMatchType = 'any' | 'includes' | 'starts_with' | 'exact';

type FlowTrigger = {
  matchType: TriggerMatchType;
  matchText: string;
};

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

type FlowConnection = {
  sourceTemplate: string;
  button?: string;
  targetType: 'template' | 'function' | 'custom_message';
  target: string;
  nextTemplate?: string;
};

type CustomMessage = {
  _id: string;
  name: string;
  content: string;
  buttons: { type: string; text: string; payload?: string; url?: string; phone?: string }[];
  placeholders: string[];
};

type FlowFunction = {
  _id: string;
  name: string;
  description?: string;
  code: string;
  inputKey: string;
  timeoutMs: number;
  nextTemplate?: string;
};

type Flow = {
  _id: string;
  name: string;
  trigger: FlowTrigger;
  firstTemplate: string;
  connections: FlowConnection[];
  functions: any[];
  createdAt: string;
  updatedAt: string;
};

type Props = {
  userEmail: string;
  userId: string;
  hasWhatsAppAccount: boolean;
};

type ViewMode = 'list' | 'builder';

type FlowNode = {
  type: 'trigger' | 'template';
  templateName?: string;
  buttons?: { text: string; targetTemplate?: string }[];
};

export default function FlowBuilderClient({
  userEmail,
  userId,
  hasWhatsAppAccount,
}: Props) {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [customMessages, setCustomMessages] = useState<CustomMessage[]>([]);
  const [functions, setFunctions] = useState<FlowFunction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null);

  // Builder state
  const [flowName, setFlowName] = useState('New Flow');
  const [trigger, setTrigger] = useState<FlowTrigger>({ matchType: 'any', matchText: '' });
  const [firstTemplate, setFirstTemplate] = useState('');
  const [connections, setConnections] = useState<FlowConnection[]>([]);
  const [saving, setSaving] = useState(false);

  // Modal states
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showFunctionModal, setShowFunctionModal] = useState(false);
  const [pickerTab, setPickerTab] = useState<'templates' | 'custom'>('templates');
  const [pendingButtonConnection, setPendingButtonConnection] = useState<{
    sourceTemplate: string;
    button: string;
  } | null>(null);
  const [pendingFunctionConnection, setPendingFunctionConnection] = useState<{
    sourceTemplate: string;
  } | null>(null);
  const [pendingFunctionNextTemplate, setPendingFunctionNextTemplate] = useState<{
    sourceTemplate: string;
    functionName: string;
  } | null>(null);

  useEffect(() => {
    if (hasWhatsAppAccount) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [hasWhatsAppAccount]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [flowsRes, templatesRes, customMsgRes, functionsRes] = await Promise.all([
        fetch('/api/flows'),
        fetch('/api/whatsapp/templates'),
        fetch('/api/custom-messages'),
        fetch('/api/functions'),
      ]);

      const flowsData = await flowsRes.json();
      if (flowsRes.ok) {
        setFlows(flowsData.flows || []);
      }

      const templatesData = await templatesRes.json();
      if (templatesRes.ok) {
        setTemplates(templatesData.templates || []);
      }

      const customMsgData = await customMsgRes.json();
      if (customMsgRes.ok) {
        setCustomMessages(customMsgData.messages || []);
      }

      const functionsData = await functionsRes.json();
      if (functionsRes.ok) {
        setFunctions(functionsData.functions || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const createNewFlow = () => {
    setSelectedFlow(null);
    setFlowName('New Flow');
    setTrigger({ matchType: 'any', matchText: '' });
    setFirstTemplate('');
    setConnections([]);
    setViewMode('builder');
  };

  const editFlow = (flow: Flow) => {
    setSelectedFlow(flow);
    setFlowName(flow.name);
    setTrigger(flow.trigger || { matchType: 'any', matchText: '' });
    setFirstTemplate(flow.firstTemplate || '');
    setConnections(flow.connections || []);
    setViewMode('builder');
  };

  const deleteFlow = async (flowId: string) => {
    if (!confirm('Are you sure you want to delete this flow?')) return;

    try {
      const res = await fetch(`/api/flows/${flowId}`, { method: 'DELETE' });
      if (res.ok) {
        setFlows(flows.filter(f => f._id !== flowId));
        setSuccess('Flow deleted');
      } else {
        const data = await res.json();
        setError(data.message || 'Failed to delete flow');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete flow');
    }
  };

  const saveFlow = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        name: flowName,
        trigger,
        firstTemplate,
        connections,
        functions: selectedFlow?.functions || [],
      };

      const url = selectedFlow ? `/api/flows/${selectedFlow._id}` : '/api/flows';
      const method = selectedFlow ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save flow');

      setSuccess(selectedFlow ? 'Flow updated!' : 'Flow created!');
      await fetchData();
      setViewMode('list');
    } catch (err: any) {
      setError(err.message || 'Failed to save flow');
    } finally {
      setSaving(false);
    }
  };

  const cancelBuilder = () => {
    setViewMode('list');
    setSelectedFlow(null);
  };

  const selectFirstTemplate = (templateName: string) => {
    setFirstTemplate(templateName);
    setShowTemplateModal(false);
  };

  const selectButtonTarget = (targetTemplate: string) => {
    if (pendingButtonConnection) {
      const key = `${pendingButtonConnection.sourceTemplate}::${pendingButtonConnection.button}`;
      setConnections(prev => {
        const filtered = prev.filter(
          c => !(c.sourceTemplate === pendingButtonConnection.sourceTemplate &&
            c.button === pendingButtonConnection.button)
        );
        return [...filtered, {
          sourceTemplate: pendingButtonConnection.sourceTemplate,
          button: pendingButtonConnection.button,
          targetType: 'template' as const,
          target: targetTemplate,
        }];
      });
    }
    setPendingButtonConnection(null);
    setShowTemplateModal(false);
  };

  const getTemplateButtons = (templateName: string): TemplateButton[] => {
    // Check if it's a custom message (prefixed with "custom:")
    if (templateName.startsWith('custom:')) {
      const customMsgName = templateName.replace('custom:', '');
      const customMsg = customMessages.find(m => m.name === customMsgName);
      if (customMsg && customMsg.buttons.length > 0) {
        // Convert custom message buttons to TemplateButton format
        return customMsg.buttons.map(btn => ({
          type: btn.type === 'quick_reply' ? 'QUICK_REPLY' : btn.type,
          text: btn.text,
        }));
      }
      return [];
    }

    // Regular WhatsApp template
    const template = templates.find(t => t.name === templateName);
    if (!template) return [];
    return template.components
      ?.filter(c => c.type === 'BUTTONS')
      .flatMap(c => c.buttons || []) || [];
  };

  const getButtonTarget = (sourceTemplate: string, button: string): string | undefined => {
    const conn = connections.find(
      c => c.sourceTemplate === sourceTemplate && c.button === button
    );
    // Return target for both template and custom_message types
    return (conn?.targetType === 'template' || conn?.targetType === 'custom_message') ? conn.target : undefined;
  };

  const removeConnection = (sourceTemplate: string, button: string) => {
    setConnections(prev => prev.filter(
      c => !(c.sourceTemplate === sourceTemplate && c.button === button)
    ));
  };

  const getTriggerLabel = (trigger: FlowTrigger | undefined) => {
    if (!trigger || trigger.matchType === 'any') return 'Any message';
    const labels: Record<string, string> = {
      includes: 'includes',
      starts_with: 'starts with',
      exact: 'exactly matches',
    };
    return `Message ${labels[trigger.matchType]} "${trigger.matchText || ''}"`;
  };

  // Get function connection for a template (templates without buttons)
  const getFunctionConnection = (sourceTemplate: string) => {
    return connections.find(
      c => c.sourceTemplate === sourceTemplate && c.targetType === 'function' && !c.button
    );
  };

  // Remove function connection
  const removeFunctionConnection = (sourceTemplate: string) => {
    setConnections(prev => prev.filter(
      c => !(c.sourceTemplate === sourceTemplate && c.targetType === 'function' && !c.button)
    ));
  };

  // Select function for a template
  const selectFunction = (functionName: string) => {
    if (pendingFunctionConnection) {
      // Save the function selection and ask for next template
      setPendingFunctionNextTemplate({
        sourceTemplate: pendingFunctionConnection.sourceTemplate,
        functionName,
      });
      setPendingFunctionConnection(null);
      setShowFunctionModal(false);
      setShowTemplateModal(true);
    }
  };

  // Select next template after function
  const selectFunctionNextTemplate = (nextTemplate: string) => {
    if (pendingFunctionNextTemplate) {
      setConnections(prev => {
        const filtered = prev.filter(
          c => !(c.sourceTemplate === pendingFunctionNextTemplate.sourceTemplate &&
            c.targetType === 'function' && !c.button)
        );
        return [...filtered, {
          sourceTemplate: pendingFunctionNextTemplate.sourceTemplate,
          targetType: 'function' as const,
          target: pendingFunctionNextTemplate.functionName,
          nextTemplate: nextTemplate,
        }];
      });
    }
    setPendingFunctionNextTemplate(null);
    setShowTemplateModal(false);
  };

  // Render template selection modal with tabs
  const renderTemplateModal = () => {
    const handleSelectItem = (name: string, type: 'template' | 'custom_message') => {
      // For custom messages, always use the prefixed name for consistency
      const targetName = type === 'custom_message' ? `custom:${name}` : name;

      if (pendingFunctionNextTemplate) {
        selectFunctionNextTemplate(targetName);
      } else if (pendingButtonConnection) {
        // For button connections, store with the prefixed name
        const conn: FlowConnection = {
          sourceTemplate: pendingButtonConnection.sourceTemplate,
          button: pendingButtonConnection.button,
          targetType: type === 'custom_message' ? 'custom_message' : 'template',
          target: targetName,
        };
        setConnections(prev => [...prev.filter(c =>
          c.sourceTemplate !== pendingButtonConnection.sourceTemplate ||
          c.button !== pendingButtonConnection.button
        ), conn]);
        setPendingButtonConnection(null);
        setShowTemplateModal(false);
      } else {
        // First template/message
        setFirstTemplate(targetName);
        setShowTemplateModal(false);
      }
    };

    return (
      <div className="modal-overlay" onClick={() => {
        setShowTemplateModal(false);
        setPendingButtonConnection(null);
        setPendingFunctionNextTemplate(null);
        setPickerTab('templates');
      }}>
        <div className="modal-content template-select-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>{pendingFunctionNextTemplate ? 'Select Next Message' : 'Select Message'}</h2>
            <button className="modal-close" onClick={() => {
              setShowTemplateModal(false);
              setPendingButtonConnection(null);
              setPendingFunctionNextTemplate(null);
              setPickerTab('templates');
            }}>×</button>
          </div>
          <div className="picker-tabs">
            <button
              className={`picker-tab ${pickerTab === 'templates' ? 'active' : ''}`}
              onClick={() => setPickerTab('templates')}
            >
              📋 Templates
            </button>
            <button
              className={`picker-tab ${pickerTab === 'custom' ? 'active' : ''}`}
              onClick={() => setPickerTab('custom')}
            >
              💬 Custom Messages
            </button>
          </div>
          <div className="modal-body">
            {pickerTab === 'templates' ? (
              <div className="template-select-grid">
                {templates.filter(t => t.status === 'APPROVED').length === 0 ? (
                  <div className="empty-state-small">
                    <p>No approved templates found.</p>
                    <span className="muted small-text">Create templates in your WhatsApp Business Manager.</span>
                  </div>
                ) : (
                  templates.filter(t => t.status === 'APPROVED').map(template => (
                    <button
                      key={template.name}
                      className="template-select-item"
                      onClick={() => handleSelectItem(template.name, 'template')}
                    >
                      <div className="template-select-name">📋 {template.name}</div>
                      <div className="template-select-meta">
                        <span className="pill small">{template.category}</span>
                        <span className="pill small">{template.language}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            ) : (
              <div className="template-select-grid">
                {customMessages.length === 0 ? (
                  <div className="empty-state-small">
                    <p>No custom messages created yet.</p>
                    <Link href="/dashboard/custom-messages" className="btn-primary small">
                      Create Custom Message
                    </Link>
                  </div>
                ) : (
                  customMessages.map(msg => (
                    <button
                      key={msg._id}
                      className="template-select-item"
                      onClick={() => handleSelectItem(msg.name, 'custom_message')}
                    >
                      <div className="template-select-name">💬 {msg.name}</div>
                      <div className="template-select-meta">
                        {msg.placeholders.length > 0 && (
                          <span className="pill small">{msg.placeholders.length} placeholder{msg.placeholders.length !== 1 ? 's' : ''}</span>
                        )}
                        {msg.buttons.length > 0 && (
                          <span className="pill small">{msg.buttons.length} button{msg.buttons.length !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                      <div className="template-select-preview muted small-text">
                        {msg.content.length > 60 ? msg.content.substring(0, 60) + '...' : msg.content}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Render function selection modal
  const renderFunctionModal = () => (
    <div className="modal-overlay" onClick={() => {
      setShowFunctionModal(false);
      setPendingFunctionConnection(null);
    }}>
      <div className="modal-content template-select-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Select Function</h2>
          <button className="modal-close" onClick={() => {
            setShowFunctionModal(false);
            setPendingFunctionConnection(null);
          }}>×</button>
        </div>
        <div className="modal-body">
          {functions.length === 0 ? (
            <div className="empty-state-small">
              <p>No functions created yet.</p>
              <Link href="/dashboard/functions" className="btn-primary small">
                Create Function
              </Link>
            </div>
          ) : (
            <div className="template-select-grid">
              {functions.map(fn => (
                <button
                  key={fn._id}
                  className="template-select-item"
                  onClick={() => selectFunction(fn.name)}
                >
                  <div className="template-select-name">⚡ {fn.name}</div>
                  <div className="template-select-meta">
                    {fn.description && <span className="muted small">{fn.description}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Render a template node in the flow tree
  const renderTemplateNode = (templateName: string, depth = 0): JSX.Element => {
    const buttons = getTemplateButtons(templateName);
    const functionConnection = getFunctionConnection(templateName);
    const isCustomMessage = templateName.startsWith('custom:');
    const displayName = isCustomMessage ? templateName.replace('custom:', '') : templateName;

    return (
      <div className="flow-template-node" key={`${templateName}-${depth}`}>
        <div className="flow-node-card">
          <div className="flow-node-icon">{isCustomMessage ? '💬' : '📋'}</div>
          <div className="flow-node-content">
            <div className="flow-node-title">{displayName}</div>
            <div className="flow-node-subtitle">{isCustomMessage ? 'Custom Message' : 'Template'}</div>
          </div>
        </div>

        {/* Templates with buttons - show button branches */}
        {buttons.length > 0 && (
          <div className="flow-button-branches">
            {buttons.map((button, idx) => {
              const buttonText = button.text || button.type || `Button ${idx + 1}`;
              const targetTemplate = getButtonTarget(templateName, buttonText);

              return (
                <div key={`${templateName}-${buttonText}-${idx}`} className="flow-button-branch">
                  <div className="flow-branch-line">
                    <div className="flow-branch-connector" />
                    <div className="flow-button-label">{buttonText}</div>
                  </div>

                  {targetTemplate ? (
                    <div className="flow-branch-content">
                      <button
                        className="flow-remove-btn"
                        onClick={() => removeConnection(templateName, buttonText)}
                        title="Remove connection"
                      >
                        ×
                      </button>
                      {renderTemplateNode(targetTemplate, depth + 1)}
                    </div>
                  ) : (
                    <button
                      className="flow-add-node-btn"
                      onClick={() => {
                        setPendingButtonConnection({ sourceTemplate: templateName, button: buttonText });
                        setShowTemplateModal(true);
                      }}
                    >
                      <span className="plus-icon">+</span>
                      <span>Add template</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Templates without buttons - show function connection option */}
        {buttons.length === 0 && (
          <div className="flow-function-connection">
            <div className="flow-branch-connector" />

            {functionConnection ? (
              <div className="flow-function-chain">
                <div className="flow-branch-content">
                  <button
                    className="flow-remove-btn"
                    onClick={() => removeFunctionConnection(templateName)}
                    title="Remove connection"
                  >
                    ×
                  </button>
                  <div className="flow-node-card function">
                    <div className="flow-node-icon">⚡</div>
                    <div className="flow-node-content">
                      <div className="flow-node-title">{functionConnection.target}</div>
                      <div className="flow-node-subtitle">Function</div>
                    </div>
                  </div>
                </div>

                {functionConnection.nextTemplate && (
                  <>
                    <div className="flow-branch-connector" />
                    {renderTemplateNode(functionConnection.nextTemplate, depth + 1)}
                  </>
                )}
              </div>
            ) : (
              <button
                className="flow-add-node-btn"
                onClick={() => {
                  setPendingFunctionConnection({ sourceTemplate: templateName });
                  setShowFunctionModal(true);
                }}
              >
                <span className="plus-icon">+</span>
                <span>Add function</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  // No WhatsApp account connected
  if (!hasWhatsAppAccount) {
    return (
      <main className="dashboard-container">
        <div className="dashboard-body">
          <DashboardSidebar userEmail={userEmail} />
          <div className="dashboard-content">
            <header className="dashboard-header">
              <div>
                <h1>Flow Builder</h1>
                <p className="lead">Create automated conversation flows</p>
              </div>
            </header>
            <div className="card setup-prompt">
              <h2>Connect WhatsApp first</h2>
              <p>Configure your WhatsApp Cloud API credentials to create flows.</p>
              <Link href="/dashboard/settings" className="btn-primary">
                Go to Settings →
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Flow Builder View
  if (viewMode === 'builder') {
    return (
      <main className="dashboard-container">
        <div className="dashboard-body">
          <DashboardSidebar userEmail={userEmail} />
          <div className="dashboard-content">
            <header className="dashboard-header">
              <div>
                <h1>{selectedFlow ? 'Edit Flow' : 'Create Flow'}</h1>
                <p className="lead">Configure trigger and template chain</p>
              </div>
              <div className="header-actions">
                <button className="ghost-btn" onClick={cancelBuilder}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={saveFlow} disabled={saving}>
                  {saving ? 'Saving…' : selectedFlow ? 'Update Flow' : 'Create Flow'}
                </button>
              </div>
            </header>

            {error && <div className="status error">{error}</div>}
            {success && <div className="status success">{success}</div>}

            <div className="flow-builder-workspace">
              {/* Flow Name */}
              <div className="flow-name-input">
                <label>Flow Name</label>
                <input
                  value={flowName}
                  onChange={e => setFlowName(e.target.value)}
                  placeholder="Enter flow name"
                />
              </div>

              {/* Flow Canvas */}
              <div className="flow-canvas">
                {/* Trigger Node */}
                <div className="flow-trigger-node">
                  <div className="flow-node-card trigger">
                    <div className="flow-node-icon">📨</div>
                    <div className="flow-node-content">
                      <div className="flow-node-title">Trigger</div>
                      <div className="flow-node-subtitle">When a message arrives</div>
                    </div>
                  </div>

                  <div className="trigger-config">
                    <div className="trigger-options">
                      <label className="trigger-option">
                        <input
                          type="radio"
                          name="triggerType"
                          checked={trigger.matchType === 'any'}
                          onChange={() => setTrigger({ matchType: 'any', matchText: '' })}
                        />
                        <span>Any message</span>
                      </label>
                      <label className="trigger-option">
                        <input
                          type="radio"
                          name="triggerType"
                          checked={trigger.matchType !== 'any'}
                          onChange={() => setTrigger({ matchType: 'includes', matchText: '' })}
                        />
                        <span>Filter messages</span>
                      </label>
                    </div>

                    {trigger.matchType !== 'any' && (
                      <div className="trigger-filter">
                        <input
                          value={trigger.matchText}
                          onChange={e => setTrigger({ ...trigger, matchText: e.target.value })}
                          placeholder="Enter text to match"
                        />
                        <select
                          value={trigger.matchType}
                          onChange={e => setTrigger({ ...trigger, matchType: e.target.value as TriggerMatchType })}
                        >
                          <option value="includes">includes</option>
                          <option value="starts_with">starts with</option>
                          <option value="exact">exact match</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flow-connector-line" />

                {/* First Template or Add Button */}
                {firstTemplate ? (
                  <div className="flow-tree">
                    <button
                      className="flow-remove-first-btn"
                      onClick={() => {
                        setFirstTemplate('');
                        setConnections([]);
                      }}
                      title="Remove template"
                    >
                      ×
                    </button>
                    {renderTemplateNode(firstTemplate)}
                  </div>
                ) : (
                  <button
                    className="flow-add-node-btn large"
                    onClick={() => setShowTemplateModal(true)}
                  >
                    <span className="plus-icon">+</span>
                    <span>Add first template</span>
                  </button>
                )}
              </div>
            </div>

            {showTemplateModal && renderTemplateModal()}
            {showFunctionModal && renderFunctionModal()}
          </div>
        </div>
      </main>
    );
  }

  // Flow List View (Default)
  return (
    <main className="dashboard-container">
      <div className="dashboard-body">
        <DashboardSidebar userEmail={userEmail} />
        <div className="dashboard-content">
          <header className="dashboard-header">
            <div>
              <h1>Flow Builder</h1>
              <p className="lead">Create automated conversation flows</p>
            </div>
            <button className="btn-primary" onClick={createNewFlow}>
              + Create Flow
            </button>
          </header>

          {error && <div className="status error">{error}</div>}
          {success && <div className="status success">{success}</div>}

          {loading ? (
            <div className="loading-state">Loading flows...</div>
          ) : flows.length === 0 ? (
            <div className="empty-state-hero">
              <div className="empty-state-icon">🔀</div>
              <h2>No flows yet</h2>
              <p>Create your first automated conversation flow to respond to customer messages.</p>
              <button className="btn-primary" onClick={createNewFlow}>
                + Create Your First Flow
              </button>
            </div>
          ) : (
            <div className="flows-grid">
              {flows.map(flow => (
                <div key={flow._id} className="flow-card card">
                  <div className="flow-card-header">
                    <div className="flow-card-name">{flow.name}</div>
                    <div className="flow-card-actions">
                      <button className="ghost-btn small" onClick={() => editFlow(flow)}>
                        Edit
                      </button>
                      <button className="ghost-btn small danger" onClick={() => deleteFlow(flow._id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="flow-card-trigger">
                    <span className="flow-trigger-badge">
                      📨 {getTriggerLabel(flow.trigger)}
                    </span>
                  </div>
                  {flow.firstTemplate && (
                    <div className="flow-card-first-template">
                      <span className="muted">First template:</span> {flow.firstTemplate}
                    </div>
                  )}
                  <div className="flow-card-meta muted small-text">
                    Updated {new Date(flow.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
