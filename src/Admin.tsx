import { useState } from 'react';

type Post = {
  id: number; slug: string; title: string; summary: string; content: string;
  category: string; status: 'draft' | 'published'; cover_image_url: string | null;
};
type Editor = Omit<Post, 'id'>;
const blank: Editor = { slug: '', title: '', summary: '', content: '', category: 'Notes', status: 'draft', cover_image_url: null };
const endpoint = '/api/admin';

export default function Admin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [auth, setAuth] = useState('');
  const [posts, setPosts] = useState<Post[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Editor>(blank);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function request(path: string, options: RequestInit = {}, credential = auth) {
    const response = await fetch(endpoint + path, {
      ...options,
      headers: { 'Authorization': 'Basic ' + credential, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(response.status === 401 ? 'Invalid username or password.' : `Request failed (HTTP ${response.status})`);
    if (response.status === 204) return null;
    return response.json();
  }
  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const credential = btoa(String.fromCharCode(...new TextEncoder().encode(username + ':' + password)));
      await request('/me', {}, credential);
      const data = await request('/posts', {}, credential);
      setAuth(credential); setPosts(data.items); setPassword('');
    } catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  }
  async function refresh() {
    const data = await request('/posts');
    setPosts(data.items);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const path = editingId === null ? '/posts' : '/posts/' + editingId;
      await request(path, { method: editingId === null ? 'POST' : 'PUT', body: JSON.stringify(form) });
      await refresh(); setMessage('Post saved.'); setForm(blank); setEditingId(null);
    } catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  }
  async function remove(id: number) {
    if (!window.confirm('Delete this post permanently?')) return;
    setBusy(true); setError('');
    try { await request('/posts/' + id, { method: 'DELETE' }); await refresh(); if (editingId === id) { setForm(blank); setEditingId(null); } }
    catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  }
  const field = (key: keyof Editor, value: string) => setForm(prev => ({ ...prev, [key]: value }));
  return <main className="admin-page">
    <header className="admin-header"><a href="/">← Back to blog</a><h1>Blog administration</h1>
      {auth && <button onClick={() => { setAuth(''); setPosts([]); setForm(blank); setEditingId(null); }}>Log out</button>}</header>
    {!auth ? <form onSubmit={login} className="admin-panel"><h2>Sign in</h2>
      <label>Username<input autoComplete="username" required value={username} onChange={e => setUsername(e.target.value)} /></label>
      <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
      <button disabled={busy}>Sign in</button></form> :
      <div className="admin-layout">
        <aside className="admin-panel"><h2>Posts ({posts.length})</h2>
          <button onClick={() => { setForm(blank); setEditingId(null); setMessage(''); }}>+ New post</button>
          {posts.map(post => <div className="admin-post" key={post.id}>
            <div><strong>{post.title}</strong><small>{post.status}</small></div>
            <button onClick={() => { setEditingId(post.id); setForm({ slug: post.slug, title: post.title, summary: post.summary, content: post.content, category: post.category, status: post.status, cover_image_url: post.cover_image_url }); }}>Edit</button>
            <button disabled={busy} onClick={() => remove(post.id)}>Delete</button>
          </div>)}
        </aside>
        <form className="admin-panel admin-editor" onSubmit={save}>
          <h2>{editingId === null ? 'New post' : 'Edit post'}</h2>
          <label>Title<input required maxLength={200} value={form.title} onChange={e => field('title', e.target.value)} /></label>
          <label>Slug (lowercase, hyphens)<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={form.slug} onChange={e => field('slug', e.target.value)} /></label>
          <label>Category<input required maxLength={80} value={form.category} onChange={e => field('category', e.target.value)} /></label>
          <label>Summary<textarea maxLength={500} rows={3} value={form.summary} onChange={e => field('summary', e.target.value)} /></label>
          <label>Content (plain text / Markdown source)<textarea rows={16} maxLength={100000} value={form.content} onChange={e => field('content', e.target.value)} /></label>
          <label>Cover image HTTPS URL (optional)<input value={form.cover_image_url || ''} onChange={e => setForm(prev => ({ ...prev, cover_image_url: e.target.value || null }))} /></label>
          <label>Status<select value={form.status} onChange={e => field('status', e.target.value)}><option value="draft">Draft</option><option value="published">Published</option></select></label>
          <button disabled={busy}>{busy ? 'Saving…' : 'Save post'}</button>
        </form>
      </div>}
    {error && <p role="alert" className="admin-error">{error}</p>}
    {message && <p role="status">{message}</p>}
  </main>;
}
