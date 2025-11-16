import { NextResponse } from 'next/server';

/**
 * Helper route to provide migration instructions
 * Visit http://localhost:3000/api/apply-pdf-migration to get instructions
 */
export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const projectRef = supabaseUrl ? new URL(supabaseUrl).hostname.split('.')[0] : 'your-project';
  
  const migrationSQL = `ALTER TABLE instances DROP CONSTRAINT IF EXISTS instances_type_check;

ALTER TABLE instances
  ADD CONSTRAINT instances_type_check
  CHECK (type IN ('text', 'code', 'annotate', 'pdf'));`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Apply PDF Migration</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      line-height: 1.6;
    }
    h1 { color: #10b981; }
    .error { 
      background: #fee; 
      border-left: 4px solid #f00; 
      padding: 15px;
      margin: 20px 0;
    }
    .sql-box {
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 20px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 20px 0;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 14px;
    }
    .button {
      display: inline-block;
      background: #10b981;
      color: white;
      padding: 12px 24px;
      border-radius: 6px;
      text-decoration: none;
      font-weight: 600;
      margin: 10px 0;
    }
    .button:hover {
      background: #059669;
    }
    .step {
      background: #f3f4f6;
      padding: 15px;
      margin: 10px 0;
      border-radius: 6px;
    }
    code {
      background: #f3f4f6;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <h1>🔧 Apply PDF Instance Migration</h1>
  
  <div class="error">
    <strong>⚠️ Migration Required</strong>
    <p>Your database doesn't allow PDF instances yet. Follow the steps below to fix this.</p>
    <p><strong>Error:</strong> new row for relation "instances" violates check constraint "instances_type_check"</p>
  </div>

  <h2>Quick Fix (2 minutes)</h2>
  
  <div class="step">
    <strong>Step 1:</strong> Click this button to open your Supabase SQL Editor
    <br><br>
    <a href="https://supabase.com/dashboard/project/${projectRef}/sql/new" target="_blank" class="button">
      Open SQL Editor →
    </a>
  </div>

  <div class="step">
    <strong>Step 2:</strong> Copy this SQL (click to select all):
    <div class="sql-box" onclick="this.querySelector('pre').select(); document.execCommand('copy');" style="cursor: pointer;">
      <pre contenteditable="true" style="margin: 0;">${migrationSQL}</pre>
    </div>
  </div>

  <div class="step">
    <strong>Step 3:</strong> Paste the SQL into the editor and click <strong>RUN</strong> (or press Cmd/Ctrl + Enter)
  </div>

  <div class="step">
    <strong>Step 4:</strong> You should see: <code>Success. No rows returned</code>
  </div>

  <div class="step">
    <strong>Step 5:</strong> Return to your app and try creating a PDF instance again ✅
  </div>

  <h3>What This Does</h3>
  <p>This SQL updates your database to allow 'pdf' as a valid instance type, alongside 'text', 'code', and 'annotate'.</p>

  <hr style="margin: 40px 0;">
  
  <h3>Alternative: Manual Copy-Paste</h3>
  <p>If the button doesn't work, go to <a href="https://supabase.com/dashboard" target="_blank">supabase.com/dashboard</a>, select your project, open SQL Editor, and run the SQL above.</p>
</body>
</html>
  `;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html',
    },
  });
}

