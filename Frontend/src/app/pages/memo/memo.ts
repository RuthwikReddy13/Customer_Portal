import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';

@Component({
  selector: 'app-memo',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective],
  templateUrl: './memo.html'
})
export class Memo implements OnInit {
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
    value: 0,
    credits: 0,
    debits: 0,
    creditValue: 0,
    debitValue: 0
  };

  // Credit vs Debit Donut
  public splitData: ChartData<'doughnut'> = {
    labels: ['Credits', 'Debits'],
    datasets: [{
      data: [0, 0],
      backgroundColor: ['#0891b2', '#E85D5D'],
      borderWidth: 3,
      borderColor: '#ffffff',
      hoverBorderColor: '#ffffff',
      hoverBorderWidth: 4
    }]
  };

  public donutOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: '#1e293b', padding: 10, cornerRadius: 8, displayColors: true, boxPadding: 4 }
    },
    animation: { animateRotate: true, animateScale: true, duration: 800 }
  };

  // Monthly Memo Trend
  public memoTrend: ChartData<'bar'> = {
    labels: [],
    datasets: [{
      label: 'Adjustment Value (EUR)',
      data: [],
      backgroundColor: 'rgba(245,158,11,0.85)',
      borderRadius: 8,
      borderSkipped: false,
      barThickness: 22
    }]
  };

  public trendOptions: ChartConfiguration<'bar'>['options'] = {
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

  constructor(private http: HttpClient) { }

  ngOnInit() {
    const customerId = localStorage.getItem('customer_id');
    if (!customerId) { this.error = 'Not signed in.'; this.loading = false; return; }

    this.http.get<any>(`http://localhost:3000/memo?customer_id=${customerId}`)
      .subscribe({
        next: (res) => {
          const et = res?.ET_MEMO?.item;
          this.items = Array.isArray(et) ? et : (et ? [et] : []);
          this.applyFilters();
          this.loading = false;
        },
        error: (err) => {
          console.error('Memo error:', err);
          this.error = 'Failed to load adjustment records.';
          this.loading = false;
        }
      });
  }

  buildCharts() {
    this.splitData = {
      ...this.splitData,
      datasets: [{ ...this.splitData.datasets[0], data: [this.metrics.credits, this.metrics.debits] }]
    };

    const monthMap: Record<string, number> = {};
    this.filteredItems.forEach(item => {
      const d = this.parseDate(item.FKDAT); // Changed from ERDAT
      if (d) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthMap[key] = (monthMap[key] || 0) + (parseFloat(item.NETWR) || 0);
      }
    });
    const sorted = Object.keys(monthMap).sort();
    this.memoTrend = {
      labels: sorted.map(m => { const [y, mo] = m.split('-'); return new Date(+y, +mo - 1).toLocaleString('en-GB', { month: 'short', year: '2-digit' }); }),
      datasets: [{ ...this.memoTrend.datasets[0], data: sorted.map(k => monthMap[k]) }]
    };
  }

  calculateMetrics() {
    this.metrics.total = this.filteredItems.length;
    this.metrics.value = this.filteredItems.reduce((s, i) => s + (parseFloat(i.NETWR) || 0), 0);
    const credits = this.filteredItems.filter(i => i.FKART === 'Cred' || i.FKART?.includes('G2'));
    const debits = this.filteredItems.filter(i => i.FKART === 'Debi' || i.FKART?.includes('L2'));
    this.metrics.credits = credits.length;
    this.metrics.debits = debits.length;
    this.metrics.creditValue = credits.reduce((s, i) => s + (parseFloat(i.NETWR) || 0), 0);
    this.metrics.debitValue = debits.reduce((s, i) => s + (parseFloat(i.NETWR) || 0), 0);
  }

  isCreditMemo(item: any): boolean {
    return item.FKART === 'Cred' || item.FKART?.includes('G2');
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

  /** Parse SAP dates: YYYY-MM-DD or YYYYMMDD */
  parseDate(raw: string): Date | null {
    if (!raw || raw === '00000000' || raw === '0000-00-00') return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      const d = new Date(raw.substring(0, 10)); return isNaN(d.getTime()) ? null : d;
    }
    if (/^\d{8}$/.test(raw)) {
      const d = new Date(`${raw.substring(0,4)}-${raw.substring(4,6)}-${raw.substring(6,8)}`);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  applyFilters() {
    const start = this.startDate ? new Date(this.startDate) : null;
    const end   = this.endDate   ? new Date(this.endDate)   : null;
    if (end) end.setHours(23, 59, 59, 999);

    this.filteredItems = this.items.filter(item => {
      const q = this.searchQuery.toLowerCase();
      const matchSearch =
        (item.VBELN || '').toLowerCase().includes(q) ||
        (item.FKART || '').toLowerCase().includes(q); // Adjustment Type

      let matchDate = true;
      const d = this.parseDate(item.FKDAT); // Changed from ERDAT
      if (d) {
        if (start && d < start) matchDate = false;
        if (end   && d > end)   matchDate = false;
      } else if (start || end) { matchDate = false; }
      return matchSearch && matchDate;
    });

    this.calculateMetrics();
    this.buildCharts();
  }
}