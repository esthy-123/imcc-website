let siteData = { profile: null, services: [], posts: [], gallery: [] };
let activeGalleryCategory = 'All';
let filteredGalleryItems = [];
let activeLightboxIndex = -1;
let lastFocusedElement = null;

function isVideoMedia(item) {
  if (!item || !item.image_url) return false;
  if (item.media_type === 'video') return true;
  return /\.(mp4|webm|mov|m4v|ogv|ogg)(\?.*)?$/i.test(item.image_url);
}

function pauseAllPageVideos(exceptEl = null) {
  document.querySelectorAll('video').forEach((video) => {
    if (video !== exceptEl) {
      try {
        video.pause();
      } catch {
        // ignore
      }
    }
  });
}

document.addEventListener(
  'play',
  (event) => {
    if (event.target && event.target.tagName === 'VIDEO') {
      pauseAllPageVideos(event.target);
    }
  },
  true
);

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeUrlForCss(url) {
  const safe = String(url || '').replace(/[\r\n"'()\\]/g, '').trim();
  return safe || '/assets/pdf/hero-mining.jpg';
}

function buildWhatsAppUrl(profile, customText) {
  const digits = (profile.whatsapp || profile.phone || '').replace(/[^\d]/g, '');
  const message = encodeURIComponent(customText || profile.whatsapp_message || 'Hello IMCC');
  return `https://wa.me/${digits}?text=${message}`;
}

function buildTelUrl(profile) {
  const clean = (profile.phone || '').replace(/[^\d+]/g, '');
  return `tel:${clean}`;
}

// Safari/iOS-safe SQLite timestamp parser ('YYYY-MM-DD HH:MM:SS' -> ISO UTC)
function parseSqlDate(raw) {
  if (!raw) return null;
  const normalized =
    typeof raw === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(raw)
      ? `${raw.replace(' ', 'T')}Z`
      : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(iso) {
  if (!iso) return '';
  const parsed = parseSqlDate(iso);
  if (!parsed) return String(iso);
  try {
    return parsed.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch {
    return String(iso);
  }
}

const SOCIAL_ICONS = {
  Instagram:
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>',
  Facebook:
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M14 13.5h2.5l1-4H14v-2c0-1.03 0-2 2-2h1.5V2.14c-.326-.043-1.557-.14-2.857-.14C11.928 2 10 3.657 10 6.7v2.8H7v4h3V22h4v-8.5z"/></svg>',
  LinkedIn:
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M6.94 5a2 2 0 1 1-4-.002 2 2 0 0 1 4 .002zM7 8.48H3V21h4V8.48zm6.32 0H9.34V21h3.94v-6.57c0-3.66 4.77-4 4.77 0V21H22v-7.93c0-6.17-7.06-5.94-8.72-2.91l.04-1.68z"/></svg>',
  TikTok:
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>'
};

function renderProfile(profile) {
  if (!profile) return;

  const logoSrc = profile.logo_url || '/assets/images/logo-imcc.jpg';
  document.title = `${profile.name} (IMCC)`;
  document.getElementById('nav-logo').src = logoSrc;
  document.getElementById('about-logo').src = logoSrc;
  const footerLogo = document.getElementById('footer-logo');
  if (footerLogo) footerLogo.src = logoSrc;

  document.getElementById('hero-title').textContent = profile.name;
  document.getElementById('hero-tagline').textContent = profile.tagline;
  document.getElementById('about-company-name').textContent = profile.name;
  document.getElementById('about-text').textContent = profile.about;
  document.getElementById('vision-text').textContent = profile.vision || '';
  document.getElementById('mission-text').textContent = profile.mission || '';
  document.getElementById('values-text').textContent = profile.values_text || '';
  document.getElementById('footer-company').textContent = profile.name;
  const footerCopy = document.getElementById('footer-company-copy');
  if (footerCopy) footerCopy.textContent = profile.name;
  document.getElementById('footer-year').textContent = new Date().getFullYear();

  const regText = `Reg No: ${profile.reg_no || '—'} • TPIN: ${profile.tpin || '—'}`;
  document.getElementById('hero-reg').textContent = profile.reg_no || 'IMCC';
  document.getElementById('about-legal-ids').textContent = regText;
  document.getElementById('contact-reg').textContent = regText;
  const footerLegal = document.getElementById('footer-legal');
  if (footerLegal) footerLegal.textContent = regText;

  if (profile.hero_image_url) {
    document.getElementById('hero-section').style.backgroundImage = `url('${sanitizeUrlForCss(profile.hero_image_url)}')`;
  }

  // Direct Call & WhatsApp links
  const telUrl = buildTelUrl(profile);
  const waUrl = buildWhatsAppUrl(profile);

  ['hero-call-btn', 'contact-call-card', 'float-call'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.href = telUrl;
  });

  ['nav-whatsapp-btn', 'hero-whatsapp-btn', 'contact-whatsapp-card', 'float-whatsapp'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.href = waUrl;
  });

  document.getElementById('contact-phone-display').textContent = profile.phone;
  const locationText = profile.address || 'Ndola, Zambia';
  document.getElementById('contact-location').textContent = locationText;
  const footerLoc = document.getElementById('footer-location');
  if (footerLoc) footerLoc.textContent = locationText;
  const mapHeadingLoc = document.getElementById('map-heading-location');
  if (mapHeadingLoc) mapHeadingLoc.textContent = locationText;

  const mapLabel = document.getElementById('map-location-label');
  const mapIframe = document.getElementById('company-map-iframe');
  const mapBtn = document.getElementById('map-directions-btn');
  const encodedLocation = encodeURIComponent(locationText);
  if (mapLabel) mapLabel.textContent = locationText;
  if (mapIframe) mapIframe.src = `https://maps.google.com/maps?q=${encodedLocation}&hl=en&t=&z=12&ie=UTF8&iwloc=&output=embed`;
  if (mapBtn) mapBtn.href = `https://www.google.com/maps/search/?api=1&query=${encodedLocation}`;

  const emails = [profile.email, profile.secondary_email].filter(Boolean);
  document.getElementById('contact-emails').innerHTML = emails.length
    ? emails.map((e) => `<a href="mailto:${escapeHtml(e)}">${escapeHtml(e)}</a>`).join(' &bull; ')
    : '—';

  // Social Media: Instagram, Facebook, LinkedIn, TikTok
  const socials = [
    { label: 'Instagram', url: profile.instagram_url },
    { label: 'Facebook', url: profile.facebook_url },
    { label: 'LinkedIn', url: profile.linkedin_url },
    { label: 'TikTok', url: profile.tiktok_url }
  ].filter((s) => s.url && /^https?:\/\//i.test(s.url));

  const socialHtml = socials
    .map(
      (s) =>
        `<a class="social-pill" href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${SOCIAL_ICONS[s.label] || ''}${escapeHtml(s.label)}</a>`
    )
    .join('');

  document.getElementById('hero-socials').innerHTML = socialHtml;
  document.getElementById('contact-socials').innerHTML = socialHtml;
}

function renderServices(services) {
  const grid = document.getElementById('services-grid');
  const visibleServices = services.filter((service) => {
    const text = `${service.category} ${service.title} ${service.description}`.toLowerCase();
    return !text.includes('transport') && !text.includes('security');
  });

  if (!visibleServices.length) {
    grid.innerHTML = '<p class="muted">No services available at the moment.</p>';
    return;
  }

  grid.innerHTML = visibleServices
    .map(
      (s) => `
      <article class="service-card">
        ${s.image_url ? `<img src="${escapeHtml(s.image_url)}" alt="${escapeHtml(s.title)}" class="service-thumb" loading="lazy" />` : ''}
        <div class="service-body">
          <span class="badge">${escapeHtml(s.category)}</span>
          <h3>${escapeHtml(s.title)}</h3>
          <p>${escapeHtml(s.description)}</p>
        </div>
      </article>
    `
    )
    .join('');
}

function renderGallery(gallery) {
  const filtersEl = document.getElementById('gallery-filters');
  const gridEl = document.getElementById('gallery-grid');

  const hasVideos = gallery.some(isVideoMedia);
  const categories = [
    'All',
    ...(hasVideos ? ['Videos'] : []),
    ...new Set(gallery.map((g) => g.category))
  ];
  if (!categories.includes(activeGalleryCategory)) {
    activeGalleryCategory = 'All';
  }

  filtersEl.innerHTML = categories
    .map(
      (cat) => `
      <button
        type="button"
        class="filter-btn ${cat === activeGalleryCategory ? 'active' : ''}"
        aria-pressed="${cat === activeGalleryCategory ? 'true' : 'false'}"
        data-cat="${escapeHtml(cat)}"
      >
        ${escapeHtml(cat)}
      </button>
    `
    )
    .join('');

  filtersEl.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeGalleryCategory = btn.dataset.cat;
      renderGallery(siteData.gallery);
    });
  });

  filteredGalleryItems =
    activeGalleryCategory === 'All'
      ? gallery
      : activeGalleryCategory === 'Videos'
        ? gallery.filter(isVideoMedia)
        : gallery.filter((g) => g.category === activeGalleryCategory);

  if (!filteredGalleryItems.length) {
    gridEl.innerHTML = '<p class="muted">No photos or videos found in this category.</p>';
    return;
  }

  gridEl.innerHTML = filteredGalleryItems
    .map((item, index) => {
      const isVideo = isVideoMedia(item);
      const mediaHtml = isVideo
        ? `
          <video src="${escapeHtml(item.image_url)}#t=0.1" muted playsinline preload="metadata"></video>
          <span class="video-sound-badge" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
            Video
          </span>
          <span class="video-play-overlay" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
          </span>
        `
        : `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" loading="lazy" />`;
      return `
      <button type="button" class="gallery-card" data-gallery-index="${index}" aria-label="${isVideo ? 'Play video' : 'View'} ${escapeHtml(item.title)} full screen">
        <div class="gallery-img-wrap">
          ${mediaHtml}
        </div>
        <div class="gallery-info">
          <span class="badge">${escapeHtml(item.category)}</span>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.caption)}</p>
        </div>
      </button>
    `;
    })
    .join('');

  gridEl.querySelectorAll('.gallery-card').forEach((card) => {
    card.addEventListener('click', () => {
      openLightbox(Number(card.dataset.galleryIndex));
    });
  });
}

