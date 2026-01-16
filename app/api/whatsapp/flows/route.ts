import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import crypto from 'crypto';
import dbConnect from '../../../../lib/mongodb';
import Appointment from '../../../../models/Appointment';
import WhatsAppAccount from '../../../../models/WhatsAppAccount';
import { sendWhatsAppText } from '../../../../lib/whatsappSender';

/**
 * WhatsApp Flows Endpoint
 * 
 * This endpoint receives data from WhatsApp Flows when:
 * 1. A user interacts with a Flow
 * 2. The Flow needs dynamic data
 * 3. The user completes the Flow
 * 
 * Request format from WhatsApp:
 * - encrypted_flow_data: AES-GCM encrypted payload
 * - encrypted_aes_key: RSA encrypted AES key
 * - initial_vector: IV for AES decryption
 */

// Load private key from environment variable
function getPrivateKey(): string {
  const privateKey = process.env.WHATSAPP_FLOWS_PRIVATE_KEY;
  if (!privateKey) {
    console.error('[Flows] WHATSAPP_FLOWS_PRIVATE_KEY environment variable not set');
    throw new Error('Private key not configured');
  }
  // Replace escaped newlines with actual newlines (for env vars that use \n)
  return privateKey.replace(/\\n/g, '\n');
}

// Decrypt the AES key using RSA-OAEP
function decryptAesKey(encryptedAesKey: string, privateKey: string): Buffer {
  const encryptedBuffer = Buffer.from(encryptedAesKey, 'base64');
  const decrypted = crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    encryptedBuffer
  );
  return decrypted;
}

// Decrypt the flow data using AES-128-GCM
function decryptFlowData(encryptedData: string, aesKey: Buffer, iv: string): { 
  decryptedBody: string; 
  aesKeyForResponse: Buffer;
  ivForResponse: Buffer;
} {
  const encryptedBuffer = Buffer.from(encryptedData, 'base64');
  const ivBuffer = Buffer.from(iv, 'base64');
  
  // WhatsApp uses AES-128-GCM: last 16 bytes are auth tag
  const authTag = encryptedBuffer.slice(-16);
  const ciphertext = encryptedBuffer.slice(0, -16);
  
  const decipher = crypto.createDecipheriv('aes-128-gcm', aesKey, ivBuffer);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(ciphertext, undefined, 'utf8');
  decrypted += decipher.final('utf8');
  
  return { 
    decryptedBody: decrypted, 
    aesKeyForResponse: aesKey,
    ivForResponse: ivBuffer,
  };
}

// Invert all bits of the IV for response encryption (WhatsApp requirement)
function invertIv(iv: Buffer): Buffer {
  const inverted = Buffer.alloc(iv.length);
  for (let i = 0; i < iv.length; i++) {
    inverted[i] = iv[i] ^ 0xFF; // XOR with 0xFF inverts all bits
  }
  return inverted;
}

