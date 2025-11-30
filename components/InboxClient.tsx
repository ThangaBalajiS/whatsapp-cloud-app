'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import Link from 'next/link';
import { LogoutButton } from './LogoutButton';

type Contact = {
  _id: string;
  waId: string;
  phoneNumber: string;
  name: string;
  lastMessageAt: string;
  unreadCount: number;
};

type Message = {
  _id: string;
  direction: 'incoming' | 'outgoing';
  type: string;
  content: string;
  timestamp: string;
  status: string;
};

type Props = {
  userEmail: string;
  userId: string;
  hasWhatsAppAccount: boolean;
};

export default function InboxClient({ userEmail, userId, hasWhatsAppAccount }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showContactsPopover, setShowContactsPopover] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedContactRef = useRef<Contact | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Keep ref in sync with state for SSE handler
  useEffect(() => {
    selectedContactRef.current = selectedContact;
  }, [selectedContact]);

  useEffect(() => {
    if (hasWhatsAppAccount) {
      fetchContacts();
    } else {
      setLoading(false);
    }
  }, [hasWhatsAppAccount]);

  // SSE for real-time updates
  useEffect(() => {
    if (!hasWhatsAppAccount) return;

    const eventSource = new EventSource('/api/whatsapp/events');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.event === 'new_message') {
          const { message, contact } = data.data;
          
          // Update contacts list
          setContacts((prev) => {
            const existingIndex = prev.findIndex((c) => c._id === contact._id);
            if (existingIndex >= 0) {
              // Update existing contact
              const updated = [...prev];
              updated[existingIndex] = {
                ...updated[existingIndex],
                lastMessageAt: contact.lastMessageAt,
                unreadCount: selectedContactRef.current?._id === contact._id 
                  ? 0 
                  : contact.unreadCount,
              };
              // Sort by last message
              updated.sort((a, b) => 
                new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
              );
              return updated;
            } else {
              // New contact
              return [contact, ...prev];
            }
          });

          // If this message is for the currently selected contact, add it to messages
          if (selectedContactRef.current?._id === contact._id) {
            setMessages((prev) => [...prev, message]);
          }
        }

        if (data.event === 'message_status') {
          const { waMessageId, status } = data.data;
          setMessages((prev) =>
            prev.map((msg) =>
              msg._id === waMessageId ? { ...msg, status } : msg
            )
          );
        }
      } catch (e) {
        console.error('SSE parse error:', e);
      }
    };

    eventSource.onerror = () => {
      // Reconnect after 5 seconds on error
      setTimeout(() => {
        eventSource.close();
      }, 5000);
    };

    return () => {
      eventSource.close();
    };
  }, [hasWhatsAppAccount]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchContacts = async () => {
    try {
      const res = await fetch('/api/whatsapp/contacts');
      const data = await res.json();
      setContacts(data.contacts || []);
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (contactId: string) => {
    try {
      const res = await fetch(`/api/whatsapp/messages/${contactId}`);
      const data = await res.json();
      setMessages(data.messages || []);
      
      // Update contact in list to clear unread count
      setContacts(prev => prev.map(c => 
        c._id === contactId ? { ...c, unreadCount: 0 } : c
      ));
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  };

  const selectContact = (contact: Contact) => {
    setSelectedContact(contact);
    fetchMessages(contact._id);
    setShowContactsPopover(false);
  };

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setShowContactsPopover(false);
      }
    };

    if (showContactsPopover) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showContactsPopover]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedContact) return;

    setSending(true);
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: selectedContact._id,
          message: newMessage,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Add message to list immediately
        setMessages((prev) => [...prev, {
          _id: data.data.id,
          direction: 'outgoing',
          type: 'text',
          content: newMessage,
          timestamp: new Date().toISOString(),
          status: 'sent',
        }]);
        setNewMessage('');
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return date.toLocaleDateString();
  };

  if (!hasWhatsAppAccount) {
    return (
      <main className="dashboard-container">
        <header className="dashboard-header">
          <div>
            <h1>WhatsApp Inbox</h1>
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
          <h2>Welcome to WhatsApp Cloud App!</h2>
          <p>To get started, configure your WhatsApp Cloud API credentials.</p>
          <Link href="/dashboard/settings" className="btn-primary">
            Configure WhatsApp →
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-container">
      <header className="dashboard-header">
        <div>
          <h1>WhatsApp Inbox</h1>
          <p className="lead">Signed in as {userEmail}</p>
        </div>
        <div className="header-actions">
          <Link href="/dashboard/settings" className="small-btn">
            Settings
          </Link>
          <LogoutButton />
        </div>
      </header>

      <div className="inbox-layout">
        {/* Contacts sidebar - hidden on mobile */}
        <div className="contacts-sidebar">
          <div className="contacts-header">
            <h2>Conversations</h2>
          </div>
          
          {loading ? (
            <div className="loading-contacts">Loading...</div>
          ) : contacts.length === 0 ? (
            <div className="no-contacts">
              <p>No conversations yet</p>
              <span>Messages will appear here when someone contacts you</span>
            </div>
          ) : (
            <div className="contacts-list">
              {contacts.map((contact) => (
                <div
                  key={contact._id}
                  className={`contact-item ${selectedContact?._id === contact._id ? 'active' : ''}`}
                  onClick={() => selectContact(contact)}
                >
                  <div className="contact-avatar">
                    {contact.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="contact-info">
                    <div className="contact-name">{contact.name}</div>
                    <div className="contact-phone">{contact.phoneNumber}</div>
                  </div>
                  {contact.unreadCount > 0 && (
                    <div className="unread-badge">{contact.unreadCount}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Messages area */}
        <div className="messages-area">
          {selectedContact ? (
            <>
              <div className="messages-header">
                <div className="contact-avatar">
                  {selectedContact.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="contact-name">{selectedContact.name}</div>
                  <div className="contact-phone">{selectedContact.phoneNumber}</div>
                </div>
              </div>

              <div className="messages-list">
                {messages.map((msg, idx) => {
                  const showDate = idx === 0 || 
                    formatDate(messages[idx - 1].timestamp) !== formatDate(msg.timestamp);
                  
                  return (
                    <div key={msg._id}>
                      {showDate && (
                        <div className="date-divider">
                          <span>{formatDate(msg.timestamp)}</span>
                        </div>
                      )}
                      <div className={`message ${msg.direction}`}>
                        <div className="message-content">{msg.content}</div>
                        <div className="message-meta">
                          <span className="message-time">{formatTime(msg.timestamp)}</span>
                          {msg.direction === 'outgoing' && (
                            <span className="message-status">
                              {msg.status === 'read' ? '✓✓' : msg.status === 'delivered' ? '✓✓' : '✓'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <form className="message-input" onSubmit={handleSend}>
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  disabled={sending}
                />
                <button type="submit" disabled={sending || !newMessage.trim()}>
                  {sending ? '...' : 'Send'}
                </button>
              </form>
            </>
          ) : (
            <div className="no-conversation">
              <div className="no-conversation-icon">💬</div>
              <h3>Select a conversation</h3>
              <p>Choose a contact from the list to view messages</p>
            </div>
          )}
        </div>

        {/* Mobile floating contacts button */}
        <button 
          className="mobile-contacts-fab"
          onClick={() => setShowContactsPopover(!showContactsPopover)}
          aria-label="Open contacts"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          {contacts.reduce((sum, c) => sum + c.unreadCount, 0) > 0 && (
            <span className="fab-badge">
              {contacts.reduce((sum, c) => sum + c.unreadCount, 0)}
            </span>
          )}
        </button>

        {/* Mobile contacts popover */}
        {showContactsPopover && (
          <div className="mobile-contacts-popover" ref={popoverRef}>
            <div className="popover-header">
              <h3>Conversations</h3>
              <button 
                className="popover-close"
                onClick={() => setShowContactsPopover(false)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="popover-contacts-list">
              {loading ? (
                <div className="loading-contacts">Loading...</div>
              ) : contacts.length === 0 ? (
                <div className="no-contacts">
                  <p>No conversations yet</p>
                </div>
              ) : (
                contacts.map((contact) => (
                  <div
                    key={contact._id}
                    className={`contact-item ${selectedContact?._id === contact._id ? 'active' : ''}`}
                    onClick={() => selectContact(contact)}
                  >
                    <div className="contact-avatar">
                      {contact.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="contact-info">
                      <div className="contact-name">{contact.name}</div>
                      <div className="contact-phone">{contact.phoneNumber}</div>
                    </div>
                    {contact.unreadCount > 0 && (
                      <div className="unread-badge">{contact.unreadCount}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
