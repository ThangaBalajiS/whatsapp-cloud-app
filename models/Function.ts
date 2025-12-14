import mongoose from 'mongoose';

export type FunctionDefinition = {
    name: string;
    description?: string;
    code: string;
    inputKey: string;
    timeoutMs: number;
    nextTemplate?: string;
};

const FunctionSchema = new mongoose.Schema(
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
        description: {
            type: String,
            default: '',
        },
        code: {
            type: String,
            required: true,
        },
        inputKey: {
            type: String,
            default: 'input',
        },
        timeoutMs: {
            type: Number,
            default: 5000,
            min: 100,
            max: 20000,
        },
        nextTemplate: {
            type: String,
            default: '',
        },
    },
    { timestamps: true }
);

// Index for faster queries by user
FunctionSchema.index({ userId: 1 });

// Ensure unique function names per user
FunctionSchema.index({ userId: 1, name: 1 }, { unique: true });

export type FunctionDocument = mongoose.Document & {
    userId: mongoose.Types.ObjectId;
    name: string;
    description: string;
    code: string;
    inputKey: string;
    timeoutMs: number;
    nextTemplate: string;
    createdAt: Date;
    updatedAt: Date;
};

// Delete cached model in development to ensure schema changes are picked up
if (mongoose.models.Function) {
    delete mongoose.models.Function;
}

export default mongoose.model<FunctionDocument>('Function', FunctionSchema);