// Encrypt the response using AES-128-GCM with inverted IV
function encryptResponse(response: object, aesKey: Buffer, originalIv: Buffer): string {
  // Invert the IV as required by WhatsApp Flows
  const invertedIv = invertIv(originalIv);
  
  const cipher = crypto.createCipheriv('aes-128-gcm', aesKey, invertedIv);
  
  const responseStr = JSON.stringify(response);
  let encrypted = cipher.update(responseStr, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  
  const authTag = cipher.getAuthTag();
  
  // WhatsApp expects: ciphertext + authTag (no IV prefix - they reconstruct it)
  const combined = Buffer.concat([encrypted, authTag]);
  
  return combined.toString('base64');
}

// Flow action types from WhatsApp
type FlowAction = 'ping' | 'INIT' | 'data_exchange';

interface FlowRequest {
  version?: string;
  action: FlowAction;
  screen?: string;
  data?: Record<string, unknown>;
  flow_token?: string;
}

interface FlowResponse {
  version?: string;
  screen?: string;
  data?: Record<string, unknown>;
}

// Generate available time slots for a given date, excluding already booked slots
async function getAvailableTimeSlots(
  date: string,
  userId?: mongoose.Types.ObjectId
): Promise<{ id: string; title: string }[]> {
  // Business hours: 9 AM to 5 PM, 30-minute slots
  const allSlots = [];
  for (let hour = 9; hour < 17; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      allSlots.push({
        id: `${date}T${timeStr}`,
        title: `${hour > 12 ? hour - 12 : hour}:${minute.toString().padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`,
        dateTime: new Date(`${date}T${timeStr}:00`),
      });
    }
  }

  // Fetch existing appointments for this date
  const startOfDay = new Date(`${date}T00:00:00`);
  const endOfDay = new Date(`${date}T23:59:59`);

  const query: Record<string, unknown> = {
    date: { $gte: startOfDay, $lte: endOfDay },
    status: { $in: ['scheduled', 'confirmed'] }, // Only active appointments block slots
  };
  
  if (userId) {
    query.userId = userId;
  }

  const bookedAppointments = await Appointment.find(query).lean();

  // Create a set of booked time slots (considering duration)
  const bookedSlots = new Set<string>();
  
  for (const apt of bookedAppointments) {
    const aptDate = new Date(apt.date);
    const duration = apt.duration || 30;
    
    // Block all slots that overlap with this appointment
    for (let i = 0; i < duration; i += 30) {
      const slotTime = new Date(aptDate.getTime() + i * 60 * 1000);
      const slotKey = slotTime.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
      bookedSlots.add(slotKey);
    }
  }

  // Filter out booked slots
  const availableSlots = allSlots.filter((slot) => {
    const slotKey = slot.dateTime.toISOString().slice(0, 16);
    return !bookedSlots.has(slotKey);
  });

  console.log(`[Flows] Date ${date}: ${allSlots.length} total slots, ${bookedSlots.size} booked, ${availableSlots.length} available`);

  return availableSlots.map(({ id, title }) => ({ id, title }));
}

