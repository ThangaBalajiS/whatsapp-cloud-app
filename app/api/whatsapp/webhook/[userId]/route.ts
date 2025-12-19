import { NextResponse } from 'next/server';
import dbConnect from '../../../../../lib/mongodb';
import WhatsAppAccount from '../../../../../models/WhatsAppAccount';
import Contact from '../../../../../models/Contact';
import Message from '../../../../../models/Message';
import { eventEmitter } from '../../../../../lib/eventEmitter';
import { findMatchingFlow, resolveConnection } from '../../../../../lib/flowEngine';
import { sendWhatsAppTemplate, sendWhatsAppCustomMessage } from '../../../../../lib/whatsappSender';
import Flow from '../../../../../models/Flow';
import Function from '../../../../../models/Function';
import CustomMessage from '../../../../../models/CustomMessage';
import { runUserFunction } from '../../../../../lib/functionRunner';

// GET - Webhook verification (Meta sends this to verify the endpoint)
export async function GET(
  request: Request,
  { params }: { params: { userId: string } }
) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (!mode || !token || !challenge) {
    return NextResponse.json({ message: 'Missing parameters' }, { status: 400 });
  }

  if (mode !== 'subscribe') {
    return NextResponse.json({ message: 'Invalid mode' }, { status: 403 });
  }

  try {
    await dbConnect();

    const account = await WhatsAppAccount.findOne({ userId: params.userId });

    if (!account) {
      return NextResponse.json({ message: 'Account not found' }, { status: 404 });
    }

    if (token !== account.webhookVerifyToken) {
      return NextResponse.json({ message: 'Invalid verify token' }, { status: 403 });
    }

    // Mark account as connected
    account.isConnected = true;
    await account.save();

    // Emit webhook connected event
    eventEmitter.emit(params.userId, 'webhook_connected', { isConnected: true });

    // Return the challenge to verify
    return new NextResponse(challenge, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

// POST - Receive incoming messages from WhatsApp
export async function POST(
  request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const body = await request.json();

    await dbConnect();

    const account = await WhatsAppAccount.findOne({ userId: params.userId });

    if (!account) {
      // Still return 200 to prevent Meta from retrying
      return NextResponse.json({ message: 'OK' }, { status: 200 });
    }

    // Mark as connected if not already (first message received)
    if (!account.isConnected) {
      account.isConnected = true;
      await account.save();
      eventEmitter.emit(params.userId, 'webhook_connected', { isConnected: true });
    }

    // Process the webhook payload
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value) {
      return NextResponse.json({ message: 'OK' }, { status: 200 });
    }

    // Handle incoming messages
    const messages = value.messages;
    const contacts = value.contacts;

    if (messages && messages.length > 0) {
      for (const msg of messages) {
        const contactInfo = contacts?.find((c: any) => c.wa_id === msg.from);

        // Find or create contact
        let contact = await Contact.findOne({
          userId: params.userId,
          waId: msg.from,
        });

        let isNewContact = false;
        if (!contact) {
          isNewContact = true;
          contact = await Contact.create({
            userId: params.userId,
            waId: msg.from,
            phoneNumber: msg.from,
            name: contactInfo?.profile?.name || msg.from,
          });
        } else if (contactInfo?.profile?.name && contact.name !== contactInfo.profile.name) {
          contact.name = contactInfo.profile.name;
          await contact.save();
        }

        // Determine message type and content
        let type = 'text';
        let content = '';
        let mediaUrl = '';
        let buttonPayload: string | null = null;
        let isButtonReply = false;

        if (msg.type === 'text') {
          type = 'text';
          content = msg.text?.body || '';
        } else if (msg.type === 'button') {
          // Quick reply button response
          type = 'text';
          content = msg.button?.text || '';
          buttonPayload = msg.button?.payload || msg.button?.text || '';
          isButtonReply = true;
        } else if (msg.type === 'interactive') {
          // Interactive message response (list or button)
          type = 'text';
          if (msg.interactive?.type === 'button_reply') {
            content = msg.interactive.button_reply?.title || '';
            buttonPayload = msg.interactive.button_reply?.id || msg.interactive.button_reply?.title || '';
            isButtonReply = true;
          } else if (msg.interactive?.type === 'list_reply') {
            content = msg.interactive.list_reply?.title || '';
            buttonPayload = msg.interactive.list_reply?.id || '';
            isButtonReply = true;
          }
        } else if (msg.type === 'image') {
          type = 'image';
          content = msg.image?.caption || '[Image]';
          mediaUrl = msg.image?.id || '';
        } else if (msg.type === 'document') {
          type = 'document';
          content = msg.document?.filename || '[Document]';
          mediaUrl = msg.document?.id || '';
        } else if (msg.type === 'audio') {
          type = 'audio';
          content = '[Audio]';
          mediaUrl = msg.audio?.id || '';
        } else if (msg.type === 'video') {
          type = 'video';
          content = msg.video?.caption || '[Video]';
          mediaUrl = msg.video?.id || '';
        } else if (msg.type === 'sticker') {
          type = 'sticker';
          content = '[Sticker]';
          mediaUrl = msg.sticker?.id || '';
        } else if (msg.type === 'location') {
          type = 'location';
          content = `[Location: ${msg.location?.latitude}, ${msg.location?.longitude}]`;
        } else {
          type = 'unknown';
          content = `[${msg.type}]`;
        }

        // Check if message already exists (prevent duplicates)
        const existingMessage = await Message.findOne({ waMessageId: msg.id });

        if (!existingMessage) {
          const newMessage = await Message.create({
            userId: params.userId,
            contactId: contact._id,
            waMessageId: msg.id,
            direction: 'incoming',
            type,
            content,
            mediaUrl,
            timestamp: new Date(parseInt(msg.timestamp) * 1000),
            isRead: false,
          });

          // Update contact's last message time and unread count
          contact.lastMessageAt = new Date();
          contact.unreadCount = (contact.unreadCount || 0) + 1;
          await contact.save();

          // Emit new message event
          eventEmitter.emit(params.userId, 'new_message', {
            message: {
              _id: newMessage._id,
              contactId: contact._id,
              direction: 'incoming',
              type,
              content,
              timestamp: newMessage.timestamp,
              status: 'received',
            },
            contact: {
              _id: contact._id,
              waId: contact.waId,
              phoneNumber: contact.phoneNumber,
              name: contact.name,
              lastMessageAt: contact.lastMessageAt,
              unreadCount: contact.unreadCount,
              isNew: isNewContact,
            },
          });

          // ==== FLOW PROCESSING ====
          try {
            await processFlowForMessage({
              userId: params.userId,
              account,
              contact,
              messageText: content,
              buttonPayload,
              isButtonReply,
            });
          } catch (flowError) {
            console.error('Flow processing error:', flowError);
            // Don't fail the webhook if flow processing fails
          }
        }
      }
    }

    // Handle status updates (sent, delivered, read)
    const statuses = value.statuses;
    if (statuses && statuses.length > 0) {
      for (const status of statuses) {
        await Message.updateOne(
          { waMessageId: status.id },
          { status: status.status }
        );

        // Emit status update event
        eventEmitter.emit(params.userId, 'message_status', {
          waMessageId: status.id,
          status: status.status,
        });
      }
    }

    return NextResponse.json({ message: 'OK' }, { status: 200 });
  } catch (error: any) {
    console.error('Webhook error:', error);
    // Always return 200 to prevent Meta from retrying
    return NextResponse.json({ message: 'OK' }, { status: 200 });
  }
}

