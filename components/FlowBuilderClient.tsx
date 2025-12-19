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
  outputMapping?: Record<string, string>; // Maps function output keys to placeholder names
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
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [editingFunctionMapping, setEditingFunctionMapping] = useState<{
    functionName: string;
    sourceTemplate: string;
    nextTemplate: string;
    currentMapping: Record<string, string>;
  } | null>(null);
  const [mappingForm, setMappingForm] = useState<Record<string, string>>({});
  const [newOutputKey, setNewOutputKey] = useState('');
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

  // Get placeholders from a template or custom message
  const getTemplatePlaceholders = (templateName: string): string[] => {
    if (templateName.startsWith('custom:')) {
      const customMsgName = templateName.replace('custom:', '');
      const customMsg = customMessages.find((m) => m.name === customMsgName);
      return customMsg?.placeholders || [];
    }

    // For WhatsApp templates, extract {{1}}, {{2}} style placeholders from BODY component
    const template = templates.find((t) => t.name === templateName);
    if (!template) return [];

    const bodyComponent = template.components?.find((c) => c.type === 'BODY');
    if (!bodyComponent?.text) return [];

    const matches = bodyComponent.text.match(/\{\{\d+\}\}/g);
    if (!matches) return [];
    return [...new Set(matches)];
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

    // Check if this template has a function attached (for templates without buttons)
    const funcConn = connections.find(
      (c) => c.sourceTemplate === templateName && c.targetType === 'function' && !c.button
    );
    const hasFunctionAttached = !!funcConn;

    // Create node
    const nodeData: any = {
      label: displayName,
      buttons: buttons.map((btn, idx) => ({ text: btn.text || `Button ${idx + 1}`, id: `btn-${idx}` })),
      onRemove: () => removeNode(nodeId),
      hasFunctionAttached,
      onAddFunction: () => {
        setPendingConnection({
          sourceNode: nodeId,
          sourceHandle: isCustom ? 'custom-out' : 'template-out',
          type: 'function-next'
        });
        setShowFunctionModal(true);
      },
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
      const funcY = y + 120;

      if (funcConn) {
        const funcNodeId = `func-${funcConn.target.replace(/[^a-zA-Z0-9]/g, '-')}`;
        const fn = functions.find((f) => f.name === funcConn.target);
        const hasMapping = funcConn.outputMapping && Object.keys(funcConn.outputMapping).length > 0;

        nodes.push({
          id: funcNodeId,
          type: 'function',
          position: { x, y: funcY },
          data: {
            label: funcConn.target,
            description: fn?.description,
            onRemove: () => removeNode(funcNodeId),
            hasMapping,
            onClick: funcConn.nextTemplate ? () => {
              setEditingFunctionMapping({
                functionName: funcConn.target,
                sourceTemplate: templateName,
                nextTemplate: funcConn.nextTemplate!,
                currentMapping: funcConn.outputMapping || {},
              });
              setMappingForm(funcConn.outputMapping || {});
              setShowMappingModal(true);
            } : undefined,
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

        // Function can have a next template - add an "Add message" placeholder
        if (funcConn.nextTemplate) {
          buildNodeTree(funcConn.nextTemplate, funcNodeId, 'function-out', x, funcY + 120, nodes, edges, connections, visited);
        } else {
          // Add message placeholder after function
          const addId = `add-${funcNodeId}-next`;
          nodes.push({
            id: addId,
            type: 'add',
            position: { x, y: funcY + 120 },
            data: {
              onClick: () => {
                setPendingConnection({ sourceNode: funcNodeId, sourceHandle: 'function-out', type: 'button' });
                setShowTemplateModal(true);
              },
            },
          });
          edges.push({
            id: `${funcNodeId}-to-add-next`,
            source: funcNodeId,
            target: addId,
            sourceHandle: 'function-out',
            targetHandle: 'add-in',
            type: 'smoothstep',
            style: { stroke: 'rgba(91, 157, 255, 0.5)', strokeDasharray: '5 5' },
          });
        }
      }
    }
  };

  const removeNode = (nodeId: string) => {
    // Helper function to find all descendant node IDs recursively
    const findAllDescendants = (startNodeId: string, currentEdges: FlowEdge[], visited: Set<string> = new Set()): Set<string> => {
      if (visited.has(startNodeId)) return visited;
      visited.add(startNodeId);

      // Find all nodes that this node connects to (children)
      currentEdges
        .filter((e) => e.source === startNodeId)
        .forEach((e) => {
          if (!e.target.startsWith('add-')) {
            findAllDescendants(e.target, currentEdges, visited);
          }
        });

      return visited;
    };

    setEdges((currentEdges) => {
      // Find the parent edge (the edge that points TO this node)
      const parentEdge = currentEdges.find((e) => e.target === nodeId);

      // Find all nodes to remove (the node itself and all descendants)
      const nodesToRemove = findAllDescendants(nodeId, currentEdges);

      // Get position of the node being removed for the new add-placeholder
      let removedNodePosition = { x: 250, y: 200 };

      setNodes((nds) => {
        const nodeBeingRemoved = nds.find((n) => n.id === nodeId);
        if (nodeBeingRemoved) {
          removedNodePosition = nodeBeingRemoved.position;
        }

        // Filter out removed nodes and their add-placeholders
        const filteredNodes = nds.filter((n) => {
          if (nodesToRemove.has(n.id)) return false;
          for (const removedId of nodesToRemove) {
            if (n.id.startsWith(`add-${removedId}`)) return false;
          }
          return true;
        });

        // If we had a parent, add a new add-placeholder in place of the deleted node
        if (parentEdge) {
          const sourceNode = nds.find((n) => n.id === parentEdge.source);
          const addNodeId = `add-${parentEdge.source}-${parentEdge.sourceHandle || 'out'}`;

          // Determine the connection type based on parent node and handle
          let connectionType: 'first' | 'button' | 'function-next' = 'button';
          if (parentEdge.source === 'trigger') {
            connectionType = 'first';
          } else if (sourceNode?.type === 'function') {
            connectionType = 'function-next';
          } else if (parentEdge.sourceHandle?.startsWith('btn-')) {
            connectionType = 'button';
          } else {
            connectionType = 'function-next';
          }

          // Check if this add-node already exists
          const addNodeExists = filteredNodes.some((n) => n.id === addNodeId);

          if (!addNodeExists) {
            filteredNodes.push({
              id: addNodeId,
              type: 'add',
              position: removedNodePosition,
              data: {
                onClick: () => {
                  setPendingConnection({
                    sourceNode: parentEdge.source,
                    sourceHandle: parentEdge.sourceHandle || 'trigger-out',
                    type: connectionType
                  });
                  if (connectionType === 'function-next' && sourceNode?.type !== 'function') {
                    setShowFunctionModal(true);
                  } else {
                    setShowTemplateModal(true);
                  }
                },
              },
            });
          }
        }

        return filteredNodes;
      });

      // Remove all edges connected to any of the removed nodes
      const filteredEdges = currentEdges.filter((e) =>
        !nodesToRemove.has(e.source) && !nodesToRemove.has(e.target)
      );

      // If we had a parent, add a new edge to the add-placeholder
      if (parentEdge) {
        const addNodeId = `add-${parentEdge.source}-${parentEdge.sourceHandle || 'out'}`;
        filteredEdges.push({
          id: `${parentEdge.source}-to-${addNodeId}`,
          source: parentEdge.source,
          target: addNodeId,
          sourceHandle: parentEdge.sourceHandle,
          targetHandle: 'add-in',
          type: 'smoothstep',
          style: { stroke: 'rgba(91, 157, 255, 0.5)', strokeDasharray: '5 5' },
        });
      }

      return filteredEdges;
    });
  };

  // ==================== EXTRACT CONNECTIONS FROM EDGES ====================
  const extractConnectionsFromEdges = (): FlowConnection[] => {
    const result: FlowConnection[] = [];
    const functionNextTemplates: Map<string, string> = new Map();
    const functionOutputMappings: Map<string, Record<string, string>> = new Map();

    // First pass: collect function -> next template mappings and output mappings
    edges.forEach((edge) => {
      if (edge.target.startsWith('add-')) return;

      const sourceNode = nodes.find((n) => n.id === edge.source);
      const targetNode = nodes.find((n) => n.id === edge.target);

      if (!sourceNode || !targetNode) return;

      // If source is a function node and target is a template/customMessage
      if (sourceNode.type === 'function' && (targetNode.type === 'template' || targetNode.type === 'customMessage')) {
        const funcName = sourceNode.data.label as string;
        let nextTemplateName = '';
        if (targetNode.type === 'template') {
          nextTemplateName = targetNode.data.label as string;
        } else {
          nextTemplateName = `custom:${targetNode.data.label}`;
        }
        functionNextTemplates.set(funcName, nextTemplateName);
      }
    });

    // Collect existing output mappings from connections state
    connections.forEach((conn) => {
      if (conn.targetType === 'function' && conn.outputMapping) {
        functionOutputMappings.set(conn.target, conn.outputMapping);
      }
    });

    // Second pass: build connections
    edges.forEach((edge) => {
      // Skip edges to add nodes
      if (edge.target.startsWith('add-')) return;

      const sourceNode = nodes.find((n) => n.id === edge.source);
      const targetNode = nodes.find((n) => n.id === edge.target);

      if (!sourceNode || !targetNode) return;

      // Skip trigger -> first template (handled separately)
      if (sourceNode.id === 'trigger') return;

      // Skip function -> template edges (handled via nextTemplate on the function connection)
      if (sourceNode.type === 'function') return;

      // Get source template name
      let sourceTemplate = '';
      if (sourceNode.type === 'template') {
        sourceTemplate = sourceNode.data.label as string;
      } else if (sourceNode.type === 'customMessage') {
        sourceTemplate = `custom:${sourceNode.data.label}`;
      }

      if (!sourceTemplate) return;

      // Determine target
      let targetType: 'template' | 'custom_message' | 'function' = 'template';
      let target = '';
      let nextTemplate: string | undefined;
      let outputMapping: Record<string, string> | undefined;

      if (targetNode.type === 'template') {
        targetType = 'template';
        target = targetNode.data.label as string;
      } else if (targetNode.type === 'customMessage') {
        targetType = 'custom_message';
        target = `custom:${targetNode.data.label}`;
      } else if (targetNode.type === 'function') {
        targetType = 'function';
        target = targetNode.data.label as string;
        // Get the nextTemplate for this function
        nextTemplate = functionNextTemplates.get(target);
        // Get existing output mapping
        outputMapping = functionOutputMappings.get(target);
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
        nextTemplate,
        outputMapping,
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
      // Add button connection or function -> next template
      const sourceNode = nodes.find((n) => n.id === pendingConnection.sourceNode);
      if (!sourceNode) return;

      // Check if the source is a function node
      if (sourceNode.type === 'function') {
        // This is setting the nextTemplate for a function connection
        const functionName = sourceNode.data.label as string;

        // Find the existing function connection and update its nextTemplate
        const updatedConnections = connections.map((c) => {
          if (c.targetType === 'function' && c.target === functionName) {
            return { ...c, nextTemplate: targetName };
          }
          return c;
        });

        setConnections(updatedConnections);

        // Rebuild nodes
        const newFlow: Flow = {
          _id: currentFlowId || '',
          name: flowName,
          trigger,
          firstTemplate,
          connections: updatedConnections,
          functions: [],
          createdAt: '',
          updatedAt: '',
        };
        buildNodesFromFlow(newFlow);
      } else {
        // Regular button connection from template/custom message
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

  // Handle saving function output mapping
  const handleSaveMapping = (mapping: Record<string, string>) => {
    if (!editingFunctionMapping) return;

    const { functionName, sourceTemplate } = editingFunctionMapping;

    // Update the connection with the new mapping
    const updatedConnections = connections.map((c) => {
      if (c.sourceTemplate === sourceTemplate && c.targetType === 'function' && c.target === functionName) {
        return { ...c, outputMapping: mapping };
      }
      return c;
    });

    setConnections(updatedConnections);

    // Rebuild nodes with updated connections
    const newFlow: Flow = {
      _id: currentFlowId || '',
      name: flowName,
      trigger,
      firstTemplate,
      connections: updatedConnections,
      functions: [],
      createdAt: '',
      updatedAt: '',
    };
    buildNodesFromFlow(newFlow);

    setShowMappingModal(false);
    setEditingFunctionMapping(null);
  };

  const renderMappingModal = () => {
    if (!editingFunctionMapping) return null;

    const placeholders = getTemplatePlaceholders(editingFunctionMapping.nextTemplate);

    const addOutputKey = () => {
      const key = newOutputKey.trim();
      if (key && !mappingForm.hasOwnProperty(key)) {
        setMappingForm({ ...mappingForm, [key]: '' });
        setNewOutputKey('');
      }
    };

    const removeOutputKey = (key: string) => {
      const updated = { ...mappingForm };
      delete updated[key];
      setMappingForm(updated);
    };

    const updateMapping = (outputKey: string, placeholder: string) => {
      setMappingForm({ ...mappingForm, [outputKey]: placeholder });
    };

    const closeMappingModal = () => {
      setShowMappingModal(false);
      setEditingFunctionMapping(null);
      setMappingForm({});
      setNewOutputKey('');
    };

    return (
      <div className="modal-overlay" onClick={closeMappingModal}>
        <div className="modal-content mapping-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Configure Output Mapping</h2>
            <button className="modal-close" onClick={closeMappingModal}>×</button>
          </div>
          <div className="modal-body">
            <div className="mapping-info">
              <p className="muted">
                Map the JSON keys from <strong>{editingFunctionMapping.functionName}</strong>&apos;s output
                to placeholders in <strong>{editingFunctionMapping.nextTemplate.replace('custom:', '')}</strong>.
              </p>
              <p className="mapping-hint">
                The function should return JSON like: <code>{`{ "key1": "value1", "key2": "value2" }`}</code>
              </p>
            </div>

            <div className="mapping-section">
              <label>Add Output Key</label>
              <div className="mapping-add-row">
                <input
                  type="text"
                  value={newOutputKey}
                  onChange={(e) => setNewOutputKey(e.target.value)}
                  placeholder="e.g., total_amount"
                  onKeyDown={(e) => e.key === 'Enter' && addOutputKey()}
                />
                <button className="btn-primary small" onClick={addOutputKey}>Add</button>
              </div>
            </div>

            {Object.keys(mappingForm).length > 0 && (
              <div className="mapping-section">
                <label>Output Key → Placeholder Mapping</label>
                <div className="mapping-list">
                  {Object.entries(mappingForm).map(([outputKey, placeholder]) => (
                    <div key={outputKey} className="mapping-row">
                      <span className="mapping-key">{outputKey}</span>
                      <span className="mapping-arrow">→</span>
                      <select
                        value={placeholder}
                        onChange={(e) => updateMapping(outputKey, e.target.value)}
                      >
                        <option value="">Select placeholder...</option>
                        {placeholders.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                      <button className="ghost-btn small" onClick={() => removeOutputKey(outputKey)}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {placeholders.length === 0 && (
              <div className="mapping-warning">
                ⚠️ The next message has no placeholders. Add placeholders like {`{{name}}`} to your message content.
              </div>
            )}

            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeMappingModal}>
                Cancel
              </button>
              <button className="btn-primary" onClick={() => handleSaveMapping(mappingForm)}>
                Save Mapping
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

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
      {showMappingModal && renderMappingModal()}
    </main>
  );
}