function renderPosts(posts) {
  const grid = document.getElementById('posts-grid');
  if (!posts.length) {
    grid.innerHTML = '<p class="muted">No publications available yet.</p>';
    return;
  }

  grid.innerHTML = posts
    .map((post) => {
      const isVideo = isVideoMedia(post);
      const mediaHtml = post.image_url
        ? isVideo
          ? `<video src="${escapeHtml(post.image_url)}#t=0.1" class="post-video" controls playsinline preload="metadata"></video>`
          : `<img src="${escapeHtml(post.image_url)}" alt="${escapeHtml(post.title)}" loading="lazy" />`
        : '';
      return `
      <article class="post-card">
        ${mediaHtml}
        <div class="post-content">
          <span class="badge">${escapeHtml(post.category)}${isVideo ? ' • Video' : ''}</span>
          <h3>${escapeHtml(post.title)}</h3>
          <p>${escapeHtml(post.summary || post.content.slice(0, 140) + '...')}</p>
          <div class="post-footer">
            <span class="muted">${escapeHtml(formatDate(post.created_at))}</span>
            <button type="button" class="btn btn-primary btn-sm read-post-btn" data-id="${post.id}">Read More</button>
          </div>
        </div>
      </article>
    `;
    })
    .join('');

  grid.querySelectorAll('.read-post-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const post = siteData.posts.find((p) => String(p.id) === btn.dataset.id);
      if (post) openPostModal(post);
    });
  });
}

