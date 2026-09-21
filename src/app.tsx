import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createRootRoute, createRoute, createRouter, Link, Outlet, useRouterState } from '@tanstack/react-router';
import { searchGuides } from './search';
import type { LibraryData, ReaderGuide } from './types';

async function loadLibrary(): Promise<LibraryData> {
  const response = await fetch('/generated/library.json');
  if (!response.ok) throw new Error('The local guide library could not be loaded.');
  const data = await response.json() as LibraryData;
  if (!Array.isArray(data.guides) || !Array.isArray(data.sources)) throw new Error('The local guide library is not valid.');
  return data;
}

function Frame({ children }: { children: ReactNode }) {
  return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <div className="book-spine" aria-hidden="true"><span>Fortune’s Weave</span></div>
    <div className="site-shell">
      <header className="site-header">
        <Link to="/" className="wordmark" aria-label="Fortune’s Weave guide library"><span className="shelf-mark" aria-hidden="true"><i /><i /><i /></span>Fortune’s Weave</Link>
        <span className="local-label">Your local guide library</span>
      </header>
      {children}
      <footer className="site-footer"><span>A personal reference shelf.</span><span>Saved locally. Read at your own pace.</span></footer>
    </div>
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
    <p className="section-label">Library unavailable</p>
    <h1 ref={titleRef} tabIndex={-1}>Couldn’t open your library.</h1>
    <p>Rebuild the local library with <code>pnpm guides:build</code>, then reload this page.</p>
    <button type="button" onClick={() => window.location.reload()}>Reload library</button>
  </main></Frame>;
}

