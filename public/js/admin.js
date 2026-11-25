const TOKEN_KEY = 'imcc_chef_token';
let postsCache = [];
let galleryCache = [];
let servicesCache = [];
let toastTimer = null;

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isVideoMedia(item) {
  if (!item || !item.image_url) return false;
  if (item.media_type === 'video') return true;
  return /\.(mp4|webm|mov|m4v|ogv|ogg)(\?.*)?$/i.test(item.image_url);
}

function pauseAllAdminVideos() {
  document.querySelectorAll('#dashboard-screen video').forEach((v) => {
    try {
      v.pause();
    } catch {
      // ignore
    }
  });
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.toggle('error', isError);
  toast.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3400);
}

async function withBusyButton(btn, busyText, fn) {
  if (!btn) return fn();
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = busyText;
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function apiFetch(url, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
    throw new Error(data.error || 'Session expired. Please sign in again.');
  }
  if (!res.ok) {
    throw new Error(data.error || 'An error occurred.');
  }
  return data;
}

function apiUploadWithProgress(url, method, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    if (xhr.upload && typeof onProgress === 'function') {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
        }
      };
    }

    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText || '{}');
      } catch {
        data = {};
      }
      if (xhr.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        showLogin();
        reject(new Error(data.error || 'Session expired. Please sign in again.'));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        reject(new Error(data.error || 'An error occurred during upload.'));
      }
    };

    xhr.onerror = () => reject(new Error('Network error while uploading file.'));
    xhr.onabort = () => reject(new Error('Upload cancelled.'));
    xhr.send(formData);
  });
}

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('dashboard-screen').classList.add('hidden');
}

function showDashboard(chef) {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('dashboard-screen').classList.remove('hidden');
  if (chef) {
    document.getElementById('chef-name-display').textContent = chef.name || chef.email;
  }
}

/* ==================== AUTHENTICATION ==================== */

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit-btn');
  errEl.classList.add('hidden');

  await withBusyButton(submitBtn, 'Signing in...', async () => {
    try {
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      localStorage.setItem(TOKEN_KEY, data.token);
      document.getElementById('login-password').value = '';
      showDashboard(data.chef);
      await loadAllAdminData();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
});

document.getElementById('logout-btn').addEventListener('click', () => {
  pauseAllAdminVideos();
  localStorage.removeItem(TOKEN_KEY);
  showLogin();
});

/* ==================== TAB NAVIGATION ==================== */

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    pauseAllAdminVideos();
    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.remove('active');
      b.removeAttribute('aria-current');
    });
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    btn.setAttribute('aria-current', 'page');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

/* ==================== PUBLICATIONS ==================== */

async function loadPosts() {
  postsCache = await apiFetch('/api/admin/posts');
  const list = document.getElementById('admin-posts-list');
  if (!postsCache.length) {
    list.innerHTML = '<p class="muted">No publications found.</p>';
    return;
  }

  list.innerHTML = postsCache
    .map(
      (p) => {
        const isVideo = isVideoMedia(p);
        const mediaMarkup = p.image_url
          ? isVideo
            ? `<video src="${escapeHtml(p.image_url)}#t=0.1" class="item-thumb item-thumb-video" muted playsinline preload="metadata"></video>`
            : `<img src="${escapeHtml(p.image_url)}" class="item-thumb" alt="${escapeHtml(p.title)}" loading="lazy" />`
          : '<div class="item-thumb" aria-hidden="true"></div>';
        return `
      <div class="item-row">
        <div class="item-left">
          ${mediaMarkup}
          <div>
            <strong>${escapeHtml(p.title)}</strong>
            <div class="muted">
              ${escapeHtml(p.category)} &bull;
              <span class="status-pill ${p.is_published ? 'status-live' : 'status-draft'}">
                ${p.is_published ? 'Published' : 'Unpublished'}
              </span>
              ${isVideo ? '<span class="status-pill status-video">Video</span>' : ''}
            </div>
          </div>
        </div>
        <div class="item-actions">
          <button type="button" class="btn btn-outline btn-sm" data-post-action="edit" data-id="${p.id}">Edit</button>
          <button type="button" class="btn btn-warn btn-sm" data-post-action="toggle" data-id="${p.id}">${p.is_published ? 'Unpublish' : 'Publish'}</button>
          <button type="button" class="btn btn-danger btn-sm" data-post-action="delete" data-id="${p.id}">Delete</button>
        </div>
      </div>
    `;
      }
    )
    .join('');
}

