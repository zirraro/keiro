'use client';
import React from 'react';
import { CATEGORIES, type CleanCategory } from '../lib/newsCategories';

type Props = {
  value: string;
  onChange: (slug: string)=>void;
  className?: string;
};

export default function CategorySelect({ value, onChange, className }: Props) {
  return (
    <label className={className}>
      <span className="block text-sm text-neutral-600 mb-1">Catégorie</span>
      <select
        value={value}
        onChange={(e)=>onChange(e.target.value)}
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 bg-white"
      >
        {CATEGORIES.map(c => (
          <option key={c.slug} value={c.slug}>
            {c.emoji ? `${c.emoji} ` : ''}{c.label}
          </option>
        ))}
      </select>
    </label>
  );
}
