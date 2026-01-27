import fs from 'fs';
import path from 'path';
import Link from 'next/link';

export default function BlogsPage() {
  const blogDir = path.join(process.cwd(), 'blogs_content');
  const files = fs.readdirSync(blogDir);

  const posts = files.map(filename => {
    const slug = filename.replace('.md', '');
    return { slug, title: slug.replace(/-/g, ' ') };
  });

  return (
    <div className="max-w-7xl mx-auto px-6 py-20">
      <h1 className="text-4xl font-bold mb-4">Ayurvedic Wisdom</h1>
      <div className="flex gap-4 mb-12">
        {['All', 'Personal Care', 'Diseases', 'Others'].map(cat => (
          <button key={cat} className="px-6 py-2 rounded-full border border-forest/20 hover:bg-forest hover:text-sand transition-all">
            {cat}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {posts.map(post => (
          <Link href={`/blogs/${post.slug}`} key={post.slug} className="glass-card group hover:-translate-y-2">
            <div className="h-48 bg-forest/10 rounded-2xl mb-4 overflow-hidden">
               {/* <Image src={`/images/${post.slug}.jpg`} alt={post.title} fill /> */}
            </div>
            <h3 className="text-xl font-bold capitalize group-hover:text-saffron transition-colors">{post.title}</h3>
            <p className="mt-2 opacity-70">Read ancient solutions for modern ailments...</p>
          </Link>
        ))}
      </div>
    </div>
  );
}