document.getElementById('admin-posts-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-post-action]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const action = btn.dataset.postAction;

  if (action === 'edit') {
    const p = postsCache.find((x) => x.id === id);
    if (!p) return;
    document.getElementById('post-id').value = p.id;
    document.getElementById('post-title').value = p.title;
    document.getElementById('post-category').value = p.category;
    document.getElementById('post-summary').value = p.summary || '';
    document.getElementById('post-content').value = p.content;
    document.getElementById('post-published').checked = Boolean(p.is_published);
    document.getElementById('post-remove-image').checked = false;
    document.getElementById('post-remove-img-row').classList.toggle('hidden', !p.image_url);
    document.getElementById('post-submit-btn').textContent = 'Update Publication';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (action === 'toggle') {
    try {
      const res = await apiFetch(`/api/admin/posts/${id}/toggle`, { method: 'PATCH' });
      showToast(res.message);
      await loadPosts();
    } catch (err) {
      showToast(err.message, true);
    }
  } else if (action === 'delete') {
    if (!confirm('Permanently delete this publication?')) return;
    try {
      const res = await apiFetch(`/api/admin/posts/${id}`, { method: 'DELETE' });
      showToast(res.message);
      await loadPosts();
    } catch (err) {
      showToast(err.message, true);
    }
  }
});

function resetPostForm() {
  document.getElementById('post-form').reset();
  document.getElementById('post-id').value = '';
  document.getElementById('post-published').checked = true;
  document.getElementById('post-remove-image').checked = false;
  document.getElementById('post-remove-img-row').classList.add('hidden');
  document.getElementById('post-submit-btn').textContent = 'Save Publication';
}

document.getElementById('reset-post-form-btn').addEventListener('click', resetPostForm);

document.getElementById('post-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('post-submit-btn');
  await withBusyButton(btn, 'Saving...', async () => {
    try {
      const id = document.getElementById('post-id').value;
      const fd = new FormData();
      fd.append('title', document.getElementById('post-title').value.trim());
      fd.append('category', document.getElementById('post-category').value);
      fd.append('summary', document.getElementById('post-summary').value.trim());
      fd.append('content', document.getElementById('post-content').value.trim());
      fd.append('is_published', document.getElementById('post-published').checked ? '1' : '0');
      if (id && document.getElementById('post-remove-image').checked) {
        fd.append('remove_image', '1');
      }
      const file = document.getElementById('post-image').files[0];
      if (file) fd.append('media', file);

      const url = id ? `/api/admin/posts/${id}` : '/api/admin/posts';
      const method = id ? 'PUT' : 'POST';
      const res = await apiUploadWithProgress(url, method, fd, (pct) => {
        if (file) btn.textContent = pct < 100 ? `Uploading ${pct}%...` : 'Processing...';
      });
      showToast(res.message);
      resetPostForm();
      await loadPosts();
    } catch (err) {
      showToast(err.message, true);
    }
  });
});

/* ==================== GALLERY (PHOTOS & VIDEOS) ==================== */

async function loadGallery() {
  galleryCache = await apiFetch('/api/admin/gallery');
  const list = document.getElementById('admin-gallery-list');
  if (!galleryCache.length) {
    list.innerHTML = '<p class="muted">No gallery photos or videos yet.</p>';
    return;
  }

  list.innerHTML = galleryCache
    .map(
      (g) => {
        const isVideo = isVideoMedia(g);
        const mediaEl = isVideo
          ? `<video src="${escapeHtml(g.image_url)}" class="gallery-admin-video" controls playsinline preload="metadata"></video>`
          : `<img src="${escapeHtml(g.image_url)}" alt="${escapeHtml(g.title)}" loading="lazy" />`;
        return `
      <div class="gallery-admin-card">
        ${mediaEl}
        <div class="gallery-admin-body">
          <strong>${escapeHtml(g.title)}</strong>
          <div class="muted">
            ${escapeHtml(g.category)}
            ${isVideo ? ' &bull; <span class="status-pill status-video">Video with Sound</span>' : ''}
          </div>
          <div class="item-actions">
            <button type="button" class="btn btn-outline btn-sm" data-gallery-action="edit" data-id="${g.id}">Edit / Replace</button>
            <button type="button" class="btn btn-danger btn-sm" data-gallery-action="delete" data-id="${g.id}">Delete</button>
          </div>
        </div>
      </div>
    `;
      }
    )
    .join('');
}

document.getElementById('admin-gallery-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-gallery-action]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const action = btn.dataset.galleryAction;

  if (action === 'edit') {
    const g = galleryCache.find((x) => x.id === id);
    if (!g) return;
    document.getElementById('gallery-id').value = g.id;
    document.getElementById('gallery-title').value = g.title;
    document.getElementById('gallery-category').value = g.category;
    document.getElementById('gallery-caption').value = g.caption || '';
    document.getElementById('gallery-submit-btn').textContent = 'Update Media';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (action === 'delete') {
    if (!confirm('Delete this photo or video from the gallery?')) return;
    try {
      const res = await apiFetch(`/api/admin/gallery/${id}`, { method: 'DELETE' });
      showToast(res.message);
      await loadGallery();
    } catch (err) {
      showToast(err.message, true);
    }
  }
});

