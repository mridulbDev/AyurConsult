import { getAllBlogs } from '@/lib/markdown'; // Make sure this is exported in your lib
import BlogsClient from './BlogsClient';

export const metadata = {
  title: "Ayurvedic Wisdom Blogs",
  description: "Explore a collection of Ayurvedic articles on herbs, diseases, and personal care.",
};

export default function BlogsPage() {
  // Use the function that gets the ARRAY of all posts
  const allPosts = getAllBlogs(); 
  
  return <BlogsClient initialPosts={allPosts} />;
}