/* ==================== PUBLICATION MODAL ==================== */

function stopVideoElement(videoEl) {
  if (!videoEl) return;
  try {
    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.load();
  } catch {
    // ignore
  }
}

function openPostModal(post) {
  pauseAllPageVideos();
  lastFocusedElement = document.activeElement;
  const modal = document.getElementById('post-modal');
  const img = document.getElementById('modal-img');
  const video = document.getElementById('modal-video');

  if (isVideoMedia(post)) {
    img.classList.add('hidden');
    video.muted = false;
    video.volume = 1;
    video.src = post.image_url;
    video.classList.remove('hidden');
  } else if (post.image_url) {
    stopVideoElement(video);
    video.classList.add('hidden');
    img.src = post.image_url;
    img.alt = post.title;
    img.classList.remove('hidden');
  } else {
    stopVideoElement(video);
    video.classList.add('hidden');
    img.classList.add('hidden');
  }

  document.getElementById('modal-cat').textContent = post.category;
  document.getElementById('modal-title').textContent = post.title;
  document.getElementById('modal-date').textContent = `Published on ${formatDate(post.created_at)}`;
  document.getElementById('modal-body').textContent = post.content;

  if (siteData.profile) {
    document.getElementById('modal-whatsapp').href = buildWhatsAppUrl(
      siteData.profile,
      `Hello IMCC, I am contacting you regarding your publication: "${post.title}".`
    );
    document.getElementById('modal-call').href = buildTelUrl(siteData.profile);
  }

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  document.getElementById('modal-close-btn').focus();
}

function closePostModal() {
  const modal = document.getElementById('post-modal');
  if (!modal.classList.contains('open')) return;
  stopVideoElement(document.getElementById('modal-video'));
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
  }
}

document.getElementById('modal-close-btn').addEventListener('click', closePostModal);
document.getElementById('modal-close-bg').addEventListener('click', closePostModal);

/* ==================== GALLERY LIGHTBOX ==================== */