function resetGalleryForm() {
  document.getElementById('gallery-form').reset();
  document.getElementById('gallery-id').value = '';
  document.getElementById('gallery-submit-btn').textContent = 'Save Media';
}

document.getElementById('reset-gallery-form-btn').addEventListener('click', resetGalleryForm);

document.getElementById('gallery-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('gallery-submit-btn');
  await withBusyButton(btn, 'Uploading...', async () => {
    try {
      const id = document.getElementById('gallery-id').value;
      const fd = new FormData();
      fd.append('title', document.getElementById('gallery-title').value.trim());
      fd.append('category', document.getElementById('gallery-category').value);
      fd.append('caption', document.getElementById('gallery-caption').value.trim());
      const file = document.getElementById('gallery-image').files[0];
      if (file) fd.append('media', file);

      const url = id ? `/api/admin/gallery/${id}` : '/api/admin/gallery';
      const method = id ? 'PUT' : 'POST';
      const res = await apiUploadWithProgress(url, method, fd, (pct) => {
        if (file) btn.textContent = pct < 100 ? `Uploading ${pct}%...` : 'Processing...';
      });
      showToast(res.message);
      resetGalleryForm();
      await loadGallery();
    } catch (err) {
      showToast(err.message, true);
    }
  });
});

/* ==================== PROFILE & LOGO ==================== */

async function loadProfile() {
  const p = await apiFetch('/api/admin/profile');
  if (!p) return;

  document.getElementById('sidebar-logo').src = p.logo_url;
  document.getElementById('preview-logo').src = p.logo_url;
  if (p.hero_image_url) document.getElementById('preview-hero').src = p.hero_image_url;

  document.getElementById('prof-name').value = p.name || '';
  document.getElementById('prof-tagline').value = p.tagline || '';
  document.getElementById('prof-about').value = p.about || '';
  document.getElementById('prof-vision').value = p.vision || '';
  document.getElementById('prof-mission').value = p.mission || '';
  document.getElementById('prof-values').value = p.values_text || '';
  document.getElementById('prof-phone').value = p.phone || '';
  document.getElementById('prof-whatsapp').value = p.whatsapp || '';
  document.getElementById('prof-wa-msg').value = p.whatsapp_message || '';
  document.getElementById('prof-email').value = p.email || '';
  document.getElementById('prof-email2').value = p.secondary_email || '';
  document.getElementById('prof-reg').value = p.reg_no || '';
  document.getElementById('prof-tpin').value = p.tpin || '';
  document.getElementById('prof-location').value = p.address || '';
  document.getElementById('prof-instagram').value = p.instagram_url || '';
  document.getElementById('prof-facebook').value = p.facebook_url || '';
  document.getElementById('prof-linkedin').value = p.linkedin_url || '';
  document.getElementById('prof-tiktok').value = p.tiktok_url || '';
}

document.getElementById('profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('profile-submit-btn');
  await withBusyButton(btn, 'Saving...', async () => {
    try {
      const payload = {
        name: document.getElementById('prof-name').value,
        tagline: document.getElementById('prof-tagline').value,
        about: document.getElementById('prof-about').value,
        vision: document.getElementById('prof-vision').value,
        mission: document.getElementById('prof-mission').value,
        values_text: document.getElementById('prof-values').value,
        phone: document.getElementById('prof-phone').value,
        whatsapp: document.getElementById('prof-whatsapp').value,
        whatsapp_message: document.getElementById('prof-wa-msg').value,
        email: document.getElementById('prof-email').value,
        secondary_email: document.getElementById('prof-email2').value,
        reg_no: document.getElementById('prof-reg').value,
        tpin: document.getElementById('prof-tpin').value,
        address: document.getElementById('prof-location').value,
        instagram_url: document.getElementById('prof-instagram').value,
        facebook_url: document.getElementById('prof-facebook').value,
        linkedin_url: document.getElementById('prof-linkedin').value,
        tiktok_url: document.getElementById('prof-tiktok').value
      };
      const res = await apiFetch('/api/admin/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showToast(res.message);
    } catch (err) {
      showToast(err.message, true);
    }
  });
});

async function uploadProfileMedia(target, fileInputId) {
  const file = document.getElementById(fileInputId).files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('target', target);
  fd.append('image', file);
  const res = await apiFetch('/api/admin/profile/media', { method: 'POST', body: fd });
  showToast(res.message);
  await loadProfile();
}

document.getElementById('logo-upload-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  await withBusyButton(btn, 'Uploading...', async () => {
    try {
      await uploadProfileMedia('logo', 'logo-file-input');
      e.target.reset();
    } catch (err) {
      showToast(err.message, true);
    }
  });
});

