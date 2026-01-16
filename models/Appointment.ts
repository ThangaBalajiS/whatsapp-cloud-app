import mongoose from 'mongoose';

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'cancelled' | 'completed';

const AppointmentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false, // Optional - not available for WhatsApp Flow bookings
    index: true,
  },
  contactWaId: {
    type: String,
    required: true,
    index: true,
  },
  customerName: {
    type: String,
    required: true,
  },
  customerPhone: {
    type: String,
    default: '',
  },
  date: {
    type: Date,
    required: true,
  },
  duration: {
    type: Number,
    default: 30, // minutes
  },
  status: {
    type: String,
    enum: ['scheduled', 'confirmed', 'cancelled', 'completed'],
    default: 'scheduled',
  },
  flowResponseId: {
    type: String,
    default: '',
  },
  notes: {
    type: String,
    default: '',
  },
  reminderSent: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

// Compound index for efficient queries
AppointmentSchema.index({ userId: 1, date: 1 });
AppointmentSchema.index({ userId: 1, status: 1 });

export type AppointmentDocument = mongoose.Document & {
  userId: mongoose.Types.ObjectId;
  contactWaId: string;
  customerName: string;
  customerPhone: string;
  date: Date;
  duration: number;
  status: AppointmentStatus;
  flowResponseId: string;
  notes: string;
  reminderSent: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// Delete cached model in development
if (mongoose.models.Appointment) {
  delete mongoose.models.Appointment;
}

export default mongoose.model<AppointmentDocument>('Appointment', AppointmentSchema);
