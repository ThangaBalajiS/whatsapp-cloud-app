import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import mongoose from 'mongoose';
import dbConnect from '../../../lib/mongodb';
import Appointment from '../../../models/Appointment';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET_KEY || 'fallback-secret');

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;  // Changed from 'auth-token' to 'session'
  if (!token) return null;
  
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload.id as string;  // Changed from 'userId' to 'id'
  } catch {
    return null;
  }
}

// GET - List appointments with filters
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Include appointments for this user OR appointments without userId (from WhatsApp Flows)
    // Convert userId string to ObjectId for proper comparison
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const query: Record<string, unknown> = {
      $or: [
        { userId: userObjectId },
        { userId: { $exists: false } },
        { userId: null }
      ]
    };

    if (status && status !== 'all') {
      query.status = status;
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        (query.date as Record<string, Date>).$gte = new Date(startDate);
      }
      if (endDate) {
        (query.date as Record<string, Date>).$lte = new Date(endDate);
      }
    }

    const appointments = await Appointment.find(query)
      .sort({ date: 1 })
      .lean();

    return NextResponse.json({ appointments });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Server error';
    return NextResponse.json({ message }, { status: 500 });
  }
}

// IST offset in milliseconds (+05:30 = 5.5 hours)
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Convert a local IST datetime string to UTC Date
// Handles both ISO format and date+time components
function parseIstToUtc(dateString: string): Date {
  // If the date string already has timezone info, parse it directly
  if (dateString.includes('+') || dateString.includes('Z')) {
    // Client sent ISO string with timezone - but since browser is in IST,
    // the ISO string represents the IST time the user selected
    // We need to interpret the local time part as IST
    const localDateTime = dateString.replace(/[TZ]/g, ' ').split('+')[0].trim();
    const [datePart, timePart] = localDateTime.split(' ');
    const time = timePart?.slice(0, 5) || '09:00';
    // Create with explicit IST offset
    return new Date(`${datePart}T${time}:00.000+05:30`);
  }
  
  // Plain ISO-ish string without timezone - treat as IST
  // Format: "2026-01-17T09:30:00" or "2026-01-17T09:30"
  const cleanDate = dateString.includes('T') 
    ? dateString.slice(0, 16) // YYYY-MM-DDTHH:MM
    : dateString;
  
  if (cleanDate.includes('T')) {
    const [datePart, timePart] = cleanDate.split('T');
    return new Date(`${datePart}T${timePart}:00.000+05:30`);
  }
  
  // Just a date - default to 9 AM IST
  return new Date(`${cleanDate}T09:00:00.000+05:30`);
}

// POST - Create appointment manually
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    await dbConnect();
    const body = await request.json();

    const { contactWaId, customerName, customerPhone, date, duration, notes } = body;

    if (!contactWaId || !customerName || !date) {
      return NextResponse.json(
        { message: 'contactWaId, customerName, and date are required' },
        { status: 400 }
      );
    }

    // Parse the date as IST and convert to UTC for storage
    const appointmentDateUtc = parseIstToUtc(date);

    const appointment = await Appointment.create({
      userId,
      contactWaId,
      customerName,
      customerPhone: customerPhone || '',
      date: appointmentDateUtc,
      duration: duration || 30, // 30 Mins default
      notes: notes || '',
      status: 'scheduled',
    });

    return NextResponse.json({ appointment }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Server error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
