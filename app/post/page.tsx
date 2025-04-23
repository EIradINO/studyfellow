'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/utils/supabase';
import Link from 'next/link';

type UserProfile = {
  display_name: string;
  user_name: string;
} | null;

type Document = {
  id: string;
  file_name: string;
};

type Post = {
  id: string;
  user_id: string;
  document_id: string;
  start_page: number;
  end_page: number;
  comment: string;
  created_at: string;
  user: {
    display_name: string;
    user_name: string;
  };
  document: {
    file_name: string;
  };
  messages?: PostMessageToAI[];
};

type PostMessageToAI = {
  id: string;
  post_id: string;
  content: string;
  role: string;
  created_at: string;
};

export default function Post() {
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<string>('');
  const [startPage, setStartPage] = useState<string>('');
  const [endPage, setEndPage] = useState<string>('');
  const [comment, setComment] = useState('');

  const fetchUserDocuments = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_documents')
        .select('id, documents')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      // 利用可能なドキュメントIDを収集
      if (data) {
        const documentIds = new Set<string>();
        Object.values(data.documents as Record<string, string[]>).forEach(ids => {
          ids.forEach(id => documentIds.add(id));
        });
        fetchDocuments(Array.from(documentIds));
      }
    } catch (error) {
      console.error('Error fetching user documents:', error);
    }
  }, []);

  const fetchUserProfile = useCallback(async () => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      if (session?.user) {
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('display_name, user_name')
          .eq('user_id', session.user.id)
          .single();

        if (profileError) throw profileError;
        setUserProfile(profile);
        fetchUserDocuments(session.user.id);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }, [fetchUserDocuments]);

  useEffect(() => {
    fetchUserProfile();
    fetchPosts();
  }, [fetchUserProfile]);

  const fetchDocuments = async (documentIds: string[]) => {
    if (documentIds.length === 0) {
      setDocuments([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('document_metadata')
        .select('id, file_name')
        .in('id', documentIds)
        .order('file_name');

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  };

  const fetchPosts = async () => {
    try {
      // 基本的なクエリでpostsを取得
      const { data, error } = await supabase
        .from('posts')
        .select(`
          id,
          user_id,
          document_id,
          start_page,
          end_page,
          comment,
          created_at,
          post_messages_to_ai (
            id,
            content,
            role,
            created_at
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // 各投稿に対してユーザー情報とドキュメント情報を取得
      const enhancedPosts = await Promise.all((data || []).map(async (post) => {
        // ユーザー情報を取得
        const { data: userData } = await supabase
          .from('users')
          .select('display_name, user_name')
          .eq('user_id', post.user_id)
          .single();

        // ドキュメント情報を取得
        const { data: docData } = await supabase
          .from('document_metadata')
          .select('file_name')
          .eq('id', post.document_id)
          .single();

        return {
          ...post,
          user: userData || { display_name: '不明', user_name: '不明' },
          document: docData || { file_name: '不明' },
          messages: (post.post_messages_to_ai || []).map(msg => ({
            id: msg.id,
            post_id: post.id,
            content: msg.content,
            role: msg.role,
            created_at: msg.created_at
          }))
        };
      }));

      setPosts(enhancedPosts);
    } catch (error) {
      console.error('Error fetching posts:', error);
    }
  };

  const handleCreatePost = async () => {
    if (!selectedDocument || !startPage || !endPage || !comment.trim()) {
      alert('すべての項目を入力してください');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Not authenticated');

      // 投稿を作成
      const { data: post, error: postError } = await supabase
        .from('posts')
        .insert([{
          user_id: session.user.id,
          document_id: selectedDocument,
          start_page: parseInt(startPage),
          end_page: parseInt(endPage),
          comment: comment.trim()
        }])
        .select()
        .single();
      // 投稿を再取得
      fetchPosts();
      if (postError) throw postError;
      setSelectedDocument('');
      setStartPage('');
      setEndPage('');
      setComment('');

      // AIの返信を生成
      const { error: responseError } = await supabase.functions.invoke('generate-post-response', {
        body: { post }
      });

      if (responseError) throw responseError;

      fetchPosts();
    } catch (error) {
      console.error('Error creating post:', error);
      alert('投稿の作成に失敗しました');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            投稿を作成するにはログインが必要です
          </p>
          <button
            onClick={() => supabase.auth.signInWithOAuth({
              provider: 'google',
              options: {
                redirectTo: `${window.location.origin}/auth/callback`,
              },
            })}
            className="bg-blue-600 text-white px-4 py-2 rounded-full hover:bg-blue-700"
          >
            Googleでログイン
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <nav className="flex justify-between items-center">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">投稿</div>
            <div className="flex items-center gap-4">
              <div className="text-sm">
                <p className="font-medium text-gray-900 dark:text-white">{userProfile.display_name}</p>
                <p className="text-gray-500 dark:text-gray-400">@{userProfile.user_name}</p>
              </div>
            </div>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* 左側: 投稿フォーム */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
              <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">新しい投稿を作成</h2>
              {documents.length > 0 ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      ドキュメント
                    </label>
                    <select
                      value={selectedDocument}
                      onChange={(e) => setSelectedDocument(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                    >
                      <option value="">ドキュメントを選択...</option>
                      {documents.map((doc) => (
                        <option key={doc.id} value={doc.id}>{doc.file_name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        開始ページ
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={startPage}
                        onChange={(e) => {
                          const value = e.target.value;
                          setStartPage(value);
                          if (endPage && parseInt(value) > parseInt(endPage)) {
                            setEndPage(value);
                          }
                        }}
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        終了ページ
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={endPage}
                        onChange={(e) => {
                          const value = e.target.value;
                          setEndPage(value);
                          if (startPage && parseInt(value) < parseInt(startPage)) {
                            setStartPage(value);
                          }
                        }}
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      コメント
                    </label>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={4}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                      placeholder="コメントを入力..."
                    />
                  </div>

                  <button
                    onClick={handleCreatePost}
                    disabled={!selectedDocument || !startPage || !endPage || !comment.trim()}
                    className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    投稿する
                  </button>
                </div>
              ) : (
                <div className="text-center text-gray-500 dark:text-gray-400">
                  <p className="mb-4">ライブラリにドキュメントが登録されていません</p>
                  <Link
                    href="/library"
                    className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    ライブラリでドキュメントを登録する
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* 右側: 投稿一覧 */}
          <div className="space-y-6">
            {posts.map((post) => (
              <div key={post.id} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">
                      {post.user.display_name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      @{post.user.user_name}
                    </p>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {new Date(post.created_at).toLocaleString('ja-JP')}
                  </p>
                </div>
                <div className="mb-4">
                  <p className="text-sm text-blue-600 dark:text-blue-400">
                    {post.document.file_name}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    ページ {post.start_page} - {post.end_page}
                  </p>
                </div>
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {post.comment}
                </p>
                {post.messages && post.messages.length > 0 && (
                  <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">AIとの対話</h4>
                    <div className="space-y-2">
                      {post.messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex ${
                            message.role === 'user' ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg px-4 py-2 ${
                              message.role === 'user'
                                ? 'bg-blue-100 dark:bg-blue-900'
                                : 'bg-gray-100 dark:bg-gray-700'
                            }`}
                          >
                            <p className="text-sm text-gray-800 dark:text-gray-200">
                              {message.content}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {new Date(message.created_at).toLocaleString('ja-JP')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {posts.length === 0 && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
                <p className="text-center text-gray-500 dark:text-gray-400">
                  投稿がありません
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
} 