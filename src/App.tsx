import { useEffect, useRef, useState } from 'react';

type Article = { id: number; category: string; title: string; description: string; readTime: string; art: string; body: string[] };

// Replace these sample articles with your own writing.
const articles: Article[] = [
  { id: 1, category: 'Tư duy tài chính', title: 'Tự do tài chính bắt đầu từ những điều rất nhỏ', description: 'Không phải một con số thật lớn. Đôi khi, đó là việc hiểu rõ tiền của mình đang đi đâu.', readTime: '4 phút đọc', art: 'steps', body: ['Bài viết mẫu — có thể thay nội dung trong src/App.tsx.', 'Một khởi đầu đơn giản là ghi lại những khoản thu và chi trong một tháng. Chưa cần thay đổi điều gì, chỉ cần quan sát để hiểu thói quen của bản thân.', 'Sau đó, chọn một thay đổi nhỏ có thể duy trì: dành riêng một khoản tiết kiệm, xem lại một dịch vụ ít dùng, hoặc đặt giới hạn cho một nhóm chi tiêu.', 'Với mình, tự do còn là có thêm khoảng trống để lựa chọn. Và những thói quen nhỏ là một nơi hợp lý để bắt đầu.'] },
  { id: 2, category: 'Đầu tư', title: 'Lãi kép: khi thời gian trở thành người đồng hành', description: 'Một góc nhìn chậm rãi về tích lũy, sự kiên nhẫn và sức mạnh của việc bắt đầu.', readTime: '3 phút đọc', art: 'growth', body: ['Bài viết mẫu — dùng để minh họa giao diện, không phải khuyến nghị đầu tư.', 'Lãi kép là quá trình lợi nhuận được giữ lại cùng với vốn ban đầu. Nếu tiếp tục tạo ra lợi nhuận, phần tích lũy đó cũng có thể góp phần vào kết quả của kỳ tiếp theo.', 'Trong thực tế, lợi nhuận không cố định và khoản đầu tư có thể giảm giá. Một đường cong minh họa không thể thể hiện đầy đủ những biến động này.', 'Điều đáng suy nghĩ là thời gian, chi phí, mức độ rủi ro và khả năng duy trì kế hoạch phù hợp với hoàn cảnh của mình.'] },
  { id: 3, category: 'Tài chính cá nhân', title: 'Một cuốn sổ nhỏ cho những khoản chi lớn', description: 'Ghi chép chi tiêu để hiểu mình hơn, thay vì biến cuộc sống thành một bảng tính.', readTime: '3 phút đọc', art: 'notebook', body: ['Bài viết mẫu — có thể thay nội dung trong src/App.tsx.', 'Một cuốn sổ chi tiêu có thể bắt đầu chỉ với ba cột: ngày, khoản chi và lý do. Ghi ngắn gọn để việc này không trở thành gánh nặng.', 'Cuối tuần, dành một chút thời gian xem lại. Khoản nào mang lại giá trị? Khoản nào xuất phát từ sự tiện tay? Mục tiêu là hiểu, không phải tự trách.', 'Sau vài tuần, những ghi chép này có thể giúp mình chọn một ngân sách gần với cuộc sống thực tế hơn.'] },
  { id: 4, category: 'Chuyện cuộc sống', title: 'Đủ là khi mình biết điều gì quan trọng', description: 'Về những lựa chọn, một nhịp sống vừa vặn và định nghĩa thành công của riêng mình.', readTime: '2 phút đọc', art: 'sun', body: ['Bài viết mẫu — có thể thay nội dung trong src/App.tsx.', 'Có những ngày mình nhận ra điều muốn có thêm không hẳn là đồ vật. Đó có thể là một buổi sáng thong thả, một cuộc trò chuyện dài hoặc thời gian cho một sở thích.', 'Viết ra những điều quan trọng giúp mình nhìn các lựa chọn tiền bạc rõ hơn: khoản chi này có phục vụ cuộc sống mình muốn hay chỉ là một thói quen?', 'Câu trả lời không cần giống ai. Và nó cũng có thể thay đổi theo từng giai đoạn.'] },
];
const categories = ['Tất cả', 'Tài chính cá nhân', 'Đầu tư', 'Tư duy tài chính', 'Chuyện cuộc sống'];
const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

