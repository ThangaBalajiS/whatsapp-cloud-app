'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

// ==================== TRIGGER NODE ====================
export type TriggerNodeData = {
    label: string;
    matchType: 'any' | 'includes' | 'starts_with' | 'exact';
    matchText: string;
    onEdit?: () => void;
};

type TriggerNodeProps = {
    data: TriggerNodeData;
};

function TriggerNodeComponent({ data }: TriggerNodeProps) {
    const getMatchLabel = () => {
        if (data.matchType === 'any') return 'Any message';
        const labels: Record<string, string> = {
            includes: 'Contains',
            starts_with: 'Starts with',
            exact: 'Exactly',
        };
        return `${labels[data.matchType]}: "${data.matchText}"`;
    };

    return (
        <div className="flow-node trigger-node" onClick={data.onEdit}>
            <div className="flow-node-header">
                <span className="flow-node-icon">🚀</span>
                <span className="flow-node-type">Trigger</span>
            </div>
            <div className="flow-node-body">
                <span className="flow-node-label">{getMatchLabel()}</span>
            </div>
            <Handle type="source" position={Position.Bottom} id="trigger-out" />
        </div>
    );
}

export const TriggerNode = memo(TriggerNodeComponent);

// ==================== TEMPLATE NODE ====================
export type TemplateNodeData = {
    label: string;
    category?: string;
    language?: string;
    buttons: { text: string; id: string }[];
    onAddConnection?: (buttonId: string) => void;
    onRemove?: () => void;
};

type TemplateNodeProps = {
    data: TemplateNodeData;
};

function TemplateNodeComponent({ data }: TemplateNodeProps) {
    return (
        <div className="flow-node template-node">
            <Handle type="target" position={Position.Top} id="template-in" />
            <div className="flow-node-header">
                <span className="flow-node-icon">📋</span>
                <span className="flow-node-type">Template</span>
                {data.onRemove && (
                    <button className="flow-node-remove" onClick={data.onRemove}>×</button>
                )}
            </div>
            <div className="flow-node-body">
                <span className="flow-node-label">{data.label}</span>
                {data.category && (
                    <span className="flow-node-meta">{data.category} • {data.language}</span>
                )}
            </div>
            {data.buttons.length > 0 ? (
                <div className="flow-node-buttons">
                    {data.buttons.map((btn: { text: string; id: string }, idx: number) => (
                        <div key={btn.id} className="flow-node-button">
                            <span>{btn.text}</span>
                            <Handle
                                type="source"
                                position={Position.Right}
                                id={`btn-${idx}`}
                                style={{ top: `${30 + idx * 32}px` }}
                            />
                        </div>
                    ))}
                </div>
            ) : (
                <Handle type="source" position={Position.Bottom} id="template-out" />
            )}
        </div>
    );
}

export const TemplateNode = memo(TemplateNodeComponent);

// ==================== CUSTOM MESSAGE NODE ====================
export type CustomMessageNodeData = {
    label: string;
    content?: string;
    buttons: { text: string; id: string }[];
    onAddConnection?: (buttonId: string) => void;
    onRemove?: () => void;
};

type CustomMessageNodeProps = {
    data: CustomMessageNodeData;
};

function CustomMessageNodeComponent({ data }: CustomMessageNodeProps) {
    return (
        <div className="flow-node custom-message-node">
            <Handle type="target" position={Position.Top} id="custom-in" />
            <div className="flow-node-header">
                <span className="flow-node-icon">💬</span>
                <span className="flow-node-type">Custom Message</span>
                {data.onRemove && (
                    <button className="flow-node-remove" onClick={data.onRemove}>×</button>
                )}
            </div>
            <div className="flow-node-body">
                <span className="flow-node-label">{data.label}</span>
                {data.content && (
                    <span className="flow-node-preview">{data.content.substring(0, 50)}...</span>
                )}
            </div>
            {data.buttons.length > 0 ? (
                <div className="flow-node-buttons">
                    {data.buttons.map((btn: { text: string; id: string }, idx: number) => (
                        <div key={btn.id} className="flow-node-button">
                            <span>{btn.text}</span>
                            <Handle
                                type="source"
                                position={Position.Right}
                                id={`btn-${idx}`}
                                style={{ top: `${30 + idx * 32}px` }}
                            />
                        </div>
                    ))}
                </div>
            ) : (
                <Handle type="source" position={Position.Bottom} id="custom-out" />
            )}
        </div>
    );
}

export const CustomMessageNode = memo(CustomMessageNodeComponent);

// ==================== FUNCTION NODE ====================
export type FunctionNodeData = {
    label: string;
    description?: string;
    onRemove?: () => void;
};

type FunctionNodeProps = {
    data: FunctionNodeData;
};

function FunctionNodeComponent({ data }: FunctionNodeProps) {
    return (
        <div className="flow-node function-node">
            <Handle type="target" position={Position.Top} id="function-in" />
            <div className="flow-node-header">
                <span className="flow-node-icon">⚡</span>
                <span className="flow-node-type">Function</span>
                {data.onRemove && (
                    <button className="flow-node-remove" onClick={data.onRemove}>×</button>
                )}
            </div>
            <div className="flow-node-body">
                <span className="flow-node-label">{data.label}</span>
                {data.description && (
                    <span className="flow-node-meta">{data.description}</span>
                )}
            </div>
            <Handle type="source" position={Position.Bottom} id="function-out" />
        </div>
    );
}

export const FunctionNode = memo(FunctionNodeComponent);

// ==================== ADD NODE (Placeholder) ====================
export type AddNodeData = {
    onClick?: () => void;
};

type AddNodeProps = {
    data: AddNodeData;
};

function AddNodeComponent({ data }: AddNodeProps) {
    return (
        <div className="flow-node add-node" onClick={data.onClick}>
            <Handle type="target" position={Position.Top} id="add-in" />
            <div className="flow-node-add">
                <span className="plus-icon">+</span>
                <span>Add message</span>
            </div>
        </div>
    );
}

export const AddNode = memo(AddNodeComponent);

// Export node types for React Flow
export const nodeTypes = {
    trigger: TriggerNode,
    template: TemplateNode,
    customMessage: CustomMessageNode,
    function: FunctionNode,
    add: AddNode,
};
