import mongoose from 'mongoose';

export type FlowConnection = {
  sourceTemplate: string;
  button: string;
  targetType: 'template' | 'function';
  target: string;
};

export type FlowFunctionDefinition = {
  name: string;
  description?: string;
  code: string;
  inputKey: string;
  timeoutMs: number;
  nextTemplate?: string;
};

const ConnectionSchema = new mongoose.Schema<FlowConnection>(
  {
    sourceTemplate: { type: String, required: true },
    button: { type: String, required: true },
    targetType: {
      type: String,
      required: true,
      enum: ['template', 'function'],
    },
    target: { type: String, required: true },
  },
  { _id: false }
);

const FunctionSchema = new mongoose.Schema<FlowFunctionDefinition>(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    code: { type: String, required: true },
    inputKey: { type: String, default: 'input' },
    timeoutMs: {
      type: Number,
      default: 5000,
      min: 100,
      max: 20000,
    },
    nextTemplate: { type: String, default: '' },
  },
  { _id: false }
);

const FlowSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      default: 'Default Flow',
    },
    connections: {
      type: [ConnectionSchema],
      default: [],
    },
    functions: {
      type: [FunctionSchema],
      default: [],
    },
  },
  { timestamps: true }
);

// One flow document per user keeps the builder simple for now.
FlowSchema.index({ userId: 1 }, { unique: true });

export type FlowDocument = mongoose.Document & {
  userId: mongoose.Types.ObjectId;
  name: string;
  connections: FlowConnection[];
  functions: FlowFunctionDefinition[];
};

export default mongoose.models.Flow || mongoose.model<FlowDocument>('Flow', FlowSchema);
