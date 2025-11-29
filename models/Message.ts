import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  contactId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    required: true,
    index: true,
  },
  waMessageId: {
    type: String,
    required: true,
  },
  direction: {
    type: String,
    enum: ['incoming', 'outgoing'],
    required: true,
  },
  type: {
    type: String,
    enum: ['text', 'image', 'document', 'audio', 'video', 'sticker', 'location', 'contacts', 'unknown'],
    default: 'text',
  },
  content: {
    type: String,
    default: '',
  },
  mediaUrl: {
    type: String,
  },
  timestamp: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read', 'failed'],
    default: 'sent',
  },
  isRead: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

// Index for fetching conversation messages
MessageSchema.index({ contactId: 1, timestamp: -1 });

export default mongoose.models.Message || mongoose.model('Message', MessageSchema);

