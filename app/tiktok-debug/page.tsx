'use client';

import { useEffect, useState } from 'react';

export default function TikTokDebugPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDebugInfo();
  }, []);

  const loadDebugInfo = async () => {
    try {
      const response = await fetch('/api/tiktok/debug');
      const result = await response.json();

      if (result.ok) {
        setData(result);
      } else {
        setError(result.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">TikTok Debug Info</h1>
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-50 p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">TikTok Debug Info</h1>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-red-800 font-semibold mb-2">Error</h2>
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const debug = data?.debug || {};
  const instructions = data?.instructions || {};

  return (
    <div className="min-h-screen bg-neutral-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">🔍 TikTok Debug Info</h1>

        {/* Connection Status */}
        <div className="bg-white rounded-lg p-6 shadow-sm mb-6">
          <h2 className="text-xl font-semibold mb-4">Connection Status</h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="font-medium">Connected:</span>
              <span className={debug.connected ? 'text-green-600' : 'text-red-600'}>
                {debug.connected ? '✅ Yes' : '❌ No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Username:</span>
              <span className="font-mono">{debug.username || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Display Name:</span>
              <span>{debug.displayName || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Open ID:</span>
              <span className="font-mono text-sm bg-neutral-100 px-2 py-1 rounded">
                {debug.open_id || 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Token Expired:</span>
              <span className={debug.tokenExpired ? 'text-red-600' : 'text-green-600'}>
                {debug.tokenExpired ? '❌ Yes' : '✅ No'}
              </span>
            </div>
          </div>
        </div>

        {/* Video List API Test */}
        {debug.videoListTest && (
          <div className="bg-white rounded-lg p-6 shadow-sm mb-6">
            <h2 className="text-xl font-semibold mb-4">Video List API Test</h2>
            {debug.videoListTest.success ? (
              <div>
                <p className="text-green-600 font-medium mb-2">
                  ✅ Successfully fetched {debug.videoListTest.videoCount} video(s)
                </p>
                {debug.videoListTest.videos.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <h3 className="font-semibold text-sm">Videos:</h3>
                    {debug.videoListTest.videos.map((video: any) => (
                      <div key={video.id} className="bg-neutral-50 p-3 rounded">
                        <p className="font-mono text-xs text-neutral-500">ID: {video.id}</p>
                        <p className="text-sm">{video.title || 'No title'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <p className="text-red-600 font-medium mb-2">❌ API call failed</p>
                <p className="text-sm bg-red-50 p-3 rounded text-red-700">
                  {debug.videoListTest.error}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Database Posts */}
        <div className="bg-white rounded-lg p-6 shadow-sm mb-6">
          <h2 className="text-xl font-semibold mb-4">Database Posts</h2>
          <p className="mb-4">
            <span className="font-medium">Count:</span> {debug.databasePosts?.count || 0} post(s)
          </p>
          {debug.databasePosts?.posts && debug.databasePosts.posts.length > 0 ? (
            <div className="space-y-2">
              {debug.databasePosts.posts.map((post: any) => (
                <div key={post.id} className="bg-neutral-50 p-3 rounded">
                  <p className="font-mono text-xs text-neutral-500">ID: {post.id}</p>
                  <p className="text-sm">{post.video_description || 'No description'}</p>
                  <p className="text-xs text-neutral-500">Posted: {new Date(post.posted_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-neutral-500 italic">No posts in database</p>
          )}
        </div>

        {/* Target Users Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-blue-900">
            📋 How to Configure Target Users
          </h2>
          <div className="space-y-3">
            {instructions.targetUsers && Object.entries(instructions.targetUsers).map(([key, value]: any) => {
              if (key === 'note') {
                return (
                  <div key={key} className="bg-yellow-50 border border-yellow-200 rounded p-3 mt-4">
                    <p className="text-sm text-yellow-800 font-medium">{value}</p>
                  </div>
                );
              }
              if (key.startsWith('step')) {
                return (
                  <div key={key} className="flex gap-3">
                    <span className="font-bold text-blue-600 min-w-[4rem]">{key.replace('step', 'Step ')}:</span>
                    <span className="text-neutral-700">{value}</span>
                  </div>
                );
              }
              return null;
            })}
          </div>
        </div>

        {/* Sandbox Reminders */}
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4 text-purple-900">
            ⚠️ Sandbox Mode Reminders
          </h2>
          <ul className="space-y-2">
            {instructions.sandbox && Object.entries(instructions.sandbox).map(([key, value]: any) => (
              <li key={key} className="flex gap-2">
                <span className="text-purple-600">•</span>
                <span className="text-neutral-700">{value}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Refresh Button */}
        <div className="mt-8 text-center">
          <button
            onClick={() => {
              setLoading(true);
              loadDebugInfo();
            }}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            🔄 Refresh Debug Info
          </button>
        </div>
      </div>
    </div>
  );
}
