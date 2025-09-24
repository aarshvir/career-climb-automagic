import fs from 'fs';
import path from 'path';

const SITE_URL = 'https://jobvance.io';

const generateSitemap = async () => {
  const pagesDir = path.resolve(process.cwd(), 'src/pages');
  const postsDir = path.resolve(process.cwd(), 'content/posts');

  // 1. Get static pages
  const staticPages = fs
    .readdirSync(pagesDir)
    .filter((file) => file.endsWith('.tsx') && !file.startsWith('_') && !file.startsWith('[') && file !== 'AuthCallback.tsx' && file !== 'NotFound.tsx' && file !== 'Dashboard.tsx')
    .map((file) => {
      const pageName = file.replace(/\.tsx$/, '').toLowerCase();
      return pageName === 'index' ? '/' : `/${pageName}`;
    });

  // 2. Get blog posts
  const blogPosts = fs
    .readdirSync(postsDir)
    .filter((file) => file.endsWith('.mdx'))
    .map((file) => {
      const slug = file.replace(/\.mdx$/, '');
      return `/blog/${slug}`;
    });

  const allUrls = [...staticPages, ...blogPosts];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${allUrls
    .map((url) => {
      const isBlog = url.startsWith('/blog/');
      const priority = url === '/' ? '1.0' : isBlog ? '0.7' : '0.8';
      const changefreq = isBlog ? 'weekly' : 'monthly';

      return `
  <url>
    <loc>${SITE_URL}${url}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
    })
    .join('')}
</urlset>`;

  fs.writeFileSync(path.resolve(process.cwd(), 'public/sitemap.xml'), sitemap);
  console.log('✅ Sitemap generated successfully!');
};

generateSitemap();
