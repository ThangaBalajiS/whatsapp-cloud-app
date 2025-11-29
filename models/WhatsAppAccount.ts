import mongoose from 'mongoose';

const WhatsAppAccountSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  phoneNumberId: {
    type: String,
    required: [true, 'Phone Number ID is required'],
  },
  businessAccountId: {
    type: String,
    required: [true, 'Business Account ID is required'],
  },
  accessToken: {
    type: String,
    required: [true, 'Access Token is required'],
  },
  webhookVerifyToken: {
    type: String,
    required: true,
  },
  isConnected: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

export default mongoose.models.WhatsAppAccount || mongoose.model('WhatsAppAccount', WhatsAppAccountSchema);

