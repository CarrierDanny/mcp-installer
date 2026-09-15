// sidebar/components/confidence-gauge.js
class ConfidenceGauge {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.getElementById(container) : container;
    this.size = options.size || 80;
    this.thickness = options.thickness || 8;
    this.render(0);
  }

  render(value, label = '') {
    const color = value >= 85 ? '#22c55e' : value >= 60 ? '#f59e0b' : '#ef4444';
    const radius = (this.size - this.thickness) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (value / 100) * circumference;
    const cx = this.size / 2;
    const cy = this.size / 2;

    this.container.innerHTML = `
      <div style="text-align:center;">
        <svg width="${this.size}" height="${this.size}" viewBox="0 0 ${this.size} ${this.size}">
          <circle cx="${cx}" cy="${cy}" r="${radius}" stroke="#1e293b" stroke-width="${this.thickness}" fill="none"/>
          <circle cx="${cx}" cy="${cy}" r="${radius}" stroke="${color}" stroke-width="${this.thickness}" fill="none"
            stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
            stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"
            style="transition: stroke-dashoffset 0.5s ease;"/>
          <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central"
            fill="${color}" font-size="${this.size * 0.25}px" font-weight="bold" font-family="monospace">${value}</text>
        </svg>
        ${label ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px;">${label}</div>` : ''}
      </div>
    `;
  }

  update(value, label = '') {
    this.render(value, label);
  }
}

window.ConfidenceGauge = ConfidenceGauge;
