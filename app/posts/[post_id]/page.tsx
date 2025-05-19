"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/utils/supabase";

// 型定義
interface Post {
  id: string;
  user_id: string;
  document_id: string;
  start_page: number;
  end_page: number;
  comment: string;
  created_at: string;
  interactive: boolean;
  internet_search: boolean;
  file_url: string[];
  user: {
    display_name: string;
    user_name: string;
  };
  document: {
    file_name: string;
  };
  duration?: number;
}

interface PostMessageToAI {
  id: string;
  post_id: string;
  content: string;
  role: string;
  created_at: string;
}

export default function PostDetail() {
  const params = useParams();
  const postId = params.post_id as string;
  const [post, setPost] = useState<Post | null>(null);
  const [messages, setMessages] = useState<PostMessageToAI[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      // 投稿本体取得
      const { data: postData, error: postError } = await supabase
        .from("posts")
        .select("*")
        .eq("id", postId)
        .single();
      let userData = null;
      let docData = null;
      if (postData) {
        // ユーザー情報取得
        const { data: u } = await supabase
          .from("users")
          .select("display_name, user_name")
          .eq("user_id", postData.user_id)
          .single();
        userData = u;
        // ドキュメント情報取得
        const { data: d } = await supabase
          .from("document_metadata")
          .select("file_name")
          .eq("id", postData.document_id)
          .single();
        docData = d;
      }
      // メッセージ履歴取得
      const { data: aiMessages, error: aiError } = await supabase
        .from("post_messages_to_ai")
        .select("*")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });
      if (postError) {
        alert("投稿の取得に失敗しました");
      }
      setPost(postData ? {
        ...postData,
        user: userData || { display_name: '不明', user_name: '不明' },
        document: docData || { file_name: '不明' }
      } : null);
      setMessages(aiMessages || []);
      setLoading(false);
    };
    if (postId) fetchData();
  }, [postId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }
  if (!post) {
    return <div className="p-8 text-center text-gray-500">投稿が見つかりません</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <main className="container mx-auto px-6 py-8 max-w-2xl">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">{post.user.display_name}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">@{post.user.user_name}</p>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{new Date(post.created_at).toLocaleString("ja-JP")}</p>
          </div>
          <div className="flex gap-2 mb-2">
            {post.interactive && (
              <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">探究学習モード</span>
            )}
            {post.internet_search && (
              <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded">検索モード</span>
            )}
          </div>
          {Array.isArray(post.file_url) && post.file_url.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {post.file_url.map((url, idx) => (
                <a href={url} target="_blank" rel="noopener noreferrer" key={idx}>
                  <span className="text-xs underline">添付ファイル{idx + 1}</span>
                </a>
              ))}
            </div>
          )}
          <div className="mb-2">
            <p className="text-sm text-blue-600 dark:text-blue-400">{post.document.file_name}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">ページ {post.start_page} - {post.end_page}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {post.duration !== undefined && post.duration !== null
                ? `${Math.floor(post.duration / 60)}時間${post.duration % 60}分`
                : ''}
            </p>
          </div>
          <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{post.comment}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">AIとの対話履歴</h4>
          <div className="space-y-4">
            {/* 投稿コメントを最初に表示 */}
            <div className="flex justify-end">
              <div className="bg-blue-100 dark:bg-blue-900 rounded-lg px-4 py-2 max-w-[80%]">
                <p className="text-sm text-gray-800 dark:text-gray-200">{post.comment}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{new Date(post.created_at).toLocaleString("ja-JP")}</p>
              </div>
            </div>
            {/* AIメッセージ */}
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  message.role === 'user'
                    ? 'bg-blue-100 dark:bg-blue-900'
                    : 'bg-gray-100 dark:bg-gray-700'
                }`}>
                  <p className="text-sm text-gray-800 dark:text-gray-200">{message.content}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{new Date(message.created_at).toLocaleString("ja-JP")}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
} 