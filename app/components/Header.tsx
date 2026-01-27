"use client";
import Link from 'next/link';

export default function Header() {
  return (
    <nav className="sticky top-0 z-50 bg-sand/90 backdrop-blur-md border-b border-forest/10 px-6 py-4">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <Link href="/" className="group">
          <span className="text-2xl font-serif font-bold text-forest group-hover:text-saffron transition-colors">
            PROF. MAHESH <span className="text-saffron">DIXIT</span>
          </span>
        </Link>
        
        <div className="hidden md:flex gap-10 items-center font-medium">
          <Link href="/" className="hover:text-saffron transition-colors">Home / मुख्य</Link>
          <Link href="/blogs" className="hover:text-saffron transition-colors">Blogs / लेख</Link>
          <Link href="/consultation" className="btn-vedic !py-2 !px-6 text-sm">
            Book Consultation
          </Link>
        </div>
      </div>
    </nav>
  );
}