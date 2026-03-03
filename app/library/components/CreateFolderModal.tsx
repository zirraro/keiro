import { useState } from 'react';
import { XIcon, FolderIcon } from './Icons';
import { useLanguage } from '@/lib/i18n/context';

const ICON_OPTIONS = ['📁', '🎨', '📸', '💼', '🎯', '⭐', '🔥', '💡', '🚀', '📊', '🎬', '🎭', '💰', '🏆', '🎪', '🌟'];

interface CreateFolderModalProps {
  onClose: () => void;
  onSave: (name: string, icon: string, color: string) => Promise<void>;
}

export default function CreateFolderModal({ onClose, onSave }: CreateFolderModalProps) {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('📁');
  const [selectedColor, setSelectedColor] = useState('#3b82f6');
  const [saving, setSaving] = useState(false);

  const COLOR_OPTIONS = [
    { name: t.library.cfmColorBlue, value: '#3b82f6' },
    { name: t.library.cfmColorPurple, value: '#9333ea' },
    { name: t.library.cfmColorPink, value: '#ec4899' },
    { name: t.library.cfmColorRed, value: '#ef4444' },
    { name: t.library.cfmColorOrange, value: '#f97316' },
    { name: t.library.cfmColorYellow, value: '#eab308' },
    { name: t.library.cfmColorGreen, value: '#22c55e' },
    { name: t.library.cfmColorCyan, value: '#06b6d4' },
  ];

  const handleSave = async () => {
    if (!name.trim()) {
      alert(t.library.cfmAlertEmptyName);
      return;
    }

    setSaving(true);
    try {
      await onSave(name.trim(), selectedIcon, selectedColor);
      onClose();
    } catch (error) {
      console.error('Error creating folder:', error);
      alert(t.library.cfmAlertError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
              <FolderIcon className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-neutral-900">{t.library.cfmTitle}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-neutral-100 transition-colors"
          >
            <XIcon className="w-6 h-6 text-neutral-600" />
          </button>
        </div>

        {/* Contenu */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Preview */}
            <div className="bg-gradient-to-br from-neutral-50 to-neutral-100 rounded-xl p-6 border-2 border-neutral-200">
              <p className="text-sm text-neutral-600 mb-3 font-medium">{t.library.cfmPreview}</p>
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl shadow-md"
                  style={{ backgroundColor: selectedColor }}
                >
                  {selectedIcon}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-neutral-900">
                    {name || t.library.cfmFolderName}
                  </p>
                  <p className="text-sm text-neutral-500">{t.library.cfm0Image}</p>
                </div>
              </div>
            </div>

            {/* Nom */}
            <div>
              <label className="block text-sm font-semibold text-neutral-900 mb-2">
                {t.library.cfmFolderNameRequired}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.library.cfmPlaceholder}
                className="w-full px-4 py-3 rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                maxLength={50}
                autoFocus
              />
              <p className="text-xs text-neutral-500 mt-1">
                {t.library.cfmCharCount.replace('{n}', String(name.length))}
              </p>
            </div>

            {/* Icône */}
            <div>
              <label className="block text-sm font-semibold text-neutral-900 mb-3">
                {t.library.cfmIcon}
              </label>
              <div className="grid grid-cols-8 gap-2">
                {ICON_OPTIONS.map((icon) => (
                  <button
                    key={icon}
                    onClick={() => setSelectedIcon(icon)}
                    className={`aspect-square rounded-lg flex items-center justify-center text-2xl transition-all ${
                      selectedIcon === icon
                        ? 'bg-blue-100 ring-2 ring-blue-500 scale-110'
                        : 'bg-neutral-100 hover:bg-neutral-200'
                    }`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            {/* Couleur */}
            <div>
              <label className="block text-sm font-semibold text-neutral-900 mb-3">
                {t.library.cfmColor}
              </label>
              <div className="grid grid-cols-4 gap-3">
                {COLOR_OPTIONS.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => setSelectedColor(color.value)}
                    className={`relative p-3 rounded-lg border-2 transition-all ${
                      selectedColor === color.value
                        ? 'border-neutral-900 scale-105'
                        : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-full"
                        style={{ backgroundColor: color.value }}
                      />
                      <span className="text-sm font-medium text-neutral-700">
                        {color.name}
                      </span>
                    </div>
                    {selectedColor === color.value && (
                      <div className="absolute top-1 right-1 w-4 h-4 bg-neutral-900 rounded-full flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t p-6 bg-neutral-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-6 py-3 border border-neutral-300 rounded-lg font-medium text-neutral-700 hover:bg-neutral-100 transition-colors disabled:opacity-50"
          >
            {t.library.cfmCancel}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className={`px-6 py-3 rounded-lg font-medium text-white transition-colors flex items-center gap-2 ${
              saving || !name.trim()
                ? 'bg-neutral-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700'
            }`}
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>{t.library.cfmCreating}</span>
              </>
            ) : (
              <>
                <FolderIcon className="w-5 h-5" />
                <span>{t.library.cfmCreate}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
