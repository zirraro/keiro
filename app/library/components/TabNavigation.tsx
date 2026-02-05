export type Tab = 'all-creations' | 'images' | 'videos' | 'drafts' | 'tiktok-drafts' | 'calendar';

interface TabNavigationProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  imageCount: number;
  videoCount: number;
  draftCount: number;
  tiktokDraftCount: number;
  scheduledCount: number;
}

export default function TabNavigation({ activeTab, onTabChange, imageCount, videoCount, draftCount, tiktokDraftCount, scheduledCount }: TabNavigationProps) {
  const totalCount = imageCount + videoCount;

  return (
    <div className="border-b border-neutral-200 mb-6">
      <div className="flex gap-8 overflow-x-auto">
        <button
          onClick={() => onTabChange('all-creations')}
          className={`pb-4 px-2 font-semibold transition-all relative ${
            activeTab === 'all-creations'
              ? 'text-orange-600 border-b-2 border-orange-600'
              : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          🎨 Mes créations
          {totalCount > 0 && (
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${
              activeTab === 'all-creations'
                ? 'bg-orange-100 text-orange-700'
                : 'bg-neutral-100 text-neutral-600'
            }`}>
              {totalCount}
            </span>
          )}
        </button>

        <button
          onClick={() => onTabChange('images')}
          className={`pb-4 px-2 font-semibold transition-all relative ${
            activeTab === 'images'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          📸 Mes images
          {imageCount > 0 && (
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${
              activeTab === 'images'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-neutral-100 text-neutral-600'
            }`}>
              {imageCount}
            </span>
          )}
        </button>

        <button
          onClick={() => onTabChange('videos')}
          className={`pb-4 px-2 font-semibold transition-all relative ${
            activeTab === 'videos'
              ? 'text-pink-600 border-b-2 border-pink-600'
              : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          🎬 Mes vidéos
          {videoCount > 0 && (
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${
              activeTab === 'videos'
                ? 'bg-pink-100 text-pink-700'
                : 'bg-neutral-100 text-neutral-600'
            }`}>
              {videoCount}
            </span>
          )}
        </button>

        <button
          onClick={() => onTabChange('drafts')}
          className={`pb-4 px-2 font-semibold transition-all relative ${
            activeTab === 'drafts'
              ? 'text-purple-600 border-b-2 border-purple-600'
              : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Brouillons Instagram
          {draftCount > 0 && (
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${
              activeTab === 'drafts'
                ? 'bg-purple-100 text-purple-700'
                : 'bg-neutral-100 text-neutral-600'
            }`}>
              {draftCount}
            </span>
          )}
        </button>

        <button
          onClick={() => onTabChange('tiktok-drafts')}
          className={`pb-4 px-2 font-semibold transition-all relative ${
            activeTab === 'tiktok-drafts'
              ? 'text-cyan-600 border-b-2 border-cyan-600'
              : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Brouillons TikTok
          {tiktokDraftCount > 0 && (
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${
              activeTab === 'tiktok-drafts'
                ? 'bg-cyan-100 text-cyan-700'
                : 'bg-neutral-100 text-neutral-600'
            }`}>
              {tiktokDraftCount}
            </span>
          )}
        </button>

        <button
          onClick={() => onTabChange('calendar')}
          className={`pb-4 px-2 font-semibold transition-all relative ${
            activeTab === 'calendar'
              ? 'text-green-600 border-b-2 border-green-600'
              : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          📅 Calendrier
          {scheduledCount > 0 && (
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${
              activeTab === 'calendar'
                ? 'bg-green-100 text-green-700'
                : 'bg-neutral-100 text-neutral-600'
            }`}>
              {scheduledCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
