import { useEffect, useRef, useState } from 'react';

type Article = { id: number; category: string; title: string; description: string; readTime: string; art: string; body: string[] };

// Sample content: replace with your own stories before publishing.
const articles: Article[] = [
  {
    id: 1, category: 'Chuyện thường ngày', title: 'Một buổi sáng chậm hơn thường lệ',
    description: 'Mở cửa sổ, pha một tách cà phê và để ngày mới bắt đầu bằng một khoảng lặng.',
    readTime: '3 phút đọc', art: 'window',
    body: [
      'Bài viết mẫu — một câu chuyện nhỏ để hình dung không gian blog này.',
      'Có những buổi sáng không cần một danh sách việc phải làm thật dài. Chỉ cần mở cửa sổ, ngồi xuống với một tách cà phê và nhìn thành phố thức dậy.',
      'Trong khoảnh khắc ấy, những điều thường bị bỏ qua bỗng trở nên rõ ràng: một vệt nắng trên bàn, tiếng xe ở cuối ngõ, vài trang sách còn đọc dở.',
      'Mình muốn dành góc nhỏ này cho những điều như thế. Những câu chuyện bình thường, được ghi lại trước khi chúng trôi qua.'
    ]
  },
  {
    id: 2, category: 'Công nghệ', title: 'Niềm vui từ một dự án nhỏ tự tay làm',
    description: 'Một ý tưởng, vài dòng code và cảm giác khi thứ mình tạo ra bắt đầu hoạt động.',
    readTime: '4 phút đọc', art: 'code',
    body: [
      'Bài viết mẫu — thay bằng trải nghiệm hoặc dự án của riêng mình.',
      'Một dự án cá nhân có thể bắt đầu bằng một câu hỏi rất nhỏ: liệu mình có thể tự làm một trang để lưu những điều đang học không?',
      'Từ một tiêu đề và vài dòng chữ, mình thêm từng chi tiết: khoảng cách giữa các đoạn, màu của một liên kết, cách trang hiển thị trên điện thoại. Mỗi lựa chọn đều là một dịp để thử và hiểu thêm.',
      'Điều thú vị là không cần đợi đến khi biết hết mới bắt đầu. Một phiên bản nhỏ chạy được đã đủ để tiếp tục học và cải thiện.'
    ]
  },
  {
    id: 3, category: 'Ghi chép', title: 'Những trang sách và vài dòng để nhớ',
    description: 'Không phải một bài review. Chỉ là những ý nghĩ còn ở lại sau khi gấp một cuốn sách.',
    readTime: '3 phút đọc', art: 'notebook',
    body: [
      'Bài viết mẫu — thay bằng ghi chép từ một cuốn sách mình yêu thích.',
      'Đọc xong một cuốn sách, đôi khi mình không nhớ được toàn bộ câu chuyện. Thứ còn lại có thể chỉ là một câu hỏi hoặc một cảm giác khó gọi tên.',
      'Một cuốn sổ nhỏ giúp giữ lại những điều ấy. Không cần tóm tắt từng chương, chỉ cần viết vài dòng: đoạn nào khiến mình dừng lại, điều gì gợi nhớ đến một trải nghiệm cũ.',
      'Khi đọc lại những ghi chép này, mình có thể thấy cả cách suy nghĩ của bản thân đã thay đổi. Cuốn sổ vì thế cũng trở thành một dạng nhật ký.'
    ]
  },
  {
    id: 4, category: 'Đi & khám phá', title: 'Đi một vòng, mang về một câu chuyện',
    description: 'Đôi khi không cần đi thật xa để nhìn một ngày quen thuộc bằng ánh mắt khác.',
    readTime: '2 phút đọc', art: 'sun',
    body: [
      'Bài viết mẫu — thay bằng một chuyến đi hoặc một nơi chốn của riêng mình.',
      'Thử rẽ vào một con đường khác trên lối về, mình có thể bắt gặp một tiệm sách nhỏ, một hàng cây hoặc một quán chưa từng để ý.',
      'Một cuộc đi dạo không có lịch trình để lại chỗ cho những phát hiện tình cờ. Có lúc điều đáng nhớ nhất chỉ là màu trời khi chiều xuống.',
      'Mang về vài tấm ảnh và một câu chuyện ngắn, vậy là đã có thêm một điều để viết. Những chuyến đi nhỏ cũng xứng đáng được lưu lại.'
    ]
  },
];
const categories = ['Tất cả', 'Chuyện thường ngày', 'Công nghệ', 'Ghi chép', 'Đi & khám phá'];
const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

function Art({ kind, hero = false }: { kind: string; hero?: boolean }) {
  return <div className={`art art-${kind} ${hero ? 'art-hero' : ''}`} aria-hidden="true">
    <div className="art-grid" />
    {kind === 'window' && <><div className="morning-window"><div className="window-sun" /><div className="window-hill" /></div><div className="window-sill" /><div className="coffee-cup" /><span className="art-label">MỘT CHÚT BÌNH YÊN.</span><span className="art-spark">✳</span></>}
    {kind === 'code' && <><div className="code-editor"><div className="editor-bar"><i /><i /><i /></div><div className="code-lines"><span /><span /><span /><span /></div><span className="code-brackets">{'</>'}</span></div><span className="art-label">LÀM MỘT ĐIỀU MÌNH THÍCH.</span></>}
    {kind === 'notebook' && <><div className="notebook"><span>đọc một chút,<br />viết vài dòng.</span><i /><i /><i /></div><span className="pencil" /></>}
    {kind === 'sun' && <><div className="sun-circle" /><div className="horizon" /><span className="art-label">ĐI ĐỂ THẤY THÊM.</span></>}
  </div>;
}

