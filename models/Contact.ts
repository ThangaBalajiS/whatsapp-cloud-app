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
  // Flow state tracking
  lastSentTemplate: {
    type: String,
    default: '',
  },
  lastSentFlowId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Flow',
  },
}, { timestamps: true });

// Compound index: each user can have one contact per waId
ContactSchema.index({ userId: 1, waId: 1 }, { unique: true });

// Delete cached model in development to ensure schema changes are picked up
if (mongoose.models.Contact) {
  delete mongoose.models.Contact;
}

export default mongoose.model('Contact', ContactSchema);

