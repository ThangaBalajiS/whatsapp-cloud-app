'use client';

import { useState, useEffect, FormEvent } from 'react';
import Link from 'next/link';

type WhatsAppAccount = {
  phoneNumberId: string;
  businessAccountId: string;
  hasAccessToken: boolean;
  webhookVerifyToken: string;
  isConnected: boolean;
};

export default function SettingsPage() {
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [businessAccountId, setBusinessAccountId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [account, setAccount] = useState<WhatsAppAccount | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  // SSE for real-time webhook status updates
  useEffect(() => {
    if (!userId) return;

    const eventSource = new EventSource('/api/whatsapp/events');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === 'webhook_connected') {
          setAccount((prev) => prev ? { ...prev, isConnected: true } : prev);
        }
      } catch (e) {
        console.error('SSE parse error:', e);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [userId]);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/whatsapp/settings');
      const data = await res.json();
      
      if (data.account) {
        setAccount(data.account);
        setPhoneNumberId(data.account.phoneNumberId);
        setBusinessAccountId(data.account.businessAccountId);
      }
      if (data.userId) {
        setUserId(data.userId);
      }
    } catch (err) {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/whatsapp/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumberId,
          businessAccountId,
          accessToken: accessToken || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message);
      }

      setAccount(data.account);
      if (data.userId) {
        setUserId(data.userId);
      }
      setAccessToken('');
      setSuccess('Settings saved successfully!');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const getWebhookUrl = () => {
    if (typeof window === 'undefined' || !userId) return '';
    return `${window.location.origin}/api/whatsapp/webhook/${userId}`;
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (loading) {
    return (
      <main className="dashboard-container">
        <div className="loading">Loading...</div>
      </main>
    );
  }

  return (
    <main className="dashboard-container">
      <header className="dashboard-header">
        <div>
          <h1>WhatsApp Settings</h1>
          <p className="lead">Configure your WhatsApp Cloud API credentials</p>
        </div>
        <Link href="/dashboard" className="small-btn">
          ← Back to Inbox
        </Link>
      </header>

      <div className="settings-grid">
        {/* Webhook Configuration - For receiving messages */}
        {userId && (
          <div className="card">
            <div className="card-header-with-status">
              <h2>Webhook Configuration</h2>
              {account && (
                <span 
                  className={`status-indicator ${account.isConnected ? 'connected' : 'disconnected'}`}
                  title={account.isConnected ? 'Webhook connected' : 'Webhook not connected'}
                >
                  <span className="status-dot"></span>
                  {account.isConnected ? 'Connected' : 'Not connected'}
                </span>
              )}
            </div>
            <p className="help-text" style={{ marginBottom: '16px' }}>
              <strong>For receiving messages only.</strong> Configure this webhook in your Meta Developer Dashboard 
              to receive incoming WhatsApp messages. No access token required — perfect if you only want to 
              collect messages without sending replies from this platform.
            </p>

            <label>
              Webhook URL
              <div className="copy-field">
                <input
                  type="text"
                  value={getWebhookUrl()}
                  readOnly
                />
                <button
                  type="button"
                  className="copy-btn"
                  onClick={() => copyToClipboard(getWebhookUrl(), 'url')}
                >
                  {copiedField === 'url' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </label>

            {account?.webhookVerifyToken ? (
              <label>
                Verify Token
                <div className="copy-field">
                  <input
                    type="text"
                    value={account.webhookVerifyToken}
                    readOnly
                  />
                  <button
                    type="button"
                    className="copy-btn"
                    onClick={() => copyToClipboard(account.webhookVerifyToken, 'token')}
                  >
                    {copiedField === 'token' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </label>
            ) : (
              <p className="help-text" style={{ marginTop: '8px', opacity: 0.7 }}>
                Save your API credentials below to generate a verify token.
              </p>
            )}
          </div>
        )}

        {/* API Credentials - For sending messages */}
        <div className="card">
          <h2>API Credentials</h2>
          <p className="help-text" style={{ marginBottom: '16px' }}>
            <strong>For sending messages.</strong> Add your WhatsApp Cloud API credentials to send messages 
            and replies directly from this platform. Required only if you want to respond to conversations here.
          </p>
          <form onSubmit={handleSubmit}>
            <label>
              Phone Number ID
              <input
                type="text"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                placeholder="e.g., 123456789012345"
                required
              />
            </label>

            <label>
              Business Account ID
              <input
                type="text"
                value={businessAccountId}
                onChange={(e) => setBusinessAccountId(e.target.value)}
                placeholder="e.g., 123456789012345"
                required
              />
            </label>

            <label>
              Access Token (Optional) {account?.hasAccessToken && <span className="token-set">✓ configured</span>}
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder={account?.hasAccessToken ? 'Enter new token to update' : 'Leave empty if receive-only'}
              />
              <span className="help-text">
                Your permanent access token from Meta Developer Dashboard. Only needed if you want to send messages.
              </span>
            </label>

            <button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </button>

            {success && <div className="status">{success}</div>}
            {error && <div className="status error">{error}</div>}
          </form>
        </div>
      </div>
    </main>
  );
}
