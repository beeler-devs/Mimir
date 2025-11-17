import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

interface ScheduleTaskRequest {
  task: {
    id: string;
    title: string;
    description?: string;
    estimatedDurationMinutes?: number;
    dueDate?: string;
    priority: string;
    taskCategory?: string;
  };
  preferences: {
    workHoursStart: string;
    workHoursEnd: string;
    workDays: number[];
    preferredSessionDurationMinutes: number;
    minSessionDurationMinutes: number;
    maxSessionDurationMinutes: number;
    breakDurationMinutes: number;
    preferMorning: boolean;
    preferAfternoon: boolean;
    preferEvening: boolean;
    timezone: string;
  };
  existingBlocks: Array<{
    id: string;
    startTime: string;
    endTime: string;
  }>;
  availabilityHints?: {
    preferredDates?: string[];
    blockedTimes?: Array<{ start: string; end: string }>;
  };
}

export async function POST(req: NextRequest) {
  try {
    // Get authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Create Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    // Verify user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requestData: ScheduleTaskRequest = await req.json();
    const { task, preferences, existingBlocks, availabilityHints } = requestData;

    // Use Claude API to intelligently schedule the task
    const claudeApiKey = process.env.CLAUDE_API_KEY;
    if (!claudeApiKey) {
      return NextResponse.json(
        { error: 'AI scheduling not configured' },
        { status: 500 }
      );
    }

    // Prepare the scheduling context
    const systemPrompt = `You are an AI scheduling assistant. Your job is to find the optimal time slots for a user's task.

Consider:
1. User's work hours and preferences
2. Existing scheduled blocks (avoid conflicts)
3. Task priority and due date
4. Preferred session duration and break times
5. User's time-of-day preferences (morning/afternoon/evening)
6. Split large tasks into multiple sessions if needed

Return a JSON array of scheduled blocks with:
- startTime (ISO 8601 format)
- endTime (ISO 8601 format)
- sessionNotes (brief note about why this time was chosen)

Rules:
- Never schedule outside work hours
- Never overlap with existing blocks
- Respect minimum and maximum session durations
- Add breaks between sessions
- Prioritize urgent tasks and those with close due dates
- Split tasks longer than max session duration
- Schedule earlier for high-priority tasks`;

    const userPrompt = `Schedule this task:

Title: ${task.title}
Description: ${task.description || 'No description'}
Estimated Duration: ${task.estimatedDurationMinutes || 'Not specified'} minutes
Due Date: ${task.dueDate || 'No due date'}
Priority: ${task.priority}
Category: ${task.taskCategory || 'General'}

User Preferences:
- Work Hours: ${preferences.workHoursStart} to ${preferences.workHoursEnd}
- Work Days: ${preferences.workDays.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}
- Preferred Session Duration: ${preferences.preferredSessionDurationMinutes} minutes
- Min/Max Session Duration: ${preferences.minSessionDurationMinutes}-${preferences.maxSessionDurationMinutes} minutes
- Break Duration: ${preferences.breakDurationMinutes} minutes
- Time Preferences: ${preferences.preferMorning ? 'Morning ' : ''}${preferences.preferAfternoon ? 'Afternoon ' : ''}${preferences.preferEvening ? 'Evening' : ''}
- Timezone: ${preferences.timezone}

${existingBlocks.length > 0 ? `Existing Scheduled Blocks (avoid conflicts):
${existingBlocks.map(b => `- ${b.startTime} to ${b.endTime}`).join('\n')}` : 'No existing blocks'}

${availabilityHints?.preferredDates ? `Preferred Dates: ${availabilityHints.preferredDates.join(', ')}` : ''}
${availabilityHints?.blockedTimes ? `Blocked Times:
${availabilityHints.blockedTimes.map(b => `- ${b.start} to ${b.end}`).join('\n')}` : ''}

Return ONLY a JSON array of scheduled blocks. Example format:
[
  {
    "startTime": "2025-11-18T09:00:00.000Z",
    "endTime": "2025-11-18T10:00:00.000Z",
    "sessionNotes": "Morning session, high focus time"
  }
]`;

    // Call Claude API
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      const error = await claudeResponse.text();
      console.error('Claude API error:', error);
      return NextResponse.json(
        { error: 'Failed to schedule task with AI' },
        { status: 500 }
      );
    }

    const claudeData = await claudeResponse.json();
    const responseText = claudeData.content[0].text;

    // Parse the JSON response from Claude
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('Invalid Claude response:', responseText);
      return NextResponse.json(
        { error: 'Invalid AI response format' },
        { status: 500 }
      );
    }

    const suggestedBlocks = JSON.parse(jsonMatch[0]);

    // Convert to full scheduled blocks
    const scheduledBlocks = suggestedBlocks.map((block: any) => ({
      taskId: task.id,
      startTime: block.startTime,
      endTime: block.endTime,
      durationMinutes: Math.round(
        (new Date(block.endTime).getTime() - new Date(block.startTime).getTime()) / 60000
      ),
      isAutoScheduled: true,
      sessionNotes: block.sessionNotes,
    }));

    // Insert into database
    const { data: insertedBlocks, error: insertError } = await supabase
      .from('scheduled_blocks')
      .insert(
        scheduledBlocks.map((block: any) => ({
          user_id: user.id,
          task_id: block.taskId,
          start_time: block.startTime,
          end_time: block.endTime,
          duration_minutes: block.durationMinutes,
          is_auto_scheduled: block.isAutoScheduled,
          session_notes: block.sessionNotes,
          is_completed: false,
        }))
      )
      .select();

    if (insertError) {
      console.error('Database insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to save scheduled blocks' },
        { status: 500 }
      );
    }

    // Convert database results back to camelCase
    const formattedBlocks = (insertedBlocks || []).map((block: any) => ({
      id: block.id,
      taskId: block.task_id,
      startTime: block.start_time,
      endTime: block.end_time,
      durationMinutes: block.duration_minutes,
      isAutoScheduled: block.is_auto_scheduled,
      sessionNotes: block.session_notes,
      isCompleted: block.is_completed,
      userId: block.user_id,
      createdAt: block.created_at,
      updatedAt: block.updated_at,
    }));

    return NextResponse.json({
      success: true,
      scheduledBlocks: formattedBlocks,
      reasoning: `Scheduled ${formattedBlocks.length} session(s) for this task`,
    });
  } catch (error) {
    console.error('Error scheduling task:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
