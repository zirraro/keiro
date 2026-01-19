export type Tab = 'images' | 'drafts';

interface TabNavigationProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  imageCount: number;
  draftCount: number;
}

export default function TabNavigation({ activeTab, onTabChange, imageCount, draftCount }: TabNavigationProps) {
  return (
    <div className="border-b border-neutral-200 mb-6">
      <div className="flex gap-8">
        <button
          onClick={() => onTabChange('images')}
          className={`pb-4 px-2 font-semibold transition-all relative ${
            activeTab === 'images'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Mes images
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
      </div>
    </div>
  );
}
