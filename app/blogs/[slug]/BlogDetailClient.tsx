"use client";
import React from 'react';
import ReactMarkdown from 'react-markdown';
import { useLanguage } from '@/app/context/LanguageContext';
import { Tag, ChevronRight, Quote } from 'lucide-react';

export default function BlogDetailClient({ post }: { post: any }) {
  const { lang } = useLanguage();
  const { content, data } = post;

  const filterStrict = (children: any): any => {
    return React.Children.map(children, (child) => {
      if (typeof child !== 'string') {
        if (child?.props?.children) {
          return React.cloneElement(child, {
            children: filterStrict(child.props.children)
          });
        }
        return child;
      }

      if (child.includes('|')) {
        const parts = child.split('|');
        const targetText = lang === 'en' ? parts[0] : (parts[1] || parts[0]);
        return targetText.trim();
      }

      const hasHindi = /[\u0900-\u097F]/.test(child);
      if (lang === 'en' && hasHindi) return ""; 
      
      const hasEnglish = /[a-zA-Z]/.test(child);
      if (lang === 'hi' && !hasHindi && hasEnglish && child.trim().length > 3) return "";

      return child;
    });
  };

  return (
    <div className="min-h-screen pb-12 md:pb-24 relative overflow-hidden bg-sand/20">
      {/* 1. CINEMATIC HERO - Adjusted for Mobile Height */}
      <div className="relative h-[50vh] md:h-[60vh] min-h-[350px] w-full bg-forest flex items-center justify-center overflow-hidden">
        {data?.thumbnail && (
          <div className="absolute inset-0 w-full h-full">
            <img 
              src={data.thumbnail} 
              className="w-full h-full object-cover opacity-60 mix-blend-luminosity" 
              style={{
                maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)'
              }}
              alt="background"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-forest via-transparent to-transparent opacity-80"></div>
          </div>
        )}
        
        <div className="relative z-10 max-w-4xl px-4 md:px-6 text-center">
          <span className="text-saffron text-xs md:text-sm font-bold tracking-[0.3em] md:tracking-[0.4em] uppercase mb-4 block animate-fade-in">
            {lang === 'en' ? data?.category_en : data?.category_hi}
          </span>
          <h1 className="text-2xl md:text-7xl font-serif text-sand leading-tight px-2">
            {lang === 'en' ? data?.title_en : data?.title_hi}
          </h1>
          <div className="w-16 md:w-24 h-1 bg-saffron/30 mx-auto mt-6 md:mt-8 rounded-full"></div>
        </div>
      </div>

      {/* 2. OVERLAPPING CONTENT CARD - Tighter for Mobile */}
      <div className="max-w-5xl mx-auto px-4 md:px-6 -mt-10 md:-mt-20 relative z-30">
        <div className="relative bg-white/60 md:bg-white/40 backdrop-blur-md rounded-[24px] md:rounded-[48px] p-6 md:p-16 shadow-2xl border border-white/20">
          
          <div className="prose prose-stone max-w-none">
            <ReactMarkdown
              components={{
                h3: ({ children }) => {
                  const parts = String(children).split('|');
                  const title = lang === 'en' ? parts[0] : (parts[1] || parts[0]);
                  return (
                    <div className="mt-8 md:mt-12 mb-4 md:mb-6">
                       <h3 className="text-xl md:text-3xl font-serif font-bold text-forest m-0 leading-tight">
                         {title}
                       </h3>
                    </div>
                  );
                },

                p: ({ children }) => {
                  const contentStr = String(children);
                  const ytMatch = contentStr.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
                  if (ytMatch) {
                    return (
                      <div className="my-6 md:my-10 aspect-video rounded-xl md:rounded-[32px] overflow-hidden shadow-2xl border-2 md:border-4 border-white">
                        <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${ytMatch[1]}`} allowFullScreen />
                      </div>
                    );
                  }

                  const filtered = filterStrict(children);
                  if (!filtered || React.Children.count(filtered) === 0) return null;
                  
                  return (
                    <div className="text-base md:text-xl leading-relaxed text-forest/80 mb-6 md:mb-8 font-medium">
                      {filtered}
                    </div>
                  );
                },

                li: ({ children }) => {
                  const filtered = filterStrict(children);
                  if (!filtered) return null;
                  return (
                    <li className="flex items-start gap-3 text-forest/80 text-base md:text-lg mb-4 list-none">
                      <ChevronRight className="text-saffron shrink-0 mt-1 md:mt-1.5" size={18} />
                      <div className="font-serif leading-relaxed">{filtered}</div>
                    </li>
                  );
                },

                blockquote: ({ children }) => (
                  <div className="my-8 md:my-12 p-6 md:p-10 bg-forest/5 backdrop-blur-sm rounded-2xl md:rounded-3xl shadow-sm relative overflow-hidden border border-forest/5">
                    <Quote className="absolute -top-1 -right-1 text-saffron/10 w-16 h-16 md:w-24 md:h-24 rotate-12" />
                    <div className="relative z-10 text-lg md:text-2xl font-serif italic text-forest/90 text-center leading-relaxed">
                       {filterStrict(children)}
                    </div>
                  </div>
                ),

                img: ({...props}) => (
                  <div className="my-8 md:my-12 text-center">
                    <img {...props} className="rounded-xl md:rounded-[32px] shadow-lg inline-block border-2 md:border-4 border-white w-full md:w-auto max-h-[550px] object-cover" />
                    {props.alt && <p className="mt-3 text-[10px] font-bold uppercase text-saffron tracking-[0.2em]">{props.alt}</p>}
                  </div>
                ),

                hr: () => <hr className="my-8 md:my-12 border-forest/5" />,
              }}
            >
              {content}
            </ReactMarkdown>
          </div>

          {/* 3. TAG FOOTER */}
          <div className="mt-12 md:mt-16 pt-6 md:pt-8 border-t border-forest/10 flex justify-center">
            <div className="flex flex-wrap gap-2 md:gap-3 justify-center">
              {data?.tags?.map((tag: string) => (
                <span key={tag} className="bg-forest/5 text-forest px-4 md:px-6 py-1.5 md:py-2 rounded-full text-[9px] md:text-[10px] font-bold uppercase tracking-widest border border-forest/5 transition-colors">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}