import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File;
  const userId = formData.get('user_id') as string;

  if (!file || !userId) {
    return NextResponse.json({ error: 'file and user_id are required' }, { status: 400 });
  }

  // service_role_keyはサーバーサイドのみで使う
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const fileExt = file.name.split('.').pop();
  const originalFileName = file.name;
  const fileName = `${crypto.randomUUID()}.${fileExt}`;
  const filePath = `${userId}/${fileName}`;

  const { error: uploadError } = await supabase.storage.from('chat-files').upload(filePath, file);

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // 署名付きURLではなく、ファイルパスと元のファイル名を返す
  return NextResponse.json({ filePath: filePath, fileName: originalFileName });
} 