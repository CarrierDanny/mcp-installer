// sidebar/components/progress-bar.js
class ProgressBar {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.getElementById(container) : container;
    this.startTime = null;
    this.options = { showETA: true, showPercent: true, showLabel: true, ...options };
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="progress-wrapper" style="margin: 8px 0;">
        <div class="progress-info" style="display:flex;justify-content:space-between;font-size:12px;color:#94a3b8;margin-bottom:4px;">
          <span class="progress-label"></span>
          <span class="progress-stats"></span>
        </div>
        <div class="progress-track" style="height:6px;background:#1e293b;border-radius:3px;overflow:hidden;">
          <div class="progress-fill" style="height:100%;width:0%;background:linear-gradient(90deg,#0ea5e9,#38bdf8);border-radius:3px;transition:width 0.3s ease;"></div>
        </div>
      </div>
    `;
    this.fill = this.container.querySelector('.progress-fill');
    this.label = this.container.querySelector('.progress-label');
    this.stats = this.container.querySelector('.progress-stats');
  }

  start(total) {
    this.total = total;
    this.completed = 0;
    this.startTime = Date.now();
    this.update(0);
    this.container.style.display = 'block';
  }

  update(completed, currentLabel = '') {
    this.completed = completed;
    const pct = this.total > 0 ? Math.round((completed / this.total) * 100) : 0;
    this.fill.style.width = `${pct}%`;

    if (this.options.showLabel && currentLabel) {
      this.label.textContent = currentLabel;
    }

    let statsText = '';
    if (this.options.showPercent) statsText += `${pct}%`;
    if (this.options.showETA && completed > 0 && completed < this.total) {
      const elapsed = Date.now() - this.startTime;
      const rate = completed / elapsed;
      const remaining = (this.total - completed) / rate;
      const eta = remaining < 60000
        ? `${Math.round(remaining / 1000)}s`
        : `${Math.floor(remaining / 60000)}m ${Math.round((remaining % 60000) / 1000)}s`;
      statsText += ` \u00b7 ETA: ${eta}`;
    }
    if (this.options.showPercent || this.options.showETA) {
      this.stats.textContent = statsText;
    }
  }

  complete(label = 'Complete') {
    this.fill.style.width = '100%';
    this.fill.style.background = 'linear-gradient(90deg, #22c55e, #4ade80)';
    this.label.textContent = label;
    this.stats.textContent = '100%';
  }

  error(label = 'Error') {
    this.fill.style.background = 'linear-gradient(90deg, #ef4444, #f87171)';
    this.label.textContent = label;
  }

  hide() {
    this.container.style.display = 'none';
  }

  reset() {
    this.fill.style.width = '0%';
    this.fill.style.background = 'linear-gradient(90deg, #0ea5e9, #38bdf8)';
    this.label.textContent = '';
    this.stats.textContent = '';
  }
}

window.ProgressBar = ProgressBar;
