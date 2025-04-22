'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase';

type UserProfile = {
  display_name: string;
  user_name: string;
} | null;

type Document = {
  id: string;
  file_name: string;
};

type UserDocuments = {
  id: string;
  documents: {
    [key: string]: string[];
  };
};

export default function Library() {
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [userDocuments, setUserDocuments] = useState<UserDocuments | null>(null);
  const [newTag, setNewTag] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);

  useEffect(() => {
    fetchUserProfile();
    fetchDocuments();
  }, []);

  const fetchUserProfile = async () => {
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
  };

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('document_metadata')
        .select('id, file_name')
        .order('file_name');

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  };

  const fetchUserDocuments = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_documents')
        .select('id, documents')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "no rows returned"
      setUserDocuments(data || null);
    } catch (error) {
      console.error('Error fetching user documents:', error);
    }
  };

  const handleCreateTag = async () => {
    if (!newTag.trim() || !userProfile) return;

    try {
      const newDocuments = {
        ...(userDocuments?.documents || {}),
        [newTag]: []
      };

      if (userDocuments) {
        // 既存のレコードを更新
        const { error } = await supabase
          .from('user_documents')
          .update({ documents: newDocuments })
          .eq('id', userDocuments.id);

        if (error) throw error;
      } else {
        // 新しいレコードを作成
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Not authenticated');

        const { error } = await supabase
          .from('user_documents')
          .insert([{
            user_id: session.user.id,
            documents: newDocuments
          }]);

        if (error) throw error;
      }

      // 再取得
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        fetchUserDocuments(session.user.id);
      }

      setNewTag('');
    } catch (error) {
      console.error('Error creating tag:', error);
      alert('タグの作成に失敗しました');
    }
  };

  const handleAddDocuments = async () => {
    if (!selectedTag || !userDocuments || selectedDocuments.length === 0) return;

    try {
      const currentDocs = userDocuments.documents[selectedTag] || [];
      const newDocs = Array.from(new Set([...currentDocs, ...selectedDocuments]));
      const newDocuments = {
        ...userDocuments.documents,
        [selectedTag]: newDocs
      };

      const { error } = await supabase
        .from('user_documents')
        .update({ documents: newDocuments })
        .eq('id', userDocuments.id);

      if (error) throw error;

      // 再取得
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        fetchUserDocuments(session.user.id);
      }

      setSelectedDocuments([]);
    } catch (error) {
      console.error('Error adding documents:', error);
      alert('ドキュメントの追加に失敗しました');
    }
  };

  const handleRemoveDocument = async (tag: string, documentId: string) => {
    if (!userDocuments) return;

    try {
      const newDocs = userDocuments.documents[tag].filter(id => id !== documentId);
      const newDocuments = {
        ...userDocuments.documents,
        [tag]: newDocs
      };

      const { error } = await supabase
        .from('user_documents')
        .update({ documents: newDocuments })
        .eq('id', userDocuments.id);

      if (error) throw error;

      // 再取得
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        fetchUserDocuments(session.user.id);
      }
    } catch (error) {
      console.error('Error removing document:', error);
      alert('ドキュメントの削除に失敗しました');
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
            ライブラリを利用するにはログインが必要です
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
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">ライブラリ</div>
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
          {/* 左側: タグとドキュメントの追加 */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
              <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">新しいタグを作成</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="タグ名を入力..."
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                />
                <button
                  onClick={handleCreateTag}
                  disabled={!newTag.trim()}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  作成
                </button>
              </div>
            </div>

            {userDocuments && Object.keys(userDocuments.documents).length > 0 && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
                <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">ドキュメントを追加</h2>
                <div className="space-y-4">
                  <select
                    value={selectedTag || ''}
                    onChange={(e) => setSelectedTag(e.target.value || null)}
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                  >
                    <option value="">タグを選択...</option>
                    {Object.keys(userDocuments.documents).map((tag) => (
                      <option key={tag} value={tag}>{tag}</option>
                    ))}
                  </select>

                  {selectedTag && (
                    <>
                      <div className="max-h-60 overflow-y-auto space-y-2">
                        {documents.map((doc) => (
                          <label key={doc.id} className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={selectedDocuments.includes(doc.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedDocuments([...selectedDocuments, doc.id]);
                                } else {
                                  setSelectedDocuments(selectedDocuments.filter(id => id !== doc.id));
                                }
                              }}
                              className="rounded border-gray-300 dark:border-gray-600"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">{doc.file_name}</span>
                          </label>
                        ))}
                      </div>

                      <button
                        onClick={handleAddDocuments}
                        disabled={selectedDocuments.length === 0}
                        className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        選択したドキュメントを追加
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 右側: タグとドキュメントの一覧 */}
          <div className="space-y-6">
            {userDocuments && Object.entries(userDocuments.documents).map(([tag, docIds]) => (
              <div key={tag} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
                <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">{tag}</h2>
                <div className="space-y-2">
                  {docIds.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      ドキュメントがありません
                    </p>
                  ) : (
                    docIds.map((docId) => {
                      const doc = documents.find(d => d.id === docId);
                      if (!doc) return null;
                      return (
                        <div
                          key={docId}
                          className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-700 rounded"
                        >
                          <span className="text-sm text-gray-700 dark:text-gray-300">{doc.file_name}</span>
                          <button
                            onClick={() => handleRemoveDocument(tag, docId)}
                            className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ))}

            {(!userDocuments || Object.keys(userDocuments.documents).length === 0) && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
                <p className="text-center text-gray-500 dark:text-gray-400">
                  タグを作成して、ドキュメントを整理しましょう
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
} 