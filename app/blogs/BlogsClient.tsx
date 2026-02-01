"use client";
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useLanguage } from '../context/LanguageContext';

export default function BlogsClient({ initialPosts }: { initialPosts: any[] }) {
  const { lang } = useLanguage();
  const [activeCategory, setActiveCategory] = useState('All');

  const categories = lang === 'en' 
    ? ['All', 'Personal Care', 'Diseases', 'Herbs', 'Others'] 
    : ['सभी', 'व्यक्तिगत देखभाल', 'रोग', 'जड़ी-बूटियाँ', 'अन्य'];

  const filteredPosts = activeCategory === 'All' || activeCategory === 'सभी'
    ? initialPosts
    : initialPosts.filter(post => 
        post.category_en === activeCategory || post.category_hi === activeCategory
      );

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-10 md:py-20">
      <h1 className="text-3xl md:text-4xl font-serif font-bold text-forest mb-6 md:mb-8">
        {lang === 'en' ? 'Ayurvedic Wisdom' : 'आयुर्वेदिक ज्ञान'}
      </h1>
      
      {/* Category Pills - Improved mobile horizontal scroll */}
      <div className="flex gap-3 mb-10 overflow-x-auto pb-4 no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
        {categories.map(cat => (
          <button 
            key={cat} 
            onClick={() => setActiveCategory(cat)}
            className={`px-5 py-2 rounded-full border border-forest/30 text-sm md:text-base transition-all whitespace-nowrap ${
              activeCategory === cat ? 'bg-forest text-sand' : 'text-forest hover:bg-forest/10'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grid: 1 col on mobile, 3 cols on desktop */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
        {filteredPosts.map(post => (
          <Link 
            href={`/blogs/${post.slug}`} 
            key={post.slug} 
            className="relative flex flex-col h-full bg-sand/50 border border-forest/10 rounded-r-[24px] md:rounded-r-[32px] overflow-hidden group hover:shadow-xl transition-all"
          >
            {/* SAFFRON SIDELINE */}
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-saffron z-10 opacity-100" />
            
            <div className="h-48 md:h-56 relative bg-forest/5 shrink-0 overflow-hidden">
               {post.thumbnail ? (
                 <Image 
                    src={post.thumbnail} 
                    alt={post.title_en} 
                    fill 
                    className="object-cover group-hover:scale-105 transition-transform duration-500" 
                 />
               ) : (
                 <div className="flex items-center justify-center h-full italic text-saffron/20">
                    {lang === 'en' ? 'Ayurveda' : 'आयुर्वेद'}
                 </div>
               )}
            </div>

            <div className="p-6 md:p-8 pl-8 md:pl-10 flex flex-col flex-1">
              <h3 className="text-lg md:text-xl font-bold text-forest group-hover:text-saffron transition-colors line-clamp-2 leading-tight">
                {lang === 'en' ? post.title_en : post.title_hi}
              </h3>
              <p className="mt-3 text-forest/70 text-xs md:text-sm line-clamp-3 leading-relaxed">
                {lang === 'en' ? post.description_en : post.description_hi}
              </p>
              
              <div className="mt-auto pt-6 flex items-center gap-2 text-saffron font-bold text-[10px] md:text-xs uppercase tracking-[0.2em]">
                {lang === 'en' ? 'Read More' : 'और पढ़ें'}
                <span className="group-hover:translate-x-2 transition-transform">→</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}