function updateLightboxContent(autoPlayVideo = false) {
  const item = filteredGalleryItems[activeLightboxIndex];
  if (!item) return;
  const img = document.getElementById('lightbox-img');
  const video = document.getElementById('lightbox-video');

  if (isVideoMedia(item)) {
    img.classList.add('hidden');
    video.classList.remove('hidden');
    video.muted = false;
    video.volume = 1;
    video.src = item.image_url;
    if (autoPlayVideo) {
      video.play().catch(() => {
        // Fallback: user can press Play in the visible video controls
      });
    }
  } else {
    stopVideoElement(video);
    video.classList.add('hidden');
    img.src = item.image_url;
    img.alt = item.title;
    img.classList.remove('hidden');
  }

  document.getElementById('lightbox-cat').textContent = item.category;
  document.getElementById('lightbox-title').textContent = item.title;
  document.getElementById('lightbox-desc').textContent = item.caption || '';

  const showArrows = filteredGalleryItems.length > 1;
  document.getElementById('lightbox-prev').classList.toggle('hidden', !showArrows);
  document.getElementById('lightbox-next').classList.toggle('hidden', !showArrows);
}

function openLightbox(index) {
  if (!filteredGalleryItems.length) return;
  pauseAllPageVideos();
  lastFocusedElement = document.activeElement;
  activeLightboxIndex = ((index % filteredGalleryItems.length) + filteredGalleryItems.length) % filteredGalleryItems.length;
  updateLightboxContent(true);

  const lightbox = document.getElementById('gallery-lightbox');
  lightbox.classList.add('open');
  lightbox.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  document.getElementById('lightbox-close-btn').focus();
}

function closeLightbox() {
  const lightbox = document.getElementById('gallery-lightbox');
  if (!lightbox.classList.contains('open')) return;
  stopVideoElement(document.getElementById('lightbox-video'));
  lightbox.classList.remove('open');
  lightbox.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  activeLightboxIndex = -1;
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
  }
}

function stepLightbox(delta) {
  if (activeLightboxIndex < 0 || !filteredGalleryItems.length) return;
  stopVideoElement(document.getElementById('lightbox-video'));
  activeLightboxIndex =
    (activeLightboxIndex + delta + filteredGalleryItems.length) % filteredGalleryItems.length;
  updateLightboxContent(true);
}

document.getElementById('lightbox-close-btn').addEventListener('click', closeLightbox);
document.getElementById('lightbox-close-bg').addEventListener('click', closeLightbox);
document.getElementById('lightbox-prev').addEventListener('click', () => stepLightbox(-1));
document.getElementById('lightbox-next').addEventListener('click', () => stepLightbox(1));

/* ==================== MOBILE NAVIGATION & KEYBOARD ==================== */

const navToggle = document.getElementById('nav-toggle');
const navLinks = document.getElementById('nav-links');

function setMobileMenu(open) {
  navLinks.classList.toggle('open', open);
  navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  navToggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
  const menuIcon = navToggle.querySelector('.icon-menu');
  const closeIcon = navToggle.querySelector('.icon-close');
  if (menuIcon && closeIcon) {
    menuIcon.classList.toggle('hidden', open);
    closeIcon.classList.toggle('hidden', !open);
  }
}

navToggle.addEventListener('click', () => {
  setMobileMenu(!navLinks.classList.contains('open'));
});

navLinks.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => setMobileMenu(false));
});

document.addEventListener('click', (e) => {
  if (
    navLinks.classList.contains('open') &&
    !navLinks.contains(e.target) &&
    !navToggle.contains(e.target)
  ) {
    setMobileMenu(false);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closePostModal();
    closeLightbox();
    if (navLinks.classList.contains('open')) setMobileMenu(false);
  } else if (activeLightboxIndex >= 0 && e.key === 'ArrowLeft') {
    stepLightbox(-1);
  } else if (activeLightboxIndex >= 0 && e.key === 'ArrowRight') {
    stepLightbox(1);
  }
});

/* ==================== DATA LOADING ==================== */

const errorBanner = document.getElementById('site-error-banner');
document.getElementById('retry-load-btn').addEventListener('click', () => {
  errorBanner.classList.add('hidden');
  loadSite();
});

document.getElementById('footer-year').textContent = new Date().getFullYear();

async function loadSite() {
  try {
    const res = await fetch('/api/public/site');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    siteData = await res.json();
    errorBanner.classList.add('hidden');
    renderProfile(siteData.profile);
    renderServices(siteData.services || []);
    renderGallery(siteData.gallery || []);
    renderPosts(siteData.posts || []);
  } catch (err) {
    console.error('Unable to load IMCC data:', err);
    errorBanner.classList.remove('hidden');
    document.getElementById('services-grid').innerHTML =
      '<p class="muted">Services could not be loaded. Please try again.</p>';
    document.getElementById('gallery-grid').innerHTML =
      '<p class="muted">Portfolio images could not be loaded. Please try again.</p>';
    document.getElementById('posts-grid').innerHTML =
      '<p class="muted">Publications could not be loaded. Please try again.</p>';
  }
}

loadSite();
