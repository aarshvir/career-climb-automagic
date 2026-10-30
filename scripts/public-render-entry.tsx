import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter, Routes, Route, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from '../src/contexts/AuthContext';
import Header from '../src/components/layout/MvpHeader';
import Footer from '../src/components/layout/MvpFooter';
import ProductPage, { productFaqs } from '../src/pages/ProductPage';
import { subscriptionPlans } from '../src/lib/subscription-plans';
import AudienceLanding from '../src/pages/AudienceLanding';
import JobLoopOverview from '../src/pages/JobLoopOverview';
import HelpCenter from '../src/pages/HelpCenter';
import Walkthroughs from '../src/pages/Walkthroughs';
import CareerGuides, { CareerGuideArticle } from '../src/pages/CareerGuides';
import { publicPages, type PublicPage } from '../src/lib/public-route-manifest';

function element(page:PublicPage) {
  if(page.kind==='product')return <ProductPage kind={page.key as Parameters<typeof ProductPage>[0]['kind']} />;
  if(page.kind==='audience')return <AudienceLanding audience={page.key as Parameters<typeof AudienceLanding>[0]['audience']} />;
  if(page.kind==='check')return <main className="product-page"><section className="product-shell product-inner"><h1>CV Check, in your Jobvance account.</h1><p>Compare your CV with a job, review tailored wording and download your approved version. Keep it ready for your next application.</p><Link className="product-button" to="/auth?mode=signup&next=%2Fcheck">Create my account</Link><p><Link to="/auth?next=%2Fcheck">Already have an account? Sign in</Link></p></section></main>;
  if(page.kind==='pilot')return <JobLoopOverview />;
  if(page.kind==='loop-overview')return <JobLoopOverview />;
  if(page.kind==='help')return <HelpCenter />;
  if(page.kind==='walkthroughs')return <Walkthroughs />;
  if(page.kind==='guides')return <CareerGuides />;
  return <CareerGuideArticle />;
}

/** Extra schema.org nodes for pages whose visible content states them: the FAQ's own questions, and the published plan prices. No ratings, reviews or outcomes. */
export function structuredNodesFor(path:string,siteOrigin:string):object[] {
  if(path==='/faq')return [{'@type':'FAQPage',mainEntity:productFaqs.filter(([,answer])=>typeof answer==='string').map(([question,answer])=>({'@type':'Question',name:question,acceptedAnswer:{'@type':'Answer',text:answer as string}}))}];
  if(path==='/'||path==='/pricing')return [{'@type':'SoftwareApplication',name:'Jobvance Automated Job Loop',url:siteOrigin+'/',applicationCategory:'BusinessApplication',operatingSystem:'Web',offers:[{'@type':'Offer',name:'Free account',price:'0',priceCurrency:'USD',url:siteOrigin+'/check'},...subscriptionPlans.map(plan=>({'@type':'Offer',name:plan.name+' monthly plan',price:String(plan.priceUsd),priceCurrency:'USD',url:siteOrigin+'/pricing'}))]}];
  return [];
}

/** Builds public guest markup only. No account data, browser state or API call is rendered. */
export function renderPublicRoute(path:string) {
  const context:{helmet?:{script:{toString():string}}}={};
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const body=renderToString(<HelmetProvider context={context}><QueryClientProvider client={client}><AuthProvider><StaticRouter location={path}><Header /><div id="main-content" tabIndex={-1}><Routes>{publicPages.filter(page=>page.kind!=='guide').map(page=><Route key={page.path} path={page.path} element={element(page)} />)}<Route path="/guides/:slug" element={<CareerGuideArticle />} /></Routes></div><Footer /></StaticRouter></AuthProvider></QueryClientProvider></HelmetProvider>);
  client.clear();
  return {body, scripts:context.helmet?.script.toString()??''};
}
