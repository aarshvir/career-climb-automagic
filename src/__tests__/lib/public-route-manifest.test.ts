import { describe,it,expect } from 'vitest';
import { publicPages,publicSitemap,clientOnlyPaths,routeRedirects } from '@/lib/public-route-manifest';

describe('public search routes remain distinct and exclude private state',()=>{
  it('includes twenty substantive article routes and useful product/help entry points',()=>{
    expect(publicPages.filter(page=>page.kind==='guide')).toHaveLength(20);
    expect(publicPages.map(page=>page.path)).toEqual(expect.arrayContaining(['/check','/job-loop','/help','/walkthroughs','/guides']));
    expect(new Set(publicPages.map(page=>page.path)).size).toBe(publicPages.length);
    expect(new Set(publicPages.map(page=>page.title)).size).toBe(publicPages.length);
    expect(new Set(publicPages.map(page=>page.description)).size).toBe(publicPages.length);
    for(const page of publicPages){expect(page.path).toMatch(/^\/[a-z\d/-]*$/);expect(page.description.length).toBeGreaterThan(70);}
  });
  it('publishes canonical page locations without private/admin/auth/query URLs',()=>{
    const sitemap=publicSitemap();
    expect(sitemap.match(/<url>/g)).toHaveLength(publicPages.length);
    for(const path of clientOnlyPaths)expect(sitemap).not.toContain(`<loc>https://jobvance.io${path}</loc>`);
    const locations=[...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match=>match[1]);
    expect(locations).toHaveLength(publicPages.length);
    for(const location of locations){expect(location).not.toContain('?');expect(location).not.toContain('#');}
  });
  it('moves old blog and jobs entries to an explanatory public page',()=>{
    expect(routeRedirects['/blog']).toBe('/guides');expect(routeRedirects['/jobs']).toBe('/job-loop');
    expect(routeRedirects['/product']).toBe('/job-loop');
  });
});
