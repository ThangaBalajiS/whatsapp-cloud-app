'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DashboardSidebar } from './DashboardSidebar';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  MarkerType,
  BackgroundVariant,
} from '@xyflow/react';
import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import Dagre from '@dagrejs/dagre';
import { nodeTypes } from './FlowNodes';

// ==================== AUTO LAYOUT ====================
const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 80, ranksep: 100 });

  nodes.forEach((node) => {
    const width = node.type === 'add' ? 180 : 220;
    const height = node.type === 'add' ? 60 : node.type === 'trigger' ? 80 :
      ((node.data as any)?.buttons?.length || 0) * 32 + 120;
    g.setNode(node.id, { width, height });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  Dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWithPosition.width / 2,
        y: nodeWithPosition.y - nodeWithPosition.height / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

// ==================== TYPES ====================
type TriggerMatchType = 'any' | 'includes' | 'starts_with' | 'exact';

type FlowTrigger = {
  matchType: TriggerMatchType;
  matchText: string;
};

type TemplateButton = {
  type?: string;
  text?: string;
  url?: string;
  phone_number?: string;
};

type TemplateComponent = {
  type: string;
  text?: string;
  buttons?: TemplateButton[];
};

type Template = {
  name: string;
  status: string;
  category: string;
  language: string;
  components?: TemplateComponent[];
};

type FlowConnection = {
  sourceTemplate: string;
  button?: string;
  targetType: 'template' | 'function' | 'custom_message';
  target: string;
  nextTemplate?: string;
};

type CustomMessage = {
  _id: string;
  name: string;
  content: string;
  buttons: { type: string; text: string; payload?: string; url?: string; phone?: string }[];
  placeholders: string[];
};

type FlowFunction = {
  _id: string;
  name: string;
  description?: string;
  code: string;
  inputKey: string;
  timeoutMs: number;
  nextTemplate?: string;
};

type Flow = {
  _id: string;
  name: string;
  trigger: FlowTrigger;
  firstTemplate: string;
  connections: FlowConnection[];
  functions: any[];
  createdAt: string;
  updatedAt: string;
};

type Props = {
  userEmail: string;
  userId: string;
  hasWhatsAppAccount: boolean;
};

type ViewMode = 'list' | 'builder';

// ==================== COMPONENT ====================
export default function FlowBuilderClient({
  userEmail,
  userId,
  hasWhatsAppAccount,
}: Props) {
  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [flows, setFlows] = useState<Flow[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [customMessages, setCustomMessages] = useState<CustomMessage[]>([]);
  const [functions, setFunctions] = useState<FlowFunction[]>([]);
  const [loading, setLoading] = useState(true);

  // Current flow being edited
  const [currentFlowId, setCurrentFlowId] = useState<string | null>(null);
  const [flowName, setFlowName] = useState('New Flow');
  const [trigger, setTrigger] = useState<FlowTrigger>({ matchType: 'any', matchText: '' });
  const [firstTemplate, setFirstTemplate] = useState('');
  const [connections, setConnections] = useState<FlowConnection[]>([]);

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);

  // Modal state
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showFunctionModal, setShowFunctionModal] = useState(false);
  const [showTriggerModal, setShowTriggerModal] = useState(false);
  const [pickerTab, setPickerTab] = useState<'templates' | 'custom'>('templates');
  const [pendingConnection, setPendingConnection] = useState<{
    sourceNode: string;
    sourceHandle: string;
    type: 'first' | 'button' | 'function-next';
  } | null>(null);

  // ==================== DATA FETCHING ====================
  useEffect(() => {
    if (hasWhatsAppAccount) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [hasWhatsAppAccount]);

  const fetchData = async () => {
    try {
      const [templatesRes, flowsRes, customMsgRes, functionsRes] = await Promise.all([
        fetch('/api/whatsapp/templates'),
        fetch('/api/flows'),
        fetch('/api/custom-messages'),
        fetch('/api/functions'),
      ]);

      const templatesData = await templatesRes.json();
      const flowsData = await flowsRes.json();
      const customMsgData = await customMsgRes.json();
      const functionsData = await functionsRes.json();

      if (templatesRes.ok) {
        const approvedTemplates = (templatesData.templates || []).filter(
          (t: Template) => t.status === 'APPROVED'
        );
        setTemplates(approvedTemplates);
      }
      if (flowsRes.ok) setFlows(flowsData.flows || []);
      if (customMsgRes.ok) setCustomMessages(customMsgData.messages || []);
      if (functionsRes.ok) setFunctions(functionsData.functions || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // ==================== FLOW CRUD ====================
  const createNewFlow = () => {
    setCurrentFlowId(null);
    setFlowName('New Flow');
    setTrigger({ matchType: 'any', matchText: '' });
    setFirstTemplate('');
    setConnections([]);
    initializeNodes();
    setViewMode('builder');
  };

  const editFlow = (flow: Flow) => {
    setCurrentFlowId(flow._id);
    setFlowName(flow.name);
    setTrigger(flow.trigger || { matchType: 'any', matchText: '' });
    setFirstTemplate(flow.firstTemplate || '');
    setConnections(flow.connections || []);
    buildNodesFromFlow(flow);
    setViewMode('builder');
  };

  const deleteFlow = async (flowId: string) => {
    if (!confirm('Delete this flow?')) return;
    try {
      const res = await fetch(`/api/flows/${flowId}`, { method: 'DELETE' });
      if (res.ok) {
        setFlows((prev) => prev.filter((f) => f._id !== flowId));
      }
    } catch (error) {
      console.error('Error deleting flow:', error);
    }
  };

  const saveFlow = async () => {
    // Extract connections from edges
    const flowConnections = extractConnectionsFromEdges();

    const payload = {
      name: flowName,
      trigger,
      firstTemplate,
      connections: flowConnections,
    };

    try {
      const url = currentFlowId ? `/api/flows/${currentFlowId}` : '/api/flows';
      const method = currentFlowId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        await fetchData();
        setViewMode('list');
      }
    } catch (error) {
      console.error('Error saving flow:', error);
    }
  };

  const cancelBuilder = () => {
    setViewMode('list');
  };

  // ==================== NODE HELPERS ====================
  const getTemplateButtons = (templateName: string): TemplateButton[] => {
    if (templateName.startsWith('custom:')) {
      const customMsgName = templateName.replace('custom:', '');
      const customMsg = customMessages.find((m) => m.name === customMsgName);
      if (customMsg && customMsg.buttons.length > 0) {
        return customMsg.buttons.map((btn) => ({
          type: btn.type === 'quick_reply' ? 'QUICK_REPLY' : btn.type,
          text: btn.text,
        }));
      }
      return [];
    }

    const template = templates.find((t) => t.name === templateName);
    if (!template) return [];
    return (
      template.components
        ?.filter((c) => c.type === 'BUTTONS')
        .flatMap((c) => c.buttons || []) || []
    );
  };

  // ==================== BUILD NODES FROM FLOW ====================
  const initializeNodes = () => {
    const triggerNode: Node = {
      id: 'trigger',
      type: 'trigger',
      position: { x: 250, y: 50 },
      data: {
        label: 'Trigger',
        matchType: 'any',
        matchText: '',
        onEdit: () => setShowTriggerModal(true),
      },
    };

    const addNode: Node = {
      id: 'add-first',
      type: 'add',
      position: { x: 250, y: 200 },
      data: {
        onClick: () => {
          setPendingConnection({ sourceNode: 'trigger', sourceHandle: 'trigger-out', type: 'first' });
          setShowTemplateModal(true);
        },
      },
    };

    const initialNodes = [triggerNode, addNode];
    const initialEdges = [
      {
        id: 'trigger-to-add',
        source: 'trigger',
        target: 'add-first',
        sourceHandle: 'trigger-out',
        targetHandle: 'add-in',
        type: 'smoothstep',
        style: { stroke: 'rgba(91, 157, 255, 0.5)', strokeDasharray: '5 5' },
      },
    ];

    // Apply auto-layout
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(initialNodes, initialEdges);
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  };

  const buildNodesFromFlow = (flow: Flow) => {
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    let yOffset = 50;
    const xCenter = 250;

    // Trigger node
    newNodes.push({
      id: 'trigger',
      type: 'trigger',
      position: { x: xCenter, y: yOffset },
      data: {
        label: 'Trigger',
        matchType: flow.trigger?.matchType || 'any',
        matchText: flow.trigger?.matchText || '',
        onEdit: () => setShowTriggerModal(true),
      },
    });

    yOffset += 150;

    // Build nodes recursively from firstTemplate
    if (flow.firstTemplate) {
      buildNodeTree(flow.firstTemplate, 'trigger', 'trigger-out', xCenter, yOffset, newNodes, newEdges, flow.connections, new Set());
    } else {
      // Add placeholder
      newNodes.push({
        id: 'add-first',
        type: 'add',
        position: { x: xCenter, y: yOffset },
        data: {
          onClick: () => {
            setPendingConnection({ sourceNode: 'trigger', sourceHandle: 'trigger-out', type: 'first' });
            setShowTemplateModal(true);
          },
        },
      });
      newEdges.push({
        id: 'trigger-to-add',
        source: 'trigger',
        target: 'add-first',
        sourceHandle: 'trigger-out',
        targetHandle: 'add-in',
        type: 'smoothstep',
        style: { stroke: 'rgba(91, 157, 255, 0.5)', strokeDasharray: '5 5' },
      });
    }

    // Apply auto-layout
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(newNodes, newEdges);
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  };

  const buildNodeTree = (
    templateName: string,
    sourceId: string,
    sourceHandle: string,
    x: number,
    y: number,
    nodes: Node[],
    edges: Edge[],
    connections: FlowConnection[],
    visited: Set<string>
  ) => {
    if (visited.has(templateName)) return; // Prevent infinite loops
    visited.add(templateName);

    const isCustom = templateName.startsWith('custom:');
    const displayName = isCustom ? templateName.replace('custom:', '') : templateName;
    const nodeId = `node-${templateName.replace(/[^a-zA-Z0-9]/g, '-')}`;
    const buttons = getTemplateButtons(templateName);

    // Create node
    const nodeData: any = {
      label: displayName,
      buttons: buttons.map((btn, idx) => ({ text: btn.text || `Button ${idx + 1}`, id: `btn-${idx}` })),
      onRemove: () => removeNode(nodeId),
    };

    if (isCustom) {
      const customMsg = customMessages.find((m) => m.name === displayName);
      nodeData.content = customMsg?.content;
    } else {
      const template = templates.find((t) => t.name === displayName);
      nodeData.category = template?.category;
      nodeData.language = template?.language;
    }

    nodes.push({
      id: nodeId,
      type: isCustom ? 'customMessage' : 'template',
      position: { x, y },
      data: nodeData,
    });

    // Create edge from source
    edges.push({
      id: `${sourceId}-to-${nodeId}`,
      source: sourceId,
      target: nodeId,
      sourceHandle,
      targetHandle: isCustom ? 'custom-in' : 'template-in',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: '#5b9dff' },
    });

    // Process button connections
    if (buttons.length > 0) {
      buttons.forEach((btn, idx) => {
        const buttonText = btn.text || `Button ${idx + 1}`;
        const conn = connections.find(
          (c) => c.sourceTemplate === templateName && c.button === buttonText
        );

        const btnX = x + 280;
        const btnY = y + idx * 120;

        if (conn && (conn.targetType === 'template' || conn.targetType === 'custom_message')) {
          buildNodeTree(conn.target, nodeId, `btn-${idx}`, btnX, btnY, nodes, edges, connections, visited);
        } else {
          // Add placeholder for this button
          const addId = `add-${nodeId}-btn-${idx}`;
          nodes.push({
            id: addId,
            type: 'add',
            position: { x: btnX, y: btnY },
            data: {
              onClick: () => {
                setPendingConnection({ sourceNode: nodeId, sourceHandle: `btn-${idx}`, type: 'button' });
                setShowTemplateModal(true);
              },
            },
          });
          edges.push({
            id: `${nodeId}-btn-${idx}-to-add`,
            source: nodeId,
            target: addId,
            sourceHandle: `btn-${idx}`,
            targetHandle: 'add-in',
            type: 'smoothstep',
            style: { stroke: 'rgba(91, 157, 255, 0.5)', strokeDasharray: '5 5' },
          });
        }
      });
    } else {
      // Templates without buttons can connect to functions
      const funcConn = connections.find(
        (c) => c.sourceTemplate === templateName && c.targetType === 'function' && !c.button
      );

      const funcY = y + 120;

      if (funcConn) {
        const funcNodeId = `func-${funcConn.target.replace(/[^a-zA-Z0-9]/g, '-')}`;
        const fn = functions.find((f) => f.name === funcConn.target);

        nodes.push({
          id: funcNodeId,
          type: 'function',
          position: { x, y: funcY },
          data: {
            label: funcConn.target,
            description: fn?.description,
            onRemove: () => removeNode(funcNodeId),
          },
        });

        edges.push({
          id: `${nodeId}-to-${funcNodeId}`,
          source: nodeId,
          target: funcNodeId,
          sourceHandle: isCustom ? 'custom-out' : 'template-out',
          targetHandle: 'function-in',
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: '#f59e0b' },
        });

        // Function can have a next template
        if (funcConn.nextTemplate) {
          buildNodeTree(funcConn.nextTemplate, funcNodeId, 'function-out', x, funcY + 120, nodes, edges, connections, visited);
        }
      } else {
        // Add function placeholder
        const addId = `add-${nodeId}-func`;
        nodes.push({
          id: addId,
          type: 'add',
          position: { x, y: funcY },
          data: {
            onClick: () => {
              setPendingConnection({ sourceNode: nodeId, sourceHandle: isCustom ? 'custom-out' : 'template-out', type: 'function-next' });
              setShowFunctionModal(true);
            },
          },
        });
        edges.push({
          id: `${nodeId}-to-add-func`,
          source: nodeId,
          target: addId,
          sourceHandle: isCustom ? 'custom-out' : 'template-out',
          targetHandle: 'add-in',
          type: 'smoothstep',
          style: { stroke: 'rgba(91, 157, 255, 0.5)', strokeDasharray: '5 5' },
        });
      }
    }
  };

  const removeNode = (nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId && !n.id.startsWith(`add-${nodeId}`)));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    // TODO: Also update connections and firstTemplate state
  };

  // ==================== EXTRACT CONNECTIONS FROM EDGES ====================
  const extractConnectionsFromEdges = (): FlowConnection[] => {
    const result: FlowConnection[] = [];

    edges.forEach((edge) => {
      // Skip edges to add nodes
      if (edge.target.startsWith('add-')) return;

      const sourceNode = nodes.find((n) => n.id === edge.source);
      const targetNode = nodes.find((n) => n.id === edge.target);

      if (!sourceNode || !targetNode) return;

      // Skip trigger -> first template (handled separately)
      if (sourceNode.id === 'trigger') return;

      // Get source template name
      let sourceTemplate = '';
      if (sourceNode.type === 'template') {
        sourceTemplate = sourceNode.data.label as string;
      } else if (sourceNode.type === 'customMessage') {
        sourceTemplate = `custom:${sourceNode.data.label}`;
      } else if (sourceNode.type === 'function') {
        // Function -> next template
        const funcName = sourceNode.data.label as string;
        // Find the connection that this function belongs to and set nextTemplate
        // This is handled differently
        return;
      }

      if (!sourceTemplate) return;

      // Determine target
      let targetType: 'template' | 'custom_message' | 'function' = 'template';
      let target = '';

      if (targetNode.type === 'template') {
        targetType = 'template';
        target = targetNode.data.label as string;
      } else if (targetNode.type === 'customMessage') {
        targetType = 'custom_message';
        target = `custom:${targetNode.data.label}`;
      } else if (targetNode.type === 'function') {
        targetType = 'function';
        target = targetNode.data.label as string;
      }

      // Determine button from handle
      let button: string | undefined;
      if (edge.sourceHandle?.startsWith('btn-')) {
        const btnIdx = parseInt(edge.sourceHandle.replace('btn-', ''));
        const buttons = getTemplateButtons(sourceTemplate);
        button = buttons[btnIdx]?.text;
      }

      result.push({
        sourceTemplate,
        button,
        targetType,
        target,
      });
    });

    return result;
  };

  // ==================== HANDLE MESSAGE/FUNCTION SELECTION ====================
  const handleSelectMessage = (name: string, type: 'template' | 'custom_message') => {
    if (!pendingConnection) return;

    const targetName = type === 'custom_message' ? `custom:${name}` : name;

    if (pendingConnection.type === 'first') {
      setFirstTemplate(targetName);
      // Rebuild nodes with new first template
      const newFlow: Flow = {
        _id: '',
        name: flowName,
        trigger,
        firstTemplate: targetName,
        connections: [],
        functions: [],
        createdAt: '',
        updatedAt: '',
      };
      buildNodesFromFlow(newFlow);
    } else if (pendingConnection.type === 'button') {
      // Add button connection
      const sourceNode = nodes.find((n) => n.id === pendingConnection.sourceNode);
      if (!sourceNode) return;

      let sourceTemplate = '';
      if (sourceNode.type === 'template') {
        sourceTemplate = sourceNode.data.label as string;
      } else if (sourceNode.type === 'customMessage') {
        sourceTemplate = `custom:${sourceNode.data.label}`;
      }

      const btnIdx = parseInt(pendingConnection.sourceHandle.replace('btn-', ''));
      const buttons = getTemplateButtons(sourceTemplate);
      const button = buttons[btnIdx]?.text;

      const newConnection: FlowConnection = {
        sourceTemplate,
        button,
        targetType: type === 'custom_message' ? 'custom_message' : 'template',
        target: targetName,
      };

      setConnections((prev) => [
        ...prev.filter((c) => !(c.sourceTemplate === sourceTemplate && c.button === button)),
        newConnection,
      ]);

      // Rebuild nodes
      const newFlow: Flow = {
        _id: currentFlowId || '',
        name: flowName,
        trigger,
        firstTemplate,
        connections: [...connections.filter((c) => !(c.sourceTemplate === sourceTemplate && c.button === button)), newConnection],
        functions: [],
        createdAt: '',
        updatedAt: '',
      };
      buildNodesFromFlow(newFlow);
    }

    setShowTemplateModal(false);
    setPendingConnection(null);
  };

  const handleSelectFunction = (functionName: string) => {
    if (!pendingConnection) return;

    const sourceNode = nodes.find((n) => n.id === pendingConnection.sourceNode);
    if (!sourceNode) return;

    let sourceTemplate = '';
    if (sourceNode.type === 'template') {
      sourceTemplate = sourceNode.data.label as string;
    } else if (sourceNode.type === 'customMessage') {
      sourceTemplate = `custom:${sourceNode.data.label}`;
    }

    const newConnection: FlowConnection = {
      sourceTemplate,
      targetType: 'function',
      target: functionName,
    };

    setConnections((prev) => [
      ...prev.filter((c) => !(c.sourceTemplate === sourceTemplate && c.targetType === 'function' && !c.button)),
      newConnection,
    ]);

    // Rebuild nodes
    const newFlow: Flow = {
      _id: currentFlowId || '',
      name: flowName,
      trigger,
      firstTemplate,
      connections: [...connections.filter((c) => !(c.sourceTemplate === sourceTemplate && c.targetType === 'function' && !c.button)), newConnection],
      functions: [],
      createdAt: '',
      updatedAt: '',
    };
    buildNodesFromFlow(newFlow);

    setShowFunctionModal(false);
    setPendingConnection(null);
  };

  // ==================== RENDER MODALS ====================
  const renderTemplateModal = () => (
    <div className="modal-overlay" onClick={() => { setShowTemplateModal(false); setPendingConnection(null); }}>
      <div className="modal-content template-select-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Select Message</h2>
          <button className="modal-close" onClick={() => { setShowTemplateModal(false); setPendingConnection(null); }}>×</button>
        </div>

        {/* Tabs */}
        <div className="picker-tabs">
          <button
            className={`picker-tab ${pickerTab === 'templates' ? 'active' : ''}`}
            onClick={() => setPickerTab('templates')}
          >
            📋 Templates
          </button>
          <button
            className={`picker-tab ${pickerTab === 'custom' ? 'active' : ''}`}
            onClick={() => setPickerTab('custom')}
          >
            💬 Custom Messages
          </button>
        </div>

        <div className="modal-body">
          {pickerTab === 'templates' ? (
            templates.length === 0 ? (
              <div className="empty-state-small">
                <p>No approved templates found.</p>
              </div>
            ) : (
              <div className="template-select-grid">
                {templates.map((t) => (
                  <button
                    key={t.name}
                    className="template-select-item"
                    onClick={() => handleSelectMessage(t.name, 'template')}
                  >
                    <div className="template-select-name">📋 {t.name}</div>
                    <div className="template-select-meta">
                      <span>{t.category}</span> • <span>{t.language}</span>
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : (
            customMessages.length === 0 ? (
              <div className="empty-state-small">
                <p>No custom messages yet.</p>
                <Link href="/dashboard/custom-messages" className="btn-primary small">
                  Create Custom Message
                </Link>
              </div>
            ) : (
              <div className="template-select-grid">
                {customMessages.map((m) => (
                  <button
                    key={m._id}
                    className="template-select-item"
                    onClick={() => handleSelectMessage(m.name, 'custom_message')}
                  >
                    <div className="template-select-name">💬 {m.name}</div>
                    <div className="template-select-meta">
                      {m.placeholders.length > 0 && <span>{m.placeholders.length} placeholders</span>}
                      {m.buttons.length > 0 && <span> • {m.buttons.length} buttons</span>}
                    </div>
                    <div className="template-select-preview">{m.content.substring(0, 60)}...</div>
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );

  const renderFunctionModal = () => (
    <div className="modal-overlay" onClick={() => { setShowFunctionModal(false); setPendingConnection(null); }}>
      <div className="modal-content template-select-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Select Function</h2>
          <button className="modal-close" onClick={() => { setShowFunctionModal(false); setPendingConnection(null); }}>×</button>
        </div>
        <div className="modal-body">
          {functions.length === 0 ? (
            <div className="empty-state-small">
              <p>No functions created yet.</p>
              <Link href="/dashboard/functions" className="btn-primary small">
                Create Function
              </Link>
            </div>
          ) : (
            <div className="template-select-grid">
              {functions.map((fn) => (
                <button
                  key={fn._id}
                  className="template-select-item"
                  onClick={() => handleSelectFunction(fn.name)}
                >
                  <div className="template-select-name">⚡ {fn.name}</div>
                  {fn.description && <div className="template-select-meta">{fn.description}</div>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderTriggerModal = () => (
    <div className="modal-overlay" onClick={() => setShowTriggerModal(false)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Configure Trigger</h2>
          <button className="modal-close" onClick={() => setShowTriggerModal(false)}>×</button>
        </div>
        <div className="modal-body">
          <label>
            Match Type
            <select
              value={trigger.matchType}
              onChange={(e) => setTrigger({ ...trigger, matchType: e.target.value as TriggerMatchType })}
            >
              <option value="any">Any message</option>
              <option value="includes">Message contains</option>
              <option value="starts_with">Message starts with</option>
              <option value="exact">Message equals exactly</option>
            </select>
          </label>
          {trigger.matchType !== 'any' && (
            <label>
              Match Text
              <input
                type="text"
                value={trigger.matchText}
                onChange={(e) => setTrigger({ ...trigger, matchText: e.target.value })}
                placeholder="Enter text to match..."
              />
            </label>
          )}
          <button onClick={() => {
            // Update trigger node data
            setNodes((nds) => nds.map((n) =>
              n.id === 'trigger'
                ? { ...n, data: { ...n.data, matchType: trigger.matchType, matchText: trigger.matchText } }
                : n
            ));
            setShowTriggerModal(false);
          }}>
            Save Trigger
          </button>
        </div>
      </div>
    </div>
  );

  // ==================== NO WHATSAPP ACCOUNT ====================
  if (!hasWhatsAppAccount) {
    return (
      <main className="dashboard-container">
        <div className="dashboard-body">
          <DashboardSidebar userEmail={userEmail} />
          <div className="dashboard-content">
            <header className="dashboard-header">
              <div>
                <h1>Flow Builder</h1>
                <p className="lead">Create automated conversation flows</p>
              </div>
            </header>
            <div className="card setup-prompt">
              <h2>Connect WhatsApp first</h2>
              <p>Configure your WhatsApp Cloud API credentials to create flows.</p>
              <Link href="/dashboard/settings" className="btn-primary">
                Go to Settings →
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ==================== LIST VIEW ====================
  if (viewMode === 'list') {
    return (
      <main className="dashboard-container">
        <div className="dashboard-body">
          <DashboardSidebar userEmail={userEmail} />
          <div className="dashboard-content">
            <header className="dashboard-header">
              <div>
                <h1>Flow Builder</h1>
                <p className="lead">Create automated conversation flows</p>
              </div>
              <div className="header-actions">
                <button className="btn-primary" onClick={createNewFlow}>
                  + Create Flow
                </button>
              </div>
            </header>

            {loading ? (
              <div className="loading">Loading flows...</div>
            ) : flows.length === 0 ? (
              <div className="card setup-prompt">
                <h2>No flows yet</h2>
                <p>Create your first automated conversation flow.</p>
                <button className="btn-primary" onClick={createNewFlow}>
                  Create your first flow
                </button>
              </div>
            ) : (
              <div className="flows-grid">
                {flows.map((flow) => (
                  <div key={flow._id} className="flow-card" onClick={() => editFlow(flow)}>
                    <div className="flow-card-header">
                      <h3>{flow.name}</h3>
                      <button
                        className="flow-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteFlow(flow._id);
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                    <div className="flow-card-meta">
                      <span>Trigger: {flow.trigger?.matchType === 'any' ? 'Any message' : flow.trigger?.matchType}</span>
                      {flow.firstTemplate && (
                        <span>
                          First: {flow.firstTemplate.startsWith('custom:')
                            ? `💬 ${flow.firstTemplate.replace('custom:', '')}`
                            : `📋 ${flow.firstTemplate}`}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }

  // ==================== BUILDER VIEW ====================
  return (
    <main className="dashboard-container">
      <div className="dashboard-body">
        <DashboardSidebar userEmail={userEmail} />
        <div className="dashboard-content flow-builder-content">
          <header className="dashboard-header">
            <div className="flow-name-input">
              <input
                type="text"
                value={flowName}
                onChange={(e) => setFlowName(e.target.value)}
                placeholder="Flow name..."
              />
            </div>
            <div className="header-actions">
              <button className="btn-secondary" onClick={cancelBuilder}>
                Cancel
              </button>
              <button className="btn-primary" onClick={saveFlow}>
                Save Flow
              </button>
            </div>
          </header>

          <div className="flow-canvas-container">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              fitView
              defaultEdgeOptions={{
                type: 'smoothstep',
                markerEnd: { type: MarkerType.ArrowClosed },
              }}
            >
              <Controls />
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.1)" />
            </ReactFlow>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showTemplateModal && renderTemplateModal()}
      {showFunctionModal && renderFunctionModal()}
      {showTriggerModal && renderTriggerModal()}
    </main>
  );
}
