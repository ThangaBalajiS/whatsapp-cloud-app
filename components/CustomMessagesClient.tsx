'use client';

import { useEffect, useState } from 'react';
import { DashboardSidebar } from './DashboardSidebar';

type ButtonType = 'quick_reply' | 'url' | 'call';

type MessageButton = {
    type: ButtonType;
    text: string;
    payload?: string;
    url?: string;
    phone?: string;
};

type CustomMessage = {
    _id?: string;
    name: string;
    content: string;
    buttons: MessageButton[];
    placeholders: string[];
    createdAt?: string;
    updatedAt?: string;
};

type Props = {
    userEmail: string;
    userId: string;
    hasWhatsAppAccount: boolean;
};

const defaultPlaceholders = ['name', 'phone', 'order_id', 'date', 'amount'];

export default function CustomMessagesClient({
    userEmail,
    userId,
    hasWhatsAppAccount,
}: Props) {
    const [messages, setMessages] = useState<CustomMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const [showModal, setShowModal] = useState(false);
    const [editingMessage, setEditingMessage] = useState<string | null>(null);
    const [messageForm, setMessageForm] = useState<CustomMessage>({
        name: '',
        content: '',
        buttons: [],
        placeholders: [],
    });

    // Ref for content textarea to insert placeholders at cursor
    const contentRef = useState<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        if (hasWhatsAppAccount) {
            fetchMessages();
        } else {
            setLoading(false);
        }
    }, [hasWhatsAppAccount]);

    const fetchMessages = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/custom-messages', { cache: 'no-store' });
            const data = await res.json();
            if (res.ok) {
                setMessages(data.messages || []);
            } else {
                setError(data.message || 'Failed to load messages');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load messages');
        } finally {
            setLoading(false);
        }
    };

    const insertPlaceholder = (placeholder: string) => {
        const insertion = `{{${placeholder}}}`;
        setMessageForm(prev => ({
            ...prev,
            content: prev.content + insertion,
        }));
    };

    const addButton = () => {
        setMessageForm(prev => ({
            ...prev,
            buttons: [...prev.buttons, { type: 'quick_reply', text: '', payload: '' }],
        }));
    };

    const updateButton = (index: number, updates: Partial<MessageButton>) => {
        setMessageForm(prev => ({
            ...prev,
            buttons: prev.buttons.map((btn, i) => (i === index ? { ...btn, ...updates } : btn)),
        }));
    };

    const removeButton = (index: number) => {
        setMessageForm(prev => ({
            ...prev,
            buttons: prev.buttons.filter((_, i) => i !== index),
        }));
    };

    const saveMessage = async () => {
        const name = messageForm.name.trim();
        if (!name) {
            setError('Message name is required.');
            return;
        }
        if (!messageForm.content.trim()) {
            setError('Message content cannot be empty.');
            return;
        }

        // Validate buttons
        for (const btn of messageForm.buttons) {
            if (!btn.text.trim()) {
                setError('All buttons must have text.');
                return;
            }
            if (btn.type === 'url' && !btn.url?.trim()) {
                setError('URL buttons require a URL.');
                return;
            }
            if (btn.type === 'call' && !btn.phone?.trim()) {
                setError('Call buttons require a phone number.');
                return;
            }
        }

        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const isEditing = !!editingMessage;
            const existingMsg = messages.find(m => m._id === editingMessage);

            const url = isEditing && existingMsg?._id
                ? `/api/custom-messages/${existingMsg._id}`
                : '/api/custom-messages';
            const method = isEditing && existingMsg?._id ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: messageForm.name,
                    content: messageForm.content,
                    buttons: messageForm.buttons,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.message || 'Failed to save message');
            }

            await fetchMessages();
            setSuccess(isEditing ? 'Message updated!' : 'Message created!');
            closeModal();
        } catch (err: any) {
            setError(err.message || 'Unable to save message');
        } finally {
            setSaving(false);
        }
    };

    const deleteMessage = async (msg: CustomMessage) => {
        if (!msg._id) return;
        if (!confirm(`Delete message "${msg.name}"?`)) return;

        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await fetch(`/api/custom-messages/${msg._id}`, {
                method: 'DELETE',
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.message || 'Failed to delete message');
            }

            await fetchMessages();
            setSuccess('Message deleted!');
        } catch (err: any) {
            setError(err.message || 'Unable to delete message');
        } finally {
            setSaving(false);
        }
    };

    const openModal = (msg?: CustomMessage) => {
        if (msg) {
            setMessageForm({
                name: msg.name,
                content: msg.content,
                buttons: msg.buttons || [],
                placeholders: msg.placeholders || [],
            });
            setEditingMessage(msg._id || null);
        } else {
            setMessageForm({
                name: '',
                content: '',
                buttons: [],
                placeholders: [],
            });
            setEditingMessage(null);
        }
        setShowModal(true);
        setError(null);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingMessage(null);
        setMessageForm({
            name: '',
            content: '',
            buttons: [],
            placeholders: [],
        });
    };

    const getButtonTypeLabel = (type: ButtonType) => {
        switch (type) {
            case 'quick_reply': return 'Quick Reply';
            case 'url': return 'URL';
            case 'call': return 'Call';
        }
    };

    // Extract placeholders from content for preview
    const extractPlaceholders = (content: string): string[] => {
        const matches = content.match(/\{\{(\w+)\}\}/g);
        if (!matches) return [];
        return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
    };

    // Highlight placeholders in content for preview
    const highlightContent = (content: string) => {
        return content.replace(
            /\{\{(\w+)\}\}/g,
            '<span class="placeholder-highlight">{{$1}}</span>'
        );
    };

    if (!hasWhatsAppAccount) {
        return (
            <main className="dashboard-container">
                <div className="dashboard-body">
                    <DashboardSidebar userEmail={userEmail} />
                    <div className="dashboard-content">
                        <header className="dashboard-header">
                            <div>
                                <h1>Custom Messages</h1>
                                <p className="lead">Create reusable message templates</p>
                            </div>
                        </header>
                        <div className="card setup-prompt">
                            <h2>Connect WhatsApp first</h2>
                            <p>Configure your WhatsApp Cloud API credentials to use custom messages.</p>
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
                                <h1>Custom Messages</h1>
                                <p className="lead">Create reusable message templates with placeholders and buttons</p>
                            </div>
                            <button className="btn-primary" onClick={() => openModal()}>
                                + Create Message
                            </button>
                        </header>

                        {error && <div className="status error">{error}</div>}
                        {success && <div className="status success">{success}</div>}

                        {loading ? (
                            <div className="loading">Loading messages…</div>
                        ) : messages.length === 0 ? (
                            <div className="empty-state-hero">
                                <div className="empty-state-icon">💬</div>
                                <h2>No custom messages yet</h2>
                                <p>Create reusable message templates with placeholders like {'{{name}}'} and interactive buttons.</p>
                                <button className="btn-primary" onClick={() => openModal()}>
                                    + Create Your First Message
                                </button>
                            </div>
                        ) : (
                            <div className="custom-messages-grid">
                                {messages.map(msg => (
                                    <div key={msg._id} className="custom-message-card card">
                                        <div className="custom-message-header">
                                            <div className="custom-message-name">{msg.name}</div>
                                            <div className="custom-message-actions">
                                                <button className="ghost-btn small" onClick={() => openModal(msg)}>
                                                    Edit
                                                </button>
                                                <button className="ghost-btn small danger" onClick={() => deleteMessage(msg)} disabled={saving}>
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                        <div className="custom-message-content">
                                            <div
                                                className="message-preview-text"
                                                dangerouslySetInnerHTML={{ __html: highlightContent(msg.content) }}
                                            />
                                        </div>
                                        {msg.placeholders && msg.placeholders.length > 0 && (
                                            <div className="custom-message-placeholders">
                                                {msg.placeholders.map(p => (
                                                    <span key={p} className="placeholder-tag">{`{{${p}}}`}</span>
                                                ))}
                                            </div>
                                        )}
                                        {msg.buttons && msg.buttons.length > 0 && (
                                            <div className="custom-message-buttons">
                                                {msg.buttons.map((btn, i) => (
                                                    <span key={i} className="button-tag">
                                                        {btn.type === 'quick_reply' ? '↩' : btn.type === 'url' ? '🔗' : '📞'} {btn.text}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        <div className="custom-message-meta muted small-text">
                                            Updated {msg.updatedAt ? new Date(msg.updatedAt).toLocaleDateString() : 'recently'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal-content custom-message-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingMessage ? 'Edit Message' : 'Create Message'}</h2>
                            <button className="modal-close" onClick={closeModal}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-row">
                                <label>Message Name</label>
                                <input
                                    value={messageForm.name}
                                    onChange={e => setMessageForm(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="e.g. Order Confirmation"
                                    disabled={!!editingMessage}
                                />
                            </div>

                            <div className="form-row">
                                <label>Message Content</label>
                                <div className="placeholder-toolbar">
                                    <span className="muted small-text">Insert placeholder:</span>
                                    {defaultPlaceholders.map(p => (
                                        <button
                                            key={p}
                                            type="button"
                                            className="placeholder-btn"
                                            onClick={() => insertPlaceholder(p)}
                                        >
                                            {`{{${p}}}`}
                                        </button>
                                    ))}
                                </div>
                                <textarea
                                    value={messageForm.content}
                                    onChange={e => setMessageForm(prev => ({ ...prev, content: e.target.value }))}
                                    placeholder="Hi {{name}}, your order {{order_id}} is ready for pickup!"
                                    rows={5}
                                />
                                {extractPlaceholders(messageForm.content).length > 0 && (
                                    <div className="detected-placeholders">
                                        <span className="muted small-text">Detected:</span>
                                        {extractPlaceholders(messageForm.content).map(p => (
                                            <span key={p} className="placeholder-tag small">{`{{${p}}}`}</span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="form-row">
                                <label>Reply Buttons (optional)</label>
                                <div className="buttons-list">
                                    {messageForm.buttons.map((btn, i) => (
                                        <div key={i} className="button-editor">
                                            <select
                                                value={btn.type}
                                                onChange={e => updateButton(i, { type: e.target.value as ButtonType })}
                                            >
                                                <option value="quick_reply">Quick Reply</option>
                                                <option value="url">URL Button</option>
                                                <option value="call">Call Button</option>
                                            </select>
                                            <input
                                                value={btn.text}
                                                onChange={e => updateButton(i, { text: e.target.value })}
                                                placeholder="Button text"
                                            />
                                            {btn.type === 'quick_reply' && (
                                                <input
                                                    value={btn.payload || ''}
                                                    onChange={e => updateButton(i, { payload: e.target.value })}
                                                    placeholder="Payload (optional)"
                                                />
                                            )}
                                            {btn.type === 'url' && (
                                                <input
                                                    value={btn.url || ''}
                                                    onChange={e => updateButton(i, { url: e.target.value })}
                                                    placeholder="https://example.com"
                                                />
                                            )}
                                            {btn.type === 'call' && (
                                                <input
                                                    value={btn.phone || ''}
                                                    onChange={e => updateButton(i, { phone: e.target.value })}
                                                    placeholder="+1234567890"
                                                />
                                            )}
                                            <button
                                                type="button"
                                                className="ghost-btn small danger"
                                                onClick={() => removeButton(i)}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                    {messageForm.buttons.length < 3 && (
                                        <button type="button" className="ghost-btn small" onClick={addButton}>
                                            + Add Button
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Preview Section */}
                            <div className="form-row">
                                <label>Preview</label>
                                <div className="message-preview">
                                    <div
                                        className="message-preview-content"
                                        dangerouslySetInnerHTML={{ __html: highlightContent(messageForm.content) || '<span class="muted">Your message will appear here...</span>' }}
                                    />
                                    {messageForm.buttons.length > 0 && (
                                        <div className="message-preview-buttons">
                                            {messageForm.buttons.map((btn, i) => (
                                                <div key={i} className="preview-button">
                                                    {btn.type === 'quick_reply' && '↩'}
                                                    {btn.type === 'url' && '🔗'}
                                                    {btn.type === 'call' && '📞'}
                                                    {' '}{btn.text || 'Button'}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            {error && <div className="status error">{error}</div>}
                            <div className="form-actions">
                                <button className="ghost-btn" onClick={closeModal}>
                                    Cancel
                                </button>
                                <button className="btn-primary" onClick={saveMessage} disabled={saving}>
                                    {saving ? 'Saving…' : editingMessage ? 'Update Message' : 'Create Message'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
