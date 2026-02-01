// lib/markdown.ts
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

// Use a cleaner path join
const blogsDirectory = path.join(process.cwd(), 'content', 'blogs');

export function getAllBlogs() {
  if (!fs.existsSync(blogsDirectory)) return [];

  const fileNames = fs.readdirSync(blogsDirectory);
  
  return fileNames
    .filter(fileName => fileName.endsWith('.md'))
    .map((fileName) => {
      const slug = fileName.replace(/\.md$/, '');
      const fullPath = path.join(blogsDirectory, fileName);
      const fileContents = fs.readFileSync(fullPath, 'utf8');
      const { data } = matter(fileContents);

      return {
        slug,
        ...data,
      };
    });
}

export function getBlogBySlug(slug: string) {
  try {
    const fileName = slug.endsWith('.md') ? slug : `${slug}.md`;
    const fullPath = path.join(blogsDirectory, fileName);
    
    if (!fs.existsSync(fullPath)) return null;

    const fileContents = fs.readFileSync(fullPath, 'utf8');
    
    // matter(fileContents) parses the string
    const parsed = matter(fileContents);
    
    return { 
      data: parsed.data, 
      content: parsed.content.trim() // Added trim() to remove potential hidden characters
    };
  } catch (e) {
    console.error("Error reading markdown:", e);
    return null;
  }
}