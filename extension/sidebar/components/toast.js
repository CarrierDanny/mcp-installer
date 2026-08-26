// sidebar/components/toast.js
const Toast = {
  show(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const colors = { success: '#22c55e', error: '#ef4444', warning: '#f59e0b', info: '#38bdf8' };
    const icons = { success: '\u2713', error: '\u2715', warning: '\u26a0', info: '\u2139' };

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span style="margin-right:8px;">${icons[type] || ''}</span>${message}`;
    Object.assign(toast.style, {
      background: '#1e293b', color: '#e2e8f0', padding: '10px 16px',
      borderRadius: '8px', marginBottom: '8px', fontSize: '13px',
      borderLeft: `3px solid ${colors[type] || colors.info}`,
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      opacity: '0', transform: 'translateX(100%)',
      transition: 'all 0.3s ease', display: 'flex', alignItems: 'center'
    });

    container.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  success(msg) { this.show(msg, 'success'); },
  error(msg) { this.show(msg, 'error', 5000); },
  warning(msg) { this.show(msg, 'warning'); },
  info(msg) { this.show(msg, 'info'); }
};

window.Toast = Toast;
