import Admin from './Admin';
import './admin.css';
import { useEffect, useRef, useState } from 'react';

type Article = { id: number; category: string; title: string; description: string; readTime: string; art: string; body: string[] };

// Sample content: replace with your own stories before publishing.
const sampleArticles: Article[] = [
  {
    id: 1, category: 'Everyday Life', title: 'A Slower Kind of Morning',
    description: 'Open the window, make a cup of coffee, and let the day begin with a moment of quiet.',
    readTime: '3 min read', art: 'window',
    body: [
      'Sample post — a little story to give you a feel for this blog.',
      'Some mornings do not need a long to-do list. Just open the window, sit down with a coffee, and watch the city wake up.',
      'In those moments, the things we usually overlook come into focus: sunlight on the table, traffic in the distance, and a few unfinished pages.',
      'I want to keep this little corner for moments like these — ordinary stories written down before they slip away.'
    ]
  },
  {
    id: 2, category: 'Technology', title: 'The Joy of Building Something Small',
    description: 'An idea, a few lines of code, and the feeling of seeing something you built come to life.',
    readTime: '4 min read', art: 'code',
    body: [
      'Sample post — replace this with your own experience or project.',
      'A personal project can begin with a simple question: could I build a place to keep track of what I am learning?',
      'Starting with a heading and a few lines of text, I add details one by one: spacing, link colors, and how the page looks on a phone. Every choice is a chance to experiment.',
      'The best part is that you do not have to know everything before you begin. A small working version is enough to keep learning and improving.'
    ]
  },
  {
    id: 3, category: 'Notes', title: 'Pages and Thoughts Worth Keeping',
    description: 'Not quite a review — just the thoughts that stay after closing a book.',
    readTime: '3 min read', art: 'notebook',
    body: [
      'Sample post — replace this with notes from a book you love.',
      'After finishing a book, I may not remember every detail. What remains might be a question or a feeling I cannot quite name.',
      'A small notebook helps preserve those thoughts. No chapter-by-chapter summary needed — just a few lines about what made me pause or reminded me of something.',
      'Reading those notes later shows me how my thinking has changed. In that way, the notebook becomes a kind of journal.'
    ]
  },
  {
    id: 4, category: 'Travel & Discovery', title: 'Take a Walk, Bring Back a Story',
    description: 'Sometimes you do not have to go far to see a familiar day differently.',
    readTime: '2 min read', art: 'sun',
    body: [
      'Sample post — replace this with a trip or a place of your own.',
      'Taking a different road home might lead to a tiny bookstore, a row of trees, or a café I have never noticed.',
      'A walk without a schedule leaves room for unexpected discoveries. Sometimes the most memorable thing is simply the evening sky.',
      'A few photos and a short story are enough to bring home. Even small adventures deserve to be remembered.'
    ]
  },
];
const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

function Art({ kind, hero = false }: { kind: string; hero?: boolean }) {
  return <div className={`art art-${kind} ${hero ? 'art-hero' : ''}`} aria-hidden="true">
    <div className="art-grid" />
    {kind === 'window' && <><div className="morning-window"><div className="window-sun" /><div className="window-hill" /></div><div className="window-sill" /><div className="coffee-cup" /><span className="art-label">A LITTLE PEACE.</span><span className="art-spark">✳</span></>}
    {kind === 'code' && <><div className="code-editor"><div className="editor-bar"><i /><i /><i /></div><div className="code-lines"><span /><span /><span /><span /></div><span className="code-brackets">{'</>'}</span></div><span className="art-label">MAKE SOMETHING YOU LOVE.</span></>}
    {kind === 'notebook' && <><div className="notebook"><span>read a little,<br />write a little.</span><i /><i /><i /></div><span className="pencil" /></>}
    {kind === 'sun' && <><div className="sun-circle" /><div className="horizon" /><span className="art-label">GO AND DISCOVER.</span></>}
  </div>;
}