export default function App() {
  const [category, setCategory] = useState('Tất cả');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Article | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const visible = articles.filter(article => (category === 'Tất cả' || article.category === category) && normalize(`${article.title} ${article.description}`).includes(normalize(search)));

  useEffect(() => {
    if (selected) { dialog.current?.showModal(); document.body.style.overflow = 'hidden'; }
    else { dialog.current?.close(); document.body.style.overflow = ''; }
    return () => { document.body.style.overflow = ''; };
  }, [selected]);

  return <>
    <header className="header wrapper">
      <a className="logo" href="#" aria-label="Gia Khiem, trang chủ">gk<span>.</span></a>
      <nav aria-label="Điều hướng chính"><a className="nav-active" href="#bai-viet">Bài viết</a><a href="#ve-minh">Về mình <span>↗</span></a></nav>
      <a className="github-link" href="https://github.com/giakhiemdt" target="_blank" rel="noreferrer">GitHub <span>↗</span></a>
    </header>
    <main className="wrapper">
      <section className="intro">
        <div className="eyebrow"><span /> GÓC NHỎ CỦA GIA KHIÊM</div>
        <h1>Chuyện của mình.<br />Vài điều <em>nhỏ bé.</em><span className="heading-star">✳</span></h1>
        <p>Một chút cuộc sống, một chút công nghệ, vài chuyến đi.<br className="desktop-break" /> Mình viết để lưu lại những điều không muốn quên.</p>
        <a className="text-link" href="#bai-viet">Khám phá bài viết <span>↓</span></a>
        <span className="intro-note">Vài dòng ghi chép.<br />Một góc rất riêng.</span>
      </section>
      <section className="featured" aria-label="Bài viết nổi bật">
        <button className="featured-art" onClick={() => setSelected(articles[0])} aria-label={`Đọc ${articles[0].title}`}><Art kind={articles[0].art} hero /></button>
        <div className="featured-copy">
          <div className="eyebrow"><span className="tiny-star">✦</span> BÀI VIẾT NỔI BẬT</div>
          <span className="category-label">{articles[0].category}</span>
          <h2><button onClick={() => setSelected(articles[0])}>{articles[0].title}</button></h2>
          <p>{articles[0].description}</p>
          <div className="featured-bottom"><span className="meta">Bài viết mẫu <span>·</span> {articles[0].readTime}</span><button className="round-arrow" aria-label="Đọc bài viết nổi bật" onClick={() => setSelected(articles[0])}>↗</button></div>
        </div>
      </section>
      <section className="posts-section" id="bai-viet">
        <div className="section-heading"><div><span className="eyebrow muted">CHUYỆN KỂ & GHI CHÉP</span><h2>Những ghi chép mới<span>.</span></h2></div><span className="post-count">{articles.length.toString().padStart(2, '0')} BÀI VIẾT</span></div>
        <div className="toolbar"><div className="filters" role="group" aria-label="Lọc theo chủ đề">{categories.map(item => <button key={item} className={item === category ? 'active' : ''} onClick={() => setCategory(item)} aria-pressed={item === category}>{item}</button>)}</div><label className="search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Tìm bài viết…" aria-label="Tìm bài viết" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
        <div className="posts" aria-live="polite">{visible.map(article => <article className="post" key={article.id}>
          <button className="post-art" onClick={() => setSelected(article)} aria-label={`Đọc ${article.title}`}><Art kind={article.art} /><span className="post-open">↗</span></button>
          <div className="post-meta"><span className="category-label">{article.category}</span><span>{article.readTime}</span></div>
          <h3><button onClick={() => setSelected(article)}>{article.title}</button></h3><p>{article.description}</p><span className="sample-note">Ghi chép mẫu <span>—</span> Gia Khiêm</span>
        </article>)}</div>
        {visible.length === 0 && <div className="empty"><h3>Chưa tìm thấy ghi chép phù hợp.</h3><p>Thử một từ khóa khác nhé.</p><button onClick={() => { setSearch(''); setCategory('Tất cả'); }}>Xem tất cả bài viết ↗</button></div>}
      </section>
      <section className="about" id="ve-minh"><div className="about-mark" aria-hidden="true">gk<span>.</span></div><div><span className="eyebrow muted">PHÍA SAU NHỮNG DÒNG CHỮ</span><h2>Chào, mình là Khiêm<span> 👋</span></h2><p>Đây là không gian cá nhân để mình chia sẻ những điều đang học, những thứ đang làm và những khoảnh khắc muốn giữ lại. Cứ ghé đọc như một cuộc trò chuyện nhỏ nhé.</p><a className="text-link" href="https://github.com/giakhiemdt" target="_blank" rel="noreferrer">Gặp mình trên GitHub <span>↗</span></a></div></section>
    </main>
    <footer className="footer wrapper"><span>© {new Date().getFullYear()} Gia Khiêm<span className="footer-dot">.</span></span><span>Ghi lại một chút, giữ lại thật lâu.</span><a href="#">Lên đầu trang ↑</a></footer>
    <dialog ref={dialog} className="article-dialog" aria-labelledby="article-title" onCancel={() => setSelected(null)} onClick={event => { if (event.target === event.currentTarget) setSelected(null); }} onClose={() => setSelected(null)}>
      {selected && <div className="article-content"><button className="close-dialog" aria-label="Đóng bài viết" autoFocus onClick={() => setSelected(null)}>✕</button><span className="category-label">{selected.category}</span><h2 id="article-title">{selected.title}</h2><div className="meta">Gia Khiêm · {selected.readTime} · Nội dung mẫu</div><Art kind={selected.art} />{selected.body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}<button className="text-link" onClick={() => setSelected(null)}>← Trở lại những ghi chép</button></div>}
    </dialog>
  </>;
}
