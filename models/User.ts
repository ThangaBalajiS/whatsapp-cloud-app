import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Please provide an email for this user.'],
    unique: true,
  },
  password: {
    type: String,
    required: [true, 'Please provide a password for this user.'],
  },
  name: {
    type: String,
    required: false,
  },
}, { timestamps: true });

export default mongoose.models.User || mongoose.model('User', UserSchema);

