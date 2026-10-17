import { publicStaticPages, SITE_ORIGIN, type PublicPage } from './public-site-meta.ts';
export { SITE_ORIGIN, type PublicPage } from './public-site-meta.ts';
import { careerGuides } from './career-guides.ts';

export const publicPages: PublicPage[] = [
  ...publicStaticPages,
  ...careerGuides.map(guide=>({path:`/guides/${guide.slug}`,kind:'guide' as const,key:guide.slug,title:`${guide.title} | Jobvance`,description:guide.description,modified:guide.updatedAt})),
];

export const clientOnlyPaths = ['/applications','/loop','/onboarding','/dashboard','/admin','/admin2','/auth','/auth/callback','/auth/forgot-password','/auth/reset'];
export const routeRedirects: Record<string,string> = {
  '/blog':'/guides', '/product':'/job-loop','/jobs':'/job-loop','/resume-management':'/dashboard?tab=cv','/resumes':'/dashboard?tab=cv','/job-preferences':'/dashboard?tab=tailor','/preferences':'/dashboard?tab=tailor','/settings':'/dashboard?tab=billing','/plan-selection':'/pricing','/thank-you':'/dashboard?tab=billing',
};
export function publicPage(path:string): PublicPage | undefined { return publicPages.find(page=>page.path===path); }
export function escapedXml(value:string):string {return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
export function publicSitemap():string {return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+publicPages.map(page=>`<url><loc>${escapedXml(SITE_ORIGIN+page.path)}</loc>${page.modified?`<lastmod>${escapedXml(page.modified)}</lastmod>`:''}</url>`).join('')+'</urlset>';}
