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

    const appointment = await Appointment.create({
      userId,
      contactWaId,
      customerName,
      customerPhone: customerPhone || '',
      date: new Date(date),
      duration: duration || 30,
      notes: notes || '',
      status: 'scheduled',
    });

    return NextResponse.json({ appointment }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Server error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
