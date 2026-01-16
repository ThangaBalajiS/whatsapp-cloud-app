'use client';

import { useCallback, useEffect, useState } from 'react';
import { DashboardSidebar } from '../../../components/DashboardSidebar';

type AppointmentStatus = 'scheduled' | 'confirmed' | 'cancelled' | 'completed';

type Appointment = {
  _id: string;
  contactWaId: string;
  customerName: string;
  customerPhone: string;
  date: string;
  duration: number;
  status: AppointmentStatus;
  notes: string;
  createdAt: string;
};

type Props = {
  userEmail: string;
  userId: string;
  hasWhatsAppAccount: boolean;
};

export default function AppointmentsClient({ userEmail, userId, hasWhatsAppAccount }: Props) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | AppointmentStatus>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [endpointUrl, setEndpointUrl] = useState('/api/whatsapp/flows');

  // Form state
  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    contactWaId: '',
    date: '',
    time: '',
    duration: 30,
    notes: '',
  });

  const fetchAppointments = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') {
        params.set('status', filter);
      }
      const res = await fetch(`/api/appointments?${params}`);
      const data = await res.json();
      if (data.appointments) {
        setAppointments(data.appointments);
      }
    } catch (error) {
      console.error('Error fetching appointments:', error);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchAppointments();
    // Set the full endpoint URL after mount to avoid hydration mismatch
    setEndpointUrl(`${window.location.origin}/api/whatsapp/flows`);
  }, [fetchAppointments]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getStatusColor = (status: AppointmentStatus) => {
    switch (status) {
      case 'scheduled':
        return '#3b82f6';
      case 'confirmed':
        return '#10b981';
      case 'cancelled':
        return '#ef4444';
      case 'completed':
        return '#6b7280';
      default:
        return '#9ca3af';
    }
  };

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const dateTime = new Date(`${formData.date}T${formData.time}`);
    
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: formData.customerName,
          customerPhone: formData.customerPhone,
          contactWaId: formData.contactWaId || formData.customerPhone,
          date: dateTime.toISOString(),
          duration: formData.duration,
          notes: formData.notes,
        }),
      });
      
      if (res.ok) {
        setShowCreateModal(false);
        resetForm();
        fetchAppointments();
      }
    } catch (error) {
      console.error('Error creating appointment:', error);
    }
  };

  const handleUpdateStatus = async (id: string, status: AppointmentStatus) => {
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      
      if (res.ok) {
        fetchAppointments();
      }
    } catch (error) {
      console.error('Error updating appointment:', error);
    }
  };

  const handleCancelAppointment = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this appointment?')) return;
    
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        fetchAppointments();
      }
    } catch (error) {
      console.error('Error cancelling appointment:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      customerName: '',
      customerPhone: '',
      contactWaId: '',
      date: '',
      time: '',
      duration: 30,
      notes: '',
    });
  };

  return (
    <div className="dashboard-layout">
      <DashboardSidebar userEmail={userEmail} />
      
      <main className="dashboard-main">
        <div className="appointments-container">
          <div className="appointments-header">
            <div>
              <h1>Appointments</h1>
              <p className="subtitle">Manage bookings from WhatsApp Flows</p>
            </div>
            <button 
              className="btn-primary"
              onClick={() => setShowCreateModal(true)}
            >
              + New Appointment
            </button>
          </div>

          {/* Filters */}
          <div className="appointments-filters">
            {(['all', 'scheduled', 'confirmed', 'cancelled', 'completed'] as const).map((status) => (
              <button
                key={status}
                className={`filter-btn ${filter === status ? 'active' : ''}`}
                onClick={() => setFilter(status)}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>

          {/* Appointments List */}
          <div className="appointments-list">
            {loading ? (
              <div className="loading-state">Loading appointments...</div>
            ) : appointments.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📅</div>
                <h3>No appointments yet</h3>
                <p>Appointments booked via WhatsApp Flows will appear here.</p>
              </div>
            ) : (
              appointments.map((apt) => (
                <div key={apt._id} className="appointment-card">
                  <div className="appointment-datetime">
                    <div className="date">{formatDate(apt.date)}</div>
                    <div className="time">{formatTime(apt.date)}</div>
                    <div className="duration">{apt.duration} min</div>
                  </div>
                  
                  <div className="appointment-details">
                    <div className="customer-name">{apt.customerName}</div>
                    <div className="customer-phone">{apt.customerPhone || apt.contactWaId}</div>
                    {apt.notes && <div className="notes">{apt.notes}</div>}
                  </div>
                  
                  <div className="appointment-status">
                    <span 
                      className="status-badge"
                      style={{ backgroundColor: getStatusColor(apt.status) }}
                    >
                      {apt.status}
                    </span>
                  </div>
                  
                  <div className="appointment-actions">
                    {apt.status === 'scheduled' && (
                      <>
                        <button
                          className="action-btn confirm"
                          onClick={() => handleUpdateStatus(apt._id, 'confirmed')}
                          title="Confirm"
                        >
                          ✓
                        </button>
                        <button
                          className="action-btn cancel"
                          onClick={() => handleCancelAppointment(apt._id)}
                          title="Cancel"
                        >
                          ✕
                        </button>
                      </>
                    )}
                    {apt.status === 'confirmed' && (
                      <button
                        className="action-btn complete"
                        onClick={() => handleUpdateStatus(apt._id, 'completed')}
                        title="Mark Complete"
                      >
                        ✓✓
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Endpoint Info */}
          <div className="endpoint-info">
            <h3>WhatsApp Flow Endpoint</h3>
            <p>Configure this URL in your WhatsApp Flow settings:</p>
            <code>{endpointUrl}</code>
          </div>
        </div>

        {/* Create Modal */}
        {showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>New Appointment</h2>
                <button className="close-btn" onClick={() => setShowCreateModal(false)}>✕</button>
              </div>
              <form onSubmit={handleCreateAppointment}>
                <div className="form-group">
                  <label>Customer Name *</label>
                  <input
                    type="text"
                    value={formData.customerName}
                    onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Phone Number *</label>
                  <input
                    type="tel"
                    value={formData.customerPhone}
                    onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                    placeholder="e.g., 919876543210"
                    required
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Date *</label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Time *</label>
                    <input
                      type="time"
                      value={formData.time}
                      onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Duration (minutes)</label>
                  <select
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                  >
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={45}>45 minutes</option>
                    <option value={60}>1 hour</option>
                    <option value={90}>1.5 hours</option>
                    <option value={120}>2 hours</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    Create Appointment
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      <style jsx>{`
        .appointments-container {
          padding: 24px;
          max-width: 1000px;
        }

        .appointments-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .appointments-header h1 {
          font-size: 24px;
          font-weight: 600;
          margin: 0;
        }

        .subtitle {
          color: #6b7280;
          margin: 4px 0 0;
        }

        .btn-primary {
          background: #10b981;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
        }

        .btn-primary:hover {
          background: #059669;
        }

        .btn-secondary {
          background: #374151;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          cursor: pointer;
        }

        .appointments-filters {
          display: flex;
          gap: 8px;
          margin-bottom: 20px;
        }

        .filter-btn {
          background: #1f2937;
          border: 1px solid #374151;
          color: #9ca3af;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .filter-btn:hover {
          border-color: #4b5563;
        }

        .filter-btn.active {
          background: #374151;
          color: white;
          border-color: #4b5563;
        }

        .appointments-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .appointment-card {
          background: #1f2937;
          border: 1px solid #374151;
          border-radius: 12px;
          padding: 16px 20px;
          display: grid;
          grid-template-columns: 120px 1fr auto auto;
          gap: 20px;
          align-items: center;
        }

        .appointment-datetime {
          text-align: center;
        }

        .appointment-datetime .date {
          font-weight: 600;
          color: white;
        }

        .appointment-datetime .time {
          font-size: 14px;
          color: #10b981;
        }

        .appointment-datetime .duration {
          font-size: 12px;
          color: #6b7280;
        }

        .appointment-details .customer-name {
          font-weight: 600;
          color: white;
          margin-bottom: 4px;
        }

        .appointment-details .customer-phone {
          font-size: 14px;
          color: #9ca3af;
        }

        .appointment-details .notes {
          font-size: 13px;
          color: #6b7280;
          margin-top: 8px;
          font-style: italic;
        }

        .status-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 500;
          color: white;
          text-transform: capitalize;
        }

        .appointment-actions {
          display: flex;
          gap: 8px;
        }

        .action-btn {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          border: none;
          cursor: pointer;
          font-size: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .action-btn.confirm {
          background: #10b981;
          color: white;
        }

        .action-btn.cancel {
          background: #ef4444;
          color: white;
        }

        .action-btn.complete {
          background: #3b82f6;
          color: white;
        }

        .loading-state,
        .empty-state {
          text-align: center;
          padding: 60px 20px;
          color: #6b7280;
        }

        .empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .empty-state h3 {
          color: white;
          margin: 0 0 8px;
        }

        .endpoint-info {
          margin-top: 40px;
          padding: 20px;
          background: #1f2937;
          border: 1px solid #374151;
          border-radius: 12px;
        }

        .endpoint-info h3 {
          margin: 0 0 8px;
          font-size: 16px;
        }

        .endpoint-info p {
          color: #9ca3af;
          margin: 0 0 12px;
          font-size: 14px;
        }

        .endpoint-info code {
          display: block;
          background: #111827;
          padding: 12px;
          border-radius: 6px;
          font-family: monospace;
          font-size: 13px;
          color: #10b981;
          word-break: break-all;
        }

        /* Modal styles */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal {
          background: #1f2937;
          border-radius: 16px;
          width: 90%;
          max-width: 500px;
          max-height: 90vh;
          overflow-y: auto;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid #374151;
        }

        .modal-header h2 {
          margin: 0;
          font-size: 18px;
        }

        .close-btn {
          background: none;
          border: none;
          color: #9ca3af;
          font-size: 20px;
          cursor: pointer;
        }

        .modal form {
          padding: 20px;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          margin-bottom: 6px;
          font-size: 14px;
          color: #9ca3af;
        }

        .form-group input,
        .form-group select,
        .form-group textarea {
          width: 100%;
          padding: 10px 12px;
          background: #111827;
          border: 1px solid #374151;
          border-radius: 8px;
          color: white;
          font-size: 14px;
        }

        .form-group input:focus,
        .form-group select:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: #10b981;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 20px;
        }
      `}</style>
    </div>
  );
}
