'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error:', error);
          router.push(`/error?message=${encodeURIComponent('認証に失敗しました。もう一度お試しください。')}`);
          return;
        }

        if (!session) {
          router.push(`/error?message=${encodeURIComponent('セッションの取得に失敗しました。')}`);
          return;
        }

        // プロフィール機能削除のため、すべてのユーザーをホームページに遷移
        router.push('/');
      } catch (error) {
        console.error('Error:', error);
        router.push(`/error?message=${encodeURIComponent('予期せぬエラーが発生しました。')}`);
      }
    };

    handleAuthCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">認証中...</p>
      </div>
    </div>
  );
} 