export default function App() {
  const [articles, setArticles] = useState<Article[]>(sampleArticles);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Article | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const activeCategories = ['All', ...new Set(articles.map(article => article.category))];
  const visible = articles.filter(article => (category === 'All' || article.category === category) && normalize(`${article.title} ${article.description}`).includes(normalize(search)));

  useEffect(() => {
    if (window.location.pathname.startsWith('/admin')) return;
    const controller = new AbortController();
    fetch('/api/posts?limit=100', { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('API unavailable'); return response.json(); })
      .then(data => {
        if (!Array.isArray(data.items)) return;
        setArticles(data.items.map((post: { id: number; slug: string; title: string; summary: string; category: string; }) => ({
          id: post.id, title: post.title, description: post.summary, category: post.category,
          readTime: 'Read article', art: 'notebook', body: [], slug: post.slug,
        })));
      })
      .catch(() => { /* Keep sample posts until backend is deployed. */ });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (selected) { dialog.current?.showModal(); document.body.style.overflow = 'hidden'; }
    else { dialog.current?.close(); document.body.style.overflow = ''; }
    return () => { document.body.style.overflow = ''; };
  }, [selected]);

  if (window.location.pathname.startsWith('/admin')) return <Admin />;
  if (articles.length === 0) return <main className="wrapper"><header className="header"><a href="/">gk.</a></header><h1>Stories coming soon.</h1><p>New posts will appear here when published.</p></main>;

  async function openArticle(article: Article) {
    const slug = (article as Article & { slug?: string }).slug;
    if (!slug) { setSelected(article); return; }
    try {
      const response = await fetch('/api/posts/' + encodeURIComponent(slug));
      if (!response.ok) throw new Error('Unable to load article');
      const post = await response.json();
      setSelected({ ...article, body: [post.content] });
    } catch { setSelected(article); }
  }

  return <>
    <header className="header wrapper">
      <a className="logo" href="#" aria-label="Gia Khiem, home">gk<span>.</span></a>
      <nav aria-label="Main navigation"><a className="nav-active" href="#articles">Articles</a><a href="#about">About <span>↗</span></a></nav>
      <a className="github-link" href="https://github.com/giakhiemdt" target="_blank" rel="noreferrer">GitHub <span>↗</span></a>
    </header>
    <main className="wrapper">
      <section className="intro">
        <div className="eyebrow"><span /> GIA KHIEM'S LITTLE CORNER</div>
        <h1>My stories.<br />The <em>little things.</em><span className="heading-star">✳</span></h1>
        <p>A little life, a little technology, and a few adventures.<br className="desktop-break" /> I write to remember the things that matter.</p>
        <a className="text-link" href="#articles">Explore the stories <span>↓</span></a>
        <span className="intro-note">A few thoughts.<br />A space of my own.</span>
      </section>
      <section className="featured" aria-label="Featured story">
        <button className="featured-art" onClick={() => openArticle(articles[0])} aria-label={`Read ${articles[0].title}`}><Art kind={articles[0].art} hero /></button>
        <div className="featured-copy">
          <div className="eyebrow"><span className="tiny-star">✦</span> FEATURED STORY</div>
          <span className="category-label">{articles[0].category}</span>
          <h2><button onClick={() => openArticle(articles[0])}>{articles[0].title}</button></h2>
          <p>{articles[0].description}</p>
          <div className="featured-bottom"><span className="meta">Sample post <span>·</span> {articles[0].readTime}</span><button className="round-arrow" aria-label="Read featured story" onClick={() => openArticle(articles[0])}>↗</button></div>
        </div>
      </section>
      <section className="posts-section" id="articles">
        <div className="section-heading"><div><span className="eyebrow muted">STORIES & NOTES</span><h2>Latest stories<span>.</span></h2></div><span className="post-count">{articles.length.toString().padStart(2, '0')} POSTS</span></div>
        <div className="toolbar"><div className="filters" role="group" aria-label="Filter by topic">{activeCategories.map(item => <button key={item} className={item === category ? 'active' : ''} onClick={() => setCategory(item)} aria-pressed={item === category}>{item}</button>)}</div><label className="search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search stories…" aria-label="Search stories" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
        <div className="posts" aria-live="polite">{visible.map(article => <article className="post" key={article.id}>
          <button className="post-art" onClick={() => openArticle(article)} aria-label={`Read ${article.title}`}><Art kind={article.art} /><span className="post-open">↗</span></button>
          <div className="post-meta"><span className="category-label">{article.category}</span><span>{article.readTime}</span></div>
          <h3><button onClick={() => openArticle(article)}>{article.title}</button></h3><p>{article.description}</p><span className="sample-note">Sample story <span>—</span> Gia Khiêm</span>
        </article>)}</div>
        {visible.length === 0 && <div className="empty"><h3>No matching stories found.</h3><p>Try another search term.</p><button onClick={() => { setSearch(''); setCategory('All'); }}>View all stories ↗</button></div>}
      </section>
      <section className="about" id="about"><div className="about-mark" aria-hidden="true">gk<span>.</span></div><div><span className="eyebrow muted">BEHIND THE WORDS</span><h2>Hi, I'm Khiem<span> 👋</span></h2><p>This is my personal space for sharing what I am learning, what I am building, and the moments I want to remember. Feel free to stay and explore.</p><a className="text-link" href="https://github.com/giakhiemdt" target="_blank" rel="noreferrer">Find me on GitHub <span>↗</span></a></div></section>
    </main>
    <footer className="footer wrapper"><span>© {new Date().getFullYear()} Gia Khiêm<span className="footer-dot">.</span></span><span>Small moments, lasting memories.</span><a href="#">Back to top ↑</a></footer>
    <dialog ref={dialog} className="article-dialog" aria-labelledby="article-title" onCancel={() => setSelected(null)} onClick={event => { if (event.target === event.currentTarget) setSelected(null); }} onClose={() => setSelected(null)}>
      {selected && <div className="article-content"><button className="close-dialog" aria-label="Close article" autoFocus onClick={() => setSelected(null)}>✕</button><span className="category-label">{selected.category}</span><h2 id="article-title">{selected.title}</h2><div className="meta">Gia Khiêm · {selected.readTime} · Sample content</div><Art kind={selected.art} />{selected.body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}<button className="text-link" onClick={() => setSelected(null)}>← Back to stories</button></div>}
    </dialog>
  </>;
}
