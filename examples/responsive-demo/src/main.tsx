import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function Demo() {
  const [repaired, setRepaired] = useState(false);
  return (
    <main className="workspace">
      <header id="protected-header" className="site-header">
        <a className="wordmark" href="#root">
          Fieldnotes
          <span className="wordmark-dot" aria-hidden="true">
            ●
          </span>
        </a>
        <span className="edition">设计与生活 / VOL. 008</span>
      </header>

      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">WEB ANNOTATOR · LIVE DEMO</p>
        <h1 id="page-title">
          一处修改，
          <br />
          也照顾其他地方。
        </h1>
        <p className="lede">
          这是一张用于验收的真实页面：手机上的固定宽度卡片需要修复，页眉需要保留，横向作品集可以正常滚动。
        </p>
      </section>

      <section className="review-controls" aria-label="示例操作">
        <div>
          <span className={`status-dot ${repaired ? 'good' : ''}`} aria-hidden="true" />
          <strong>{repaired ? '已应用示例修复' : '等待检查手机布局'}</strong>
          <p>
            在 Harness 的批注网页里用 390 px 视口点选下方卡片并写下要求，再点选页眉说明需要保留。
          </p>
        </div>
        <button
          id="repair-toggle"
          type="button"
          aria-pressed={repaired}
          onClick={() => setRepaired((value) => !value)}
        >
          {repaired ? '还原布局问题' : '应用示例修复'}
          <span aria-hidden="true">↗</span>
        </button>
      </section>

      <section className="feature-section" aria-labelledby="feature-title">
        <div className="section-heading">
          <h2 id="feature-title">本周精选</h2>
          <span>01 / FEATURED</span>
        </div>
        <article id="mobile-card" className={`feature-card ${repaired ? 'repaired' : ''}`}>
          <div className="card-art" aria-hidden="true">
            <span className="art-circle" />
            <span className="art-frame" />
            <span className="art-line" />
          </div>
          <div className="card-body">
            <p className="eyebrow">SPACES / 城市与空间</p>
            <h3>让小空间，也有呼吸感。</h3>
            <p>光线、留白与日常物件之间的距离，构成了一个可以慢下来的地方。</p>
            <a href="#collection">
              阅读这篇记录 <span aria-hidden="true">↗</span>
            </a>
          </div>
        </article>
        <p className="demo-note">
          这张卡片初始宽度为 560 px。修复仅改变卡片宽度规则，页眉保持原样。
        </p>
      </section>

      <section id="collection" className="collection-section" aria-labelledby="collection-title">
        <div className="section-heading">
          <h2 id="collection-title">可以横向浏览的作品集</h2>
          <span>02 / COLLECTION</span>
        </div>
        <div
          id="intentional-carousel"
          className="carousel"
          tabIndex={0}
          aria-label="作品集，可横向滚动"
        >
          {[
            ['01', '光的形状', 'warm'],
            ['02', '窗边的下午', 'green'],
            ['03', '安静的秩序', 'blue'],
            ['04', '日常的纹理', 'pink'],
          ].map(([number, title, tone]) => (
            <article key={number} className={`collection-card ${tone}`}>
              <span className="collection-number">{number}</span>
              <div className="mini-art" aria-hidden="true" />
              <h3>{title}</h3>
            </article>
          ))}
        </div>
        <p className="demo-note">
          这里有意使用 overflow-x: auto，应保留横向滚动，而非当作页面越界修复。
        </p>
      </section>
      <footer>
        FIELDNOTES <span>Built for careful changes.</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Demo />);
