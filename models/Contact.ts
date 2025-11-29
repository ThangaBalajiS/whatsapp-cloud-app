import mongoose from 'mongoose';

const ContactSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  waId: {
    type: String,
    required: true,
  },
  phoneNumber: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    default: '',
  },
  lastMessageAt: {
    type: Date,
    default: Date.now,
  },
  unreadCount: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

// Compound index: each user can have one contact per waId
ContactSchema.index({ userId: 1, waId: 1 }, { unique: true });

export default mongoose.models.Contact || mongoose.model('Contact', ContactSchema);

