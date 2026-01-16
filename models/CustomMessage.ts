import mongoose from 'mongoose';

export type ButtonType = 'quick_reply' | 'url' | 'call' | 'flow';

export type CustomMessageButton = {
    type: ButtonType;
    text: string;
    payload?: string; // For quick_reply
    url?: string;     // For url type
    phone?: string;   // For call type
    flowId?: string;  // For flow type - WhatsApp Flow ID
    flowAction?: 'navigate' | 'data_exchange'; // Flow action type
};

const ButtonSchema = new mongoose.Schema<CustomMessageButton>(
    {
        type: {
            type: String,
            required: true,
            enum: ['quick_reply', 'url', 'call', 'flow'],
        },
        text: { type: String, required: true },
        payload: { type: String, default: '' },
        url: { type: String, default: '' },
        phone: { type: String, default: '' },
        flowId: { type: String, default: '' },
        flowAction: { type: String, enum: ['navigate', 'data_exchange'], default: 'navigate' },
    },
    { _id: false }
);

const CustomMessageSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        name: {
            type: String,
            required: true,
        },
        content: {
            type: String,
            required: true,
        },
        buttons: {
            type: [ButtonSchema],
            default: [],
        },
        placeholders: {
            type: [String],
            default: [],
        },
    },
    { timestamps: true }
);

// Unique name per user
CustomMessageSchema.index({ userId: 1, name: 1 }, { unique: true });

// Auto-extract placeholders from content before saving
CustomMessageSchema.pre('save', function () {
    const matches = this.content.match(/\{\{(\w+)\}\}/g);
    if (matches) {
        this.placeholders = [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
    } else {
        this.placeholders = [];
    }
});

export type CustomMessageDocument = mongoose.Document & {
    userId: mongoose.Types.ObjectId;
    name: string;
    content: string;
    buttons: CustomMessageButton[];
    placeholders: string[];
    createdAt: Date;
    updatedAt: Date;
};

// Delete cached model in development
if (mongoose.models.CustomMessage) {
    delete mongoose.models.CustomMessage;
}

export default mongoose.model<CustomMessageDocument>('CustomMessage', CustomMessageSchema);
