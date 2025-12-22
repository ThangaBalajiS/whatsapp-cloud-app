'use client';

import { useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { DashboardSidebar } from './DashboardSidebar';

type FlowFunction = {
    _id?: string;
    name: string;
    description?: string;
    code: string;
    inputKey: string;
    timeoutMs: number;
    nextTemplate?: string;
};

type Template = {
    name: string;
    status: string;
    category: string;
    language: string;
};

type Props = {
    userEmail: string;
    userId: string;
    hasWhatsAppAccount: boolean;
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

export default function FunctionsClient({
    userEmail,
    userId,
    hasWhatsAppAccount,
}: Props) {
    const [templates, setTemplates] = useState<Template[]>([]);
    const [functions, setFunctions] = useState<FlowFunction[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [functionForm, setFunctionForm] = useState<FlowFunction>({
        name: '',
        description: '',
        code: defaultFunctionCode,
        inputKey: 'input',
        timeoutMs: 5000,
        nextTemplate: '',
    });
    const [editingFunction, setEditingFunction] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [testInput, setTestInput] = useState('');
    const [testFunctionName, setTestFunctionName] = useState('');
    const [testResult, setTestResult] = useState<string | null>(null);
    const [testError, setTestError] = useState<string | null>(null);

    useEffect(() => {
        if (hasWhatsAppAccount) {
            fetchData();
        } else {
            setLoading(false);
        }
    }, [hasWhatsAppAccount]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [templatesRes, functionsRes] = await Promise.all([
                fetch('/api/whatsapp/templates'),
                fetch('/api/functions', { cache: 'no-store' }),
            ]);

            const templatesData = await templatesRes.json();
            if (templatesRes.ok) {
                setTemplates(templatesData.templates || []);
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

    const saveFunction = async () => {
        const name = functionForm.name.trim();
        if (!name) {
            setError('Function name is required.');
            return;
        }
        if (!functionForm.code.trim()) {
            setError('Function code cannot be empty.');
            return;
        }

        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const isEditing = !!editingFunction;
            const existingFn = functions.find(fn => fn.name === editingFunction);

            const url = isEditing && existingFn?._id
                ? `/api/functions/${existingFn._id}`
                : '/api/functions';
            const method = isEditing && existingFn?._id ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: functionForm.name,
                    description: functionForm.description,
                    code: functionForm.code,
                    inputKey: functionForm.inputKey,
                    timeoutMs: Number(functionForm.timeoutMs) || 5000,
                    nextTemplate: functionForm.nextTemplate,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.message || 'Failed to save function');
            }

            await fetchData();
            setSuccess(isEditing ? 'Function updated!' : 'Function added!');
            resetForm();
        } catch (err: any) {
            setError(err.message || 'Unable to save function');
        } finally {
            setSaving(false);
        }
    };

    const removeFunction = async (fnToRemove: FlowFunction) => {
        if (!fnToRemove._id) {
            setError('Cannot delete function without ID');
            return;
        }

        if (!confirm(`Delete function "${fnToRemove.name}"?`)) return;

        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await fetch(`/api/functions/${fnToRemove._id}`, {
                method: 'DELETE',
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.message || 'Failed to remove function');
            }

            await fetchData();
            setSuccess('Function removed!');
        } catch (err: any) {
            setError(err.message || 'Unable to remove function');
        } finally {
            setSaving(false);
        }
    };

    const editFunction = (fn: FlowFunction) => {
        setFunctionForm({
            name: fn.name,
            description: fn.description || '',
            code: fn.code,
            inputKey: fn.inputKey || 'input',
            timeoutMs: fn.timeoutMs || 5000,
            nextTemplate: fn.nextTemplate || '',
        });
        setEditingFunction(fn.name);
    };

    const resetForm = () => {
        setFunctionForm({
            name: '',
            description: '',
            code: defaultFunctionCode,
            inputKey: 'input',
            timeoutMs: 5000,
            nextTemplate: '',
        });
        setEditingFunction(null);
        setShowModal(false);
    };

    const openModal = (fn?: FlowFunction) => {
        if (fn) {
            setFunctionForm({
                name: fn.name,
                description: fn.description || '',
                code: fn.code,
                inputKey: fn.inputKey || 'input',
                timeoutMs: fn.timeoutMs || 5000,
                nextTemplate: fn.nextTemplate || '',
            });
            setEditingFunction(fn.name);
        }
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
    };

    const saveAndCloseModal = async () => {
        await saveFunction();
        // Only close if save was successful (no error)
        if (!error) {
            setShowModal(false);
        }
    };

    const testFunction = async () => {
        setTestError(null);
        setTestResult(null);
        if (!testFunctionName) {
            setTestError('Pick a function to test.');
            return;
        }

        const fn = functions.find(f => f.name === testFunctionName);
        if (!fn) {
            setTestError('Function not found.');
            return;
        }

        try {
            const res = await fetch('/api/functions/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: fn.code,
                    input: testInput,
                    inputKey: fn.inputKey,
                    timeoutMs: fn.timeoutMs,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.message || 'Failed to run function');
            }
            setTestResult(JSON.stringify(data.output, null, 2));
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
                                <h1>Functions</h1>
                                <p className="lead">Create custom logic between templates</p>
                            </div>
                        </header>
                        <div className="card setup-prompt">
                            <h2>Connect WhatsApp first</h2>
                            <p>Configure your WhatsApp Cloud API credentials to use functions.</p>
                            <a href="/dashboard/settings" className="btn-primary">
                                Go to Settings →
                            </a>
                        </div>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <>
            <main className="dashboard-container">
                <div className="dashboard-body">
                    <DashboardSidebar userEmail={userEmail} />
                    <div className="dashboard-content">
                        <header className="dashboard-header">
                            <div>
                                <h1>Functions</h1>
                                <p className="lead">Create custom logic that runs between templates</p>
                            </div>
                            <button className="btn-primary" onClick={() => openModal()}>
                                + Add Function
                            </button>
                        </header>

                        {error && <div className="status error">{error}</div>}
                        {success && <div className="status success">{success}</div>}

                        <div className="functions-layout">
                            <section className="card functions-list-section">
                                <div className="column-header">
                                    <h2>Your Functions</h2>
                                    <p className="muted">{functions.length} function{functions.length !== 1 ? 's' : ''} defined</p>
                                </div>

                                {loading ? (
                                    <div className="loading">Loading functions…</div>
                                ) : functions.length === 0 ? (
                                    <div className="empty-state">
                                        <p>No functions yet</p>
                                        <span className="muted">Click &quot;+ Add Function&quot; to create your first function.</span>
                                    </div>
                                ) : (
                                    <div className="functions-list">
                                        {functions.map((fn) => (
                                            <div key={fn.name} className="function-item">
                                                <div className="function-item-header">
                                                    <div className="function-name">{fn.name}</div>
                                                    <div className="function-item-actions">
                                                        <button className="ghost-btn small" onClick={() => openModal(fn)} title="Edit">
                                                            <Pencil size={14} />
                                                        </button>
                                                        <button className="ghost-btn small danger" onClick={() => removeFunction(fn)} disabled={saving} title="Remove">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                                {fn.description && <div className="muted small-text">{fn.description}</div>}
                                                <div className="muted small-text">
                                                    Input: {fn.inputKey} • Timeout: {fn.timeoutMs}ms
                                                    {fn.nextTemplate && ` • Next: ${fn.nextTemplate}`}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>

                            <section className="card function-test-section">
                                <div className="column-header">
                                    <h2>Test Function</h2>
                                    <p className="muted">Run a function with test input.</p>
                                </div>

                                <div className="function-test">
                                    <div className="form-row">
                                        <label>Select Function</label>
                                        <select
                                            value={testFunctionName}
                                            onChange={(e) => setTestFunctionName(e.target.value)}
                                        >
                                            <option value="">Select a function</option>
                                            {functions.map((fn) => (
                                                <option key={fn.name} value={fn.name}>
                                                    {fn.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-row">
                                        <label>Test Input</label>
                                        <input
                                            value={testInput}
                                            onChange={(e) => setTestInput(e.target.value)}
                                            placeholder="Enter test value"
                                        />
                                    </div>
                                    <button className="btn-primary" onClick={testFunction}>
                                        Run Test
                                    </button>
                                    {testError && <div className="status error">{testError}</div>}
                                    {testResult && (
                                        <div className="form-row">
                                            <label>Result</label>
                                            <pre>{testResult}</pre>
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>
                    </div>
                </div>
            </main>

            {/* Modal for larger code editor */}
            {showModal && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal-content function-editor-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingFunction ? `Edit: ${editingFunction}` : 'New Function'}</h2>
                            <button className="modal-close" onClick={closeModal}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="modal-form-grid">
                                <div className="modal-form-left">
                                    <div className="form-row">
                                        <label>Function Name</label>
                                        <input
                                            value={functionForm.name}
                                            onChange={(e) => setFunctionForm((f) => ({ ...f, name: e.target.value }))}
                                            placeholder="e.g. formatUserInput"
                                            disabled={!!editingFunction}
                                        />
                                    </div>
                                    <div className="form-row">
                                        <label>Description (optional)</label>
                                        <input
                                            value={functionForm.description}
                                            onChange={(e) => setFunctionForm((f) => ({ ...f, description: e.target.value }))}
                                            placeholder="What does this function do?"
                                        />
                                    </div>
                                    <div className="form-row">
                                        <label>Input Key</label>
                                        <input
                                            value={functionForm.inputKey}
                                            onChange={(e) => setFunctionForm((f) => ({ ...f, inputKey: e.target.value }))}
                                            placeholder="input"
                                        />
                                    </div>
                                    <div className="form-row">
                                        <label>Timeout (ms)</label>
                                        <input
                                            type="number"
                                            value={functionForm.timeoutMs}
                                            onChange={(e) => setFunctionForm((f) => ({ ...f, timeoutMs: Number(e.target.value) }))}
                                            placeholder="5000"
                                        />
                                    </div>
                                    <div className="form-row">
                                        <label>Next Template (optional)</label>
                                        <select
                                            value={functionForm.nextTemplate}
                                            onChange={(e) => setFunctionForm((f) => ({ ...f, nextTemplate: e.target.value }))}
                                        >
                                            <option value="">No next template</option>
                                            {templates.map((t) => (
                                                <option key={t.name} value={t.name}>
                                                    {t.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="modal-form-right">
                                    <div className="form-row code-editor-row">
                                        <label>Code</label>
                                        <textarea
                                            className="code-editor-large"
                                            value={functionForm.code}
                                            onChange={(e) => setFunctionForm((f) => ({ ...f, code: e.target.value }))}
                                            placeholder="module.exports = async ({ input, context }) => { ... }"
                                            spellCheck={false}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            {error && <div className="status error">{error}</div>}
                            <div className="form-actions">
                                <button className="ghost-btn" onClick={closeModal}>
                                    Cancel
                                </button>
                                <button className="btn-primary" onClick={saveAndCloseModal} disabled={saving}>
                                    {saving ? 'Saving…' : editingFunction ? 'Update Function' : 'Add Function'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
