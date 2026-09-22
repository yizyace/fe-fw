import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createRootRoute, createRoute, createRouter, Link, Outlet, useRouterState } from '@tanstack/react-router';
import { searchGuides } from './search';
import type { LibraryData } from './types';

async function loadLibrary(): Promise<LibraryData> {
  const response = await fetch(`${import.meta.env.BASE_URL}generated/library.json`);
  if (!response.ok) throw new Error('The local guide library could not be loaded.');
  const data = await response.json() as LibraryData;
  if (!Array.isArray(data.guides) || !Array.isArray(data.sources)) throw new Error('The local guide library is not valid.');
  return data;
}

function Frame({ children }: { children: ReactNode }) {
  return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <div className="site-shell">{children}</div>
  </>;
}

function Root() {
  return <Frame><Outlet /></Frame>;
}

function usePageHeading(title: string) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    document.title = title;
    ref.current?.focus({ preventScroll: true });
  }, [title]);
  return ref;
}

function Failure() {
  const titleRef = usePageHeading('Library unavailable · Fortune’s Weave');
  return <Frame><main id="main-content" className="message-page" tabIndex={-1}>
    <h1 ref={titleRef} tabIndex={-1}>Couldn’t open your library.</h1>
    <p>Rebuild the local library with <code>pnpm guides:build</code>, then reload this page.</p>
    <button type="button" onClick={() => window.location.reload()}>Reload library</button>
  </main></Frame>;
}

function MissingPage() {
  const titleRef = usePageHeading('Page not found · Fortune’s Weave');
  return <main id="main-content" className="message-page" tabIndex={-1}>
    <h1 ref={titleRef} tabIndex={-1}>Page not found.</h1><Link to="/">Return to the library</Link>
  </main>;
}

const rootRoute = createRootRoute({
  loader: loadLibrary,
  staleTime: Infinity,
  component: Root,
  errorComponent: Failure,
  pendingComponent: () => <Frame><main id="main-content" className="message-page" tabIndex={-1}><h1>Opening your library…</h1></main></Frame>,
  notFoundComponent: MissingPage,
});

function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLowerCase();
  if (!needle) return text;
  const parts: ReactNode[] = [];
  let start = 0;
  let index = text.toLowerCase().indexOf(needle);
  while (index !== -1) {
    parts.push(text.slice(start, index), <mark key={index}>{text.slice(index, index + needle.length)}</mark>);
    start = index + needle.length;
    index = text.toLowerCase().indexOf(needle, start);
  }
  parts.push(text.slice(start));
  return parts;
}

function Library() {
  const { guides, sources } = rootRoute.useLoaderData();
  const [query, setQuery] = useState('');
  const results = searchGuides(guides, query);
  const titleRef = usePageHeading('Fortune’s Weave reference');

  return <main id="main-content" className="library" tabIndex={-1}>
    <header className="library-header"><h1 ref={titleRef} tabIndex={-1}>Fortune’s Weave reference</h1></header>
    {guides.length > 0 ? <>
      <div className="search-area">
        <label htmlFor="guide-search">Search guides</label>
        <div className="search-control">
          <input id="guide-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Character, gift, or prompt" autoComplete="off" />
          {query && <button type="button" className="clear-search" onClick={() => { setQuery(''); document.getElementById('guide-search')?.focus(); }}>Clear</button>}
        </div>
        <p className="search-summary" role="status">{query.trim() ? `${results.length} ${results.length === 1 ? 'guide matches' : 'guides match'} “${query.trim()}”` : ''}</p>
      </div>
      {results.length === 0 && <div className="empty-results"><h2>No matching passages.</h2><p>Try a shorter phrase or a different spelling.</p></div>}
      <ul className="guide-list">{results.map(({ guide, matches }) => <li className="guide-entry" key={guide.id}>
        <h2><Link to="/guides/$guideId" params={{ guideId: guide.id }}><Highlight text={guide.title} query={query} /></Link></h2>
        {matches.length > 0 && <ul className="search-matches">{matches.map((match, index) => <li key={`${match.headingId}-${index}`}>
          <Link to="/guides/$guideId" params={{ guideId: guide.id }} hash={match.headingId || undefined} className="passage-link">
            <span className="passage-heading">{match.heading || 'Matching passage'}</span>
            <span className="passage-excerpt"><Highlight text={match.excerpt} query={query} /></span>
          </Link>
        </li>)}</ul>}
      </li>)}</ul>
    </> : <section className="empty-library">
      <h2>No saved guides.</h2>
      <p>Run <code>pnpm guides:import all</code>, then reload the library.</p>
      {sources.length > 0 && <ul className="source-list">{sources.map(source => <li key={source.id}>{source.publisher}: <a href={source.url}>{source.topic}</a></li>)}</ul>}
    </section>}
  </main>;
}

function Guide() {
  const { guideId } = guideRoute.useParams();
  const { guides } = rootRoute.useLoaderData();
  const guide = guides.find(item => item.id === guideId);
  const hash = useRouterState({ select: state => state.location.hash });

  useLayoutEffect(() => {
    document.title = guide ? guide.title : 'Guide not found · Fortune’s Weave';
    const heading = hash ? document.getElementById(hash) : document.getElementById('guide-title');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
      if (hash) heading.scrollIntoView();
    }
  }, [guide, hash]);

  if (!guide) return <main id="main-content" className="message-page" tabIndex={-1}>
    <Link to="/" className="back-link">Back to library</Link><h1 id="guide-title" tabIndex={-1}>Guide not found.</h1>
    <p>This guide hasn’t been saved. Return to the library to choose an available guide.</p>
  </main>;

  return <main id="main-content" className="reader" tabIndex={-1}>
    <article>
      <header className="reader-header">
        <Link to="/">Library</Link>
        <h1 id="guide-title" tabIndex={-1}>{guide.topic}</h1>
        <a className="source-link" href={guide.sourceUrl}>Source: {guide.publisher}</a>
      </header>
      <div className="article-content" dangerouslySetInnerHTML={{ __html: guide.html }} />
    </article>
  </main>;
}

const libraryRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Library });
const guideRoute = createRoute({ getParentRoute: () => rootRoute, path: '/guides/$guideId', component: Guide });
export const router = createRouter({ basepath: import.meta.env.BASE_URL, routeTree: rootRoute.addChildren([libraryRoute, guideRoute]), scrollRestoration: true });
declare module '@tanstack/react-router' { interface Register { router: typeof router } }
