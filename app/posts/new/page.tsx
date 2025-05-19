'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/utils/supabase';
import Link from 'next/link';

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
  duration?: number;
  interactive: boolean;
  internet_search: boolean;
  file_url: string[];
};

type PostMessageToAI = {
  id: string;
  post_id: string;
  content: string;
  role: string;
  created_at: string;
};

// 画像表示用コンポーネント
const PostImageDisplay: React.FC<{ filePath: string; altText: string }> = ({ filePath, altText }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSignedUrl = useCallback(async () => {
    setError(null);
    try {
      const expiresIn = 60 * 5;
      const { data, error: signedUrlError } = await supabase
        .storage
        .from('chat-files')
        .createSignedUrl(filePath, expiresIn);
      if (signedUrlError) {
        setError(signedUrlError.message);
        setImageUrl(null);
      } else if (data && data.signedUrl) {
        setImageUrl(data.signedUrl);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setImageUrl(null);
    }
  }, [filePath]);

  useEffect(() => {
    if (filePath) {
      fetchSignedUrl();
    }
  }, [filePath, fetchSignedUrl]);

  if (error) {
    return <div className="text-xs text-red-500">画像読み込みエラー: {error} <button onClick={fetchSignedUrl} className="ml-2 px-1 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 rounded">再試行</button></div>;
  }
  if (imageUrl) {
    return <img src={imageUrl} alt={altText || 'image'} className="w-20 h-20 object-cover rounded border" />;
  }
  return null;
};

export default function Post() {
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<string>('');
  const [startPage, setStartPage] = useState<string>('');
  const [endPage, setEndPage] = useState<string>('');
  const [comment, setComment] = useState('');
  const [durationHour, setDurationHour] = useState('');
  const [durationMinute, setDurationMinute] = useState('');
  const [interactive, setInteractive] = useState(false);
  const [internetSearch, setInternetSearch] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [fileUrls, setFileUrls] = useState<string[]>([]);

  const fetchUserDocuments = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_documents')
        .select('document_id')
        .eq('user_id', userId);

      if (error) throw error;
      
      if (data && data.length > 0) {
        const documentIds = data.map(ud => ud.document_id);
        fetchDocuments(documentIds);
      } else {
        setDocuments([]);
      }
    } catch (error) {
      console.error('Error fetching user documents:', error);
    }
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        if (session?.user) {
          fetchUserDocuments(session.user.id);
        } else {
          // ユーザーがログインしていない場合の処理（必要に応じて）
          setDocuments([]); // 例: ドキュメントリストを空にする
        }
        fetchPosts();
      } catch (error) {
        console.error('Error in useEffect:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [fetchUserDocuments]);

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
          ),
          duration,
          interactive,
          internet_search,
          file_url
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
          })),
          duration: post.duration,
          interactive: post.interactive,
          internet_search: post.internet_search,
          file_url: post.file_url || []
        };
      }));

      setPosts(enhancedPosts);
    } catch (error) {
      console.error('Error fetching posts:', error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleCreatePost = async () => {
    if (!selectedDocument || !startPage || !endPage || !comment.trim()) {
      alert('すべての項目を入力してください');
      return;
    }

    // durationの計算
    const duration =
      (parseInt(durationHour || '0', 10) * 60) +
      (parseInt(durationMinute || '0', 10));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Not authenticated');
      // 1. ファイルアップロード
      let uploadedUrls: string[] = [];
      if (files.length > 0) {
        for (const file of files) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('user_id', session.user.id);
          const res = await fetch('/api/upload', { method: 'POST', body: formData });
          const result = await res.json();
          if (res.status !== 200 || !result.filePath) {
            throw new Error('アップロード失敗: ' + (result.error || 'Unknown error'));
          }
          uploadedUrls.push(result.filePath);
        }
      }
      // 2. 投稿作成
      const { data: post, error: postError } = await supabase
        .from('posts')
        .insert([{
          user_id: session.user.id,
          document_id: selectedDocument,
          start_page: parseInt(startPage),
          end_page: parseInt(endPage),
          comment: comment.trim(),
          duration: duration,
          file_url: uploadedUrls, // text[]
          interactive: interactive,
          internet_search: internetSearch
        }])
        .select()
        .single();
      if (postError) throw postError;
      setSelectedDocument('');
      setStartPage('');
      setEndPage('');
      setComment('');
      setDurationHour('');
      setDurationMinute('');
      setFiles([]);
      setFileUrls([]);
      setInteractive(false);
      setInternetSearch(false);
      // 3. AIの返信を生成
      const response = await fetch('/api/generate-response', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'post',
          post_id: post.id,
          interactive: interactive,
          internet_search: internetSearch
        })
      });
      if (!response.ok) {
        throw new Error('AIの返信生成に失敗しました');
      }
      fetchPosts();
    } catch (error) {
      console.error('Error creating post:', error);
      alert(`投稿の作成に失敗しました${error}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
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

                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        時間
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={durationHour}
                        onChange={(e) => setDurationHour(e.target.value)}
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                        placeholder="0"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        分
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={durationMinute}
                        onChange={(e) => setDurationMinute(e.target.value)}
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={interactive} onChange={e => setInteractive(e.target.checked)} />
                      <span>探究学習モード</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={internetSearch} onChange={e => setInternetSearch(e.target.checked)} />
                      <span>検索モード</span>
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      写真・PDFを添付（複数可）
                    </label>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      multiple
                      onChange={handleFileChange}
                      className="w-full"
                    />
                    {files.length > 0 && (
                      <ul className="mt-2 text-xs text-gray-600 dark:text-gray-300">
                        {files.map((file, idx) => (
                          <li key={idx}>{file.name}</li>
                        ))}
                      </ul>
                    )}
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
              <Link href={`/posts/${post.id}`} key={post.id} className="block">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm hover:bg-blue-50 dark:hover:bg-gray-700 transition cursor-pointer">
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
                      {post.file_url.map((url: string, idx: number) => {
                        if (url.match(/\.(png|jpe?g|webp|gif|heic|heif)$/i)) {
                          return (
                            <PostImageDisplay filePath={url} altText={`添付画像${idx + 1}`} key={idx} />
                          );
                        } else if (url.match(/\.pdf$/i)) {
                          return (
                            <a href={url} target="_blank" rel="noopener noreferrer" key={idx} className="flex items-center gap-1 px-2 py-1 border rounded text-xs bg-gray-100 dark:bg-gray-700">
                              <span className="material-icons text-red-500">picture_as_pdf</span>
                              PDF{idx + 1}
                            </a>
                          );
                        } else {
                          return (
                            <a href={url} target="_blank" rel="noopener noreferrer" key={idx} className="text-xs underline">ファイル{idx + 1}</a>
                          );
                        }
                      })}
                    </div>
                  )}
                  <div className="mb-4">
                    <p className="text-sm text-blue-600 dark:text-blue-400">
                      {post.document.file_name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      ページ {post.start_page} - {post.end_page}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {post.duration !== undefined && post.duration !== null
                        ? `${Math.floor(post.duration / 60)}時間${post.duration % 60}分`
                        : ''}
                    </p>
                  </div>
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {post.comment}
                  </p>
                </div>
              </Link>
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