function Art({ kind, hero = false }: { kind: string; hero?: boolean }) {
  return <div className={`art art-${kind} ${hero ? 'art-hero' : ''}`} aria-hidden="true">
    <div className="art-grid" />
    {kind === 'steps' && <><div className="orb" /><div className="stairs"><i /><i /><i /><i /></div><span className="art-label">TỪNG BƯỚC MỘT.</span><span className="art-spark">✳</span></>}
    {kind === 'growth' && <><svg viewBox="0 0 400 220"><path d="M45 180 C140 185 240 140 345 35" /><path d="m315 37 30-2-1 30" /></svg><span className="art-label">ĐỂ THỜI GIAN LÀM VIỆC.</span><div className="growth-dot" /></>}
    {kind === 'notebook' && <><div className="notebook"><span>ít hơn,<br />nhưng tốt hơn.</span><i /><i /><i /></div><span className="pencil" /></>}
    {kind === 'sun' && <><div className="sun-circle" /><div className="horizon" /><span className="art-label">MỘT NHỊP SỐNG VỪA ĐỦ.</span></>}
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
        <h1>Hiểu về tiền.<br />Sống <em>thảnh thơi.</em><span className="heading-star">✳</span></h1>
        <p>Ghi chép về tài chính, đầu tư và những điều giản đơn.<br className="desktop-break" /> Cùng học, cùng suy ngẫm, mỗi ngày một chút.</p>
        <a className="text-link" href="#bai-viet">Khám phá bài viết <span>↓</span></a>
        <span className="intro-note">Một góc nhìn cá nhân.<br />Một hành trình dài hạn.</span>
      </section>
      <section className="featured" aria-label="Bài viết nổi bật">
        <button className="featured-art" onClick={() => setSelected(articles[0])} aria-label={`Đọc ${articles[0].title}`}><Art kind="steps" hero /></button>
        <div className="featured-copy">
          <div className="eyebrow"><span className="tiny-star">✦</span> BÀI VIẾT NỔI BẬT</div>
          <span className="category-label">{articles[0].category}</span>
          <h2><button onClick={() => setSelected(articles[0])}>{articles[0].title}</button></h2>
          <p>{articles[0].description}</p>
          <div className="featured-bottom"><span className="meta">Bài viết mẫu <span>·</span> {articles[0].readTime}</span><button className="round-arrow" aria-label="Đọc bài viết nổi bật" onClick={() => setSelected(articles[0])}>↗</button></div>
        </div>
      </section>
      <section className="posts-section" id="bai-viet">
        <div className="section-heading"><div><span className="eyebrow muted">ĐỌC & SUY NGẪM</span><h2>Những ghi chép mới<span>.</span></h2></div><span className="post-count">{articles.length.toString().padStart(2, '0')} BÀI VIẾT</span></div>
        <div className="toolbar"><div className="filters" role="group" aria-label="Lọc theo chủ đề">{categories.map(item => <button key={item} className={item === category ? 'active' : ''} onClick={() => setCategory(item)} aria-pressed={item === category}>{item}</button>)}</div><label className="search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Tìm bài viết…" aria-label="Tìm bài viết" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
        <div className="posts" aria-live="polite">{visible.map(article => <article className="post" key={article.id}>
          <button className="post-art" onClick={() => setSelected(article)} aria-label={`Đọc ${article.title}`}><Art kind={article.art} /><span className="post-open">↗</span></button>
          <div className="post-meta"><span className="category-label">{article.category}</span><span>{article.readTime}</span></div>
          <h3><button onClick={() => setSelected(article)}>{article.title}</button></h3><p>{article.description}</p><span className="sample-note">Ghi chép mẫu <span>—</span> Gia Khiêm</span>
        </article>)}</div>
        {visible.length === 0 && <div className="empty"><h3>Chưa tìm thấy ghi chép phù hợp.</h3><p>Thử một từ khóa khác nhé.</p><button onClick={() => { setSearch(''); setCategory('Tất cả'); }}>Xem tất cả bài viết ↗</button></div>}
      </section>
      <section className="about" id="ve-minh"><div className="about-mark" aria-hidden="true">gk<span>.</span></div><div><span className="eyebrow muted">PHÍA SAU NHỮNG DÒNG CHỮ</span><h2>Chào, mình là Khiêm<span> 👋</span></h2><p>Đây là góc nhỏ để mình ghi lại những gì đang học về tiền bạc và cuộc sống. Không có công thức hoàn hảo, chỉ có những góc nhìn để cùng suy ngẫm.</p><a className="text-link" href="https://github.com/giakhiemdt" target="_blank" rel="noreferrer">Gặp mình trên GitHub <span>↗</span></a></div></section>
    </main>
    <footer className="footer wrapper"><span>© {new Date().getFullYear()} Gia Khiêm<span className="footer-dot">.</span></span><span>Viết chậm. Nghĩ sâu. Sống đủ.</span><a href="#">Lên đầu trang ↑</a></footer>
    <dialog ref={dialog} className="article-dialog" aria-labelledby="article-title" onCancel={() => setSelected(null)} onClick={event => { if (event.target === event.currentTarget) setSelected(null); }} onClose={() => setSelected(null)}>
      {selected && <div className="article-content"><button className="close-dialog" aria-label="Đóng bài viết" autoFocus onClick={() => setSelected(null)}>✕</button><span className="category-label">{selected.category}</span><h2 id="article-title">{selected.title}</h2><div className="meta">Gia Khiêm · {selected.readTime} · Nội dung mẫu</div><Art kind={selected.art} />{selected.body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}<button className="text-link" onClick={() => setSelected(null)}>← Trở lại những ghi chép</button></div>}
    </dialog>
  </>;
}
