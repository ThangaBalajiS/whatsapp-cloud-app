# WhatsApp Cloud App

A free, self-hostable dashboard for WhatsApp Cloud API. Receive incoming messages via webhook, view conversations, and send replies—no infrastructure setup required.

## The Problem

When you connect a phone number to WhatsApp Cloud API, you lose access to the regular WhatsApp app for that number. This means you can't see messages people send you unless you:
- Set up your own webhook server
- Pay for an expensive third-party platform

## The Solution

This app gives you:
- **Webhook endpoint** — Add it to your Meta dashboard and start receiving messages instantly
- **Message inbox** — View all incoming messages in a clean dashboard
- **Send messages** — Reply manually or automate responses via flows (coming soon)
- **Free & self-hostable** — No subscriptions, no vendor lock-in

## Features

- Multi-user support with authentication
- Encrypted storage for WhatsApp API tokens
- Real-time message inbox with conversation threads
- Send text replies directly from the dashboard
- Auto-generated webhook verify tokens
- Read receipts and message status tracking

## Prerequisites

- Node.js 18+
- MongoDB running locally or a MongoDB Atlas connection string

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Create a `.env.local` file:
```env
MONGODB_URI=mongodb://localhost:27017/whatsapp-cloud-app
JWT_SECRET_KEY=your-jwt-secret-key-change-this
ENCRYPTION_KEY=your-encryption-key-for-api-tokens
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Setup Guide

1. **Create an account** — Sign up with your email and password
2. **Configure WhatsApp** — Go to Settings and enter your WhatsApp Cloud API credentials:
   - Phone Number ID
   - Business Account ID
   - Access Token (permanent or temporary)
3. **Set up webhook** — Copy the webhook URL and verify token from Settings, then add them to your [Meta Developer Dashboard](https://developers.facebook.com/)
4. **Start messaging** — Once the webhook is verified, incoming messages will appear in your inbox

## Tech Stack

- Next.js 14 (App Router)
- MongoDB with Mongoose
- JWT for sessions
- AES-256-GCM encryption for API tokens
- bcryptjs for password hashing

## License

MIT