function MissingPage() {
  const titleRef = usePageHeading('Page not found · Fortune’s Weave');
  return <main id="main-content" className="message-page" tabIndex={-1}>
    <h1 ref={titleRef} tabIndex={-1}>Page not found.</h1><p>This page isn’t on your shelf.</p><Link to="/">Return to the library</Link>
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

function formatDate(date: string): string {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat('en', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(parsed);
}

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
  const publishers = [...new Set(results.map(result => result.guide.publisher))];
  const titleRef = usePageHeading('Fortune’s Weave · Guide library');

  return <main id="main-content" className="library" tabIndex={-1}>
    <div className="library-intro">
      <p className="section-label">Fire Emblem: Fortune’s Weave</p>
      <h1 ref={titleRef} tabIndex={-1}>Keep your place.<br />Find your next move.</h1>
      <p className="intro-copy">Guides from across the web, gathered on one quiet shelf.</p>
    </div>
    {guides.length > 0 ? <>
      <div className="search-area">
        <label htmlFor="guide-search">Search guides</label>
        <div className="search-control">
          <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
          <input id="guide-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a topic, character, or passage" autoComplete="off" />
          {query && <button type="button" className="clear-search" onClick={() => { setQuery(''); document.getElementById('guide-search')?.focus(); }}>Clear</button>}
        </div>
        <p className="search-summary" role="status">{query.trim() ? `${results.length} ${results.length === 1 ? 'guide matches' : 'guides match'} “${query.trim()}”` : `${guides.length} ${guides.length === 1 ? 'guide' : 'guides'} on your shelf. Search titles and full text.`}</p>
      </div>
      {results.length === 0 && <div className="empty-results"><h2>No matching passages.</h2><p>Try a shorter phrase or a different spelling.</p></div>}
      <div className="publisher-list">{publishers.map(publisher => <section className="publisher-section" key={publisher} aria-label={`${publisher} guides`}>
        <div className="publisher-heading"><h2>{publisher}</h2><span>{results.filter(result => result.guide.publisher === publisher).length} {results.filter(result => result.guide.publisher === publisher).length === 1 ? 'guide' : 'guides'}</span></div>
        <div className="guide-list">{results.filter(result => result.guide.publisher === publisher).map(({ guide, matches }) => <article className="guide-entry" key={guide.id}>
          <p className="guide-topic">{guide.topic}</p>
          <h3><Link to="/guides/$guideId" params={{ guideId: guide.id }}><Highlight text={guide.title} query={query} /></Link></h3>
          {!query.trim() && <p className="guide-description">{guide.text.slice(0, 200)}{guide.text.length > 200 ? '…' : ''}</p>}
          <div className="guide-meta">{guide.author && <span>By {guide.author}</span>}<span>Saved {formatDate(guide.capturedAt)}</span></div>
          {matches.length > 0 && <ul className="search-matches">{matches.map((match, index) => <li key={`${match.headingId}-${index}`}>
            <Link to="/guides/$guideId" params={{ guideId: guide.id }} hash={match.headingId || undefined} className="passage-link">
              <span className="passage-heading">{match.heading || 'Matching passage'}</span>
              <span className="passage-excerpt"><Highlight text={match.excerpt} query={query} /></span>
            </Link>
          </li>)}</ul>}
        </article>)}</div>
      </section>)}</div>
    </> : <section className="empty-library">
      <h2>Your shelf is ready.</h2>
      <p>Import the source guides to start reading and searching your local collection.</p>
      <code className="command">pnpm guides:import all</code>
      <p className="muted">Then restart the local server to load your saved guides.</p>
      {sources.length > 0 && <><h3>Sources to add</h3><ul className="source-list">{sources.map(source => <li key={source.id}><span>{source.publisher}</span><a href={source.url}>{source.topic}</a></li>)}</ul></>}
    </section>}
  </main>;
}

function HeadingLinks({ guide }: { guide: ReaderGuide }) {
  return <ul>{guide.headings.map(heading => <li key={heading.id} className={heading.level > 2 ? 'nested-heading' : undefined}>
    <Link to="/guides/$guideId" params={{ guideId: guide.id }} hash={heading.id}>{heading.text}</Link>
  </li>)}</ul>;
}

function Guide() {
  const { guideId } = guideRoute.useParams();
  const { guides } = rootRoute.useLoaderData();
  const guide = guides.find(item => item.id === guideId);
  const hash = useRouterState({ select: state => state.location.hash });

  useLayoutEffect(() => {
    document.title = guide ? `${guide.title} · Fortune’s Weave` : 'Guide not found · Fortune’s Weave';
    const heading = hash ? document.getElementById(hash) : document.getElementById('guide-title');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
      if (hash) heading.scrollIntoView();
    }
  }, [guide, hash]);

  if (!guide) return <main id="main-content" className="message-page" tabIndex={-1}>
    <Link to="/" className="back-link">Back to library</Link><h1 id="guide-title" tabIndex={-1}>Guide not found.</h1>
    <p>This guide hasn’t been saved to your local library.</p><p>Browse the library to find an available guide.</p>
  </main>;

  return <main id="main-content" className="reader" tabIndex={-1}>
    <Link to="/" className="back-link"><span aria-hidden="true">‹</span> Back to library</Link>
    <div className="reader-layout">
      <article className="reader-article">
        <header className="article-header">
          <p className="section-label">{guide.publisher}<span className="label-separator" aria-hidden="true">/</span>{guide.topic}</p>
          <h1 id="guide-title" tabIndex={-1}>{guide.title}</h1>
          <dl className="article-metadata">
            {guide.author && <div><dt>Written by</dt><dd>{guide.author}</dd></div>}
            {guide.publishedAt && <div><dt>Published</dt><dd>{formatDate(guide.publishedAt)}</dd></div>}
            <div><dt>Saved locally</dt><dd><time dateTime={guide.capturedAt}>{formatDate(guide.capturedAt)}</time></dd></div>
            <div><dt>Original source</dt><dd><a href={guide.sourceUrl}>Read at {guide.publisher}<span aria-hidden="true"> ↗</span></a></dd></div>
          </dl>
        </header>
        {guide.headings.length > 0 && <details className="mobile-index"><summary>In this guide</summary><nav aria-label="Guide sections"><HeadingLinks guide={guide} /></nav></details>}
        {guide.warnings.length > 0 && <details className="capture-notes"><summary>Notes about this saved copy</summary><ul>{guide.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
        <div className="article-content" dangerouslySetInnerHTML={{ __html: guide.html }} />
        <div className="article-end"><Link to="/">Back to library</Link><a href="#guide-title">Back to top</a></div>
      </article>
      {guide.headings.length > 0 && <aside className="desktop-index"><nav aria-label="Guide sections"><h2>In this guide</h2><HeadingLinks guide={guide} /></nav></aside>}
    </div>
  </main>;
}

const libraryRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Library });
const guideRoute = createRoute({ getParentRoute: () => rootRoute, path: '/guides/$guideId', component: Guide });
export const router = createRouter({ routeTree: rootRoute.addChildren([libraryRoute, guideRoute]), scrollRestoration: true });
declare module '@tanstack/react-router' { interface Register { router: typeof router } }