// POST - Handle WhatsApp Flow requests
export async function POST(request: Request) {
  let aesKeyForResponse: Buffer | null = null;
  let ivForResponse: Buffer | null = null;
  
  try {
    const body = await request.json();
    console.log('[Flows] Received request');

    // Check if this is an encrypted request
    let flowRequest: FlowRequest;
    
    if (body.encrypted_flow_data && body.encrypted_aes_key && body.initial_vector) {
      // Decrypt the request
      console.log('[Flows] Decrypting encrypted request...');
      
      try {
        const privateKey = getPrivateKey();
        const aesKey = decryptAesKey(body.encrypted_aes_key, privateKey);
        const { decryptedBody, aesKeyForResponse: key, ivForResponse: iv } = decryptFlowData(
          body.encrypted_flow_data,
          aesKey,
          body.initial_vector
        );
        
        aesKeyForResponse = key;
        ivForResponse = iv;
        flowRequest = JSON.parse(decryptedBody) as FlowRequest;
        console.log('[Flows] Decrypted request:', JSON.stringify(flowRequest, null, 2));
      } catch (decryptError) {
        console.error('[Flows] Decryption failed:', decryptError);
        return NextResponse.json(
          { error: 'Failed to decrypt request' },
          { status: 400 }
        );
      }
    } else {
      // Direct JSON request (for testing)
      flowRequest = body as FlowRequest;
      console.log('[Flows] Direct request:', JSON.stringify(flowRequest, null, 2));
    }

    const { action, screen, data, flow_token } = flowRequest;

    // Build the response based on action
    let responsePayload: FlowResponse;

    switch (action) {
      case 'ping':
        // Health check from WhatsApp
        responsePayload = {
          version: '3.0',
          data: { status: 'active' },
        };
        break;

      case 'INIT':
        // Flow initialization - return first screen data
        responsePayload = {
          version: '3.0',
          screen: 'SELECT_DATE',
          data: {
            min_date: new Date().toISOString().split('T')[0],
            error_message: '',
            has_error: false,
          },
        };
        break;

      case 'data_exchange':
        // Handle screen transitions and form submissions
        const result = await handleDataExchangeInternal(screen, data, flow_token);
        responsePayload = result;
        break;

      default:
        console.log('[Flows] Unknown action:', action);
        responsePayload = {
          version: '3.0',
          data: { error: 'Unknown action' },
        };
    }

    // If we have encryption keys, encrypt the response
    if (aesKeyForResponse && ivForResponse) {
      const encryptedResponse = encryptResponse(responsePayload, aesKeyForResponse, ivForResponse);
      console.log('[Flows] Sending encrypted response');
      return new NextResponse(encryptedResponse, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // Return unencrypted response for testing
    return NextResponse.json(responsePayload);
    
  } catch (error: unknown) {
    console.error('[Flows] Error:', error);
    const message = error instanceof Error ? error.message : 'Server error';
    
    // For encrypted requests, we need to return encrypted error
    if (aesKeyForResponse && ivForResponse) {
      const errorPayload = encryptResponse({ version: '3.0', data: { error: message } }, aesKeyForResponse, ivForResponse);
      return new NextResponse(errorPayload, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Internal handler that returns FlowResponse object (not NextResponse)
async function handleDataExchangeInternal(
  screen: string | undefined,
  data: Record<string, unknown> | undefined,
  flowToken: string | undefined
): Promise<FlowResponse> {
  console.log('[Flows] Data exchange - screen:', screen, 'data:', data);

  switch (screen) {
    case 'SELECT_DATE':
      // User selected a date, provide time slots
      await dbConnect();
      const selectedDate = data?.appointment_date as string;
      const timeSlots = await getAvailableTimeSlots(selectedDate || new Date().toISOString().split('T')[0]);
      
      if (timeSlots.length === 0) {
        return {
          version: '3.0',
          screen: 'SELECT_DATE',
          data: {
            min_date: new Date().toISOString().split('T')[0],
            error_message: 'No available slots for this date. Please select another date.',
            has_error: true,
          },
        };
      }
      
      // Format the date for display
      let formattedSelectedDate = selectedDate;
      if (selectedDate) {
        try {
          const dateObj = new Date(selectedDate + 'T00:00:00');
          formattedSelectedDate = dateObj.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
          });
        } catch (e) {
          formattedSelectedDate = selectedDate;
        }
      }
      
      return {
        version: '3.0',
        screen: 'SELECT_TIME',
        data: {
          selected_date: selectedDate,
          slots_header: `Available slots for ${formattedSelectedDate}`,
          time_slots: timeSlots,
        },
      };

    case 'SELECT_TIME':
      // User selected time - go directly to confirm (skip YOUR_INFO)
      // Parse the flow token to get customer info (format: userId:waId:customerName)
      let customerName = 'Customer';
      let customerPhone = '';
      
      if (flowToken) {
        const parts = flowToken.split(':');
        // parts[0] = userId (or empty), parts[1] = waId/phone, parts[2] = name
        customerPhone = parts[1] || '';
        customerName = parts[2] ? decodeURIComponent(parts[2]) : (customerPhone ? `+${customerPhone}` : 'Customer');
      }
      
      // Get selected values
      const selectedTimeValue = data?.selected_time as string;
      const selectedDateValue = data?.selected_date as string;
      
      // Format the selected date for display
      let displayDate = selectedDateValue;
      if (selectedDateValue) {
        try {
          const dateObj = new Date(selectedDateValue + 'T00:00:00');
          displayDate = dateObj.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
          });
        } catch (e) {
          displayDate = selectedDateValue;
        }
      }
      
      // Format the selected time for display
      let displayTime = selectedTimeValue;
      if (selectedTimeValue && selectedTimeValue.includes('T')) {
        const timePart = selectedTimeValue.split('T')[1];
        const [hours, minutes] = timePart.split(':').map(Number);
        displayTime = `${hours > 12 ? hours - 12 : hours}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
      }
      
      return {
        version: '3.0',
        screen: 'CONFIRM',
        data: {
          selected_date: selectedDateValue,
          selected_time: selectedTimeValue,
          date_line: `📅 Date: ${displayDate}`,
          time_line: `⏰ Time: ${displayTime}`,
          summary: `Appointment on ${displayDate} at ${displayTime}`,
        },
      };

    case 'CONFIRM':
      // User confirmed - save the appointment
      try {
        await dbConnect();

        // Parse the flow token to get userId and contact info
        // Format: userId:waId:customerName (URL encoded)
        let parsedUserId: mongoose.Types.ObjectId | undefined = undefined;
        let parsedWaId = '';
        let parsedName = 'Customer';
        
        if (flowToken) {
          const parts = flowToken.split(':');
          if (parts[0] && mongoose.Types.ObjectId.isValid(parts[0])) {
            parsedUserId = new mongoose.Types.ObjectId(parts[0]);
          }
          parsedWaId = parts[1] || '';
          parsedName = parts[2] ? decodeURIComponent(parts[2]) : (parsedWaId ? `+${parsedWaId}` : 'Customer');
        }

        // Create the appointment - use data from flow_token, not from user input
        const selectedTimeStr = data?.selected_time as string;
        const selectedDateStr = data?.selected_date as string;
        
        // Parse the date properly
        let appointmentDate: Date;
        if (selectedTimeStr && selectedTimeStr.includes('T')) {
          appointmentDate = new Date(selectedTimeStr + ':00');
        } else if (selectedDateStr) {
          appointmentDate = new Date(selectedDateStr);
        } else {
          appointmentDate = new Date();
        }
        
        // Format date and time for confirmation message
        const formattedDate = appointmentDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        const formattedTime = appointmentDate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        
        const appointmentData = {
          userId: parsedUserId,
          contactWaId: parsedWaId || 'unknown',
          customerName: parsedName,
          customerPhone: parsedWaId,
          date: appointmentDate,
          duration: 30,
          status: 'scheduled' as const,
          flowResponseId: flowToken || '',
          notes: '',
        };

        const appointment = await Appointment.create(appointmentData);
        const appointmentId = (appointment as { _id: mongoose.Types.ObjectId })._id;

        console.log('[Flows] Appointment created:', appointmentId, 'for date:', appointmentDate);

        // Send confirmation message via WhatsApp
        if (parsedUserId && parsedWaId) {
          try {
            const account = await WhatsAppAccount.findOne({ userId: parsedUserId });
            if (account) {
              const confirmationMessage = `✅ *Appointment Confirmed!*\n\n` +
                `📅 *Date:* ${formattedDate}\n` +
                `⏰ *Time:* ${formattedTime}\n` +
                `⏱️ *Duration:* 30 minutes\n\n` +
                `Thank you for booking with us, ${parsedName}!\n\n` +
                `📍 *Please share your location* so we can assist you better.\n\n` +
                `We look forward to seeing you!`;

              const result = await sendWhatsAppText({
                phoneNumberId: account.phoneNumberId,
                accessToken: account.accessToken,
                recipientPhone: parsedWaId,
                message: confirmationMessage,
              });

              if (result.success) {
                console.log('[Flows] Confirmation message sent to', parsedWaId);
              } else {
                console.error('[Flows] Failed to send confirmation:', result.error);
              }
            }
          } catch (msgError) {
            console.error('[Flows] Error sending confirmation message:', msgError);
            // Don't fail the flow if message sending fails
          }
        }

        return {
          version: '3.0',
          screen: 'SUCCESS',
          data: {
            appointment_id: appointmentId.toString(),
            confirmation_message: `Your appointment has been booked for ${formattedDate} at ${formattedTime}. We'll send you a reminder!`,
          },
        };
      } catch (error) {
        console.error('[Flows] Error saving appointment:', error);
        return {
          version: '3.0',
          screen: 'SUCCESS',
          data: {
            appointment_id: '',
            confirmation_message: 'There was an issue booking your appointment. Please try again.',
          },
        };
      }

    default:
      // Unknown screen - return to start
      return {
        version: '3.0',
        screen: 'SELECT_DATE',
        data: {
          min_date: new Date().toISOString().split('T')[0],
          error_message: '',
          has_error: false,
        },
      };
  }
}

// GET - Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: 'active',
    message: 'WhatsApp Flows endpoint is running',
    timestamp: new Date().toISOString(),
  });
}
