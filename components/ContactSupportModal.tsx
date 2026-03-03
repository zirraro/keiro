'use client';

import { useState } from 'react';
import { useLanguage } from '@/lib/i18n/context';

interface ContactSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorContext?: string;
  technicalDetails?: string;
  defaultSubject?: string;
}

export default function ContactSupportModal({
  isOpen,
  onClose,
  errorContext,
  technicalDetails,
  defaultSubject
}: ContactSupportModalProps) {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState(defaultSubject || (errorContext ? `${t.common.supportErrorPrefix} ${errorContext}` : ''));
  const [message, setMessage] = useState(technicalDetails || '');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);

    try {
      const response = await fetch('/api/support/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          email,
          subject,
          message,
          technicalDetails: technicalDetails || undefined
        })
      });

      const data = await response.json();

      if (data.ok) {
        setSent(true);
        setTimeout(() => {
          onClose();
          setName('');
          setEmail('');
          setSubject('');
          setMessage('');
          setSent(false);
          // Redirect to support tab to show the message
          window.location.href = '/mon-compte?section=support';
        }, 2000);
      } else {
        throw new Error(data.error || t.common.supportErrorDefault);
      }
    } catch (error: any) {
      console.error('[ContactSupportModal] Error sending message:', error);
      alert(`${t.common.supportErrorSending} ${error.message}`);
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  if (sent) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl max-w-md w-full shadow-2xl p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-neutral-900 mb-2">{t.common.supportSent}</h3>
          <p className="text-neutral-600">{t.common.supportSentSub}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6 text-white rounded-t-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">{t.common.supportTitle}</h2>
              <p className="text-sm text-purple-100">{t.common.supportReplyTime}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              {t.common.supportName} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder={t.common.supportNamePlaceholder}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              {t.common.supportEmail} <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="votre@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              {t.common.supportSubject} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder={t.common.supportSubjectPlaceholder}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              {t.common.supportMessage} <span className="text-red-500">*</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows={6}
              className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              placeholder={t.common.supportMessagePlaceholder}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-neutral-300 text-neutral-700 font-medium hover:bg-neutral-50 transition-colors"
            >
              {t.common.supportCancel}
            </button>
            <button
              type="submit"
              disabled={sending}
              className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {sending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>{t.common.supportSending}</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span>{t.common.supportSend}</span>
                </>
              )}
            </button>
          </div>

          <div className="text-center text-xs text-neutral-500 pt-2 border-t">
            <p>{t.common.supportEmailAlt}</p>
            <a href="mailto:contact@keiroai.com" className="text-purple-600 hover:underline font-medium">
              contact@keiroai.com
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
