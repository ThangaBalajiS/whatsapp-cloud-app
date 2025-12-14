import mongoose from 'mongoose';

export type TriggerMatchType = 'any' | 'includes' | 'starts_with' | 'exact';

export type FlowTrigger = {
  matchType: TriggerMatchType;
  matchText: string;
};

export type FlowConnection = {
  sourceTemplate: string;
  button?: string; // Optional - not needed for function connections
  targetType: 'template' | 'function';
  target: string;
  nextTemplate?: string; // For function connections: template to send after function executes
};

export type FlowFunctionDefinition = {
  name: string;
  description?: string;
  code: string;
  inputKey: string;
  timeoutMs: number;
  nextTemplate?: string;
};

const TriggerSchema = new mongoose.Schema<FlowTrigger>(
  {
    matchType: {
      type: String,
      enum: ['any', 'includes', 'starts_with', 'exact'],
      default: 'any',
    },
    matchText: { type: String, default: '' },
  },
  { _id: false }
);

const ConnectionSchema = new mongoose.Schema<FlowConnection>(
  {
    sourceTemplate: { type: String, required: true },
    button: { type: String, default: '' }, // Optional for function connections
    targetType: {
      type: String,
      required: true,
      enum: ['template', 'function'],
    },
    target: { type: String, required: true },
    nextTemplate: { type: String, default: '' }, // Template after function execution
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
      default: 'New Flow',
    },
    trigger: {
      type: TriggerSchema,
      default: { matchType: 'any', matchText: '' },
    },
    firstTemplate: {
      type: String,
      default: '',
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

// Allow multiple flows per user - index for faster queries
FlowSchema.index({ userId: 1 });

export type FlowDocument = mongoose.Document & {
  userId: mongoose.Types.ObjectId;
  name: string;
  trigger: FlowTrigger;
  firstTemplate: string;
  connections: FlowConnection[];
  functions: FlowFunctionDefinition[];
  createdAt: Date;
  updatedAt: Date;
};

// Delete cached model in development to ensure schema changes are picked up
if (mongoose.models.Flow) {
  delete mongoose.models.Flow;
}

export default mongoose.model<FlowDocument>('Flow', FlowSchema);