document.getElementById('hero-upload-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  await withBusyButton(btn, 'Uploading...', async () => {
    try {
      await uploadProfileMedia('hero', 'hero-file-input');
      e.target.reset();
    } catch (err) {
      showToast(err.message, true);
    }
  });
});

/* ==================== SERVICES ==================== */

async function loadServices() {
  servicesCache = await apiFetch('/api/admin/services');
  const list = document.getElementById('admin-services-list');
  if (!servicesCache.length) {
    list.innerHTML = '<p class="muted">No services configured.</p>';
    return;
  }

  list.innerHTML = servicesCache
    .map(
      (s) => `
      <div class="item-row">
        <div class="item-left">
          ${s.image_url ? `<img src="${escapeHtml(s.image_url)}" class="item-thumb" alt="${escapeHtml(s.title)}" loading="lazy" />` : '<div class="item-thumb" aria-hidden="true"></div>'}
          <div>
            <strong>${escapeHtml(s.category)} &mdash; ${escapeHtml(s.title)}</strong>
            <div class="muted">
              <span class="status-pill ${s.is_active ? 'status-live' : 'status-draft'}">
                ${s.is_active ? 'Visible' : 'Hidden'}
              </span>
              ${escapeHtml(s.description)}
            </div>
          </div>
        </div>
        <div class="item-actions">
          <button type="button" class="btn btn-outline btn-sm" data-service-action="edit" data-id="${s.id}">Edit</button>
          <button type="button" class="btn btn-danger btn-sm" data-service-action="delete" data-id="${s.id}">Delete</button>
        </div>
      </div>
    `
    )
    .join('');
}

document.getElementById('admin-services-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-service-action]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const action = btn.dataset.serviceAction;

  if (action === 'edit') {
    const s = servicesCache.find((x) => x.id === id);
    if (!s) return;
    document.getElementById('service-id').value = s.id;
    document.getElementById('service-category').value = s.category;
    document.getElementById('service-title').value = s.title;
    document.getElementById('service-description').value = s.description || '';
    document.getElementById('service-active').checked = Boolean(s.is_active);
    document.getElementById('service-submit-btn').textContent = 'Update Service';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (action === 'delete') {
    if (!confirm('Delete this service?')) return;
    try {
      const res = await apiFetch(`/api/admin/services/${id}`, { method: 'DELETE' });
      showToast(res.message);
      await loadServices();
    } catch (err) {
      showToast(err.message, true);
    }
  }
});

function resetServiceForm() {
  document.getElementById('service-form').reset();
  document.getElementById('service-id').value = '';
  document.getElementById('service-active').checked = true;
  document.getElementById('service-submit-btn').textContent = 'Save Service';
}

document.getElementById('reset-service-form-btn').addEventListener('click', resetServiceForm);

document.getElementById('service-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('service-submit-btn');
  await withBusyButton(btn, 'Saving...', async () => {
    try {
      const id = document.getElementById('service-id').value;
      const fd = new FormData();
      fd.append('category', document.getElementById('service-category').value.trim());
      fd.append('title', document.getElementById('service-title').value.trim());
      fd.append('description', document.getElementById('service-description').value.trim());
      fd.append('is_active', document.getElementById('service-active').checked ? '1' : '0');
      const file = document.getElementById('service-image').files[0];
      if (file) fd.append('image', file);

      const url = id ? `/api/admin/services/${id}` : '/api/admin/services';
      const method = id ? 'PUT' : 'POST';
      const res = await apiFetch(url, { method, body: fd });
      showToast(res.message);
      resetServiceForm();
      await loadServices();
    } catch (err) {
      showToast(err.message, true);
    }
  });
});

/* ==================== PASSWORD ==================== */

document.getElementById('password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;
  if (newPassword !== confirmPassword) {
    showToast('New password and confirmation do not match.', true);
    return;
  }

  const btn = document.getElementById('password-submit-btn');
  await withBusyButton(btn, 'Updating...', async () => {
    try {
      const res = await apiFetch('/api/auth/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: document.getElementById('current-password').value,
          newPassword
        })
      });
      showToast(res.message);
      e.target.reset();
    } catch (err) {
      showToast(err.message, true);
    }
  });
});

/* ==================== BOOT ==================== */

async function loadAllAdminData() {
  await Promise.all([loadPosts(), loadGallery(), loadProfile(), loadServices()]);
}

(async function boot() {
  if (!getToken()) {
    showLogin();
    return;
  }
  try {
    const { chef } = await apiFetch('/api/auth/me');
    showDashboard(chef);
    await loadAllAdminData();
  } catch {
    showLogin();
  }
})();
