import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    MANIM_WORKER_URL: process.env.MANIM_WORKER_URL || 'NOT SET',
    NODE_ENV: process.env.NODE_ENV,
  });
}

