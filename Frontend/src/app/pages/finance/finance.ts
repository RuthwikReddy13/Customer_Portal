import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';

@Component({
  selector: 'app-finance',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective],
  templateUrl: './finance.html'
})
export class Finance implements OnInit {
  items: any[] = [];
  filteredItems: any[] = [];
  loading = true;
  error = '';
  activePreset = 'all';

  searchQuery = '';
  startDate = '';
  endDate = '';

  metrics = {
    total: 0,
    outstanding: 0,
    overdue: 0,
    current: 0,
    overdueValue: 0
  };

  // Aging Risk Chart
  public agingData: ChartData<'doughnut'> = {
    labels: ['Current', '1-30 Days', '31-60 Days', '60+ Days'],
    datasets: [{
      data: [0, 0, 0, 0],
      backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#7f1d1d'],
      borderWidth: 3,
      borderColor: '#ffffff',
      hoverBorderColor: '#ffffff',
      hoverBorderWidth: 4
    }]
  };

  public agingDonutOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e293b', padding: 10, cornerRadius: 8, displayColors: true, boxPadding: 4,
        callbacks: { label: (ctx) => ` ${ctx.label}: € ${Number(ctx.parsed).toLocaleString('de-DE', { minimumFractionDigits: 2 })}` }
      }
    },
    animation: { animateRotate: true, animateScale: true, duration: 800 }
  };

  // Exposure Trend Line
  public exposureTrend: ChartData<'line'> = {
    labels: [],
    datasets: [{
      label: 'Exposure (EUR)',
      data: [],
      borderColor: '#E85D5D',
      backgroundColor: 'rgba(232,93,93,0.07)',
      fill: true,
      tension: 0.45,
      pointBackgroundColor: '#E85D5D',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6
    }]
  };

  public lineOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e293b', padding: 10, cornerRadius: 8, displayColors: false,
        callbacks: { label: (ctx) => `€ ${(ctx.parsed.y ?? 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}` }
      }
    },
    scales: {
      y: { beginAtZero: true, grid: { color: '#f1f5f9' }, border: { display: false }, ticks: { color: '#94a3b8', font: { size: 10, weight: 'bold' }, callback: (v) => '€' + Number(v).toLocaleString() } },
      x: { grid: { display: false }, border: { display: false }, ticks: { color: '#64748b', font: { size: 10, weight: 'bold' } } }
    },
    animation: { duration: 700 }
  };

  datePresets = [
    { label: 'All', key: 'all' },
    { label: '30d', key: '30d' },
    { label: '90d', key: '90d' },
    { label: 'YTD', key: 'ytd' }
  ];

  agingBuckets = [0, 0, 0, 0];

  constructor(private http: HttpClient) { }

  ngOnInit() {
    const customerId = localStorage.getItem('customer_id');
    if (!customerId) { this.error = 'Not signed in.'; this.loading = false; return; }

    this.http.get<any>(`http://localhost:3000/finance?customer_id=${customerId}`)
      .subscribe({
        next: (res) => {
          const et = res?.ET_FIN?.item;
          this.items = Array.isArray(et) ? et : (et ? [et] : []);

          const today = new Date();
          this.items = this.items.map(item => {
            const billDate = this.parseDate(item.FKDAT);
            if (!billDate) return { ...item, agingDays: 0, isOverdue: false };
            const dueDate = new Date(billDate.getTime() + (30 * 24 * 60 * 60 * 1000));
            const diffDays = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
            return { ...item, agingDays: diffDays > 0 ? diffDays : 0, isOverdue: diffDays > 0 };
          });

          this.applyFilters();
          this.loading = false;
        },
        error: (err) => {
          console.error('Finance error:', err);
          this.error = 'Failed to load financial records.';
          this.loading = false;
        }
      });
  }

  buildCharts() {
    // Aging buckets (by value)
    this.agingBuckets = [0, 0, 0, 0];
    this.filteredItems.forEach(item => {
      const d = item.agingDays || 0;
      const val = parseFloat(item.NETWR) || 0;
      if (d === 0) this.agingBuckets[0] += val;
      else if (d <= 30) this.agingBuckets[1] += val;
      else if (d <= 60) this.agingBuckets[2] += val;
      else this.agingBuckets[3] += val;
    });

    this.agingData = {
      ...this.agingData,
      datasets: [{ ...this.agingData.datasets[0], data: this.agingBuckets }]
    };

    // Monthly exposure trend
    const monthMap: Record<string, number> = {};
    this.filteredItems.forEach(item => {
      const d = this.parseDate(item.FKDAT);
      if (d) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthMap[key] = (monthMap[key] || 0) + (parseFloat(item.NETWR) || 0);
      }
    });
    const sorted = Object.keys(monthMap).sort();
    this.exposureTrend = {
      labels: sorted.map(m => { const [y, mo] = m.split('-'); return new Date(+y, +mo - 1).toLocaleString('en-GB', { month: 'short', year: '2-digit' }); }),
      datasets: [{ ...this.exposureTrend.datasets[0], data: sorted.map(k => monthMap[k]) }]
    };
  }

  calculateMetrics() {
    this.metrics.total = this.filteredItems.length;
    this.metrics.overdue = this.filteredItems.filter(i => i.isOverdue).length;
    this.metrics.outstanding = this.filteredItems.reduce((s, i) => s + (parseFloat(i.NETWR) || 0), 0);
    this.metrics.current = this.filteredItems.filter(i => !i.isOverdue).length;
    this.metrics.overdueValue = this.filteredItems.filter(i => i.isOverdue).reduce((s, i) => s + (parseFloat(i.NETWR) || 0), 0);
  }

  applyPreset(key: string) {
    this.activePreset = key;
    const today = new Date();
    if (key === 'all') { this.startDate = ''; this.endDate = ''; }
    else if (key === '30d') { const d = new Date(today); d.setDate(d.getDate() - 30); this.startDate = d.toISOString().split('T')[0]; this.endDate = today.toISOString().split('T')[0]; }
    else if (key === '90d') { const d = new Date(today); d.setDate(d.getDate() - 90); this.startDate = d.toISOString().split('T')[0]; this.endDate = today.toISOString().split('T')[0]; }
    else if (key === 'ytd') { this.startDate = `${today.getFullYear()}-01-01`; this.endDate = today.toISOString().split('T')[0]; }
    this.applyFilters();
  }

  onFilterChange() { this.applyFilters(); }

  /** Parse SAP dates: handles YYYY-MM-DD, YYYYMMDD, and empty/zero values */
  parseDate(raw: string): Date | null {
    if (!raw || raw === '00000000' || raw === '0000-00-00') return null;
    // Already ISO format
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      const d = new Date(raw.substring(0, 10));
      return isNaN(d.getTime()) ? null : d;
    }
    // YYYYMMDD format
    if (/^\d{8}$/.test(raw)) {
      const d = new Date(`${raw.substring(0,4)}-${raw.substring(4,6)}-${raw.substring(6,8)}`);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  applyFilters() {
    const start = this.startDate ? new Date(this.startDate) : null;
    const end   = this.endDate   ? new Date(this.endDate)   : null;
    if (end) end.setHours(23, 59, 59, 999); // inclusive end

    this.filteredItems = this.items.filter(item => {
      const matchSearch =
        (item.VBELN || '').toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        (item.BLART || '').toLowerCase().includes(this.searchQuery.toLowerCase());

      let matchDate = true;
      const d = this.parseDate(item.FKDAT);
      if (d) {
        if (start && d < start) matchDate = false;
        if (end   && d > end)   matchDate = false;
      } else if (start || end) {
        matchDate = false; // no valid date — exclude when filter active
      }
      return matchSearch && matchDate;
    });

    this.calculateMetrics();
    this.buildCharts();
  }

  getAgingLabel(idx: number): string {
    return ['Current', '1-30 Days', '31-60 Days', '60+ Days'][idx];
  }

  getAgingColor(idx: number): string {
    return ['#10b981', '#f59e0b', '#ef4444', '#7f1d1d'][idx];
  }
}