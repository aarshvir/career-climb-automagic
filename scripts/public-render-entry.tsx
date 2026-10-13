import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from '../src/contexts/AuthContext';
import Header from '../src/components/layout/MvpHeader';
import Footer from '../src/components/layout/MvpFooter';
import ProductPage from '../src/pages/ProductPage';
import AudienceLanding from '../src/pages/AudienceLanding';
import CvCheck from '../src/pages/CvCheck';
import PilotLanding from '../src/pages/PilotLanding';
import JobLoopOverview from '../src/pages/JobLoopOverview';
import HelpCenter from '../src/pages/HelpCenter';
import Walkthroughs from '../src/pages/Walkthroughs';
import CareerGuides, { CareerGuideArticle } from '../src/pages/CareerGuides';
import { publicPages, type PublicPage } from '../src/lib/public-route-manifest';

function element(page:PublicPage) {
  if(page.kind==='product')return <ProductPage kind={page.key as Parameters<typeof ProductPage>[0]['kind']} />;
  if(page.kind==='audience')return <AudienceLanding audience={page.key as Parameters<typeof AudienceLanding>[0]['audience']} />;
  if(page.kind==='check')return <CvCheck />;
  if(page.kind==='pilot')return <PilotLanding />;
  if(page.kind==='loop-overview')return <JobLoopOverview />;
  if(page.kind==='help')return <HelpCenter />;
  if(page.kind==='walkthroughs')return <Walkthroughs />;
  if(page.kind==='guides')return <CareerGuides />;
  return <CareerGuideArticle />;
}

/** Builds public guest markup only. No account data, browser state or API call is rendered. */
export function renderPublicRoute(path:string) {
  const context:{helmet?:{script:{toString():string}}}={};
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const body=renderToString(<HelmetProvider context={context}><QueryClientProvider client={client}><AuthProvider><StaticRouter location={path}><Header /><div id="main-content" tabIndex={-1}><Routes>{publicPages.filter(page=>page.kind!=='guide').map(page=><Route key={page.path} path={page.path} element={element(page)} />)}<Route path="/guides/:slug" element={<CareerGuideArticle />} /></Routes></div><Footer /></StaticRouter></AuthProvider></QueryClientProvider></HelmetProvider>);
  client.clear();
  return {body, scripts:context.helmet?.script.toString()??''};
}