// Process flow logic for incoming messages
async function processFlowForMessage({
  userId,
  account,
  contact,
  messageText,
  buttonPayload,
  isButtonReply,
}: {
  userId: string;
  account: any;
  contact: any;
  messageText: string;
  buttonPayload: string | null;
  isButtonReply: boolean;
}) {
  // Helper to send template and track state
  const sendTemplateAndTrack = async (templateName: string, flowId?: string) => {
    const result = await sendWhatsAppTemplate({
      phoneNumberId: account.phoneNumberId,
      accessToken: account.accessToken,
      recipientPhone: contact.waId,
      templateName,
    });

    if (result.success) {
      console.log(`[Flow] Sent template "${templateName}" to ${contact.waId}`);

      // Track last sent template for function processing using findByIdAndUpdate
      await Contact.findByIdAndUpdate(contact._id, {
        lastSentTemplate: templateName,
        lastSentFlowId: flowId || null,
      });
      console.log(`[Flow] Updated contact tracking - lastSentTemplate: "${templateName}", flowId: "${flowId}"`);

      // Save outgoing message
      await Message.create({
        userId,
        contactId: contact._id,
        waMessageId: result.messageId || `template_${Date.now()}`,
        direction: 'outgoing',
        type: 'text',
        content: `[Template: ${templateName}]`,
        timestamp: new Date(),
        status: 'sent',
        isRead: true,
      });
    } else {
      console.error(`[Flow] Failed to send template: ${result.error}`);
    }

    return result;
  };

  // Helper to send custom message and track state
  const sendCustomMessageAndTrack = async (customMessageName: string, flowId?: string, replacements?: Record<string, string>) => {
    // Extract actual name from "custom:MessageName" format
    const actualName = customMessageName.startsWith('custom:')
      ? customMessageName.replace('custom:', '')
      : customMessageName;

    // Look up the custom message from database
    const customMsg = await CustomMessage.findOne({ userId, name: actualName });
    if (!customMsg) {
      console.error(`[Flow] Custom message "${actualName}" not found`);
      return { success: false, error: `Custom message "${actualName}" not found` };
    }

    // Apply placeholder replacements if provided
    let content = customMsg.content;
    if (replacements) {
      for (const [placeholder, value] of Object.entries(replacements)) {
        content = content.replace(new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g'), value);
      }
      console.log(`[Flow] Applied ${Object.keys(replacements).length} placeholder replacements`);
    }

    const result = await sendWhatsAppCustomMessage({
      phoneNumberId: account.phoneNumberId,
      accessToken: account.accessToken,
      recipientPhone: contact.waId,
      content: content,
      buttons: customMsg.buttons,
    });

    if (result.success) {
      console.log(`[Flow] Sent custom message "${actualName}" to ${contact.waId}`);

      // Track last sent template for function processing
      await Contact.findByIdAndUpdate(contact._id, {
        lastSentTemplate: customMessageName, // Keep the custom: prefix for tracking
        lastSentFlowId: flowId || null,
      });
      console.log(`[Flow] Updated contact tracking - lastSentTemplate: "${customMessageName}", flowId: "${flowId}"`);

      // Save outgoing message
      await Message.create({
        userId,
        contactId: contact._id,
        waMessageId: result.messageId || `custom_${Date.now()}`,
        direction: 'outgoing',
        type: 'text',
        content: content,
        timestamp: new Date(),
        status: 'sent',
        isRead: true,
      });
    } else {
      console.error(`[Flow] Failed to send custom message: ${result.error}`);
    }

    return result;
  };

  // If it's a button reply, look for the flow connection
  if (isButtonReply && buttonPayload) {
    const flows = await Flow.find({ userId });

    for (const flow of flows) {
      const connection = flow.connections.find(
        (conn: any) => conn.button === buttonPayload || conn.button === messageText
      );

      if (connection) {
        if (connection.targetType === 'template') {
          console.log(`[Flow] Button "${buttonPayload}" triggered template: ${connection.target}`);
          await sendTemplateAndTrack(connection.target, flow._id.toString());
          return;
        } else if (connection.targetType === 'custom_message') {
          console.log(`[Flow] Button "${buttonPayload}" triggered custom message: ${connection.target}`);
          await sendCustomMessageAndTrack(connection.target, flow._id.toString());
          return;
        }
      }
    }
  }

  // Reload contact from database to get fresh lastSentTemplate values
  const freshContact = await Contact.findById(contact._id);

  // Check if this is a response to a template with a function connection
  console.log(`[Flow Debug] Checking function connection - lastSentTemplate: "${freshContact?.lastSentTemplate}", lastSentFlowId: "${freshContact?.lastSentFlowId}", isButtonReply: ${isButtonReply}`);

  if (!isButtonReply && freshContact?.lastSentTemplate && freshContact?.lastSentFlowId) {
    const flow = await Flow.findById(freshContact.lastSentFlowId);
    console.log(`[Flow Debug] Found flow:`, flow ? flow.name : 'null');

    if (flow) {
      // Find a function connection for the last sent template
      const functionConnection = flow.connections.find(
        (conn: any) => conn.sourceTemplate === freshContact.lastSentTemplate &&
          conn.targetType === 'function' &&
          !conn.button
      );

      if (functionConnection) {
        console.log(`[Flow] Processing function "${functionConnection.target}" with input: "${messageText}"`);

        // Look up the function
        const fn = await Function.findOne({ userId, name: functionConnection.target });

        if (fn) {
          try {
            // Execute the function
            const result = await runUserFunction({
              code: fn.code,
              input: messageText,
              context: { userId, contactId: contact._id.toString() },
              timeoutMs: fn.timeoutMs,
            });

            console.log(`[Flow] Function result:`, result.output);

            // Build placeholder replacements from function output
            let replacements: Record<string, string> = {};
            const output = result.output;

            if (output && typeof output === 'object') {
              // Get outputMapping from connection (convert Map to object if needed)
              const outputMapping: Record<string, string> = functionConnection.outputMapping
                ? (functionConnection.outputMapping instanceof Map
                  ? Object.fromEntries(functionConnection.outputMapping)
                  : functionConnection.outputMapping)
                : {};

              console.log(`[Flow] Output mapping:`, outputMapping);

              if (Object.keys(outputMapping).length > 0) {
                // Use the configured outputMapping
                for (const [outputKey, placeholderName] of Object.entries(outputMapping)) {
                  if ((output as any)[outputKey] !== undefined) {
                    replacements[placeholderName] = String((output as any)[outputKey]);
                  }
                }
              } else {
                // No mapping configured - use output keys directly as placeholder names
                for (const [key, value] of Object.entries(output as Record<string, any>)) {
                  replacements[key] = String(value);
                }
              }
              console.log(`[Flow] Built replacements:`, replacements);
            }

            // Send the next template if configured
            if (functionConnection.nextTemplate) {
              const nextTemplate = functionConnection.nextTemplate;
              // Check if next message is a custom message (prefixed with "custom:")
              if (nextTemplate.startsWith('custom:')) {
                await sendCustomMessageAndTrack(nextTemplate, flow._id.toString(), replacements);
              } else {
                await sendTemplateAndTrack(nextTemplate, flow._id.toString());
              }
            }
          } catch (err: any) {
            console.error(`[Flow] Function execution error:`, err.message);
          }
        } else {
          console.warn(`[Flow] Function "${functionConnection.target}" not found`);
        }

        // Clear tracking after processing
        await Contact.findByIdAndUpdate(contact._id, {
          lastSentTemplate: '',
          lastSentFlowId: null,
        });
        return;
      }
    }
  }

  // For regular messages, check if any flow trigger matches
  console.log(`[Flow Debug] Checking flows for userId: ${userId}, message: "${messageText}"`);

  const matchingFlow = await findMatchingFlow(userId, messageText);

  console.log(`[Flow Debug] Matching flow result:`, matchingFlow ? {
    name: matchingFlow.name,
    firstTemplate: matchingFlow.firstTemplate,
    trigger: matchingFlow.trigger,
  } : 'No matching flow found');

  if (matchingFlow && matchingFlow.firstTemplate) {
    const firstTemplate = matchingFlow.firstTemplate;
    console.log(`[Flow] Message matched flow "${matchingFlow.name}", sending first message: ${firstTemplate}`);

    // Check if first message is a custom message (prefixed with "custom:")
    if (firstTemplate.startsWith('custom:')) {
      await sendCustomMessageAndTrack(firstTemplate, matchingFlow._id.toString());
    } else {
      await sendTemplateAndTrack(firstTemplate, matchingFlow._id.toString());
    }
  }
}

