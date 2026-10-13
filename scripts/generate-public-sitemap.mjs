import fs from 'node:fs';
import { publicSitemap, publicPages } from '../src/lib/public-route-manifest.ts';
fs.writeFileSync('public/sitemap.xml',publicSitemap());
console.log(`Sitemap generated for ${publicPages.length} public routes; private accounts are excluded.`);
