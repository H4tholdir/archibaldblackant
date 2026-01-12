import type { ProfilingData } from './types';
import * as fs from 'fs/promises';
import * as path from 'path';

export class PerformanceDashboardGenerator {
  /**
   * Generate HTML dashboard from profiling data
   */
  static generateHTML(
    profilingData: ProfilingData,
    options?: {
      title?: string;
      comparisonData?: ProfilingData[];
    }
  ): string {
    const timestamp = new Date().toISOString();
    const title = options?.title || 'Archibald Bot Performance Dashboard';

    const dataJson = JSON.stringify(profilingData, null, 2);
    const comparisonJson = options?.comparisonData ? JSON.stringify(options.comparisonData, null, 2) : 'null';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #f5f7fa;
      color: #2c3e50;
      line-height: 1.6;
      padding: 2rem;
    }

    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 2rem;
      border-radius: 12px;
      margin-bottom: 2rem;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }

    header h1 {
      font-size: 2rem;
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    header .timestamp {
      opacity: 0.9;
      font-size: 0.9rem;
    }

    main {
      max-width: 1400px;
      margin: 0 auto;
    }

    section {
      background: white;
      padding: 2rem;
      border-radius: 12px;
      margin-bottom: 2rem;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }

    h2 {
      font-size: 1.5rem;
      margin-bottom: 1.5rem;
      color: #667eea;
      border-bottom: 2px solid #e9ecef;
      padding-bottom: 0.5rem;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .summary-card {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 1.5rem;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
    }

    .summary-card h3 {
      font-size: 0.9rem;
      opacity: 0.9;
      margin-bottom: 0.5rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .summary-card .value {
      font-size: 2rem;
      font-weight: bold;
    }

    .summary-card .subtitle {
      font-size: 0.85rem;
      opacity: 0.8;
      margin-top: 0.25rem;
    }

    .bottleneck-card {
      background: #f8f9fa;
      border-left: 4px solid #dc3545;
      padding: 1.5rem;
      margin-bottom: 1rem;
      border-radius: 4px;
    }

    .bottleneck-card.priority-high { border-left-color: #dc3545; }
    .bottleneck-card.priority-medium { border-left-color: #ffc107; }
    .bottleneck-card.priority-low { border-left-color: #28a745; }

    .bottleneck-card h3 {
      font-size: 1.2rem;
      margin-bottom: 0.5rem;
      color: #2c3e50;
    }

    .bottleneck-card .metrics {
      display: flex;
      gap: 2rem;
      margin: 1rem 0;
      font-size: 0.9rem;
    }

    .bottleneck-card .metric {
      display: flex;
      flex-direction: column;
    }

    .bottleneck-card .metric-label {
      color: #6c757d;
      font-size: 0.8rem;
    }

    .bottleneck-card .metric-value {
      font-weight: bold;
      font-size: 1.1rem;
    }

    .bottleneck-card .recommendations {
      margin-top: 1rem;
    }

    .bottleneck-card .recommendations h4 {
      font-size: 0.9rem;
      color: #6c757d;
      margin-bottom: 0.5rem;
    }

    .bottleneck-card ul {
      list-style-position: inside;
      color: #495057;
    }

    .bottleneck-card li {
      margin-bottom: 0.25rem;
    }

    #gantt-container {
      position: relative;
      overflow-x: auto;
      margin-top: 1rem;
    }

    #gantt-svg {
      min-width: 800px;
    }

    .gantt-bar {
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .gantt-bar:hover {
      opacity: 0.8;
    }

    .gantt-tooltip {
      position: absolute;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 0.5rem;
      border-radius: 4px;
      font-size: 0.85rem;
      pointer-events: none;
      white-space: nowrap;
      z-index: 1000;
      display: none;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
    }

    th, td {
      text-align: left;
      padding: 0.75rem;
      border-bottom: 1px solid #e9ecef;
    }

    th {
      background: #f8f9fa;
      font-weight: 600;
      color: #495057;
      position: sticky;
      top: 0;
    }

    tr:hover {
      background: #f8f9fa;
    }

    .status-ok { color: #28a745; font-weight: bold; }
    .status-error { color: #dc3545; font-weight: bold; }

    .controls {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }

    button {
      padding: 0.5rem 1rem;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.9rem;
      transition: background 0.2s;
    }

    button:hover {
      background: #5568d3;
    }

    select, input {
      padding: 0.5rem;
      border: 1px solid #ced4da;
      border-radius: 4px;
      font-size: 0.9rem;
    }

    @media (prefers-color-scheme: dark) {
      body { background: #1a1a1a; color: #e9ecef; }
      section { background: #2d2d2d; }
      th { background: #3d3d3d; color: #e9ecef; }
      tr:hover { background: #3d3d3d; }
      .bottleneck-card { background: #3d3d3d; }
    }

    @media (max-width: 768px) {
      body { padding: 1rem; }
      header { padding: 1rem; }
      header h1 { font-size: 1.5rem; }
      section { padding: 1rem; }
      .summary-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <h1>🤖 ${title}</h1>
    <p class="timestamp">Generated: ${timestamp}</p>
  </header>

  <main>
    <section id="summary">
      <h2>Summary</h2>
      <div class="summary-grid">
        <div class="summary-card">
          <h3>Total Duration</h3>
          <div class="value">${(profilingData.summary.totalDurationMs / 1000).toFixed(2)}s</div>
          <div class="subtitle">Across ${profilingData.summary.totalOperations} operations</div>
        </div>
        <div class="summary-card">
          <h3>Success Rate</h3>
          <div class="value">${((profilingData.summary.successful / profilingData.summary.totalOperations) * 100).toFixed(1)}%</div>
          <div class="subtitle">${profilingData.summary.successful} succeeded, ${profilingData.summary.failed} failed</div>
        </div>
        <div class="summary-card">
          <h3>Avg Operation</h3>
          <div class="value">${(profilingData.summary.averageOperationMs / 1000).toFixed(2)}s</div>
          <div class="subtitle">Per operation</div>
        </div>
        <div class="summary-card">
          <h3>Peak Memory</h3>
          <div class="value">${(profilingData.summary.peakMemoryBytes / 1024 / 1024).toFixed(1)} MB</div>
          <div class="subtitle">Maximum heap used</div>
        </div>
      </div>
    </section>

    <section id="bottlenecks">
      <h2>Bottleneck Analysis</h2>
      <div id="bottleneck-list"></div>
    </section>

    <section id="gantt">
      <h2>Timeline Visualization</h2>
      <div class="controls">
        <label>
          Category Filter:
          <select id="category-filter">
            <option value="">All Categories</option>
          </select>
        </label>
      </div>
      <div id="gantt-container">
        <svg id="gantt-svg"></svg>
        <div class="gantt-tooltip" id="gantt-tooltip"></div>
      </div>
    </section>

    <section id="categories">
      <h2>Category Breakdown</h2>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Count</th>
            <th>Total Time</th>
            <th>Avg Time</th>
            <th>p50</th>
            <th>p95</th>
            <th>p99</th>
            <th>Avg Memory</th>
          </tr>
        </thead>
        <tbody id="category-table-body"></tbody>
      </table>
    </section>

    <section id="timeline">
      <h2>Detailed Operation Timeline</h2>
      <div class="controls">
        <input type="text" id="search-filter" placeholder="Search operations...">
        <label>
          Status:
          <select id="status-filter">
            <option value="">All</option>
            <option value="ok">Success</option>
            <option value="error">Error</option>
          </select>
        </label>
      </div>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Category</th>
            <th>Status</th>
            <th>Duration</th>
            <th>Gap</th>
            <th>Retry</th>
            <th>Memory Δ</th>
            <th>Start Time</th>
          </tr>
        </thead>
        <tbody id="timeline-table-body"></tbody>
      </table>
    </section>

    ${options?.comparisonData ? '<section id="trends"><h2>Trend Comparison</h2><div id="trend-charts"></div></section>' : ''}
  </main>

  <script>
    const profilingData = ${dataJson};
    const comparisonData = ${comparisonJson};

    // Populate category breakdown table
    function populateCategoryTable() {
      const tbody = document.getElementById('category-table-body');
      const categories = Object.entries(profilingData.categories).sort((a, b) => b[1].totalDurationMs - a[1].totalDurationMs);

      tbody.innerHTML = categories.map(([name, data]) => \`
        <tr>
          <td><strong>\${name}</strong></td>
          <td>\${data.count}</td>
          <td>\${(data.totalDurationMs / 1000).toFixed(2)}s</td>
          <td>\${(data.avgDurationMs / 1000).toFixed(2)}s</td>
          <td>\${(data.p50Ms / 1000).toFixed(2)}s</td>
          <td>\${(data.p95Ms / 1000).toFixed(2)}s</td>
          <td>\${(data.p99Ms / 1000).toFixed(2)}s</td>
          <td>\${(data.avgMemoryBytes / 1024).toFixed(1)} KB</td>
        </tr>
      \`).join('');
    }

    // Populate timeline table
    function populateTimelineTable() {
      const tbody = document.getElementById('timeline-table-body');
      const searchFilter = document.getElementById('search-filter').value.toLowerCase();
      const statusFilter = document.getElementById('status-filter').value;

      const filtered = profilingData.operations.filter(op => {
        const matchesSearch = !searchFilter || op.name.toLowerCase().includes(searchFilter) || op.category.toLowerCase().includes(searchFilter);
        const matchesStatus = !statusFilter || op.status === statusFilter;
        return matchesSearch && matchesStatus;
      });

      tbody.innerHTML = filtered.map(op => \`
        <tr>
          <td>\${op.id}</td>
          <td>\${op.name}</td>
          <td>\${op.category}</td>
          <td class="status-\${op.status}">\${op.status.toUpperCase()}</td>
          <td>\${(op.durationMs / 1000).toFixed(2)}s</td>
          <td>\${(op.gapMs / 1000).toFixed(2)}s</td>
          <td>\${op.retryAttempt}</td>
          <td>\${((op.memoryAfter - op.memoryBefore) / 1024).toFixed(1)} KB</td>
          <td>\${new Date(op.startIso).toLocaleTimeString()}</td>
        </tr>
      \`).join('');
    }

    // Add event listeners for filters
    document.getElementById('search-filter').addEventListener('input', populateTimelineTable);
    document.getElementById('status-filter').addEventListener('change', populateTimelineTable);

    // Populate category filter dropdown
    function populateCategoryFilter() {
      const select = document.getElementById('category-filter');
      const categories = Object.keys(profilingData.categories).sort();
      categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        select.appendChild(option);
      });
    }

    // Gantt chart visualization
    function renderGanttChart() {
      const svg = document.getElementById('gantt-svg');
      const tooltip = document.getElementById('gantt-tooltip');
      const categoryFilter = document.getElementById('category-filter').value;

      const filtered = categoryFilter
        ? profilingData.operations.filter(op => op.category === categoryFilter)
        : profilingData.operations;

      if (filtered.length === 0) {
        svg.innerHTML = '<text x="10" y="30" fill="#666">No operations to display</text>';
        return;
      }

      const startTimes = filtered.map(op => new Date(op.startIso).getTime());
      const endTimes = filtered.map(op => new Date(op.endIso).getTime());
      const minTime = Math.min(...startTimes);
      const maxTime = Math.max(...endTimes);
      const timeRange = maxTime - minTime;

      const margin = { top: 40, right: 20, bottom: 40, left: 200 };
      const chartWidth = Math.max(800, timeRange / 100);
      const barHeight = 24;
      const barGap = 4;
      const chartHeight = filtered.length * (barHeight + barGap) + margin.top + margin.bottom;

      svg.setAttribute('width', chartWidth + margin.left + margin.right);
      svg.setAttribute('height', chartHeight);

      svg.innerHTML = '';

      const colorMap = {
        'ok': '#28a745',
        'error': '#dc3545'
      };

      const timeScale = (time) => {
        return ((time - minTime) / timeRange) * chartWidth + margin.left;
      };

      const formatTime = (ms) => {
        if (ms < 1000) return ms.toFixed(0) + 'ms';
        return (ms / 1000).toFixed(2) + 's';
      };

      const formatTimestamp = (iso) => {
        const date = new Date(iso);
        return date.toLocaleTimeString();
      };

      filtered.forEach((op, index) => {
        const y = index * (barHeight + barGap) + margin.top;
        const startX = timeScale(new Date(op.startIso).getTime());
        const endX = timeScale(new Date(op.endIso).getTime());
        const width = Math.max(2, endX - startX);

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'gantt-bar');

        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', margin.left - 10);
        label.setAttribute('y', y + barHeight / 2 + 4);
        label.setAttribute('text-anchor', 'end');
        label.setAttribute('fill', '#495057');
        label.setAttribute('font-size', '12');
        label.textContent = op.name.length > 25 ? op.name.substring(0, 25) + '...' : op.name;
        g.appendChild(label);

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', startX);
        rect.setAttribute('y', y);
        rect.setAttribute('width', width);
        rect.setAttribute('height', barHeight);
        rect.setAttribute('fill', colorMap[op.status] || '#6c757d');
        rect.setAttribute('opacity', '0.8');
        rect.setAttribute('rx', '3');
        g.appendChild(rect);

        g.addEventListener('mouseenter', (e) => {
          tooltip.style.display = 'block';
          tooltip.innerHTML = \`
            <strong>\${op.name}</strong><br>
            Category: \${op.category}<br>
            Duration: \${formatTime(op.durationMs)}<br>
            Start: \${formatTimestamp(op.startIso)}<br>
            Memory: \${((op.memoryAfter - op.memoryBefore) / 1024).toFixed(1)} KB<br>
            Status: \${op.status.toUpperCase()}
          \`;
        });

        g.addEventListener('mousemove', (e) => {
          tooltip.style.left = (e.pageX + 10) + 'px';
          tooltip.style.top = (e.pageY + 10) + 'px';
        });

        g.addEventListener('mouseleave', () => {
          tooltip.style.display = 'none';
        });

        svg.appendChild(g);
      });

      const xAxisGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const xAxisLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      xAxisLine.setAttribute('x1', margin.left);
      xAxisLine.setAttribute('y1', margin.top - 10);
      xAxisLine.setAttribute('x2', margin.left + chartWidth);
      xAxisLine.setAttribute('y2', margin.top - 10);
      xAxisLine.setAttribute('stroke', '#dee2e6');
      xAxisLine.setAttribute('stroke-width', '1');
      xAxisGroup.appendChild(xAxisLine);

      const numTicks = Math.min(10, Math.floor(chartWidth / 100));
      for (let i = 0; i <= numTicks; i++) {
        const x = margin.left + (i / numTicks) * chartWidth;
        const time = minTime + (i / numTicks) * timeRange;
        const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        tick.setAttribute('x1', x);
        tick.setAttribute('y1', margin.top - 10);
        tick.setAttribute('x2', x);
        tick.setAttribute('y2', margin.top - 5);
        tick.setAttribute('stroke', '#dee2e6');
        xAxisGroup.appendChild(tick);

        const tickLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        tickLabel.setAttribute('x', x);
        tickLabel.setAttribute('y', margin.top - 15);
        tickLabel.setAttribute('text-anchor', 'middle');
        tickLabel.setAttribute('fill', '#6c757d');
        tickLabel.setAttribute('font-size', '10');
        tickLabel.textContent = formatTime((time - minTime));
        xAxisGroup.appendChild(tickLabel);
      }

      svg.appendChild(xAxisGroup);

      const legend = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const legendItems = [
        { label: 'Success', color: '#28a745' },
        { label: 'Error', color: '#dc3545' }
      ];

      legendItems.forEach((item, i) => {
        const legendItem = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', margin.left + i * 100);
        rect.setAttribute('y', chartHeight - 25);
        rect.setAttribute('width', 16);
        rect.setAttribute('height', 16);
        rect.setAttribute('fill', item.color);
        rect.setAttribute('rx', '2');
        legendItem.appendChild(rect);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', margin.left + i * 100 + 22);
        text.setAttribute('y', chartHeight - 13);
        text.setAttribute('fill', '#495057');
        text.setAttribute('font-size', '12');
        text.textContent = item.label;
        legendItem.appendChild(text);

        legend.appendChild(legendItem);
      });

      svg.appendChild(legend);
    }

    document.getElementById('category-filter').addEventListener('change', renderGanttChart);

    // Bottleneck analysis with recommendations
    function renderBottleneckAnalysis() {
      const bottleneckList = document.getElementById('bottleneck-list');
      const categories = Object.entries(profilingData.categories)
        .sort((a, b) => b[1].totalDurationMs - a[1].totalDurationMs);

      if (categories.length === 0) {
        bottleneckList.innerHTML = '<p>No bottlenecks detected.</p>';
        return;
      }

      const topBottlenecks = categories.slice(0, 3);

      const getRecommendations = (categoryName, data) => {
        const recommendations = [];

        if (categoryName.includes('form.customer') && data.p95Ms > 20000) {
          recommendations.push('Customer selection is slow. Consider: pre-caching common customers, testing direct API access instead of dropdown, reducing wait times between operations.');
        }

        if (categoryName.includes('form.article') && data.p95Ms > 8000) {
          recommendations.push('Article search is slow. Consider: caching recently searched articles, batch searching for multi-article orders, optimizing dropdown search method.');
        }

        if ((categoryName.includes('form.quantity') || categoryName.includes('form.discount')) && data.p95Ms > 8000) {
          recommendations.push('Field editing is slow. Consider: testing alternatives to Ctrl+A + Backspace pattern, using JavaScript setValue with event triggers, reducing wait times between keypress.');
        }

        if (categoryName === 'login' && data.p95Ms > 20000) {
          recommendations.push('Login is slow. Session cache may not be working. Verify cache expiration and cookie persistence.');
        }

        const p99p95Ratio = data.p99Ms / data.p95Ms;
        if (p99p95Ratio > 2) {
          recommendations.push('High variance detected (p99/p95 > 2x). Some operations are much slower than others. Investigate network latency, page load times, or element wait timeouts.');
        }

        if (recommendations.length === 0) {
          recommendations.push('Consider profiling individual operations in this category to identify specific optimization opportunities.');
        }

        return recommendations;
      };

      const bottlenecks = topBottlenecks.map(([name, data]) => {
        const impact = (data.totalDurationMs / profilingData.summary.totalDurationMs) * 100;
        let priority = 'low';
        if (impact > 30) priority = 'high';
        else if (impact > 15) priority = 'medium';

        return {
          category: name,
          p50Ms: data.p50Ms,
          p95Ms: data.p95Ms,
          p99Ms: data.p99Ms,
          impactPercent: impact,
          priority,
          recommendations: getRecommendations(name, data)
        };
      });

      const bottleneckHTML = bottlenecks.map(b => \`
        <div class="bottleneck-card priority-\${b.priority}">
          <h3>\${b.category}</h3>
          <div class="metrics">
            <div class="metric">
              <span class="metric-label">p50</span>
              <span class="metric-value">\${(b.p50Ms / 1000).toFixed(2)}s</span>
            </div>
            <div class="metric">
              <span class="metric-label">p95</span>
              <span class="metric-value">\${(b.p95Ms / 1000).toFixed(2)}s</span>
            </div>
            <div class="metric">
              <span class="metric-label">p99</span>
              <span class="metric-value">\${(b.p99Ms / 1000).toFixed(2)}s</span>
            </div>
            <div class="metric">
              <span class="metric-label">Impact</span>
              <span class="metric-value">\${b.impactPercent.toFixed(1)}%</span>
            </div>
            <div class="metric">
              <span class="metric-label">Priority</span>
              <span class="metric-value">\${b.priority.toUpperCase()}</span>
            </div>
          </div>
          <div class="recommendations">
            <h4>Recommended Optimizations:</h4>
            <ul>
              \${b.recommendations.map(rec => \`<li>\${rec}</li>\`).join('')}
            </ul>
          </div>
        </div>
      \`).join('');

      bottleneckList.innerHTML = bottleneckHTML;
    }

    // Trend comparison charts
    function renderTrendComparison() {
      if (!comparisonData || comparisonData.length === 0) return;

      const trendCharts = document.getElementById('trend-charts');
      if (!trendCharts) return;

      const allRuns = [profilingData, ...comparisonData];
      const runLabels = allRuns.map((_, i) => \`Run \${i + 1}\`);

      const totalDurations = allRuns.map(run => run.summary.totalDurationMs);
      const successRates = allRuns.map(run =>
        (run.summary.successful / run.summary.totalOperations) * 100
      );

      const allCategories = new Set();
      allRuns.forEach(run => {
        Object.keys(run.categories).forEach(cat => allCategories.add(cat));
      });

      const categoryTrends = {};
      allCategories.forEach(cat => {
        categoryTrends[cat] = allRuns.map(run =>
          run.categories[cat] ? run.categories[cat].totalDurationMs : 0
        );
      });

      const createLineChart = (title, labels, datasets, yLabel) => {
        const width = 600;
        const height = 300;
        const margin = { top: 40, right: 20, bottom: 60, left: 60 };
        const chartWidth = width - margin.left - margin.right;
        const chartHeight = height - margin.top - margin.bottom;

        let svg = \`<svg width="\${width}" height="\${height}">\`;

        const colors = ['#667eea', '#f093fb', '#4facfe', '#43e97b', '#fa709a'];

        const allValues = datasets.flatMap(d => d.data);
        const maxValue = Math.max(...allValues);
        const minValue = Math.min(...allValues);
        const valueRange = maxValue - minValue || 1;

        const xScale = (i) => margin.left + (i / (labels.length - 1)) * chartWidth;
        const yScale = (val) => margin.top + chartHeight - ((val - minValue) / valueRange) * chartHeight;

        svg += \`<text x="\${width / 2}" y="20" text-anchor="middle" font-weight="bold" font-size="14">\${title}</text>\`;

        svg += \`<text x="15" y="\${height / 2}" text-anchor="middle" transform="rotate(-90, 15, \${height / 2})" font-size="12" fill="#6c757d">\${yLabel}</text>\`;

        for (let i = 0; i <= 5; i++) {
          const y = margin.top + (i / 5) * chartHeight;
          const val = maxValue - (i / 5) * valueRange;
          svg += \`<line x1="\${margin.left}" y1="\${y}" x2="\${margin.left + chartWidth}" y2="\${y}" stroke="#e9ecef" stroke-width="1"/>\`;
          svg += \`<text x="\${margin.left - 10}" y="\${y + 4}" text-anchor="end" font-size="10" fill="#6c757d">\${val.toFixed(0)}</text>\`;
        }

        datasets.forEach((dataset, di) => {
          const color = colors[di % colors.length];
          let pathD = '';

          dataset.data.forEach((val, i) => {
            const x = xScale(i);
            const y = yScale(val);
            if (i === 0) pathD += \`M \${x} \${y}\`;
            else pathD += \` L \${x} \${y}\`;
          });

          svg += \`<path d="\${pathD}" fill="none" stroke="\${color}" stroke-width="2"/>\`;

          dataset.data.forEach((val, i) => {
            const x = xScale(i);
            const y = yScale(val);
            svg += \`<circle cx="\${x}" cy="\${y}" r="4" fill="\${color}"/>\`;
          });

          svg += \`<text x="\${width - margin.right - 10}" y="\${20 + di * 15}" text-anchor="end" font-size="11" fill="\${color}">\${dataset.label}</text>\`;
        });

        labels.forEach((label, i) => {
          const x = xScale(i);
          svg += \`<text x="\${x}" y="\${height - margin.bottom + 20}" text-anchor="middle" font-size="10" fill="#6c757d">\${label}</text>\`;
        });

        svg += '</svg>';
        return svg;
      };

      let html = '<div style="display: grid; gap: 2rem;">';

      html += '<div>' + createLineChart(
        'Total Duration Trend',
        runLabels,
        [{ label: 'Total Time (ms)', data: totalDurations }],
        'Duration (ms)'
      ) + '</div>';

      html += '<div>' + createLineChart(
        'Success Rate Trend',
        runLabels,
        [{ label: 'Success Rate (%)', data: successRates }],
        'Success Rate (%)'
      ) + '</div>';

      const topCategories = Object.entries(categoryTrends)
        .sort((a, b) => Math.max(...b[1]) - Math.max(...a[1]))
        .slice(0, 5);

      if (topCategories.length > 0) {
        html += '<div>' + createLineChart(
          'Top Categories Duration Trend',
          runLabels,
          topCategories.map(([cat, data]) => ({ label: cat, data })),
          'Duration (ms)'
        ) + '</div>';
      }

      html += '<div style="margin-top: 2rem;"><h3>Run Comparison Table</h3><table><thead><tr><th>Run</th><th>Total Time</th><th>Operations</th><th>Success Rate</th><th>Peak Memory</th></tr></thead><tbody>';

      allRuns.forEach((run, i) => {
        const percentChange = i > 0
          ? ((run.summary.totalDurationMs - allRuns[0].summary.totalDurationMs) / allRuns[0].summary.totalDurationMs * 100).toFixed(1)
          : '-';
        const arrow = i > 0
          ? (run.summary.totalDurationMs > allRuns[0].summary.totalDurationMs ? '▲' : '▼')
          : '';

        html += \`<tr>
          <td>Run \${i + 1}</td>
          <td>\${(run.summary.totalDurationMs / 1000).toFixed(2)}s \${i > 0 ? \`<span style="color: \${arrow === '▲' ? '#dc3545' : '#28a745'}">\${arrow} \${percentChange}%</span>\` : ''}</td>
          <td>\${run.summary.totalOperations}</td>
          <td>\${((run.summary.successful / run.summary.totalOperations) * 100).toFixed(1)}%</td>
          <td>\${(run.summary.peakMemoryBytes / 1024 / 1024).toFixed(1)} MB</td>
        </tr>\`;
      });

      html += '</tbody></table></div></div>';

      trendCharts.innerHTML = html;
    }

    // Initialize tables and chart
    populateCategoryTable();
    populateTimelineTable();
    populateCategoryFilter();
    renderGanttChart();
    renderBottleneckAnalysis();
    renderTrendComparison();
  </script>
</body>
</html>`;
  }

  /**
   * Export profiling data as CSV
   */
  static exportCSV(profilingData: ProfilingData): string {
    const escapeCSV = (value: string | number | undefined): string => {
      if (value === undefined || value === null) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = [
      'Operation ID',
      'Name',
      'Category',
      'Status',
      'Duration (ms)',
      'Gap (ms)',
      'Retry Attempt',
      'Memory Before (MB)',
      'Memory After (MB)',
      'Start Time',
      'End Time',
      'Error Message'
    ];

    const rows = profilingData.operations.map(op => [
      op.id,
      escapeCSV(op.name),
      escapeCSV(op.category),
      op.status,
      op.durationMs.toFixed(2),
      op.gapMs.toFixed(2),
      op.retryAttempt,
      (op.memoryBefore / 1024 / 1024).toFixed(2),
      (op.memoryAfter / 1024 / 1024).toFixed(2),
      escapeCSV(op.startIso),
      escapeCSV(op.endIso),
      escapeCSV(op.errorMessage)
    ]);

    const csvLines = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ];

    return csvLines.join('\n');
  }

  /**
   * Save dashboard to file
   */
  static async saveDashboard(
    profilingData: ProfilingData,
    outputPath: string,
    options?: { format: 'html' | 'json' | 'csv' }
  ): Promise<void> {
    const format = options?.format || 'html';

    const parentDir = path.dirname(outputPath);
    await fs.mkdir(parentDir, { recursive: true });

    let content: string;

    switch (format) {
      case 'html':
        content = this.generateHTML(profilingData);
        break;
      case 'json':
        content = JSON.stringify(profilingData, null, 2);
        break;
      case 'csv':
        content = this.exportCSV(profilingData);
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    await fs.writeFile(outputPath, content, 'utf-8');
    console.log(`Dashboard saved: ${outputPath}`);
  }
}
