import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File;
  const userId = formData.get('user_id') as string;

  if (!file || !userId) {
    return NextResponse.json({ error: 'file and user_id are required' }, { status: 400 });
  }

  const fileExt = file.name.split('.').pop();
  const originalFileName = file.name;
  const fileName = `${crypto.randomUUID()}.${fileExt}`;
  const filePath = `${userId}/${fileName}`;

  // 署名付きURLではなく、ファイルパスと元のファイル名を返す
  return NextResponse.json({ filePath: filePath, fileName: originalFileName });
} 