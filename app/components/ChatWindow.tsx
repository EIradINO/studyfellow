import React, { useEffect, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { Components } from 'react-markdown';
import 'katex/dist/katex.min.css';
import Image from 'next/image';

type Room = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type Message = {
  id?: string;
  room_id: string;
  role: 'user' | 'model';
  content: string;
  created_at?: string;
  type?: 'text' | 'image' | 'pdf' | 'context';
  file_url?: string | null;
  file_name?: string | null;
  start_page?: number | null;
  end_page?: number | null;
};

type DocumentMetadata = {
  id: string;
  file_name: string;
};

interface ChatWindowProps {
  currentRoom: Room | null;
  messages: Message[];
  isGenerating: boolean;
  documents: DocumentMetadata[];
  selectedDocument: DocumentMetadata | null;
  setSelectedDocument: (doc: DocumentMetadata | null) => void;
  startPage: string;
  setStartPage: (v: string) => void;
  endPage: string;
  setEndPage: (v: string) => void;
  newMessage: string;
  setNewMessage: (v: string) => void;
  handleSendMessage: () => void;
  file: File | null;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  interactive: boolean;
  setInteractive: (v: boolean) => void;
  internet_search: boolean;
  setInternetSearch: (v: boolean) => void;
}

interface SignedUrlCacheEntry {
  url: string;
  expiresAt: number;
}

interface ImageMessageProps {
  filePath: string;
  altText: string;
  cache: Record<string, SignedUrlCacheEntry>;
  updateCache: (filePath: string, entry: SignedUrlCacheEntry) => void;
}

const ImageMessageDisplay: React.FC<ImageMessageProps> = ({ filePath, altText, cache, updateCache }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAndSetSignedUrl = useCallback(async (forceFetch = false) => {
    const cachedEntry = cache[filePath];
    if (cachedEntry && cachedEntry.expiresAt > Date.now() && !forceFetch) {
      console.log(`[ImageMessageDisplay] Using cached URL for ${filePath}`);
      setImageUrl(cachedEntry.url);
      setError(null);
      return;
    }

    setError(null);
    console.log(`[ImageMessageDisplay] Attempting to create signed URL for path: ${filePath}`);
    try {
      const expiresIn = 60 * 5; // 5分
      const { data, error: signedUrlError } = await supabase
        .storage
        .from('chat-files')
        .createSignedUrl(filePath, expiresIn);

      if (signedUrlError) {
        console.error(`[ImageMessageDisplay] Error creating signed URL for ${filePath}:`, signedUrlError);
        setError(signedUrlError.message);
        setImageUrl(null);
      } else if (data && data.signedUrl) {
        console.log(`[ImageMessageDisplay] Successfully created signed URL for ${filePath}:`, data.signedUrl);
        const newEntry = { url: data.signedUrl, expiresAt: Date.now() + expiresIn * 1000 };
        updateCache(filePath, newEntry);
        setImageUrl(newEntry.url);
      }
    } catch (err: unknown) {
      console.error(`[ImageMessageDisplay] Exception creating signed URL for ${filePath}:`, err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setImageUrl(null);
    }
  }, [filePath, cache, updateCache]);

  useEffect(() => {
    if (filePath) {
      fetchAndSetSignedUrl();
    }
  }, [filePath, fetchAndSetSignedUrl]);

  if (error) {
    return <div className="text-xs text-red-500">画像読み込みエラー: {error} <button onClick={() => fetchAndSetSignedUrl(true)} className="ml-2 px-1 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 rounded">再試行</button></div>;
  }
  
  if (imageUrl) {
    return <Image src={imageUrl} alt={altText || 'image'} width={300} height={300} className="max-w-xs max-h-xs rounded" />;
  }

  // 初期状態、またはエラーでもなくURLもない場合 (画像取得前など)
  return null;
};

const MessageContent: React.FC<{ content: string }> = ({ content }) => {
  const components: Components = {
    code: ({ className, children, ...props }) => {
      const match = /language-(\w+)/.exec(className || '');
      const isInline = !match;
      return !isInline ? (
        <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg my-2">
          <code className={className} {...props}>
            {children}
          </code>
        </div>
      ) : (
        <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded" {...props}>
          {children}
        </code>
      );
    },
    // 段落のスタイリング
    p: ({ children }) => <p className="my-2">{children}</p>,
    // 見出しのスタイリング
    h1: ({ children }) => <h1 className="text-2xl font-bold my-4">{children}</h1>,
    h2: ({ children }) => <h2 className="text-xl font-bold my-3">{children}</h2>,
    h3: ({ children }) => <h3 className="text-lg font-bold my-2">{children}</h3>,
    // リストのスタイリング
    ul: ({ children }) => <ul className="list-disc pl-6 my-2">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-6 my-2">{children}</ol>,
    // リンクのスタイリング
    a: ({ href, children }) => (
      <a href={href} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
  };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
};

const ChatWindow: React.FC<ChatWindowProps> = ({
  currentRoom,
  messages,
  isGenerating,
  documents,
  selectedDocument,
  setSelectedDocument,
  startPage,
  setStartPage,
  endPage,
  setEndPage,
  newMessage,
  setNewMessage,
  handleSendMessage,
  file,
  onFileChange,
  interactive,
  setInteractive,
  internet_search,
  setInternetSearch,
}) => {
  const [signedUrlCache, setSignedUrlCache] = useState<Record<string, SignedUrlCacheEntry>>({});

  const updateCache = useCallback((filePath: string, entry: SignedUrlCacheEntry) => {
    setSignedUrlCache(prevCache => ({ ...prevCache, [filePath]: entry }));
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        console.log('[ChatWindow Effect] Current session user ID:', session.user.id);
        messages.forEach(message => {
          if (message.type === 'image' && message.file_url) {
            const pathParts = message.file_url.split('/');
            if (pathParts.length > 0) {
              const pathUserId = pathParts[0];
              console.log(`[ChatWindow Effect RLS Check] Message ID: ${message.id}, Path User ID: ${pathUserId}, Current User ID: ${session.user.id}, Match: ${pathUserId === session.user.id}`);
            }
          }
        });
      } else {
        console.log('[ChatWindow Effect] No active session.');
      }
    };
    if (messages && messages.length > 0) {
        checkSession();
    }
  }, [messages]);

  if (!currentRoom) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
        チャットを選択するか、新しいチャットを開始してください
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-4">
        {messages.map((message) => {
          const isImageMessage = message.type === 'image' && message.file_url;
          const isPdfMessage = message.type === 'pdf' && message.file_url;
          const isContextMessage = message.type === 'context';
          
          const bubbleClassName = isImageMessage || isPdfMessage
            ? 'max-w-[100%]'
            : isContextMessage
            ? 'max-w-[100%] bg-green-200 text-green-900 rounded-lg px-4 py-2 border border-green-400'
            : `max-w-[100%] rounded-lg px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
              }`;

          return (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={bubbleClassName}>
                {isImageMessage ? (
                  <div className="space-y-2">
                    <ImageMessageDisplay 
                      filePath={message.file_url!}
                      altText={message.content || 'image'} 
                      cache={signedUrlCache} 
                      updateCache={updateCache} 
                    />
                    {message.content && (
                      <div className="mt-2">
                        <MessageContent content={message.content} />
                      </div>
                    )}
                  </div>
                ) : isPdfMessage ? (
                  <div className="space-y-2">
                    <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded">
                      <a href={message.file_url!} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        PDFファイルを開く
                      </a>
                    </div>
                    {message.content && (
                      <div className="mt-2">
                        <MessageContent content={message.content} />
                      </div>
                    )}
                  </div>
                ) : isContextMessage ? (
                  <div>
                    <div className="text-xs font-bold text-green-800 mb-1">
                      {message.file_name && message.start_page != null && message.end_page != null ? (
                        <span>
                          「{message.file_name}」P{message.start_page}〜P{message.end_page} を引用
                        </span>
                      ) : null}
                    </div>
                    <MessageContent content={message.content} />
                  </div>
                ) : (
                  <MessageContent content={message.content} />
                )}
              </div>
            </div>
          );
        })}
        {isGenerating && (
          <div className="flex justify-start">
            <div className="bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-4 py-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="space-y-2 mt-auto p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap gap-1 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
          {documents.map((doc) => (
            <button
              key={doc.id}
              onClick={() => setSelectedDocument(selectedDocument?.id === doc.id ? null : doc)}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                selectedDocument?.id === doc.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800'
              }`}
              disabled={!!file}
            >
              {doc.file_name}
            </button>
          ))}
        </div>
        {selectedDocument && (
          <div className="flex gap-2 items-center bg-gray-50 dark:bg-gray-800 p-2 rounded">
            <span className="text-sm text-gray-600 dark:text-gray-400">ページ範囲（必須）:</span>
            <input
              type="number"
              min="1"
              required
              value={startPage}
              onChange={(e) => {
                const value = e.target.value;
                setStartPage(value);
                if (endPage && parseInt(value) > parseInt(endPage)) {
                  setEndPage(value);
                }
              }}
              placeholder="開始"
              className="w-20 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800"
              disabled={!!file}
            />
            <span>-</span>
            <input
              type="number"
              min="1"
              required
              value={endPage}
              onChange={(e) => {
                const value = e.target.value;
                setEndPage(value);
                if (startPage && parseInt(value) < parseInt(startPage)) {
                  setStartPage(value);
                }
              }}
              placeholder="終了"
              className="w-20 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800"
              disabled={!!file}
            />
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder={selectedDocument 
              ? `${selectedDocument.file_name}について質問...`
              : "メッセージを入力..."}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800"
          />
          <button
            onClick={() => setInteractive(!interactive)}
            className={`px-3 py-2 rounded-lg ${
              interactive 
                ? 'bg-green-600 text-white hover:bg-green-700' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            探究学習
          </button>
          <button
            onClick={() => setInternetSearch(!internet_search)}
            className={`px-3 py-2 rounded-lg ${
              internet_search 
                ? 'bg-blue-600 text-white hover:bg-blue-700' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            検索
          </button>
          <input
            type="file"
            onChange={onFileChange}
            className="hidden"
            id="file-upload"
            disabled={!!selectedDocument}
            accept=".jpg,.jpeg,.png,.gif,.heic,.heif,.webp,.pdf,image/*"
          />
          <label htmlFor="file-upload" className={`bg-gray-200 text-gray-700 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 ${selectedDocument ? 'opacity-50 cursor-not-allowed' : ''}`}>
            ファイル追加
          </label>
          {file && (
            <span className="text-xs text-gray-600 dark:text-gray-300">{file.name}</span>
          )}
          <button
            onClick={handleSendMessage}
            disabled={(!newMessage.trim() && !file) || (file && !newMessage.trim()) || isGenerating}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            送信
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatWindow; 