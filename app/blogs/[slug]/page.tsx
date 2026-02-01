// Keep this as a Server Component (No "use client" here)
import { getBlogBySlug } from '@/lib/markdown';
import { notFound } from 'next/navigation';
import BlogDetailClient from './BlogDetailClient';

export default async function BlogPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogBySlug(slug);

  if (!post) notFound();

  // We fetch the data on the server and pass it to the client
  return <BlogDetailClient post={post} />;
}