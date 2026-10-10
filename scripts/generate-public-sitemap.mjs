import fs from 'node:fs';
const pages=['/','/pilot','/pricing','/how-it-works','/faq','/about','/contact','/privacy','/terms','/refund','/help'];
fs.writeFileSync('public/sitemap.xml','<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+pages.map(p=>'<url><loc>https://jobvance.io'+p+'</loc></url>').join('')+'</urlset>');
console.log('Sitemap generated for available public routes.');
